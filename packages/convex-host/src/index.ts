// spec: 02-REQ-002
// Convex Host deployment — mounts both Convex Components and adds:
//   - Auth wrappers (Google OAuth, game credentials)
//   - Platform HTTP API (bearer token)
//   - Game lifecycle orchestration
//
// TODO: Integrate @convex-dev/auth for Google OAuth + bespoke OIDC token
//       issuance for SpacetimeDB. Deferred to the first Convex implementation
//       task. See packages/convex-host/AGENTS.md for context.
//
// This is a typed skeleton — implementation deferred.

export type {
  UserRecord,
  GameRecord,
  RoomRecord,
  GameInvitationPayload,
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
