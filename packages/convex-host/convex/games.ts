// Public game-configuration surface: thin pass-throughs to the snek-platform
// component. Every surface dispatches against these same functions — there is
// no second contract for a privileged client to bypass.
// spec: global-invariants/one-contract-many-surfaces
//
// NO AUTH YET — deliberately. The identity change
// (migrate-identity-and-authorization) wraps each of these with the host's
// capability registry; until it lands the surface is kept small and obvious
// so that wrapping is a mechanical pass. Each TODO below marks the seam.
//
// Rejections come back as data ({ ok: false, rejection }), pass-through from
// the component, so clients render them at the point of the action.
// spec: global-invariants/client-truthfulness#rejections-reach-the-user
import { gameConfigValidator, teamValidator } from "@cyphid/convex-snek-platform";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { mutation, query } from "./_generated/server.js";

// The offline-generated api.d.ts is the untyped AnyApi stub, so the mounted
// component's function references are typed here by hand (the runtime value
// is the generated reference proxy either way). Online codegen against a real
// deployment replaces the stub with fully typed references.
interface ComponentGamesApi {
  readonly createGame: FunctionReference<"mutation", "internal">;
  readonly getGame: FunctionReference<"query", "internal">;
  readonly updateConfig: FunctionReference<"mutation", "internal">;
  readonly updateRoster: FunctionReference<"mutation", "internal">;
  readonly setBoardLock: FunctionReference<"mutation", "internal">;
  readonly launchGame: FunctionReference<"mutation", "internal">;
}

const games = (components["snek-platform"] as unknown as { games: ComponentGamesApi }).games;

// TODO(migrate-identity-and-authorization): capability check before delegating.
export const createGame = mutation({
  args: { roomId: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(games.createGame, args);
  },
});

/**
 * The public read. A Convex query IS a reactive subscription: every
 * configuration surface subscribing here re-renders on each write, so all
 * viewers see the same current preview and the same rejection-free record —
 * no separate subscription endpoint is needed.
 * spec: game-configuration/board-preview#all-viewers-in-sync
 */
// TODO(migrate-identity-and-authorization): capability check before delegating.
export const getGame = query({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(games.getGame, args);
  },
});

// TODO(migrate-identity-and-authorization): capability check before delegating.
export const updateConfig = mutation({
  args: { gameId: v.string(), config: gameConfigValidator },
  handler: async (ctx, args) => {
    return await ctx.runMutation(games.updateConfig, args);
  },
});

// TODO(migrate-identity-and-authorization): capability check before delegating.
export const updateRoster = mutation({
  args: { gameId: v.string(), teams: v.array(teamValidator) },
  handler: async (ctx, args) => {
    return await ctx.runMutation(games.updateRoster, args);
  },
});

// TODO(migrate-identity-and-authorization): capability check before delegating.
export const setBoardLock = mutation({
  args: { gameId: v.string(), locked: v.boolean() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(games.setBoardLock, args);
  },
});

// TODO(migrate-identity-and-authorization): capability check before delegating.
export const launchGame = mutation({
  args: { gameId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runMutation(games.launchGame, args);
  },
});

// Deliberately NOT exposed here: the component's getGameInternal (unredacted:
// seed + hidden starting state) and concludeWithoutLaunch. Both belong to the
// lifecycle story's orchestration, which runs host-side and calls the
// component directly — a public host function for either would hand game
// clients what no game client may hold.
// spec: game-configuration/board-generation-retry ("accessible to no game client")
