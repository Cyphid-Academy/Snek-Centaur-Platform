import type {
  CentaurTeamId,
  GameOutcome,
  GameState,
  TurnEvent,
  TurnNumber,
} from "@cyphid/snek-engine";
import { initialClock, itemsByCell, resolveTurn, subSeed } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_CONFIG } from "./config.js";
import * as gameConfiguration from "./index.js";
import { tid } from "./testkit.js";

describe("@cyphid/snek-game-configuration public API", () => {
  it("exports the configuration vocabulary and the one shared generator", () => {
    expect(typeof gameConfiguration.generateBoardAndInitialState).toBe("function");
    expect(gameConfiguration.DEFAULT_GENERATION_CONFIG.boardSize).toBe(21);
    expect(gameConfiguration.DEFAULT_GAME_CONFIG.runtime.maxHealth).toBe(100);
  });

  // spec: game-configuration/closed-parameter-vocabulary — exactly two
  // disjoint halves, with the gameplay half read from the engine rather than
  // restated (game-configuration/parameter-bounds-sourcing).
  it("holds exactly the two configuration halves, disjointly", () => {
    expect(Object.keys(DEFAULT_GAME_CONFIG).sort()).toEqual(["generation", "runtime"]);
    const generationKeys = Object.keys(DEFAULT_GAME_CONFIG.generation);
    const runtimeKeys = Object.keys(DEFAULT_GAME_CONFIG.runtime);
    expect(generationKeys.filter((k) => runtimeKeys.includes(k))).toEqual([]);
  });

  // The integration this package's existence is for: generate a board, hand it
  // to the engine, and play it to a conclusion — twice, identically.
  // spec: game-engine/determinism#reproducibility, game-engine/board-geometry#dimensions-state-the-size
  it("generates a board the engine plays to a deterministic conclusion", () => {
    const run = () => {
      const gameSeed = new Uint8Array(32).fill(21);
      const config: gameConfiguration.GameConfig = {
        generation: {
          boardSize: 13,
          snakesPerTeam: 2,
          hazardPercentage: 5,
          fertileGround: { density: 25, clustering: 8 },
        },
        runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 60 },
      };
      const teams = [
        { centaurTeamId: "red" as CentaurTeamId, name: "Red" },
        { centaurTeamId: "blue" as CentaurTeamId, name: "Blue" },
      ];
      const generated = gameConfiguration.generateBoardAndInitialState(config, teams, gameSeed);
      if ("code" in generated) throw new Error(`board generation failed: ${generated.code}`);
      let state: GameState = {
        board: generated.board,
        snakes: generated.snakes,
        items: itemsByCell(generated.board, generated.items),
        clocks: teams.map((t) => initialClock(t.centaurTeamId, config.runtime.clock)),
      };
      const allEvents: TurnEvent[] = [];
      let outcome: GameOutcome = { kind: "in_progress" };
      for (let t = 0; t < 60 && outcome.kind === "in_progress"; t++) {
        const result = resolveTurn(
          state,
          new Map(),
          t as TurnNumber,
          subSeed(gameSeed, `turn:${t}`),
          config.runtime,
        );
        state = result.nextState;
        outcome = result.outcome;
        allEvents.push(...result.events);
      }
      return { outcome, allEvents };
    };
    const a = run();
    const b = run();
    expect(a.outcome.kind).not.toBe("in_progress");
    expect(a.allEvents.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  // spec: game-configuration/infeasibility-surfaced — an infeasible parameter
  // set yields a failure, never a board of the generator's own choosing.
  it("returns a failure rather than substituting a board it can seat", () => {
    const result = gameConfiguration.generateBoardAndInitialState(
      {
        generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 7, snakesPerTeam: 10 },
        runtime: DEFAULT_GAME_CONFIG.runtime,
      },
      [
        { centaurTeamId: tid("red"), name: "Red" },
        { centaurTeamId: tid("blue"), name: "Blue" },
      ],
      new Uint8Array(32).fill(5),
    );
    expect("code" in result).toBe(true);
  });
});
