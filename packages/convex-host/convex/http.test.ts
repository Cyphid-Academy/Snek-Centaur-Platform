// spec: identity-and-authorization/verification-without-shared-secrets
// The two addresses a party that holds nothing of this platform's arrives at.
//
// A game's SpacetimeDB instance is configured with the issuer at initialisation
// and finds everything else by itself, so these two documents are the whole of
// the arrangement — and they are reachable without a credential, which is what
// makes them worth pinning: nothing else on this surface is.
//
// Not asserted end to end. The route table is one runtime's, and what an
// end-to-end run adds is that the deployment *starts* — which it already proves
// by starting, since Convex rejects a deployment routing one path twice and
// Better Auth claims the discovery path too.
import { convexTest } from "convex-test";
import { beforeAll, expect, it } from "vitest";
import { publishedMaterial } from "./auth/deployment";
import { hostModules } from "./harness.testing";
import schema from "./schema";

const ISSUER = "https://platform.example";

beforeAll(async () => {
  process.env["CONVEX_SITE_URL"] = ISSUER;
  // A real key, because what these routes publish is derived from it and the
  // point of the pair is that the two cannot disagree.
  const { generateKeyPair, exportJWK } = await import("jose");
  const { privateKey } = await generateKeyPair("ES256", { extractable: true });
  process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(await exportJWK(privateKey));
});

it("points discovery at its own key set, and serves the public half there", async () => {
  const t = convexTest(schema, hostModules);

  const discovery = await (await t.fetch("/.well-known/openid-configuration")).json();
  const material = await (await t.fetch(new URL(discovery.jwks_uri).pathname)).json();

  expect(discovery.issuer).toBe(ISSUER);
  // Followed rather than assumed: a discovery document naming an address this
  // deployment does not serve is the failure that leaves an instance unable to
  // validate anything, and it looks like a working deployment from here.
  expect(material.keys).toEqual([publishedMaterial().publicJwk]);
  // The private half is what must never be at one of these addresses.
  expect(JSON.stringify(material)).not.toContain('"d"');
});
