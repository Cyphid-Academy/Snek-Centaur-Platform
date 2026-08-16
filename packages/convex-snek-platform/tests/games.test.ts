// convex-test suite over the snek-platform component's games functions:
// every write runs the pure state machine inside a real (fake-backed) Convex
// mutation, so what is asserted here is the PERSISTED outcome — the record a
// concurrent viewer would read — not just the pure layer's return value.
//
// The pure state machine's own matrix (validation cases, transition edges)
// is covered in @cyphid/snek-game-configuration's record.test.ts; this suite
// covers what only the store can show: persistence, exclusivity, redaction,
// and the same-transaction coupling of edit + regenerate + lock-clear.
import type { GameConfig } from "@cyphid/snek-game-configuration";
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-game-configuration";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { api } from "../component/_generated/api";
import schema from "../component/schema";

// The offline-generated api is the untyped AnyApi stub, whose index-signature
// access the workspace's strict tsconfig rejects; this facade names the
// component's function references once. Args/returns stay `any` — the suite
// asserts on runtime shapes deliberately.
interface GamesApi {
  readonly createGame: FunctionReference<"mutation">;
  readonly getGame: FunctionReference<"query">;
  readonly getGameInternal: FunctionReference<"query">;
  readonly updateConfig: FunctionReference<"mutation">;
  readonly updateRoster: FunctionReference<"mutation">;
  readonly setBoardLock: FunctionReference<"mutation">;
  readonly launchGame: FunctionReference<"mutation">;
  readonly concludeWithoutLaunch: FunctionReference<"mutation">;
}
const games = (api as unknown as { games: GamesApi }).games;

const modules = import.meta.glob("../component/**/*.ts");

function setup() {
  return convexTest(schema, modules);
}

const TEAMS = [
  { centaurTeamId: "team-red", name: "Red" },
  { centaurTeamId: "team-blue", name: "Blue" },
];

const FOUR_TEAMS = [
  ...TEAMS,
  { centaurTeamId: "team-green", name: "Green" },
  { centaurTeamId: "team-gold", name: "Gold" },
];

function withGeneration(patch: Partial<GameConfig["generation"]>): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    generation: { ...DEFAULT_GAME_CONFIG.generation, ...patch },
  };
}

function withRuntime(patch: Partial<GameConfig["runtime"]>): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    runtime: { ...DEFAULT_GAME_CONFIG.runtime, ...patch },
  };
}

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

describe("createGame", () => {
  it("creates the minimal record with every parameter at its default", async () => {
    // spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
    const t = setup();
    const created = await t.mutation(games.createGame, { roomId: null });
    expect(created.ok).toBe(true);
    expect(created.game.phase).toBe("configuring");
    expect(created.game.config).toEqual(DEFAULT_GAME_CONFIG);
    expect(created.game.teams).toEqual([]);
    expect(created.game.currentPreview).toBeNull();
    expect(created.game.boardLocked).toBe(false);
    expect(created.game.startingState).toBeNull();
    expect(created.game.startingStateHidden).toBe(false);
  });

  it("refuses a second open game per room key, the null dev room included", async () => {
    // spec: game-configuration/config-lives-on-the-game#one-game-configured-at-a-time
    const t = setup();
    const first = await t.mutation(games.createGame, { roomId: "room-1" });
    expect(first.ok).toBe(true);
    // Race-ish: the second sequential create sees the first inside its own
    // transaction and refuses (serializable mutations mean two CONCURRENT
    // creates cannot both commit either).
    // spec: global-invariants/transactional-invariant-enforcement
    const second = await t.mutation(games.createGame, { roomId: "room-1" });
    expect(second).toEqual({
      ok: false,
      rejection: { kind: "room-occupied", openGameId: first.gameId },
    });
    // A different room key is unaffected.
    const otherRoom = await t.mutation(games.createGame, { roomId: "room-2" });
    expect(otherRoom.ok).toBe(true);
    // The null "dev room" is a room key like any other.
    const dev1 = await t.mutation(games.createGame, { roomId: null });
    expect(dev1.ok).toBe(true);
    const dev2 = await t.mutation(games.createGame, { roomId: null });
    expect(dev2.ok).toBe(false);
  });

  it("a concluded or launched game frees its room for a successor", async () => {
    const t = setup();
    const first = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.concludeWithoutLaunch, { gameId: first.gameId });
    const second = await t.mutation(games.createGame, { roomId: null });
    expect(second.ok).toBe(true);
    await t.mutation(games.updateRoster, { gameId: second.gameId, teams: TEAMS });
    const launched = await t.mutation(games.launchGame, { gameId: second.gameId });
    expect(launched.ok).toBe(true);
    const third = await t.mutation(games.createGame, { roomId: null });
    expect(third.ok).toBe(true);
  });
});

