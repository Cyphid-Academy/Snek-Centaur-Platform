// spec: e2e/hermetic-substrate
// Starting a real process, waiting for it to answer, and stopping it again.
//
// Every runtime in the substrate is a child process this harness owns, and the
// three hard parts are the same for all of them: knowing when a process is
// *ready* rather than merely spawned, surfacing the log when it never becomes
// ready, and stopping it however the run ends.
//
// The third is the one that decides whether a suite stays trustworthy. A run
// that leaves a backend holding a port makes the next run fail for a reason
// that has nothing to do with the code, and the usual shape of that bug is a
// teardown that only runs on the happy path. So teardown here is a process-wide
// registry drained by an exit hook, not a `finally` block someone has to
// remember to write.
// spec: e2e/hermetic-substrate#teardown-does-not-leak-into-the-next-run
import { type ChildProcess, spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

/** A running child process the harness is responsible for. */
export interface Service {
  readonly name: string;
  /** Everything the process has written to stdout and stderr so far. */
  log(): string;
  /** Terminate it. Safe to call more than once. */
  stop(): Promise<void>;
}

export interface ServiceSpec {
  /** Shown in errors and in the run log. */
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
 * Every service this process has started and not yet stopped.
 *
 * Module-level rather than per-substrate on purpose: the exit hook below has to
 * be able to reach a service whose owner never got as far as returning a handle
 * — a `startSubstrate` that threw halfway through has already started real
 * processes, and those are exactly the ones that would otherwise be orphaned.
 */
const running = new Set<Service>();

let exitHookInstalled = false;

function installExitHook(): void {
  if (exitHookInstalled) return;
  exitHookInstalled = true;

  // `exit` cannot await, so it kills synchronously; the signal handlers get to
  // do it politely first. Both paths are needed: a vitest run that finishes
  // normally leaves through `exit`, and one the developer interrupts leaves
  // through SIGINT.
  process.on("exit", () => {
    for (const service of running) void service.stop();
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void stopAll().finally(() => process.exit(130));
    });
  }
}

/** Stop every service still running, in reverse order of starting. */
export async function stopAll(): Promise<void> {
  const services = [...running].reverse();
  await Promise.all(services.map((service) => service.stop()));
}

/**
 * Spawn a process and resolve once it answers.
 *
 * Rejects with the process's own log attached, because the failure that
 * actually happens here is not "timed out" — it is a runtime that printed
 * exactly why it refused to start and then sat there, and a bare timeout throws
 * that away.
 */
export async function startService(spec: ServiceSpec): Promise<Service> {
  installExitHook();

  const child: ChildProcess = spawn(spec.command, [...spec.args], {
    cwd: spec.cwd ?? repoRoot(),
    env: { ...process.env, ...spec.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let log = "";
  child.stdout?.on("data", (chunk) => {
    log += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    log += chunk;
  });

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
  const service: Service = {
    name: spec.name,
    log: () => log,
    stop: () => {
      stopping ??= terminate(child);
      running.delete(service);
      return stopping;
    },
  };
  running.add(service);

  const deadline = Date.now() + (spec.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (exited) {
      await service.stop();
      if (failure !== undefined) {
        throw new Error(`${spec.name} could not be started: ${failure.message}`, {
          cause: failure,
        });
      }
      throw new Error(`${spec.name} exited before it was ready:\n${log}`);
    }
    const ready = await spec.ready().catch(() => false);
    if (ready) return service;
    await sleep(POLL_INTERVAL_MS);
  }

  await service.stop();
  throw new Error(`${spec.name} was not ready within the timeout:\n${log}`);
}

async function terminate(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timedOut = Symbol("timed out");
  const outcome = await Promise.race([exited, sleep(TERM_GRACE_MS, timedOut)]);
  if (outcome === timedOut) child.kill("SIGKILL");
}

/**
 * An HTTP readiness probe.
 *
 * Anything other than an accepted status — including a refused connection while
 * the service is still binding — is "not yet", never a failure: `startService`
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
  return async () => {
    const response = await fetch(url);
    return accept(response.status);
  };
}

function isOk(status: number): boolean {
  return status >= 200 && status < 400;
}

let cachedRoot: string | undefined;

/** The repository root, found by walking up from this file. */
export function repoRoot(): string {
  if (cachedRoot !== undefined) return cachedRoot;
  // apps/e2e/src/service.ts -> apps/e2e/src -> apps/e2e -> apps -> <root>
  const here = new URL(".", import.meta.url).pathname;
  cachedRoot = new URL("../../../", `file://${here}`).pathname.replace(/\/$/, "");
  return cachedRoot;
}
