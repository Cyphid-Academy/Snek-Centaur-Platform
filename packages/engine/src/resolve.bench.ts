// Throughput baseline for the turn resolver — the number that matters for
// module 07's world-tree simulation loop, which will call resolveTurn
// thousands of times per real turn. Run with `pnpm bench` in this package.
//
// Use these numbers as the BASELINE when profile-driven optimisation starts
// (DECISIONS.md §3.10): candidate hotspots are work-copy cloning, the per-call
// segment/item indexes in context.ts, and event derivation.
import { bench, describe } from "vitest";
import { generateBoardAndInitialState } from "./boardgen.js";
import { resolveTurn } from "./resolve.js";
import { subSeed } from "./rng.js";
import { seed, tid } from "./testkit.js";
import type { GameConfig, GameState, TurnNumber } from "./types.js";
import { DEFAULT_GAME_CONFIG } from "./types.js";

function midGameState(config: GameConfig, gameSeedN: number, turns: number): GameState {
  const gameSeed = seed(gameSeedN);
  const teams = [
    { centaurTeamId: tid("red"), name: "Red" },
    { centaurTeamId: tid("blue"), name: "Blue" },
  ];
  const generated = generateBoardAndInitialState(config, teams, gameSeed);
  if ("code" in generated) throw new Error(`board generation failed: ${generated.code}`);
  let state: GameState = {
    board: generated.board,
    snakes: generated.snakes,
    items: generated.items,
    clocks: [],
  };
  for (let t = 0; t < turns; t++) {
    const result = resolveTurn(
      state,
      new Map(),
      t as TurnNumber,
      subSeed(gameSeed, `turn:${t}`),
      config.runtime,
    );
    if (result.outcome.kind !== "in_progress") break;
    state = result.nextState;
  }
  return state;
}

const STANDARD: GameConfig = {
  orchestration: {
    boardSize: 21,
    snakesPerTeam: 5,
    hazardPercentage: 10,
    fertileGround: { density: 30, clustering: 10 },
  },
  runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 0 },
};

const SMALL: GameConfig = {
  orchestration: {
    boardSize: 11,
    snakesPerTeam: 2,
    hazardPercentage: 0,
    fertileGround: { density: 0, clustering: 10 },
  },
  runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 0 },
};

describe("resolveTurn throughput", () => {
  const standardState = midGameState(STANDARD, 77, 15);
  const standardSeed = subSeed(seed(77), "turn:15");
  bench("standard board (21x21, 2 teams x 5 snakes, mid-game)", () => {
    resolveTurn(standardState, new Map(), 15 as TurnNumber, standardSeed, STANDARD.runtime);
  });

  const smallState = midGameState(SMALL, 78, 10);
  const smallSeed = subSeed(seed(78), "turn:10");
  bench("small board (11x11, 2 teams x 2 snakes, mid-game)", () => {
    resolveTurn(smallState, new Map(), 10 as TurnNumber, smallSeed, SMALL.runtime);
  });
});

describe("generateBoardAndInitialState throughput", () => {
  bench("standard board generation (21x21, hazards + fertile)", () => {
    generateBoardAndInitialState(
      STANDARD,
      [
        { centaurTeamId: tid("red"), name: "Red" },
        { centaurTeamId: tid("blue"), name: "Blue" },
      ],
      seed(79),
    );
  });
});
