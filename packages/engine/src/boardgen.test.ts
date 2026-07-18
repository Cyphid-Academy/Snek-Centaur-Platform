import { describe, expect, it } from "vitest";
import { cellIndex, isInner, parityOf } from "./board.js";
import { generateBoardAndInitialState, placeInitialFood } from "./boardgen.js";
import { rngFromSeed } from "./rng.js";
import { seed, tid } from "./testkit.js";
import type { GameConfig } from "./types.js";
import { CellType, DEFAULT_GAME_CONFIG, ItemType } from "./types.js";

function cfg(overrides: {
  boardSize?: number;
  snakesPerTeam?: number;
  hazardPercentage?: number;
  fertileDensity?: number;
  fertileClustering?: number;
  maxHealth?: number;
}): GameConfig {
  return {
    orchestration: {
      boardSize: overrides.boardSize ?? 15,
      snakesPerTeam: overrides.snakesPerTeam ?? 2,
      hazardPercentage: overrides.hazardPercentage ?? 0,
      fertileGround: {
        density: overrides.fertileDensity ?? 0,
        clustering: overrides.fertileClustering ?? 10,
      },
    },
    runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxHealth: overrides.maxHealth ?? 100 },
  };
}

const TEAMS = [
  { centaurTeamId: tid("red"), name: "Red" },
  { centaurTeamId: tid("blue"), name: "Blue" },
];

function generateOk(config: GameConfig, s = seed(42)) {
  const result = generateBoardAndInitialState(config, TEAMS, s);
  if ("code" in result) throw new Error(`expected success, got failure ${result.code}`);
  return result;
}

describe("board construction", () => {
  // spec: game-rules/board-geometry
  it("builds a boardSize x boardSize grid with a 1-cell wall border", () => {
    const { board } = generateOk(cfg({ boardSize: 11 }));
    expect(board.boardSize).toBe(11);
    expect(board.cells).toHaveLength(121);
    for (let x = 0; x < 11; x++) {
      for (let y = 0; y < 11; y++) {
        const type = board.cells[cellIndex(board, { x, y })];
        if (x === 0 || y === 0 || x === 10 || y === 10) {
          expect(type).toBe(CellType.Wall);
        } else {
          expect(type).not.toBe(CellType.Wall);
        }
      }
    }
  });

  // spec: game-rules/hazards
  it("places floor(innerCount * H / 100) hazard cells", () => {
    const { board } = generateOk(cfg({ boardSize: 11, hazardPercentage: 20 }));
    const hazards = board.cells.filter((c) => c === CellType.Hazard).length;
    expect(hazards).toBe(Math.floor(81 * 0.2)); // 16
  });

  // spec: game-rules/hazards — all non-hazard inner cells form a single connected region
  it("keeps non-hazard inner cells 4-connected", () => {
    // seed(1) is a known-feasible seed for 30% hazards on a 13-board; ~half
    // of seeds exhaust all four attempts at this density (see DECISIONS.md).
    const { board } = generateOk(cfg({ boardSize: 13, hazardPercentage: 30 }), seed(1));
    const size = board.boardSize;
    const open: Array<{ x: number; y: number }> = [];
    for (let x = 1; x < size - 1; x++) {
      for (let y = 1; y < size - 1; y++) {
        if (board.cells[y * size + x] !== CellType.Hazard) open.push({ x, y });
      }
    }
    const key = (c: { x: number; y: number }) => `${c.x},${c.y}`;
    const openSet = new Set(open.map(key));
    const visited = new Set<string>();
    const first = open[0];
    if (first === undefined) throw new Error("no open cells");
    const queue = [first];
    visited.add(key(first));
    while (queue.length > 0) {
      const c = queue.pop();
      if (c === undefined) break;
      for (const d of [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
      ]) {
        const n = { x: c.x + d.x, y: c.y + d.y };
        const k = key(n);
        if (openSet.has(k) && !visited.has(k)) {
          visited.add(k);
          queue.push(n);
        }
      }
    }
    expect(visited.size).toBe(open.length);
  });

  // spec: game-rules/fertile-ground, 01 §2.5 step 4 — ceil(|candidates| * D / 100)
  it("marks ceil(candidates * density / 100) fertile cells, never on walls or hazards", () => {
    const config = cfg({ boardSize: 15, hazardPercentage: 10, fertileDensity: 30 });
    const { board } = generateOk(config);
    const inner = 13 * 13;
    const hazards = board.cells.filter((c) => c === CellType.Hazard).length;
    expect(hazards).toBe(Math.floor(inner * 0.1));
    const candidates = inner - hazards;
    const fertile: number[] = [];
    board.cells.forEach((c, i) => {
      if (c === CellType.Fertile) fertile.push(i);
    });
    expect(fertile).toHaveLength(Math.ceil(candidates * 0.3));
    for (const i of fertile) {
      const x = i % 15;
      const y = Math.floor(i / 15);
      expect(isInner(board, { x, y })).toBe(true);
    }
  });

  it("generates no fertile cells when density is 0", () => {
    const { board } = generateOk(cfg({ fertileDensity: 0 }));
    expect(board.cells.includes(CellType.Fertile)).toBe(false);
  });
});

