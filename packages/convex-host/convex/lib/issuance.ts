// The service-principal assertion exchange: verification of a signed
// assertion against a registered principal's PUBLISHED material, and the
// transactional single-use record of accepted assertion identifiers.
//
// One exchange, two registrations: a Snek Centaur Server and a peer
// Cyphid system authenticate identically — a short-lived self-signed
// assertion naming the issuance endpoint — and differ only in what their
// registration records. The game-credential POLICY (game playing, team
// registered, registration is the team's) lives in convex/http.ts next to
// the endpoint; this module owns protocol verification and state.
// spec: identity-and-authorization/service-principal-assertions
// design: openspec/changes/migrate-identity-and-authorization/design.md
//        ("One exchange, two registrations")
import { v } from "convex/values";
import * as jose from "jose";
import { internalMutation, internalQuery } from "../_generated/server.js";

/** An assertion may live at most fifteen minutes. */
export const MAX_ASSERTION_LIFETIME_SECONDS = 15 * 60;

/** How many expired accepted-assertion rows one insert sweeps. */
const SWEEP_BATCH = 16;

// ---------------------------------------------------------------------------
// Registry + single-use state
// ---------------------------------------------------------------------------

/** Look up a registration in the trusted-issuer registry, as a set. */
// spec: identity-and-authorization/trusted-issuer-registry#the-set-is-never-assumed-singular
export const getRegistration = internalQuery({
  args: { issuerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trusted_issuers")
      .withIndex("by_issuerId", (q) => q.eq("issuerId", args.issuerId))
      .unique();
  },
});

/**
 * Accept an assertion identifier exactly once. The lookup and insert run
 * in one serializable transaction, so two presentations of the same jti
 * cannot both commit. Rows are expired on the ASSERTION lifetime — swept
 * opportunistically here, on insert — rather than retained indefinitely.
 * spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
 */
export const acceptJti = internalMutation({
  args: { jti: v.string(), expiresAtMs: v.number(), nowMs: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("accepted_assertions")
      .withIndex("by_jti", (q) => q.eq("jti", args.jti))
      .unique();
    if (existing !== null) {
      return { accepted: false as const };
    }
    await ctx.db.insert("accepted_assertions", { jti: args.jti, expiresAt: args.expiresAtMs });
    const stale = await ctx.db
      .query("accepted_assertions")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", args.nowMs))
      .take(SWEEP_BATCH);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { accepted: true as const };
  },
});

// ---------------------------------------------------------------------------
// Assertion verification against published material
// ---------------------------------------------------------------------------

/**
 * The fetch used to read a principal's published verification material.
 * Injectable so tests serve material locally; production leaves it as the
 * platform fetch.
 */
let materialFetch: typeof fetch = (input, init) => fetch(input, init);

export function __setMaterialFetchForTests(impl: typeof fetch | null): void {
  materialFetch = impl ?? ((input, init) => fetch(input, init));
}

/**
 * How long a fetched material set may be reused before it is re-read. Bounded
 * by the assertion lifetime: a key REMOVED upstream (a rotation that retires
 * the old key, or a revocation) stops verifying within this window, rather
 * than living indefinitely because the cache is only ever invalidated on a
 * key it does not recognise. A removed key is still a valid, unknown-to-be-bad
 * key — nothing forces a refetch — so a plain unknown-key trigger cannot catch
 * it; a time bound must.
 * spec: identity-and-authorization/service-principal-assertions#rotation-needs-no-coordination
 */
export const MATERIAL_CACHE_TTL_MS = MAX_ASSERTION_LIFETIME_SECONDS * 1000;

/** The clock the cache TTL reads — injectable so tests age the cache deterministically. */
let materialClock: () => number = () => Date.now();

export function __setMaterialClockForTests(fn: (() => number) | null): void {
  materialClock = fn ?? (() => Date.now());
}

/**
 * Per-URL cache of published material, TTL-bounded. The refetch-on-unknown-key
 * path handles a rotation that ADDS a key (new material alongside old); the
 * TTL additionally handles one that REMOVES a key, which no unknown-key
 * trigger would ever provoke.
 * spec: identity-and-authorization/service-principal-assertions#rotation-needs-no-coordination
 */
interface MaterialCacheEntry {
  readonly jwks: jose.JSONWebKeySet;
  readonly fetchedAtMs: number;
}
const materialCache = new Map<string, MaterialCacheEntry>();

export function __clearMaterialCacheForTests(): void {
  materialCache.clear();
}

function freshCached(materialUrl: string): jose.JSONWebKeySet | undefined {
  const entry = materialCache.get(materialUrl);
  if (entry === undefined) return undefined;
  if (materialClock() - entry.fetchedAtMs >= MATERIAL_CACHE_TTL_MS) return undefined;
  return entry.jwks;
}

