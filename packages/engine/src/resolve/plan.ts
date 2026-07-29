// What a resolution was asked to do, and the fence that refuses to guess.
//
// Both entry points reach the same stage list; they differ only in how each
// alive snake's disposition is arrived at. Advancing a turn resolves every
// direction by the movement rules and holds nothing; imagining moves takes the
// directions it is given, holds the remainder, and applies NO fallback — a
// hypothetical never invents a snake's choice, because inventing one is the
// false assumption the second entry point exists to avoid.
// spec: game-engine/movement#fallback-belongs-to-advancing-a-turn
import { rngFromSeed, subSeed } from "../rng.js";
import { currentTurn, isLockstep } from "../state.js";
import type {
  CentaurTeamId,
  Direction,
  PartialGameState,
  SnakeId,
  StagedMove,
  TurnNumber,
  TurnTimings,
} from "../types.js";
import { ALL_DIRECTIONS } from "../types.js";
import { must } from "./work.js";

export interface ResolutionPlan {
  /** Alive snakes taking this turn, and the direction each takes. */
  readonly moves: ReadonlyMap<SnakeId, Direction>;
  /** Alive snakes held: not moving, still on the board as obstacles. */
  readonly held: ReadonlySet<SnakeId>;
  /** The turn being resolved — the state's own current turn. */
  readonly turnNumber: TurnNumber;
  /**
   * Whether the state this resolution commits will be in lockstep. Item
   * spawning and the win check are gated on it: a condition on the state
   * alone, never on which entry point was called or on what the caller passed.
   */
  // spec: game-engine/turn-resolution-model#spawning-and-outcome-need-lockstep
  readonly lockstepAfter: boolean;
}

// spec: game-engine/hypothetical-resolution-failure — the requirement's four
// families, in the order it states them.
export type ResolutionFailureKind =
  | "missing_disposition"
  | "missing_turn_seed"
  | "stale_snake_moved"
  | "impossible_input";

export interface ResolutionFailure {
  readonly kind: ResolutionFailureKind;
  /** The snake the refusal is about, where it is about one. */
  readonly snakeId: SnakeId | null;
  readonly reason: string;
}

export type PlanResult =
  | { readonly ok: true; readonly plan: ResolutionPlan }
  | { readonly ok: false; readonly failure: ResolutionFailure };

function refuse(
  kind: ResolutionFailureKind,
  snakeId: SnakeId | null,
  reason: string,
): { ok: false; failure: ResolutionFailure } {
  return { ok: false, failure: { kind, snakeId, reason } };
}

