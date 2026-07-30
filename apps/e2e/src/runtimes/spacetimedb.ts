// spec: e2e/hermetic-substrate, global-invariants/spacetimedb-instance-isolation
// A real SpacetimeDB host, and the game module published into it.
//
// `spacetime start` runs a standalone host natively — no container, no
// registration, no account — which is what makes the runtime side of this
// harness cheap enough to be unremarkable.
//
// Two details are load-bearing and were established by running them rather than
// by reading:
//
//   * `--server` accepts a URL, not only one of the CLI's configured nicknames.
//     Without that the harness would be pinned to port 3000, because the `local`
//     nickname is hard-wired to it.
//   * The data directory is per-run and thrown away. An instance is one game
//     (global-invariants/spacetimedb-instance-isolation), so there is nothing a
//     later run could legitimately want from an earlier one's databases.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Service, httpReady, repoRoot, startService } from "../service";

const execFileAsync = promisify(execFile);

/** The module project `spacetime build` bundles — the path is the project, not the package root. */
const MODULE_PATH = "packages/stdb/spacetimedb";

/** Publishing compiles the module from source, which dominates the wait. */
const PUBLISH_TIMEOUT_MS = 300_000;

export interface SpacetimeHost extends Service {
  /** Base URL of the running host. */
  readonly url: string;
  /**
   * Build and publish the game module as `name`, and answer once the database
   * exists. A fresh name per game is the isolation model, not an optimisation.
   */
  publish(name: string): Promise<void>;
}

export interface SpacetimeOptions {
  readonly port: number;
  /** Per-run directory for the host's data. */
  readonly dataDir: string;
}

export async function startSpacetime(options: SpacetimeOptions): Promise<SpacetimeHost> {
  const url = `http://127.0.0.1:${options.port}`;
  const service = await startService({
    name: "spacetimedb",
    command: "spacetime",
    args: [
      "start",
      "--data-dir",
      options.dataDir,
      "--listen-addr",
      `127.0.0.1:${options.port}`,
      "--non-interactive",
    ],
    ready: httpReady(`${url}/v1/ping`),
  });

  return {
    ...service,
    url,
    async publish(name: string): Promise<void> {
      // The CLI reports a module the host refused as a 500 with the isolate's
      // own error in the body, and exits non-zero — so the failure arrives
      // here as a rejection carrying the text worth reading. That is the
      // failure this whole harness exists to make visible: an artifact that
      // builds and then does not load.
      // spec: e2e/hermetic-substrate#real-runtimes-not-doubles
      await execFileAsync(
        "spacetime",
        ["publish", "--server", url, "--yes", "-p", MODULE_PATH, name],
        { cwd: repoRoot(), timeout: PUBLISH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      );
    },
  };
}
