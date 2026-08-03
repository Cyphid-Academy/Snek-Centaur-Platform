// spec: global-invariants/single-convex-deployment, global-invariants/one-contract-many-surfaces
// @cyphid/snek-convex-host — the Node-side surface of the platform's one Convex
// deployment. The deployment itself lives in `convex/`; this package exports the
// record types and the environment contract, so consumers need not pull in the
// Convex runtime. Functions are addressed through the generated `api` object.
// See packages/convex-host/AGENTS.md.

export type {
  UserRecord,
  GameRecord,
  RoomRecord,
  TeamGameContext,
} from "@cyphid/convex-snek-platform";
export type {
  CentaurActionRecord,
  SnakeConfigRecord,
  DriveRecord,
} from "@cyphid/convex-centaur-state";

export type { EnvRequirement } from "./env.js";
export {
  CONVEX_CLI_ENV,
  CONVEX_CLIENT_ENV,
  CONVEX_ENV,
  STDB_ENV,
  describeMissing,
  missingEnv,
} from "./env.js";

// There is deliberately no hand-written table of function names here.
//
// One lived here as `HOST_FUNCTIONS`, holding string literals like
// `"platform:platformStatus"` and claiming that a caller naming a function
// would get a compile error if it were renamed. That claim was false: a string
// literal is not a reference to anything, so renaming `platformStatus` left
// every consumer compiling and failing at run time with "no such function" —
// precisely the failure the table said it prevented, now with a second name to
// keep in sync.
//
// The real compile-time reference is the generated `api` object in
// `convex/_generated/api`, which `tsc` checks against the deployment's actual
// function surface. Consumers address functions through that, and this package
// stays what it says it is: the types and the environment contract, without
// pulling the Convex runtime into every consumer.
//
// spec: global-invariants/one-contract-many-surfaces
