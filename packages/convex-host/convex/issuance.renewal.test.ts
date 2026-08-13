// spec: identity-and-authorization/token-lifetime-and-refresh#renewal-does-not-interrupt-a-live-session,
//       identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session,
//       identity-and-authorization/token-lifetime-and-refresh#only-the-stateful-session-outlives-the-bound
// The renewal chain, end to end through a real session: sign in through the
// deployment, arrive at the entry route on the session cookie, redeem the
// handoff for a credential and the chain's first link, and rotate — then end
// the session and watch rotation die with it. Separate from `signIn.test.ts`
// because that file makes any fetch a failure and this one needs a key set
// answered, exactly as `signIn.session.test.ts` does.
import betterAuthTest from "@convex-dev/better-auth/test";
import { SignJWT, base64url, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import type { CredentialPayload } from "./auth/credential";
import { type Harness, inPlatformComponent, withComponents } from "./harness.testing";

const SERVER_ID = "server.example";
const RETURN_ADDRESS = "https://server.example/sign-in";
const CLIENT_ID = "a-client.apps.googleusercontent.test";

/**
 * The substitute identity provider, standing where Google stands — the same
 * arrangement the end-to-end harness sets up.
 * spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
 */
const ISSUER = "https://substitute.example";

let assert: (subject: string, email: string) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwks = {
    keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "substitute" }],
  };
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    if (String(url) !== `${ISSUER}/jwks.json`) {
      throw new Error(`renewal reached ${String(url)}`);
    }
    return new Response(JSON.stringify(jwks), {
      headers: { "content-type": "application/json" },
    });
  });

  vi.stubEnv("CONVEX_SITE_URL", "https://platform.example");
  vi.stubEnv("SITE_URL", "https://platform.example");
  vi.stubEnv("BETTER_AUTH_SECRET", "a-secret-long-enough-for-better-auth-validation");
  vi.stubEnv("GOOGLE_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "a-client-secret");
  vi.stubEnv("SUBSTITUTE_IDENTITY_ISSUER", ISSUER);
  vi.stubEnv("SUBSTITUTE_IDENTITY_JWKS_URL", `${ISSUER}/jwks.json`);

  assert = (subject, email) =>
    new SignJWT({ email, email_verified: true, name: email })
      .setProtectedHeader({ alg: "RS256", kid: "substitute" })
      .setIssuer(ISSUER)
      .setSubject(subject)
      .setAudience(CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(privateKey);
});

afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

/** A harness with one registered Server whose ceiling includes renewal. */
async function setup(): Promise<Harness> {
  const t = await withComponents({
    register: (harness) => betterAuthTest.register(harness as never, "betterAuth"),
  });
  await inPlatformComponent(t, (ctx) =>
    ctx.db.insert("trusted_issuers", {
      issuerId: SERVER_ID,
      verificationMaterialUrl: "https://server.example/.well-known/snek-server-keys",
      capabilityCeiling: ["issue-game-token", "renew-credential"],
      returnAddresses: [RETURN_ADDRESS],
    }),
  );
  return t;
}

/** Sign one human in through the deployment and answer with their cookie header. */
async function signedInCookie(t: Harness, subject: string, email: string): Promise<string> {
  const signedIn = await t.fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ provider: "google", idToken: { token: await assert(subject, email) } }),
  });
  expect(signedIn.status).toBe(200);
  return signedIn.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

const newVerifier = () => base64url.encode(crypto.getRandomValues(new Uint8Array(32)));

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}

/** The whole web trip: entry on the cookie, reference back, redemption. */
async function redeemedThroughSession(
  t: Harness,
  cookie: string,
): Promise<{ credential: string; renewal?: string }> {
  const verifier = newVerifier();
  const begun = await t.fetch(
    `/sign-in?${new URLSearchParams({
      issuer: SERVER_ID,
      return: RETURN_ADDRESS,
      challenge: await challengeFor(verifier),
    })}`,
    { headers: { cookie } },
  );
  expect(begun.status).toBe(302);
  const reference = new URL(begun.headers.get("location") ?? "").searchParams.get(
    "handoff",
  ) as string;
  return await t.action(api.issuance.redeemSignInHandoff, { reference, verifier });
}

