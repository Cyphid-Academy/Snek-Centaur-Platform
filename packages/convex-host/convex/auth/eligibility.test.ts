import { type AdmissionContext, type AdmittedIdentity, admit } from "@cyphid/snek-stdb";
import { type GameSubject, encodeGameSubject } from "@cyphid/snek-stdb/subject";
// spec: identity-and-authorization/participant-token-eligibility,
//       identity-and-authorization/spectator-tokens,
//       identity-and-authorization/coach-tokens,
//       identity-and-authorization/live-game-issuance,
//       identity-and-authorization/roster-snapshot-binding,
//       identity-and-authorization/game-token-contents,
//       identity-and-authorization/platform-admin-role
// Who earns a game access token, and what the token's subject then means.
//
// The subject tests reach across the package boundary into `@cyphid/snek-stdb`
// on purpose: the grammar is one codec now, but *what a subject earns* is still
// decided on two sides — issuance mints from the game record, admission decides
// from the seeded snapshot — and nothing else fails when those two drift. What
// the reader does with a malformed or unvouched subject is `admission.test.ts`'s
// business.
import { describe, expect, it } from "vitest";
import {
  type GameForIssuance,
  type IssuanceDecision,
  type IssuanceRefusal,
  type TokenRequest,
  decideGameTokenIssuance,
} from "./eligibility";

// One game, two participating teams, frozen at initialization. `dave` matters
// later: the roster-snapshot tests turn on team records having moved since.
const teamA = {
  teamId: "teamA",
  memberUserIds: ["alice", "dave"],
  coachUserIds: ["carol"],
} as const;
const teamB = { teamId: "teamB", memberUserIds: ["bob"], coachUserIds: [] } as const;

const gameAt = (status: GameForIssuance["status"]): GameForIssuance => ({
  gameId: "g1",
  status,
  roster: [teamA, teamB],
});
const playing = gameAt("playing");

/** What the platform stamps on what it signs, as this file's instance pins it. */
const PLATFORM_ISSUER = "https://platform.example";

/**
 * The same world as a game instance would be seeded with it, for the
 * cross-package round-trips — *derived from the very snapshot issuance decides
 * from*, rather than restated beside it.
 *
 * Derived because the two sides are one fact seen twice: `roster-snapshot-binding`
 * requires the instance's seed to be the snapshot, and a hand-written seed
 * agreeing with it today is a seed that can quietly stop agreeing. It is what
 * `initialize_game` will do for real when migrate-game-lifecycle lands, written
 * here as the one place both shapes are already in scope.
 *
 * spec: identity-and-authorization/roster-snapshot-binding
 */
function seedFrom(game: GameForIssuance): AdmissionContext {
  const teamOfMember = new Map<string, string>();
  const coachTeams = new Map<string, Set<string>>();
  for (const team of game.roster) {
    for (const userId of team.memberUserIds) teamOfMember.set(userId, team.teamId);
    for (const userId of team.coachUserIds) {
      coachTeams.set(userId, (coachTeams.get(userId) ?? new Set()).add(team.teamId));
    }
  }
  return {
    platformIssuer: PLATFORM_ISSUER,
    gameId: game.gameId,
    participantTeamIds: new Set(game.roster.map((team) => team.teamId)),
    teamOfMember,
    coachTeams,
    nowSeconds: 1_000,
  };
}

const seeded: AdmissionContext = seedFrom(playing);
const asToken = (sub: string) => ({ iss: PLATFORM_ISSUER, aud: "g1", sub, exp: 2_000 });

/** Narrow a decision to its subject, failing loudly on an unexpected refusal. */
function granted(decision: IssuanceDecision): GameSubject {
  if (!decision.ok) throw new Error(`expected issuance, got refusal: ${decision.refusal}`);
  return decision.subject;
}

const refused = (refusal: IssuanceRefusal) => ({ ok: false, refusal }) as const;

