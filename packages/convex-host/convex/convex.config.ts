// spec: global-invariants/single-convex-deployment
// The platform's one Convex deployment. It owns no tables of its own — both
// components mount here, which is what makes "exactly one deployment" hold
// while still keeping platform state and Centaur-subsystem state on opposite
// sides of a boundary Convex enforces.
//
// Imported by relative path rather than by package name: Convex bundles a
// component from its `convex.config.ts` source, and resolving that through a
// pnpm workspace symlink lands the component root outside the package the
// import was written in.
import { defineApp } from "convex/server";
import centaurState from "../../convex-centaur-state/convex/convex.config.js";
import snekPlatform from "../../convex-snek-platform/convex/convex.config.js";

const app = defineApp();
app.use(snekPlatform);
app.use(centaurState);

export default app;
