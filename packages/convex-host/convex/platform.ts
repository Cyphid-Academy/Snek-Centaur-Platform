// spec: global-invariants/one-contract-many-surfaces, platform-integrations/functions-are-the-api
// The deployment's public function surface. Every function reaches its data
// through `components.*`, never `ctx.db` — the host owns no tables.
import { v } from "convex/values";
import { components } from "./_generated/api";
import { publicQuery } from "./publicFunctions";

/**
 * Liveness of the deployment and of the component mounting.
 *
 * The two names are the point: each is obtainable only by calling through its
 * component, and each component answers with its own name, so a mounting that
 * resolved to the wrong component is visible rather than merely green.
 */
export const platformStatus = publicQuery({ capability: "read-platform-status" })({
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

/**
 * What was done on this human's account through a registered system, and by
 * which one — the showing `#attribution-is-user-visible` requires, without
 * which the records `publicFunctions.ts` writes would be a log nobody can read.
 *
 * It takes no argument, and that is the access rule rather than a convenience:
 * whose records these are comes from the caller's own credential, so there is
 * no id for one user to pass in order to read another's. Humans only, on the
 * default, because the account being reviewed is a human's.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
 */
export const attributedActions = publicQuery({ capability: "review-attributed-actions" })({
  args: {},
  returns: v.array(v.object({ issuerId: v.string(), capability: v.string(), at: v.number() })),
  handler: async (ctx) => {
    const caller = ctx.caller;
    return ctx.runQuery(components.snekPlatform.functions.actionsTakenFor, {
      userId: caller.userId,
    });
  },
});