function isDuration(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Structural validity of the state itself — input that could not have arisen. */
function structuralProblem(state: PartialGameState): string | null {
  const { board } = state;
  if (!Number.isInteger(board.boardSize) || board.boardSize <= 0) {
    return `board size ${board.boardSize} is not a positive integer`;
  }
  if (board.cells.length !== board.boardSize * board.boardSize) {
    return `board holds ${board.cells.length} cells, not boardSize² = ${board.boardSize * board.boardSize}`;
  }
  if (!isDuration(state.consumedDurationMs)) {
    return `consumed duration ${state.consumedDurationMs} is not a non-negative length of time`;
  }
  const seen = new Set<SnakeId>();
  const now = currentTurn(state);
  for (const snake of state.snakes) {
    if (seen.has(snake.snakeId)) return `snake ${snake.snakeId} appears twice`;
    seen.add(snake.snakeId);
    if (snake.body.length === 0) return `snake ${snake.snakeId} has an empty body`;
    if (!Number.isInteger(snake.turn) || snake.turn < 0) {
      return `snake ${snake.snakeId} is at turn ${snake.turn}, which is not a turn number`;
    }
  }
  // A projection is what a hold leaves on the board: one identity, standing
  // once, projected from a turn the state has since moved past. A projection at
  // the state's own turn would be a snake that was both held and not.
  // spec: game-engine/held-snakes
  for (const projection of state.projections) {
    if (seen.has(projection.snakeId)) {
      return `snake ${projection.snakeId} is both a snake and a projection`;
    }
    seen.add(projection.snakeId);
    if (projection.historic.turn >= now) {
      return `projection of snake ${projection.snakeId} was held at turn ${projection.historic.turn}, which the state's turn ${now} has not passed`;
    }
  }
  const teams = new Set<CentaurTeamId>();
  for (const clock of state.clocks) {
    if (teams.has(clock.centaurTeamId)) return `team ${clock.centaurTeamId} has two clocks`;
    teams.add(clock.centaurTeamId);
  }
  return null;
}

/**
 * The declared timings must be non-negative lengths of time, and must name
 * exactly the teams the state holds a clock for. A resolution that filled in a
 * missing burn would decide the game on a number nobody measured, which is the
 * one thing a limit measured in real time cannot survive.
 */
// spec: game-engine/turn-resolution-model#time-enters-a-turn-once
function timingsProblem(state: PartialGameState, timings: TurnTimings): string | null {
  if (!isDuration(timings.durationMs)) {
    return `declared turn duration ${timings.durationMs} is not a non-negative length of time`;
  }
  const clocked = new Set(state.clocks.map((c) => c.centaurTeamId));
  for (const [team, burn] of timings.burnMs) {
    if (!clocked.has(team)) return `a burn is declared for team ${team}, which holds no clock`;
    if (!isDuration(burn)) {
      return `team ${team}'s declared burn ${burn} is not a non-negative length of time`;
    }
  }
  for (const team of clocked) {
    if (!timings.burnMs.has(team)) return `team ${team} holds a clock but declared no burn`;
  }
  return null;
}

/** Whether the state this plan commits will carry nothing still projected. */
function lockstepAfter(
  state: PartialGameState,
  moves: ReadonlyMap<SnakeId, Direction>,
  held: ReadonlySet<SnakeId>,
): boolean {
  // Nothing advances, so nothing is projected that is not already.
  if (moves.size === 0) return isLockstep(state);
  // Otherwise every held snake becomes a projection at this commit, and any
  // live one already standing stays. Computed from the plan rather than the
  // result, so a projection this turn happens to kill still gates the stages —
  // conservative in the direction that withholds an answer rather than one
  // that invents it.
  return held.size === 0 && isLockstep(state);
}

/**
 * Plan a hypothetical resolution, refusing rather than guessing. The caller is
 * a worst-case search, so a wrong "safe" costs far more than a refusal.
 */
// spec: game-engine/hypothetical-resolution-failure
export function planImaginedMoves(
  state: PartialGameState,
  directions: ReadonlyMap<SnakeId, Direction>,
  held: ReadonlySet<SnakeId>,
  timings: TurnTimings,
  turnSeed: Uint8Array | null,
): PlanResult {
  const structural = structuralProblem(state);
  if (structural !== null) return refuse("impossible_input", null, structural);
  const timing = timingsProblem(state, timings);
  if (timing !== null) return refuse("impossible_input", null, timing);

  const byId = new Map(state.snakes.map((s) => [s.snakeId, s]));
  const turnNumber = currentTurn(state);

  const projected = new Set(state.projections.map((p) => p.snakeId));

  for (const id of directions.keys()) {
    // A projection is a snake an earlier resolution declined to model, so
    // advancing it now would need interactions that already committed to be
    // re-resolved. Refusing is the conservative answer, and relaxing the fence
    // is later work. spec: game-engine/hypothetical-resolution-failure#only-holds-may-lag
    if (projected.has(id)) {
      return refuse(
        "stale_snake_moved",
        id,
        `snake ${id} is projected, held since turn ${
          must(
            state.projections.find((p) => p.snakeId === id),
            `projection ${id}`,
          ).historic.turn
        }, and cannot be asked to move`,
      );
    }
    const snake = byId.get(id);
    if (snake === undefined) return refuse("impossible_input", id, `no snake ${id} on this state`);
    if (!snake.alive) return refuse("impossible_input", id, `snake ${id} is not alive`);
    if (held.has(id)) {
      return refuse("impossible_input", id, `snake ${id} is both given a direction and held`);
    }
    if (snake.turn !== turnNumber) {
      return refuse(
        "stale_snake_moved",
        id,
        `snake ${id} is at turn ${snake.turn}, behind the state's turn ${turnNumber}`,
      );
    }
  }

  for (const id of held) {
    if (projected.has(id)) {
      return refuse(
        "impossible_input",
        id,
        `snake ${id} is already projected; a projection is held by what it is, and is not named`,
      );
    }
    const snake = byId.get(id);
    if (snake === undefined) return refuse("impossible_input", id, `no snake ${id} on this state`);
    if (!snake.alive) return refuse("impossible_input", id, `held snake ${id} is not alive`);
  }

  const moves = new Map<SnakeId, Direction>();
  for (const snake of state.snakes) {
    if (!snake.alive) continue;
    const direction = directions.get(snake.snakeId);
    if (direction !== undefined) {
      moves.set(snake.snakeId, direction);
      continue;
    }
    if (held.has(snake.snakeId)) continue;
    return refuse(
      "missing_disposition",
      snake.snakeId,
      `alive snake ${snake.snakeId} is neither given a direction nor held`,
    );
  }

  const caughtUp = lockstepAfter(state, moves, held);
  // Spawning is the stage that runs only in lockstep and cannot run without
  // entropy. A caller that reaches it without a seed is asking for an answer
  // that depends on information it did not supply — a refusal about the
  // resolution rather than about any snake, so it names none.
  // spec: game-engine/hypothetical-resolution-failure#a-running-stage-needs-its-seed
  if (caughtUp && moves.size > 0 && turnSeed === null) {
    return refuse(
      "missing_turn_seed",
      null,
      "this resolution leaves nothing behind, so item spawning runs and needs a turn seed",
    );
  }
  return { ok: true, plan: { moves, held, turnNumber, lockstepAfter: caughtUp } };
}

/**
 * Plan the mainline: every alive snake takes the turn, with its direction
 * resolved by the movement rules — the staged move if any; else
 * `lastDirection` unconditionally, even into a lethal cell; else (turn 0 with
 * nothing staged) a seeded-random direction, also unconstrained by lethality.
 * Nothing is held, so the result is caught up by construction.
 */
// spec: game-engine/movement#direction-precedence
export function planAdvancedTurn(
  state: PartialGameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnSeed: Uint8Array,
): ReadonlyMap<SnakeId, Direction> {
  // RNG draws happen in ascending-snakeId order, only for fallback snakes.
  const rngMove = rngFromSeed(subSeed(turnSeed, "phase-1-random"));
  const alive = state.snakes.filter((s) => s.alive).sort((a, b) => a.snakeId - b.snakeId);
  const directions = new Map<SnakeId, Direction>();
  for (const snake of alive) {
    const staged = stagedMoves.get(snake.snakeId);
    if (staged !== undefined) directions.set(snake.snakeId, staged.direction);
    else if (snake.lastDirection !== null) directions.set(snake.snakeId, snake.lastDirection);
    else directions.set(snake.snakeId, rngMove.pick(ALL_DIRECTIONS));
  }
  return directions;
}
