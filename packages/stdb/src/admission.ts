// spec: identity-and-authorization/admission-validation
//
// The PURE admission decision core for a game's SpacetimeDB instance: given
// state seeded at instance initialisation and a presented token, decide
// whether a connection is admitted and, if so, as which identity.
//
// This module imports no SpacetimeDB SDK and touches no reducer, table, or
// connection — it is a plain function over plain data, deliberately, so it
// can be unit-tested without a running instance. Wiring it into actual
// reducers (reading the seeded tables, calling the runtime's own token
// signature check, disconnecting a rejected client) is the
// `mint-game-runtime` change's job; this module is what that wiring calls.
import type { GameRole } from "@cyphid/snek-platform-auth";
import {
  decodeGameSubject,
  gameAudience,
  mayMutate,
  teamBindingOf,
} from "@cyphid/snek-platform-auth";

/**
 * State seeded into the instance at initialisation and never refreshed —
 * the only state an admission decision may read.
 * spec: global-invariants/game-instance-hermeticity#seeded-once-never-refreshed
 */
export interface SeededAdmissionContext {
  readonly gameId: string;
  /** The Centaur Team ids registered as participants of this game (the roster snapshot). */
  readonly registeredTeamIds: ReadonlySet<string>;
}

/**
 * What the runtime's own token validation (signature check against
 * material obtained at startup) yields for a presented token. A field is
 * `null` when the token did not carry that claim at all — never assumed
 * present just because the token parsed.
 */
export interface PresentedToken {
  readonly signatureValid: boolean;
  readonly audience: string | null;
  readonly subject: string | null;
  readonly expiresAtMs: number | null;
}

/**
 * Why a connection was refused admission — closed, one variant per check
 * `decideAdmission` performs, in the order it performs them.
 */
export type AdmissionRejection =
  | "wrong-audience"
  | "invalid-signature"
  | "expired"
  | "malformed-subject"
  | "unregistered-team";

/**
 * The identity `decideAdmission` derived from an admitted token's subject
 * ALONE — role and any team binding, per game-token-contents
 * #subject-alone-decides-the-role. No other claim, and no platform-side
 * record (captaincy, admin standing), is consulted.
 */
export interface AdmittedIdentity {
  readonly role: GameRole;
  readonly userId: string | null;
  readonly teamId: string | null;
}

export type AdmissionDecision =
  | { readonly admitted: true; readonly identity: AdmittedIdentity }
  | { readonly admitted: false; readonly reason: AdmissionRejection };

/**
 * Decide whether a presented token admits its connection, and as which
 * identity.
 *
 * Checks run in this order, every one of them answerable from
 * `SeededAdmissionContext` alone (spec: identity-and-authorization
 * /admission-validation):
 *
 * 1. **Audience binding** — checked first, before anything else about the
 *    token is considered, per audience-bound-tokens#wrong-audience-refused.
 *    A wrong or absent audience is reported even when the token's
 *    signature is also invalid — the two checks are independent, and
 *    audience-bound-tokens is explicit that binding is checked before
 *    signature validity is.
 * 2. **Signature** — the runtime's own verification result is trusted
 *    as-is; this module performs no cryptography.
 * 3. **Expiry** — bounds only the window for establishing THIS connection;
 *    once admitted, the connection is never dropped on later expiry
 *    (identity-and-authorization/connect-time-validation#expiry-never-disconnects).
 *    A token with no expiry claim at all (`expiresAtMs === null`) is
 *    treated as already expired — there is no such thing as a token that
 *    never expires. Boundary: `expiresAtMs <= nowMs` is rejected (an
 *    expiry equal to "now" is not admitted).
 * 4. **Subject decodes** — a structurally invalid subject is rejected on
 *    `malformed-subject`.
 * 5. **Team binding registered** — only for subjects that BIND a team (bot,
 *    coach): identity-and-authorization/admission-validation
 *    #unregistered-team-refused. Operator and spectator subjects carry no
 *    team binding at all and so have nothing for this instance to check:
 *    an operator's roster membership was already enforced at ISSUANCE, from
 *    the roster snapshot (identity-and-authorization
 *    /participant-token-eligibility#operator-outside-roster-refused) — the
 *    subject itself never carries a team for the instance to re-check.
 *
 * Rejection produces NO state: this is a pure function, returning a
 * decision rather than performing any write. The reducer that calls this
 * discharges admission-validation#reject-before-touching-state by writing
 * nothing when `admitted` is false.
 */
export function decideAdmission(
  ctx: SeededAdmissionContext,
  token: PresentedToken,
  nowMs: number,
): AdmissionDecision {
  if (token.audience !== gameAudience(ctx.gameId)) {
    return { admitted: false, reason: "wrong-audience" };
  }

  if (!token.signatureValid) {
    return { admitted: false, reason: "invalid-signature" };
  }

  if (token.expiresAtMs === null || token.expiresAtMs <= nowMs) {
    return { admitted: false, reason: "expired" };
  }

  if (token.subject === null) {
    return { admitted: false, reason: "malformed-subject" };
  }
  const subject = decodeGameSubject(token.subject);
  if (subject === null) {
    return { admitted: false, reason: "malformed-subject" };
  }

  const teamId = teamBindingOf(subject);
  if (teamId !== null && !ctx.registeredTeamIds.has(teamId)) {
    return { admitted: false, reason: "unregistered-team" };
  }

  return {
    admitted: true,
    identity: {
      role: subject.role,
      userId: "userId" in subject ? subject.userId : null,
      teamId,
    },
  };
}

/**
 * Whether an admitted identity may mutate game state — delegates to
 * platform-auth's `mayMutate` on the identity's role alone.
 *
 * spec: identity-and-authorization/role-bound-privileges
 *
 * #captaincy-invisible-in-game: this reads nothing but the token-derived
 * identity. A team captain or platform admin connected as an operator or
 * coach gets exactly their token role's privileges — captaincy, admin
 * standing, or any other platform-side distinction is neither known nor
 * consulted here.
 */
export function mayMutateInGame(identity: AdmittedIdentity): boolean {
  return mayMutate(identity.role);
}
