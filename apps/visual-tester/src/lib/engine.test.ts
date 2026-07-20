import { DEFAULT_GAME_CONFIG, subSeed } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";

// Smoke test: the engine workspace dependency is importable from the app.
describe("engine wiring", () => {
  it("imports engine exports", () => {
    expect(DEFAULT_GAME_CONFIG.orchestration.boardSize).toBeGreaterThan(0);
    const seed = subSeed(new Uint8Array(32), "turn-1");
    expect(seed).toBeInstanceOf(Uint8Array);
    expect(seed.length).toBe(32);
  });
});
