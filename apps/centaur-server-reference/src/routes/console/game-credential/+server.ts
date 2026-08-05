import {
  beginGameCustody,
  endGameCustody,
  gameCustodyStatus,
  serverIdentity,
} from "$lib/server/serverPrincipal";
// spec: identity-and-authorization/game-credential-scope,
//       identity-and-authorization/token-lifetime-and-refresh
// The console's custody surface for a per-team game credential.
//
// POST begins custody for one team in one game — the first acquisition runs in
// the request so a refusal ("does not operate team …", "game … is finished")
// is legible — and the handle then renews proactively, ahead of expiry, until
// replaced or stopped. GET reports what is held: the scope, the decoded
// claims, and the renewal decision for this moment. DELETE stops custody.
// The credential itself never reaches the page.
// spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async () => json({ custody: gameCustodyStatus() });

export const POST: RequestHandler = async ({ url, request }) => {
  const { teamId, gameId } = (await request.json()) as { teamId: string; gameId: string };
  try {
    await beginGameCustody(await serverIdentity(url.origin), { teamId, gameId });
    return json({ ok: true, custody: gameCustodyStatus() });
  } catch (refused) {
    return json({ ok: false, refused: refused instanceof Error ? refused.message : "refused" });
  }
};

export const DELETE: RequestHandler = async () => {
  endGameCustody();
  return json({ ok: true });
};
