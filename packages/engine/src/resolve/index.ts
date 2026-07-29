// The turn resolver — orchestration of the staged model: snapshot → move
// projection → head-to-head precedence → parallel interaction rules → derived
// rules → deterministic commit → spawning → win check → event derivation.
// spec: game-engine/turn-resolution-model
//
// TWO ENTRY POINTS OVER ONE STAGE LIST. The mainline is a real-time game where
// every snake moves each turn; a tree search needs the same rules over a board
// where only some snakes have advanced. Sorting the stages by whether they
// need every snake at the same turn puts the seam in exactly one place: item
// spawning and the win check need lockstep (spawning's eligible cells are
// those unoccupied by ANY alive body, and the eligible list determines where
// items land, so a mixed-turn board would place items where the real game
// cannot; the win check sums aggregate length across snakes at one instant).
// Both are therefore gated on a condition about the STATE — every alive snake
// at the current turn — never on which entry point was called.
import { applyDeclaredBurns } from "../clock.js";
import { asGameState, projectionOf } from "../state.js";
import type {
  Direction,
  GameOutcome,
  GameRuntimeConfig,
  GameState,
  PartialGameState,
  ProjectedSnake,
  ResolutionRecord,
  RewindLog,
  SnakeId,
  StagedMove,
  TurnEvent,
  TurnTimings,
} from "../types.js";
import { ClaimSet } from "./claims.js";
import { commit } from "./commit.js";
import { buildTurnContext } from "./context.js";
import { EventBuffer } from "./events.js";
import type { ResolutionFailure, ResolutionPlan } from "./plan.js";
import { planAdvancedTurn, planImaginedMoves } from "./plan.js";
import type { InteractionRule } from "./rules.js";
import { INTERACTION_RULES, runDerivedRules } from "./rules.js";
import { runSpawning } from "./spawn.js";
import { checkWinConditions } from "./win.js";
import { toProjectedSnake, toSnakeState } from "./work.js";

/** The outcome of advancing a turn: a game state, always in lockstep. */
export interface TurnResolution {
  readonly nextState: GameState;
  readonly events: ReadonlyArray<TurnEvent>;
  readonly outcome: GameOutcome;
}

/** The outcome of imagining moves: a partial state that may not narrow. */
export interface HypotheticalResolution {
  readonly nextState: PartialGameState;
  readonly events: ReadonlyArray<TurnEvent>;
  /**
   * `null` while anything is still projected: no outcome is reported over a
   * board carrying snakes this line declined to model, whether or not a seed
   * was supplied.
   */
  // spec: game-engine/turn-resolution-model#spawning-and-outcome-need-lockstep
  readonly outcome: GameOutcome | null;
}

/**
 * Either a partial game state or a failure, never a partial answer alongside
 * one. spec: game-engine/hypothetical-resolution-failure
 */
export type HypotheticalResult =
  | { readonly ok: true; readonly resolution: HypotheticalResolution }
  | { readonly ok: false; readonly failure: ResolutionFailure };

/** A snake whose fate a history revision changed. spec: game-engine/historic-advance */
export interface Discontinuity {
  readonly snakeId: SnakeId;
  readonly wasAlive: boolean;
  readonly nowAlive: boolean;
}

/** The board history leaves once one more of its moves is known. */
export interface HistoryRevision {
  /** At the same current turn as the state that went in, over a revised past. */
  readonly nextState: PartialGameState;
  /** Every replayed turn's events, in order — the revised history, not a diff. */
  readonly events: ReadonlyArray<TurnEvent>;
  /**
   * Snakes whose aliveness the revision changed. Empty is the common case and
   * the one a search plans for; non-empty means the board just stopped agreeing
   * with the one the caller was reasoning about. Bodies, items and clocks may
   * differ even when this is empty — a revision recomputes, it does not patch.
   */
  readonly discontinuities: ReadonlyArray<Discontinuity>;
}

export type HistoryResult =
  | { readonly ok: true; readonly revision: HistoryRevision }
  | { readonly ok: false; readonly failure: ResolutionFailure };

export type { ResolutionFailure, ResolutionFailureKind } from "./plan.js";

