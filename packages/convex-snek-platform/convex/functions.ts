// spec: global-invariants/one-contract-many-surfaces
// The component's function surface, reachable only through the host
// (`components.snekPlatform.functions.*`).
import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Liveness of this component. Returns its own name rather than a bare `true`,
 * so the answer identifies which component replied.
 */
export const status = query({
  args: {},
  returns: v.string(),
  handler: async () => "snekPlatform",
});
