// spec: e2e/hermetic-substrate
// What a test imports.
//
// The fixtures are the whole of this member's surface: a scenario asks for a
// substrate and a browser and then talks to the running system. Nothing here
// asserts anything about the platform — an assertion belongs to the capability
// whose behaviour it checks, and arrives with that capability's own change.
export { launchBrowser } from "./browser";
export type { BrowserHarness, CookieSpec, OperatorSession } from "./browser";
export { freePort, freePorts } from "./ports";
export { startCentaurServer } from "./runtimes/centaur-server";
export type { CentaurServer, CentaurServerOptions } from "./runtimes/centaur-server";
export { startConvex } from "./runtimes/convex";
export type { ConvexDeployment, ConvexOptions } from "./runtimes/convex";
export { startSpacetime } from "./runtimes/spacetimedb";
export type { SpacetimeHost, SpacetimeOptions } from "./runtimes/spacetimedb";
export { httpReady, startService, stopAll } from "./service";
export type { Service, ServiceSpec } from "./service";
export { startSubstrate } from "./substrate";
export type { Substrate, SubstrateOptions } from "./substrate";
