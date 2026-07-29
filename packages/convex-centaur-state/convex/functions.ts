// spec: global-invariants/centaur-state-boundary
// The component's function surface, reachable only through the host
// (`components.centaurState.functions.*`).
//
// Only `status` is defined. Snake selection, bot configuration and the team
// action log all live behind migrate-operator-control, migrate-bot-configuration
// and migrate-replay-and-audit; this one exists so the host can prove the
// component mounted.
import { v } from "convex/values";
import { query } from "./_generated/server";

/** Liveness of this component. See the twin in convex-snek-platform. */
export const status = query({
  args: {},
  returns: v.string(),
  handler: async () => "centaurState",
});
