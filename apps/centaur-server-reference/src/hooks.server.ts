// spec: global-invariants/no-shared-secrets
// Report whether the environment names the runtimes this server talks to.
//
// It warns; it does not refuse to start. Nothing in this app reaches a runtime
// yet, and a dev server that 500s over a variable no code reads would make the
// local setup worse rather than better. When a request path does need Convex or
// SpacetimeDB, that path is where it should fail — with the same names in hand.
//
// Runs when the server hook module is first loaded: at process start under
// adapter-node, and on the first request under `vite dev`, which loads hooks
// lazily.
//
// The project ships no `.env.example` on purpose (CLAUDE.md → "Secrets and
// third-party resources"), so `packages/convex-host/src/env.ts` is the contract:
// it names every missing variable at once and never prints a value.
import { CONVEX_CLIENT_ENV, describeMissing, missingEnv } from "@cyphid/snek-convex-host";

// Convex only, and only the *client* half of it. A Centaur Server talks to the
// platform as a client; it does not drive the Convex CLI, and it has no
// management relationship with the SpacetimeDB host. `STDB_MANAGEMENT_BASE_URL`
// is the address Convex provisions, warms, and tears instances down at — a
// Server is handed a per-game instance address at run time and connects with
// per-team credentials, so naming that variable here would state the wrong
// runtime boundary and warn in deployments that are in fact correct.
const missing = missingEnv([...CONVEX_CLIENT_ENV]);
if (missing.length > 0) {
  console.warn(describeMissing(missing));
}
