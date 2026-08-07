// spec: global-invariants/single-convex-deployment
// The platform's one Convex deployment; both components mount here.
import { defineApp } from "convex/server";
// Relative, not by package name: Convex bundles a component from its
// `convex.config.ts` source, and a pnpm workspace symlink moves the component
// root outside the package the import was written in.
import centaurState from "../../convex-centaur-state/convex/convex.config.js";
import snekPlatform from "../../convex-snek-platform/convex/convex.config.js";

const app = defineApp();
app.use(snekPlatform);
app.use(centaurState);

export default app;
