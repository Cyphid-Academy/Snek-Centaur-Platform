// spec: global-invariants/single-convex-deployment
// The platform's one Convex deployment; all three components mount here.
import betterAuth from "@convex-dev/better-auth/convex.config.js";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";
// Relative, not by package name: Convex bundles a component from its
// `convex.config.ts` source, and a pnpm workspace symlink moves the component
// root outside the package the import was written in.
import centaurState from "../../convex-centaur-state/convex/convex.config.js";
import snekPlatform from "../../convex-snek-platform/convex/convex.config.js";

const app = defineApp();
app.use(snekPlatform);
app.use(centaurState);
// spec: identity-and-authorization/google-sign-in
// Mounted from the published package rather than installed locally: the
// component's tables live on its own side of the boundary either way, so a
// local install would only let us edit a generated schema we have no reason to
// edit. Its user, session, and account tables are the sign-in substrate and are
// reached exclusively through `auth.ts` — the host still owns no tables.
app.use(betterAuth);
// spec: identity-and-authorization/peer-capability-ceiling
// The registered-system call bound. Mounted from the published package for the
// same reason as Better Auth above — its counters are its own tables, and the
// host owns none of them. What the bound *is* stays in `publicFunctions.ts`,
// which is the only place that names a rate or a period.
app.use(rateLimiter);

export default app;
