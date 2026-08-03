// spec: identity-and-authorization/identity-kinds, global-invariants/state-confined-to-owning-runtime
// Convex Component: the platform's persistent state.
// camelCase: the name becomes a property on the host's `components` object.
import { defineComponent } from "convex/server";

export default defineComponent("snekPlatform");
