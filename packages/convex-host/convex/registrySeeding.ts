// Operator seeding for the two NEIGHBOURING tables, beside `registry.ts` and
// with exactly its shape: internal, reached against the deployment with an
// admin credential (`convex run`), declaring no capability and appearing in no
// ceiling.
//
// The tables these write are schema without a production writer: `games` and
// `centaur_teams` belong to migrate-game-lifecycle and migrate-team-management,
// which have not landed — so a live deployment otherwise has no way to hold a
// game, and everything downstream of one (`issueGameToken`,
// `issueGameCredential`, and any instance admission those tokens would earn) is
// unreachable end to end. Until the owning changes bring the real writers,
// standing a deployment up with something to issue against is an operator act,
// exactly as registering an issuer or designating the first admin is. The
// component-side halves are `convex-snek-platform`'s `seeding.ts`; when the
// owning changes land, both halves are the first thing they delete.
import { v } from "convex/values";
import { components } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

/** Seed one team record, returning its id. With `teamId`, replaces that record. */
export const seedTeam = internalMutation({
  args: { teamId: v.optional(v.string()), serverDomain: v.union(v.string(), v.null()) },
  returns: v.string(),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.snekPlatform.seeding.seedTeam, args),
});

/** Seed one game record — status and whole roster snapshot — returning its id. */
export const seedGame = internalMutation({
  args: {
    gameId: v.optional(v.string()),
    status: v.union(v.literal("not-started"), v.literal("playing"), v.literal("finished")),
    roster: v.array(
      v.object({
        teamId: v.string(),
        memberUserIds: v.array(v.string()),
        coachUserIds: v.array(v.string()),
      }),
    ),
  },
  returns: v.string(),
  handler: async (ctx, args) =>
    await ctx.runMutation(components.snekPlatform.seeding.seedGame, args),
});

/**
 * Whether previously seeded ids still resolve, so a re-run of a seeding script
 * writes the same world instead of a second one beside it.
 */
export const seededWorld = internalQuery({
  args: { teamIds: v.array(v.string()), gameIds: v.array(v.string()) },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    for (const teamId of args.teamIds) {
      if (!(await ctx.runQuery(components.snekPlatform.functions.team, { teamId }))) return false;
    }
    for (const gameId of args.gameIds) {
      if (!(await ctx.runQuery(components.snekPlatform.functions.gameForIssuance, { gameId }))) {
        return false;
      }
    }
    return true;
  },
});
