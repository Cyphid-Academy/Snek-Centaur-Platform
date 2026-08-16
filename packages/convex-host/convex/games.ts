// Public game-configuration surface: thin pass-throughs to the snek-platform
// component, each built through the capability registry — the wrapper
// authenticates the caller, checks the declared capability (reachability),
// then the declared principal kinds, and hands the handler the resolved
// identity for its own authorization decision. Every surface dispatches
// against these same functions — there is no second contract for a
// privileged client to bypass.
// spec: global-invariants/one-contract-many-surfaces
// spec: identity-and-authorization/capability-registry
//
// All six functions accept HUMAN identities only — the default a function
// departs from explicitly, and none of these departs: a Centaur Team's
// whole authority exists to operate its team in play, never to configure
// games.
// spec: identity-and-authorization/principal-kind-gating
//
// MUTATION AUTHORIZATION, decided here at the contract from the resolved
// identity: today every game lives in the dev room (roomId null pending the
// rooms story), and any authenticated human may configure the dev room's
// games — so the right-to-mutate check each mutation makes is "caller is a
// resolved human". Room-scoped roles arrive with the rooms story and will
// narrow these same handlers; the seam is the `caller` parameter each
// handler already receives.
// spec: identity-and-authorization/mutation-authorization
//
// Rejections come back as data ({ ok: false, rejection }), pass-through from
// the component — and the wrapper's own refusals use the same convention.
// spec: global-invariants/client-truthfulness#rejections-reach-the-user
import { gameConfigValidator, teamValidator } from "@cyphid/convex-snek-platform";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { platformMutation, platformQuery } from "./lib/registry.js";

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

export const createGame = platformMutation({
  capability: "configure-games",
  args: { roomId: v.union(v.string(), v.null()) },
  handler: async (ctx, args, caller) => {
    // Right-to-mutate: any authenticated human may configure the dev
    // room's games today (see module header).
    // spec: identity-and-authorization/mutation-authorization
    void caller;
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
export const getGame = platformQuery({
  capability: "use-platform",
  args: { gameId: v.string() },
  handler: async (ctx, args, caller) => {
    // Reachability is not authorization: the handler still owns the read
    // decision. Today the record's public view is readable by every
    // authenticated human (its private halves — seed, hidden starting
    // state — are already stripped by the component's public read).
    // spec: identity-and-authorization/capability-registry#reachability-is-not-authorization
    void caller;
    return await ctx.runQuery(games.getGame, args);
  },
});

export const updateConfig = platformMutation({
  capability: "configure-games",
  args: { gameId: v.string(), config: gameConfigValidator },
  handler: async (ctx, args, caller) => {
    // spec: identity-and-authorization/mutation-authorization
    void caller;
    return await ctx.runMutation(games.updateConfig, args);
  },
});

export const updateRoster = platformMutation({
  capability: "configure-games",
  args: { gameId: v.string(), teams: v.array(teamValidator) },
  handler: async (ctx, args, caller) => {
    // spec: identity-and-authorization/mutation-authorization
    void caller;
    return await ctx.runMutation(games.updateRoster, args);
  },
});

// Designating the board is its own capability — colocated with the other
// configuration functions but a different grant, because grouping follows
// what a function does, never where it lives.
// spec: identity-and-authorization/capability-registry#capabilities-are-declared-not-derived
export const setBoardLock = platformMutation({
  capability: "designate-boards",
  args: { gameId: v.string(), locked: v.boolean() },
  handler: async (ctx, args, caller) => {
    // spec: identity-and-authorization/mutation-authorization
    void caller;
    return await ctx.runMutation(games.setBoardLock, args);
  },
});

// Launching stays under configure-games for now; the lifecycle story will
// revisit the grant when launch orchestration grows beyond the component
// pass-through.
export const launchGame = platformMutation({
  capability: "configure-games",
  args: { gameId: v.string() },
  handler: async (ctx, args, caller) => {
    // spec: identity-and-authorization/mutation-authorization
    void caller;
    return await ctx.runMutation(games.launchGame, args);
  },
});

// Deliberately NOT exposed here: the component's getGameInternal (unredacted:
// seed + hidden starting state) and concludeWithoutLaunch. Both belong to the
// lifecycle story's orchestration, which runs host-side and calls the
// component directly — a public host function for either would hand game
// clients what no game client may hold.
// spec: game-configuration/board-generation-retry ("accessible to no game client")
