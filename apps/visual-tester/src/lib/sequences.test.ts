// Session ⇄ Test Sequence bridge and run-mode presentation helpers.
import { DEFAULT_GAME_CONFIG, Direction } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { groupDifferences, implicatedCellIndices, sectionOf } from "./run.js";
import { sequenceToSession, sessionToSequence } from "./sequences.js";
import { createSession, simulateNext } from "./session.js";
import { encodeTestSequence } from "./test-sequences/codec.js";
import { buildInitialState, gameSeed, moves } from "./test-sequences/fixtures.js";
import { runReplayCheck } from "./test-sequences/replay.js";
import { validateTestSequenceDoc } from "./test-sequences/schema.js";

function simulatedSession() {
  let session = createSession(buildInitialState(), DEFAULT_GAME_CONFIG.runtime, gameSeed());
  session = simulateNext(session, moves([[1, Direction.Right]]));
  session = simulateNext(
    session,
    moves([
      [1, Direction.Down],
      [2, Direction.Up],
    ]),
  );
  return session;
}

describe("sessionToSequence", () => {
  // spec: visual-tester/sequence-management#save-from-session
  it("records initial state, staged moves, and resolver outputs, and validates", () => {
    const session = simulatedSession();
    const seq = sessionToSequence(session, "my sequence");
    expect(seq.name).toBe("my sequence");
    expect(seq.turns).toHaveLength(2);
    expect(seq.turns[0]?.stagedMoves.size).toBe(1);
    expect(seq.turns[1]?.expected.nextState).toEqual(session.turns[1]?.nextState);

    const doc = encodeTestSequence(seq);
    const validated = validateTestSequenceDoc(JSON.parse(JSON.stringify(doc)));
    expect(validated.ok).toBe(true);
  });

  it("produces a sequence that passes its own replay-check", () => {
    const seq = sessionToSequence(simulatedSession(), "replayable");
    const result = runReplayCheck(seq);
    expect(result).toEqual({ passed: true, turnsVerified: 2 });
  });
});

describe("sequenceToSession", () => {
  // spec: visual-tester/sequence-management — history navigable and editable
  // as if just simulated: further simulation continues from the loaded end.
  it("round-trips through a session that can keep simulating", () => {
    const seq = sessionToSequence(simulatedSession(), "loaded");
    let session = sequenceToSession(seq);
    expect(session.turns).toHaveLength(2);
    expect(sessionToSequence(session, "loaded")).toEqual(seq);

    session = simulateNext(session, moves([]));
    expect(session.turns).toHaveLength(3);
    expect(session.turns[2]?.turnNumber).toBe(2);
  });
});

describe("run presentation helpers", () => {
  it("assigns paths to D8 sections", () => {
    expect(sectionOf("nextState.snakes[1].health")).toBe("snakes");
    expect(sectionOf("nextState.board.cells[3]")).toBe("board");
    expect(sectionOf("nextState.items.40.itemType")).toBe("items");
    expect(sectionOf("nextState.clocks[0].budgetMs")).toBe("clocks");
    expect(sectionOf("events[2].kind")).toBe("events");
    expect(sectionOf("outcome.kind")).toBe("outcome");
  });

  it("groups differences in fixed section order", () => {
    const groups = groupDifferences([
      { path: "outcome.kind", expected: "victory", computed: "in_progress" },
      { path: "nextState.snakes[0].health", expected: 99, computed: 98 },
      { path: "nextState.snakes[0].body[0].x", expected: 3, computed: 4 },
    ]);
    expect(groups.map((g) => g.section)).toEqual(["snakes", "outcome"]);
    expect(groups[0]?.differences).toHaveLength(2);
  });

  // spec: visual-tester/sequence-run#divergence-annotated — implicated cells
  // highlighted on the board where a difference path maps to a cell.
  it("maps a genuine divergence back onto board cells", () => {
    const seq = sessionToSequence(simulatedSession(), "diverge");
    // Tamper with turn 0's expected head position so replay halts there.
    const tampered = structuredClone(seq);
    const snake = tampered.turns[0]?.expected.nextState.snakes.find((s) => s.snakeId === 1);
    if (!snake) throw new Error("snake 1 missing");
    (snake.body as Array<{ x: number; y: number }>)[0] = { x: 7, y: 7 };

    const result = runReplayCheck(tampered);
    if (result.passed) throw new Error("expected divergence");
    const size = seq.initialState.board.boardSize;
    const indices = implicatedCellIndices(
      result.differences,
      result.expected,
      result.computed,
      size,
    );
    // Both the tampered expected cell (7,7) and the computed head cell (3,2)
    // are implicated.
    expect(indices.has(7 * size + 7)).toBe(true);
    expect(indices.has(2 * size + 3)).toBe(true);
  });

  it("maps item-map key differences to the keyed cell index", () => {
    const indices = implicatedCellIndices(
      [{ path: "nextState.items.40", expected: undefined, computed: { itemType: 0 } }],
      { nextState: { items: {} } } as never,
      { nextState: { items: {} } } as never,
      9,
    );
    expect(indices.has(40)).toBe(true);
  });
});
