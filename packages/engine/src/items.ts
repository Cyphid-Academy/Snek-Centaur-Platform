// Present-items helpers. spec: 01-REQ-007, 01-REQ-078, 01 §3.2.
//
// GameState.items is the cell-keyed present-items projection of module 04's
// item_lifetimes record: consumed items are simply absent. Flat ItemState
// lists (board-generation output, stored previews, active item_lifetimes
// rows) are the wire form; itemsByCell bridges to the logical map.
import { cellIndex } from "./board.js";
import type { Board, Cell, CellIndex, ItemId, ItemState, ItemsByCell } from "./types.js";

// spec: 01-REQ-078 — ids are allocated per turn namespace: game setup uses
// namespace 0; turn T's resolution allocates in namespace T + 1 (the turn
// boundary at which its spawns first exist). Uniqueness therefore never
// depends on observing consumed items.
export const ITEM_ID_STRIDE = 256;

export function itemIdFor(namespace: number, k: number): ItemId {
  if (k >= ITEM_ID_STRIDE) {
    // Reachable only with spawn rates far outside the 01-REQ-071..073 ranges;
    // fail loudly rather than allocate a colliding id (01-REQ-078).
    throw new Error(`item id namespace ${namespace} exhausted (${k} >= ${ITEM_ID_STRIDE})`);
  }
  return (namespace * ITEM_ID_STRIDE + k) as ItemId;
}

/**
 * Build the logical cell-keyed map from a flat list of present items.
 * Throws if two items share a cell — the single-occupancy invariant of
 * 01-REQ-007 must already hold in any valid wire-form list.
 */
export function itemsByCell(board: Board, items: Iterable<ItemState>): ItemsByCell {
  const map = new Map<CellIndex, ItemState>();
  for (const item of items) {
    const key = cellIndex(board, item.cell);
    const existing = map.get(key);
    if (existing !== undefined) {
      throw new Error(
        `items ${existing.itemId} and ${item.itemId} share cell (${item.cell.x}, ${item.cell.y})`,
      );
    }
    map.set(key, item);
  }
  return map;
}

/** The single nullable item lookup (01 §3.2). */
export function itemAt(board: Board, items: ItemsByCell, cell: Cell): ItemState | null {
  return items.get(cellIndex(board, cell)) ?? null;
}
