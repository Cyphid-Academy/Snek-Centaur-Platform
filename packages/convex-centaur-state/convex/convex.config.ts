// spec: global-invariants/centaur-state-boundary
// Convex Component: the Centaur subsystem's per-team state.
//
// A separate component from snek-platform because the boundary is real: a
// team's bot configuration and action log are private to that team, and a
// component is the unit Convex enforces isolation at. The name is camelCase
// because it becomes a property on the host's `components` object.
import { defineComponent } from "convex/server";

export default defineComponent("centaurState");
