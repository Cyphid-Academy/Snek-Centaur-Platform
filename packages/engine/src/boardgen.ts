// Board generation pipeline. spec: 01 §2.4 (01-REQ-010..017, 01-REQ-061)
// and snake initialization per 01 §2.6 (01-REQ-018..021).
//
// One attempt runs the named stage functions below in order against a
// mutable cell grid; each stage draws from its own sub-seed, so the stages
// are individually reproducible and testable. The attempt loop retries with
// per-attempt sub-seeds (01-REQ-061).
import { cellIndex, isInner, parityOf } from "./board.js";
import { itemIdFor } from "./items.js";
import { fractalNoise2D, makePerlin } from "./perlin.js";
import type { Rng } from "./rng.js";
import { rngFromSeed, subSeed } from "./rng.js";
import type {
  Board,
  BoardGenerationFailure,
  Cell,
  CentaurTeamId,
  GameConfig,
  ItemState,
  SnakeId,
  SnakeState,
} from "./types.js";
import { CellType, ItemType } from "./types.js";

export interface GeneratedInitialState {
  readonly board: Board;
  readonly snakes: ReadonlyArray<SnakeState>;
  readonly items: ReadonlyArray<ItemState>;
}

export interface TeamRegistration {
  readonly centaurTeamId: CentaurTeamId;
  readonly name: string;
}

interface AttemptFailure {
  readonly code: BoardGenerationFailure["code"];
  readonly centaurTeamId?: CentaurTeamId;
  readonly eligibleCellCount?: number;
}

const TWO_PI = 2 * Math.PI;
const LETTER_A = "A".charCodeAt(0);
const GENERATION_ATTEMPTS = 4; // 1 + three retries (01-REQ-061)

/**
 * Generate the board and initial game entities for one game.
 *
 * Deviation from the drafted signature (01 §3.8, documented decision): takes
 * the full `GameConfig` rather than `GameOrchestrationConfig` alone, because
 * snake initialization requires `runtime.maxHealth` (01-REQ-021) which lives
 * in the runtime half. The Convex caller holds the full config at
 * provisioning time (02 §2.14), so this costs nothing.
 */
// spec: 01-REQ-061 — one deterministic sub-seeded attempt, up to 3 retries.
export function generateBoardAndInitialState(
  config: GameConfig,
  teams: ReadonlyArray<TeamRegistration>,
  gameSeed: Uint8Array,
): GeneratedInitialState | BoardGenerationFailure {
  const innerCellCount = (config.orchestration.boardSize - 2) ** 2;
  let lastFailure: AttemptFailure | null = null;
  for (let attemptIndex = 0; attemptIndex < GENERATION_ATTEMPTS; attemptIndex++) {
    const attemptSeed = subSeed(gameSeed, `board-attempt:${attemptIndex}`);
    const result = runAttempt(config, teams, attemptSeed);
    if (!("code" in result)) return result;
    lastFailure = result;
  }
  const failure = lastFailure as AttemptFailure;
  return {
    code: failure.code,
    attemptsUsed: GENERATION_ATTEMPTS,
    details: {
      innerCellCount,
      ...(failure.centaurTeamId !== undefined ? { centaurTeamId: failure.centaurTeamId } : {}),
      ...(failure.eligibleCellCount !== undefined
        ? { eligibleCellCount: failure.eligibleCellCount }
        : {}),
    },
  };
}

function runAttempt(
  config: GameConfig,
  teams: ReadonlyArray<TeamRegistration>,
  attemptSeed: Uint8Array,
): GeneratedInitialState | AttemptFailure {
  const { boardSize, snakesPerTeam, hazardPercentage, fertileGround } = config.orchestration;
  const { cells, innerCells } = buildBaseGrid(boardSize);
  const board: Board = { boardSize, cells };

  const hazardFailure = placeHazards(
    board,
    cells,
    innerCells,
    hazardPercentage,
    rngFromSeed(subSeed(attemptSeed, "hazards")),
  );
  if (hazardFailure !== null) return hazardFailure;

  if (fertileGround.density > 0) {
    selectFertileCells(
      board,
      cells,
      innerCells,
      fertileGround,
      rngFromSeed(subSeed(attemptSeed, "fertile")),
    );
  }

  const sectorOf = makeSectorAssigner(
    boardSize,
    teams.length,
    rngFromSeed(subSeed(attemptSeed, "territory-angle")),
  );

  // Stage 4 — Parity choice. spec: 01-REQ-016
  const parity = rngFromSeed(subSeed(attemptSeed, "parity")).nextIntExclusive(2) as 0 | 1;

  const headsResult = pickStartingPositions(
    board,
    cells,
    innerCells,
    teams,
    snakesPerTeam,
    sectorOf,
    parity,
    rngFromSeed(subSeed(attemptSeed, "starting-positions")),
  );
  if ("code" in headsResult) return headsResult;

  const snakes = initializeSnakes(teams, snakesPerTeam, headsResult, config.runtime.maxHealth);

  const foodResult = placeInitialFood(
    board,
    cells,
    innerCells,
    snakes,
    fertileGround.density > 0,
    rngFromSeed(subSeed(attemptSeed, "initial-food")),
  );
  if ("code" in foodResult) return foodResult;

  return { board, snakes, items: foodResult };
}

