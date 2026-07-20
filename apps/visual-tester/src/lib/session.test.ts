import {
  CellType,
  Direction,
  ItemType,
  isValidMove,
  resolveTurn,
  subSeed,
} from "@cyphid/snek-engine";
import type {
  CentaurTeamId,
  GameRuntimeConfig,
  GameState,
  SnakeId,
  StagedMove,
  TurnNumber,
} from "@cyphid/snek-engine";
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import {
  addSnake,
  appendBodyCell,
  paintCell,
  placeItem,
  removeItem,
  removeSnake,
  removeTailCell,
  resizeBoard,
  setSnakeHealth,
} from "./editor.js";
import { blankState } from "./factory.js";
import { turnSeedFor } from "./seed.js";
import {
  createSession,
  editStateAt,
  simulateNext,
  stateAt,
  truncateAfter,
  turnCount,
} from "./session.js";

const CONFIG: GameRuntimeConfig = DEFAULT_GAME_CONFIG.runtime;
const TEAM = "team-red" as CentaurTeamId;
const SEED = new Uint8Array(32).fill(7);

function must<T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> {
  if (!result.ok) throw new Error(`edit rejected: ${JSON.stringify(result)}`);
  return result as Extract<T, { ok: true }>;
}

/** An 11x11 state with one 3-segment snake heading nowhere yet. */
function baseState(): GameState {
  let state = blankState(11);
  state = must(addSnake(state, { x: 5, y: 5 }, TEAM, 100, CONFIG)).state;
  const id = state.snakes[0]?.snakeId as SnakeId;
  state = must(appendBodyCell(state, id, { x: 5, y: 6 })).state;
  state = must(appendBodyCell(state, id, { x: 5, y: 7 })).state;
  return state;
}

function stagedUp(state: GameState): Map<SnakeId, StagedMove> {
  const id = state.snakes[0]?.snakeId as SnakeId;
  return new Map([
    [
      id,
      {
        direction: Direction.Up,
        stagedBy: { kind: "operator", operatorUserId: "t" } as StagedMove["stagedBy"],
      },
    ],
  ]);
}

describe("turn simulation", () => {
  // spec: visual-tester/turn-simulation#full-output-recorded
  it("records the resolver's full output and matches a direct engine call", () => {
    const session = createSession(baseState(), CONFIG, SEED);
    const staged = stagedUp(session.initialState);
    const next = simulateNext(session, staged);
    expect(next.turns).toHaveLength(1);
    const record = next.turns[0];
    expect(record).toBeDefined();
    if (record === undefined) return;

    // spec: test-sequences/determinism#production-seed-derivation
    expect(turnSeedFor(SEED, 0 as TurnNumber)).toEqual(subSeed(SEED, "turn-0"));
    const direct = resolveTurn(
      stateAt(session, 0),
      staged,
      0 as TurnNumber,
      subSeed(SEED, "turn-0"),
      CONFIG,
    );
    expect(record.nextState).toEqual(direct.nextState);
    expect(record.events).toEqual(direct.events);
    expect(record.outcome).toEqual(direct.outcome);
    expect(record.stagedMoves).toEqual(staged);
  });

  // spec: visual-tester/turn-simulation#repeatable
  it("is repeatable: each simulated turn becomes the base for the next", () => {
    let session = createSession(baseState(), CONFIG, SEED);
    session = simulateNext(session, stagedUp(session.initialState));
    session = simulateNext(session, new Map());
    session = simulateNext(session, new Map());
    expect(turnCount(session)).toBe(3);
    expect(session.turns.map((t) => t.turnNumber)).toEqual([0, 1, 2]);
    expect(stateAt(session, 3)).toBe(session.turns[2]?.nextState);
  });

  // spec: visual-tester/move-staging#unstaged-snakes-omitted — an empty map
  // means the resolver falls back (turn 0: seeded random pick).
  it("passes staged moves through unchanged, including certain-death moves", () => {
    const state = baseState();
    const id = state.snakes[0]?.snakeId as SnakeId;
    // Reversing into the still-occupied neck cell is certain death.
    expect(isValidMove(state, id, Direction.Down)).toBe(false);
    const staged = new Map<SnakeId, StagedMove>([
      [
        id,
        {
          direction: Direction.Down,
          stagedBy: { kind: "operator", operatorUserId: "t" } as StagedMove["stagedBy"],
        },
      ],
    ]);
    const session = simulateNext(createSession(state, CONFIG, SEED), staged);
    const events = session.turns[0]?.events ?? [];
    // spec: visual-tester/move-staging#certain-death-moves-stageable — the
    // resolver's own collision handling is exercised.
    const died = events.find((e) => e.kind === "snake_died");
    expect(died).toMatchObject({ snakeId: id, cause: "self_collision" });
  });
});

