import { describe, expect, it } from "vitest";
import { generateBoardAndInitialState } from "./boardgen.js";
import { initialClock } from "./clock.js";
import { createLocalGame, seedFromText } from "./driver.js";
import { resolveTurn } from "./resolve.js";
import { subSeed } from "./rng.js";
import { tid } from "./testkit.js";
import type { GameConfig, GameState, TurnEvent, TurnNumber } from "./types.js";
import { DEFAULT_GAME_CONFIG } from "./types.js";

const TEAMS = [
  { centaurTeamId: tid("red"), name: "Red" },
  { centaurTeamId: tid("blue"), name: "Blue" },
];

const CONFIG: GameConfig = {
  orchestration: {
    boardSize: 11,
    snakesPerTeam: 2,
    hazardPercentage: 0,
    fertileGround: { density: 0, clustering: 10 },
  },
  runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 60 },
};

function expectGame(result: ReturnType<typeof createLocalGame>) {
  if ("code" in result) throw new Error(`board generation failed: ${result.code}`);
  return result;
}

describe("seedFromText", () => {
  it("returns a deterministic 32-byte seed, distinct per input", () => {
    const a = seedFromText("hello");
    expect(a).toHaveLength(32);
    expect(a).toEqual(seedFromText("hello"));
    expect(a).not.toEqual(seedFromText("hello2"));
  });
});

describe("createLocalGame", () => {
  it("passes board-generation failures through", () => {
    // 5-board (3x3 inner) cannot seat 10 same-parity snakes per team.
    const result = createLocalGame(
      {
        ...CONFIG,
        orchestration: { ...CONFIG.orchestration, boardSize: 5, snakesPerTeam: 10 },
      },
      TEAMS,
      seedFromText("fail"),
    );
    expect(result).toHaveProperty("code", "TERRITORY_PARITY_SHORTAGE");
  });

  it("assembles clocks per 01-REQ-035 and starts at turn 0, in progress", () => {
    const game = expectGame(createLocalGame(CONFIG, TEAMS, seedFromText("clocks")));
    expect(game.turnNumber).toBe(0);
    expect(game.finished).toBe(false);
    expect(game.outcome).toEqual({ kind: "in_progress" });
    expect(game.state.clocks).toEqual(
      TEAMS.map((t) => initialClock(t.centaurTeamId, CONFIG.runtime.clock)),
    );
  });

  it("runs a whole no-input game to a terminal outcome within maxTurns", () => {
    const game = expectGame(createLocalGame(CONFIG, TEAMS, seedFromText("full-game")));
    let steps = 0;
    while (!game.finished) {
      game.step();
      steps += 1;
      expect(steps).toBeLessThanOrEqual(CONFIG.runtime.maxTurns);
    }
    expect(game.turnNumber).toBe(steps);
    expect(["victory", "draw"]).toContain(game.outcome.kind);
    expect(() => game.step()).toThrow(/finished/);
  });

  it("replays identically to a manual resolveTurn loop over the same gameSeed", () => {
    const gameSeed = seedFromText("replay-equivalence");
    const game = expectGame(createLocalGame(CONFIG, TEAMS, gameSeed));

    const generated = generateBoardAndInitialState(CONFIG, TEAMS, gameSeed);
    if ("code" in generated) throw new Error("unreachable");
    let manual: GameState = {
      board: generated.board,
      snakes: generated.snakes,
      items: generated.items,
      clocks: TEAMS.map((t) => initialClock(t.centaurTeamId, CONFIG.runtime.clock)),
    };
    expect(game.state).toEqual(manual);

    const driverEvents: TurnEvent[][] = [];
    const manualEvents: TurnEvent[][] = [];
    for (let t = 0; !game.finished; t++) {
      driverEvents.push([...game.step().events]);
      const res = resolveTurn(
        manual,
        new Map(),
        t as TurnNumber,
        subSeed(gameSeed, `turn:${t}`),
        CONFIG.runtime,
      );
      manual = res.nextState;
      manualEvents.push([...res.events]);
      expect(game.state).toEqual(manual);
      expect(game.outcome).toEqual(res.outcome);
    }
    expect(driverEvents).toEqual(manualEvents);
  });
});