// Base grid: 1-cell wall border, Normal inner cells. spec: 01-REQ-008
function buildBaseGrid(boardSize: number): { cells: CellType[]; innerCells: Cell[] } {
  const cells: CellType[] = new Array(boardSize * boardSize).fill(CellType.Normal);
  const board: Board = { boardSize, cells };
  const innerCells: Cell[] = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      const cell = { x, y };
      if (isInner(board, cell)) {
        innerCells.push(cell);
      } else {
        cells[cellIndex(board, cell)] = CellType.Wall;
      }
    }
  }
  return { cells, innerCells };
}

// Stage 1 — Hazards. spec: 01-REQ-010, 01-REQ-011
function placeHazards(
  board: Board,
  cells: CellType[],
  innerCells: ReadonlyArray<Cell>,
  hazardPercentage: number,
  rng: Rng,
): AttemptFailure | null {
  const hazardCount = Math.floor((innerCells.length * hazardPercentage) / 100);
  if (hazardCount === 0) return null;
  const pool = [...innerCells]; // row-major deterministic order before shuffle
  rng.shuffle(pool);
  for (const cell of pool.slice(0, hazardCount)) {
    cells[cellIndex(board, cell)] = CellType.Hazard;
  }
  if (!nonHazardInnerConnected(board, innerCells)) {
    return { code: "HAZARD_CONNECTIVITY" };
  }
  return null;
}

// Stage 2 — Fertile tiles. spec: 01-REQ-012, 01-REQ-013, 01 §2.5
function selectFertileCells(
  board: Board,
  cells: CellType[],
  innerCells: ReadonlyArray<Cell>,
  fertileGround: { readonly density: number; readonly clustering: number },
  rng: Rng,
): void {
  // One rng stream drives both the field offset and the permutation table
  // (offset drawn first — order is part of the reproducibility contract).
  const dx = rng.nextFloat() * 1024;
  const dy = rng.nextFloat() * 1024;
  const perlin = makePerlin(rng);
  // Log-linear clustering→frequency mapping: C=1 → period 1 cell, C=20 → 32.
  const baseFreq = 2 ** (((fertileGround.clustering - 1) / 19) * Math.log2(1 / 32));
  const candidates = innerCells.filter((cell) => cells[cellIndex(board, cell)] !== CellType.Hazard);
  const scored = candidates.map((cell) => ({
    cell,
    score: fractalNoise2D(perlin, cell.x + dx, cell.y + dy, baseFreq),
  }));
  // Rank by score desc; tie-break by (y, x) asc. spec: 01 §2.5 step 3
  scored.sort((a, b) => b.score - a.score || a.cell.y - b.cell.y || a.cell.x - b.cell.x);
  const take = Math.ceil((candidates.length * fertileGround.density) / 100);
  for (const { cell } of scored.slice(0, take)) {
    cells[cellIndex(board, cell)] = CellType.Fertile;
  }
}

// Stage 3 — Territory sectors. spec: 01-REQ-014
function makeSectorAssigner(
  boardSize: number,
  teamCount: number,
  rng: Rng,
): (cell: Cell) => number {
  const theta0 = rng.nextFloat() * TWO_PI;
  const sectorWidth = TWO_PI / teamCount;
  const centre = boardSize / 2;
  return (cell: Cell): number => {
    // Straight-line sector boundaries + unit-square cells means the sector
    // containing the cell centre is always the one with the largest overlap.
    const angle = Math.atan2(cell.y + 0.5 - centre, cell.x + 0.5 - centre);
    const a = (((angle - theta0) % TWO_PI) + TWO_PI) % TWO_PI;
    return Math.min(Math.floor(a / sectorWidth), teamCount - 1);
  };
}