describe("the subject issuance mints is the subject admission understands", () => {
  // spec: identity-and-authorization/game-token-contents#subject-alone-decides-the-role
  // spec: identity-and-authorization/identity-kinds#participants-are-derived
  // The full pipeline, decision to admitted identity, with no hand-built
  // subject in between. The spectator is a stranger to every roster and the
  // coach views a team she is no member of — both admissions are correct, and
  // both would be the first thing an over-eager membership check on the parser
  // side broke.
  const pipeline: ReadonlyArray<{
    name: string;
    request: TokenRequest;
    identity: AdmittedIdentity;
  }> = [
    {
      name: "operator",
      request: { role: "operator", userId: "dave" },
      identity: { role: "operator", userId: "dave", actsFor: "teamA" },
    },
    {
      name: "spectator",
      request: { role: "spectator", userId: "stranger" },
      identity: { role: "spectator", userId: "stranger" },
    },
    {
      name: "coach",
      request: { role: "coach", userId: "carol", teamId: "teamA" },
      identity: { role: "coach", userId: "carol", viewsAs: "teamA" },
    },
    {
      name: "bot",
      request: { role: "bot", credentialTeamId: "teamB", credentialGameId: "g1" },
      identity: { role: "bot", teamId: "teamB", actsFor: "teamB" },
    },
  ];

  it.each(pipeline)(
    "carries a $name from issuance through admission intact",
    ({ request, identity }) => {
      const subject = granted(decideGameTokenIssuance(playing, request));
      expect(admit(asToken(encodeGameSubject(subject)), seeded)).toEqual({ ok: true, identity });
    },
  );

  it("mints an admin's implicit coach token that only the snapshot can get admitted", () => {
    // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
    // spec: identity-and-authorization/role-bound-privileges#captaincy-invisible-in-game
    // spec: identity-and-authorization/admission-validation#coach-absent-from-the-snapshot-refused
    // **The seam the waiver has to cross, and cannot cross by itself.** Admin
    // standing is read live at issuance and is deliberately invisible on the
    // wire — the subject below is indistinguishable from a designated coach's —
    // so the instance, which honours no platform-side role, has nothing to go on
    // but its snapshot. A waiver the snapshot does not also carry therefore
    // mints a token refused at the door.
    //
    // Which fixes the obligation `initialize_game` inherits with
    // migrate-game-lifecycle: the snapshot it takes records the admins standing
    // at that moment among each team's coaches, and thereafter
    // `roster-snapshot-binding` is what governs — an admin designated after a
    // game was sealed coaches the next game, not this one.
    const subject = granted(
      decideGameTokenIssuance(
        playing,
        { role: "coach", userId: "stranger", teamId: "teamB" },
        true,
      ),
    );
    expect(encodeGameSubject(subject)).toBe("coach:stranger:teamB");

    const presented = asToken(encodeGameSubject(subject));
    expect(admit(presented, seeded)).toEqual({ ok: false, refusal: "not-a-coach" });
    const withAdminRecorded = seedFrom({
      ...playing,
      roster: [teamA, { ...teamB, coachUserIds: ["stranger"] }],
    });
    expect(admit(presented, withAdminRecorded)).toEqual({
      ok: true,
      identity: { role: "coach", userId: "stranger", viewsAs: "teamB" },
    });
  });

  it("puts no team on the wire for an operator or spectator", () => {
    // spec: identity-and-authorization/game-token-contents
    // spec: identity-and-authorization/spectator-tokens#no-team-binding
    // The type makes the team field unrepresentable, but the wire string is
    // what actually leaves the platform, so pin it there too: two segments, and
    // no team id anywhere in them.
    for (const sub of [
      encodeGameSubject({ role: "operator", userId: "alice" }),
      encodeGameSubject({ role: "spectator", userId: "alice" }),
    ]) {
      expect(sub.split(":")).toHaveLength(2);
      expect(sub).not.toContain("teamA");
      expect(sub).not.toContain("teamB");
    }
  });

  it("derives the operator's team from the seeded snapshot, not the token", () => {
    // spec: identity-and-authorization/game-token-contents
    // spec: identity-and-authorization/roster-snapshot-binding
    // The same operator subject arrives at two instances whose snapshots
    // disagree about alice's team, and acts for a different team at each.
    const sub = encodeGameSubject({ role: "operator", userId: "alice" });
    const rehomed: AdmissionContext = { ...seeded, teamOfMember: new Map([["alice", "teamB"]]) };

    expect(admit(asToken(sub), seeded)).toEqual({
      ok: true,
      identity: { role: "operator", userId: "alice", actsFor: "teamA" },
    });
    expect(admit(asToken(sub), rehomed)).toEqual({
      ok: true,
      identity: { role: "operator", userId: "alice", actsFor: "teamB" },
    });
  });

  it.each([
    { name: "a user id", subject: { role: "operator", userId: "alice:teamB" } as GameSubject },
    { name: "a team id", subject: { role: "bot", teamId: "teamA:teamB" } as GameSubject },
  ])("degrades to refusal when a colon is smuggled through $name", ({ subject }) => {
    // Ids never contain a colon by platform invariant; if one ever did, the
    // encoder would emit a string whose arity no role accepts. Injection
    // through an id degrades to refusal, never to a different binding.
    expect(admit(asToken(encodeGameSubject(subject)), seeded)).toEqual({
      ok: false,
      refusal: "malformed-subject",
    });
  });
});

