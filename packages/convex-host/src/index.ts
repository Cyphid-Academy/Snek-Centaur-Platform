// spec: global-invariants/single-convex-deployment
// @cyphid/snek-convex-host — the Node-side surface of the platform's one Convex
// deployment.
//
// The deployment itself lives in `convex/`: `convex.config.ts` mounts both
// components, and `platform.ts` / `centaur.ts` are its public function surface.
// This package exports what the rest of the workspace needs in order to talk to
// it — the record types and the environment contract — without pulling the
// Convex runtime into every consumer.
//
// TODO: Integrate Better Auth (local install mode) plus the project-owned
//       capability plugin that issues credentials to service principals. Still
//       deferred: the auth model is spec-heavy and belongs with the
//       migrate-identity-and-authorization change, not with runtime wiring. See
//       packages/convex-host/AGENTS.md.

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
export { CONVEX_ENV, STDB_ENV, describeMissing, missingEnv } from "./env.js";

/**
 * The deployment's public functions, by the name `convex run` and the client
 * SDK address them. Exported as data so a caller naming one gets a compile
 * error when it is renamed, rather than a runtime "no such function".
 *
 * Only the liveness query so far — the rest are named here as the capability
 * changes that define them land.
 *
 * spec: global-invariants/one-contract-many-surfaces
 */
export const HOST_FUNCTIONS = {
  platformStatus: "platform:platformStatus",
} as const;
