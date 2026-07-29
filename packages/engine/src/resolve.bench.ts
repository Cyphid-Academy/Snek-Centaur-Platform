// Throughput baseline for the turn resolver — the number that matters for the
// bot framework's world-tree simulation loop, which will call the engine
// thousands of times per real turn. Run with `pnpm bench` in this package.
//
// Use these numbers as the BASELINE when profile-driven optimisation starts
// (DECISIONS.md §3.10): candidate hotspots are work-copy cloning, the per-call
// segment index in context.ts, and event derivation.
//
// States are built here rather than generated: board generation is
// game-configuration's, and a benchmark of the resolver must not depend on it.
import { bench, describe } from "vitest";
import { resolveTurn } from "./resolve.js";
import { subSeed } from "./rng.js";
import { boardWith, makeSnake, makeState, seed, sid, tid, turn } from "./testkit.js";
import type { GameRuntimeConfig, GameState } from "./types.js";
import { CellType, DEFAULT_RUNTIME_CONFIG, Direction } from "./types.js";

const CONFIG: GameRuntimeConfig = { ...DEFAULT_RUNTIME_CONFIG, maxTurns: 0 };

/** A crowded board: `teams × snakesPerTeam` snakes on a hazard-speckled grid. */
function crowdedState(boardSize: number, teamCount: number, perTeam: number): GameState {
  const hazards: Array<[{ x: number; y: number }, CellType]> = [];
  for (let y = 2; y < boardSize - 2; y += 4) {
    for (let x = 2; x < boardSize - 2; x += 4) hazards.push([{ x, y }, CellType.Hazard]);
  }
  const board = boardWith(boardSize, hazards);
  const teams = ["red", "blue", "green", "gold"].slice(0, teamCount).map(tid);
  const snakes = teams.flatMap((team, t) =>
    Array.from({ length: perTeam }, (_, i) => {
      // Spread heads along distinct rows, bodies trailing left, all on one
      // parity so heads can meet — the case the resolver works hardest on.
      const y = 1 + ((t * perTeam + i) % (boardSize - 2));
      const x = 3 + 2 * (((t * perTeam + i) / (boardSize - 2)) | 0);
      return makeSnake({
        snakeId: sid(t * perTeam + i),
        centaurTeamId: team,
        letter: String.fromCharCode(65 + i),
        body: [
          { x, y },
          { x: x - 1, y },
          { x: x - 2, y },
        ],
        lastDirection: Direction.Right,
      });
    }),
  );
  return makeState(snakes, {
    board,
    clocks: teams.map((t) => ({
      centaurTeamId: t,
      budgetMs: 60000,
      perTurnMs: 10000,
      declaredTurnOver: false,
    })),
  });
}

describe("resolveTurn throughput", () => {
  const standardState = crowdedState(21, 2, 5);
  const standardSeed = subSeed(seed(77), "turn:15");
  bench("standard board (21x21, 2 teams x 5 snakes)", () => {
    resolveTurn(standardState, new Map(), turn(15), standardSeed, CONFIG);
  });

  const smallState = crowdedState(11, 2, 2);
  const smallSeed = subSeed(seed(78), "turn:10");
  bench("small board (11x11, 2 teams x 2 snakes)", () => {
    resolveTurn(smallState, new Map(), turn(10), smallSeed, CONFIG);
  });
});