describe("updateConfig validation at the record", () => {
  it("rejects an out-of-range write, naming the parameter", async () => {
    // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    const result = await t.mutation(games.updateConfig, {
      gameId,
      config: withGeneration({ boardSize: 40 }),
    });
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
    // The rejected write persisted nothing.
    const game = await t.query(games.getGame, { gameId });
    expect(game.config.generation.boardSize).toBe(DEFAULT_GAME_CONFIG.generation.boardSize);
  });

  it("rejects a gameplay-half out-of-range write through the same gate", async () => {
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    const result = await t.mutation(games.updateConfig, {
      gameId,
      config: withRuntime({ hazardDamage: 500 }),
    });
    expect(result.ok).toBe(false);
    expect(result.rejection.kind).toBe("invalid-parameter");
    expect(result.rejection.path).toBe("runtime.hazardDamage");
  });

  it("rejects a write leaving both limits at their sentinels", async () => {
    // spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    // Default maxGameDurationMs is already 0, so zeroing maxTurns leaves the
    // record with neither limit.
    const result = await t.mutation(games.updateConfig, {
      gameId,
      config: withRuntime({ maxTurns: 0 }),
    });
    expect(result).toEqual({ ok: false, rejection: { kind: "unbounded-duration" } });
  });

  it("switching which limit applies works in the order that never passes through neither", async () => {
    // spec: game-configuration/bounded-game-duration#switching-which-limit-applies
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    // Set the duration limit first: the intermediate record carries both.
    const both = await t.mutation(games.updateConfig, {
      gameId,
      config: withRuntime({ maxGameDurationMs: 60000 }),
    });
    expect(both.ok).toBe(true);
    // Now the turn limit may be disabled.
    const durationOnly = await t.mutation(games.updateConfig, {
      gameId,
      config: withRuntime({ maxGameDurationMs: 60000, maxTurns: 0 }),
    });
    expect(durationOnly.ok).toBe(true);
    const game = await t.query(games.getGame, { gameId });
    expect(game.config.runtime.maxTurns).toBe(0);
    expect(game.config.runtime.maxGameDurationMs).toBe(60000);
  });

  it("a gated dependent value persists while its gate is off", async () => {
    // spec: game-configuration/conditional-parameter-semantics#gated-value-persists-and-is-ignored
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    const result = await t.mutation(games.updateConfig, {
      gameId,
      config: withGeneration({ fertileGround: { density: 0, clustering: 15 } }),
    });
    expect(result.ok).toBe(true);
    const game = await t.query(games.getGame, { gameId });
    expect(game.config.generation.fertileGround).toEqual({ density: 0, clustering: 15 });
  });
});

