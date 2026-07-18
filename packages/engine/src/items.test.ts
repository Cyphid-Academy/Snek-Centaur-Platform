import { describe, expect, it } from "vitest";
import { cellIndex } from "./board.js";
import { ITEM_ID_STRIDE, itemAt, itemIdFor, itemsByCell } from "./items.js";
import { emptyBoard, makeItem } from "./testkit.js";
import { ItemType } from "./types.js";

describe("itemsByCell / itemAt (game-rules/item-identity)", () => {
  const board = emptyBoard(11);

  it("keys each item by its canonical cell index", () => {
    const food = makeItem(0, ItemType.Food, { x: 3, y: 4 });
    const potion = makeItem(1, ItemType.InvulnPotion, { x: 5, y: 5 });
    const map = itemsByCell(board, [food, potion]);
    expect(map.size).toBe(2);
    expect(map.get(cellIndex(board, { x: 3, y: 4 }))).toEqual(food);
    expect(itemAt(board, map, { x: 5, y: 5 })).toEqual(potion);
    expect(itemAt(board, map, { x: 6, y: 5 })).toBeNull();
  });

  it("rejects two items on one cell — single occupancy is structural", () => {
    const a = makeItem(0, ItemType.Food, { x: 3, y: 4 });
    const b = makeItem(1, ItemType.InvisPotion, { x: 3, y: 4 });
    expect(() => itemsByCell(board, [a, b])).toThrow(/share cell/);
  });
});

describe("itemIdFor (game-rules/item-identity)", () => {
  it("allocates turn-namespaced ids", () => {
    expect(itemIdFor(0, 0)).toBe(0); // game setup
    expect(itemIdFor(0, 3)).toBe(3);
    expect(itemIdFor(1, 0)).toBe(ITEM_ID_STRIDE); // turn 0's spawns
    expect(itemIdFor(5, 2)).toBe(5 * ITEM_ID_STRIDE + 2);
  });

  it("fails loudly on namespace exhaustion instead of colliding", () => {
    expect(() => itemIdFor(1, ITEM_ID_STRIDE)).toThrow(/exhausted/);
  });
});
