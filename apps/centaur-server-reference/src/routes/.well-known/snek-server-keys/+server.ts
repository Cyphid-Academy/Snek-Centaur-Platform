// spec: centaur-server-runtime/server-key-publication
// GET /.well-known/snek-server-keys — published verification material for
// this server's signing key. Read by the platform when a captain names this
// domain as a team's home, and again whenever it meets a key identifier it
// does not know — which is what makes key rotation a local act needing no
// exchange with the platform.
//
// The body is a JWK Set, but the path deliberately is NOT `jwks.json`: that
// suffix is unregistered, it promises an OIDC discovery surface a Centaur
// Server does not publish, and the platform's own OIDC surface already serves
// a document at that relative path with entirely different trust semantics.
// The path is fixed platform-wide and sits in the enumerated fork
// compatibility surface — a spec'd value, changed only as a deliberate
// breaking change to every fork.
// spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
//
// The keys are `serverKeys()`'s: generated and persisted on first boot with no
// operator action, public half only.
// spec: centaur-server-runtime/server-key-publication#first-boot-needs-no-operator

import { serverKeys } from "$lib/server/serverKeys";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async () => {
  const { publishedKeySet } = await serverKeys();
  return new Response(JSON.stringify(publishedKeySet), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