describe("preview regeneration and the lock", () => {
  it("a roster change regenerates the preview; structural roster errors are rejected", async () => {
    // spec: game-configuration/board-preview#roster-change-regenerates
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    expect((await t.query(games.getGame, { gameId })).currentPreview).toBeNull();

    const rostered = await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    expect(rostered.ok).toBe(true);
    expect(rostered.game.currentPreview).not.toBeNull();
    // The default configuration generates successfully: a board, not a failure.
    expect("board" in rostered.game.currentPreview.result).toBe(true);

    const empty = await t.mutation(games.updateRoster, { gameId, teams: [] });
    expect(empty).toEqual({ ok: false, rejection: { kind: "empty-roster" } });
    const dup = await t.mutation(games.updateRoster, {
      gameId,
      teams: [TEAMS[0], TEAMS[0]],
    });
    expect(dup).toEqual({
      ok: false,
      rejection: { kind: "duplicate-team-id", centaurTeamId: "team-red" },
    });
  });

  it("regenerates on a generation edit, not on a gameplay-only edit", async () => {
    // spec: game-configuration/board-preview (regeneration trigger = generation inputs)
    // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    const seedAfterRoster = (await t.query(games.getGameInternal, { gameId })).currentPreview
      .seedHex;

    // Gameplay-only edit: the preview (and its seed) stand untouched.
    const gameplay = await t.mutation(games.updateConfig, {
      gameId,
      config: withRuntime({ hazardDamage: 20 }),
    });
    expect(gameplay.ok).toBe(true);
    const seedAfterGameplay = (await t.query(games.getGameInternal, { gameId })).currentPreview
      .seedHex;
    expect(seedAfterGameplay).toBe(seedAfterRoster);

    // Generation edit: fresh seed, fresh candidate, same transaction.
    const generation = await t.mutation(games.updateConfig, {
      gameId,
      config: withGeneration({ boardSize: 15 }),
    });
    expect(generation.ok).toBe(true);
    const internalAfter = await t.query(games.getGameInternal, { gameId });
    expect(internalAfter.currentPreview.seedHex).not.toBe(seedAfterRoster);
    expect(internalAfter.currentPreview.result.board.boardSize).toBe(15);
  });

  it("locking is refused while the slot holds no successful board", async () => {
    // A lock designates a board; an empty slot or a failure has none.
    // spec: game-configuration/board-preview-lock-in
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    const noPreview = await t.mutation(games.setBoardLock, { gameId, locked: true });
    expect(noPreview).toEqual({ ok: false, rejection: { kind: "no-lockable-preview" } });

    // Force the slot into a failure, then try again.
    await t.mutation(games.updateRoster, { gameId, teams: FOUR_TEAMS });
    const infeasible = await t.mutation(games.updateConfig, {
      gameId,
      config: withGeneration({ boardSize: 7, snakesPerTeam: 10 }),
    });
    expect(infeasible.ok).toBe(true);
    expect("code" in infeasible.game.currentPreview.result).toBe(true);
    const onFailure = await t.mutation(games.setBoardLock, { gameId, locked: true });
    expect(onFailure).toEqual({ ok: false, rejection: { kind: "no-lockable-preview" } });
  });

  it("the lock survives a gameplay edit and clears on a generation edit or roster change", async () => {
    // spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
    // spec: game-configuration/board-preview-lock-in#roster-change-clears-the-lock
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    const locked = await t.mutation(games.setBoardLock, { gameId, locked: true });
    expect(locked.ok).toBe(true);
    expect(locked.game.boardLocked).toBe(true);

    // Gameplay edit: lock stands.
    const gameplay = await t.mutation(games.updateConfig, {
      gameId,
      config: withRuntime({ maxHealth: 150 }),
    });
    expect(gameplay.game.boardLocked).toBe(true);

    // Generation edit (gameplay change kept): the lock clears as the preview
    // regenerates, in the same mutation.
    const generationEdited = await t.mutation(games.updateConfig, {
      gameId,
      config: {
        generation: { ...DEFAULT_GAME_CONFIG.generation, hazardPercentage: 10 },
        runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxHealth: 150 },
      },
    });
    expect(generationEdited.game.boardLocked).toBe(false);

    // Re-lock the new candidate, then change the roster: the lock clears again.
    await t.mutation(games.setBoardLock, { gameId, locked: true });
    const rosterChanged = await t.mutation(games.updateRoster, {
      gameId,
      teams: [...TEAMS, { centaurTeamId: "team-green", name: "Green" }],
    });
    expect(rosterChanged.game.boardLocked).toBe(false);
  });
});

describe("launch", () => {
  it("a locked launch starts on exactly the designated preview", async () => {
    // spec: game-configuration/board-preview-lock-in#locked-board-launches-exactly
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    await t.mutation(games.setBoardLock, { gameId, locked: true });
    const designated = (await t.query(games.getGameInternal, { gameId })).currentPreview.result;

    const launched = await t.mutation(games.launchGame, { gameId });
    expect(launched.ok).toBe(true);
    expect(launched.game.phase).toBe("playing");
    // The designated board IS the starting state — and, having been every
    // viewer's preview already, it is publicly visible.
    expect(launched.game.startingStateHidden).toBe(false);
    expect(launched.game.startingState).toEqual(designated);
    const publicView = await t.query(games.getGame, { gameId });
    expect(publicView.startingState).toEqual(designated);
  });

  it("an unlocked launch persists a starting state hidden from every public read", async () => {
    // spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    const launched = await t.mutation(games.launchGame, { gameId });
    expect(launched.ok).toBe(true);
    expect(launched.game.phase).toBe("playing");
    expect(launched.game.startingStateHidden).toBe(true);
    expect(launched.game.startingState).toBeNull();

    const publicView = await t.query(games.getGame, { gameId });
    expect(publicView.startingState).toBeNull();
    // The state exists — the internal read (future lifecycle orchestration)
    // returns it for handoff to the game runtime.
    // spec: game-configuration/generation-parameter-boundary
    const internal = await t.query(games.getGameInternal, { gameId });
    expect(internal.startingState).not.toBeNull();
    expect(internal.startingState.board.boardSize).toBe(DEFAULT_GAME_CONFIG.generation.boardSize);
  });

  it("a failed unlocked launch halts: structured error, no transition", async () => {
    // spec: game-configuration/infeasibility-surfaced#failed-launch-halts
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.updateRoster, { gameId, teams: FOUR_TEAMS });
    const infeasible = await t.mutation(games.updateConfig, {
      gameId,
      config: withGeneration({ boardSize: 7, snakesPerTeam: 10 }),
    });
    // The infeasibility already landed in the preview slot, structured.
    // spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
    expect(infeasible.ok).toBe(true);
    expect(infeasible.game.currentPreview.result).toMatchObject({
      code: "TERRITORY_PARITY_SHORTAGE",
      attemptsUsed: 4,
    });

    const launched = await t.mutation(games.launchGame, { gameId });
    expect(launched.ok).toBe(false);
    expect(launched.rejection.kind).toBe("generation-failed");
    expect(launched.rejection.failure.code).toBe("TERRITORY_PARITY_SHORTAGE");
    // No transition: the record is still configuring and can be adjusted.
    const game = await t.query(games.getGame, { gameId });
    expect(game.phase).toBe("configuring");
    expect(game.startingState).toBeNull();
  });
});

