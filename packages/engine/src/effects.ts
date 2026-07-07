// Derived effect values. Pure O(k≤2) functions over `activeEffects`;
// the ONLY reads collision resolution performs. spec: 01 Section 2.7.
import type { SnakeState } from "./types.js";

// spec: 01-REQ-022
export function invulnerabilityLevel(snake: SnakeState): -1 | 0 | 1 {
  for (const e of snake.activeEffects) {
    if (e.family === "invulnerability") {
      return e.state === "buff" ? 1 : -1;
    }
  }
  return 0;
}

// spec: 01-REQ-023 — the invisibility collector (debuff-holder) stays visible.
export function isVisible(snake: SnakeState): boolean {
  for (const e of snake.activeEffects) {
    if (e.family === "invisibility" && e.state === "buff") {
      return false;
    }
  }
  return true;
}
