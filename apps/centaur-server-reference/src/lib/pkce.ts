// The keyless proof a page redeems a sign-in handoff with: a verifier the page
// keeps, and the challenge (base64url of its SHA-256) the reference is bound
// to. Shared by every page that begins a sign-in round trip.
// spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself

/** A fresh 32-byte verifier, base64url-encoded. */
export function newVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** The challenge a verifier answers to: base64url of its SHA-256. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function base64url(bytes: Uint8Array): string {
  // Byte by byte, never `String.fromCharCode(...bytes)`: spreading puts every
  // byte on the argument stack, which overflows on inputs a lot smaller than
  // "large" — fine at 32 bytes, a trap for the next reuse.
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
