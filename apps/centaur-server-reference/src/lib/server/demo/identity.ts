// Who is asking, checked against what the platform publishes.
//
// The play page's server has to know which human it is seating, and it is
// handed a platform credential to prove it. It verifies that credential the way
// any party validates one — against the verification material the platform
// publishes at a well-known address, resolved from the issuer this server was
// configured with and never from anything the credential itself names.
//
// **What this establishes, and what it does not.** It establishes that the
// platform issued a credential naming this human, which is all the seating desk
// needs. It is not an authorization decision and cannot stand in for one: the
// credential's audience is the platform, so presenting it here proves identity
// rather than conferring any right at this server. Everything that actually
// governs play is decided elsewhere and by someone else — the platform decides
// whether to issue a game token, and the game instance decides whether to admit
// one.
//
// spec: identity-and-authorization/verification-without-shared-secrets
// spec: identity-and-authorization/sole-credential-issuer#peer-tokens-carry-no-platform-authority
import { type JWTPayload, createRemoteJWKSet, jwtVerify } from "jose";

/** The platform's own origin, which is also the issuer of everything it signs. */
const platformIssuer = (): string => process.env["CONVEX_SITE_URL"] ?? "";

/**
 * One key set per issuer, held across requests. `jose` owns the fetch, caches
 * it, and reloads on meeting a key identifier it does not know — which is what
 * makes the platform's key rotation need no coordination with this server.
 */
let keys: ReturnType<typeof createRemoteJWKSet> | undefined;
let keysFor: string | undefined;

function publishedKeys(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (!keys || keysFor !== issuer) {
    keys = createRemoteJWKSet(new URL("/.well-known/jwks.json", issuer));
    keysFor = issuer;
  }
  return keys;
}

/** A human the platform vouched for. */
export interface VerifiedHuman {
  /** The platform's own durable identifier for them — the subject, undecorated. */
  readonly userId: string;
}

/**
 * The human a credential names, or a refusal.
 *
 * The subject grammar is the platform's: a human is `user:<id>`. A credential
 * whose subject names anything else — a Centaur Team, a registered system —
 * is refused here, because seating is a thing that happens to people.
 */
export async function verifyPlatformCredential(credential: string): Promise<VerifiedHuman> {
  const issuer = platformIssuer();
  if (!issuer) throw new Error("this server does not know which platform to verify against");
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(credential, publishedKeys(issuer), { issuer }));
  } catch {
    // One answer for every cryptographic refusal: what precisely failed is not
    // owed to a caller who could not present a valid credential.
    throw new Error("that is not a credential this platform signed");
  }
  const subject = payload.sub ?? "";
  const userId = subject.startsWith("user:") ? subject.slice("user:".length) : "";
  if (!userId) throw new Error("that credential names no human");
  return { userId };
}
