// Turn-seed derivation for Test Sequence replay.
//
// spec: test-sequences/determinism#production-seed-derivation — each turn's
// seed is derived from the document's single game seed exactly as the
// platform derives it for a live game, so hand-built sequences and recorded
// live games share one seed model.
// design: add-visual-tester (D4) — one game seed per sequence, no per-turn
// seeds that could disagree with the production derivation.

import { subSeed } from "@cyphid/snek-engine";

export function deriveTurnSeed(gameSeed: Uint8Array, turnNumber: number): Uint8Array {
  return subSeed(gameSeed, `turn-${turnNumber}`);
}
