// Board geometry helpers. spec: 01 Section 2.2.
import type { Board, Cell, CellIndex, CellType, Direction } from "./types.js";

// spec: game-engine/board-geometry / DOWNSTREAM IMPACT note 3 — flat row-major encoding.
// Also the key type of the present-items map (01 §3.2).
export function cellIndex(board: Board, cell: Cell): CellIndex {
  return (cell.y * board.boardSize + cell.x) as CellIndex;
}

export function cellAt(board: Board, cell: Cell): CellType | undefined {
  if (cell.x < 0 || cell.y < 0 || cell.x >= board.boardSize || cell.y >= board.boardSize) {
    return undefined;
  }
  return board.cells[cellIndex(board, cell)];
}

// spec: game-engine/board-geometry
export function isInner(board: Board, cell: Cell): boolean {
  return cell.x > 0 && cell.x < board.boardSize - 1 && cell.y > 0 && cell.y < board.boardSize - 1;
}

// spec: game-engine/starting-placement
export function parityOf(cell: Cell): 0 | 1 {
  return ((cell.x + cell.y) & 1) as 0 | 1;
}

// spec: game-engine/item-spawning#eligibility — the board, not the config, is
// the authoritative record of whether fertile-ground generation ran.
export function fertileGroundEnabled(board: Board): boolean {
  return board.cells.includes(3 satisfies CellType); // CellType.Fertile
}

// spec: 01 Section 2.2 direction table. Index by Direction numeric value.
const DELTAS: ReadonlyArray<Cell> = [
  { x: 0, y: -1 }, // Up
  { x: 1, y: 0 }, // Right
  { x: 0, y: 1 }, // Down
  { x: -1, y: 0 }, // Left
];

export function advance(cell: Cell, direction: Direction): Cell {
  const d = DELTAS[direction];
  if (d === undefined) throw new Error(`invalid direction: ${direction}`);
  return { x: cell.x + d.x, y: cell.y + d.y };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

// Collision-free numeric key for Map/Set keying of cells. The 4096 stride
// requires boardSize <= 4096; the user-facing bound is 32 (game-engine/configuration-parameters).
export function cellKey(cell: Cell): number {
  return cell.y * 4096 + cell.x;
}