describe("snake initialization", () => {
  // spec: game-rules/initial-snakes..021
  it("creates snakesPerTeam snakes per team with consecutive letters from A", () => {
    const { snakes } = generateOk(cfg({ snakesPerTeam: 3 }));
    expect(snakes).toHaveLength(6);
    for (const teamId of ["red", "blue"]) {
      const team = snakes.filter((s) => s.centaurTeamId === tid(teamId));
      expect(team.map((s) => s.letter).sort()).toEqual(["A", "B", "C"]);
    }
    expect(new Set(snakes.map((s) => s.snakeId)).size).toBe(6);
  });

  it("starts every snake stacked 3-long on its start cell at full health", () => {
    const { snakes } = generateOk(cfg({ maxHealth: 77 }));
    for (const s of snakes) {
      expect(s.body).toHaveLength(3);
      expect(s.body[1]).toEqual(s.body[0]);
      expect(s.body[2]).toEqual(s.body[0]);
      expect(s.health).toBe(77);
      expect(s.activeEffects).toEqual([]);
      expect(s.lastDirection).toBeNull();
      expect(s.alive).toBe(true);
    }
  });

  // spec: game-rules/starting-placement — non-Wall, non-Hazard inner cells, distinct per snake
  it("places heads on distinct non-wall, non-hazard inner cells", () => {
    const { board, snakes } = generateOk(cfg({ boardSize: 15, hazardPercentage: 20 }));
    const heads = snakes.map((s) => s.body[0]);
    const keys = heads.map((h) => `${h?.x},${h?.y}`);
    expect(new Set(keys).size).toBe(snakes.length);
    for (const h of heads) {
      if (h === undefined) throw new Error("missing head");
      expect(isInner(board, h)).toBe(true);
      expect(board.cells[cellIndex(board, h)]).not.toBe(CellType.Wall);
      expect(board.cells[cellIndex(board, h)]).not.toBe(CellType.Hazard);
    }
  });

  // spec: game-rules/starting-placement — single parity across ALL teams
  it("places all heads on cells of the same parity", () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const { snakes } = generateOk(cfg({}), seed(s));
      const parities = new Set(
        snakes.map((sn) => {
          const h = sn.body[0];
          if (h === undefined) throw new Error("missing head");
          return parityOf(h);
        }),
      );
      expect(parities.size).toBe(1);
    }
  });
});

