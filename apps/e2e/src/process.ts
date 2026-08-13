// spec: global-invariants/runtime-ownership
// Starting a real process, waiting for it to answer, and stopping it again.
//
// There is no teardown registry here, and that is the point of moving to
// Playwright Test: a worker fixture's teardown runs after the tests that used
// it, in reverse order of setup, on a pass, on a failure, and on an interrupt
// alike. What is left is the part Playwright does not do — spawning, capturing
// what the process said, and deciding it is ready.
import { type ChildProcess, spawn } from "node:child_process";
import { type Server, createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";

/** A running child process a fixture is responsible for. */
export interface Process {
  /** Shown in errors and in the run log. */
  readonly name: string;
  /** Everything the process has written to stdout and stderr so far. */
  log(): string;
  /** Terminate it. Safe to call more than once. */
  stop(): Promise<void>;
}

export interface ProcessSpec {
  readonly name: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  /** Defaults to the repository root. */
  readonly cwd?: string | undefined;
  /** Added to (not replacing) the harness's own environment. */
  readonly env?: Readonly<Record<string, string>> | undefined;
  /**
   * Answers true once the process is ready to be used. Polled; it is expected
   * to throw or return false while the process is still starting.
   */
  readonly ready: () => Promise<boolean>;
  /** How long to wait for `ready` before giving up. */
  readonly readyTimeoutMs?: number | undefined;
}

const DEFAULT_READY_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 250;
/** How long a process gets to exit on SIGTERM before it is killed outright. */
const TERM_GRACE_MS = 3_000;

/**
 * Spawn a process and resolve once it answers.
 *
 * A start that does not reach readiness stops what it spawned before it
 * throws, so a fixture that never got a handle has still left nothing running.
 *
 * The rejection carries the process's own log, because the failure that
 * actually happens here is not "timed out" — it is a runtime that printed
 * exactly why it refused to start and then sat there, and a bare timeout throws
 * that away.
 */
export async function startProcess(spec: ProcessSpec): Promise<Process> {
  const child: ChildProcess = spawn(spec.command, [...spec.args], {
    cwd: spec.cwd ?? repoRoot(),
    env: { ...process.env, ...spec.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  const capture = (chunk: Buffer) => {
    log += chunk;
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  // `error` and not only `exit`: a command that is not on PATH, or a working
  // directory that does not exist, never produces an `exit` at all. Watching
  // only for exit turns that into a wait for the full readiness timeout and
  // then a message about a timeout, which says nothing about the actual fault.
  let failure: Error | undefined;
  let exited = child.exitCode !== null;
  child.on("error", (error) => {
    failure = error;
    exited = true;
  });
  child.on("exit", () => {
    exited = true;
  });

  let stopping: Promise<void> | undefined;
  const process_: Process = {
    name: spec.name,
    log: () => log,
    stop: () => {
      stopping ??= terminate(child);
      return stopping;
    },
  };

  const deadline = Date.now() + (spec.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (exited) {
      await process_.stop();
      if (failure !== undefined) {
        throw new Error(`${spec.name} could not be started: ${failure.message}`, {
          cause: failure,
        });
      }
      throw new Error(`${spec.name} exited before it was ready:\n${log}`);
    }
    if (await spec.ready().catch(() => false)) return process_;
    await sleep(POLL_INTERVAL_MS);
  }

  await process_.stop();
  throw new Error(`${spec.name} was not ready within the timeout:\n${log}`);
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timedOut = Symbol("timed out");
  if ((await Promise.race([exited, sleep(TERM_GRACE_MS, timedOut)])) === timedOut) {
    child.kill("SIGKILL");
  }
}

/**
 * An HTTP readiness probe.
 *
 * Anything other than an accepted status — including a refused connection while
 * the service is still binding — is "not yet", never a failure: `startProcess`
 * decides that the process is unhealthy by watching the process, not by
 * interpreting one probe.
 *
 * Every address here is loopback, which matters in the cloud development
 * environment: outbound traffic goes through an HTTPS proxy, and `127.0.0.1` is
 * in its no-proxy set. A probe written against a hostname could be proxied and
 * would never arrive.
 */
export function httpReady(
  url: string,
  accept: (status: number) => boolean = isOk,
): () => Promise<boolean> {
  return async () => accept((await fetch(url)).status);
}

function isOk(status: number): boolean {
  return status >= 200 && status < 400;
}

/**
 * Reserve a port the OS says is free.
 *
 * None of the runtimes' documented defaults (3000, 3210/3211, 5000) is used:
 * those are where a developer's own `pnpm dev:*` processes are, and a run that
 * claimed them would either fail to start or succeed by writing to the
 * developer's deployment.
 *
 * The port is released before the child binds it, so the window is a race this
 * only narrows. The alternative — holding the socket and passing the descriptor
 * — is not something these runtimes accept.
 */
export async function freePort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

/**
 * Reserve two distinct free ports.
 *
 * Sequential rather than concurrent, and checked: two binds to `:0` at once can
 * be handed the same port, and a duplicate surfaces much later as one runtime
 * failing to bind.
 */
export async function freePortPair(): Promise<[number, number]> {
  const first = await freePort();
  let second = await freePort();
  while (second === first) second = await freePort();
  return [first, second];
}

/**
 * Bind to an ephemeral loopback port and answer with the port itself.
 *
 * Narrows `address()` rather than asserting it: the `string` case is a Unix
 * socket, which nothing here binds, but a cast would hide it if something did.
 */
function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("could not read the bound port back"));
        return;
      }
      resolve(address.port);
    });
  });
}

let cachedRoot: string | undefined;

/** The repository root, found by walking up from this file. */
export function repoRoot(): string {
  if (cachedRoot !== undefined) return cachedRoot;
  // apps/e2e/src/process.ts -> apps/e2e/src -> apps/e2e -> apps -> <root>
  const here = new URL(".", import.meta.url).pathname;
  cachedRoot = new URL("../../../", `file://${here}`).pathname.replace(/\/$/, "");
  return cachedRoot;
}
