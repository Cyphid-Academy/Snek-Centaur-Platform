// spec: global-invariants/no-shared-secrets
// Report whether the environment names the runtimes this server talks to.
//
// It warns; it does not refuse to start. Nothing here reaches a runtime yet, and
// a dev server that 500s over a variable no code reads makes local setup worse.
//
// Runs when the server hook module is first loaded: at process start under
// adapter-node, and on the first request under `vite dev`, which loads hooks
// lazily.
import { CONVEX_CLIENT_ENV, describeMissing, missingEnv } from "@cyphid/snek-convex-host";

// The *client* half of Convex only: a Centaur Server talks to the platform as a
// client, drives no CLI, and has no management relationship with the STDB host.
const missing = missingEnv([...CONVEX_CLIENT_ENV]);
if (missing.length > 0) {
  console.warn(describeMissing(missing));
}
