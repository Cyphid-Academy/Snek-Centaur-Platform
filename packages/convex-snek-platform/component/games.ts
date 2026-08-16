// The games table's function surface: each write loads the record, calls the
// pure state machine from @cyphid/snek-game-configuration, and persists the
// transition — all inside ONE Convex mutation, whose serializable transaction
// is what makes every joint outcome ("clears the lock AND regenerates",
// "the freeze binds at the moment of launch", "at most one open game per
// room") indivisible under concurrency.
// spec: global-invariants/transactional-invariant-enforcement
//
// Rejections are RETURNED as a discriminated union ({ ok: false, rejection }),
// never thrown: a thrown error reaches clients as a string, a returned union
// reaches them as data they can render. One convention, every function.
// spec: global-invariants/client-truthfulness#rejections-reach-the-user
// spec: game-configuration/infeasibility-surfaced
import {
  applyConfigEdit,
  applyRosterChange,
  concludeWithoutLaunch as concludeRecord,
  createRecord,
  launch as launchRecord,
  regeneratePreview,
  setBoardLock as setBoardLockRecord,
} from "@cyphid/snek-game-configuration";
import type { ConfigOpResult } from "@cyphid/snek-game-configuration";
import { v } from "convex/values";
import type { CreateGameResult, GameRejection, GameWriteResult } from "../src/game-doc.js";
import { asTeamRegistrations, docToRecord, recordToFields, toPublicView } from "../src/game-doc.js";
import { gameConfigValidator, teamValidator } from "../src/validators.js";
import type { Id } from "./_generated/dataModel.js";
import type { MutationCtx } from "./_generated/server.js";
import { mutation, query } from "./_generated/server.js";

/**
 * A fresh platform-side seed. Drawn only here, never accepted from a caller,
 * and stored hex-encoded where no public read returns it. Convex's runtime
 * records the entropy a mutation draws, so the transaction stays
 * deterministic on retry.
 * spec: game-configuration/board-generation-retry ("accessible to no game client")
 */
function freshSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

const notFound = { ok: false, rejection: { kind: "game-not-found" } } as const;

/**
 * The game-subject codec's field separator (@cyphid/snek-platform-auth's
 * encodeGameSubject). A team id must not contain it: kept as a bare literal
 * here rather than a cross-package import so the component stays free of an
 * auth dependency, matching how the pure record layer validates roster shape
 * with its own local predicates.
 * spec: identity-and-authorization/game-token-contents
 */
const GAME_SUBJECT_SEPARATOR = ":";

/**
 * Persist a pure-layer transition. When the transition says the generation
 * inputs changed, the preview regenerates HERE, in the same mutation (and so
 * the same transaction) as the edit that provoked it — a lock cleared in a
 * later write would leave a window in which the standing lock designates a
 * preview its own parameters no longer produce.
 * spec: game-configuration/board-preview#roster-change-regenerates
 * spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
 * spec: global-invariants/transactional-invariant-enforcement
 */
async function persistTransition(
  ctx: MutationCtx,
  gameId: Id<"games">,
  roomId: string | null,
  transition: ConfigOpResult,
): Promise<GameWriteResult> {
  if (!transition.ok) {
    return { ok: false, rejection: transition.rejection };
  }
  let record = transition.record;
  if (transition.regenerate) {
    const regenerated = regeneratePreview(record, freshSeed());
    if (!regenerated.ok) {
      // Unreachable in practice: regeneratePreview rejects only on phase, and
      // the transition we are persisting kept the record in "configuring".
      return { ok: false, rejection: regenerated.rejection };
    }
    record = regenerated.record;
  }
  await ctx.db.replace(gameId, recordToFields(record, roomId));
  return { ok: true, game: toPublicView(gameId, roomId, record) };
}

/**
 * Create the game record in its minimal form, every parameter already at its
 * default. Refused while another game with the same room key (null = the dev
 * room) is open for configuration — an exclusivity guarded by an indexed
 * query inside this same serializable transaction, so two concurrent creates
 * cannot both commit.
 * spec: game-configuration/config-lives-on-the-game#one-game-configured-at-a-time
 * spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
 */
