// 2D Perlin gradient noise for fertile-tile generation.
// spec: game-engine/fertile-ground, 01 §2.5. Module-internal (not part of the 01 contract).
import type { Rng } from "./rng.js";

export interface Perlin2D {
  noise2D(x: number, y: number): number; // [-1, 1]
}

// Eight gradient directions: axis-aligned and diagonal, as in classic Perlin.
const GRADS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

// Diagonal gradients have length sqrt(2); dividing the surflet interpolation
// by sqrt(2) bounds the output to [-1, 1]. Only the *ranking* of scores is
// consumed downstream (01 §2.5 step 3), so uniform scaling is harmless.
const NORM = Math.SQRT2;

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Build a Perlin noise field whose permutation table is shuffled by `rng`.
 * The caller owns rng stream discipline (01 §2.3 context tags).
 */
export function makePerlin(rng: Rng): Perlin2D {
  const perm = new Array<number>(512);
  const base = Array.from({ length: 256 }, (_, i) => i);
  rng.shuffle(base);
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255] as number;

  function gradDot(hash: number, dx: number, dy: number): number {
    const g = GRADS[hash & 7] as readonly [number, number];
    return g[0] * dx + g[1] * dy;
  }

  return {
    noise2D(x: number, y: number): number {
      const xi = Math.floor(x) & 255;
      const yi = Math.floor(y) & 255;
      const xf = x - Math.floor(x);
      const yf = y - Math.floor(y);
      const u = fade(xf);
      const v = fade(yf);
      const aa = perm[(perm[xi] as number) + yi] as number;
      const ab = perm[(perm[xi] as number) + yi + 1] as number;
      const ba = perm[(perm[xi + 1] as number) + yi] as number;
      const bb = perm[(perm[xi + 1] as number) + yi + 1] as number;
      const x1 = lerp(gradDot(aa, xf, yf), gradDot(ba, xf - 1, yf), u);
      const x2 = lerp(gradDot(ab, xf, yf - 1), gradDot(bb, xf - 1, yf - 1), u);
      return lerp(x1, x2, v) / NORM;
    },
  };
}

/**
 * 4-octave fractal sum: each successive octave doubles the frequency of the
 * previous and halves its amplitude, normalised back into ~[-1, 1].
 * spec: game-engine/fertile-ground, 01 §2.5 step 2.
 */
export function fractalNoise2D(perlin: Perlin2D, x: number, y: number, baseFreq: number): number {
  let sum = 0;
  let amp = 1;
  let freq = baseFreq;
  let norm = 0;
  for (let i = 0; i < 4; i++) {
    sum += amp * perlin.noise2D(x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
