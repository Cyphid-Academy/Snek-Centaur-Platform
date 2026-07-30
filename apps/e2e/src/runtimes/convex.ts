// spec: e2e/hermetic-substrate, global-invariants/single-convex-deployment
// A real Convex deployment, on ports and storage this run owns.
//
// The obvious route is `convex dev` in anonymous mode, and it is the one
// `pnpm dev:convex:local` takes. It is wrong here for two reasons, both about
// isolation rather than convenience: it chooses its own ports (3210/3211, the
// ones a developer's own deployment is already on), and it keeps its data
// across invocations, so a run would inherit whatever the previous run wrote.
//
// So the harness drives the backend binary directly — the self-hosted path,
// which takes explicit ports, an explicit SQLite file, and an explicit file
// storage directory, all of them per-run and discarded afterwards. Functions
// are then pushed with the ordinary CLI against that deployment, so what runs
// in a test is what `convex dev` would have deployed and not a second
// mechanism.
// spec: e2e/hermetic-substrate#teardown-does-not-leak-into-the-next-run
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type Service, httpReady, repoRoot, startService } from "../service";

const execFileAsync = promisify(execFile);

/** The workspace package holding the deployment's functions. */
const HOST_PACKAGE = "@cyphid/snek-convex-host";
const HOST_DIR = "packages/convex-host";

/** Pushing installs three components and bundles every function. */
const PUSH_TIMEOUT_MS = 300_000;

export interface ConvexDeployment extends Service {
  /** Where a client connects. */
  readonly url: string;
  /** The HTTP-actions origin: sign-in routes and published verification material. */
  readonly siteUrl: string;
  /** Credential for administrative calls against this deployment. */
  readonly adminKey: string;
  /** Set a deployment environment variable, as `convex env set` would. */
  setEnv(name: string, value: string): Promise<void>;
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

  const service = await startService({
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
      // directory it was started from — which, run from the repository, is an
      // untracked directory appearing in the working tree after every run.
      "--local-storage",
      join(options.dataDir, "storage"),
      // Nothing about a test run should be reported to anyone.
      // spec: e2e/hermetic-substrate#no-external-service-reached
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
    await pushFunctions(options.dataDir, env);
  } catch (error) {
    await service.stop();
    throw error;
  }

  return {
    ...service,
    url,
    siteUrl,
    adminKey,
    async setEnv(name: string, value: string): Promise<void> {
      await runConvexCli(["env", "set", name, value], options.dataDir, env);
    },
  };
}

/**
 * Push the host's functions to the running deployment.
 *
 * `--typecheck disable` because the workspace typechecks the Convex regime in
 * its own gate and doing it again here only adds seconds; `--codegen disable`
 * because `convex/_generated` is committed, so regenerating it during a test
 * run would dirty the working tree.
 */
async function pushFunctions(dataDir: string, env: Record<string, string>): Promise<void> {
  await runConvexCli(
    ["dev", "--once", "--typecheck", "disable", "--codegen", "disable"],
    dataDir,
    env,
  );
}

async function runConvexCli(
  args: ReadonlyArray<string>,
  dataDir: string,
  env: Record<string, string>,
): Promise<void> {
  // The CLI reads the deployment from an env file rather than from the
  // environment, so the run's target is written next to the run's data.
  const envFile = join(dataDir, "convex.env");
  writeFileSync(
    envFile,
    Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n"),
  );
  // Whatever `--env-file` says to *read*, the CLI writes the deployment it
  // targeted back to the package's own `.env.local` — and it does so from more
  // subcommands than the obvious one, which is how a leak survived the first
  // version of this: the snapshot wrapped the push and `env set` walked past
  // it. That file is a developer's own configuration, so every invocation is
  // wrapped, and one that found no file leaves none behind.
  // spec: e2e/hermetic-substrate#teardown-does-not-leak-into-the-next-run
  const envLocal = join(repoRoot(), HOST_DIR, ".env.local");
  const before = existsSync(envLocal) ? readFileSync(envLocal, "utf8") : undefined;
  try {
    await execFileAsync(
      "pnpm",
      ["--filter", HOST_PACKAGE, "exec", "convex", ...args, "--env-file", envFile],
      { cwd: repoRoot(), timeout: PUSH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    );
  } finally {
    if (before === undefined) rmSync(envLocal, { force: true });
    else writeFileSync(envLocal, before);
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
 * The backend executable, from the cache the Convex CLI downloads it into.
 *
 * Deliberately not downloaded here. It is a large binary and the CLI already
 * knows how to fetch the version it expects, so the harness asks for it to have
 * been fetched rather than growing a second downloader that could disagree
 * about the version. The session hook does not fetch it either, for the reason
 * recorded there: every session would pay for it whether or not it runs this.
 */
async function findBackendBinary(): Promise<string> {
  const cache = join(homedir(), ".cache", "convex", "binaries");
  const entries = existsSync(cache) ? await readdir(cache) : [];
  // Newest last: the directory names carry the build date, so a lexical sort
  // puts the most recently released build at the end.
  for (const entry of [...entries].sort().reverse()) {
    const candidate = join(cache, entry, "convex-local-backend");
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    [
      "The Convex local backend is not present.",
      "",
      "It is downloaded on demand by the Convex CLI, not by this harness and not",
      "by the session hook. Run `pnpm dev:convex:local` once (no account needed)",
      "and stop it again; the binary is then cached for every later run.",
    ].join("\n"),
  );
}
