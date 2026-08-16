// spec: identity-and-authorization/game-token-contents
// Depends (soundness): global-invariants/durable-identity-references#derived-identities-inherit-durability
//
// A game access token's subject encodes the holder's role AND identity
// binding using the platform's OWN durable identifiers (Convex ids) —
// never a provider's subject — so the identity a game instance derives
// stays stable across any change of the principal's external credentials.
// The subject alone is what lets the instance tell a spectator connection
// from an operator connection: they are different identities, one of which
// the instance's seeded permissions simply do not name (game-token-contents
// #subject-alone-decides-the-role) — no role claim is ever read.
import type { GameRole } from "./principal.js";

const SEPARATOR = ":";

/** The holder of a game access token, discriminated by role. */
export type GameSubject =
  | { readonly role: "operator"; readonly userId: string }
  | { readonly role: "bot"; readonly teamId: string }
  // spec: identity-and-authorization/spectator-tokens#no-team-binding
  | { readonly role: "spectator"; readonly userId: string }
  | { readonly role: "coach"; readonly userId: string; readonly teamId: string };

function assertValidId(id: string, label: string): void {
  if (id.length === 0) {
    throw new Error(`platform-auth: game subject ${label} must not be empty`);
  }
  if (id.includes(SEPARATOR)) {
    throw new Error(
      `platform-auth: game subject ${label} must not contain "${SEPARATOR}" — platform ids are Convex ids (alphanumeric)`,
    );
  }
}

/**
 * Encode a game subject to its wire form:
 *   operator:<userId>  |  bot:<teamId>  |  spectator:<userId>  |  coach:<userId>:<teamId>
 *
 * Refuses (throws) rather than producing a subject that could decode
 * ambiguously or wrongly: an id containing the "${SEPARATOR}" separator, or
 * an empty id.
 */
export function encodeGameSubject(subject: GameSubject): string {
  switch (subject.role) {
    case "operator":
      assertValidId(subject.userId, "userId");
      return `operator:${subject.userId}`;
    case "bot":
      assertValidId(subject.teamId, "teamId");
      return `bot:${subject.teamId}`;
    case "spectator":
      assertValidId(subject.userId, "userId");
      return `spectator:${subject.userId}`;
    case "coach":
      assertValidId(subject.userId, "userId");
      assertValidId(subject.teamId, "teamId");
      return `coach:${subject.userId}:${subject.teamId}`;
  }
}

/**
 * Decode a game subject from its wire form. Total and strict: an unknown
 * role, wrong arity, or an empty id segment all decode to null rather than
 * a partially-trusted guess — there is no partial-credit result.
 */
export function decodeGameSubject(raw: string): GameSubject | null {
  const parts = raw.split(SEPARATOR);
  const role = parts[0];
  switch (role) {
    case "operator":
    case "spectator": {
      if (parts.length !== 2) return null;
      const userId = parts[1];
      if (userId === undefined || userId.length === 0) return null;
      return { role, userId };
    }
    case "bot": {
      if (parts.length !== 2) return null;
      const teamId = parts[1];
      if (teamId === undefined || teamId.length === 0) return null;
      return { role: "bot", teamId };
    }
    case "coach": {
      if (parts.length !== 3) return null;
      const userId = parts[1];
      const teamId = parts[2];
      if (userId === undefined || userId.length === 0) return null;
      if (teamId === undefined || teamId.length === 0) return null;
      return { role: "coach", userId, teamId };
    }
    default:
      return null;
  }
}

/** The role a subject decides — read from the identity, never a separate claim. */
export function roleOf(subject: GameSubject): GameRole {
  return subject.role;
}

/**
 * The Centaur Team a subject binds, or null for roles that carry no team
 * binding (operator, spectator). Operators DO belong to a roster team
 * platform-side, but the subject names only the acting human — team
 * eligibility for an operator is enforced at issuance
 * (identity-and-authorization/participant-token-eligibility), not from
 * anything the subject itself carries.
 */
export function teamBindingOf(subject: GameSubject): string | null {
  switch (subject.role) {
    case "bot":
    case "coach":
      return subject.teamId;
    case "operator":
    case "spectator":
      return null;
  }
}

/**
 * Whether a role may mutate game state — true only for operator and bot.
 * spec: identity-and-authorization/role-bound-privileges#spectator-and-coach-never-mutate
 */
export function mayMutate(role: GameRole): boolean {
  return role === "operator" || role === "bot";
}
