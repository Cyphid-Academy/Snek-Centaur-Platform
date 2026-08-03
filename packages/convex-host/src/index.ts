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
