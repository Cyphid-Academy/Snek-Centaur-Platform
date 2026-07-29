// spec: team-server-management/server-healthcheck
// GET /.well-known/snek-healthcheck — liveness probe stub.
//
// The path is fixed platform-wide and is one of the three endpoints in the
// enumerated fork compatibility surface, so it is a spec'd value rather than
// a mechanism detail: changing it is a deliberate breaking change to every
// fork. Do not move it, and do not add a root-path alias — the platform
// reserves nothing outside the `/.well-known/snek-` prefix precisely so a
// fork keeps `/healthcheck` and the rest of its own path space.
// spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
//
// Returns 200 OK with a JSON body indicating the server is up.
// The real implementation may add checks that inform the status (e.g. Convex
// connectivity) but MUST NOT widen the body with team-scoped state such as a
// hosted-team or active-game count: the endpoint answers unauthenticated
// callers, so that is a violation of the contract, not an enrichment of it.
// spec: centaur-server-runtime/healthcheck-endpoint#unauthenticated-and-minimal

import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = () => {
  return new Response(JSON.stringify({ status: "ok", version: "0.0.0" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
