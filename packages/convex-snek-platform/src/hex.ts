// Seed bytes at rest are hex strings: Convex documents store the game seed as
// a lowercase hex string rather than raw bytes, so the stored record stays
// greppable/diffable and the codec stays dependency-free (the engine's
// @noble/hashes hex helpers are that package's internal choice, not a public
// export, and game-configuration exports no codec of its own).
//
// The seed never leaves the platform: it is decoded only inside component
// functions to feed the one shared generator, and every public read strips it.
// spec: game-configuration/board-generation-retry

/** Lowercase hex rendering of a byte string. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/** Inverse of {@link bytesToHex}. Throws on non-hex input. */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`hex string has odd length ${hex.length}`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const pair = hex.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(pair)) {
      throw new Error(`not a hex string at offset ${i * 2}: "${pair}"`);
    }
    bytes[i] = Number.parseInt(pair, 16);
  }
  return bytes;
}
