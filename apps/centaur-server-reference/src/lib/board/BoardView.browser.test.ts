// spec: application-shell/one-board-rendering — BoardView renders an
// engine-built GameState fixture the same way regardless of which surface
// mounts it: correct cell count, terrain classes, a path for a live snake,
// and overlay composition above the board in the shared coordinate frame
// (#one-board-everywhere, #composition-not-replacement). Fixture-building
// pattern adapted from apps/visual-tester/src/lib/components/BoardView.browser.test.ts;
// hand-built here rather than shared across apps. Runs in the "components"
// vitest project (client build + jsdom).
import type {
  Cell,
  CentaurTeamId,
  GameState,
  SnakeId,
  SnakeState,
  TurnNumber,
} from "@cyphid/snek-engine";
import { CellType, asGameState, itemsByCell } from "@cyphid/snek-engine";
import { createRawSnippet, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import BoardView from "./BoardView.svelte";

function snake(letter: string, body: Cell[], id: number, alive = true): SnakeState {
  return {
    snakeId: id as SnakeId,
    letter,
    centaurTeamId: "team-red" as CentaurTeamId,
    body,
    health: 100,
    activeEffects: [],
    lastDirection: null,
    alive,
    turn: 0 as TurnNumber,
  };
}

function stateWith(snakes: SnakeState[], boardSize = 5): GameState {
  const cells = Array.from({ length: boardSize * boardSize }, (_, i) => {
    const x = i % boardSize;
    const y = Math.floor(i / boardSize);
    return x === 0 || y === 0 || x === boardSize - 1 || y === boardSize - 1
      ? CellType.Wall
      : CellType.Normal;
  });
  const board = { boardSize, cells };
  return asGameState({
    board,
    snakes,
    projections: [],
    rewind: null,
    items: itemsByCell(board, []),
    clocks: [],
    consumedDurationMs: 0,
  });
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

describe("BoardView", () => {
  it("renders one cell per board cell, terrain classed correctly", () => {
    comp = mount(BoardView, { target, props: { state: stateWith([]) } });
    expect(target.querySelectorAll(".board .cell").length).toBe(5 * 5);
    // A 5x5 board with a one-cell wall border: 16 wall cells, 9 normal.
    expect(target.querySelectorAll(".cell.wall").length).toBe(16);
    expect(target.querySelectorAll(".cell.normal").length).toBe(9);
  });

  it("draws a path and head label for a live snake, and skips a dead one", () => {
    comp = mount(BoardView, {
      target,
      props: {
        state: stateWith([
          snake(
            "A",
            [
              { x: 2, y: 2 },
              { x: 2, y: 1 },
            ],
            1,
            true,
          ),
          snake("B", [{ x: 3, y: 3 }], 2, false),
        ]),
      },
    });
    expect(target.querySelectorAll("svg.snakes path").length).toBe(1);
    expect(target.querySelector("svg.snakes text")?.textContent).toBe("A");
  });

  it("clicking a cell reports its coordinates through onCellClick", () => {
    const clicked: Cell[] = [];
    comp = mount(BoardView, {
      target,
      props: { state: stateWith([]), onCellClick: (c: Cell) => clicked.push(c) },
    });
    const cell = target.querySelector('.cell[title="(2, 2)"]') as HTMLButtonElement;
    cell.click();
    expect(clicked).toEqual([{ x: 2, y: 2 }]);
  });

  // spec: application-shell/one-board-rendering#composition-not-replacement
  it("composes an overlay above the board in the same coordinate frame", () => {
    const overlay = createRawSnippet<[{ cellSize: number; boardSize: number }]>((getProps) => ({
      render: () => `<text class="overlay-marker">${getProps().cellSize}</text>`,
    }));
    comp = mount(BoardView, {
      target,
      props: { state: stateWith([]), overlay },
    });
    const marker = target.querySelector("svg.overlay .overlay-marker");
    expect(marker).not.toBeNull();
    expect(marker?.textContent).toBe("24");
  });
});
