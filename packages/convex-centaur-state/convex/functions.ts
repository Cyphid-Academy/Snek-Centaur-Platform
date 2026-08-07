// spec: global-invariants/centaur-state-boundary
// The component's function surface, reachable only through the host
// (`components.centaurState.functions.*`).
import { v } from "convex/values";
import { query } from "./_generated/server";

/** Liveness of this component. See `platformStatus` in the host. */
export const status = query({
  args: {},
  returns: v.string(),
  handler: async () => "centaurState",
});
