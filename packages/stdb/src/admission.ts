// spec: identity-and-authorization/admission-validation,
//       identity-and-authorization/connect-time-validation
// Whether a connection may be admitted to this game, decided as pure data.
//
// The decision is total and side-effect free on purpose. `#reject-before-touching-state`
// requires that a rejected connection leave no admission record, no attribution
// entry, and no other trace, and the cheapest way to guarantee that is for the
// deciding code to be incapable of writing: the connection hook calls this,
// then writes only on `ok`. A function that could refuse *and* write would put
// the guarantee back into the ordering of statements in a reducer body.
//
// Everything it consults is seeded at initialisation — the platform's issuer,
// the game's own id and its roster snapshot — so a hermetic instance answers
// admission alone, with no per-connection external call
// (`verification-without-shared-secrets#instance-validates-alone`).
// Signature verification is the host's, against material it resolved from the
// issuer the token itself names; a token the host could not verify arrives here
// as `undefined`, which is the same refusal as any other.
//
// **A verified signature is not yet a signature of the platform's**, because
// the host resolves verification material from the `iss` the presented token
// itself names — so the pin below is what tells the platform's signature from
// any other resolvable issuer's. Why the host cannot do this is
// `packages/stdb/AGENTS.md`.
//
// The `sub` grammar is `./subject.ts`'s, shared with the platform that writes
// it — this file decides what a parsed subject *earns*, and nothing about how
// one is spelled.
import { parseGameSubject } from "./subject";

/** The claims of a token whose signature the host has already checked. */
export interface VerifiedToken {
  /**
   * Who signed it, as the token itself declares. Checked against the seeded
   * platform issuer before anything else: the host resolved a key set from
   * *this* value, so it is the claim that says whether the verified signature
   * was the platform's at all.
   */
  readonly iss: string;
  /** The game the token grants admission to; nothing else is a valid audience. */
  readonly aud: string;
  readonly sub: string;
  /** Seconds since the epoch. */
  readonly exp: number;
}

/** State seeded at initialisation, and the connection-time clock. */
export interface AdmissionContext {
  /**
   * The one issuer this instance accepts credentials from, pinned at
   * initialisation and never resolved from a presented token.
   *
   * spec: identity-and-authorization/verification-without-shared-secrets
   */
  readonly platformIssuer: string;
  readonly gameId: string;
  /** Centaur Teams registered as participants of this game. */
  readonly participantTeamIds: ReadonlySet<string>;
  /** Roster snapshot, member user id to their participating team. */
  readonly teamOfMember: ReadonlyMap<string, string>;
  /**
   * Roster snapshot, human to the participating teams they are a designated
   * coach of.
   *
   * Separate from `teamOfMember` because a coach need not be a member of the
   * team they coach, and may coach more than one — so it is neither the same
   * relation nor a function of it.
   *
   * spec: identity-and-authorization/roster-snapshot-binding
   */
  readonly coachTeams: ReadonlyMap<string, ReadonlySet<string>>;
  readonly nowSeconds: number;
}

/**
 * The identity an admitted connection carries for its lifetime.
 *
 * `actsFor` is the team a mutation may be staged on behalf of, and it exists
 * only on the roles that may mutate: a spectator or coach identity has no field
 * a mutating operation could read, so `role-bound-privileges#spectator-and-coach-never-mutate`
 * holds structurally rather than by a check some path could omit. Nothing
 * platform-side — captaincy, admin standing — appears here at all, because
 * nothing platform-side reaches the token (`#captaincy-invisible-in-game`).
 *
 * spec: identity-and-authorization/role-bound-privileges
 */
export type AdmittedIdentity =
  | { readonly role: "operator"; readonly userId: string; readonly actsFor: string }
  | { readonly role: "bot"; readonly teamId: string; readonly actsFor: string }
  | { readonly role: "spectator"; readonly userId: string }
  | { readonly role: "coach"; readonly userId: string; readonly viewsAs: string };

export type AdmissionRefusal =
  | "unverified"
  | "untrusted-issuer"
  | "wrong-game"
  | "expired"
  | "malformed-subject"
  | "not-a-participant"
  | "not-a-coach";

export type Admission =
  | { readonly ok: true; readonly identity: AdmittedIdentity }
  | { readonly ok: false; readonly refusal: AdmissionRefusal };

/**
 * Decide admission for one connection. Called exactly once, at connection time;
 * what it returns persists for the connection without re-validation, so an
 * expiry passed mid-game never drops an established connection —
 * `connect-time-validation#expiry-never-disconnects` makes expiry a bound on
 * the window for establishing a connection and nothing more.
 *
 * Role and team binding are read from the subject alone. The runtime affords
 * other claims; reading one to decide a role would make a read-only role
 * conditional on a branch (`game-token-contents#subject-alone-decides-the-role`).
 *
 * spec: identity-and-authorization/admission-validation
 */
