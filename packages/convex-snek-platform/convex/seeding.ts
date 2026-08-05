// Dev/demo seeding for the two NEIGHBOURING tables, ahead of their owners.
//
// `games` and `centaur_teams` are schema without a production writer: the
// changes that own them (migrate-game-lifecycle, migrate-team-management) have
// not landed, so a live deployment has no way to hold a game for issuance to
// answer about — and every function downstream of one (`gameForIssuance`,
// `issueGameToken`, `issueGameCredential`) is unreachable end to end. These two
// mutations are the stand-in: thin validated writes, reachable only through the
// host's *internal* surface (`demo.ts`), which itself is reachable only with a
// deployment admin credential (`convex run`) — the same operator trust the
// issuer registry's writer already has. They carry no authorization logic and
// no lifecycle behaviour: a status is written, never transitioned; a roster is
// written whole, never edited. When the owning changes land their real writers,
// these are the first thing they delete.
//
// Idempotence is the caller's, by id: writing the id back writes the same
// record, and omitting it creates a new one. The tables have no natural key to
// upsert on — a game is identified by its `_id` and nothing else — so "the same
// demo world" is a fact the seeding caller records, not one this component
// could recover.
import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { gameStatus, participantSnapshot } from "./schema";

/**
 * Write one team record, returning its id. With `teamId`, replaces that
 * record; without, creates one.
 */
export const seedTeam = mutation({
  args: { teamId: v.optional(v.string()), serverDomain: v.union(v.string(), v.null()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const existing = args.teamId ? ctx.db.normalizeId("centaur_teams", args.teamId) : null;
    if (existing && (await ctx.db.get(existing))) {
      await ctx.db.replace(existing, { serverDomain: args.serverDomain });
      return existing;
    }
    return await ctx.db.insert("centaur_teams", { serverDomain: args.serverDomain });
  },
});

/**
 * Write one game record — its status and its whole roster snapshot — returning
 * its id. With `gameId`, replaces that record; without, creates one.
 */
export const seedGame = mutation({
  args: {
    gameId: v.optional(v.string()),
    status: gameStatus,
    roster: v.array(participantSnapshot),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const record = { status: args.status, roster: args.roster };
    const existing = args.gameId ? ctx.db.normalizeId("games", args.gameId) : null;
    if (existing && (await ctx.db.get(existing))) {
      await ctx.db.replace(existing, record);
      return existing;
    }
    return await ctx.db.insert("games", record);
  },
});
