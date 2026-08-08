// The pre-launch configuration workflow, driven in a browser.
//
// spec: game-configuration/self-contained-configuration-surface#runs-with-no-host
// It runs against the reference app's standalone dev mount, which is the whole
// point of the mount: no Convex deployment, no sign-in, no host of any kind is
// stood up here, and the surface is fully usable anyway. The same component
// mounted over a live `convexBinding` is the same component; what this suite
// exercises is the component and the capability's rules, not the transport.
//
// What only a browser can claim: that an edit travels to the record and comes
// back as a rendered board, with the designation cleared or standing according
// to what was edited.
import { expect, test } from "./fixtures";

const ROUTE = "/dev/game-configuration";
const API = `${ROUTE}/api`;

interface Snapshot {
  readonly config: { readonly generation: Record<string, unknown> };
  readonly boardPreview: unknown;
  readonly boardPreviewLocked: boolean;
}

// Each scenario starts from an untouched record: the dev mount holds one game
// in the app process's memory, and a worker runs the whole file against one app.
test.beforeEach(async ({ page, referenceApp }) => {
  const reset = await page.request.post(`${referenceApp.url}${API}`, {
    data: { action: "reset" },
  });
  expect(reset.ok()).toBe(true);
});

test("a generation edit regenerates the board and clears the designation", async ({
  page,
  referenceApp,
}) => {
  await page.goto(`${referenceApp.url}${ROUTE}`);
  await expect(page.getByTestId("board-preview")).toBeVisible();

  const before = (await (await page.request.get(`${referenceApp.url}${API}`)).json()) as Snapshot;

  // Designate the candidate on screen.
  // spec: game-configuration/board-preview-lock-in#lock-toggles-freely-before-launch
  await page.getByTestId("lock-toggle").click();
  await expect(page.getByTestId("lock-marker")).toBeAttached();

  // Then change an input the board is generated from.
  // spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
  await page.getByTestId("input-generation.hazardPercentage").fill("12");
  await page.getByTestId("input-generation.hazardPercentage").press("Tab");

  await expect(page.getByTestId("lock-marker")).toHaveCount(0);
  await expect(page.getByTestId("lock-toggle")).toHaveText(/Lock this board in/);

  const after = (await (await page.request.get(`${referenceApp.url}${API}`)).json()) as Snapshot;
  expect(after.config.generation["hazardPercentage"]).toBe(12);
  expect(after.boardPreviewLocked).toBe(false);
  // One slot, overwritten: the candidate on screen is a different board, and no
  // archive of the previous one accumulates.
  // spec: game-configuration/board-preview#one-slot-no-archive
  expect(after.boardPreview).not.toEqual(before.boardPreview);
});

test("an out-of-range value is rejected by the record however it arrives", async ({
  page,
  referenceApp,
}) => {
  // No widget is involved: this is the mutation surface called directly, which
  // is the point — a client's inline feedback merely spares the round-trip.
  // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
  const current = (await (await page.request.get(`${referenceApp.url}${API}`)).json()) as Snapshot;
  const response = await page.request.post(`${referenceApp.url}${API}`, {
    data: {
      action: "updateConfiguration",
      generation: { ...current.config.generation, boardSize: 40 },
    },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(422);
  const rejection = (await response.json()) as {
    violations: ReadonlyArray<{ code: string; path?: string }>;
  };
  // Machine-readable, naming the parameter that failed rather than a sentence.
  expect(rejection.violations).toContainEqual(
    expect.objectContaining({ code: "out-of-range", path: "generation.boardSize" }),
  );

  const after = (await (await page.request.get(`${referenceApp.url}${API}`)).json()) as Snapshot;
  expect(after.config.generation["boardSize"]).toBe(current.config.generation["boardSize"]);
});

test("a dynamic gameplay edit leaves a designated board standing", async ({
  page,
  referenceApp,
}) => {
  await page.goto(`${referenceApp.url}${ROUTE}`);
  await expect(page.getByTestId("board-preview")).toBeVisible();

  await page.getByTestId("lock-toggle").click();
  await expect(page.getByTestId("lock-marker")).toBeAttached();
  const designated = (await (
    await page.request.get(`${referenceApp.url}${API}`)
  ).json()) as Snapshot;

  // The turn limit is not an input the designated board was generated from, so
  // clearing the designation over it would discard a deliberate act for nothing.
  // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
  await page.getByTestId("input-runtime.maxTurns").fill("400");
  await page.getByTestId("input-runtime.maxTurns").press("Tab");

  await expect(page.getByTestId("lock-toggle")).toHaveText(/Release this board/);
  await expect(page.getByTestId("lock-marker")).toBeAttached();

  const after = (await (await page.request.get(`${referenceApp.url}${API}`)).json()) as Snapshot;
  expect(after.boardPreviewLocked).toBe(true);
  expect(after.boardPreview).toEqual(designated.boardPreview);
});
