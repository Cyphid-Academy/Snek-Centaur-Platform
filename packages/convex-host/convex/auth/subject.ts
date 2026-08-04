// spec: identity-and-authorization/game-token-contents
// The subject of a game access token: who is being admitted, in which role.
//
// A game instance derives its identity by hashing the token's issuer and
// subject, so encoding the role *in* the subject makes the same human arrive
// as a different identity depending on the role they asked for
// (`#subject-alone-decides-the-role`). A spectator is then read-only because
// the instance's seeded permissions never name that identity — not because
// some staging path remembered to check a claim. The instance may read claims,
// which is exactly why the role must not live in one: a role claim would make
// the property conditional on a branch that can be forgotten.
//
// The identity binding differs by role because what each role *is* differs.
// An operator acts as the human; the team they operate is already in the
// roster snapshot the instance was seeded with, keyed by that human. A bot
// acts as the Centaur Team and no human is involved. A coach needs both,
// because a coach of a team need not be a member of it, so nothing seeded
// would resolve their team from their user id. A spectator has no team at all
// — the absence is what makes the connection a spectator connection.

/**
 * The subject a game access token carries, as the union of what each role may
 * bind. A spectator variant with a team is unrepresentable rather than merely
 * refused, so `spectator-tokens#no-team-binding` cannot be violated by code
 * that forgets it.
 */
export type GameSubject =
  | { readonly role: "operator"; readonly userId: string }
  | { readonly role: "spectator"; readonly userId: string }
  | { readonly role: "bot"; readonly teamId: string }
  | { readonly role: "coach"; readonly userId: string; readonly teamId: string };

/**
 * Render a subject as the token's `sub` string: the role, then the platform's
 * own durable identifiers for what it binds. Colon-delimited because ids never
 * contain a colon, which is what lets the reader recover the role from arity
 * alone.
 *
 * This encoding is written here and read in `packages/stdb/src/admission.ts`,
 * which cannot import Convex and so restates the grammar. The direction is
 * one-way on purpose — the platform only ever *has* a subject before it mints
 * one, so a parser on this side would be a second spelling with no caller, and
 * a second spelling is exactly how the two ends drift apart.
 */
export function encodeGameSubject(subject: GameSubject): string {
  if (subject.role === "bot") return `bot:${subject.teamId}`;
  if (subject.role === "coach") return `coach:${subject.userId}:${subject.teamId}`;
  return `${subject.role}:${subject.userId}`;
}
