// SHA-256 helpers for the handoff's PKCE-shaped challenge and the stored
// reference hash. Runs in Convex actions / http actions (Web Crypto).
// spec: identity-and-authorization/sign-in-handoff

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** A fresh high-entropy opaque value (32 random bytes, base64url). */
export function randomOpaqueValue(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
