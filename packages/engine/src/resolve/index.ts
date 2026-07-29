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
import { asGameState } from "../state.js";
import type {
  Direction,
  GameOutcome,
  GameRuntimeConfig,
  GameState,
  PartialGameState,
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
  return {
    nextState: {
      board: ctx.board,
      snakes: ctx.snakes.map(toSnakeState),
      projections: ctx.projections.map(toProjectedSnake),
      items: ctx.items, // the turn-owned working map, now final
      clocks: clockCommit.clocks,
      consumedDurationMs: clockCommit.consumedDurationMs,
    },
    events: events.ordered(),
    outcome,
  };
}

// Re-exported so the package's public surface can offer the timer's game-start
// half without also offering a second writer of a budget.
export { applyDeclaredBurns };
