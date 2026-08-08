// spec: identity-and-authorization/google-sign-in#session-survives-reload,
//       identity-and-authorization/sign-in-handoff
// The entry route reached by a browser that already has a session: a real
// sign-in through the deployment, then the already-signed-in branch answering
// off the session alone. Separate from `signIn.test.ts` because that file makes
// any fetch a failure and this one needs a key set answered.
import betterAuthTest from "@convex-dev/better-auth/test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { inPlatformComponent, withComponents } from "./harness.testing";

const SERVER_ID = "server.example";
const RETURN_ADDRESS = "https://server.example/sign-in";
const CLIENT_ID = "a-client.apps.googleusercontent.test";

/**
 * The substitute identity provider, standing where Google stands — the same
 * arrangement the end-to-end harness sets up, since a machine running tests has
 * no route to Google and nobody to click a consent screen.
 * spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
 */
const ISSUER = "https://substitute.example";

let assert: (subject: string, email: string) => Promise<string>;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
  const jwks = {
    keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "substitute" }],
  };
  // Answers the key set and nothing else: a fetch of any other address is this
  // test's own failure to keep the substitution to one step.
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    if (String(url) !== `${ISSUER}/jwks.json`) {
      throw new Error(`sign-in reached ${String(url)}`);
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

it("hands a browser that already has a session back to its Server, with no provider", async () => {
  const t = await withComponents({
    register: (harness) => betterAuthTest.register(harness as never, "betterAuth"),
  });

  await inPlatformComponent(t, (ctx) =>
    ctx.db.insert("trusted_issuers", {
      issuerId: SERVER_ID,
      verificationMaterialUrl: "https://server.example/.well-known/snek-server-keys",
      capabilityCeiling: ["issue-game-token"],
      returnAddresses: [RETURN_ADDRESS],
    }),
  );

  // Only verification is substituted, so the cookie below is one the platform
  // itself decided to set.
  const signedIn = await t.fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      provider: "google",
      idToken: { token: await assert("google-ada", "ada@example.test") },
    }),
  });
  expect(signedIn.status).toBe(200);

  const session = signedIn.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

  const begun = await t.fetch(
    `/sign-in?${new URLSearchParams({
      issuer: SERVER_ID,
      return: RETURN_ADDRESS,
      challenge: "a-challenge-the-page-kept-the-verifier-for",
    })}`,
    { headers: { cookie: session } },
  );

  // Straight back to the Server with a reference, rather than out to a consent
  // screen — a redirect issued off the session alone.
  expect(begun.status).toBe(302);
  expect(begun.headers.get("location")).toMatch(
    new RegExp(`^${RETURN_ADDRESS}\\?handoff=[0-9a-f-]{36}$`),
  );
});
