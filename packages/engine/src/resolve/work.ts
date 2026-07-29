// Mutable working copies of the domain state, used only inside turn
// resolution. Inputs to a resolution are never mutated; the commit stage
// writes to these copies and the orchestrator snapshots them back out.
// Items need no work copy: Item records are immutable — the working
// items *map* is the mutable container (commit deletes, spawning inserts).
import type { Cell, PotionEffect, ProjectedSnake, SnakeState, TurnNumber } from "../types.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/**
 * A mutable working copy of a domain type: every field writable, with the
 * effect list re-typed as a mutable array because the commit rewrites it.
 * Derived from the domain type by a mapped type, so a field added to
 * `SnakeCore` — or to either of its two subtypes — flows into the work copy
 * without a second declaration to keep in step.
 */
type Work<T> = Mutable<T> & { activeEffects: PotionEffect[] };

export type WorkSnake = Work<SnakeState> & { body: Cell[] };

// The same derivation, differing exactly where the domain types differ:
// `segments` for `body`, no `lastDirection` because nothing here chose one, and
// `historic` re-declared READONLY — a crystallized record stays crystallized, so the
// work copy offers no way to write it even inside the commit.
export type WorkProjection = Work<Omit<ProjectedSnake, "historic">> & {
  segments: Cell[];
  readonly historic: SnakeState;
};

/**
 * Either kind, as the commit and the rules hold them. The stages that do not
 * care which they have (team effects, expiry, the clock) are typed against this
 * and read only `SnakeCore` fields; the two that do go through `isProjection` /
 * `occupiedCells` in state.ts.
 */
export type WorkOccupant = WorkSnake | WorkProjection;

export function toWorkSnake(s: SnakeState): WorkSnake {
  return { ...s, body: [...s.body], activeEffects: [...s.activeEffects] };
}

export function toSnakeState(w: WorkSnake): SnakeState {
  return { ...w };
}

export function toWorkProjection(p: ProjectedSnake): WorkProjection {
  return { ...p, segments: [...p.segments], activeEffects: [...p.activeEffects] };
}

export function toProjectedSnake(w: WorkProjection): ProjectedSnake {
  return { ...w };
}

/**
 * The projection a snake held through this turn leaves behind, crystallizing
 * the snake itself into the historic record it carries. Its whole body
 * carries over as segments — the head cell included, because that cell is where
 * its own next segment goes, and the tail because a snake that reached food
 * keeps its final segment and a resolution that will not model a snake must not
 * assume the outcome that happens to be convenient. Health is `maxHealth` for
 * the same reason from the other side: it might have eaten.
 *
 * `turn` is the turn being resolved plus one, like every participant's — a
 * projection advances with the state. What it does not carry is a head.
 */
// spec: game-engine/held-snakes
export function projectHeldSnake(
  snake: WorkSnake,
  nextTurn: TurnNumber,
  maxHealth: number,
): WorkProjection {
  return {
    snakeId: snake.snakeId,
    letter: snake.letter,
    centaurTeamId: snake.centaurTeamId,
    segments: [...snake.body],
    health: maxHealth,
    activeEffects: [...snake.activeEffects],
    alive: snake.alive,
    turn: nextTurn,
    historic: toSnakeState(snake),
  };
}

/** Narrow a Map lookup that is guaranteed by construction to be present. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`invariant violated: missing ${what}`);
  return value;
}
