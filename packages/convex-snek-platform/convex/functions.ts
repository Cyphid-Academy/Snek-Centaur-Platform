// spec: global-invariants/one-contract-many-surfaces
// The component's function surface. Callers reach these only through the host
// (`components.snekPlatform.functions.*`) — a component's tables are not
// readable from outside its own functions, which is what makes the boundary
// worth having.
//
// Only `status` is defined. The platform's real functions — user records, game
// records, instance attachment — belong to migrate-accounts-and-profiles and
// migrate-game-lifecycle, and each of them decides a rule those changes have
// yet to state. This one exists so the host can prove the component mounted.
import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Liveness of this component, called through the host by `platform:platformStatus`.
 *
 * Returns its own component name rather than a bare `true`: the answer then
 * identifies *which* component replied, so a mounting that resolved to the
 * wrong one is visible instead of merely green.
 */
export const status = query({
  args: {},
  returns: v.string(),
  handler: async () => "snekPlatform",
});
