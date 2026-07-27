// spec: global-invariants/single-convex-deployment
// Convex Host deployment — mounts both Convex Components and adds:
//   - Auth wrappers (Google sign-in, service-principal issuance)
//   - Platform HTTP API (registered integration clients)
//   - Game lifecycle orchestration
//
// TODO: Integrate Better Auth (local install mode) plus the project-owned
//       capability plugin that issues credentials to service principals.
//       Deferred to the first Convex implementation task. See
//       packages/convex-host/AGENTS.md for context.
//
// This is a typed skeleton — implementation deferred.

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

// ---------------------------------------------------------------------------
// Placeholder public function
// ---------------------------------------------------------------------------

/**
 * Returns a hello-world string. Replace with real platform functions.
 * @throws Error("not implemented")
 */
export function platformHello(): string {
  throw new Error("not implemented");
}
