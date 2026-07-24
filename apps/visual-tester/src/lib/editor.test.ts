// Editor-boundary contiguity guard (visual-tester/board-editor
// #structural-validity-enforced): bodies grow only onto cells adjacent to
// or stacked on the current tail — the shapes game-engine/movement produces
// and the only ones the silhouette renderer (design D10) accepts.
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-engine";
import type { CentaurTeamId, GameState, SnakeId } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { addSnake, appendBodyCell, cellParity, requiredHeadParity } from "./editor";
import { blankState } from "./factory";

const CONFIG = DEFAULT_GAME_CONFIG.runtime;
const TEAM = "team-red" as CentaurTeamId;

function withSnake(): { state: GameState; id: SnakeId } {
  const r = addSnake(blankState(11), { x: 5, y: 5 }, TEAM, 100, CONFIG);
  if (!r.ok) throw new Error(r.error);
  const id = r.state.snakes[0]?.snakeId;
  if (id === undefined) throw new Error("no snake created");
  return { state: r.state, id };
}

describe("appendBodyCell contiguity", () => {
  it("accepts a cell orthogonally adjacent to the tail", () => {
    const { state, id } = withSnake();
    const r = appendBodyCell(state, id, { x: 5, y: 6 });
    expect(r.ok).toBe(true);
  });

  it("accepts a cell stacked on the tail (duplicated-tail growth shape)", () => {
    const { state, id } = withSnake();
    const r = appendBodyCell(state, id, { x: 5, y: 5 });
    expect(r.ok).toBe(true);
  });

  it("rejects a diagonal cell and leaves the state unchanged", () => {
    const { state, id } = withSnake();
    const r = appendBodyCell(state, id, { x: 6, y: 6 });
    expect(r.ok).toBe(false);
    expect(state.snakes[0]?.body).toHaveLength(1);
  });

  it("rejects a distant cell", () => {
    const { state, id } = withSnake();
    const r = appendBodyCell(state, id, { x: 8, y: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/contiguous/);
  });

  it("checks adjacency against the current tail, not the head", () => {
    const { state, id } = withSnake();
    const grown = appendBodyCell(state, id, { x: 5, y: 6 });
    if (!grown.ok) throw new Error(grown.error);
    // (5,4) is adjacent to the head (5,5) but not to the tail (5,6).
    expect(appendBodyCell(grown.state, id, { x: 5, y: 4 }).ok).toBe(false);
    expect(appendBodyCell(grown.state, id, { x: 5, y: 7 }).ok).toBe(true);
  });
});

// Head parity (visual-tester/board-editor#head-parity-enforced): a new head
// must share (x+y) mod 2 with the heads already present this turn.
describe("head parity on addSnake", () => {
  it("has no parity constraint until the first head is placed", () => {
    expect(requiredHeadParity(blankState(11))).toBeNull();
    // The first head goes anywhere — both parities accepted from empty.
    expect(addSnake(blankState(11), { x: 5, y: 5 }, TEAM, 100, CONFIG).ok).toBe(true); // even
    expect(addSnake(blankState(11), { x: 5, y: 6 }, TEAM, 100, CONFIG).ok).toBe(true); // odd
  });

  it("fixes the required parity from the first alive head", () => {
    const { state } = withSnake(); // head at (5,5) → parity 0
    expect(requiredHeadParity(state)).toBe(0);
    expect(cellParity({ x: 5, y: 5 })).toBe(0);
  });

  it("accepts a same-parity head and rejects an opposite-parity one", () => {
    const { state } = withSnake(); // (5,5), parity 0
    // (6,6) shares parity 0 (diagonally adjacent) → accepted.
    const okSame = addSnake(state, { x: 6, y: 6 }, TEAM, 100, CONFIG);
    expect(okSame.ok).toBe(true);
    // (5,6) is parity 1 (orthogonally adjacent) → rejected.
    const bad = addSnake(state, { x: 5, y: 6 }, TEAM, 100, CONFIG);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/parity/);
    // The rejected placement leaves the snake set unchanged.
    expect(state.snakes).toHaveLength(1);
  });

  it("ignores dead snakes when fixing parity (they are off the board)", () => {
    const { state } = withSnake();
    const dead = { ...state, snakes: state.snakes.map((s) => ({ ...s, alive: false })) };
    expect(requiredHeadParity(dead)).toBeNull();
  });
});
