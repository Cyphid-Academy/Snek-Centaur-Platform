// spec: application-shell/one-board-rendering
// The one board, mounted directly: a valid snake draws its silhouette, a
// structurally impossible one is drawn safely rather than thrown over or
// silently smoothed, and a surface's own markings arrive by composition
// (`#composition-not-replacement`) instead of by a second board.
import type {
  Cell,
  CentaurTeamId,
  GameState,
  SnakeId,
  SnakeState,
  TurnNumber,
} from "@cyphid/snek-engine";
import { CellType, itemsByCell } from "@cyphid/snek-engine";
import { createRawSnippet, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import BoardView from "./lib/BoardView.svelte";

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
    turn: 0 as TurnNumber,
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
  return {
    board,
    snakes,
    items: itemsByCell(board, []),
    clocks: [],
    consumedDurationMs: 0,
  } as unknown as GameState;
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
  it("renders a silhouette for a contiguous snake", () => {
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
    expect(target.querySelector(".broken-seg")).toBeNull();
    expect(target.querySelector("svg.snakes path")).not.toBeNull();
  });

  it("draws a discontinuous body as its raw segments instead of failing", () => {
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
    expect(target.querySelectorAll(".broken-seg")).toHaveLength(2);
    // No continuous silhouette was drawn for the broken snake.
    expect(target.querySelector("svg.snakes path")).toBeNull();
    // And the board itself still rendered.
    expect(target.querySelectorAll("button.cell")).toHaveLength(11 * 11);
  });

  it("mounts with no cell handler, for a surface that only shows a board", () => {
    comp = mount(BoardView, { target, props: { state: state([]) } });
    const cell = target.querySelector<HTMLButtonElement>("button.cell");
    expect(cell?.classList.contains("inert")).toBe(true);
    cell?.click(); // nothing to call, and nothing thrown
  });

  // spec: application-shell/one-board-rendering#composition-not-replacement
  it("renders a surface's banner above the board and its overlay over it", () => {
    comp = mount(BoardView, {
      target,
      props: {
        state: state([]),
        banner: createRawSnippet(() => ({
          render: () => '<div role="alert">this surface has something to say</div>',
        })),
        overlay: createRawSnippet<[{ cellSize: number; boardSize: number; padding: number }]>(
          (geometry) => ({
            render: () => {
              const { cellSize, boardSize } = geometry();
              return `<text class="composed">${cellSize}x${boardSize}</text>`;
            },
          }),
        ),
      },
    });
    expect(target.querySelector('[role="alert"]')?.textContent).toContain("something to say");
    expect(target.querySelector(".composed")?.textContent).toBe("24x11");
    // Composed, not forked: one board underneath.
    expect(target.querySelectorAll("div.board")).toHaveLength(1);
  });
});
