// GET /play/api/world — the teams, the game, and who is seated where.
//
// Public because it is: team names, a game id and a list of players is what
// every scoreboard shows, and none of it authorises anything. The page polls
// it so a browser learns about players who arrived after it did.
import { demoStackPresent, readWorld } from "$lib/server/demo/seating";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async () =>
  json({ present: demoStackPresent(), world: readWorld() });