const NO_STAGED_MOVES: ReadonlyMap<SnakeId, StagedMove> = new Map();

/**
 * Imagine a set of moves over a partial game state: the named snakes take the
 * directions given, the rest are held, and the result is a partial game state
 * with its events — or a refusal.
 *
 * A held snake asserts nothing about its choice. Advancing an unmodelled snake
 * in its last direction looks free and is not: it is a claim, and its errors
 * are asymmetric — a candidate move can be scored safe because an opponent was
 * assumed to continue straight, when a different opponent move would leave
 * that candidate trapped. A worst-case search may never err in that direction.
 */
// spec: game-engine/turn-resolution-model, game-engine/held-snakes
export function imagineMoves(
  state: PartialGameState,
  directions: ReadonlyMap<SnakeId, Direction>,
  held: ReadonlySet<SnakeId>,
  timings: TurnTimings,
  config: GameRuntimeConfig,
  turnSeed: Uint8Array | null = null,
): HypotheticalResult {
  const planned = planImaginedMoves(state, directions, held, timings, turnSeed);
  if (!planned.ok) return planned;
  return {
    ok: true,
    resolution: runStages(
      INTERACTION_RULES,
      state,
      planned.plan,
      NO_STAGED_MOVES,
      timings,
      config,
      turnSeed,
    ),
  };
}

/**
 * Advance one complete turn over a game state: every alive snake takes it,
 * with its direction resolved by the movement rules and nothing held.
 *
 * Defined in terms of imagining moves rather than beside it — the result is
 * caught up by construction, so spawning and the win check run and the state
 * narrows. Both entry points require the turn's timings: how long it lasted,
 * and how much of its own clock each team burned on it.
 */
// spec: game-engine/turn-resolution-model#advancing-is-imagining-with-nothing-held
export function advanceTurn(
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnSeed: Uint8Array,
  timings: TurnTimings,
  config: GameRuntimeConfig,
): TurnResolution {
  return advanceTurnWithRules(INTERACTION_RULES, state, stagedMoves, turnSeed, timings, config);
}

/**
 * The orchestrator, parameterised by the interaction-rule list. Exposed for
 * the order-shuffle property test that machine-checks
 * game-engine/turn-resolution-model's order-independence guarantee;
 * production callers use advanceTurn.
 */
export function advanceTurnWithRules(
  rules: ReadonlyArray<InteractionRule>,
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnSeed: Uint8Array,
  timings: TurnTimings,
  config: GameRuntimeConfig,
): TurnResolution {
  const directions = planAdvancedTurn(state, stagedMoves, turnSeed);
  const planned = planImaginedMoves(state, directions, new Set(), timings, turnSeed);
  if (!planned.ok) {
    // The mainline holds nothing and supplies every direction, so the only
    // reachable refusals are impossible inputs — a malformed state, or timings
    // that are not lengths of time. The caller already holds a narrowed game
    // state, so this is a programming error at its boundary, not an outcome.
    throw new Error(`cannot advance a turn: ${planned.failure.reason}`);
  }
  const resolution = runStages(rules, state, planned.plan, stagedMoves, timings, config, turnSeed);
  return {
    nextState: asGameState(resolution.nextState),
    events: resolution.events,
    // Lockstep by construction, so the win check ran.
    outcome: resolution.outcome as GameOutcome,
  };
}

/**
 * A snake's move at the turn it was held, learned after the fact.
 *
 * A hold says "nobody modelled this snake's choice". Learning the choice does
 * not advance the snake from where the board is now — it settles what happened
 * at the turn it was frozen at, which is a fact about the PAST. So the board is
 * resolved again from before that turn, with the fact in place and every
 * resolution since replayed over it; a resolution is a function of its declared
 * inputs alone (game-engine/determinism), and the log kept exactly those.
 *
 * The result is at the same current turn, and the snake is one turn less
 * historic: it participated at its freeze turn and was held at every turn after,
 * because the log says nothing about those either. Catching a snake up N turns
 * is N calls, each learning one more move.
 *
 * **This can rewrite what already happened.** The newly located head may enter a
 * cell another snake was allowed to pass through, so snakes that lived may die,
 * bodies may differ, and a game that was in progress may have ended. Those
 * differences are reported rather than hidden — see `HistoryRevision`. A search
 * keeps them rare by holding only snakes unlikely to bear on the ground it cares
 * about, but rare is not never, and a caller that ignores the report is reading
 * a board it did not compute.
 */
