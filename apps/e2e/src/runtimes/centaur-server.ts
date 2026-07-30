// spec: e2e/hermetic-substrate, global-invariants/runtime-ownership
// A Snek Centaur Server, as a team actually runs one.
//
// Started through the app's own Vite dev server rather than a built bundle:
// what a test should catch is the reference implementation misbehaving, and
// running it the way a developer runs it is what keeps the two the same thing.
// `exec vite` rather than the app's `dev` script because the script's `predev`
// rebuilds the workspace packages, which the harness has already done.
//
// Two of them, by default. A team's server is per-team
// (global-invariants/runtime-ownership), so anything about two teams — an
// invitation answered by one and not the other, two teams staging into one
// game — is invisible to a substrate that can only run one.
import { type Service, httpReady, startService } from "../service";

/** The reference implementation's workspace package. */
const APP_PACKAGE = "@cyphid/centaur-server-reference";

/** Vite has to transform the app on the first request; a cold start is slow. */
const READY_TIMEOUT_MS = 180_000;

export interface CentaurServer extends Service {
  /** The server's own origin — what a captain would name as the team's home. */
  readonly url: string;
  /** Where this server publishes the public half of its signing key. */
  readonly keysUrl: string;
  /** The liveness endpoint the platform polls. */
  readonly healthcheckUrl: string;
}

export interface CentaurServerOptions {
  readonly port: number;
  /** Distinguishes the two servers in logs and errors. */
  readonly label: string;
  readonly env?: Readonly<Record<string, string>> | undefined;
}

export async function startCentaurServer(options: CentaurServerOptions): Promise<CentaurServer> {
  const url = `http://127.0.0.1:${options.port}`;
  const service = await startService({
    name: `centaur-server:${options.label}`,
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
    ...service,
    url,
    // The three well-known paths are the enumerated fork compatibility surface,
    // fixed platform-wide. They are spelled once here so a test names the
    // endpoint rather than the string.
    // spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
    keysUrl: `${url}/.well-known/snek-server-keys`,
    healthcheckUrl: `${url}/.well-known/snek-healthcheck`,
  };
}
