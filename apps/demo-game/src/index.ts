// The identity demo's game instance: a two-team counter race, admitted by the
// real thing.
//
// **Why this module exists beside the real one.** `packages/stdb/spacetimedb`
// ships the platform's game instance with its four seed tables deliberately
// unwritten — `initialize_game` belongs to migrate-game-lifecycle — and with no
// gameplay reducers, which belong to migrate-operator-control and
// migrate-turn-pacing. An instance in that state admits nobody, which is the
// safe direction for the gap to fail in but leaves nothing to *play*. This
// module fills exactly those two gaps for the demo and changes nothing else:
// the seed tables are the same shapes, the connect-time decision is
// `@cyphid/snek-stdb`'s own `admit`, and the one mutating reducer authorises
// through `actingTeam` — the same function the real gameplay reducers will call
// when their changes land. What a token earns here is therefore what it earns
// there.
//
// Two things are the demo's own and will not survive into the real module: a
// `seed_game` reducer standing in for `initialize_game`, and the module owner's
// bypass that lets the demo stack call it. Both are gated on the publisher's
// identity, which no player holds.
import {
  type AdmissionContext,
  type AdmissionRow,
  GAME_BINDING_KEY,
  type VerifiedToken,
  actingTeam,
  admissionRow,
  admit,
  coachKey,
} from "@cyphid/snek-stdb";
import { type JwtClaims, schema, t, table } from "spacetimedb/server";

const spacetimedb = schema({
  /**
   * The identity that published this module, captured once by `init`.
   *
   * It is the only caller `seed_game` answers and the only connection
   * admission waves through — the demo stack, standing in for the platform
   * orchestration that will seed a real instance. Held as a hex string rather
   * than an `identity` column because comparing two strings needs no import
   * and the value is never used as anything but a comparand.
   */
  demo_owner: table(
    { name: "demo_owner" },
    {
      key: t.string().primaryKey(),
      ownerHex: t.string(),
    },
  ),

  // The four seed tables, in the shapes `packages/stdb/spacetimedb/src/index.ts`
  // declares them — this is what `admit` reads, so a shape that drifted would
  // be a decision made against different facts than the real instance's.
  game_binding: table(
    { name: "game_binding" },
    {
      key: t.string().primaryKey(),
      platformIssuer: t.string(),
      gameId: t.string(),
    },
  ),
  participant_team: table({ name: "participant_team" }, { teamId: t.string().primaryKey() }),
  roster_member: table(
    { name: "roster_member" },
    {
      userId: t.string().primaryKey(),
      teamId: t.string(),
    },
  ),
  roster_coach: table(
    { name: "roster_coach" },
    {
      key: t.string().primaryKey(),
      userId: t.string(),
      teamId: t.string(),
    },
  ),

  // Private, and covered by no row-level-security rule — the same mechanism as
  // the real module, so no client subscription reaches it however the demo's
  // pages are written.
  // spec: identity-and-authorization/admission-records-private#no-subscription-reaches-admission-records
  admitted_connection: table(
    { name: "admitted_connection" },
    {
      connectionId: t.connectionId().primaryKey(),
      role: t.string(),
      subjectId: t.string(),
      teamId: t.string(),
    },
  ),

  /**
   * The game: one counter per participating team. Public, because it is what
   * every connection — player and spectator alike — is here to watch, and the
   * only thing in this instance a client may read.
   */
  team_counter: table(
    { name: "team_counter", public: true },
    {
      teamId: t.string().primaryKey(),
      count: t.u32(),
    },
  ),
});

export default spacetimedb;

const OWNER_KEY = "owner";

/** Capture the publisher as this instance's owner, once, at first publish. */
export const init = spacetimedb.init((ctx) => {
  if (ctx.db.demo_owner.key.find(OWNER_KEY) === null) {
    ctx.db.demo_owner.insert({ key: OWNER_KEY, ownerHex: ctx.sender.toHexString() });
  }
});

function ownedBy(owner: { ownerHex: string } | null, sender: { toHexString(): string }): boolean {
  return owner !== null && owner.ownerHex === sender.toHexString();
}

/**
 * Seed this instance — the demo's stand-in for `initialize_game`, answering the
 * module owner alone and replacing the whole snapshot on every call.
 *
 * One JSON argument rather than typed columns: the caller is the demo stack,
 * and a single document is one value that cannot be half-passed across four
 * tables.
 *
 * **Counters are inserted, never overwritten.** Seating a player mid-race
 * re-seeds the snapshot, and a seed that reset the score would make every new
 * arrival wipe the board.
 */
export const seed_game = spacetimedb.reducer({ worldJson: t.string() }, (ctx, { worldJson }) => {
  if (!ownedBy(ctx.db.demo_owner.key.find(OWNER_KEY), ctx.sender)) {
    throw new Error("seed_game answers the module owner alone");
  }
  const world = JSON.parse(worldJson) as {
    platformIssuer: string;
    gameId: string;
    participantTeams: string[];
    rosterMembers: { userId: string; teamId: string }[];
    rosterCoaches: { userId: string; teamId: string }[];
  };

  for (const row of [...ctx.db.participant_team]) ctx.db.participant_team.delete(row);
  for (const row of [...ctx.db.roster_member]) ctx.db.roster_member.delete(row);
  for (const row of [...ctx.db.roster_coach]) ctx.db.roster_coach.delete(row);

  const binding = {
    key: GAME_BINDING_KEY,
    platformIssuer: world.platformIssuer,
    gameId: world.gameId,
  };
  if (ctx.db.game_binding.key.find(GAME_BINDING_KEY) === null) {
    ctx.db.game_binding.insert(binding);
  } else {
    ctx.db.game_binding.key.update(binding);
  }

  for (const teamId of world.participantTeams) {
    ctx.db.participant_team.insert({ teamId });
    if (ctx.db.team_counter.teamId.find(teamId) === null) {
      ctx.db.team_counter.insert({ teamId, count: 0 });
    }
  }
  for (const member of world.rosterMembers) ctx.db.roster_member.insert(member);
  for (const coach of world.rosterCoaches) {
    ctx.db.roster_coach.insert({ key: coachKey(coach.userId, coach.teamId), ...coach });
  }
});

