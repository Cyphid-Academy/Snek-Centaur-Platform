// Randomness primitives. spec: 01 Section 2.3 (01-REQ-059, 01-REQ-060,
// 01-REQ-061).
//
// PRNG: Xoshiro256++ — 256-bit state mapping naturally to a 32-byte seed.
// Sub-seed derivation: BLAKE3 keyed hash (module 01 DOWNSTREAM IMPACT note 4:
// this is a hard dependency shared by every consumer; switching hash
// algorithms breaks replay reproducibility).
import { blake3 } from "@noble/hashes/blake3.js";

export interface Rng {
  nextU32(): number;
  nextFloat(): number; // [0, 1)
  nextIntExclusive(maxExclusive: number): number;
  pick<T>(items: ReadonlyArray<T>): T;
  shuffle<T>(items: T[]): void; // in place, Fisher-Yates
}

// spec: 01 Section 2.3 — subSeed(s, t) = BLAKE3(key = s, input = t).firstBytes(32)
export function subSeed(parent: Uint8Array, tag: string): Uint8Array {
  if (parent.length !== 32) {
    throw new Error(`subSeed: parent seed must be 32 bytes, got ${parent.length}`);
  }
  return blake3(new TextEncoder().encode(tag), { key: parent, dkLen: 32 });
}

const MASK64 = 0xffffffffffffffffn;

function rotl(x: bigint, k: bigint): bigint {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

// Xoshiro256++ (Blackman & Vigna). BigInt-based 64-bit arithmetic: the engine
// runs in three JS runtimes (02 §2.17 compatibility constraint), all of which
// support BigInt, and RNG draws are far off the turn-resolution hot path.
class Xoshiro256pp implements Rng {
  private s0: bigint;
  private s1: bigint;
  private s2: bigint;
  private s3: bigint;

  constructor(seed: Uint8Array) {
    if (seed.length !== 32) {
      throw new Error(`rngFromSeed: seed must be 32 bytes, got ${seed.length}`);
    }
    const view = new DataView(seed.buffer, seed.byteOffset, seed.byteLength);
    this.s0 = view.getBigUint64(0, true);
    this.s1 = view.getBigUint64(8, true);
    this.s2 = view.getBigUint64(16, true);
    this.s3 = view.getBigUint64(24, true);
    // The all-zero state is Xoshiro's single fixed point. Seeds normally come
    // from BLAKE3 output so this is unreachable in practice, but guard anyway.
    if (this.s0 === 0n && this.s1 === 0n && this.s2 === 0n && this.s3 === 0n) {
      this.s0 = 0x9e3779b97f4a7c15n; // golden-ratio constant
      this.s1 = 0xbf58476d1ce4e5b9n;
      this.s2 = 0x94d049bb133111ebn;
      this.s3 = 0xfe0286bd7a35c14fn;
    }
  }

  private nextU64(): bigint {
    const result = (rotl((this.s0 + this.s3) & MASK64, 23n) + this.s0) & MASK64;
    const t = (this.s1 << 17n) & MASK64;
    this.s2 ^= this.s0;
    this.s3 ^= this.s1;
    this.s1 ^= this.s2;
    this.s0 ^= this.s3;
    this.s2 ^= t;
    this.s3 = rotl(this.s3, 45n);
    return result;
  }

  nextU32(): number {
    return Number(this.nextU64() >> 32n);
  }

  nextFloat(): number {
    // 53 high bits → double in [0, 1)
    return Number(this.nextU64() >> 11n) * 2 ** -53;
  }

  nextIntExclusive(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new Error(`nextIntExclusive: maxExclusive must be a positive integer`);
    }
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  pick<T>(items: ReadonlyArray<T>): T {
    if (items.length === 0) throw new Error("pick: empty input");
    const item = items[this.nextIntExclusive(items.length)];
    return item as T;
  }

  shuffle<T>(items: T[]): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = this.nextIntExclusive(i + 1);
      const tmp = items[i] as T;
      items[i] = items[j] as T;
      items[j] = tmp;
    }
  }
}

export function rngFromSeed(seed: Uint8Array): Rng {
  return new Xoshiro256pp(seed);
}
