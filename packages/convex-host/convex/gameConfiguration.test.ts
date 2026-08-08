// The configuration record under test, through the deployment's own public
// surface with the platform component registered — no deployment, no browser,
// and no editing surface. Every write here is the "calling the mutation
// surface directly" arm of
// `closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client`:
// the record's answer is the same one an inline-validating widget would have
// spared the round trip on.
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-game-configuration";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import {
  type Harness,
  inPlatformComponent,
  platformSeed,
  seedModules,
  withComponents,
} from "./harness.testing";

const HUMAN = { subject: "user-1" };

const harness = async (): Promise<Harness> => await withComponents({ platformExtras: seedModules });

/** A signed-in human's view of the deployment. */
const asHuman = (t: Harness) => t.withIdentity(HUMAN);

const createGame = async (t: Harness, teams = 2): Promise<string> =>
  await asHuman(t).mutation(api.gameConfiguration.createGame, {
    roster: Array.from({ length: teams }, (_, index) => ({ teamId: `team-${index}` })),
  });

const read = async (t: Harness, gameId: string) =>
  await asHuman(t).query(api.gameConfiguration.gameConfiguration, { gameId });

/** The refusal payload of a `ConvexError`, or the message of anything else. */
async function refusalOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error instanceof ConvexError ? error.data : (error as Error).message;
  }
  throw new Error("expected a refusal");
}

let t: Harness;
beforeEach(async () => {
  t = await harness();
});

describe("the configuration record", () => {
  it("starts minimal: identity, roster, and every parameter at its default", async () => {
    // spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
    // spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
    const gameId = await createGame(t);
    const configuration = await read(t, gameId);

    expect(configuration?.config).toEqual(DEFAULT_GAME_CONFIG);
    expect(configuration?.boardPreviewLocked).toBe(false);
  });

  it("shows each game its own values, never another game's", async () => {
    // spec: game-configuration/config-lives-on-the-game#views-read-the-games-own-record
    const first = await createGame(t);
    const second = await createGame(t);
    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId: second,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 11 },
    });

    expect((await read(t, first))?.config.generation.boardSize).toBe(21);
    expect((await read(t, second))?.config.generation.boardSize).toBe(11);
  });
});

describe("bounds, at the record", () => {
  it("rejects a direct mutation setting boardSize out of range", async () => {
    // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
    const gameId = await createGame(t);

    const refusal = await refusalOf(
      asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
        gameId,
        generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 40 },
      }),
    );

    expect(refusal).toMatchObject({
      kind: "configuration-rejected",
      violations: [{ code: "out-of-range", path: "generation.boardSize", value: 40 }],
    });
    expect((await read(t, gameId))?.config.generation.boardSize).toBe(21);
  });

  it("rejects a gameplay parameter outside the engine's declared range", async () => {
    // spec: game-configuration/parameter-bounds-sourcing#live-game-bounds-are-reflected-not-owned
    const gameId = await createGame(t);

    const refusal = await refusalOf(
      asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
        gameId,
        runtime: { ...DEFAULT_GAME_CONFIG.runtime, hazardDamage: 101 },
      }),
    );

    expect(refusal).toMatchObject({
      violations: [{ code: "out-of-range", path: "runtime.hazardDamage" }],
    });
  });

  it("persists a gated dependent parameter rather than refusing it", async () => {
    // spec: game-configuration/conditional-parameter-semantics#gated-value-persists-and-is-ignored
    const gameId = await createGame(t);
    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      generation: {
        ...DEFAULT_GAME_CONFIG.generation,
        fertileGround: { density: 0, clustering: 17 },
      },
    });

    expect((await read(t, gameId))?.config.generation.fertileGround).toEqual({
      density: 0,
      clustering: 17,
    });
  });
});

describe("bounded game duration", () => {
  const runtimeWith = (maxTurns: number, maxGameDurationMs: number) => ({
    ...DEFAULT_GAME_CONFIG.runtime,
    maxTurns,
    maxGameDurationMs,
  });

  it("refuses the write that would leave a game with neither limit", async () => {
    // spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
    const gameId = await createGame(t);

    const refusal = await refusalOf(
      asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
        gameId,
        runtime: runtimeWith(0, 0),
      }),
    );

    expect(refusal).toMatchObject({ violations: [{ code: "unbounded-game" }] });
    // The check is on the POST-WRITE record, so what the record still holds is
    // the assertion that the write did not land.
    expect((await read(t, gameId))?.config.runtime.maxTurns).toBe(100);
  });

  it("accepts either limit alone, and both", async () => {
    const gameId = await createGame(t);
    for (const runtime of [
      runtimeWith(100, 0),
      runtimeWith(100, 600_000),
      runtimeWith(0, 600_000),
    ]) {
      await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, { gameId, runtime });
    }
    // spec: game-configuration/bounded-game-duration#a-duration-limit-alone-is-valid
    expect((await read(t, gameId))?.config.runtime).toMatchObject({
      maxTurns: 0,
      maxGameDurationMs: 600_000,
    });
  });

  it("switches which limit applies by setting the new one first", async () => {
    // spec: game-configuration/bounded-game-duration#switching-which-limit-applies
    const gameId = await createGame(t);
    // Disabling the turn limit first is the ordering that does not exist.
    expect(
      await refusalOf(
        asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
          gameId,
          runtime: runtimeWith(0, 0),
        }),
      ),
    ).toMatchObject({ violations: [{ code: "unbounded-game" }] });

    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      runtime: runtimeWith(100, 600_000),
    });
    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      runtime: runtimeWith(0, 600_000),
    });

    expect((await read(t, gameId))?.config.runtime).toMatchObject({
      maxTurns: 0,
      maxGameDurationMs: 600_000,
    });
  });
});

