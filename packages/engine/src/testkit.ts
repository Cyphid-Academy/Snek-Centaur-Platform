// Shared test helpers. Not exported from the package.
import { compareIdentity, itemsByCell } from "./items.js";
import { resolveTurn } from "./resolve.js";
import type {
  Agent,
  Board,
  Cell,
  CentaurTeamId,
  Direction,
  GameRuntimeConfig,
  GameState,
  Item,
  PotionEffect,
  SnakeId,
  SnakeState,
  StagedMove,
  TurnEvent,
  TurnNumber,
  UserId,
} from "./types.js";
import { CellType, DEFAULT_GAME_CONFIG, ItemType } from "./types.js";

export const sid = (n: number): SnakeId => n as SnakeId;
export const tid = (s: string): CentaurTeamId => s as CentaurTeamId;
export const uid = (s: string): UserId => s as UserId;
export const turn = (n: number): TurnNumber => n as TurnNumber;

/** 32-byte seed filled with `n`. */
export function seed(n: number): Uint8Array {
  return new Uint8Array(32).fill(n);
}

/** Empty board: 1-cell wall border, all inner cells Normal. */
export function emptyBoard(boardSize: number): Board {
  const cells: CellType[] = new Array(boardSize * boardSize).fill(CellType.Normal);
  for (let x = 0; x < boardSize; x++) {
    for (let y = 0; y < boardSize; y++) {
      if (x === 0 || y === 0 || x === boardSize - 1 || y === boardSize - 1) {
        cells[y * boardSize + x] = CellType.Wall;
      }
    }
  }
  return { boardSize, cells };
}

/** Board with specific cells overridden. */
export function boardWith(boardSize: number, overrides: ReadonlyArray<[Cell, CellType]>): Board {
  const base = emptyBoard(boardSize);
  const cells = [...base.cells];
  for (const [cell, type] of overrides) {
    cells[cell.y * boardSize + cell.x] = type;
  }
  return { boardSize, cells };
}

export interface SnakeOverrides {
  readonly snakeId?: SnakeId;
  readonly letter?: string;
  readonly centaurTeamId?: CentaurTeamId;
  readonly body?: ReadonlyArray<Cell>;
  readonly health?: number;
  readonly activeEffects?: ReadonlyArray<PotionEffect>;
  readonly lastDirection?: Direction | null;
  readonly alive?: boolean;
}

export function makeSnake(overrides: SnakeOverrides = {}): SnakeState {
  return {
    snakeId: overrides.snakeId ?? sid(0),
    letter: overrides.letter ?? "A",
    centaurTeamId: overrides.centaurTeamId ?? tid("red"),
    body: overrides.body ?? [
      { x: 3, y: 3 },
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ],
    health: overrides.health ?? 100,
    activeEffects: overrides.activeEffects ?? [],
    lastDirection: overrides.lastDirection !== undefined ? overrides.lastDirection : null,
    alive: overrides.alive ?? true,
  };
}

/** A setup-boundary item (spawnTurn 0) with the given spawn index. */
export function makeItem(spawnIndex: number, itemType: Item["itemType"], cell: Cell): Item {
  const spawnTurn = turn(0);
  return itemType === ItemType.Food
    ? { spawnTurn, spawnIndex, itemType, cell }
    : { spawnTurn, spawnIndex, itemType, cell };
}

export function effect(
  family: PotionEffect["family"],
  state: PotionEffect["state"],
  expiryTurn: number,
): PotionEffect {
  return { family, state, expiryTurn: turn(expiryTurn) };
}

// ---------------------------------------------------------------------------
// Shared resolve-test harness
// ---------------------------------------------------------------------------

/** maxTurns 0 (no limit) and zero spawn rates so tests control every item. */
export const QUIET_CONFIG: GameRuntimeConfig = {
  ...DEFAULT_GAME_CONFIG.runtime,
  maxTurns: 0,
  foodSpawnRate: 0,
  invulnPotionSpawnRate: 0,
  invisPotionSpawnRate: 0,
};

export const TEST_OPERATOR: Agent = { kind: "operator", operatorUserId: uid("user-1") };

/** State-builder overrides; `items` takes the flat wire form for brevity. */
export interface StateOverrides {
  readonly board?: Board;
  readonly items?: ReadonlyArray<Item>;
  readonly clocks?: GameState["clocks"];
}

export function makeState(snakes: SnakeState[], extra: StateOverrides = {}): GameState {
  const board = extra.board ?? emptyBoard(11);
  return {
    board,
    snakes,
    items: itemsByCell(board, extra.items ?? []),
    clocks: extra.clocks ?? [],
  };
}

/** Present items of a state (or resolution result) as a flat list. */
export function itemList(s: { items: GameState["items"] }): Item[] {
  return [...s.items.values()].sort(compareIdentity);
}

export function stagedMoves(
  entries: Array<[number, Direction]>,
  stagedBy: Agent = TEST_OPERATOR,
): Map<SnakeId, StagedMove> {
  return new Map(entries.map(([id, direction]) => [sid(id), { direction, stagedBy }]));
}

export interface DoResolveOpts {
  readonly turnNumber?: number;
  readonly seedN?: number;
  readonly config?: Partial<GameRuntimeConfig>;
}

export function doResolve(
  gameState: GameState,
  moves: Map<SnakeId, StagedMove>,
  opts: DoResolveOpts = {},
) {
  return resolveTurn(gameState, moves, turn(opts.turnNumber ?? 1), seed(opts.seedN ?? 50), {
    ...QUIET_CONFIG,
    ...opts.config,
  });
}

export function snakeById(s: { snakes: ReadonlyArray<SnakeState> }, id: number): SnakeState {
  const snake = s.snakes.find((sn) => sn.snakeId === sid(id));
  if (snake === undefined) throw new Error(`no snake ${id}`);
  return snake;
}

export function eventsOfKind<K extends TurnEvent["kind"]>(
  events: ReadonlyArray<TurnEvent>,
  kind: K,
): Array<Extract<TurnEvent, { kind: K }>> {
  return events.filter((e): e is Extract<TurnEvent, { kind: K }> => e.kind === kind);
}

/** A default red-team snake in a vertical 3-segment column at column x. */
export function redSnake(id: number, x: number): SnakeState {
  return makeSnake({
    snakeId: sid(id),
    body: [
      { x, y: 5 },
      { x, y: 6 },
      { x, y: 7 },
    ],
  });
}

/** A default blue-team snake in a vertical 3-segment column at column x. */
export function blueSnake(id: number, x: number): SnakeState {
  return makeSnake({
    snakeId: sid(id),
    centaurTeamId: tid("blue"),
    body: [
      { x, y: 5 },
      { x, y: 6 },
      { x, y: 7 },
    ],
  });
}
