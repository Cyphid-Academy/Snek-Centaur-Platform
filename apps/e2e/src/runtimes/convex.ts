// spec: global-invariants/single-convex-deployment
// A real Convex deployment, on ports and storage this run owns: the backend
// binary driven directly as a self-hosted deployment, with functions pushed
// onto it by the ordinary CLI.
//
// Not `convex dev` in anonymous mode: that picks its own ports and keeps its
// data between invocations, so a run would inherit the previous run's state.
// The self-hosted path takes explicit ports, an explicit SQLite file and an
// explicit storage directory, all per-run and discarded. Functions are still
// pushed with the ordinary CLI, so a test exercises what `convex dev` would
// have deployed.
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Process, httpReady, repoRoot, startProcess } from "../process";

const execFileAsync = promisify(execFile);

/** The workspace package holding the deployment's functions. */
const HOST_PACKAGE = "@cyphid/snek-convex-host";
const HOST_DIR = "packages/convex-host";

/** Pushing installs the components and bundles every function. */
const PUSH_TIMEOUT_MS = 300_000;

export interface ConvexDeployment extends Process {
  /** Where a client connects. */
  readonly url: string;
  /** The HTTP-actions origin: sign-in routes and published verification material. */
  readonly siteUrl: string;
  /** Credential for administrative calls against this deployment. */
  readonly adminKey: string;
  /** Set deployment environment variables, as `convex env set` would. */
  setEnv(values: Readonly<Record<string, string>>): Promise<void>;
  /**
   * Invoke a deployment function by name, as `convex run` would, and answer
   * with what it returned. Admin-authenticated, so it reaches internal
   * functions too — for arranging the world, never for asserting about it.
   */
  run(functionName: string, args?: unknown): Promise<unknown>;
}

export interface ConvexOptions {
  readonly port: number;
  readonly siteProxyPort: number;
  /** Per-run directory for the SQLite file and file storage. */
  readonly dataDir: string;
}

export async function startConvex(options: ConvexOptions): Promise<ConvexDeployment> {
  const binary = await findBackendBinary();
  const instanceName = "snek-e2e";
  const instanceSecret = randomBytes(32).toString("hex");
  const adminKey = await mintAdminKey(binary, instanceName, instanceSecret);

  const url = `http://127.0.0.1:${options.port}`;
  const siteUrl = `http://127.0.0.1:${options.siteProxyPort}`;

  const backend = await startProcess({
    name: "convex",
    command: binary,
    args: [
      "--port",
      String(options.port),
      "--site-proxy-port",
      String(options.siteProxyPort),
      "--instance-name",
      instanceName,
      "--instance-secret",
      instanceSecret,
      "--convex-origin",
      url,
      "--convex-site",
      siteUrl,
      // Without this the backend creates `convex_local_storage/` in whatever
      // directory it was started from.
      "--local-storage",
      join(options.dataDir, "storage"),
      // Nothing about a test run should be reported to anyone.
      "--disable-beacon",
      join(options.dataDir, "convex.sqlite3"),
    ],
    cwd: options.dataDir,
    ready: httpReady(`${url}/version`),
  });

  const env = {
    CONVEX_SELF_HOSTED_URL: url,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  };

  try {
    // `--typecheck disable` because the workspace typechecks the Convex regime
    // in its own gate; `--codegen disable` because `convex/_generated` is
    // committed, so regenerating it during a run would dirty the working tree.
    await runConvexCli(
      ["dev", "--once", "--typecheck", "disable", "--codegen", "disable"],
      options.dataDir,
      env,
    );
  } catch (error) {
    await backend.stop();
    throw error;
  }

  return {
    ...backend,
    url,
    siteUrl,
    adminKey,
    async setEnv(values: Readonly<Record<string, string>>): Promise<void> {
      // One invocation per variable is the granularity the CLI offers.
      // Sequential rather than concurrent: each takes the same `.env.local`
      // snapshot below, and two at once would restore each other's.
      for (const [name, value] of Object.entries(values)) {
        await runConvexCli(["env", "set", name, value], options.dataDir, env);
      }
    },
    async run(functionName: string, args?: unknown): Promise<unknown> {
      const stdout = await runConvexCli(
        ["run", functionName, JSON.stringify(args ?? {})],
        options.dataDir,
        env,
      );
      // A function returning nothing prints nothing, and `JSON.parse("")`
      // throws.
      const printed = stdout.trim();
      return printed === "" ? undefined : JSON.parse(printed);
    },
  };
}