export const createGame = mutation({
  args: { roomId: v.union(v.string(), v.null()) },
  handler: async (ctx, args): Promise<CreateGameResult> => {
    const open = await ctx.db
      .query("games")
      .withIndex("by_room_and_phase", (q) => q.eq("roomId", args.roomId).eq("phase", "configuring"))
      .first();
    if (open !== null) {
      return { ok: false, rejection: { kind: "room-occupied", openGameId: open._id } };
    }
    const record = createRecord();
    const gameId = await ctx.db.insert("games", recordToFields(record, args.roomId));
    return { ok: true, gameId, game: toPublicView(gameId, args.roomId, record) };
  },
});

/**
 * The public read — and, because Convex queries are reactive subscriptions,
 * the delivery channel that keeps every configuration surface rendering the
 * same current preview. The seed is stripped unconditionally; the starting
 * state is withheld while hidden (the unlocked-launch board surprise).
 * spec: game-configuration/board-preview#all-viewers-in-sync
 * spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
 * spec: game-configuration/config-lives-on-the-game#views-read-the-games-own-record
 */
export const getGame = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return null;
    }
    return toPublicView(doc._id, doc.roomId, docToRecord(doc));
  },
});

/**
 * The UNREDACTED read: seed and hidden starting state included. For the
 * platform's own orchestration only (the lifecycle story hands the starting
 * state to the game runtime at provisioning); the host must never expose
 * this to a game client.
 * spec: game-configuration/generation-parameter-boundary
 */
export const getGameInternal = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.gameId);
  },
});

/**
 * Replace the game's configuration wholesale. Validation is the pure layer's
 * (every value against its own descriptor, plus the record-level
 * bounded-duration predicate); a generation-half change clears the lock and
 * regenerates the preview in this same transaction, a gameplay-only change
 * leaves both standing.
 * spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
 * spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
 * spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
 */
export const updateConfig = mutation({
  args: { gameId: v.id("games"), config: gameConfigValidator },
  handler: async (ctx, args): Promise<GameWriteResult> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    const transition = applyConfigEdit(docToRecord(doc), args.config);
    return await persistTransition(ctx, args.gameId, doc.roomId, transition);
  },
});

/**
 * Replace the roster. The roster is a generation input, so this always clears
 * the lock and regenerates the preview in the same transaction.
 * spec: game-configuration/board-preview#roster-change-regenerates
 * spec: game-configuration/board-preview-lock-in#roster-change-clears-the-lock
 */
export const updateRoster = mutation({
  args: { gameId: v.id("games"), teams: v.array(teamValidator) },
  handler: async (ctx, args): Promise<GameWriteResult> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    // A team id containing the game-subject codec separator (':') would make
    // encodeGameSubject throw when a bot access token is later minted for the
    // team — an error far from the write that stored the id. Refuse it here,
    // as data, so the codec's throw is unreachable from stored roster data.
    // spec: identity-and-authorization/game-token-contents
    for (const team of args.teams) {
      if (team.centaurTeamId.includes(GAME_SUBJECT_SEPARATOR)) {
        return {
          ok: false,
          rejection: { kind: "invalid-team-id", centaurTeamId: team.centaurTeamId },
        };
      }
    }
    const transition = applyRosterChange(docToRecord(doc), asTeamRegistrations(args.teams));
    return await persistTransition(ctx, args.gameId, doc.roomId, transition);
  },
});

/**
 * Set or clear the board lock. A lock request carries no board data — the
 * boolean designates the platform-held current preview, and locking is
 * refused while that slot holds no successful board.
 * spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
 */
export const setBoardLock = mutation({
  args: { gameId: v.id("games"), locked: v.boolean() },
  handler: async (ctx, args): Promise<GameWriteResult> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    const transition = setBoardLockRecord(docToRecord(doc), args.locked);
    return await persistTransition(ctx, args.gameId, doc.roomId, transition);
  },
});

