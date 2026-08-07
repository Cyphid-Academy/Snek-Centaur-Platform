// spec: global-invariants/one-contract-many-surfaces, platform-integrations/functions-are-the-api
// The deployment's public function surface. Every function reaches its data
// through `components.*`, never `ctx.db` — the host owns no tables.
import { v } from "convex/values";
import { components } from "./_generated/api";
import { query } from "./_generated/server";

/**
 * Liveness of the deployment and of the component mounting.
 *
 * The two names are the point: each is obtainable only by calling through its
 * component, and each component answers with its own name, so a mounting that
 * resolved to the wrong component is visible rather than merely green.
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