describe("session history", () => {
  // spec: visual-tester/session-history — immutable per-turn snapshots.
  it("never lets an edit at one turn mutate neighbouring snapshots", () => {
    let session = createSession(baseState(), CONFIG, SEED);
    session = simulateNext(session, stagedUp(session.initialState));
    session = simulateNext(session, new Map());
    session = simulateNext(session, new Map());

    const before0 = structuredClone(stateAt(session, 0));
    const before1 = structuredClone(stateAt(session, 1));
    const before2 = structuredClone(stateAt(session, 2));

    // Edit turn 2's state (paint a hazard) — a history rewrite at k=2.
    const edited = must(paintCell(stateAt(session, 2), { x: 3, y: 3 }, CellType.Hazard)).state;
    const rewritten = editStateAt(session, 2, edited);

    // Neighbouring snapshots are byte-identical before/after the edit.
    expect(stateAt(rewritten, 0)).toEqual(before0);
    expect(stateAt(rewritten, 1)).toEqual(before1);
    // The pre-edit session itself is untouched (turn 2 and 3 intact).
    expect(stateAt(session, 2)).toEqual(before2);
    expect(turnCount(session)).toBe(3);

    // Mutating the state object handed to editStateAt after the fact does
    // not reach into the stored snapshot (deep-copy discipline).
    (edited.board.cells as CellType[])[0] = CellType.Fertile;
    expect(stateAt(rewritten, 2).board.cells[0]).toBe(CellType.Wall);
  });

  it("stateAt(0) is the initial state and out-of-range positions throw", () => {
    const session = createSession(baseState(), CONFIG, SEED);
    expect(stateAt(session, 0)).toEqual(baseState());
    expect(() => stateAt(session, 1)).toThrow();
    expect(() => stateAt(session, -1)).toThrow();
  });
});

describe("history rewrite", () => {
  // spec: visual-tester/history-rewrite#future-turns-discarded
  it("editing turn k discards turns k+1..n and simulation continues from k", () => {
    let session = createSession(baseState(), CONFIG, SEED);
    session = simulateNext(session, stagedUp(session.initialState));
    session = simulateNext(session, new Map());
    session = simulateNext(session, new Map());
    session = simulateNext(session, new Map());
    expect(turnCount(session)).toBe(4);

    const edited = must(paintCell(stateAt(session, 2), { x: 4, y: 4 }, CellType.Hazard)).state;
    const rewritten = editStateAt(session, 2, edited);
    expect(turnCount(rewritten)).toBe(2); // turns 3 and 4 discarded
    expect(stateAt(rewritten, 2)).toEqual(edited);

    // The next simulation produces a new turn k+1 (turn number 2, position 3).
    const continued = simulateNext(rewritten, new Map());
    expect(turnCount(continued)).toBe(3);
    expect(continued.turns[2]?.turnNumber).toBe(2);
  });

  it("editing the initial state (k=0) clears the whole history", () => {
    let session = createSession(baseState(), CONFIG, SEED);
    session = simulateNext(session, new Map());
    const edited = must(paintCell(stateAt(session, 0), { x: 2, y: 2 }, CellType.Fertile)).state;
    const rewritten = editStateAt(session, 0, edited);
    expect(turnCount(rewritten)).toBe(0);
    expect(stateAt(rewritten, 0)).toEqual(edited);
  });

  it("truncateAfter keeps exactly the first k turns", () => {
    let session = createSession(baseState(), CONFIG, SEED);
    session = simulateNext(session, new Map());
    session = simulateNext(session, new Map());
    expect(turnCount(truncateAfter(session, 1))).toBe(1);
    expect(truncateAfter(session, 2)).toBe(session);
  });
});