describe("issuance refuses every role for a game not being played", () => {
  // spec: identity-and-authorization/live-game-issuance#no-tokens-for-finished-games
  // spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
  // Status is the one fact re-read per request. Each requester below is fully
  // eligible — the pipeline table above issues to all four — and the bot row
  // stands for a game credential that is still cryptographically valid: none of
  // that confers anything toward a game that has ended or not begun.
  const eligibleRequests: ReadonlyArray<{ name: string; request: TokenRequest }> = [
    { name: "operator", request: { role: "operator", userId: "alice" } },
    { name: "spectator", request: { role: "spectator", userId: "stranger" } },
    { name: "coach", request: { role: "coach", userId: "carol", teamId: "teamA" } },
    { name: "bot", request: { role: "bot", credentialTeamId: "teamA", credentialGameId: "g1" } },
  ];

  it.each(
    eligibleRequests.flatMap((row) =>
      (["not-started", "finished"] as const).map((status) => ({ ...row, status })),
    ),
  )("refuses an eligible $name for a $status game", ({ request, status }) => {
    expect(decideGameTokenIssuance(gameAt(status), request)).toEqual(
      refused("game-not-being-played"),
    );
  });

  it("waives a coach designation for an admin, never liveness", () => {
    // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
    // The one request the waiver grants against a playing game is refused for a
    // finished one on status alone.
    const request: TokenRequest = { role: "coach", userId: "stranger", teamId: "teamA" };

    expect(decideGameTokenIssuance(playing, request, true).ok).toBe(true);
    expect(decideGameTokenIssuance(gameAt("finished"), request, true)).toEqual(
      refused("game-not-being-played"),
    );
  });
});

describe("operator tokens", () => {
  // spec: identity-and-authorization/participant-token-eligibility#operator-outside-roster-refused
  // spec: identity-and-authorization/platform-admin-role#no-write-path-into-live-games
  // Membership of a participating team, per the snapshot, is the whole test.
  // `xander` is teamX's member in current team records; teamX is simply not in
  // this game.
  it.each<{ name: string; userId: string; admin: boolean; ok: boolean }>([
    { name: "a member of a participating team", userId: "alice", admin: false, ok: true },
    { name: "a member of the other participating team", userId: "bob", admin: false, ok: true },
    { name: "an admin who is also a member", userId: "alice", admin: true, ok: true },
    { name: "a designated coach who is not a member", userId: "carol", admin: false, ok: false },
    { name: "an admin coach who is not a member", userId: "carol", admin: true, ok: false },
    { name: "a member of a non-participating team", userId: "xander", admin: false, ok: false },
    { name: "an admin outside every roster", userId: "stranger", admin: true, ok: false },
    { name: "a human outside every roster", userId: "stranger", admin: false, ok: false },
    // A team id in the human's slot: user ids and team ids share one string
    // type, so only the lookup's namespace keeps a genuine id worthless in the
    // wrong slot. Mutation testing showed this check could be widened to match
    // teams too without a failure anywhere.
    {
      name: "a participating team's own id as the human",
      userId: "teamA",
      admin: false,
      ok: false,
    },
  ])("$name: issued=$ok", ({ userId, admin, ok }) => {
    const decision = decideGameTokenIssuance(playing, { role: "operator", userId }, admin);
    if (ok) {
      const subject = granted(decision);
      expect(subject).toEqual({ role: "operator", userId });
      // Checked at runtime and not just by the type.
      expect("teamId" in subject).toBe(false);
    } else {
      expect(decision).toEqual(refused("not-on-a-participating-team"));
    }
  });
});

