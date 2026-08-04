// spec: global-invariants/runtime-ownership, global-invariants/one-shared-engine
// The Team Snek SpacetimeDB module.
//
// The module project's skeleton, not the game — see packages/stdb/AGENTS.md.
// Its one load-bearing fact: the shared engine runs unmodified inside the
// instance's V8 isolate, because `spacetime build` inlines npm dependencies
// through rolldown, so BLAKE3 needs no shim, polyfill or vendored copy.
//
// Admission is here because it is not gameplay: who may connect at all is
// decided before any rule applies, so the connect-time path and the seed tables
// it reads land now, ahead of the reducers that carry rules.
import { subSeed } from "@cyphid/snek-engine";
import {
  type AdmissionContext,
  GAME_BINDING_KEY,
  type VerifiedToken,
  admissionRow,
  admit,
} from "@cyphid/snek-stdb";
import { type JwtClaims, schema, t, table } from "spacetimedb/server";

const spacetimedb = schema({
  // A single row recording the last `ping`. Not game state: the instance's
  // real tables arrive with the capability changes that define them.
  module_info: table(
    { name: "module_info", public: true },
    {
      key: t.string().primaryKey(),
      tag: t.string(),
      engineDigest: t.string(),
    },
  ),

  // The four tables below are everything admission consults, and all of it is
  // written once, at initialisation, by `initialize_game` — which belongs to
  // migrate-game-lifecycle and is not written here. Until it runs the tables are
  // empty, no token's issuer can match, and the instance admits no one; an
  // uninitialised instance being closed rather than open is the safe direction
  // for that gap to fail in.
  //
  // Together they are the whole of the material the instance validates against,
  // so no per-connection call reaches the platform
  // (spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone).
  // The signature itself is checked by the host — against material it resolves
  // from the issuer the presented token names — and surfaces here already
  // checked as `ctx.senderAuth`. Which issuer that may be is *this* instance's
  // question, and `game_binding.platformIssuer` is where it holds the answer.

  /**
   * What this instance was bound to at initialisation, in one row: the platform
   * that may sign a token, and the game a token may name.
   *
   * The issuer sits beside the game id rather than in a table of its own
   * because they are seeded by the same write and read by the same decision —
   * and because a second single-row table is a second thing `initialize_game`
   * can forget, in a direction where forgetting means accepting a stranger.
   *
   * spec: identity-and-authorization/verification-without-shared-secrets
   * spec: identity-and-authorization/audience-bound-tokens
   */
  game_binding: table(
    { name: "game_binding" },
    {
      key: t.string().primaryKey(),
      platformIssuer: t.string(),
      gameId: t.string(),
    },
  ),

  /** The Centaur Teams registered as participants of this game. */
  participant_team: table({ name: "participant_team" }, { teamId: t.string().primaryKey() }),

  /** The roster snapshot: which participating team each human belongs to. */
  roster_member: table(
    { name: "roster_member" },
    {
      userId: t.string().primaryKey(),
      teamId: t.string(),
    },
  ),

  /**
   * The roster snapshot's coach designations: which humans coach which
   * participating team.
   *
   * A separate table from `roster_member` rather than a column on it, because
   * it is a different relation — a coach need not be a member of the team they
   * coach, and one human may coach several. Keyed by `coachKey(userId, teamId)`
   * because the pair is what is unique and SpacetimeDB keys one column; the
   * encoder is exported from `@cyphid/snek-stdb` so `initialize_game` and this
   * reader cannot spell it differently.
   *
   * spec: identity-and-authorization/roster-snapshot-binding
   */
  roster_coach: table(
    { name: "roster_coach" },
    {
      key: t.string().primaryKey(),
      userId: t.string(),
      teamId: t.string(),
    },
  ),

  // Deliberately not `public`, and deliberately covered by no row-level-security
  // rule. In SpacetimeDB a client sees a private table only through an RLS rule
  // that grants it, so declaring the table and granting nothing is exactly the
  // property the requirement asks for: no query and no subscription reaches
  // these rows, whoever is connected. `module_info` is `public: true` above; the
  // contrast is the whole mechanism.
  //
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
});

export default spacetimedb;

const MODULE_INFO_KEY = "module_info";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Liveness of the module *and* of the engine inside it.
 *
 * The digest is the point: `subSeed` is the engine's BLAKE3 derivation, so a
 * row with a digest in it proves the shared build ran in the isolate rather
 * than merely that a reducer was reachable. Deriving from a fixed zero seed
 * makes the answer stable, so a caller can compare it against the same call
 * made anywhere else the engine runs.
 */
export const ping = spacetimedb.reducer({ tag: t.string() }, (ctx, { tag }) => {
  const digest = toHex(subSeed(new Uint8Array(32), tag));
  const row = { key: MODULE_INFO_KEY, tag, engineDigest: digest };
  if (ctx.db.module_info.key.find(MODULE_INFO_KEY) === null) {
    ctx.db.module_info.insert(row);
  } else {
    ctx.db.module_info.key.update(row);
  }
});

/**
 * The claims the admission decision reads, or `undefined` if the runtime handed
 * us something that is not one of our tokens.
 *
 * `audience` is a list because JWT permits one; ours name exactly one resource
 * (spec: identity-and-authorization/audience-bound-tokens), so a token carrying
 * several is not a token we issued and is refused as unverified rather than
 * being searched for an audience that happens to match.
 */
function claimedToken(jwt: JwtClaims): VerifiedToken | undefined {
  const [aud] = jwt.audience;
  const exp = jwt.fullPayload["exp"];
  return jwt.audience.length === 1 && aud !== undefined && typeof exp === "number"
    ? // `iss` is carried rather than dropped, and that is the whole of the
      // issuer pin reaching the decision: the host resolved its verification
      // material from this exact value, so discarding it left `admit` unable to
      // tell the platform's signature from any other resolvable issuer's.
      { iss: jwt.issuer, aud, sub: jwt.subject, exp }
    : undefined;
}

/**
 * Validate a connection, once, and record what it may do.
 *
 * This is the instance's only admission mechanism: SpacetimeDB runs it as the
 * connection is established, and it runs again on reconnect because a reconnect
 * is a new connection. Nothing re-reads the token afterwards — the recorded row
 * is the connection's identity for its lifetime, so passing expiry mid-game
 * cannot drop an established connection.
 *
 * spec: identity-and-authorization/connect-time-validation#reconnect-revalidates
 * spec: identity-and-authorization/connect-time-validation#expiry-never-disconnects
 *
 * The body decides before it writes, and it can only be written that way: the
 * decision is a pure call on a value, and refusal leaves by `throw`, which
 * aborts the reducer's transaction and disconnects the client. A refused
 * connection therefore leaves no admission row, no attribution entry, and no
 * other trace, twice over — nothing was written, and anything written would
 * have been rolled back.
 *
 * spec: identity-and-authorization/admission-validation#reject-before-touching-state
 */
export const onConnect = spacetimedb.clientConnected((ctx) => {
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
  // A connect-time reducer always has a connection id; the null is in the
  // reducer context type shared with the reducers that do not.
  if (!ctx.connectionId) throw new Error("admission refused: no connection id");

  ctx.db.admitted_connection.insert({
    connectionId: ctx.connectionId,
    ...admissionRow(decision.identity),
  });
});