describe("the renewal chain", () => {
  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-does-not-interrupt-a-live-session
  // spec: identity-and-authorization/token-lifetime-and-refresh#refresh-without-reauth
  it("rotates: a fresh working credential and the next link, with no interactive step", async () => {
    const t = await setup();
    const cookie = await signedInCookie(t, "google-ada", "ada@example.test");
    const grant = await redeemedThroughSession(t, cookie);

    expect(grant.renewal).toBeDefined();
    const renewed = await t.action(api.issuance.renewCredential, {
      credential: grant.credential,
      renewal: grant.renewal as string,
    });

    // The renewed credential names the same human through the same Server, and
    // its capabilities were re-read from the registration rather than copied.
    const payload = decodeJwt(renewed.credential) as CredentialPayload;
    expect(payload.sub).toBe(decodeJwt(grant.credential).sub);
    expect(payload.act).toBe(SERVER_ID);
    expect(payload.cap.map((entry) => entry.capability)).toEqual([
      "issue-game-token",
      "renew-credential",
    ]);
    // The next link is a new value, not the presented one handed back.
    expect(renewed.renewal).not.toBe(grant.renewal);
  });

  // A link is spent by the rotation that presents it, whatever its remaining
  // lifetime — the handoff reference's single-use rule, kept down the chain.
  // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
  it("refuses a link presented a second time", async () => {
    const t = await setup();
    const cookie = await signedInCookie(t, "google-ada", "ada@example.test");
    const grant = await redeemedThroughSession(t, cookie);

    await t.action(api.issuance.renewCredential, {
      credential: grant.credential,
      renewal: grant.renewal as string,
    });

    await expect(
      t.action(api.issuance.renewCredential, {
        credential: grant.credential,
        renewal: grant.renewal as string,
      }),
    ).rejects.toThrow(/no such renewal credential/);
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
  // The session is re-read at the moment of rotation, not remembered from
  // redemption: sign-out ends the chain in the same instant it ends the
  // session, whatever the links' remaining lifetime.
  it("refuses rotation once the session it was forged under has ended", async () => {
    const t = await setup();
    const cookie = await signedInCookie(t, "google-ada", "ada@example.test");
    const grant = await redeemedThroughSession(t, cookie);

    const signedOut = await t.fetch("/api/auth/sign-out", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    });
    expect(signedOut.status).toBe(200);

    await expect(
      t.action(api.issuance.renewCredential, {
        credential: grant.credential,
        renewal: grant.renewal as string,
      }),
    ).rejects.toThrow(/session.*ended/);
  });

  // spec: identity-and-authorization/anonymous-reach#credentialed-by-default
  // Renewal is not anonymously reachable: a link alone, without the working
  // credential it renews, reaches nothing — so the anonymous surface stays at
  // exactly four capabilities.
  it("refuses a link presented without the working credential", async () => {
    const t = await setup();
    const cookie = await signedInCookie(t, "google-ada", "ada@example.test");
    const grant = await redeemedThroughSession(t, cookie);

    await expect(
      t.action(api.issuance.renewCredential, { renewal: grant.renewal as string }),
    ).rejects.toThrow(/no capability renew-credential/);
  });

  // Two credentials stolen separately do not assemble into a renewal: the
  // chain answers only for the human the presented credential names.
  it("refuses a link that names a different human than the credential", async () => {
    const t = await setup();
    const adaGrant = await redeemedThroughSession(
      t,
      await signedInCookie(t, "google-ada", "ada@example.test"),
    );
    const graceGrant = await redeemedThroughSession(
      t,
      await signedInCookie(t, "google-grace", "grace@example.test"),
    );

    await expect(
      t.action(api.issuance.renewCredential, {
        credential: adaGrant.credential,
        renewal: graceGrant.renewal as string,
      }),
    ).rejects.toThrow(/names a different human/);
  });

  // A handoff minted where no session record is readable — the
  // `beginSignInHandoff` mutation, authenticated by a resolved identity alone —
  // starts no chain: its redeemer holds a live `ctx.auth` session and renews by
  // the route it arrived through instead.
  it("starts no chain for a handoff minted outside a readable session", async () => {
    const t = await setup();
    const verifier = newVerifier();
    const returnUrl = await t
      .withIdentity({ subject: "user-42" })
      .mutation(api.issuance.beginSignInHandoff, {
        issuerId: SERVER_ID,
        returnAddress: RETURN_ADDRESS,
        challenge: await challengeFor(verifier),
      });
    const reference = new URL(returnUrl).searchParams.get("handoff") as string;

    const grant = await t.action(api.issuance.redeemSignInHandoff, { reference, verifier });

    expect(grant.credential).toBeDefined();
    expect(grant.renewal).toBeUndefined();
  });
});
