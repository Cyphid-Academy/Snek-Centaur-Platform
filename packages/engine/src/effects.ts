// Effect-domain helpers: derived values (pure O(k≤2) functions over
// `activeEffects` — the ONLY effect reads the interaction rules perform,
// spec: 01 §2.7) plus the effect-collection primitives that maintain the
// ≤1-per-family invariant (game-engine/team-potion-effects).
import type { EffectFamily, PotionEffect, SnakeState } from "./types.js";
import { ItemType } from "./types.js";

// spec: game-engine/team-potion-effects#three-turn-expiry — effects granted at turn T's commit
// carry expiryTurn = T + EFFECT_DURATION_TURNS and are active on the three
// following turns.
export const EFFECT_DURATION_TURNS = 3;

// spec: game-engine/team-potion-effects — the potion-type → effect-family mapping.
export function familyOfPotion(
  itemType: typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion,
): EffectFamily {
  return itemType === ItemType.InvulnPotion ? "invulnerability" : "invisibility";
}

/**
 * Remove the (at most one, per game-engine/team-potion-effects) effect of `family` from a
 * collection. Returns the removed effect, or undefined when none was held —
 * the single home of the family-removal surgery used by the commit's
 * cancel / replace / expiry passes.
 */
export function removeFamily(
  effects: ReadonlyArray<PotionEffect>,
  family: EffectFamily,
): { readonly effects: PotionEffect[]; readonly removed: PotionEffect | undefined } {
  const removed = effects.find((e) => e.family === family);
  if (removed === undefined) return { effects: [...effects], removed: undefined };
  return { effects: effects.filter((e) => e.family !== family), removed };
}

// spec: game-engine/collisions-and-severing
export function invulnerabilityLevel(snake: SnakeState): -1 | 0 | 1 {
  for (const e of snake.activeEffects) {
    if (e.family === "invulnerability") {
      return e.state === "buff" ? 1 : -1;
    }
  }
  return 0;
}

// spec: game-engine/invisibility — the invisibility collector (debuff-holder) stays visible.
export function isVisible(snake: SnakeState): boolean {
  for (const e of snake.activeEffects) {
    if (e.family === "invisibility" && e.state === "buff") {
      return false;
    }
  }
  return true;
}
