// spec: identity-and-authorization/game-token-contents
// The subject of a game access token: who is being admitted, in which role —
// written and read by one codec.
//
// **Here, and reachable as `@cyphid/snek-stdb/subject`, because the two ends of
// this grammar are in different runtimes.** The platform writes it in Convex,
// the game instance reads it inside a V8 isolate that must not import Convex,
// and the end-to-end suite drives both. It used to be spelled three times —
// encoder, parser, and a restatement in the harness — with nothing but a
// cross-package test round-trip holding them together. A subpath of its own so
// that importing the grammar does not drag the engine into a Convex bundle.
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
 */
export function encodeGameSubject(subject: GameSubject): string {
  if (subject.role === "bot") return `bot:${subject.teamId}`;
  if (subject.role === "coach") return `coach:${subject.userId}:${subject.teamId}`;
  return `${subject.role}:${subject.userId}`;
}

/**
 * Read a `sub` back, or `null` for anything this grammar does not spell.
 *
 * Total over arbitrary input, because this runs at the game instance's trust
 * boundary: what arrives is whatever a signer chose to put there. Every role's
 * segment count is exact — "at least three" would silently accept a coach
 * subject with a trailing segment — and the role is compared case-sensitively,
 * because it is a token the platform *spelled*, not a word to be recognised.
 * Refusing rather than guessing is what keeps the grammar a closed agreement
 * between the writer and the reader.
 */
export function parseGameSubject(sub: string): GameSubject | null {
  const [role, first, second, ...beyond] = sub.split(":");
  if (!first || beyond.length > 0) return null;
  if (second === undefined) {
    if (role === "spectator" || role === "operator") return { role, userId: first };
    if (role === "bot") return { role, teamId: first };
    return null;
  }
  return role === "coach" && second ? { role, userId: first, teamId: second } : null;
}
