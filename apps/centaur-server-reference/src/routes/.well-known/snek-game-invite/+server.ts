// spec: team-server-management/game-invitations
// POST /.well-known/snek-game-invite — game-start invitation endpoint. The
// platform POSTs a bare notification here naming a game and a team, which
// wakes this server if it had scaled to zero.
//
// The path is fixed platform-wide and sits in the enumerated fork
// compatibility surface — a spec'd value, changed only as a deliberate
// breaking change to every fork.
// spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
//
// Nothing in the request carries authority, so nothing about it is verified:
// the answer comes from the whitelist, and everything the server can act on it
// obtains afterwards by authenticating outward with its own key.
// Implementation is deferred — this stub always declines (safe default).

import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request }) => {
  const _invitation = await request.json().catch(() => null);

  // TODO: answer from the server's whitelist, then start the hosting session,
  // which authenticates for the team and requests its access token.
  // spec: team-server-management/invitation-acceptance#accepting-then-authenticating
  return new Response(null, { status: 403 });
};
