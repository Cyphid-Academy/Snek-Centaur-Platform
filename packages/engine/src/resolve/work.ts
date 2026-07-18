// Mutable working copies of the domain state, used only inside turn
// resolution. Inputs to resolveTurn are never mutated; the commit stage
// writes to these copies and the orchestrator snapshots them back out.
// Items need no work copy: Item records are immutable — the working
// items *map* is the mutable container (commit deletes, spawning inserts).
import type { Cell, PotionEffect, SnakeState } from "../types.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// Derived from SnakeState via a mapped type so that a new SnakeState field
// flows through the work copy automatically — only fields with nested arrays
// need explicit clone handling in toWork().
export interface WorkSnake extends Mutable<Omit<SnakeState, "body" | "activeEffects">> {
  body: Cell[];
  activeEffects: PotionEffect[];
}

export function toWorkSnake(s: SnakeState): WorkSnake {
  return { ...s, body: [...s.body], activeEffects: [...s.activeEffects] };
}

export function toSnakeState(w: WorkSnake): SnakeState {
  return { ...w };
}

/** Narrow a Map lookup that is guaranteed by construction to be present. */
export function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`invariant violated: missing ${what}`);
  return value;
}
