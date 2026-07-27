// spec: team-server-management/server-healthcheck
// GET /healthcheck — liveness probe stub.
// Returns 200 OK with a JSON body indicating the server is up.
// The real implementation may add checks that inform the status (e.g. Convex
// connectivity) but MUST NOT widen the body with team-scoped state such as a
// hosted-team or active-game count: the endpoint answers unauthenticated
// callers, so that is a violation of the contract, not an enrichment of it.
// spec: team-server-management/server-healthcheck#unauthenticated-and-minimal

import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = () => {
  return new Response(JSON.stringify({ status: "ok", version: "0.0.0" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
