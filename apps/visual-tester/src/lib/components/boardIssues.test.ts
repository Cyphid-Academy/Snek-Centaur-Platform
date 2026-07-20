// spec: visual-tester/invalid-state-surfacing — detection of discontinuous
// snake bodies, the invalid state the board must expose rather than hide.
import type { Cell, CentaurTeamId, GameState, SnakeId, SnakeState } from "@cyphid/snek-engine";
import { itemsByCell } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { describeContiguityIssue, snakeContiguityIssues } from "./boardIssues";
import { firstDiscontinuity } from "./snakeBodyPath";

function snake(letter: string, body: Cell[], id: number): SnakeState {
  return {
    snakeId: id as SnakeId,
    letter,
    centaurTeamId: "team-red" as CentaurTeamId,
    body,
    health: 100,
    activeEffects: [],
    lastDirection: null,
    alive: true,
  };
}

function stateWith(snakes: SnakeState[]): GameState {
  const board = { boardSize: 11, cells: [] } as unknown as GameState["board"];
  return { board, snakes, items: itemsByCell(board, []), clocks: [] };
}

describe("firstDiscontinuity", () => {
  it("returns null for adjacent and stacked bodies", () => {
    expect(
      firstDiscontinuity([
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 2 }, // stacked — contiguous
        { x: 3, y: 3 },
      ]),
    ).toBeNull();
  });

  it("flags the first gap with the later segment's index", () => {
    const d = firstDiscontinuity([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 5, y: 2 }, // jump
    ]);
    expect(d).toEqual({ index: 2, a: { x: 3, y: 2 }, b: { x: 5, y: 2 } });
  });

  it("treats a diagonal step as discontinuous", () => {
    expect(
      firstDiscontinuity([
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ])?.index,
    ).toBe(1);
  });
});

describe("snakeContiguityIssues", () => {
  it("returns nothing when every snake is contiguous", () => {
    const s = stateWith([
      snake(
        "A",
        [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
        ],
        1,
      ),
      snake("B", [{ x: 5, y: 5 }], 2),
    ]);
    expect(snakeContiguityIssues(s)).toEqual([]);
  });

  it("reports each broken snake with its letter and id", () => {
    const s = stateWith([
      snake(
        "A",
        [
          { x: 2, y: 2 },
          { x: 3, y: 2 },
        ],
        1,
      ), // fine
      snake(
        "B",
        [
          { x: 4, y: 4 },
          { x: 6, y: 4 },
        ],
        2,
      ), // gap
    ]);
    const issues = snakeContiguityIssues(s);
    expect(issues).toHaveLength(1);
    const [issue] = issues;
    if (issue === undefined) throw new Error("expected one issue");
    expect(issue.letter).toBe("B");
    expect(issue.snakeId).toBe(2 as SnakeId);
    const text = describeContiguityIssue(issue);
    expect(text).toContain("Snake B (#2)");
    expect(text).toContain("(6,4)");
  });
});
