// The snek-platform component's schema.
//
// One table so far: `games`, created here in its MINIMAL form — the game's
// identity plus the configuration the game-configuration capability owns.
// The capabilities that own the rest of a game's life (lifecycle status,
// launch orchestration, successor creation) extend THIS record rather than
// introducing a second one; the other platform tables (users, centaur_teams,
// rooms, replays, webhooks, ...) arrive with their own stories.
// spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
import { defineSchema, defineTable } from "convex/server";
import { gameFields } from "../src/validators.js";

export default defineSchema({
  games: defineTable(gameFields)
    // Serves the one-open-game-per-room exclusivity check inside createGame's
    // transaction: at most one game per room key (null = the dev room) in
    // phase "configuring" at any time.
    // spec: game-configuration/config-lives-on-the-game#one-game-configured-at-a-time
    .index("by_room_and_phase", ["roomId", "phase"]),
});
