// spec: 08-REQ-010
// GET /healthcheck — liveness probe stub.
// Returns 200 OK with a JSON body indicating the server is up.
// Real implementation will include Convex connectivity check, game count, etc.

import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = () => {
  return new Response(JSON.stringify({ status: "ok", version: "0.0.0" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