/**
 * The developer's own `packages/convex-host/.env.local`, put back.
 *
 * Whatever `--env-file` says to *read*, the CLI writes the deployment it
 * targeted back to the package's own `.env.local`, and from more subcommands
 * than the push alone. That file is a developer's own configuration, so every
 * invocation snapshots it, and one that found no file leaves none behind.
 *
 * The `exit` hook is why this is not a bare `finally`: an interrupt inside a
 * CLI invocation takes the process down before the `finally` runs, leaving the
 * developer's `.env.local` overwritten with this run's. It is deliberately the
 * only such hook in the harness — everything else the harness starts is a
 * fixture, and Playwright tears fixtures down on an interrupt. This is not a
 * fixture; it is a file belonging to someone else, briefly replaced.
 */
function preserveEnvLocal(): () => void {
  const envLocal = join(repoRoot(), HOST_DIR, ".env.local");
  const before = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : undefined;
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    process.off("exit", restore);
    if (before === undefined) rmSync(envLocal, { force: true });
    else writeFileSync(envLocal, before);
  };
  process.on("exit", restore);
  return restore;
}

async function runConvexCli(
  args: ReadonlyArray<string>,
  dataDir: string,
  env: Record<string, string>,
): Promise<string> {
  // The CLI reads the deployment from an env file rather than from the
  // environment, so the run's target is written next to the run's data.
  const envFile = join(dataDir, "convex.env");
  writeFileSync(
    envFile,
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  const restore = preserveEnvLocal();
  try {
    const { stdout } = await execFileAsync(
      "pnpm",
      ["--filter", HOST_PACKAGE, "exec", "convex", ...args, "--env-file", envFile],
      { cwd: repoRoot(), timeout: PUSH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  } finally {
    restore();
  }
}

async function mintAdminKey(
  binary: string,
  instanceName: string,
  instanceSecret: string,
): Promise<string> {
  const { stdout } = await execFileAsync(binary, [
    "keygen",
    "admin-key",
    "--instance-name",
    instanceName,
    "--instance-secret",
    instanceSecret,
  ]);
  return stdout.trim();
}

/**
 * The backend build every run of this harness uses.
 *
 * Pinned so a run's runtime artifact does not depend on what else the machine
 * has cached — see apps/e2e/AGENTS.md. Bump it deliberately, together with the
 * `convex` dependency, and fetch it with the command in the error below.
 */
const BACKEND_VERSION = "precompiled-2026-07-21-82d5e9f";

/** Overrides the pin, for bisecting a backend regression. Not for ordinary runs. */
const BACKEND_VERSION_ENV = "SNEK_E2E_CONVEX_BACKEND_VERSION";

/** The release asset holding the backend, for this platform and architecture. */
function backendAsset(): string {
  const target =
    process.platform === "darwin"
      ? process.arch === "arm64"
        ? "aarch64-apple-darwin"
        : "x86_64-apple-darwin"
      : process.platform === "win32"
        ? "x86_64-pc-windows-msvc"
        : process.arch === "arm64"
          ? "aarch64-unknown-linux-gnu"
          : "x86_64-unknown-linux-gnu";
  return `convex-local-backend-${target}.zip`;
}

/**
 * The pinned backend executable, from the cache the Convex CLI downloads into.
 * Deliberately not downloaded here — a downloader in the harness is a second
 * thing that can disagree about what it fetched.
 *
 * The recipe below is the whole of what the CLI would have done — the cache is
 * a plain directory of release artifacts. Why it is `curl` and not a CLI
 * invocation: apps/e2e/AGENTS.md.
 */
async function findBackendBinary(): Promise<string> {
  const version = process.env[BACKEND_VERSION_ENV] || BACKEND_VERSION;
  const cache = join(homedir(), ".cache", "convex", "binaries");
  const candidate = join(cache, version, "convex-local-backend");
  if (existsSync(candidate)) return candidate;

  const present = existsSync(cache) ? await readdir(cache) : [];
  throw new Error(
    [
      `The Convex local backend ${version} is not present.`,
      "",
      "Fetch exactly that build once:",
      "",
      `  D=~/.cache/convex/binaries/${version}`,
      "  mkdir -p $D && cd $D && \\",
      `    curl -fsSL -o b.zip https://github.com/get-convex/convex-backend/releases/download/${version}/${backendAsset()} && \\`,
      "    unzip -oq b.zip && rm b.zip && chmod +x convex-local-backend",
      "",
      present.length > 0
        ? `Cached instead: ${present.join(", ")}. A different build is not a substitute — the pin is in apps/e2e/src/runtimes/convex.ts, and the point of pinning is that every run exercises the same artifact.`
        : "Nothing is cached yet.",
    ].join("\n"),
  );
}
