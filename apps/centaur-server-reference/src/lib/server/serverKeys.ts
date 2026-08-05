// spec: centaur-server-runtime/server-key-publication
// This server's own signing key: generated on first boot with no operator
// action, persisted locally, published as a JWK Set by the well-known route.
//
// The private key never leaves this process's own storage — it is the one
// thing a Snek Centaur Server persists, and what it signs is the short-lived
// assertion the platform's issuance endpoint verifies against the public half
// published at `/.well-known/snek-server-keys`. Rotation is a local act:
// publish a new key beside the old and start signing with it; the platform
// re-reads the published set on meeting a key identifier it does not know.
//
// spec: centaur-server-runtime/server-key-publication#first-boot-needs-no-operator
// spec: identity-and-authorization/client-credential-custody#own-key-is-the-only-thing-at-rest
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type CryptoKey,
  type JWK,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
} from "jose";

/** The algorithm this server signs with — one of the two the platform accepts. */
const ALG = "ES256";

/** This server's key, both halves: the private key it signs with, the set it publishes. */
export interface ServerKeys {
  readonly signingKey: CryptoKey;
  /** The published JWK Set — public material only. */
  readonly publishedKeySet: { keys: JWK[] };
}

/** Where the key lives, unless the environment says otherwise. */
function keyPath(): string {
  return join(process.env["SNEK_SERVER_DATA_DIR"] ?? ".data", "server-signing-key.json");
}

let loaded: Promise<ServerKeys> | undefined;

/**
 * The server's keys, loading the persisted private JWK or generating one on
 * first boot. One key store per process; every reader shares it.
 */
export function serverKeys(): Promise<ServerKeys> {
  loaded ??= load();
  return loaded;
}

async function load(): Promise<ServerKeys> {
  const path = keyPath();
  let privateJwk: JWK;
  try {
    privateJwk = JSON.parse(readFileSync(path, "utf8")) as JWK;
  } catch {
    const { privateKey } = await generateKeyPair(ALG, { extractable: true });
    privateJwk = await exportJWK(privateKey);
    privateJwk.kid = await calculateJwkThumbprint(privateJwk);
    privateJwk.alg = ALG;
    mkdirSync(dirname(path), { recursive: true });
    // The private half, at rest under this server's own control and nowhere
    // else. 0o600 keeps it out of reach of other local users.
    writeFileSync(path, JSON.stringify(privateJwk, null, 2), { mode: 0o600 });
  }
  const signingKey = (await importJWK(privateJwk, ALG)) as CryptoKey;
  // The public half is the private JWK minus its private fields — the public
  // fields named explicitly, so a new field on the private shape is withheld
  // rather than published by default.
  const publicJwk: JWK = { use: "sig" };
  for (const field of ["kty", "crv", "x", "y", "kid", "alg"] as const) {
    const value = privateJwk[field];
    if (value !== undefined) (publicJwk as Record<string, unknown>)[field] = value;
  }
  return { signingKey, publishedKeySet: { keys: [publicJwk] } };
}
