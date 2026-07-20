// Tests for the contiguous snake-silhouette path builder (design D10),
// copied from the demo renderer on the PR #6 branch.
import { describe, expect, it } from "vitest";
import { createSnakeBodyPath } from "./snakeBodyPath";

const CELL = 24;
const PAD = 2;

function path(segments: ReadonlyArray<{ x: number; y: number }>): string {
  return createSnakeBodyPath({ segments: [...segments], cellSize: CELL, padding: PAD });
}

describe("createSnakeBodyPath", () => {
  it("returns an empty path for an empty body", () => {
    expect(path([])).toBe("");
  });

  it("renders a single segment as one closed rounded square", () => {
    const d = path([{ x: 3, y: 4 }]);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.match(/Z/g)).toHaveLength(1);
  });

  it("renders a straight body as one closed silhouette", () => {
    const d = path([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 4, y: 2 },
    ]);
    expect(d.match(/M /g)).toHaveLength(1);
    expect(d.endsWith("Z")).toBe(true);
  });

  it("renders an L-shaped body as one closed silhouette", () => {
    const d = path([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]);
    expect(d.match(/M /g)).toHaveLength(1);
  });

  it("dedupes stacked segments (game-start stacks, duplicated growth tails)", () => {
    const stacked = path([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(stacked).toBe(path([{ x: 5, y: 5 }]));
    const grown = path([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 2 },
    ]);
    expect(grown).toBe(
      path([
        { x: 2, y: 2 },
        { x: 3, y: 2 },
      ]),
    );
  });

  it("is deterministic for equal bodies", () => {
    const body = [
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ];
    expect(path(body)).toBe(path(body));
  });

  it("throws on a non-contiguous body", () => {
    expect(() =>
      path([
        { x: 1, y: 1 },
        { x: 3, y: 1 },
      ]),
    ).toThrow(/not orthogonally adjacent/);
  });
});
