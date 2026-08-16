// The single Convex deployment: the host app, mounting the platform
// component. Component tables are isolated from the host's; everything
// reaches them through the component's exported functions.
// spec: global-invariants/single-convex-deployment
import snekPlatform from "@cyphid/convex-snek-platform/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();
app.use(snekPlatform);
// TODO: app.use(centaurState) once @cyphid/convex-centaur-state becomes a
// real component — that lands with the Centaur-state stories, not here.

export default app;
