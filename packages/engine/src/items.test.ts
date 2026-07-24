import { describe, expect, it } from "vitest";
import { cellIndex } from "./board.js";
import { SETUP_SPAWN_TURN, itemAt, itemIdOf, itemsByCell, spawnTurnAfter } from "./items.js";
import { emptyBoard, makeItem, turn } from "./testkit.js";
import { ItemType } from "./types.js";

describe("itemsByCell / itemAt (game-engine/item-identity)", () => {
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

describe("item identity (game-engine/item-identity)", () => {
  it("defines the spawn boundaries: setup at 0, turn T's spawns at T + 1", () => {
    expect(SETUP_SPAWN_TURN).toBe(0);
    expect(spawnTurnAfter(turn(0))).toBe(1); // turn 0's resolution spawns
    expect(spawnTurnAfter(turn(5))).toBe(6);
  });

  it("derives the scalar id from the identity pair", () => {
    expect(itemIdOf({ spawnTurn: turn(0), spawnIndex: 3 })).toBe("0:3");
    expect(itemIdOf({ spawnTurn: turn(5), spawnIndex: 2 })).toBe("5:2");
  });

  // spec: game-engine/item-identity#ids-never-collide
  it("never collides across spawn turns and indices", () => {
    const ids = new Set<string>();
    for (let t = 0; t < 40; t++)
      for (let k = 0; k < 40; k++) ids.add(itemIdOf({ spawnTurn: turn(t), spawnIndex: k }));
    expect(ids.size).toBe(1600);
  });
});
