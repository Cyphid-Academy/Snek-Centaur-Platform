// The pre-launch configuration workflow, driven in a browser against the whole
// stack: a Convex deployment, the substituted identity provider standing in for
// Google's verification step, and the reference Server serving the surface.
//
// spec: game-configuration/config-lives-on-the-game
// spec: game-configuration/board-preview
// spec: game-configuration/board-preview-lock-in
// The mount at `/dev/game-configuration` is the surface with nothing around it,
// and what is behind its binding is the platform: a credential the page earned
// through the platform's own sign-in handoff, a game created by the real
// `createGame` mutation, and Convex's own query subscription. Nothing here
// reloads a page to see a write land, because nothing polls — an edit's effect
// arrives on the subscription that delivered the record in the first place.
//
// What only a browser and a real deployment together can claim: that an edit
// travels to the game's record, regenerates the board there, and comes back to
// every viewer of that game with the designation cleared or standing according
// to what was edited.
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { Human } from "./identity";
import { signIn } from "./identity";

const ROUTE = "/dev/game-configuration";

/**
 * This Server's ceiling, as the deployment's registry records it. Both are
 * `session` capabilities, so both survive the intersection a redeemed
 * credential is capped at — which is what makes the human on this page reach
 * the configuration surface's two functions and nothing else.
 * spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
 */
const CEILING = ["read-game-configuration", "configure-game"];

const grace: Human = { subject: "google-grace", email: "grace@example.test", name: "Grace" };

/** Long enough for a redirect chain, a redemption and a board generation. */
const ROUND_TRIP_MS = 30_000;

// The registry has no public write and should not have one: registering an
// issuer is an operator act. Re-registered per file rather than shared with the
// sign-in spec's registration — a registration replaces whatever was held for
// that issuer, and the two files want different ceilings.
test.beforeAll(async ({ convex, centaurServer }) => {
  await convex.run("registry:registerIssuer", {
    issuerId: centaurServer.url,
    verificationMaterialUrl: centaurServer.keysUrl,
    capabilityCeiling: CEILING,
    returnAddresses: [`${centaurServer.url}${ROUTE}`],
  });
});

test("a generation edit regenerates the board and clears the designation", async ({
  context,
  page,
  convex,
  centaurServer,
  identityProvider,
}) => {
  await signIn(context, convex.siteUrl, identityProvider, grace);
  await open(page, centaurServer.url);

  const before = await boardMarkup(page);

  // Designate the candidate on screen.
  // spec: game-configuration/board-preview-lock-in#lock-toggles-freely-before-launch
  await page.getByTestId("lock-toggle").click();
  await expect(page.getByTestId("lock-marker")).toBeAttached();

  // Then change an input the board is generated from.
  // spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
  await page.getByTestId("input-generation.hazardPercentage").fill("12");
  await page.getByTestId("input-generation.hazardPercentage").press("Tab");

  // No reload anywhere: the regeneration committed in the deployment arrives on
  // the subscription that delivered the record.
  await expect(page.getByTestId("lock-marker")).toHaveCount(0);
  await expect(page.getByTestId("lock-toggle")).toHaveText(/Lock this board in/);
  await expect(page.getByTestId("configuration-document")).toContainText('"hazardPercentage": 12');

  // One slot, overwritten: the candidate on screen is a different board, and no
  // archive of the previous one accumulates.
  // spec: game-configuration/board-preview#one-slot-no-archive
  await expect.poll(() => boardMarkup(page)).not.toBe(before);
});