/**
 * The claims the admission decision reads — `packages/stdb/spacetimedb`'s
 * `claimedToken`, unchanged, including why a token carrying several audiences
 * is refused rather than searched.
 */
function claimedToken(jwt: JwtClaims): VerifiedToken | undefined {
  const [aud] = jwt.audience;
  const exp = jwt.fullPayload["exp"];
  return jwt.audience.length === 1 && aud !== undefined && typeof exp === "number"
    ? { iss: jwt.issuer, aud, sub: jwt.subject, exp }
    : undefined;
}

/**
 * Validate a connection, once, and record what it may do.
 *
 * Below the owner bypass this is the real module's `onConnect` body: the same
 * context assembled from the same four tables, the same `admit`, the same
 * refusal by `throw` — which aborts the transaction, so a refused connection
 * leaves no admission row, no counter change, and no other trace.
 *
 * **The owner bypass comes first and returns.** SpacetimeDB runs this hook for
 * HTTP reducer calls too, so without it the stack could not seed the instance
 * it is trying to seed. It writes no admission row: the owner is not a
 * participant and `actingTeam` will find nothing for it, so seeding cannot
 * play.
 *
 * spec: identity-and-authorization/connect-time-validation#reconnect-revalidates
 * spec: identity-and-authorization/admission-validation#reject-before-touching-state
 */
export const onConnect = spacetimedb.clientConnected((ctx) => {
  if (ownedBy(ctx.db.demo_owner.key.find(OWNER_KEY), ctx.sender)) return;

  const participantTeamIds = new Set<string>();
  for (const team of ctx.db.participant_team) participantTeamIds.add(team.teamId);
  const teamOfMember = new Map<string, string>();
  for (const member of ctx.db.roster_member) teamOfMember.set(member.userId, member.teamId);
  const coachTeams = new Map<string, Set<string>>();
  for (const designation of ctx.db.roster_coach) {
    const teams = coachTeams.get(designation.userId) ?? new Set<string>();
    teams.add(designation.teamId);
    coachTeams.set(designation.userId, teams);
  }
  const binding = ctx.db.game_binding.key.find(GAME_BINDING_KEY);
  const context: AdmissionContext = {
    platformIssuer: binding?.platformIssuer ?? "",
    gameId: binding?.gameId ?? "",
    participantTeamIds,
    teamOfMember,
    coachTeams,
    // Timestamps are microseconds since the epoch; the token's `exp` is seconds.
    nowSeconds: Number(ctx.timestamp.toMillis() / 1000n),
  };

  const jwt = ctx.senderAuth.jwt;
  const decision = admit(jwt ? claimedToken(jwt) : undefined, context);
  if (!decision.ok) throw new Error(`admission refused: ${decision.refusal}`);
  if (!ctx.connectionId) throw new Error("admission refused: no connection id");

  ctx.db.admitted_connection.insert({
    connectionId: ctx.connectionId,
    ...admissionRow(decision.identity),
  });
});

/**
 * Forget an admission when its connection ends.
 *
 * The record exists to authorise a live connection, so it has nothing left to
 * say once there is none — and a page that swaps its token reconnects, which
 * would otherwise leave the old row behind for as long as the instance lives.
 */
export const onDisconnect = spacetimedb.clientDisconnected((ctx) => {
  const row = ctx.connectionId
    ? ctx.db.admitted_connection.connectionId.find(ctx.connectionId)
    : null;
  if (row) ctx.db.admitted_connection.delete(row);
});

/**
 * The game: add one to the caller's team's counter.
 *
 * `actingTeam` is the whole authorisation, and it is the same call the real
 * gameplay reducers will make. It answers `undefined` for every connection that
 * may not act — one that was never admitted, and a spectator or coach, whose
 * admitted identity structurally carries no team to act for — so a read-only
 * role is refused here without this reducer knowing what a spectator is.
 *
 * The team is the one admission derived, never one the caller names: an
 * operator's team came from the seeded roster snapshot at connect time, so
 * nothing a client sends can move a point to another team's counter.
 *
 * spec: identity-and-authorization/role-bound-privileges
 * spec: identity-and-authorization/admission-validation#unadmitted-mutations-rejected
 */
export const increment = spacetimedb.reducer({}, (ctx) => {
  const row = ctx.connectionId
    ? ctx.db.admitted_connection.connectionId.find(ctx.connectionId)
    : null;
  // The row's `role` is a bare string to the schema; what was written came from
  // `admissionRow`, whose type this narrows back to.
  const team = actingTeam(row === null ? null : { ...row, role: row.role as AdmissionRow["role"] });
  if (team === undefined) throw new Error("this connection may not act for any team");

  const counter = ctx.db.team_counter.teamId.find(team);
  if (counter === null) ctx.db.team_counter.insert({ teamId: team, count: 1 });
  else ctx.db.team_counter.teamId.update({ teamId: team, count: counter.count + 1 });
});
