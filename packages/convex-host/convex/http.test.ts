// spec: identity-and-authorization/verification-without-shared-secrets
// The two addresses a party that holds nothing of this platform's arrives at.
//
// A game's SpacetimeDB instance is configured with the issuer at initialisation
// and finds everything else by itself, so these two documents are the whole of
// the arrangement — and they are reachable without a credential, which is what
// makes them worth pinning: nothing else on this surface is.
//
// The key set is Better Auth's `jwt` plugin's, from the same store everything
// is signed with, so what these tests pin is the served document itself: the
// shape its one hermetic consumer accepts, and the absence of anything
// private. Not asserted end to end. The route table is one runtime's, and what
// an end-to-end run adds is that the deployment *starts* — which it already
// proves by starting, since Convex rejects a deployment routing one path twice
// and Better Auth claims the discovery path too.
import type { JWK } from "jose";
import { beforeAll, expect, it } from "vitest";
import { mint } from "./auth/credential";
import { deploymentSigner, issuer } from "./auth/deployment";
import { verifyIssued, withComponents } from "./harness.testing";

const ISSUER = "https://platform.example";

/**
 * The algorithms a SpacetimeDB host will validate a token with — consumer
 * knowledge, not observable from this side; established by running one, in
 * `apps/e2e`. The same host discards an entire key set whose entry carries no
 * `kid` (`KeyError(MissingKeyId)`).
 */
const HOST_ACCEPTED_ALGORITHMS = ["RS256", "ES256"];

/**
 * Every field a served key is allowed to carry, stated independently of
 * whatever publishes it. An allow-list rather than a sweep for known-private
 * names: a sweep passes whenever the key happens to be one whose private
 * component is spelled `d`, so it would stay green through exactly the
 * migration it exists to guard.
 *
 * spec: global-invariants/credential-confinement#signing-keys-never-leave-convex
 */
const PUBLISHABLE_JWK_FIELDS = ["kty", "crv", "x", "y", "n", "e", "alg", "kid", "use", "key_ops"];

beforeAll(() => {
  process.env["CONVEX_SITE_URL"] = ISSUER;
});

it("points discovery at its own key set, and serves a key a game instance accepts", async () => {
  const t = await withComponents();

  const discovery = await (await t.fetch("/.well-known/openid-configuration")).json();
  expect(discovery.issuer).toBe(ISSUER);

  // Followed rather than assumed: a discovery document naming an address this
  // deployment does not serve is the failure that leaves an instance unable to
  // validate anything, and it looks like a working deployment from here.
  const material = await (await t.fetch(new URL(discovery.jwks_uri).pathname)).json();
  expect(material.keys).toHaveLength(1);

  const key = material.keys[0] as JWK;
  expect(key.kid).toEqual(expect.any(String));
  expect(HOST_ACCEPTED_ALGORITHMS).toContain(key.alg);
  // The private half is what must never be at one of these addresses —
  // asserted as the allow-list above, not a search for `d`.
  for (const field of Object.keys(key)) {
    expect(PUBLISHABLE_JWK_FIELDS).toContain(field);
  }
});

// spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
// spec: identity-and-authorization/verification-without-shared-secrets#same-material-platform-wide
// The full arrangement, exactly as a validating party runs it: a credential
// the deployment minted with its stored key, verified against nothing but the
// document served at the well-known address.
it("serves material that verifies what the deployment actually mints", async () => {
  const t = await withComponents();

  const token = await t.run(async (ctx) =>
    mint(await deploymentSigner(ctx), issuer(), {
      subject: "user:u1",
      audience: "snek-platform",
      cap: [],
    }),
  );

  const payload = await verifyIssued(t, token, { issuer: ISSUER, audience: "snek-platform" });
  expect(payload.sub).toBe("user:u1");
});
