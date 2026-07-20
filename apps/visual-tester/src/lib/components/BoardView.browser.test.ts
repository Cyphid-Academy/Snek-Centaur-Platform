// spec: visual-tester/invalid-state-surfacing#discontinuous-body-flagged —
// mounting BoardView with a discontinuous snake surfaces a loud error and
// does NOT draw that snake as a continuous silhouette; a valid snake in the
// same state still renders its path. Runs in the "components" vitest project
// (client build + jsdom).
import type { Cell, CentaurTeamId, GameState, SnakeId, SnakeState } from "@cyphid/snek-engine";
import { CellType, itemsByCell } from "@cyphid/snek-engine";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import BoardView from "./BoardView.svelte";

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

function state(snakes: SnakeState[]): GameState {
  const n = 11;
  const cells = Array.from({ length: n * n }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    return x === 0 || y === 0 || x === n - 1 || y === n - 1 ? CellType.Wall : CellType.Normal;
  });
  const board = { boardSize: n, cells } as unknown as GameState["board"];
  return { board, snakes, items: itemsByCell(board, []), clocks: [] };
}

let target: HTMLElement;
let comp: Record<string, unknown> | undefined;

beforeEach(() => {
  target = document.createElement("div");
  document.body.append(target);
});
afterEach(() => {
  if (comp) unmount(comp);
  comp = undefined;
  target.remove();
});

describe("BoardView invalid-state surfacing", () => {
  it("shows a discontinuity alert and no silhouette for the broken snake", () => {
    comp = mount(BoardView, {
      target,
      props: {
        state: state([
          snake(
            "B",
            [
              { x: 4, y: 4 },
              { x: 6, y: 4 },
            ],
            2,
          ),
        ]),
        onCellClick: () => {},
      },
    });
    const alert = target.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("discontinuous snake body");
    expect(alert?.textContent).toContain("Snake B (#2)");
    expect(target.querySelector(".broken-seg")).not.toBeNull();
    // No continuous silhouette path was drawn for the broken snake.
    expect(target.querySelector("svg.snakes path")).toBeNull();
  });

  it("renders a silhouette and no alert for a contiguous snake", () => {
    comp = mount(BoardView, {
      target,
      props: {
        state: state([
          snake(
            "A",
            [
              { x: 2, y: 2 },
              { x: 3, y: 2 },
              { x: 4, y: 2 },
            ],
            1,
          ),
        ]),
        onCellClick: () => {},
      },
    });
    expect(target.querySelector('[role="alert"]')).toBeNull();
    expect(target.querySelector(".broken-seg")).toBeNull();
    expect(target.querySelector("svg.snakes path")).not.toBeNull();
  });
});
