// spec: identity-and-authorization/service-principal-assertions
// The one test that reaches across the Server/platform boundary: a real
// `signAssertion()` from the published library, fed to the real
// `exchangeAssertion` on the platform. Nothing here restates the algorithm or
// the audience — that is the point, and it is what makes the restatement in
// each package safe.
//
// Why the audience is deployment-scoped: `assertionAudience` in
// `convex/auth/deployment.ts`.
import { type JWK, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { type ServerIdentity, signAssertion } from "../../centaur-server-lib/src/credentials.js";
import { api } from "./_generated/api";
import { PLATFORM_AUDIENCE, assertionAudience } from "./auth/deployment";
import { platformSeed, seedModules, withComponents } from "./harness.testing";
import { forgetPublishedMaterial } from "./issuance";

const ISSUER = "https://issuance-under-test.example";
const SERVER = "server-under-contract.example";
const JWKS = "https://server-under-contract.example/.well-known/snek-server-keys";
/**
 * What the Server is configured with, and what this deployment answers to — one
 * value rather than a pair to keep aligned, because a Server names the
 * deployment by the identifier that deployment publishes for itself.
 */
const ISSUANCE_ENDPOINT = ISSUER;

/** A different deployment of the same platform — someone's fork. */
const FORK = "https://a-fork-of-the-platform.example";

let identity: ServerIdentity;
/** The public half, as the Server's own key-set document publishes it. */
let serverJwk: JWK;

beforeAll(async () => {
  // The key is generated for the algorithm the library signs with: a library
  // that moved to another one would produce assertions this key cannot even
  // sign, which is a louder failure than a mismatched `alg` header.
  const own = await generateKeyPair("ES256", { extractable: true });
  identity = {
    signingKey: own.privateKey,
    domain: SERVER,
    issuanceEndpoint: ISSUANCE_ENDPOINT,
  };
  serverJwk = await exportJWK(own.publicKey);

  const deployment = await generateKeyPair("ES256", { extractable: true });
  process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(await exportJWK(deployment.privateKey));
  process.env["CONVEX_SITE_URL"] = ISSUER;
});

beforeEach(() => {
  // The Server publishes its public half at the location its registration
  // records, and the platform fetches it from there — afresh per test, the
  // cache emptied so no test reads through another's.
  forgetPublishedMaterial();
  vi.stubGlobal(
    "fetch",
    async (url: string | URL) =>
      new Response(JSON.stringify({ keys: String(url) === JWKS ? [serverJwk] : [] }), {
        status: 200,
      }),
  );
});

const issuance = api.issuance;

async function withRegisteredServer() {
  const t = await withComponents({ platformExtras: seedModules });
  await t.mutation(platformSeed.seedIssuer, {
    issuerId: SERVER,
    verificationMaterialUrl: JWKS,
    capabilityCeiling: ["issue-game-credential", "issue-game-token"],
    returnAddresses: [],
  });
  return t;
}

describe("an assertion the published Server library actually produces", () => {
  it("is accepted by the platform, and earns a credential", async () => {
    const t = await withRegisteredServer();

    const assertion = await signAssertion(identity);

    const credential = await t.action(issuance.exchangeAssertion, {
      assertion,
      capabilities: ["issue-game-credential"],
    });

    expect(typeof credential).toBe("string");
    expect(decodeJwt(credential).aud).toBe(PLATFORM_AUDIENCE);
  });

  it("is refused a second time, but its successor is not", async () => {
    // The library sets a fresh `jti` per assertion and the platform records
    // accepted ones. Neither half is worth much without the other, and this is
    // the only place they meet.
    // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
    const t = await withRegisteredServer();
    const first = await signAssertion(identity);
    const second = await signAssertion(identity);
    expect(decodeJwt(first).jti).not.toBe(decodeJwt(second).jti);

    await t.action(issuance.exchangeAssertion, {
      assertion: first,
      capabilities: ["issue-game-credential"],
    });
    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: first,
        capabilities: ["issue-game-credential"],
      }),
    ).rejects.toThrow();

    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: second,
        capabilities: ["issue-game-credential"],
      }),
    ).resolves.toBeTypeOf("string");
  });

  it("names the deployment by the same identifier the deployment verifies against", async () => {
    // Checked directly rather than inferred from a passing exchange.
    expect(assertionAudience()).toBe(ISSUANCE_ENDPOINT);
    expect(decodeJwt(await signAssertion(identity)).aud).toBe(assertionAudience());
  });

  it("is refused when it was minted for a fork, even though the signature is genuine", async () => {
    // The relay attack, end to end: everything about this assertion checks out
    // except the audience — genuine signature, registered issuer and key, and a
    // `jti` this deployment has never seen. See `assertionAudience` in
    // `convex/auth/deployment.ts`.
    // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
    const t = await withRegisteredServer();
    const forTheFork = await signAssertion({ ...identity, issuanceEndpoint: FORK });

    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: forTheFork,
        capabilities: ["issue-game-credential"],
      }),
    ).rejects.toThrow();
  });
});
