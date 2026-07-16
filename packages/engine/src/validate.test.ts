import { describe, expect, it } from "vitest";
import { emptyBoard, makeSnake, sid } from "./testkit.js";
import type { GameState, SnakeState } from "./types.js";
import { Direction } from "./types.js";
import { isValidMove } from "./validate.js";

function state(snakes: SnakeState[]): GameState {
  return { board: emptyBoard(11), snakes, items: new Map(), clocks: [] };
}

describe("isValidMove", () => {
  it("accepts an open-cell move and rejects a wall move", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
    });
    expect(isValidMove(state([s]), sid(0), Direction.Up)).toBe(true);
    expect(isValidMove(state([s]), sid(0), Direction.Left)).toBe(false); // wall at x=0
  });

  it("rejects a move into a certain self-collision, honouring tail movement", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
      ],
    });
    expect(isValidMove(state([s]), sid(0), Direction.Right)).toBe(false); // (4,3) stays occupied
    // Tail-chase on a 2x2 loop is legal: the tail vacates the target cell.
    const loop = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 3 },
      ],
    });
    expect(isValidMove(state([loop]), sid(0), Direction.Right)).toBe(true);
  });

  it("treats a duplicated tail cell as staying occupied after the move", () => {
    // Doubled tail from growth (01-REQ-062): only one copy drops this turn,
    // so the tail cell remains occupied and the move into it is fatal.
    const loop = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 4, y: 3 },
      ],
    });
    expect(isValidMove(state([loop]), sid(0), Direction.Right)).toBe(false);
  });

  it("returns false for missing or dead snakes", () => {
    const dead = makeSnake({ snakeId: sid(0), alive: false });
    expect(isValidMove(state([dead]), sid(0), Direction.Up)).toBe(false);
    expect(isValidMove(state([dead]), sid(9), Direction.Up)).toBe(false);
  });
});