/**
 * Launch: freeze the configuration and set the starting state. Locked, the
 * designated preview launches exactly; unlocked, a fresh board is generated
 * from the then-current inputs and a fresh seed, persisted hidden. A failed
 * unlocked generation returns the structured infeasibility and the record
 * does not transition.
 * spec: game-configuration/launch-freeze
 * spec: game-configuration/board-preview-lock-in#locked-board-launches-exactly
 * spec: game-configuration/infeasibility-surfaced#failed-launch-halts
 */
export const launchGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args): Promise<GameWriteResult> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    const transition = launchRecord(docToRecord(doc), freshSeed());
    return await persistTransition(ctx, args.gameId, doc.roomId, transition);
  },
});

/**
 * Record the roster snapshot's authorization-relevant fields on the stored
 * roster entries: which humans may obtain operator tokens for each team, and
 * which are its designated coaches. These fields ARE the snapshot's
 * authorization shape — issuance is answered from them and from nothing
 * else. Taking the snapshot (when, and from which team records) belongs to
 * the lifecycle story's orchestration; this mutation only persists what it
 * decided. Entries naming a team not on the roster are refused rather than
 * ignored — a snapshot for a team the game does not know is a caller bug.
 *
 * Config writes cannot erase a set snapshot: they are rejected outside the
 * "configuring" phase (launch-freeze), and the snapshot is set at launch —
 * after the last config write that could have rewritten the roster rows.
 * spec: identity-and-authorization/roster-snapshot-binding
 */
export const setRosterSnapshot = mutation({
  args: {
    gameId: v.id("games"),
    entries: v.array(
      v.object({
        centaurTeamId: v.string(),
        memberUserIds: v.array(v.string()),
        coachUserIds: v.array(v.string()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; rejection: GameRejection }> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    const byTeam = new Map(args.entries.map((entry) => [entry.centaurTeamId, entry]));
    for (const entry of args.entries) {
      if (!doc.teams.some((team) => team.centaurTeamId === entry.centaurTeamId)) {
        return {
          ok: false,
          rejection: { kind: "team-not-on-roster", centaurTeamId: entry.centaurTeamId },
        };
      }
    }
    await ctx.db.patch(args.gameId, {
      teams: doc.teams.map((team) => {
        const entry = byTeam.get(team.centaurTeamId);
        return entry === undefined
          ? team
          : {
              ...team,
              memberUserIds: [...entry.memberUserIds],
              coachUserIds: [...entry.coachUserIds],
            };
      }),
    });
    return { ok: true };
  },
});

/**
 * Mark a playing game finished — the minimal lifecycle seam the identity
 * capability needs observable: credential and token issuance re-check the
 * game's phase per request, so the phase flip is what kills issuance the
 * moment a game ends. The game-lifecycle story owns the real finish
 * orchestration (instance teardown, record retrieval) and will subsume
 * this transition; until then the host's orchestration is its only caller.
 * spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
 */
export const finishGame = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args): Promise<{ ok: true } | { ok: false; rejection: GameRejection }> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    if (doc.phase !== "playing") {
      return { ok: false, rejection: { kind: "wrong-phase", phase: doc.phase } };
    }
    await ctx.db.patch(args.gameId, { phase: "finished" });
    return { ok: true };
  },
});

/**
 * End a game that never launched (a walkover). The record stops being
 * editable exactly as a launched game's does. Exposed on the component for
 * the record's completeness; the lifecycle story owns when it is called.
 * spec: game-configuration/launch-freeze#post-launch-writes-rejected
 */
export const concludeWithoutLaunch = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args): Promise<GameWriteResult> => {
    const doc = await ctx.db.get(args.gameId);
    if (doc === null) {
      return notFound;
    }
    const transition = concludeRecord(docToRecord(doc));
    return await persistTransition(ctx, args.gameId, doc.roomId, transition);
  },
});