describe("the launch freeze", () => {
  it("refuses every write once the game is past its edit window", async () => {
    // spec: game-configuration/launch-freeze#post-launch-writes-rejected
    const gameId = await createGame(t);
    for (const status of ["playing", "finished"] as const) {
      await asHuman(t).mutation(platformSeed.setGameStatus, { gameId, status });

      expect(
        await refusalOf(
          asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
            gameId,
            runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 50 },
          }),
        ),
      ).toMatchObject({ kind: "configuration-frozen", status });
      expect(
        await refusalOf(
          asHuman(t).mutation(api.gameConfiguration.setPreviewLock, { gameId, locked: true }),
        ),
      ).toMatchObject({ kind: "configuration-frozen" });
    }
    expect((await read(t, gameId))?.config.runtime.maxTurns).toBe(100);
  });

  it("applies an edit made moments before launch", async () => {
    // spec: game-configuration/launch-freeze#editable-until-launch
    const gameId = await createGame(t);
    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 50 },
    });
    await asHuman(t).mutation(platformSeed.setGameStatus, { gameId, status: "playing" });

    expect((await read(t, gameId))?.config.runtime.maxTurns).toBe(50);
  });
});

describe("the board preview and its lock", () => {
  it("generates a board at creation, from the platform's own generator", async () => {
    // spec: game-configuration/board-preview#clients-render-never-generate
    const preview = (await read(t, await createGame(t)))?.boardPreview;

    expect(preview).toMatchObject({ kind: "generated" });
    if (preview?.kind !== "generated") throw new Error("expected a generated preview");
    expect(preview.board.boardSize).toBe(21);
    expect(preview.board.cells).toHaveLength(21 * 21);
    // Two teams of the default five snakes, each three segments on its start cell.
    expect(preview.snakes).toHaveLength(10);
    expect(preview.items).toHaveLength(10);
  });

  it("overwrites the one slot on a generation edit and clears the lock", async () => {
    // spec: game-configuration/board-preview#one-slot-no-archive
    // spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
    const gameId = await createGame(t);
    await asHuman(t).mutation(api.gameConfiguration.setPreviewLock, { gameId, locked: true });
    const before = await read(t, gameId);
    expect(before?.boardPreviewLocked).toBe(true);

    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 15 },
    });

    const after = await read(t, gameId);
    expect(after?.boardPreviewLocked).toBe(false);
    expect(after?.boardPreview).toMatchObject({ kind: "generated" });
    if (after?.boardPreview?.kind !== "generated") throw new Error("expected a generated preview");
    expect(after.boardPreview.board.boardSize).toBe(15);
    // One value, not an archive: the record holds a single preview field, and
    // the previous candidate is simply not there any more.
    expect(after.boardPreview).not.toEqual(before?.boardPreview);
  });

  it("leaves the lock and the preview standing on a dynamic gameplay edit", async () => {
    // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
    const gameId = await createGame(t);
    await asHuman(t).mutation(api.gameConfiguration.setPreviewLock, { gameId, locked: true });
    const before = await read(t, gameId);

    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 50, hazardDamage: 20 },
    });

    const after = await read(t, gameId);
    expect(after?.boardPreviewLocked).toBe(true);
    expect(after?.boardPreview).toEqual(before?.boardPreview);
  });

  it("toggles the lock freely, carrying no board data either way", async () => {
    // spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
    // spec: game-configuration/board-preview-lock-in#lock-toggles-freely-before-launch
    const gameId = await createGame(t);
    const preview = (await read(t, gameId))?.boardPreview;

    for (const locked of [true, false, true]) {
      await asHuman(t).mutation(api.gameConfiguration.setPreviewLock, { gameId, locked });
      expect((await read(t, gameId))?.boardPreviewLocked).toBe(locked);
    }
    // The designated value is the platform's own, unchanged by any toggle —
    // the mutation takes a boolean and a game, and there is nowhere to put a
    // board a client fabricated.
    expect((await read(t, gameId))?.boardPreview).toEqual(preview);
  });

  it("surfaces a structured infeasibility naming the constraint that failed", async () => {
    // spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
    const gameId = await createGame(t, 4);

    // The smallest board the vocabulary admits, with the most snakes per team
    // it admits, across four teams: no territory can seat its heads.
    await asHuman(t).mutation(api.gameConfiguration.updateConfiguration, {
      gameId,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 7, snakesPerTeam: 10 },
    });

    const preview = (await read(t, gameId))?.boardPreview;
    expect(preview).toMatchObject({ kind: "infeasible", attemptsUsed: 4 });
    if (preview?.kind !== "infeasible") throw new Error("expected an infeasibility");
    expect(preview.code).toBe("TERRITORY_PARITY_SHORTAGE");
    expect(preview.details.innerCellCount).toBe(25);
  });
});

describe("the board seed", () => {
  it("is stored, and is in no query's answer", async () => {
    // spec: game-configuration/board-generation-retry
    const gameId = await createGame(t);

    for (const answer of [
      await read(t, gameId),
      await asHuman(t).query(api.gameConfiguration.gameConfiguration, { gameId }),
    ]) {
      expect(JSON.stringify(answer)).not.toContain("boardSeed");
      expect(Object.keys(answer ?? {}).sort()).toEqual([
        "boardPreview",
        "boardPreviewLocked",
        "config",
      ]);
    }

    // It is genuinely on the record — the absence above is a selection, not an
    // omission at the write.
    const rows = await inPlatformComponent(t, async (ctx) => await ctx.db.query("games").collect());
    expect(rows[0]?.["boardSeed"]).toBeDefined();
  });
});