describe("spectator tokens", () => {
  // spec: identity-and-authorization/spectator-tokens#any-authenticated-human-may-request
  // spec: identity-and-authorization/spectator-tokens#no-team-binding
  // The subject never carries a team, whatever standing the requester has that
  // a team could be inferred from.
  it.each([
    { name: "a roster member", userId: "alice", admin: false },
    { name: "a designated coach", userId: "carol", admin: false },
    { name: "a member of a non-participating team", userId: "xander", admin: false },
    { name: "a stranger to every roster", userId: "stranger", admin: false },
    { name: "an admin", userId: "stranger", admin: true },
  ])("issues to $name with no team binding", ({ userId, admin }) => {
    const subject = granted(decideGameTokenIssuance(playing, { role: "spectator", userId }, admin));

    expect(subject).toEqual({ role: "spectator", userId });
    expect("teamId" in subject).toBe(false);
  });

  it("issues for a playing game with an empty roster, where an operator earns nothing", () => {
    // spec: identity-and-authorization/spectator-tokens#any-authenticated-human-may-request
    // spec: identity-and-authorization/participant-token-eligibility#operator-outside-roster-refused
    // Spectating consults the roster not at all — a gate that quietly required
    // a non-empty roster would refuse every spectator of a game whose
    // participants happen to be seeded elsewhere, and nothing in the populated
    // fixtures would notice. With no participating teams there is nobody to
    // operate for, so the same human's operator request is refused.
    const empty: GameForIssuance = { gameId: "g1", status: "playing", roster: [] };

    expect(granted(decideGameTokenIssuance(empty, { role: "spectator", userId: "alice" }))).toEqual(
      {
        role: "spectator",
        userId: "alice",
      },
    );
    expect(decideGameTokenIssuance(empty, { role: "operator", userId: "alice" })).toEqual(
      refused("not-on-a-participating-team"),
    );
  });
});

describe("coach tokens", () => {
  // spec: identity-and-authorization/coach-tokens
  // spec: identity-and-authorization/coach-tokens#coach-of-nonparticipating-team-refused
  // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
  // spec: identity-and-authorization/platform-admin-role#role-effective-without-reload
  // The admin waiver applies to the designation only: `xena` genuinely coaches
  // teamX in current team records, and neither she nor an admin gets a token
  // for it, because teamX is not in this game. The stranger rows are the same
  // request either side of the designation's current value — read per request,
  // so granting or revoking it changes the very next answer with no session or
  // reload in between.
  it.each<{ name: string; userId: string; teamId: string; admin: boolean; ok: boolean }>([
    {
      name: "the designated coach of a participating team",
      userId: "carol",
      teamId: "teamA",
      admin: false,
      ok: true,
    },
    {
      name: "a coach of one team asking for the other",
      userId: "carol",
      teamId: "teamB",
      admin: false,
      ok: false,
    },
    {
      name: "a member who is not a coach",
      userId: "alice",
      teamId: "teamA",
      admin: false,
      ok: false,
    },
    { name: "a stranger", userId: "stranger", teamId: "teamA", admin: false, ok: false },
    {
      name: "an admin with no designation anywhere",
      userId: "stranger",
      teamId: "teamA",
      admin: true,
      ok: true,
    },
    {
      name: "a genuine coach of a non-participating team",
      userId: "xena",
      teamId: "teamX",
      admin: false,
      ok: false,
    },
    {
      name: "an admin toward a non-participating team",
      userId: "stranger",
      teamId: "teamX",
      admin: true,
      ok: false,
    },
    // A roster member's user id in the team slot resolves against no team, for
    // an admin as much as anyone: the waiver crosses a designation, never a
    // namespace.
    {
      name: "a roster member's user id as the team",
      userId: "carol",
      teamId: "alice",
      admin: false,
      ok: false,
    },
    {
      name: "a roster member's user id as the team, admin set",
      userId: "carol",
      teamId: "alice",
      admin: true,
      ok: false,
    },
  ])("$name: issued=$ok", ({ userId, teamId, admin, ok }) => {
    const decision = decideGameTokenIssuance(playing, { role: "coach", userId, teamId }, admin);
    if (ok) {
      expect(granted(decision)).toEqual({ role: "coach", userId, teamId });
    } else {
      expect(decision).toEqual(refused("not-a-coach-of-a-participating-team"));
    }
  });

  it("defaults to not-admin when the caller passes no designation", () => {
    // spec: identity-and-authorization/platform-admin-role#powers-are-expressly-granted
    // The safe default: forgetting to plumb the designation denies, never grants.
    expect(
      decideGameTokenIssuance(playing, { role: "coach", userId: "stranger", teamId: "teamA" }),
    ).toEqual(refused("not-a-coach-of-a-participating-team"));
  });
});

