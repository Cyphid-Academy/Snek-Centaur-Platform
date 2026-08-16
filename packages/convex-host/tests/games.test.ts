// convex-test suite over the HOST surface: the public pass-through functions
// dispatching into the mounted snek-platform component. What is under test
// here is the wiring — that every surface reaches the one component contract
// and gets back the same structured answers the component's own suite pins.
// Since the identity change, every call arrives as an authenticated human
// (the capability wrapper refuses everything else — see registry.test.ts).
// spec: global-invariants/one-contract-many-surfaces
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-game-configuration";
import { beforeAll, describe, expect, it } from "vitest";
import { TEAMS, gamesApi as games, makeHuman, setAuthEnv, setup } from "./setup";

beforeAll(() => {
  setAuthEnv();
});

/** Every object key reachable anywhere inside a value. */
function collectKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectKeys(entry, out);
    }
  } else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      out.add(key);
      collectKeys(entry, out);
    }
  }
  return out;
}

describe("host game-configuration surface", () => {
  it("carries the whole configure-lock-launch flow through to the component", async () => {
    const t = setup();
    const { identity } = await makeHuman(t);
    const asUser = t.withIdentity(identity);
    const created = await asUser.mutation(games.createGame, { roomId: null });
    expect(created.ok).toBe(true);
    expect(created.game.config).toEqual(DEFAULT_GAME_CONFIG);

    const rostered = await asUser.mutation(games.updateRoster, {
      gameId: created.gameId,
      teams: TEAMS,
    });
    expect(rostered.ok).toBe(true);
    expect(rostered.game.currentPreview).not.toBeNull();

    const locked = await asUser.mutation(games.setBoardLock, {
      gameId: created.gameId,
      locked: true,
    });
    expect(locked.ok).toBe(true);

    // What the subscription showed is what launches.
    // spec: game-configuration/board-preview-lock-in#locked-board-launches-exactly
    const designated = (await asUser.query(games.getGame, { gameId: created.gameId }))
      .currentPreview.result;
    const launched = await asUser.mutation(games.launchGame, { gameId: created.gameId });
    expect(launched.ok).toBe(true);
    expect(launched.game.phase).toBe("playing");
    expect(launched.game.startingState).toEqual(designated);

    const view = await asUser.query(games.getGame, { gameId: created.gameId });
    expect(view.phase).toBe("playing");
    // Component tables are isolated: the game lives in the component, and the
    // host reaches it only through the component's functions.
    // spec: global-invariants/state-confined-to-owning-runtime
  });

  it("rejects an out-of-range write identically through the host surface, naming the parameter", async () => {
    // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
    const t = setup();
    const { identity } = await makeHuman(t);
    const asUser = t.withIdentity(identity);
    const { gameId } = await asUser.mutation(games.createGame, { roomId: null });
    const result = await asUser.mutation(games.updateConfig, {
      gameId,
      config: {
        ...DEFAULT_GAME_CONFIG,
        generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 40 },
      },
    });
    // The identical structured rejection the component's own suite pins —
    // the host surface adds no translation and swallows nothing.
    // spec: global-invariants/client-truthfulness#rejections-reach-the-user
    expect(result).toEqual({
      ok: false,
      rejection: {
        kind: "invalid-parameter",
        path: "generation.boardSize",
        reason: "OUT_OF_RANGE",
        value: 40,
        min: 7,
        max: 32,
      },
    });
  });

  it("enforces the launch freeze and room exclusivity through the host surface", async () => {
    // spec: game-configuration/launch-freeze#post-launch-writes-rejected
    // spec: game-configuration/config-lives-on-the-game#one-game-configured-at-a-time
    const t = setup();
    const { identity } = await makeHuman(t);
    const asUser = t.withIdentity(identity);
    const first = await asUser.mutation(games.createGame, { roomId: "room-1" });
    const second = await asUser.mutation(games.createGame, { roomId: "room-1" });
    expect(second).toEqual({
      ok: false,
      rejection: { kind: "room-occupied", openGameId: first.gameId },
    });

    await asUser.mutation(games.updateRoster, { gameId: first.gameId, teams: TEAMS });
    await asUser.mutation(games.launchGame, { gameId: first.gameId });
    const postLaunch = await asUser.mutation(games.updateConfig, {
      gameId: first.gameId,
      config: DEFAULT_GAME_CONFIG,
    });
    expect(postLaunch).toEqual({
      ok: false,
      rejection: { kind: "wrong-phase", phase: "playing" },
    });
  });

  it("returns no seed and no hidden starting state through any host function", async () => {
    // spec: game-configuration/board-generation-retry ("accessible to no game client")
    // spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
    const t = setup();
    const { identity } = await makeHuman(t);
    const asUser = t.withIdentity(identity);
    const created = await asUser.mutation(games.createGame, { roomId: null });
    const rostered = await asUser.mutation(games.updateRoster, {
      gameId: created.gameId,
      teams: TEAMS,
    });
    // Unlocked launch: the fresh board persists hidden.
    const launched = await asUser.mutation(games.launchGame, { gameId: created.gameId });
    const view = await asUser.query(games.getGame, { gameId: created.gameId });
    expect(launched.game.startingStateHidden).toBe(true);
    expect(view.startingState).toBeNull();

    for (const publicReturn of [created, rostered, launched, view]) {
      const keys = collectKeys(publicReturn);
      expect(keys.has("seedHex")).toBe(false);
      expect(keys.has("seed")).toBe(false);
    }
  });
});
