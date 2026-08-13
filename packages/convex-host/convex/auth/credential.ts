// spec: identity-and-authorization/sole-credential-issuer,
//       identity-and-authorization/audience-bound-tokens,
//       identity-and-authorization/capability-claim-structure,
//       identity-and-authorization/token-lifetime-and-refresh,
//       identity-and-authorization/verification-without-shared-secrets
// The claim shape behind every credential this deployment issues, and the one
// verifier for them.
//
// The signing key itself lives with Better Auth's `jwt` plugin — see
// `deployment.ts`, whose `deploymentSigner`/`deploymentKeys` are the two
// halves this module's `mint` and `verify` are handed. What stays here is what
// no library owns: which claims a credential carries, for how long, and what a
// presented one must satisfy.
//
// RS256 is the algorithm, and the choice is forced from two sides rather than
// preferred: the key store is shared with the session JWTs and is
// single-algorithm, and `@convex-dev/better-auth` accepts only RS256 for the
// `customJwt` provider that store serves — while a game's SpacetimeDB instance
// validates these tokens itself off the published document with a validator
// that accepts RS256 and ES256 and refuses everything else
// (`InvalidAlgorithm`), EdDSA among the refused. The two constraints meet at
// RS256. Changing it touches this constant and the plugin configuration in
// `deployment.ts`, which must agree.
import { type JWTPayload, type JWTVerifyGetKey, decodeJwt, jwtVerify } from "jose";
import type { Capability } from "../capabilities";

export const CREDENTIAL_ALG = "RS256";
const ALG = CREDENTIAL_ALG;

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
 * The registered and platform claims `mint` assembles, as the signer receives
 * them — complete, so the signer adds a header and a signature and decides
 * nothing.
 */
export interface CredentialClaims extends JWTPayload {
  readonly cap: ReadonlyArray<CapabilityEntry>;
  readonly act?: string;
}

/**
 * Signs an assembled claim set with the deployment's key. The production one
 * is `deployment.ts`'s `deploymentSigner`; a unit test may supply its own.
 */
export type CredentialSigner = (payload: CredentialClaims) => Promise<string>;

/**
 * Mint a credential. `audience` is the one resource it may be used at, and
 * `subject` is the holder as that audience must read it.
 *
 * spec: identity-and-authorization/sole-credential-issuer
 */
export function mint(
  sign: CredentialSigner,
  issuer: string,
  claims: { subject: string; audience: string; cap: ReadonlyArray<CapabilityEntry>; act?: string },
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    cap: claims.cap,
    // Omitted rather than `undefined`: the claim either exists or does not.
    ...(claims.act === undefined ? {} : { act: claims.act }),
    iss: issuer,
    sub: claims.subject,
    aud: claims.audience,
    iat: now,
    // spec: identity-and-authorization/token-lifetime-and-refresh
    exp: now + CREDENTIAL_LIFETIME_SECONDS,
  });
}

/**
 * Verify a credential presented at `expected.audience`, using published
 * verification keys alone.
 *
 * spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
 */
export async function verify(
  token: string,
  keys: JWTVerifyGetKey,
  expected: { issuer: string; audience: string },
): Promise<CredentialPayload> {
  // On the *unverified* payload, deliberately. Trusting an unverified claim
  // here is sound because this check can only refuse: a forged `aud` buys an
  // attacker nothing but the verification below. Stricter than jose's own
  // matcher on purpose — a credential this deployment mints names exactly one
  // audience, so one naming several is refused at every audience it lists.
  // Peer assertions are NOT verified here (see `issuance.ts`), so RFC 7523's
  // array-`aud` allowance is not this check's concern.
  if (decodeJwt(token).aud !== expected.audience) {
    throw new Error("credential names a different audience");
  }
  const { payload } = await jwtVerify(token, keys, {
    algorithms: [ALG],
    issuer: expected.issuer,
    audience: expected.audience,
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
