// spec: global-invariants/spacetimedb-instance-isolation
// A real SpacetimeDB host, and the game module published into it.
//
// Established by running it rather than by reading: `--server` accepts a URL,
// not only one of the CLI's configured nicknames. Without that the harness
// would be pinned to port 3000, because the `local` nickname is hard-wired to
// it.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type Process, httpReady, repoRoot, startProcess } from "../process";

const execFileAsync = promisify(execFile);

/** The module project `spacetime build` bundles — the path is the project, not the package root. */
const MODULE_PATH = "packages/stdb/spacetimedb";

/** Publishing compiles the module from source, which dominates the wait. */
const PUBLISH_TIMEOUT_MS = 300_000;

export interface SpacetimeHost extends Process {
  /** Base URL of the running host. */
  readonly url: string;
  /**
   * Build and publish the game module as `name`, and answer once the database
   * exists.
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
  const host = await startProcess({
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
    ...host,
    url,
    async publish(name: string): Promise<void> {
      // The CLI reports a module the host refused as a 500 with the isolate's
      // own error in the body, and exits non-zero — so the failure arrives
      // here as a rejection carrying the text worth reading.
      await execFileAsync(
        "spacetime",
        ["publish", "--server", url, "--yes", "-p", MODULE_PATH, name],
        { cwd: repoRoot(), timeout: PUBLISH_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      );
    },
  };
}
