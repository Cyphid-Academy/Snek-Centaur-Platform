// spec: identity-and-authorization/admission-validation,
//       identity-and-authorization/connect-time-validation,
//       identity-and-authorization/role-bound-privileges
// The connect-time decision, exercised as the pure value it is.
//
// `convex/auth/eligibility.test.ts` round-trips the encoder's output through
// this same `admit`, pinning the two spellings of the subject grammar against
// each other.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AdmissionContext,
  type AdmissionRefusal,
  type VerifiedToken,
  actingTeam,
  admissionRow,
  admit,
} from "./admission";

const GAME = "game-1";
const OTHER_GAME = "game-2";
const PLATFORM = "https://platform.example";
/**
 * A stranger who publishes a key set the host can resolve, and whose signatures
 * therefore verify. Everything about a token of theirs is well-formed; the only
 * thing wrong with it is who signed it.
 */
const STRANGER = "https://stranger.example";
const NOW = 1_700_000_000;
const LIFETIME = 15 * 60;

/**
 * Seeded state: the platform pinned, two participating teams, alice and bob on
 * the roster, and carol designated a coach of team-a without being on any team.
 */
function seededContext(overrides: Partial<AdmissionContext> = {}): AdmissionContext {
  return {
    platformIssuer: PLATFORM,
    gameId: GAME,
    participantTeamIds: new Set(["team-a", "team-b"]),
    teamOfMember: new Map([
      ["alice", "team-a"],
      ["bob", "team-b"],
    ]),
    coachTeams: new Map([
      ["carol", new Set(["team-a"])],
      // A team id in the human slot, so the coach case below that swaps the two
      // segments is refused by position rather than by carol's absence.
      ["team-b", new Set(["team-a"])],
    ]),
    nowSeconds: NOW,
    ...overrides,
  };
}

/** A token the host checked the signature of, valid unless overridden. */
function token(sub: string, overrides: Partial<VerifiedToken> = {}): VerifiedToken {
  return { iss: PLATFORM, aud: GAME, sub, exp: NOW + LIFETIME, ...overrides };
}

