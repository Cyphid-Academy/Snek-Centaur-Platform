// spec: test-sequences/determinism#production-seed-derivation — the helper
// must be byte-equal to the engine's own subSeed(gameSeed, "turn-" + T).
import { subSeed } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { gameSeed } from "./fixtures.js";
import { deriveTurnSeed } from "./seed.js";

describe("deriveTurnSeed", () => {
  it("is byte-equal to the engine derivation for a range of turn numbers", () => {
    const seed = gameSeed(42);
    for (const t of [0, 1, 2, 7, 10, 99, 1000]) {
      const derived = deriveTurnSeed(seed, t);
      const engine = subSeed(seed, `turn-${t}`);
      expect(derived.length).toBe(32);
      expect([...derived]).toEqual([...engine]);
    }
  });

  it("differs across turn numbers and game seeds", () => {
    expect(deriveTurnSeed(gameSeed(1), 1)).not.toEqual(deriveTurnSeed(gameSeed(1), 2));
    expect(deriveTurnSeed(gameSeed(1), 1)).not.toEqual(deriveTurnSeed(gameSeed(2), 1));
  });

  it("rejects seeds that are not 32 bytes (engine invariant)", () => {
    expect(() => deriveTurnSeed(new Uint8Array(16), 1)).toThrow();
  });
});