async function fetchMaterial(materialUrl: string): Promise<jose.JSONWebKeySet> {
  const response = await materialFetch(materialUrl);
  if (!response.ok) {
    throw new Error(`verification material at ${materialUrl} answered ${response.status}`);
  }
  const jwks = (await response.json()) as jose.JSONWebKeySet;
  if (!Array.isArray(jwks.keys)) {
    throw new Error(`verification material at ${materialUrl} is not a JWKS`);
  }
  materialCache.set(materialUrl, { jwks, fetchedAtMs: materialClock() });
  return jwks;
}

export type AssertionRejection =
  | { readonly kind: "malformed-assertion"; readonly reason: string }
  | { readonly kind: "invalid-signature" }
  | { readonly kind: "wrong-audience" }
  | { readonly kind: "expired-assertion" }
  | { readonly kind: "assertion-lifetime-too-long" }
  | { readonly kind: "missing-jti" };

export interface VerifiedAssertion {
  readonly issuerId: string;
  readonly jti: string;
  readonly expiresAtMs: number;
  readonly payload: jose.JWTPayload;
}

/** The audience an assertion must name: the issuance endpoint, and it alone. */
export function issuanceEndpointAudience(): string {
  const { CONVEX_SITE_URL } = process.env;
  return `${CONVEX_SITE_URL ?? "http://127.0.0.1:3211"}/issuance/game-credential`;
}

/**
 * Verify a principal's signed assertion against the material published at
 * its registration's materialUrl: signature, audience (the issuance
 * endpoint only), expiry, and a bounded lifetime; the caller then runs
 * the single-use jti check transactionally via `acceptJti`.
 * spec: identity-and-authorization/service-principal-assertions
 */
export async function verifyAssertion(
  assertion: string,
  registration: { readonly issuerId: string; readonly materialUrl: string },
): Promise<
  | { readonly ok: true; readonly verified: VerifiedAssertion }
  | { readonly ok: false; readonly rejection: AssertionRejection }
> {
  const audience = issuanceEndpointAudience();

  const verifyAgainst = async (jwks: jose.JSONWebKeySet) => {
    const keySet = jose.createLocalJWKSet(jwks);
    return await jose.jwtVerify(assertion, keySet, {
      issuer: registration.issuerId,
      audience,
    });
  };

  let payload: jose.JWTPayload;
  try {
    // A cached set is used only while within the TTL; past it, the location is
    // re-read so a removed key stops verifying within the window.
    // spec: identity-and-authorization/service-principal-assertions#rotation-needs-no-coordination
    const cached = freshCached(registration.materialUrl);
    try {
      const jwks = cached ?? (await fetchMaterial(registration.materialUrl));
      ({ payload } = await verifyAgainst(jwks));
    } catch (error) {
      // A key the cached material does not know: re-read the published
      // location once and retry — rotation that ADDS a key needs no
      // coordination.
      // spec: identity-and-authorization/service-principal-assertions#rotation-needs-no-coordination
      if (cached !== undefined && isUnknownKeyError(error)) {
        ({ payload } = await verifyAgainst(await fetchMaterial(registration.materialUrl)));
      } else {
        throw error;
      }
    }
  } catch (error) {
    return { ok: false, rejection: classifyJoseError(error) };
  }

  if (typeof payload.jti !== "string" || payload.jti.length === 0) {
    return { ok: false, rejection: { kind: "missing-jti" } };
  }
  if (typeof payload.exp !== "number") {
    return { ok: false, rejection: { kind: "malformed-assertion", reason: "missing exp" } };
  }
  // Short-lived by construction: an assertion whose lifetime exceeds the
  // fifteen-minute bound is refused even while unexpired.
  if (payload.exp > Date.now() / 1000 + MAX_ASSERTION_LIFETIME_SECONDS) {
    return { ok: false, rejection: { kind: "assertion-lifetime-too-long" } };
  }
  return {
    ok: true,
    verified: {
      issuerId: registration.issuerId,
      jti: payload.jti,
      expiresAtMs: payload.exp * 1000,
      payload,
    },
  };
}

function isUnknownKeyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "JWKSNoMatchingKey" ||
      (error as { code?: string }).code === "ERR_JWKS_NO_MATCHING_KEY")
  );
}

function classifyJoseError(error: unknown): AssertionRejection {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") {
      return { kind: "expired-assertion" };
    }
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
      const claim = (error as { claim?: string }).claim;
      if (claim === "aud") return { kind: "wrong-audience" };
      if (claim === "iss") return { kind: "malformed-assertion", reason: "issuer mismatch" };
      return { kind: "malformed-assertion", reason: `claim ${claim ?? "unknown"} invalid` };
    }
    if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || code === "ERR_JWKS_NO_MATCHING_KEY") {
      return { kind: "invalid-signature" };
    }
    return { kind: "malformed-assertion", reason: error.message };
  }
  return { kind: "malformed-assertion", reason: "unknown error" };
}