test("a dynamic gameplay edit leaves a designated board standing", async ({
  context,
  page,
  convex,
  centaurServer,
  identityProvider,
}) => {
  await signIn(context, convex.siteUrl, identityProvider, grace);
  await open(page, centaurServer.url);

  await page.getByTestId("lock-toggle").click();
  await expect(page.getByTestId("lock-marker")).toBeAttached();
  const designated = await boardMarkup(page);

  // The turn limit is not an input the designated board was generated from, so
  // clearing the designation over it would discard a deliberate act for nothing.
  // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
  await page.getByTestId("input-runtime.maxTurns").fill("400");
  await page.getByTestId("input-runtime.maxTurns").press("Tab");

  await expect(page.getByTestId("configuration-document")).toContainText('"maxTurns": 400');
  await expect(page.getByTestId("lock-toggle")).toHaveText(/Release this board/);
  await expect(page.getByTestId("lock-marker")).toBeAttached();
  expect(await boardMarkup(page)).toBe(designated);
});

test("an out-of-range value is rejected by the record, structurally", async ({
  context,
  page,
  convex,
  centaurServer,
  identityProvider,
}) => {
  await signIn(context, convex.siteUrl, identityProvider, grace);
  await open(page, centaurServer.url);
  const before = await page.getByTestId("configuration-document").textContent();

  // Written past the widget's own advisory limits: the value reaches the
  // deployment, and the deployment is what refuses it — a client's inline
  // feedback merely spares the round-trip.
  // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
  await page.getByTestId("board-size-custom").fill("40");
  await page.getByTestId("board-size-custom").press("Tab");

  // Machine-readable, naming the parameter that failed rather than a sentence.
  // spec: global-invariants/client-truthfulness#rejections-reach-the-user
  await expect(page.getByTestId("rejection")).toContainText("generation.boardSize");
  await expect(page.getByTestId("rejection")).toContainText("out-of-range");

  // And nothing was stored: the record the subscription still delivers is the
  // one that stood before the refused write.
  expect(await page.getByTestId("configuration-document").textContent()).toBe(before);
});

test("two viewers of one game see the same board", async ({
  context,
  page,
  convex,
  centaurServer,
  identityProvider,
}) => {
  await signIn(context, convex.siteUrl, identityProvider, grace);
  await open(page, centaurServer.url);
  const gameId = await page.getByTestId("game-id").textContent();

  // A second page over the same game, earning its own credential through the
  // same handoff — two viewers, not two copies of one.
  const second = await context.newPage();
  await open(second, centaurServer.url, gameId ?? "");
  expect(await second.getByTestId("game-id").textContent()).toBe(gameId);

  const before = await boardMarkup(second);
  await page.getByTestId("input-generation.hazardPercentage").fill("14");
  await page.getByTestId("input-generation.hazardPercentage").press("Tab");

  // The second page reloads nothing and asks for nothing: the deployment
  // re-runs the query behind its subscription because the record it reads
  // changed.
  // spec: game-configuration/board-preview#all-viewers-in-sync
  await expect(second.getByTestId("configuration-document")).toContainText(
    '"hazardPercentage": 14',
  );
  await expect.poll(() => boardMarkup(second)).not.toBe(before);
  await second.close();
});

/**
 * The standalone mount, over a game on the deployment, for a context whose
 * human is already signed in at the platform's origin.
 *
 * `signIn` is the context's business and happens once per scenario: the session
 * cookie is one the browser stored from the platform's own `Set-Cookie`. Each
 * page then takes the platform's own sign-in handoff for itself, which finds
 * that session live and returns a reference without a provider leg — so two
 * pages of one context are two redemptions, each keeping what it earns.
 * spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
 * spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
 */
async function open(page: Page, serverUrl: string, gameId = ""): Promise<void> {
  await page.goto(`${serverUrl}${ROUTE}${gameId === "" ? "" : `?game=${gameId}`}`);
  await page.getByTestId("begin").click();
  await expect
    .poll(() => page.getByTestId("status").getAttribute("data-status"), {
      timeout: ROUND_TRIP_MS,
    })
    .toBe("ready");
  await expect(page.getByTestId("board-preview")).toBeVisible();
}

/** What the board rendering currently is, as a value two readings can differ in. */
function boardMarkup(page: Page): Promise<string> {
  return page.getByTestId("board-preview").innerHTML();
}
