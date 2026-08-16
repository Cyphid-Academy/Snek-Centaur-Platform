// The single Convex deployment: the host app, mounting the platform
// component. Component tables are isolated from the host's; everything
// reaches them through the component's exported functions.
// spec: global-invariants/single-convex-deployment
import snekPlatform from "@cyphid/convex-snek-platform/convex.config";
import { defineApp } from "convex/server";
// Better Auth, LOCAL INSTALL: the auth component is embedded in this
// package's convex/betterAuth/ directory (see the identity change's
// local-install decision), so its schema is modifiable where it lives.
import betterAuth from "./betterAuth/convex.config.js";

const app = defineApp();
app.use(snekPlatform);
app.use(betterAuth);
// TODO: app.use(centaurState) once @cyphid/convex-centaur-state becomes a
// real component — that lands with the Centaur-state stories, not here.

export default app;