beforeEach(() => {
  // Every case in this file runs with the network stubbed to throw, so a reach
  // for it from any code path under test fails the run: admission decides from
  // seeded state alone, synchronously, with nothing awaited.
  // spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
  vi.stubGlobal("fetch", () => {
    throw new Error("admission must not reach the network");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// spec: identity-and-authorization/admission-validation
// spec: identity-and-authorization/role-bound-privileges
const admissions: ReadonlyArray<{
  sub: string;
  identity: Parameters<typeof admissionRow>[0];
  row: ReturnType<typeof admissionRow>;
  acting: string | undefined;
}> = [
  {
    // `actsFor` can only have come from the seeded roster — the subject names
    // no team. spec: identity-and-authorization/game-token-contents
    sub: "operator:alice",
    identity: { role: "operator", userId: "alice", actsFor: "team-a" },
    row: { role: "operator", subjectId: "alice", teamId: "team-a" },
    acting: "team-a",
  },
  {
    sub: "bot:team-b",
    identity: { role: "bot", teamId: "team-b", actsFor: "team-b" },
    row: { role: "bot", subjectId: "team-b", teamId: "team-b" },
    acting: "team-b",
  },
  {
    // carol is absent from the seeded snapshot entirely.
    // spec: identity-and-authorization/spectator-tokens#any-authenticated-human-may-request
    // spec: identity-and-authorization/role-bound-privileges#spectator-and-coach-never-mutate
    sub: "spectator:carol",
    identity: { role: "spectator", userId: "carol" },
    row: { role: "spectator", subjectId: "carol", teamId: "" },
    acting: undefined,
  },
  {
    // carol is on no team and still coaches team-a: the designation is
    // platform-side and never reaches the instance.
    // spec: identity-and-authorization/coach-tokens
    sub: "coach:carol:team-a",
    identity: { role: "coach", userId: "carol", viewsAs: "team-a" },
    row: { role: "coach", subjectId: "carol", teamId: "team-a" },
    acting: undefined,
  },
  {
    // The one place a user id and a team id travel side by side. With ordinary
    // fixtures a swapped encoder is caught because "carol" is no team; here
    // both segments are valid team ids, so only positional correctness keeps
    // the human out of the `viewsAs` slot.
    // spec: identity-and-authorization/game-token-contents#subject-alone-decides-the-role
    sub: "coach:team-b:team-a",
    identity: { role: "coach", userId: "team-b", viewsAs: "team-a" },
    row: { role: "coach", subjectId: "team-b", teamId: "team-a" },
    acting: undefined,
  },
];

// One property wrong per case, against the same context every admission above
// passes through — so each case fails for its named reason and nothing else.
// spec: identity-and-authorization/admission-validation
const refusalCases: ReadonlyArray<{
  name: string;
  token: VerifiedToken | undefined;
  refusal: AdmissionRefusal;
}> = [
  {
    // The host verifies the signature; a token that failed reaches `admit` as
    // `undefined`, which is the injected seam this suite constructs directly
    // rather than with a cryptographic fixture.
    name: "a token the host could not verify",
    token: undefined,
    refusal: "unverified",
  },
  {
    // **The check the old suite could not make.** The token below is signed,
    // and the host verified it — against the key set the *stranger* publishes,
    // resolved from the `iss` the stranger themselves chose. Every other claim
    // is exactly what an admissible operator's would be. An issuer-agnostic
    // instance admits it; only the pin refuses it, and it refuses on the issuer
    // rather than on anything the stranger wrote about alice.
    // spec: identity-and-authorization/verification-without-shared-secrets#a-valid-signature-from-a-stranger-is-refused
    name: "a token from an issuer that publishes resolvable material of its own",
    token: token("operator:alice", { iss: STRANGER }),
    refusal: "untrusted-issuer",
  },
  {
    // A `startsWith` in either direction hands an attacker an issuer of their
    // own choosing under the platform's name.
    name: "a token whose issuer extends the pinned one",
    token: token("operator:alice", { iss: `${PLATFORM}.attacker.example` }),
    refusal: "untrusted-issuer",
  },
  {
    // spec: identity-and-authorization/game-token-contents#token-names-its-game
    name: "a token issued for a different game",
    token: token("operator:alice", { aud: OTHER_GAME }),
    refusal: "wrong-game",
  },
  {
    // The three audience cases below each kill a distinct laxity a refactor
    // could introduce: startsWith in either direction, or a falsiness
    // short-circuit.
    // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
    name: "a token whose audience extends this game's id",
    token: token("operator:alice", { aud: `${GAME}0` }),
    refusal: "wrong-game",
  },
  {
    name: "a token whose audience is a prefix of this game's id",
    token: token("operator:alice", { aud: GAME.slice(0, -1) }),
    refusal: "wrong-game",
  },
  {
    name: "a token naming no game at all",
    token: token("operator:alice", { aud: "" }),
    refusal: "wrong-game",
  },
  {
    name: "a token past its expiry",
    token: token("operator:alice", { exp: NOW - 1 }),
    refusal: "expired",
  },
  {
    // `exp` is the instant the token stops being accepted, not the last
    // instant it is: the boundary is refused, so no off-by-one window exists.
    name: "a token expiring exactly now",
    token: token("operator:alice", { exp: NOW }),
    refusal: "expired",
  },
  {
    // An `exp <= now` gate fails OPEN on NaN: every comparison with NaN is
    // false, so such a token would never be expired and would admit forever.
    // JSON cannot spell NaN, but the host's guard is only
    // `typeof exp === "number"`, so any host-side coercion (`Number(...)` of a
    // missing or malformed claim) delivers exactly this.
    // spec: identity-and-authorization/game-token-contents
    name: "a token whose expiry is not a real instant",
    token: token("operator:alice", { exp: Number.NaN }),
    refusal: "expired",
  },
  {
    // spec: identity-and-authorization/admission-validation#unregistered-team-refused
    name: "a bot token binding a team not registered to this game",
    token: token("bot:team-z"),
    refusal: "not-a-participant",
  },
  {
    // Participation is checked before the designation, so a designation for a
    // team this game never registered is not a way in either.
    name: "a coach token viewing a team not registered to this game",
    token: token("coach:carol:team-z"),
    refusal: "not-a-participant",
  },
  {
    // spec: identity-and-authorization/admission-validation#coach-absent-from-the-snapshot-refused
    // The half the instance used to skip entirely. Every other fact about this
    // token is right — the role parses, the team participates, the expiry is
    // ahead — and dave is simply not a coach of it. Without the designation
    // check, `coach:<anyone>:<any participating team>` was admissible.
    name: "a coach token naming a human the snapshot records as no coach at all",
    token: token("coach:dave:team-a"),
    refusal: "not-a-coach",
  },
  {
    // Designated for team-a and asking for team-b: a designation is per team,
    // so holding one is not standing over the whole roster.
    name: "a coach token for a participating team the named human does not coach",
    token: token("coach:carol:team-b"),
    refusal: "not-a-coach",
  },
  {
    // A roster *member* is not thereby a coach: the two relations are seeded
    // separately, and reading one for the other would make every operator a
    // coach of their own team.
    name: "a coach token naming a roster member who holds no coach designation",
    token: token("coach:alice:team-a"),
    refusal: "not-a-coach",
  },
  {
    // spec: identity-and-authorization/admission-validation#operator-absent-from-the-snapshot-refused
    name: "an operator token naming a human the roster snapshot does not record",
    token: token("operator:mallory"),
    refusal: "not-a-participant",
  },
  // User ids and team ids share one string type, so nothing but the lookup
  // itself keeps an id presented in the wrong role's slot worthless. Both ids
  // below are genuine in their own namespace and present in the seeded
  // snapshot; only the namespace is wrong. Mutation testing showed each check
  // could be widened to match the other namespace without a failure anywhere.
  {
    name: "an operator subject naming a participating team id as the human",
    token: token("operator:team-a"),
    refusal: "not-a-participant",
  },
  {
    name: "a bot subject naming a roster member's user id as the team",
    token: token("bot:alice"),
    refusal: "not-a-participant",
  },
  {
    // Whitespace survives the parse but matches no snapshot entry: "alice " is
    // simply nobody, and nobody is not a participant.
    name: "an operator id with trailing whitespace",
    token: token("operator:alice "),
    refusal: "not-a-participant",
  },
];

// Subjects that parse to no role at all. Refusing these rather than guessing is
// what keeps the subject grammar a closed agreement between the platform's
// writer and this reader.
const malformedSubjects: ReadonlyArray<{ name: string; sub: string }> = [
  { name: "an empty subject", sub: "" },
  { name: "a role with no identifier", sub: "operator" },
  { name: "a role with an empty identifier", sub: "operator:" },
  { name: "an empty role", sub: ":alice" },
  { name: "an unknown role", sub: "referee:alice" },
  // Platform-side standing has no in-game spelling at all.
  { name: "a platform-side role", sub: "captain:alice" },
  { name: "an operator subject carrying a team", sub: "operator:alice:team-a" },
  { name: "a spectator subject with a trailing segment", sub: "spectator:carol:extra" },
  { name: "a bot subject with a trailing segment", sub: "bot:team-a:extra" },
  { name: "a coach subject missing its team", sub: "coach:carol" },
  { name: "a coach subject with an empty team", sub: "coach:carol:" },
  { name: "a coach subject with an empty user", sub: "coach::team-a" },
  // Every role's segment count is exact. The coach case matters separately
  // because coach is the one three-segment grammar, where "at least three"
  // would silently accept.
  { name: "a coach subject with a trailing segment", sub: "coach:carol:team-a:extra" },
  // The grammar is case-sensitive: a role is a token the platform spelled, not
  // a word to be recognised, so a case-folding "convenience" in the reader
  // would widen what counts as a valid token without the writer's say.
  { name: "an uppercased role", sub: "OPERATOR:alice" },
  { name: "a capitalised role", sub: "Spectator:carol" },
  // Look-alikes that a human reviewer reads as valid: a Cyrillic о in
  // "оperator", a fullwidth ： that is not the delimiter and so leaves the
  // whole string one segment, and a leading space no trimming step removes.
  { name: "a homoglyph role", sub: "оperator:alice" },
  { name: "a fullwidth-colon delimiter", sub: "operator：alice" },
  { name: "a role with leading whitespace", sub: " operator:alice" },
];

describe("admission decides the identity, the recorded row, and what may act", () => {
  it.each(admissions)(
    "admits $sub as a $identity.role bound to '$row.teamId', acting for $acting",
    ({ sub, identity, row, acting }) => {
      const decision = admit(token(sub), seededContext());

      expect(decision).toEqual({ ok: true, identity });
      // The row is what every later reader consults, and `actingTeam` is the
      // single question a gameplay reducer asks: the flattening must lose
      // nothing an authorisation depends on, and must not hand a read-only
      // role a team to act for.
      expect(admissionRow(identity)).toEqual(row);
      expect(actingTeam(row)).toBe(acting);
    },
  );

  it("refuses mutation for a connection that was never admitted", () => {
    // No row is the same `undefined` as a read-only row: the gameplay reducers
    // ask one question, and both ways of being unauthorised answer it.
    // spec: identity-and-authorization/admission-validation#unadmitted-mutations-rejected
    expect(actingTeam(null)).toBeUndefined();
    expect(actingTeam(undefined)).toBeUndefined();
  });
});

describe("each admission check refuses independently", () => {
  it.each(refusalCases)("refuses $name", ({ token: presented, refusal }) => {
    expect(admit(presented, seededContext())).toEqual({ ok: false, refusal });
  });

  it.each(malformedSubjects)("refuses $name as malformed", ({ sub }) => {
    expect(admit(token(sub), seededContext())).toEqual({
      ok: false,
      refusal: "malformed-subject",
    });
  });

  it("checks the game binding before anything the token says about its holder", () => {
    // Wrong on every axis at once, and refused on the audience alone.
    // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
    const everythingWrong = token("nonsense", { aud: OTHER_GAME, exp: NOW - LIFETIME });
    expect(admit(everythingWrong, seededContext())).toEqual({
      ok: false,
      refusal: "wrong-game",
    });
  });

  it("checks the issuer before the game binding, and so before every other claim", () => {
    // The same token that is refused `wrong-game` above, now also from a
    // stranger. The refusal moves to the issuer, which is the ordering the
    // requirement fixes: what a token says is a statement by whoever signed it,
    // so "who signed this" is answered before any of it is read.
    //
    // Asserted as a *change of answer* rather than as an isolated fact, because
    // an implementation that checked the issuer last would satisfy the isolated
    // case and fail this one.
    // spec: identity-and-authorization/verification-without-shared-secrets#a-valid-signature-from-a-stranger-is-refused
    // spec: identity-and-authorization/admission-validation
    const fromAStranger = token("nonsense", {
      iss: STRANGER,
      aud: OTHER_GAME,
      exp: NOW - LIFETIME,
    });
    expect(admit(fromAStranger, seededContext())).toEqual({
      ok: false,
      refusal: "untrusted-issuer",
    });
  });

  // Seeds no well-behaved writer produces: nothing anywhere enforces that the
  // game's two seeded tables agree, so these are the refusals that must hold
  // when the surrounding assumptions do not.
  it.each([
    {
      // The uninitialised instance's pin is "" for the same reason its game
      // binding is, and fails in the same direction: a token claiming no issuer
      // would *match* an empty pin by plain equality, so emptiness is refused
      // explicitly rather than left to the accident that no real token spells
      // it. This is the one that decides whether an instance that has not been
      // initialised yet is closed or wide open.
      // spec: identity-and-authorization/verification-without-shared-secrets#a-valid-signature-from-a-stranger-is-refused
      name: "an uninitialised instance, even by a token naming no issuer",
      ctx: { platformIssuer: "" },
      token: token("operator:alice", { iss: "" }),
      refusal: "untrusted-issuer" as AdmissionRefusal,
    },
    {
      name: "an uninitialised instance presented a genuinely platform-signed token",
      ctx: { platformIssuer: "" },
      token: token("operator:alice"),
      refusal: "untrusted-issuer" as AdmissionRefusal,
    },
    {
      // The connection hook seeds `gameId` as "" until `initialize_game` runs.
      // A token naming the empty audience would *match* that empty binding by
      // plain equality, so the uninitialised instance is refused explicitly
      // rather than by the accident that no real token spells it.
      // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
      name: "an uninitialised instance, even by a token naming no game",
      ctx: { gameId: "" },
      token: token("operator:alice", { aud: "" }),
      refusal: "wrong-game" as AdmissionRefusal,
    },
    {
      name: "an uninitialised instance presented a real game's token",
      ctx: { gameId: "" },
      token: token("operator:alice"),
      refusal: "wrong-game" as AdmissionRefusal,
    },
    {
      // Two facts, so the team the roster map names is checked against the
      // participant set rather than assumed to be in it.
      // spec: identity-and-authorization/admission-validation#operator-absent-from-the-snapshot-refused
      name: "an operator whose roster team is not a registered participant",
      ctx: { teamOfMember: new Map([["alice", "team-z"]]) },
      token: token("operator:alice"),
      refusal: "not-a-participant" as AdmissionRefusal,
    },
    {
      // An empty team id names no team, so a degenerate roster row must not
      // admit its member — and must not hand `actingTeam` an empty-string team
      // for later equality checks to misread.
      name: "an operator whose roster entry names the empty string as a team",
      ctx: { teamOfMember: new Map([["alice", ""]]) },
      token: token("operator:alice"),
      refusal: "not-a-participant" as AdmissionRefusal,
    },
  ])("refuses $name", ({ ctx, token: presented, refusal }) => {
    expect(admit(presented, seededContext(ctx))).toEqual({ ok: false, refusal });
  });
});

describe("rejection happens before any state could be touched", () => {
  // Totality is what this suite can prove — every adversarial input yields a
  // decision, never a throw — and freezing the inputs turns any attempted
  // mutation into a TypeError the same assertion would catch.
  // spec: identity-and-authorization/admission-validation#reject-before-touching-state
  const adversarialInputs: ReadonlyArray<VerifiedToken | undefined> = [
    ...refusalCases.map((c) => c.token),
    ...malformedSubjects.map((c) => token(c.sub)),
    {
      iss: PLATFORM,
      aud: GAME,
      sub: "operator:alice",
      exp: NOW + LIFETIME,
      extra: {},
    } as VerifiedToken,
  ];

  it("returns a decision for every adversarial input and never throws", () => {
    for (const input of adversarialInputs) {
      const frozen = input === undefined ? undefined : Object.freeze({ ...input });
      let decision: ReturnType<typeof admit> | undefined;
      expect(() => {
        decision = admit(frozen, seededContext());
      }).not.toThrow();
      // A decision, not merely a return: `ok` is a boolean and a refusal names
      // its reason, so the connection hook always has something to act on.
      expect(typeof decision?.ok).toBe("boolean");
      if (decision && !decision.ok) expect(decision.refusal).toBeTypeOf("string");
    }
  });

  it("leaves the seeded context untouched by admitted and refused decisions alike", () => {
    // spec: global-invariants/game-instance-hermeticity#seeded-once-never-refreshed
    const ctx = seededContext();
    const teamsBefore = [...ctx.participantTeamIds];
    const rosterBefore = [...ctx.teamOfMember];
    const coachesBefore = [...ctx.coachTeams].map(([user, teams]) => [user, [...teams]]);
    for (const input of adversarialInputs) admit(input, ctx);
    admit(token("operator:alice"), ctx);
    admit(token("coach:carol:team-a"), ctx);
    expect([...ctx.participantTeamIds]).toEqual(teamsBefore);
    expect([...ctx.teamOfMember]).toEqual(rosterBefore);
    expect([...ctx.coachTeams].map(([user, teams]) => [user, [...teams]])).toEqual(coachesBefore);
  });
});

describe("validation happens exactly once, at connection time", () => {
  // spec: identity-and-authorization/connect-time-validation#expiry-never-disconnects
  it("leaves an admitted identity nothing an expiry could later act on", () => {
    // Nothing downstream of admission can even ask whether the token has
    // expired, because the expiry did not survive it.
    const decision = admit(token("operator:alice", { exp: NOW + 1 }), seededContext());
    if (!decision.ok) throw new Error("expected admission");
    expect(Object.keys(decision.identity).sort()).toEqual(["actsFor", "role", "userId"]);
    // The connection's whole in-game authority after admission is the row and
    // `actingTeam`, and neither takes a timestamp.
    expect(actingTeam(admissionRow(decision.identity))).toBe("team-a");
  });

  // spec: identity-and-authorization/connect-time-validation#reconnect-revalidates
  it("revalidates a reconnect afresh and refuses it once the token has lapsed", () => {
    const presented = token("operator:alice");
    expect(admit(presented, seededContext()).ok).toBe(true);
    expect(admit(presented, seededContext({ nowSeconds: NOW + LIFETIME + 1 }))).toEqual({
      ok: false,
      refusal: "expired",
    });
  });
});

describe("the subject alone decides the role", () => {
  // spec: identity-and-authorization/game-token-contents#subject-alone-decides-the-role
  // spec: identity-and-authorization/role-bound-privileges#captaincy-invisible-in-game
  // The runtime affords other claims, and the widening cast below is the
  // adversarial delivery: the contradicting values really are present on the
  // object `admit` receives.
  it.each([
    {
      name: "a spectator whose other claims say operator",
      sub: "spectator:carol",
      claims: { role: "operator", team: "team-a", actsFor: "team-a", scope: "admin" },
    },
    {
      name: "an operator whose other claims say spectator",
      sub: "operator:bob",
      claims: { role: "spectator", readonly: true },
    },
    {
      name: "a captain's or admin's operator token",
      sub: "operator:alice",
      claims: { captain: true, admin: true, platformRole: "admin" },
    },
    {
      name: "a captain's or admin's coach token",
      sub: "coach:carol:team-a",
      claims: { captain: true, admin: true, platformRole: "admin" },
    },
  ])("decides $name exactly as the same subject with no such claims", ({ sub, claims }) => {
    const lying = { ...token(sub), ...claims } as VerifiedToken;

    expect(admit(lying, seededContext())).toEqual(admit(token(sub), seededContext()));
  });
});
