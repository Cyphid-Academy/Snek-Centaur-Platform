import type { FunctionReference } from "convex/server";
// INTERNAL test scaffolding: convex-test suites need real rows in the
// local-install Better Auth component (users, sessions) without a human
// completing a Google round trip — Google sign-in is config-only offline,
// and the platform deliberately has no password path to create users with
// (spec: identity-and-authorization/google-sign-in#no-human-shared-secrets).
// These are internalMutations: reachable by the deployment's own code and
// by tests, never by a client.
import { v } from "convex/values";
import { components } from "../_generated/api.js";
import { internalMutation } from "../_generated/server.js";

interface AdapterApi {
  readonly create: FunctionReference<"mutation", "internal">;
  readonly deleteOne: FunctionReference<"mutation", "internal">;
}

const adapter = (components as unknown as { betterAuth: { adapter: AdapterApi } }).betterAuth
  .adapter;

/** Create a Better Auth user row directly (test stand-in for a completed Google sign-in). */
export const createUser = internalMutation({
  args: { name: v.string(), email: v.string(), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const user = await ctx.runMutation(adapter.create, {
      input: {
        model: "user",
        data: {
          name: args.name,
          email: args.email,
          emailVerified: true,
          isAdmin: args.isAdmin,
          createdAt: now,
          updatedAt: now,
        },
      },
    });
    return user as { _id: string };
  },
});

/** Designate (or revoke) the platform admin role on a user record. */
// spec: identity-and-authorization/platform-admin-role
export const setAdmin = internalMutation({
  args: { userId: v.string(), isAdmin: v.boolean() },
  handler: async (ctx, args) => {
    interface UpdateApi {
      readonly updateOne: FunctionReference<"mutation", "internal">;
    }
    const update = (components as unknown as { betterAuth: { adapter: UpdateApi } }).betterAuth
      .adapter;
    await ctx.runMutation(update.updateOne, {
      input: {
        model: "user",
        where: [{ field: "_id", value: args.userId }],
        update: { isAdmin: args.isAdmin },
      },
    });
  },
});

/** Create a Better Auth session row for a user (test stand-in for sign-in). */
export const createSession = internalMutation({
  args: { userId: v.string(), token: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await ctx.runMutation(adapter.create, {
      input: {
        model: "session",
        data: {
          token: args.token,
          userId: args.userId,
          createdAt: now,
          updatedAt: now,
          expiresAt: args.expiresAt,
        },
      },
    });
    return session as { _id: string };
  },
});

interface ComponentGamesTestApi {
  readonly setRosterSnapshot: FunctionReference<"mutation", "internal">;
  readonly finishGame: FunctionReference<"mutation", "internal">;
}
const componentGames = (
  components as unknown as { "snek-platform": { games: ComponentGamesTestApi } }
)["snek-platform"].games;

/**
 * Record the roster snapshot's authorization fields (stand-in for the
 * lifecycle story's snapshot orchestration).
 */
// spec: identity-and-authorization/roster-snapshot-binding
export const setRosterSnapshot = internalMutation({
  args: {
    gameId: v.string(),
    entries: v.array(
      v.object({
        centaurTeamId: v.string(),
        memberUserIds: v.array(v.string()),
        coachUserIds: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(componentGames.setRosterSnapshot, args);
  },
});

/** Flip a playing game to finished (stand-in for lifecycle teardown). */
// spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
export const finishGame = internalMutation({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(componentGames.finishGame, args);
  },
});

/** Revoke a session by token — the stateful anchor's kill switch. */
// spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
export const revokeSession = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(adapter.deleteOne, {
      input: {
        model: "session",
        where: [{ field: "token", value: args.token }],
      },
    });
  },
});
