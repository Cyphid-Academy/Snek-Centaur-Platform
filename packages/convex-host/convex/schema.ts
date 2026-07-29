// spec: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary
// The host deployment owns no tables. Every table belongs to a mounted
// component, so the boundary between platform state and Centaur state is
// enforced by Convex rather than by convention about which functions touch
// which rows.
import { defineSchema } from "convex/server";

export default defineSchema({});