describe("bot tokens", () => {
  // spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
  // Admin standing is a human designation; it means nothing on a bot path, so
  // it flips no refusal below. The user-id-as-team row is the namespace
  // confusion the operator table's rationale covers.
  it.each<{
    name: string;
    credentialTeamId: string;
    credentialGameId: string;
    admin: boolean;
    ok: boolean;
  }>([
    {
      name: "a participating team's credential for this game",
      credentialTeamId: "teamA",
      credentialGameId: "g1",
      admin: false,
      ok: true,
    },
    {
      name: "the other participating team's credential",
      credentialTeamId: "teamB",
      credentialGameId: "g1",
      admin: false,
      ok: true,
    },
    {
      name: "a credential for a different game",
      credentialTeamId: "teamA",
      credentialGameId: "g2",
      admin: false,
      ok: false,
    },
    {
      name: "a credential for a non-participating team",
      credentialTeamId: "teamX",
      credentialGameId: "g1",
      admin: false,
      ok: false,
    },
    {
      name: "a non-participating team's credential, admin set",
      credentialTeamId: "teamX",
      credentialGameId: "g1",
      admin: true,
      ok: false,
    },
    {
      name: "a roster member's user id as the team",
      credentialTeamId: "alice",
      credentialGameId: "g1",
      admin: false,
      ok: false,
    },
  ])("$name: issued=$ok", ({ credentialTeamId, credentialGameId, admin, ok }) => {
    const decision = decideGameTokenIssuance(
      playing,
      { role: "bot", credentialTeamId, credentialGameId },
      admin,
    );
    if (ok) {
      expect(granted(decision)).toEqual({ role: "bot", teamId: credentialTeamId });
    } else {
      expect(decision).toEqual(refused("credential-not-for-this-game"));
    }
  });
});

describe("issuance follows the snapshot when current team records contradict it", () => {
  // spec: identity-and-authorization/roster-snapshot-binding#running-game-reads-only-the-snapshot
  // Team records mutated mid-game: `dave` was removed from teamA, `eve` joined
  // it, and `frank` was designated a coach — none of it in the `playing`
  // fixture, which is the initialization snapshot. Each row is therefore an
  // answer current team records would have given differently.
  it.each<{ name: string; request: TokenRequest; ok: boolean; refusal: IssuanceRefusal }>([
    {
      name: "still issues to the member current records say was removed",
      request: { role: "operator", userId: "dave" },
      ok: true,
      refusal: "not-on-a-participating-team",
    },
    {
      name: "refuses the member current records say was added",
      request: { role: "operator", userId: "eve" },
      ok: false,
      refusal: "not-on-a-participating-team",
    },
    {
      name: "refuses the coach designated after initialization",
      request: { role: "coach", userId: "frank", teamId: "teamA" },
      ok: false,
      refusal: "not-a-coach-of-a-participating-team",
    },
  ])("$name", ({ request, ok, refusal }) => {
    const decision = decideGameTokenIssuance(playing, request);
    if (ok) expect(decision.ok).toBe(true);
    else expect(decision).toEqual(refused(refusal));
  });
});
