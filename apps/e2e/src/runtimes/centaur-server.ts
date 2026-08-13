import { WELL_KNOWN_PATHS } from "@cyphid/snek-centaur-server-lib";
// spec: global-invariants/runtime-ownership
// A Snek Centaur Server, as a team actually runs one.
//
// The dev server, not a built bundle: what a test should catch is the reference
// implementation misbehaving, and running it the way a developer runs it keeps
// the two the same thing. `exec vite` rather than the app's `dev` script,
// because that script's `predev` rebuilds packages the harness already built.
import { type Process, httpReady, startProcess } from "../process";

const APP_PACKAGE = "@cyphid/centaur-server-reference";

/** Vite has to transform the app on the first request; a cold start is slow. */
const READY_TIMEOUT_MS = 180_000;

export interface CentaurServer extends Process {
  readonly url: string;
  /** Where this server publishes the public half of its signing key. */
  readonly keysUrl: string;
  readonly healthcheckUrl: string;
}

export interface CentaurServerOptions {
  readonly port: number;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

export async function startCentaurServer(options: CentaurServerOptions): Promise<CentaurServer> {
  const url = `http://127.0.0.1:${options.port}`;
  const server = await startProcess({
    name: "centaur-server",
    command: "pnpm",
    args: [
      "--filter",
      APP_PACKAGE,
      "exec",
      "vite",
      "dev",
      "--port",
      String(options.port),
      // Without this Vite silently moves to the next free port when the one it
      // was given is taken, and the harness would then be talking to something
      // it did not start.
      "--strictPort",
    ],
    env: options.env,
    ready: httpReady(url),
    readyTimeoutMs: READY_TIMEOUT_MS,
  });

  return {
    ...server,
    url,
    // From the constant the library publishes, not typed out again: these are
    // the addresses the platform genuinely calls, so a harness spelling its own
    // copy could go on passing against a surface that had moved.
    // spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
    keysUrl: `${url}${WELL_KNOWN_PATHS.serverKeys}`,
    healthcheckUrl: `${url}${WELL_KNOWN_PATHS.healthcheck}`,
  };
}
