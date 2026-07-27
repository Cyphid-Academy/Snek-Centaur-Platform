// spec: team-server-management/server-key-publication
// Published verification material for this server's signing key. Read by the
// platform when a captain names this domain as a team's home, and again
// whenever it meets a key identifier it does not know — which is what makes
// key rotation a local act needing no exchange with the platform.
// Implementation is deferred — this stub publishes an empty key set.

import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async () => {
  // TODO: publish the keys held by centaur-server-lib's key store, which
  // generates and persists one on first boot with no operator action.
  // spec: team-server-management/server-key-publication#first-boot-needs-no-operator
  return new Response(JSON.stringify({ keys: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
