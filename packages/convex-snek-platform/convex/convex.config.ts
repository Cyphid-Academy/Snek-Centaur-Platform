// spec: identity-and-authorization/identity-kinds, global-invariants/state-confined-to-owning-runtime
// Convex Component: the platform's persistent state.
//
// The component name becomes a property on the host's `components` object in
// generated code, so it is camelCase even though the package and directory are
// hyphenated. Mounted by packages/convex-host/convex/convex.config.ts.
import { defineComponent } from "convex/server";

export default defineComponent("snekPlatform");
