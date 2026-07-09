// Event derivation support. spec: 01 §2.11 — the turn's events form a set;
// their canonical representation order is event-class-major, then
// primary-subject id, with (deterministic) insertion order as the stable
// tie-break.
import type { TurnEvent } from "../types.js";
import type { CertainDeathClaim } from "./claims.js";

// spec: 01 §2.11 — canonical event-class order.
const EVENT_CLASS: Record<TurnEvent["kind"], number> = {
  snake_moved: 1,
  snake_died: 2,
  snake_severed: 3,
  food_eaten: 4,
  potion_collected: 5,
  food_spawned: 6,
  potion_spawned: 7,
  effect_applied: 8,
  effect_cancelled: 9,
};

// spec: 01 §2.11 — death-cause precedence when multiple claims target one snake.
const CAUSE_PRECEDENCE: ReadonlyArray<CertainDeathClaim["cause"]> = [
  "head_to_head",
  "wall",
  "self_collision",
  "body_collision",
];

/** The single reported death claim for a snake with ≥1 certain-death claims. */
export function pickDeathClaim(claims: ReadonlyArray<CertainDeathClaim>): CertainDeathClaim {
  for (const cause of CAUSE_PRECEDENCE) {
    const claim = claims.find((c) => c.cause === cause);
    if (claim !== undefined) return claim;
  }
  throw new Error("invariant violated: no certain-death claim to pick");
}

export class EventBuffer {
  private readonly entries: Array<{ event: TurnEvent; sortId: number; seq: number }> = [];

  emit(event: TurnEvent, sortId: number): void {
    this.entries.push({ event, sortId, seq: this.entries.length });
  }

  ordered(): TurnEvent[] {
    return [...this.entries]
      .sort(
        (a, b) =>
          EVENT_CLASS[a.event.kind] - EVENT_CLASS[b.event.kind] ||
          a.sortId - b.sortId ||
          a.seq - b.seq,
      )
      .map((e) => e.event);
  }
}
