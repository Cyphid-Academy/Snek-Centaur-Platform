// Board-generation property tests: configurations drawn from the FULL
// documented parameter ranges (see arbitraries.ts) with 2-6 teams and
// arbitrary 32-byte seeds; every successful generation must hold the
// structural guarantees of game-engine/board-geometry, game-engine/hazards,
// game-engine/starting-placement, game-engine/initial-snakes, and
// game-engine/initial-food#food-count-per-territory, and every failure must
// be the machine-readable shape of game-engine/board-generation-retry
// (a legal outcome for hostile draws — small boards with many snakes).
// Generation is also a pure function of (config, seed) —
// game-engine/determinism.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gameConfigArb, gameSeedArb, teamsArb } from "./arbitraries.js";
import { cellIndex, isInner, parityOf } from "./board.js";
import { generateBoardAndInitialState } from "./boardgen.js";
import type { Board, Cell } from "./types.js";
import { CellType, ItemType } from "./types.js";

function innerCellsOf(board: Board): Cell[] {
  const cells: Cell[] = [];
  for (let y = 0; y < board.boardSize; y++) {
    for (let x = 0; x < board.boardSize; x++) {
      if (isInner(board, { x, y })) cells.push({ x, y });
    }
  }
  return cells;
}

/** BFS over 4-connected non-hazard inner cells (game-engine/hazards#connectivity-guarantee). */
function nonHazardConnected(board: Board): boolean {
  const open = innerCellsOf(board).filter(
    (c) => board.cells[cellIndex(board, c)] !== CellType.Hazard,
  );
  const first = open[0];
  if (first === undefined) return false;
  const openSet = new Set(open.map((c) => cellIndex(board, c)));
  const visited = new Set<number>([cellIndex(board, first)]);
  const queue = [first];
  while (queue.length > 0) {
    const c = queue.pop() as Cell;
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const idx = cellIndex(board, { x: c.x + d.x, y: c.y + d.y });
      if (openSet.has(idx) && !visited.has(idx)) {
        visited.add(idx);
        queue.push({ x: c.x + d.x, y: c.y + d.y });
      }
    }
  }
  return visited.size === open.length;
}

describe("board generation properties", () => {
  it("every successful generation holds the structural guarantees", () => {
    fc.assert(
      fc.property(gameConfigArb, teamsArb, gameSeedArb, (config, teams, gameSeed) => {
        const { boardSize, snakesPerTeam, hazardPercentage } = config.orchestration;
        const generated = generateBoardAndInitialState(config, teams, gameSeed);

        if ("code" in generated) {
          // Failure is a legal outcome for a hostile draw, but only in the
          // machine-readable shape of
          // game-engine/board-generation-retry#infeasible-configuration.
          expect([
            "HAZARD_CONNECTIVITY",
            "TERRITORY_PARITY_SHORTAGE",
            "INITIAL_FOOD_SHORTAGE",
          ]).toContain(generated.code);
          expect(generated.attemptsUsed).toBe(4);
          return;
        }
        const { board, snakes, items } = generated;

        // game-engine/board-geometry#construction: full wall ring, playable interior.
        expect(board.cells).toHaveLength(boardSize ** 2);
        const inner = innerCellsOf(board);
        expect(inner).toHaveLength((boardSize - 2) ** 2);
        for (let y = 0; y < boardSize; y++) {
          for (let x = 0; x < boardSize; x++) {
            const type = board.cells[cellIndex(board, { x, y })];
            if (isInner(board, { x, y })) expect(type).not.toBe(CellType.Wall);
            else expect(type).toBe(CellType.Wall);
          }
        }

        // game-engine/hazards: exact count and connectivity.
        const hazards = inner.filter((c) => board.cells[cellIndex(board, c)] === CellType.Hazard);
        expect(hazards).toHaveLength(Math.floor((inner.length * hazardPercentage) / 100));
        expect(nonHazardConnected(board)).toBe(true);

        // game-engine/initial-snakes: full teams of 3-stacked, full-health snakes.
        expect(snakes).toHaveLength(teams.length * snakesPerTeam);
        for (const snake of snakes) {
          const head = snake.body[0] as Cell;
          expect(snake.body).toEqual([head, head, head]);
          expect(snake.health).toBe(config.runtime.maxHealth);
          expect(snake.activeEffects).toEqual([]);
          expect(snake.lastDirection).toBeNull();
          expect(snake.alive).toBe(true);
          expect(board.cells[cellIndex(board, head)]).not.toBe(CellType.Hazard);
          expect(isInner(board, head)).toBe(true);
        }
        // game-engine/starting-placement#shared-parity
        const parities = new Set(snakes.map((s) => parityOf(s.body[0] as Cell)));
        expect(parities.size).toBe(1);
        // Per-team lettering from 'A' (game-engine/initial-snakes#naming)
        for (const team of teams) {
          const letters = snakes
            .filter((s) => s.centaurTeamId === team.centaurTeamId)
            .map((s) => s.letter)
            .sort();
          expect(letters).toEqual(
            [...Array(snakesPerTeam).keys()].map((i) => String.fromCharCode(65 + i)),
          );
        }

        // game-engine/initial-food#food-count-per-territory: N x S items — S per
        // territory is pinned by the per-territory shortage failure plus the
        // total; here we check the externally observable half.
        expect(items).toHaveLength(teams.length * snakesPerTeam);
        const heads = new Set(snakes.map((s) => cellIndex(board, s.body[0] as Cell)));
        const itemCells = new Set<number>();
        items.forEach((item, k) => {
          expect(item.itemType).toBe(ItemType.Food);
          // Setup identity: spawn boundary 0, sequential indices
          // (game-engine/item-identity#ids-never-collide).
          expect(item.spawnTurn).toBe(0);
          expect(item.spawnIndex).toBe(k);
          const idx = cellIndex(board, item.cell);
          expect(itemCells.has(idx)).toBe(false); // distinct cells
          itemCells.add(idx);
          expect(isInner(board, item.cell)).toBe(true);
          expect(board.cells[idx]).not.toBe(CellType.Hazard);
          expect(heads.has(idx)).toBe(false); // not on any snake body
        });

        // game-engine/determinism#reproducibility: same seed, same everything.
        expect(generateBoardAndInitialState(config, teams, gameSeed)).toEqual(generated);
      }),
      { numRuns: 120 },
    );
  });
});
