import { describe, expect, it } from "vitest";
import { advance, cellIndex, fertileGroundEnabled, isInner, parityOf } from "./board.js";
import { emptyBoard } from "./testkit.js";
import { CellType, Direction } from "./types.js";

describe("cellIndex", () => {
  // spec: 01-REQ-008 / DOWNSTREAM IMPACT note 3 — row-major y * boardSize + x
  it("uses row-major y * boardSize + x indexing", () => {
    const board = emptyBoard(7);
    expect(cellIndex(board, { x: 0, y: 0 })).toBe(0);
    expect(cellIndex(board, { x: 3, y: 0 })).toBe(3);
    expect(cellIndex(board, { x: 0, y: 1 })).toBe(7);
    expect(cellIndex(board, { x: 2, y: 4 })).toBe(30);
  });
});

describe("isInner", () => {
  // spec: 01-REQ-009 — inner cells are the (boardSize-2)^2 cells off the border
  it("classifies border cells as not inner", () => {
    const board = emptyBoard(7);
    expect(isInner(board, { x: 0, y: 3 })).toBe(false);
    expect(isInner(board, { x: 6, y: 3 })).toBe(false);
    expect(isInner(board, { x: 3, y: 0 })).toBe(false);
    expect(isInner(board, { x: 3, y: 6 })).toBe(false);
    expect(isInner(board, { x: 0, y: 0 })).toBe(false);
  });

  it("classifies non-border cells as inner", () => {
    const board = emptyBoard(7);
    expect(isInner(board, { x: 1, y: 1 })).toBe(true);
    expect(isInner(board, { x: 5, y: 5 })).toBe(true);
    expect(isInner(board, { x: 3, y: 3 })).toBe(true);
  });
});

describe("parityOf", () => {
  // spec: 01-REQ-016 — parity is (x + y) mod 2
  it("computes (x + y) mod 2", () => {
    expect(parityOf({ x: 0, y: 0 })).toBe(0);
    expect(parityOf({ x: 1, y: 0 })).toBe(1);
    expect(parityOf({ x: 2, y: 3 })).toBe(1);
    expect(parityOf({ x: 3, y: 3 })).toBe(0);
  });
});

describe("fertileGroundEnabled", () => {
  // spec: 01-REQ-048 / resolved 01-REVIEW-017 — derived from the board, not config
  it("is false for a board with no Fertile cells", () => {
    expect(fertileGroundEnabled(emptyBoard(7))).toBe(false);
  });

  it("is true when any cell is Fertile", () => {
    const board = emptyBoard(7);
    const cells = [...board.cells];
    cells[cellIndex(board, { x: 2, y: 2 })] = CellType.Fertile;
    expect(fertileGroundEnabled({ boardSize: 7, cells })).toBe(true);
  });
});

describe("advance", () => {
  // spec: 01 Section 2.2 direction semantics — Up is -y, Down is +y
  it("moves one cell in each direction", () => {
    const c = { x: 3, y: 3 };
    expect(advance(c, Direction.Up)).toEqual({ x: 3, y: 2 });
    expect(advance(c, Direction.Right)).toEqual({ x: 4, y: 3 });
    expect(advance(c, Direction.Down)).toEqual({ x: 3, y: 4 });
    expect(advance(c, Direction.Left)).toEqual({ x: 2, y: 3 });
  });
});
