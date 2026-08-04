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
// Everything it consults is seeded at initialisation — the game's own id and
// its roster snapshot — so a hermetic instance answers admission alone, with no
// per-connection external call (`verification-without-shared-secrets#instance-validates-alone`).
// Signature verification is the host's, against the platform's published
// material obtained at startup; a token the host could not verify arrives here
// as `undefined`, which is the same refusal as any other.
//
// The `sub` encoding is written by the platform, in
// `packages/convex-host/convex/auth/subject.ts`, and read only here. This
// package must not import Convex, so the grammar is restated rather than
// shared; keeping the platform side write-only holds the spellings to two
// rather than four, and `convex/auth/eligibility.test.ts` round-trips the
// encoder's output through `admit`, so a drift between them fails there.

/** The claims of a token the host has already verified. */
export interface VerifiedToken {
  /** The game the token grants admission to; nothing else is a valid audience. */
  readonly aud: string;
  readonly sub: string;
  /** Seconds since the epoch. */
  readonly exp: number;
}

/** State seeded at initialisation, and the connection-time clock. */
export interface AdmissionContext {
  readonly gameId: string;
  /** Centaur Teams registered as participants of this game. */
  readonly participantTeamIds: ReadonlySet<string>;
  /** Roster snapshot, member user id to their participating team. */
  readonly teamOfMember: ReadonlyMap<string, string>;
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
  | "wrong-game"
  | "expired"
  | "malformed-subject"
  | "not-a-participant";

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
  // The audience binding is checked before anything else about the token is
  // considered — spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused.
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

  const segments = token.sub.split(":");
  const [role, first, second] = segments;
  const parts = segments.length;
  if (!first) return { ok: false, refusal: "malformed-subject" };
  if (role === "spectator" && parts === 2) return { ok: true, identity: { role, userId: first } };
  if (role === "operator" && parts === 2) {
    // An operator's team is not in the subject: the seeded roster snapshot
    // already keys it by user id. The scenario asks for a human recorded "on a
    // participating team", which is two facts and not one — so the team the
    // snapshot names is checked against the participant set rather than assumed
    // to be in it. Nothing yet writes these two tables together (`initialize_game`
    // belongs to migrate-game-lifecycle), so a seed that disagreed with itself
    // would otherwise admit an operator acting for a team this game never
    // registered.
    // spec: identity-and-authorization/admission-validation#operator-absent-from-the-snapshot-refused
    const actsFor = ctx.teamOfMember.get(first);
    return actsFor && ctx.participantTeamIds.has(actsFor)
      ? { ok: true, identity: { role, userId: first, actsFor } }
      : { ok: false, refusal: "not-a-participant" };
  }
  if (role === "bot" && parts === 2) {
    return ctx.participantTeamIds.has(first)
      ? { ok: true, identity: { role, teamId: first, actsFor: first } }
      : { ok: false, refusal: "not-a-participant" };
  }
  if (role === "coach" && parts === 3 && second) {
    // A coach need not be a member of the team they watch, so only the team's
    // participation is checkable here — spec: identity-and-authorization/coach-tokens.
    return ctx.participantTeamIds.has(second)
      ? { ok: true, identity: { role, userId: first, viewsAs: second } }
      : { ok: false, refusal: "not-a-participant" };
  }
  return { ok: false, refusal: "malformed-subject" };
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