export function admit(token: VerifiedToken | undefined, ctx: AdmissionContext): Admission {
  if (!token) return { ok: false, refusal: "unverified" };
  // Before every other claim, because every other claim is a statement by
  // whoever signed this and is worth exactly what they are.
  //
  // `!ctx.platformIssuer` is the uninitialised instance, whose pin is the empty
  // string — refused explicitly, for the same reason as the empty game binding
  // below, since a token claiming no issuer would otherwise *match* it.
  //
  // spec: identity-and-authorization/verification-without-shared-secrets#a-valid-signature-from-a-stranger-is-refused
  // spec: identity-and-authorization/admission-validation
  if (!ctx.platformIssuer || token.iss !== ctx.platformIssuer) {
    return { ok: false, refusal: "untrusted-issuer" };
  }
  // The audience binding is checked before anything the token *says about its
  // holder* — spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused.
  // Only the issuer pin precedes it, and that is not a claim about the holder
  // but about whether the signature means anything here at all.
  // `!ctx.gameId` is the uninitialised instance, whose seed tables are empty and
  // whose binding is therefore the empty string. Without it a token naming the
  // empty audience would *match* that empty binding, and an instance with no
  // game yet is the one place there is no participation to check against.
  if (!ctx.gameId || token.aud !== ctx.gameId) return { ok: false, refusal: "wrong-game" };
  // Phrased as "not demonstrably still alive" rather than `exp <= now`, because
  // every comparison with NaN is false: an `exp` that is a number but not an
  // instant would pass a `<=` gate and never expire, which is the one shape of
  // expiry that bounds nothing at all. The negation fails closed on it.
  if (!(token.exp > ctx.nowSeconds)) return { ok: false, refusal: "expired" };

  // Spelling is `subject.ts`'s; what a subject *earns* is this file's. Nothing
  // below re-reads a delimiter or a segment count, so the grammar cannot drift
  // between the platform that writes one and the instance that reads one.
  const subject = parseGameSubject(token.sub);
  if (!subject) return { ok: false, refusal: "malformed-subject" };
  switch (subject.role) {
    case "spectator":
      return { ok: true, identity: { role: "spectator", userId: subject.userId } };
    case "operator": {
      // An operator's team is not in the subject: the seeded roster snapshot
      // already keys it by user id. The scenario asks for a human recorded "on a
      // participating team", which is two facts and not one — so the team the
      // snapshot names is checked against the participant set rather than assumed
      // to be in it. Nothing yet writes these two tables together (`initialize_game`
      // belongs to migrate-game-lifecycle), so a seed that disagreed with itself
      // would otherwise admit an operator acting for a team this game never
      // registered.
      // spec: identity-and-authorization/admission-validation#operator-absent-from-the-snapshot-refused
      const actsFor = ctx.teamOfMember.get(subject.userId);
      return actsFor && ctx.participantTeamIds.has(actsFor)
        ? { ok: true, identity: { role: "operator", userId: subject.userId, actsFor } }
        : { ok: false, refusal: "not-a-participant" };
    }
    case "bot":
      return ctx.participantTeamIds.has(subject.teamId)
        ? { ok: true, identity: { role: "bot", teamId: subject.teamId, actsFor: subject.teamId } }
        : { ok: false, refusal: "not-a-participant" };
    case "coach": {
      // Both halves, and in this order. A coach token is the one subject binding
      // a human *and* a team, so checking the team alone would admit any human at
      // all as coach of any participating team — which is what the snapshot's
      // coach designations exist to prevent. A coach need not be a *member* of
      // the team they watch, which is why `teamOfMember` cannot answer this and a
      // designation of its own is seeded.
      //
      // The participation check stays first and separate: a designation for a
      // team this game never registered earns nothing, and saying so as
      // `not-a-participant` keeps the two failures legible in the module log.
      //
      // spec: identity-and-authorization/coach-tokens
      // spec: identity-and-authorization/admission-validation#coach-absent-from-the-snapshot-refused
      if (!ctx.participantTeamIds.has(subject.teamId)) {
        return { ok: false, refusal: "not-a-participant" };
      }
      return ctx.coachTeams.get(subject.userId)?.has(subject.teamId)
        ? { ok: true, identity: { role: "coach", userId: subject.userId, viewsAs: subject.teamId } }
        : { ok: false, refusal: "not-a-coach" };
    }
  }
}

/**
 * An admitted identity as the instance records it.
 *
 * The union flattens to one shape because a table row is one shape. `teamId` is
 * the bound team under whichever reading the role gives it — the team an
 * operator or bot may act for, the team whose view a coach was granted — and is
 * empty for a spectator, which is bound to none. Nothing platform-side has a
 * field here, so no later reader can honour captaincy or admin standing even by
 * mistake (`role-bound-privileges#captaincy-invisible-in-game`).
 *
 * spec: identity-and-authorization/admission-records-private
 */
export interface AdmissionRow {
  readonly role: AdmittedIdentity["role"];
  /** The platform's durable id for the holder: the human, or the team for a bot. */
  readonly subjectId: string;
  readonly teamId: string;
}

export function admissionRow(identity: AdmittedIdentity): AdmissionRow {
  switch (identity.role) {
    case "operator":
      return { role: "operator", subjectId: identity.userId, teamId: identity.actsFor };
    case "bot":
      return { role: "bot", subjectId: identity.teamId, teamId: identity.teamId };
    case "spectator":
      return { role: "spectator", subjectId: identity.userId, teamId: "" };
    case "coach":
      return { role: "coach", subjectId: identity.userId, teamId: identity.viewsAs };
  }
}

/**
 * The team a connection may stage a mutation on behalf of, or `undefined` if it
 * may not mutate at all.
 *
 * `undefined` covers both ways a mutation is unauthorised, which is why they
 * are one function: a connection that was never admitted has no row
 * (`admission-validation#unadmitted-mutations-rejected`), and a spectator or
 * coach has a row whose role does not act
 * (`role-bound-privileges#spectator-and-coach-never-mutate`). The gameplay
 * reducers land with their own changes; this is the single question each of
 * them asks before writing, so authorisation is answered in one place rather
 * than re-derived per reducer.
 *
 * spec: identity-and-authorization/role-bound-privileges
 */
export function actingTeam(row: AdmissionRow | null | undefined): string | undefined {
  return row && (row.role === "operator" || row.role === "bot") ? row.teamId : undefined;
}
