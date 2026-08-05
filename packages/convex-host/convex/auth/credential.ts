// spec: identity-and-authorization/sole-credential-issuer,
//       identity-and-authorization/audience-bound-tokens,
//       identity-and-authorization/capability-claim-structure,
//       identity-and-authorization/token-lifetime-and-refresh,
//       identity-and-authorization/verification-without-shared-secrets
// The one signing primitive behind every credential this deployment issues.
//
// ES256 (ECDSA on P-256) is the algorithm, and the choice is forced from
// outside rather than preferred. A game's SpacetimeDB instance validates these
// tokens itself off the published document, and that runtime's validator
// accepts RS256 and ES256 and refuses everything else (`InvalidAlgorithm`) —
// EdDSA among the refused.
//
// ES256 rather than RS256 because `publishedMaterial()` derives the public
// document from the signing JWK by dropping `d`. For P-256 that is the entire
// private component; for RSA it would leave `p`, `q`, `dp`, `dq` and `qi`
// behind, and the platform would serve its own signing key at a well-known
// address.
//
// Changing it touches this file and the deployment's publication
// (`deployment.ts`), which must agree.
import { type JWK, type JWTPayload, SignJWT, decodeJwt, importJWK, jwtVerify } from "jose";
import type { Capability } from "../capabilities";

const ALG = "ES256";

/**
 * Fifteen minutes, in seconds. Exported so a holder can renew ahead of expiry.
 *
 * spec: identity-and-authorization/token-lifetime-and-refresh#renewal-is-proactive-never-reactive
 */
export const CREDENTIAL_LIFETIME_SECONDS = 15 * 60;

/**
 * One capability the credential confers.
 *
 * spec: identity-and-authorization/capability-claim-structure#uniform-today-attenuable-tomorrow
 */
export interface CapabilityEntry {
  readonly capability: Capability;
}

/** The claims this deployment's credentials carry beyond the registered ones. */
export interface CredentialPayload extends JWTPayload {
  /** spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token */
  readonly cap: ReadonlyArray<CapabilityEntry>;
  /**
   * The service principal that obtained this credential to act with, where one
   * did — RFC 8693's actor claim.
   *
   * spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
   */
  readonly act?: string;
}

/**
 * What the well-known publication endpoint serves, and what a game instance is
 * seeded with at startup.
 *
 * spec: identity-and-authorization/verification-without-shared-secrets
 */
export interface PublishedMaterial {
  readonly issuer: string;
  readonly publicJwk: JWK;
}

/**
 * Mint a credential. `audience` is the one resource it may be used at, and
 * `subject` is the holder as that audience must read it.
 *
 * spec: identity-and-authorization/sole-credential-issuer
 */
export function mint(
  signingKey: CryptoKey,
  issuer: string,
  claims: { subject: string; audience: string; cap: ReadonlyArray<CapabilityEntry>; act?: string },
): Promise<string> {
  return new SignJWT({ cap: claims.cap, act: claims.act })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(issuer)
    .setSubject(claims.subject)
    .setAudience(claims.audience)
    .setIssuedAt()
    .setExpirationTime(`${CREDENTIAL_LIFETIME_SECONDS}s`)
    .sign(signingKey);
}

/**
 * Verify a credential presented at `audience`, using published material alone.
 *
 * spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
 */
export async function verify(
  token: string,
  material: PublishedMaterial,
  audience: string,
): Promise<CredentialPayload> {
  // On the *unverified* payload, deliberately. Trusting an unverified claim
  // here is sound because this check can only refuse: a forged `aud` buys an
  // attacker nothing but the verification below. Stricter than jose's own
  // matcher on purpose — a credential this deployment mints names exactly one
  // audience, so one naming several is refused at every audience it lists.
  // Peer assertions are NOT verified here (see `issuance.ts`), so RFC 7523's
  // array-`aud` allowance is not this check's concern.
  if (decodeJwt(token).aud !== audience) {
    throw new Error("credential names a different audience");
  }
  const key = await importJWK(material.publicJwk, ALG);
  const { payload } = await jwtVerify(token, key, {
    algorithms: [ALG],
    issuer: material.issuer,
    audience,
    // `exp` is *required*, not merely checked when offered: jose checks a claim
    // only where it is present, so a credential that declines to say when it
    // dies would otherwise verify forever. `iss` and `aud` need no entry — the
    // options above already make jose refuse a token omitting either. `sub` is
    // refused a line later by the principal decode, so a subject naming no
    // recognised kind and a missing subject are the same refusal.
    // spec: identity-and-authorization/token-lifetime-and-refresh
    requiredClaims: ["exp"],
  });
  return payload as CredentialPayload;
}
