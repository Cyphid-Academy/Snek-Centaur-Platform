import { describe, expect, it } from "vitest";
import { rngFromSeed, subSeed } from "./rng.js";
import { seed } from "./testkit.js";

describe("subSeed", () => {
  // spec: 01 Section 2.3 — BLAKE3 keyed hash, 32-byte output
  it("returns a 32-byte seed", () => {
    expect(subSeed(seed(1), "turn:0")).toHaveLength(32);
  });

  it("is deterministic for the same parent and tag", () => {
    expect(subSeed(seed(1), "turn:0")).toEqual(subSeed(seed(1), "turn:0"));
  });

  it("differs across tags", () => {
    expect(subSeed(seed(1), "turn:0")).not.toEqual(subSeed(seed(1), "turn:1"));
    expect(subSeed(seed(1), "hazards")).not.toEqual(subSeed(seed(1), "fertile"));
  });

  it("differs across parent seeds", () => {
    expect(subSeed(seed(1), "turn:0")).not.toEqual(subSeed(seed(2), "turn:0"));
  });

  it("rejects parent seeds that are not 32 bytes", () => {
    expect(() => subSeed(new Uint8Array(16), "turn:0")).toThrow();
  });
});

describe("rngFromSeed", () => {
  it("produces an identical sequence for an identical seed", () => {
    const a = rngFromSeed(seed(7));
    const b = rngFromSeed(seed(7));
    for (let i = 0; i < 100; i++) {
      expect(a.nextU32()).toBe(b.nextU32());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = rngFromSeed(seed(7));
    const b = rngFromSeed(seed(8));
    const seqA = Array.from({ length: 8 }, () => a.nextU32());
    const seqB = Array.from({ length: 8 }, () => b.nextU32());
    expect(seqA).not.toEqual(seqB);
  });

  it("nextU32 stays within uint32 range", () => {
    const rng = rngFromSeed(seed(3));
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextU32();
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("nextFloat stays within [0, 1)", () => {
    const rng = rngFromSeed(seed(3));
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextFloat();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("nextIntExclusive stays within [0, max)", () => {
    const rng = rngFromSeed(seed(3));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const v = rng.nextIntExclusive(5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
      seen.add(v);
    }
    // all five values should occur over 1000 draws
    expect(seen.size).toBe(5);
  });

  it("pick returns members of the input and throws on empty input", () => {
    const rng = rngFromSeed(seed(4));
    const items = ["a", "b", "c"];
    for (let i = 0; i < 50; i++) {
      expect(items).toContain(rng.pick(items));
    }
    expect(() => rng.pick([])).toThrow();
  });

  it("shuffle permutes in place, deterministically per seed", () => {
    const a = [1, 2, 3, 4, 5, 6, 7, 8];
    const b = [1, 2, 3, 4, 5, 6, 7, 8];
    rngFromSeed(seed(5)).shuffle(a);
    rngFromSeed(seed(5)).shuffle(b);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const c = [1, 2, 3, 4, 5, 6, 7, 8];
    rngFromSeed(seed(6)).shuffle(c);
    expect(c).not.toEqual(a); // overwhelmingly likely for distinct seeds
  });

  it("does not degenerate on an all-zero seed", () => {
    const rng = rngFromSeed(new Uint8Array(32));
    const draws = new Set(Array.from({ length: 16 }, () => rng.nextU32()));
    expect(draws.size).toBeGreaterThan(1);
  });

  it("has a roughly uniform nextFloat distribution", () => {
    const rng = rngFromSeed(seed(9));
    let sum = 0;
    const n = 10000;
    for (let i = 0; i < n; i++) sum += rng.nextFloat();
    expect(sum / n).toBeGreaterThan(0.45);
    expect(sum / n).toBeLessThan(0.55);
  });
});