// spec: game-engine/historic-advance
export function advanceHistory(
  state: PartialGameState,
  directions: ReadonlyMap<SnakeId, Direction>,
  config: GameRuntimeConfig,
): HistoryResult {
  if (directions.size === 0) {
    return refusal("impossible_input", null, "no historic move was supplied");
  }
  for (const id of directions.keys()) {
    if (projectionOf(state, id) === undefined) {
      return refusal(
        "impossible_input",
        id,
        `snake ${id} is not projected, so it has no unknown move to supply; move it through imagineMoves`,
      );
    }
  }
  const log = state.rewind;
  if (log === null) {
    // Unreachable while the invariant holds (a live projection implies a log);
    // stated rather than assumed, because a caller reaching it has a state this
    // engine did not build.
    return refusal("impossible_input", null, "this state carries no history to resolve again");
  }

  const before = new Map(occupantsById(state));
  let replayed: PartialGameState = log.base;
  const events: TurnEvent[] = [];
  const advanced = new Set<SnakeId>();

  for (const record of log.resolutions) {
    const plan = replayPlan(replayed, record, directions, advanced);
    const result = imagineMoves(
      replayed,
      plan.directions,
      plan.held,
      record.timings,
      config,
      record.turnSeed,
    );
    // A refusal here would mean the revised board cannot be asked what the log
    // asked, which `replayPlan` exists to prevent; surface it rather than
    // silently returning a state built from fewer turns than the log holds.
    if (!result.ok) return result;
    replayed = result.resolution.nextState;
    events.push(...result.resolution.events);
  }

  return {
    ok: true,
    revision: {
      nextState: replayed,
      events,
      discontinuities: discontinuitiesBetween(before, occupantsById(replayed)),
    },
  };
}

/**
 * What to ask of one replayed turn: the log's own request, with the newly known
 * move put in at the turn it was made, and adapted to whatever board the
 * revision produced.
 *
 * The adaptation is where a discontinuity lands. A snake the log directed may
 * be gone — drop the direction, it needs no disposition. A snake the log says
 * nothing about may be present, because the revision spared it — hold it, since
 * the log genuinely does not say what it did, and a hold is exactly the answer
 * for a move nobody modelled.
 */
// spec: game-engine/historic-advance#a-revision-adapts-the-record-it-replays
function replayPlan(
  state: PartialGameState,
  record: ResolutionRecord,
  learned: ReadonlyMap<SnakeId, Direction>,
  advanced: Set<SnakeId>,
): { directions: ReadonlyMap<SnakeId, Direction>; held: ReadonlySet<SnakeId> } {
  const directions = new Map<SnakeId, Direction>();
  const held = new Set<SnakeId>();
  const alive = new Map(state.snakes.filter((s) => s.alive).map((s) => [s.snakeId, s]));

  for (const [id, direction] of learned) {
    // Its freeze turn is the one resolution that held it; after that the log
    // has nothing to say, so it is held again and stays one turn less historic.
    if (record.held.has(id) && !advanced.has(id)) {
      directions.set(id, direction);
      advanced.add(id);
    }
  }
  for (const [id, direction] of record.directions) {
    if (alive.has(id) && !directions.has(id)) directions.set(id, direction);
  }
  for (const id of record.held) {
    if (alive.has(id) && !directions.has(id)) held.add(id);
  }
  for (const id of alive.keys()) {
    if (!directions.has(id) && !held.has(id)) held.add(id);
  }
  return { directions, held };
}

function occupantsById(state: PartialGameState): Map<SnakeId, boolean> {
  const alive = new Map<SnakeId, boolean>();
  for (const snake of state.snakes) alive.set(snake.snakeId, snake.alive);
  for (const projection of state.projections) alive.set(projection.snakeId, projection.alive);
  return alive;
}

