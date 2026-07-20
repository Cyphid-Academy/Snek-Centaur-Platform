// Game-seed helpers: hex <-> bytes plus the platform's turn-seed derivation.
import { subSeed } from "@cyphid/snek-engine";
import type { TurnNumber } from "@cyphid/snek-engine";

export const SEED_BYTES = 32;

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Strict parse of a 64-char lowercase/uppercase hex string into 32 bytes. */
export function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== SEED_BYTES * 2) return null;
  const out = new Uint8Array(SEED_BYTES);
  for (let i = 0; i < SEED_BYTES; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function randomSeed(): Uint8Array {
  const bytes = new Uint8Array(SEED_BYTES);
  crypto.getRandomValues(bytes);
  return bytes;
}

// spec: test-sequences/determinism#production-seed-derivation — turn seeds are
// derived exactly as the platform derives them for a live game.
export function turnSeedFor(gameSeed: Uint8Array, turnNumber: TurnNumber): Uint8Array {
  return subSeed(gameSeed, `turn-${turnNumber}`);
}
