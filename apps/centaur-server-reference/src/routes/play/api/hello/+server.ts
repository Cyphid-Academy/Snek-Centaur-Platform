// POST /play/api/hello — "I have signed in; give me a seat."
//
// The page sends the credential it just earned; this server verifies it against
// the platform's published material, seats that human on whichever team has
// fewer players, and answers with the world. Saying hello twice changes
// nothing: a human already seated keeps their team.
//
// Seating is demo scaffolding standing in for a captain adding a member —
// see `$lib/server/demo/seating.ts`.
import { verifyPlatformCredential } from "$lib/server/demo/identity";
import { demoStackPresent, readWorld, seat, teamOf } from "$lib/server/demo/seating";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ request }) => {
  if (!demoStackPresent()) {
    return json({ ok: false, refused: "no demo stack is running here" }, { status: 503 });
  }
  const { credential, name } = (await request.json()) as { credential?: string; name?: string };
  if (!credential) return json({ ok: false, refused: "no credential" }, { status: 400 });

  let userId: string;
  try {
    ({ userId } = await verifyPlatformCredential(credential));
  } catch (refused) {
    return json(
      { ok: false, refused: refused instanceof Error ? refused.message : "refused" },
      { status: 401 },
    );
  }

  // Already seated is the common case — a page says hello on every load — and
  // it costs nothing to answer from the world rather than re-running a seating
  // that would change nothing.
  const held = readWorld();
  if (teamOf(held, userId)) return json({ ok: true, userId, world: held });

  try {
    const world = await seat(userId, name);
    return json({ ok: true, userId, world });
  } catch (failed) {
    return json(
      { ok: false, refused: failed instanceof Error ? failed.message : "seating failed" },
      { status: 500 },
    );
  }
};
