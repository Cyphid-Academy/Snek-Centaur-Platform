// Present-items helpers. spec: game-rules/item-identity, 01 §3.2.
//
// GameState.items is the cell-keyed present-items projection of module 04's
// item_lifetimes record: consumed items are simply absent. Flat Item
// lists (board-generation output, stored previews, active item_lifetimes
// rows) are the wire form; itemsByCell bridges to the logical map.
import { cellIndex } from "./board.js";
import type {
  Board,
  Cell,
  CellIndex,
  Item,
  ItemBase,
  ItemId,
  ItemsByCell,
  TurnNumber,
} from "./types.js";

type IdentityPair = Pick<ItemBase, "spawnTurn" | "spawnIndex">;

// spec: game-rules/item-identity — an item's identity is the pair
// (spawnTurn, spawnIndex), carried as fields on the item itself. Game setup
// spawns at boundary SETUP_SPAWN_TURN; turn T's resolution spawns at
// spawnTurnAfter(T), the boundary at which those items first exist.
// Uniqueness of the pair is inherent in the construction.
export const SETUP_SPAWN_TURN = 0 as TurnNumber;

export function spawnTurnAfter(turnNumber: TurnNumber): TurnNumber {
  return (turnNumber + 1) as TurnNumber;
}

/**
 * Derived scalar rendering of the identity pair, for display and keying.
 * Never stored — downstream layers use the pair fields directly
 * (game-rules/item-identity).
 */
export function itemIdOf(identity: IdentityPair): ItemId {
  return `${identity.spawnTurn}:${identity.spawnIndex}` as ItemId;
}

/** Canonical identity ordering: by spawn turn, then spawn index. */
export function compareIdentity(a: IdentityPair, b: IdentityPair): number {
  return a.spawnTurn - b.spawnTurn || a.spawnIndex - b.spawnIndex;
}

/**
 * Build the logical cell-keyed map from a flat list of present items.
 * Throws if two items share a cell — the single-occupancy invariant of
 * game-rules/item-identity must already hold in any valid wire-form list.
 */
export function itemsByCell(board: Board, items: Iterable<Item>): ItemsByCell {
  const map = new Map<CellIndex, Item>();
  for (const item of items) {
    const key = cellIndex(board, item.cell);
    const existing = map.get(key);
    if (existing !== undefined) {
      throw new Error(
        `items ${itemIdOf(existing)} and ${itemIdOf(item)} share cell (${item.cell.x}, ${item.cell.y})`,
      );
    }
    map.set(key, item);
  }
  return map;
}

/** The single nullable item lookup (01 §3.2). */
export function itemAt(board: Board, items: ItemsByCell, cell: Cell): Item | null {
  return items.get(cellIndex(board, cell)) ?? null;
}