describe("editor boundary", () => {
  // spec: visual-tester/board-editor#structural-validity-enforced
  it("rejects out-of-bounds and wall-ring edits, leaving state unchanged", () => {
    const state = blankState(11);
    expect(paintCell(state, { x: 11, y: 5 }, CellType.Hazard).ok).toBe(false);
    expect(paintCell(state, { x: -1, y: 5 }, CellType.Hazard).ok).toBe(false);
    expect(paintCell(state, { x: 0, y: 0 }, CellType.Hazard).ok).toBe(false); // wall ring
    expect(placeItem(state, { x: 20, y: 20 }, ItemType.Food).ok).toBe(false);
    expect(addSnake(state, { x: 99, y: 1 }, TEAM, 100, CONFIG).ok).toBe(false); // out of bounds
    expect(addSnake(state, { x: 5, y: 5 }, TEAM, 0, CONFIG).ok).toBe(false); // health < 1
  });

  // spec: visual-tester/board-editor#arbitrary-states-allowed
  it("accepts states boardgen would never produce", () => {
    let state = blankState(11);
    // Single-segment snake.
    state = must(addSnake(state, { x: 5, y: 5 }, TEAM, 1, CONFIG)).state;
    // Diagonally adjacent enemy head — shares the heads' parity (orthogonally
    // adjacent would be the wrong parity; see #head-parity-enforced).
    state = must(addSnake(state, { x: 6, y: 6 }, "team-blue" as CentaurTeamId, 500, CONFIG)).state;
    // Disconnected hazard regions.
    state = must(paintCell(state, { x: 1, y: 1 }, CellType.Hazard)).state;
    state = must(paintCell(state, { x: 9, y: 9 }, CellType.Hazard)).state;
    expect(state.snakes).toHaveLength(2);
    expect(state.snakes[0]?.body).toHaveLength(1);
    // Clocks were synced for both teams (read-only carried data).
    expect(state.clocks.map((c) => c.centaurTeamId).sort()).toEqual(["team-blue", "team-red"]);
    // The resolver accepts it.
    const session = simulateNext(createSession(state, CONFIG, SEED), new Map());
    expect(session.turns[0]?.outcome).toBeDefined();
  });

  // spec: visual-tester/board-editor#derived-lifecycle-fields
  it("authors snakes alive with null lastDirection", () => {
    const state = must(addSnake(blankState(11), { x: 5, y: 5 }, TEAM, 100, CONFIG)).state;
    expect(state.snakes[0]?.alive).toBe(true);
    expect(state.snakes[0]?.lastDirection).toBeNull();
  });

  it("keeps body length >= 1 and validates health", () => {
    let state = must(addSnake(blankState(11), { x: 5, y: 5 }, TEAM, 100, CONFIG)).state;
    const id = state.snakes[0]?.snakeId as SnakeId;
    expect(removeTailCell(state, id).ok).toBe(false); // would drop below 1
    state = must(appendBodyCell(state, id, { x: 5, y: 6 })).state;
    expect(must(removeTailCell(state, id)).state.snakes[0]?.body).toHaveLength(1);
    expect(setSnakeHealth(state, id, -3).ok).toBe(false);
    expect(appendBodyCell(state, id, { x: 50, y: 6 }).ok).toBe(false);
  });

  // spec: visual-tester/board-editor#letters-auto-assigned
  it("auto-assigns letters by index within each team, re-lettering on removal", () => {
    let state = blankState(11);
    state = must(addSnake(state, { x: 2, y: 2 }, TEAM, 100, CONFIG)).state;
    state = must(addSnake(state, { x: 3, y: 3 }, TEAM, 100, CONFIG)).state;
    state = must(addSnake(state, { x: 4, y: 4 }, "team-blue" as CentaurTeamId, 100, CONFIG)).state;
    const letters = (s: GameState, team: string) =>
      s.snakes.filter((sn) => sn.centaurTeamId === team).map((sn) => sn.letter);
    expect(letters(state, TEAM)).toEqual(["A", "B"]);
    expect(letters(state, "team-blue")).toEqual(["A"]);
    // Remove the first red snake — the remaining one re-letters to A.
    const firstRed = state.snakes.find((sn) => sn.centaurTeamId === TEAM)?.snakeId as SnakeId;
    state = must(removeSnake(state, firstRed, CONFIG)).state;
    expect(letters(state, TEAM)).toEqual(["A"]);
  });

  // spec: visual-tester/board-editor#item-not-on-body — an item may never share
  // a cell with a snake body (the engine keeps items off alive bodies; editor
  // snakes are all alive), so the editor rejects it from both directions.
  it("rejects an item on a snake body and a snake body on an item", () => {
    const withSnake = must(addSnake(blankState(11), { x: 4, y: 4 }, TEAM, 100, CONFIG)).state;
    // Item onto a body cell → rejected.
    expect(placeItem(withSnake, { x: 4, y: 4 }, ItemType.Food).ok).toBe(false);
    const id = withSnake.snakes[0]?.snakeId as SnakeId;
    // Extending the body onto an item cell → rejected.
    const withItem = must(placeItem(withSnake, { x: 4, y: 5 }, ItemType.Food)).state;
    expect(appendBodyCell(withItem, id, { x: 4, y: 5 }).ok).toBe(false);
    // Adding a new snake head onto an item cell → rejected.
    expect(addSnake(withItem, { x: 4, y: 5 }, TEAM, 100, CONFIG).ok).toBe(false);
  });

  it("keeps one item per cell by replacing on placement, and removes items", () => {
    let state = blankState(11);
    state = must(placeItem(state, { x: 4, y: 4 }, ItemType.Food)).state;
    // Placing over an existing item replaces it rather than failing.
    const replaced = placeItem(state, { x: 4, y: 4 }, ItemType.InvisPotion);
    expect(replaced.ok).toBe(true);
    state = must(replaced).state;
    expect(state.items.size).toBe(1);
    const item = [...state.items.values()][0];
    expect(item?.itemType).toBe(ItemType.InvisPotion);
    expect(removeItem(state, { x: 5, y: 5 }).ok).toBe(false);
    state = must(removeItem(state, { x: 4, y: 4 })).state;
    expect(state.items.size).toBe(0);
  });

  it("resizes with a fresh wall ring, preserving in-bounds terrain", () => {
    let state = blankState(11);
    state = must(paintCell(state, { x: 3, y: 3 }, CellType.Hazard)).state;
    state = must(addSnake(state, { x: 9, y: 9 }, TEAM, 100, CONFIG)).state;
    expect(resizeBoard(state, 2, CONFIG).ok).toBe(false);
    const resized = must(resizeBoard(state, 7, CONFIG)).state;
    expect(resized.board.boardSize).toBe(7);
    expect(resized.board.cells[3 * 7 + 3]).toBe(CellType.Hazard);
    expect(resized.board.cells[0]).toBe(CellType.Wall);
    expect(resized.snakes).toHaveLength(0); // (9,9) fell out of bounds
  });
});
