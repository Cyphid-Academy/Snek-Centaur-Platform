// The two grains of "turn" and the narrowing between the two state forms.
// spec: game-engine/domain-vocabulary
//
// A snake carries the turn it has advanced to; a state's CURRENT turn is the
// greatest turn any snake on it has reached. Deriving the state's turn rather
// than storing it is what makes holding every snake a no-op instead of a
// special case — nothing advances, so the maximum does not move and the state
// that comes back is the state that went in — and it removes a
// denormalisation that could disagree with the snakes it summarises.
import type {
  BoardOccupant,
  Cell,
  CentaurTeamId,
  GameState,
  PartialGameState,
  ProjectedSnake,
  SnakeId,
  TurnNumber,
} from "./types.js";

/** The state's current turn: the greatest turn any snake on it has reached. */
// spec: game-engine/domain-vocabulary#turns-at-two-grains
export function currentTurn(state: Pick<PartialGameState, "snakes">): TurnNumber {
  let max = 0;
  for (const snake of state.snakes) {
    if (snake.turn > max) max = snake.turn;
  }
  return max as TurnNumber;
}

/**
 * Whether an occupant is a projection rather than a whole snake. Together with
 * `occupiedCells` below this is the ONLY place the difference between the two
 * is decided: everything else reads `SnakeCore`, which they share.
 */
export function isProjection(occupant: BoardOccupant): occupant is ProjectedSnake {
  return "historic" in occupant;
}

/**
 * The cells an occupant stands in. A snake's body leads with its head; a
 * projection's segments do not have one — which is the whole of the difference,
 * and the reason this is a function rather than a shared field name.
 */
export function occupiedCells(occupant: BoardOccupant): ReadonlyArray<Cell> {
  return isProjection(occupant) ? occupant.segments : occupant.body;
}

/** The projection of a snake this state declined to model, if there is one. */
export function projectionOf(
  state: Pick<PartialGameState, "projections">,
  snakeId: SnakeId,
): ProjectedSnake | undefined {
  return state.projections.find((p) => p.snakeId === snakeId);
}

/**
 * How many of a projection's leading segments stand at cells no record names —
 * its head, plus one more for every turn resolved since it was held. A
 * comparison against the state rather than a stored field, so it can never
 * disagree with the turn it summarises.
 */
// spec: game-engine/held-snakes
export function unlocatedSegments(
  state: Pick<PartialGameState, "snakes">,
  projection: Pick<ProjectedSnake, "historic">,
): number {
  return currentTurn(state) - projection.historic.turn;
}

/**
 * Whether the state has nothing still projected. A projection is a snake this
 * resolution line declined to model, so while a live one stands there is no
 * turn at which every alive snake can be read whole. Dead projections do not
 * block: a snake that is gone leaves nothing to be uncertain about.
 */
export function isLockstep(state: Pick<PartialGameState, "projections">): boolean {
  return state.projections.every((p) => !p.alive);
}

/**
 * Narrow a partial state to the persisted form, or `null` while anything is
 * still projected. This is the SOLE way to obtain a `GameState`, which is what
 * stops a hypothetical being mistaken for — or persisted as — the game's
 * actual state.
 */
// spec: game-engine/domain-vocabulary#lockstep-is-the-game-state-invariant
export function narrowToGameState(state: PartialGameState): GameState | null {
  return isLockstep(state) ? (state as GameState) : null;
}

/**
 * Narrowing for callers that already know the state is in lockstep (a freshly
 * built board, a decoded recording): the same check, throwing rather than
 * returning null, so a violated assumption fails at the boundary that made it.
 */
export function asGameState(state: PartialGameState): GameState {
  const narrowed = narrowToGameState(state);
  if (narrowed === null) {
    const projected = state.projections
      .filter((p) => p.alive)
      .map((p) => `${p.snakeId} (held at turn ${p.historic.turn})`)
      .join(", ");
    throw new Error(
      `state at turn ${currentTurn(state)} still carries projected snakes: ${projected}`,
    );
  }
  return narrowed;
}

/**
 * Teams fielding a snake on this state, in first-appearance order — projections
 * included, because a hold is a statement about what a resolution models, never
 * about who is in the game.
 */
export function rosterOf(
  state: Pick<PartialGameState, "snakes" | "projections">,
): ReadonlyArray<CentaurTeamId> {
  const roster: CentaurTeamId[] = [];
  for (const snake of state.snakes) {
    if (!roster.includes(snake.centaurTeamId)) roster.push(snake.centaurTeamId);
  }
  for (const projection of state.projections) {
    if (!roster.includes(projection.centaurTeamId)) roster.push(projection.centaurTeamId);
  }
  return roster;
}