/** Snakes whose fate the revision changed — the sharp edge of a discontinuity. */
function discontinuitiesBetween(
  before: ReadonlyMap<SnakeId, boolean>,
  after: ReadonlyMap<SnakeId, boolean>,
): ReadonlyArray<Discontinuity> {
  const out: Discontinuity[] = [];
  for (const [snakeId, wasAlive] of before) {
    const nowAlive = after.get(snakeId) ?? false;
    if (wasAlive !== nowAlive) out.push({ snakeId, wasAlive, nowAlive });
  }
  return out.sort((a, b) => a.snakeId - b.snakeId);
}

function refusal(
  kind: ResolutionFailure["kind"],
  snakeId: SnakeId | null,
  reason: string,
): { ok: false; failure: ResolutionFailure } {
  return { ok: false, failure: { kind, snakeId, reason } };
}

function runStages(
  rules: ReadonlyArray<InteractionRule>,
  state: PartialGameState,
  plan: ResolutionPlan,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  timings: TurnTimings,
  config: GameRuntimeConfig,
  turnSeed: Uint8Array | null,
): HypotheticalResolution {
  const claims = new ClaimSet();
  // Stages 1-2: move projection + head-to-head precedence → H*.
  const ctx = buildTurnContext(state, plan, stagedMoves, config, claims);
  // Stage 3: interaction rules — order-free by construction.
  for (const rule of rules) rule(ctx, claims);
  // Stage 4: derived rules (health resolution, cancellation).
  runDerivedRules(ctx, claims);
  // Stage 5: commit — the sole writer of game state, including the clock.
  const events = new EventBuffer();
  const clockCommit = commit(
    ctx,
    claims,
    events,
    timings,
    state.clocks,
    state.consumedDurationMs,
    plan.moves.size > 0,
  );
  // Stages 6-7: item spawning against committed occupancy, then the win
  // check — both only while nothing lags.
  if (plan.lockstepAfter && turnSeed !== null) runSpawning(ctx, turnSeed, events);
  const outcome = plan.lockstepAfter
    ? checkWinConditions(
        ctx.snakes,
        ctx.roster,
        ctx.aliveTeamsAtStart,
        plan.turnNumber,
        clockCommit.consumedDurationMs,
        config,
      )
    : null;
  // Stage 8: event derivation in canonical order.
  const projections = ctx.projections.map(toProjectedSnake);
  return {
    nextState: {
      board: ctx.board,
      snakes: ctx.snakes.map(toSnakeState),
      projections,
      items: ctx.items, // the turn-owned working map, now final
      clocks: clockCommit.clocks,
      consumedDurationMs: clockCommit.consumedDurationMs,
      rewind: rewindAfter(state, plan, timings, turnSeed, projections),
    },
    events: events.ordered(),
    outcome,
  };
}

/**
 * The rewind log the committed state carries. It exists exactly while something
 * is projected: the first hold captures the board it was held from as the base,
 * every later resolution appends what it was asked, and the moment nothing live
 * is left the log is dropped — including on the mainline, which holds nothing
 * and therefore never accumulates one.
 *
 * The append copies the array, so a search path of depth N does O(N²) copying
 * over its lifetime. At the depths a turn-by-turn search reaches that is
 * nothing, and a linked list would trade it for a shape nobody can read.
 */
// spec: game-engine/historic-advance
function rewindAfter(
  state: PartialGameState,
  plan: ResolutionPlan,
  timings: TurnTimings,
  turnSeed: Uint8Array | null,
  projections: ReadonlyArray<ProjectedSnake>,
): RewindLog | null {
  if (projections.every((p) => !p.alive)) return null;
  const record: ResolutionRecord = {
    directions: plan.moves,
    held: plan.held,
    timings,
    turnSeed,
  };
  // Nothing was projected before this resolution, so the state it ran over is
  // the base: a game state, by the same condition that makes it narrowable.
  if (state.rewind === null) return { base: asGameState(state), resolutions: [record] };
  return { base: state.rewind.base, resolutions: [...state.rewind.resolutions, record] };
}

// Re-exported so the package's public surface can offer the timer's game-start
// half without also offering a second writer of a budget.
export { applyDeclaredBurns };
