import { describe, expect, it } from "vitest";
import { fractalNoise2D, makePerlin } from "./perlin.js";
import { rngFromSeed } from "./rng.js";
import { seed } from "./testkit.js";

describe("perlin noise", () => {
  // spec: game-rules/fertile-ground / 01 §2.5 — deterministic 4-octave fractal Perlin
  it("is deterministic for the same seed", () => {
    const a = makePerlin(rngFromSeed(seed(1)));
    const b = makePerlin(rngFromSeed(seed(1)));
    for (let i = 0; i < 20; i++) {
      const x = i * 0.37;
      const y = i * 0.73;
      expect(a.noise2D(x, y)).toBe(b.noise2D(x, y));
    }
  });

  it("differs across seeds", () => {
    const a = makePerlin(rngFromSeed(seed(1)));
    const b = makePerlin(rngFromSeed(seed(2)));
    const va = Array.from({ length: 10 }, (_, i) => a.noise2D(i * 0.41 + 0.2, i * 0.59 + 0.3));
    const vb = Array.from({ length: 10 }, (_, i) => b.noise2D(i * 0.41 + 0.2, i * 0.59 + 0.3));
    expect(va).not.toEqual(vb);
  });

  it("stays within [-1, 1] and varies", () => {
    const p = makePerlin(rngFromSeed(seed(3)));
    const values = new Set<number>();
    for (let x = 0; x < 30; x++) {
      for (let y = 0; y < 30; y++) {
        const v = p.noise2D(x * 0.13 + 0.05, y * 0.17 + 0.05);
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
        values.add(v);
      }
    }
    expect(values.size).toBeGreaterThan(100);
  });

  it("fractalNoise2D normalises 4 octaves into ~[-1, 1]", () => {
    const p = makePerlin(rngFromSeed(seed(4)));
    for (let i = 0; i < 100; i++) {
      const v = fractalNoise2D(p, i * 0.29 + 0.11, i * 0.31 + 0.07, 1 / 8);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});
