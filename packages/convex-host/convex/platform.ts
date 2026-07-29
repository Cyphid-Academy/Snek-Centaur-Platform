// spec: global-invariants/one-contract-many-surfaces, platform-integrations/functions-are-the-api
// The deployment's public function surface.
//
// Every function here reaches its data through `components.*`, never through
// `ctx.db` — the host owns no tables. That makes these functions the one place
// an invariant spanning both components can be enforced in a single
// transaction (global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction),
// and it is what keeps "exactly one deployment" true while leaving the
// Centaur-state boundary enforced by Convex rather than by convention.
//
// Only `platformStatus` is defined. The platform's real functions arrive with
// their capability changes; this file's job for now is to make the deployment
// verifiable.
import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";

/**
 * Liveness of the deployment *and* of the component mounting.
 *
 * The two names are the point: they are only obtainable by calling through
 * `components.snekPlatform` / `components.centaurState`, and each component
 * answers with its own name, so a green response proves both components mounted
 * and mounted as themselves — not merely that a function deployed.
 */
export const platformStatus = query({
  args: {},
  returns: v.object({
    ok: v.boolean(),
    components: v.array(v.string()),
  }),
  handler: async (ctx) => ({
    ok: true,
    components: [
      await ctx.runQuery(components.snekPlatform.functions.status, {}),
      await ctx.runQuery(components.centaurState.functions.status, {}),
    ],
  }),
});