describe("the freeze", () => {
  it("every write is rejected once the game is past its edit window", async () => {
    // spec: game-configuration/launch-freeze#post-launch-writes-rejected
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    await t.mutation(games.launchGame, { gameId });

    const playingRejection = { ok: false, rejection: { kind: "wrong-phase", phase: "playing" } };
    expect(await t.mutation(games.updateConfig, { gameId, config: DEFAULT_GAME_CONFIG })).toEqual(
      playingRejection,
    );
    expect(await t.mutation(games.updateRoster, { gameId, teams: TEAMS })).toEqual(
      playingRejection,
    );
    expect(await t.mutation(games.setBoardLock, { gameId, locked: false })).toEqual(
      playingRejection,
    );
    expect(await t.mutation(games.launchGame, { gameId })).toEqual(playingRejection);
    expect(await t.mutation(games.concludeWithoutLaunch, { gameId })).toEqual(playingRejection);
  });

  it("concluding without launch freezes the record the same way", async () => {
    // spec: game-configuration/launch-freeze (a never-launched ending is equally frozen)
    const t = setup();
    const { gameId } = await t.mutation(games.createGame, { roomId: null });
    const concluded = await t.mutation(games.concludeWithoutLaunch, { gameId });
    expect(concluded.ok).toBe(true);
    expect(concluded.game.phase).toBe("finished");
    expect(concluded.game.startingState).toBeNull();

    const finishedRejection = { ok: false, rejection: { kind: "wrong-phase", phase: "finished" } };
    expect(await t.mutation(games.updateConfig, { gameId, config: DEFAULT_GAME_CONFIG })).toEqual(
      finishedRejection,
    );
    expect(await t.mutation(games.launchGame, { gameId })).toEqual(finishedRejection);
  });
});

describe("redaction and record independence", () => {
  it("the seed appears in no public return, ever", async () => {
    // spec: game-configuration/board-generation-retry ("accessible to no game client")
    const t = setup();
    const created = await t.mutation(games.createGame, { roomId: null });
    const { gameId } = created;
    const rostered = await t.mutation(games.updateRoster, { gameId, teams: TEAMS });
    const edited = await t.mutation(games.updateConfig, {
      gameId,
      config: withGeneration({ boardSize: 11 }),
    });
    const locked = await t.mutation(games.setBoardLock, { gameId, locked: true });
    const read = await t.query(games.getGame, { gameId });
    const launched = await t.mutation(games.launchGame, { gameId });
    const readAfterLaunch = await t.query(games.getGame, { gameId });

    for (const publicReturn of [
      created,
      rostered,
      edited,
      locked,
      read,
      launched,
      readAfterLaunch,
    ]) {
      const keys = collectKeys(publicReturn);
      expect(keys.has("seedHex")).toBe(false);
      expect(keys.has("seed")).toBe(false);
    }
    // Sanity: the seed does exist on the stored record — the internal read
    // (platform orchestration only) is where it lives.
    const internal = await t.query(games.getGameInternal, { gameId });
    expect(typeof internal.currentPreview.seedHex).toBe("string");
  });

  it("two games configured differently each read their own values", async () => {
    // spec: game-configuration/config-lives-on-the-game#views-read-the-games-own-record
    const t = setup();
    const a = await t.mutation(games.createGame, { roomId: "room-a" });
    const b = await t.mutation(games.createGame, { roomId: "room-b" });
    await t.mutation(games.updateConfig, {
      gameId: a.gameId,
      config: withGeneration({ boardSize: 11 }),
    });
    await t.mutation(games.updateConfig, {
      gameId: b.gameId,
      config: withGeneration({ boardSize: 27 }),
    });
    const gameA = await t.query(games.getGame, { gameId: a.gameId });
    const gameB = await t.query(games.getGame, { gameId: b.gameId });
    expect(gameA.config.generation.boardSize).toBe(11);
    expect(gameB.config.generation.boardSize).toBe(27);
  });
});
