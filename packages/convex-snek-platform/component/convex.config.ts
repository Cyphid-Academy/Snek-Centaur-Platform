// Convex Component declaration for snek-platform. Mounted by
// packages/convex-host's convex/convex.config.ts via the package export
// "@cyphid/convex-snek-platform/convex.config". Its tables are isolated from
// the host's and reachable only through the component's exported functions.
// spec: global-invariants/single-convex-deployment
// spec: global-invariants/state-confined-to-owning-runtime
import { defineComponent } from "convex/server";

export default defineComponent("snek-platform");
