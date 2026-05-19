// spec: 03-REQ-050, 08-REQ-020
// Game invitation endpoint. Convex POSTs here at game start with per-team
// game credentials. The server must respond within the configured timeout.
// Implementation is deferred — this stub always refuses (safe default).

import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request }) => {
  const _body = await request.json().catch(() => null);

  // TODO: implement invitation acceptance logic using centaur-server-lib
  // spec: 03-REQ-050
  return new Response(JSON.stringify({ accepted: false, reason: "not implemented" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: RequestHandler = async () => {
  return new Response(
    JSON.stringify({
      status: "ok",
      version: "0.0.0",
      activeTeamCount: 0,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
};