describe("initial food", () => {
  // spec: game-rules/initial-food
  it("spawns snakesPerTeam food per starting territory on eligible cells", () => {
    const { board, snakes, items } = generateOk(cfg({ snakesPerTeam: 3 }));
    expect(items).toHaveLength(6); // 2 teams x 3 (game-rules/initial-food#food-count-per-territory)
    const occupied = new Set(snakes.map((s) => `${s.body[0]?.x},${s.body[0]?.y}`));
    const itemCells = new Set<string>();
    for (const item of items) {
      expect(item.itemType).toBe(ItemType.Food);
      expect(isInner(board, item.cell)).toBe(true);
      expect(board.cells[cellIndex(board, item.cell)]).not.toBe(CellType.Hazard);
      expect(occupied.has(`${item.cell.x},${item.cell.y}`)).toBe(false);
      itemCells.add(`${item.cell.x},${item.cell.y}`);
    }
    expect(itemCells.size).toBe(6); // distinct cells
    expect(new Set(items.map((i) => `${i.spawnTurn}:${i.spawnIndex}`)).size).toBe(6);
  });

  // spec: game-rules/initial-food#food-count-per-territory — fertile designations ignored
  it("ignores fertile scarcity (a config that would starve fertile-restricted placement succeeds)", () => {
    const result = generateBoardAndInitialState(
      cfg({ boardSize: 9, snakesPerTeam: 3, fertileDensity: 1 }),
      [{ centaurTeamId: tid("red"), name: "Red" }],
      seed(1),
    );
    if ("code" in result) throw new Error(`expected success, got ${result.code}`);
    expect(result.items).toHaveLength(3); // 1 team x 3 snakes
  });
});

describe("determinism and retry", () => {
  // spec: game-rules/determinism, game-rules/board-generation-retry — reproducible from the game seed alone
  it("produces identical output for identical seeds and different output for different seeds", () => {
    const config = cfg({ boardSize: 13, hazardPercentage: 15, fertileDensity: 25 });
    const a = generateBoardAndInitialState(config, TEAMS, seed(11));
    const b = generateBoardAndInitialState(config, TEAMS, seed(11));
    const c = generateBoardAndInitialState(config, TEAMS, seed(12));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  // spec: game-rules/board-generation-retry — territory/parity infeasibility surfaces after 4 attempts
  it("reports TERRITORY_PARITY_SHORTAGE for too many snakes on a tiny board", () => {
    const result = generateBoardAndInitialState(
      cfg({ boardSize: 7, snakesPerTeam: 10 }),
      TEAMS,
      seed(1),
    );
    if (!("code" in result)) throw new Error("expected failure");
    expect(result.code).toBe("TERRITORY_PARITY_SHORTAGE");
    expect(result.attemptsUsed).toBe(4);
    expect(result.details.innerCellCount).toBe(25);
    expect(result.details.centaurTeamId).toBeDefined();
  });

  // spec: game-rules/board-generation-retry#failure-conditions — a territory
  // with no eligible initial-food cell fails the attempt (direct unit test:
  // the condition is unreachable from in-range configurations).
  it("fails placement when a starting territory has no eligible cell", () => {
    const boardSize = 5;
    const cells: CellType[] = new Array(boardSize * boardSize).fill(CellType.Normal);
    const board = { boardSize, cells };
    const innerCells: { x: number; y: number }[] = [];
    for (let y = 0; y < boardSize; y++)
      for (let x = 0; x < boardSize; x++) {
        if (x === 0 || y === 0 || x === boardSize - 1 || y === boardSize - 1)
          cells[y * boardSize + x] = CellType.Wall;
        else innerCells.push({ x, y });
      }
    const teams = [
      { centaurTeamId: tid("red"), name: "Red" },
      { centaurTeamId: tid("blue"), name: "Blue" },
    ];
    // Territory 0 is exactly the cell (1,1), fully occupied by a snake head.
    const sectorOf = (cell: { x: number; y: number }) => (cell.x === 1 && cell.y === 1 ? 0 : 1);
    const snakes = [{ body: [{ x: 1, y: 1 }] }] as unknown as Parameters<
      typeof placeInitialFood
    >[3];
    const result = placeInitialFood(
      board,
      cells,
      innerCells,
      snakes,
      teams,
      1,
      sectorOf,
      rngFromSeed(seed(1)),
    );
    if (!("code" in result)) throw new Error("expected failure");
    expect(result.code).toBe("INITIAL_FOOD_SHORTAGE");
    expect(result.centaurTeamId).toBe(tid("red"));
  });
});
