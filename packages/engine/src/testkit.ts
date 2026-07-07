// Shared test helpers. Not exported from the package.
import type {
  Board,
  Cell,
  CentaurTeamId,
  Direction,
  ItemId,
  ItemState,
  ItemType,
  PotionEffect,
  SnakeId,
  SnakeState,
  TurnNumber,
} from "./types.js";
import { CellType } from "./types.js";

export const sid = (n: number): SnakeId => n as SnakeId;
export const tid = (s: string): CentaurTeamId => s as CentaurTeamId;
export const iid = (n: number): ItemId => n as ItemId;
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
  readonly pendingEffects?: ReadonlyArray<PotionEffect>;
  readonly lastDirection?: Direction | null;
  readonly alive?: boolean;
  readonly ateLastTurn?: boolean;
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
    pendingEffects: overrides.pendingEffects ?? [],
    lastDirection: overrides.lastDirection !== undefined ? overrides.lastDirection : null,
    alive: overrides.alive ?? true,
    ateLastTurn: overrides.ateLastTurn ?? false,
  };
}

export function makeItem(itemId: number, itemType: ItemType, cell: Cell): ItemState {
  return { itemId: iid(itemId), itemType, cell, consumed: false };
}

export function effect(
  family: PotionEffect["family"],
  state: PotionEffect["state"],
  expiryTurn: number,
): PotionEffect {
  return { family, state, expiryTurn: turn(expiryTurn) };
}
