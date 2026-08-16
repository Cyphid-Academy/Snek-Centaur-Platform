// The auth substrate: configuration invariants (Google-only, no password
// path, session floor), the published verification material, the
// fifteen-minute working credential, and stateful renewal.
//
// GOOGLE OAUTH IS CONFIG-ONLY OFFLINE: completing a Google sign-in takes
// Google, so no test here exercises the provider round trip. What the
// suite asserts instead is the CONFIGURATION — the google provider is the
// one human path and no password store exists — which is exactly the part
// the spec binds (the binding to Google is requirement text, the round
// trip is Google's).
// spec: identity-and-authorization/google-sign-in
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { WORKING_CREDENTIAL_LIFETIME_SECONDS, createAuthOptions } from "../convex/auth";
import {
  DEFAULT_SESSION_LIFETIME_SECONDS,
  SESSION_LIFETIME_FLOOR_SECONDS,
  sessionLifetimeSeconds,
} from "../convex/lib/sessionLifetime";
import { TEST_CONVEX_SITE_URL, makeHuman, setAuthEnv, setup, testSupport } from "./setup";

beforeAll(() => {
  setAuthEnv();
});

// A dummy ctx suffices to inspect configuration: nothing below invokes it.
// biome-ignore lint/suspicious/noExplicitAny: config inspection only.
const dummyCtx = {} as any;

describe("authentication configuration", () => {
  it("configures Google as the ONLY human authentication path", () => {
    // spec: identity-and-authorization/google-sign-in#google-account-specifically
    const options = createAuthOptions(dummyCtx);
    expect(options.socialProviders?.google).toBeDefined();
    const providers = Object.keys(options.socialProviders ?? {});
    expect(providers).toEqual(["google"]);
  });

  it("configures no password path and no independent human credential store", () => {
    // spec: identity-and-authorization/google-sign-in#no-human-shared-secrets
    const options = createAuthOptions(dummyCtx) as { emailAndPassword?: unknown };
    expect(options.emailAndPassword).toBeUndefined();
  });

  it("leaves account linking OFF — nothing auto-links by email", () => {
    // Better Auth's default declines to link accounts by matching email
    // unless linking is switched on; the option is deliberately absent.
    // spec: identity-and-authorization/linked-provider-credentials#no-auto-linking-by-email
    // design: "this asks the substrate's default behaviour, and that is deliberate"
    const options = createAuthOptions(dummyCtx) as { account?: unknown };
    expect(options.account).toBeUndefined();
  });
});

describe("session lifetime configuration", () => {
  // spec: identity-and-authorization/google-sign-in#session-lifetime-is-configured-above-a-floor
  it("defaults to seven days when unconfigured", () => {
    expect(sessionLifetimeSeconds(undefined)).toBe(DEFAULT_SESSION_LIFETIME_SECONDS);
  });

  it("accepts any lifetime at or above the four-hour floor", () => {
    expect(sessionLifetimeSeconds(`${SESSION_LIFETIME_FLOOR_SECONDS}`)).toBe(
      SESSION_LIFETIME_FLOOR_SECONDS,
    );
    expect(sessionLifetimeSeconds(`${14 * 24 * 60 * 60}`)).toBe(14 * 24 * 60 * 60);
  });

  it("THROWS at construction, naming the floor, when configured below it", () => {
    expect(() => sessionLifetimeSeconds("3600")).toThrow(/four-hour floor/);
    // And through the real construction path:
    Object.assign(process.env, { SESSION_LIFETIME_SECONDS: "3600" });
    try {
      expect(() => createAuthOptions(dummyCtx)).toThrow(/four-hour floor/);
    } finally {
      Reflect.deleteProperty(process.env, "SESSION_LIFETIME_SECONDS");
    }
  });

  it("rejects a malformed lifetime rather than guessing", () => {
    expect(() => sessionLifetimeSeconds("soon")).toThrow(/positive integer/);
  });
});

describe("published verification material", () => {
  it("serves a JWKS at the stable well-known address that jose accepts", async () => {
    // spec: identity-and-authorization/verification-without-shared-secrets
    const t = setup();
    const response = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    expect(response.status).toBe(200);
    const jwks = await response.json();
    expect(jwks.keys.length).toBeGreaterThan(0);
    // The keyset is usable for verification entirely on its own.
    expect(() => createLocalJWKSet(jwks)).not.toThrow();
  });

  it("publishes OIDC discovery at the well-known root", async () => {
    const t = setup();
    const response = await t.fetch("/.well-known/openid-configuration", { method: "GET" });
    // Served directly or via redirect to the api path — either way the
    // address is stable and answerable.
    expect([200, 301, 302]).toContain(response.status);
  });
});

describe("working credentials", () => {
  it("mints a working JWT under a live session with exp − iat = 15 minutes, verifiable against the served JWKS", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#only-the-stateful-session-outlives-the-bound
    const t = setup();
    const { userId } = await makeHuman(t, { name: "Signer" });
    const sessionToken = "session-token-for-signer";
    await t.mutation(testSupport.createSession, {
      userId,
      token: sessionToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const response = await t.fetch("/api/auth/convex/token", {
      method: "GET",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(response.status).toBe(200);
    const { token } = await response.json();
    expect(token).toBeTypeOf("string");

    const claims = decodeJwt(token);
    expect(claims.exp! - claims.iat!).toBe(WORKING_CREDENTIAL_LIFETIME_SECONDS);
    expect(claims.sub).toBe(userId);

    // Verifiable with the published material alone.
    // spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
    const jwksResponse = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const keySet = createLocalJWKSet(await jwksResponse.json());
    const { payload } = await jwtVerify(token, keySet, { audience: "convex" });
    expect(payload.iss).toBe(TEST_CONVEX_SITE_URL);
    expect(decodeProtectedHeader(token).alg).toBe("EdDSA");
  });

  it("carries the structured capability claim, admin designation included", async () => {
    // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
    const t = setup();
    const { userId } = await makeHuman(t, { name: "Admin Human", isAdmin: true });
    const sessionToken = "session-token-for-admin";
    await t.mutation(testSupport.createSession, {
      userId,
      token: sessionToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    const response = await t.fetch("/api/auth/convex/token", {
      method: "GET",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    const { token } = await response.json();
    const claims = decodeJwt(token) as Record<string, unknown>;
    expect(claims["cyphid.capabilities"]).toEqual([
      { verb: "use-platform" },
      { verb: "configure-games" },
      { verb: "designate-boards" },
      { verb: "issue-game-tokens" },
      { verb: "administer-platform" },
    ]);
  });

  it("refuses renewal once the session is revoked — renewal re-reads the session", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
    const t = setup();
    const { userId } = await makeHuman(t, { name: "Revoked" });
    const sessionToken = "session-token-to-revoke";
    await t.mutation(testSupport.createSession, {
      userId,
      token: sessionToken,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });

    const first = await t.fetch("/api/auth/convex/token", {
      method: "GET",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(first.status).toBe(200);

    await t.mutation(testSupport.revokeSession, { token: sessionToken });

    const second = await t.fetch("/api/auth/convex/token", {
      method: "GET",
      headers: { authorization: `Bearer ${sessionToken}` },
    });
    expect(second.status).toBe(401);
  });
});