// Stage 5 — Starting positions. spec: 01-REQ-015, 01-REQ-016
function pickStartingPositions(
  board: Board,
  cells: ReadonlyArray<CellType>,
  innerCells: ReadonlyArray<Cell>,
  teams: ReadonlyArray<TeamRegistration>,
  snakesPerTeam: number,
  sectorOf: (cell: Cell) => number,
  parity: 0 | 1,
  rng: Rng,
): Cell[][] | AttemptFailure {
  const headsByTeam: Cell[][] = [];
  for (let t = 0; t < teams.length; t++) {
    const candidates = innerCells.filter(
      (cell) =>
        sectorOf(cell) === t &&
        cells[cellIndex(board, cell)] !== CellType.Hazard &&
        parityOf(cell) === parity,
    );
    if (candidates.length < snakesPerTeam) {
      const team = teams[t] as TeamRegistration;
      return {
        code: "TERRITORY_PARITY_SHORTAGE",
        centaurTeamId: team.centaurTeamId,
        eligibleCellCount: candidates.length,
      };
    }
    rng.shuffle(candidates);
    headsByTeam.push(candidates.slice(0, snakesPerTeam));
  }
  return headsByTeam;
}

// Snake initialization. spec: 01-REQ-018..021, 01 §2.6
function initializeSnakes(
  teams: ReadonlyArray<TeamRegistration>,
  snakesPerTeam: number,
  headsByTeam: ReadonlyArray<ReadonlyArray<Cell>>,
  maxHealth: number,
): SnakeState[] {
  const snakes: SnakeState[] = [];
  teams.forEach((team, teamIdx) => {
    const heads = headsByTeam[teamIdx] as ReadonlyArray<Cell>;
    heads.forEach((head, i) => {
      snakes.push({
        snakeId: (teamIdx * snakesPerTeam + i) as SnakeId,
        letter: String.fromCharCode(LETTER_A + i), // 'A' + index within team (01-REQ-018)
        centaurTeamId: team.centaurTeamId,
        body: [head, head, head], // length 3, stacked. spec: 01-REQ-020
        health: maxHealth, // spec: 01-REQ-021
        activeEffects: [],
        lastDirection: null,
        alive: true,
      });
    });
  });
  return snakes;
}

// Stage 6 — Initial food. spec: 01-REQ-017
function placeInitialFood(
  board: Board,
  cells: ReadonlyArray<CellType>,
  innerCells: ReadonlyArray<Cell>,
  snakes: ReadonlyArray<SnakeState>,
  restrictToFertile: boolean,
  rng: Rng,
): ItemState[] | AttemptFailure {
  const occupied = new Set(snakes.map((s) => cellIndex(board, s.body[0] as Cell)));
  const eligible = innerCells.filter((cell) => {
    const type = cells[cellIndex(board, cell)];
    if (type === CellType.Hazard) return false;
    if (restrictToFertile && type !== CellType.Fertile) return false;
    return !occupied.has(cellIndex(board, cell));
  });
  if (eligible.length < snakes.length) {
    return { code: "INITIAL_FOOD_SHORTAGE", eligibleCellCount: eligible.length };
  }
  rng.shuffle(eligible);
  // Setup items allocate in id namespace 0 (01-REQ-078); turn-resolution
  // spawns start at namespace 1, so these ids never collide with later ones.
  return eligible.slice(0, snakes.length).map((cell, i) => ({
    itemId: itemIdFor(0, i),
    itemType: ItemType.Food,
    cell,
  }));
}

// BFS over 4-connected non-hazard inner cells. spec: 01-REQ-010
function nonHazardInnerConnected(board: Board, innerCells: ReadonlyArray<Cell>): boolean {
  const open = innerCells.filter((c) => board.cells[cellIndex(board, c)] !== CellType.Hazard);
  const first = open[0];
  if (first === undefined) return false;
  const openSet = new Set(open.map((c) => cellIndex(board, c)));
  const visited = new Set<number>([cellIndex(board, first)]);
  const queue: Cell[] = [first];
  while (queue.length > 0) {
    const c = queue.pop() as Cell;
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const next = { x: c.x + d.x, y: c.y + d.y };
      const idx = cellIndex(board, next);
      if (openSet.has(idx) && !visited.has(idx)) {
        visited.add(idx);
        queue.push(next);
      }
    }
  }
  return visited.size === open.length;
}
