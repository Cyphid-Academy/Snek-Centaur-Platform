// spec: identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/google-sign-in#session-survives-reload,
//       identity-and-authorization/client-credential-custody
// A human on a Snek Centaur Server's page, getting a credential from the
// platform and getting another one afterwards.
//
// One scenario, because one is what this member is for. `convex/signIn.test.ts`
// states in its own header the facts it cannot reach — that a browser carries
// the platform's session on a top-level navigation to another origin, that the
// entry route answers on that session without a provider, and that a page holds
// a verifier across the whole trip — and those are the only facts an assertion
// here is entitled to claim. Everything else about this flow is decided inside
// one runtime and is unit-tested there, at a hundredth of the cost.
//
// **Three engines, one file.** The projects in `playwright.config.ts` run this
// under Chromium by default and under Chromium, Firefox and WebKit from
// `pnpm e2e:browsers`. Nothing below names an engine: what the flow depends on
// — a cookie carried on a top-level cross-origin navigation, and session
// storage surviving one — is exactly where browsers differ, so running it three
// ways is worth more here than anywhere else in the repo.
//
// **What it is not.** The leg through Google is not exercised and cannot be:
// the provider library hard-codes Google's authorization and token endpoints,
// and a machine running this suite has no route to them. A session is therefore
// established by the substituted verification step (`identity.ts`) and carried
// into the browser as the cookie the platform issued, so the trip driven here is
// the one the entry route takes when a session is already live — the silent trip
// `session-survives-reload` turns on, and the only one a browser can be walked
// through here.
//
// **One fidelity limit, recorded rather than papered over.** Both origins are
// loopback and cookies ignore ports, so the platform's origin and the Server's
// are the same *site* to a browser here: the `sameSite: "lax"` restriction that
// makes this flow redirects rather than fetches is not itself under test.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { Human } from "./identity";
import { signIn } from "./identity";

/**
 * The registered Server's ceiling. Both are session capabilities, so both
 * survive the intersection a redeemed credential is capped at.
 */
const CEILING = ["issue-game-token", "review-attributed-actions"];

const ada: Human = { subject: "google-ada", email: "ada@example.test", name: "Ada" };

/** Long enough for a redirect chain plus a Convex action, short enough to fail fast. */
const ROUND_TRIP_MS = 30_000;

// The registry has no public write and should not have one: registering an
// issuer is an operator act. `registry:registerIssuer` is internal, and this
// reaches it with the deployment's own admin credential.
test.beforeAll(async ({ convex, centaurServer }) => {
  await convex.run("registry:registerIssuer", {
    issuerId: centaurServer.url,
    verificationMaterialUrl: centaurServer.keysUrl,
    capabilityCeiling: CEILING,
    returnAddresses: [`${centaurServer.url}/sign-in`],
  });
});

test("earns a credential from a Server's page, and earns another on a fresh visit", async ({
  context,
  page,
  convex,
  centaurServer,
  identityProvider,
}) => {
  // Signed in *through* the context, so the session cookie is one the browser
  // stored from the platform's own `Set-Cookie` — with the protection the
  // platform asked for — rather than one the harness reconstructed and placed.
  // The custody assertion below is only worth making because of that.
  // spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
  await signIn(context, convex.siteUrl, identityProvider, ada);
  await page.goto(`${centaurServer.url}/sign-in`);

  await page.getByTestId("begin").click();

  // The whole round trip: out to the platform on a top-level navigation
  // carrying the session cookie, answered without a provider, back to this
  // Server's registered address with a reference, redeemed with the verifier
  // this page kept across it, and the credential spent on a question the
  // platform answers only for the human it names.
  await expect.poll(() => status(page), { timeout: ROUND_TRIP_MS }).toBe("signed-in");

  await page.goto(`${centaurServer.url}/sign-in`);

  // Nothing of the credential survived the navigation — a page that had
  // persisted one would recover it and render signed-in — and the trip is on
  // offer again. Taking it costs no interactive sign-in, because what survived
  // is the platform session, in a cookie no page script could read while it did.
  // spec: identity-and-authorization/client-credential-custody#memory-only
  // spec: identity-and-authorization/client-credential-custody#the-session-is-the-only-thing-a-reload-recovers
  await expect.poll(() => status(page)).toBe("signed-out");
  await page.getByTestId("begin").click();
  await expect.poll(() => status(page), { timeout: ROUND_TRIP_MS }).toBe("signed-in");
});

/** What the page says it is, read from what it rendered rather than from its state. */
function status(page: Page): Promise<string | null> {
  return page.getByTestId("status").getAttribute("data-status");
}
