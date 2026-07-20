// spec: test-sequences/validation, test-sequences/schema-version —
// path-addressed rejection tests for the Zod schema and integrity checks.
import { Direction } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { type TestSequenceDoc, encodeTestSequence } from "./codec.js";
import { buildInitialState, defaultConfig, gameSeed, moves, recordSequence } from "./fixtures.js";
import { SUPPORTED_SCHEMA_VERSIONS, validateTestSequenceDoc } from "./schema.js";
import { deriveTurnSeed } from "./seed.js";

function validDoc(): TestSequenceDoc {
  return encodeTestSequence(
    recordSequence(
      "valid",
      gameSeed(),
      defaultConfig(),
      buildInitialState(),
      [
        {
          turnNumber: 1,
          stagedMoves: moves([
            [1, Direction.Right],
            [2, Direction.Left],
          ]),
        },
        { turnNumber: 2, stagedMoves: moves([[1, Direction.Down]]) },
      ],
      deriveTurnSeed,
    ),
  );
}

// Deep-clone through JSON so tests mutate plain objects, as a paste would be.
// JSON.parse yields `any`, letting tests freely tamper with nested fields.
function clone(doc: TestSequenceDoc) {
  return JSON.parse(JSON.stringify(doc));
}

function errorsOf(input: unknown) {
  const result = validateTestSequenceDoc(input);
  if (result.ok) throw new Error("expected validation to fail");
  return result.errors;
}

describe("schema-version gate", () => {
  it("accepts a valid document", () => {
    const result = validateTestSequenceDoc(validDoc());
    expect(result.ok).toBe(true);
  });

  it("rejects unknown versions naming both versions (#unknown-version-rejected)", () => {
    const doc = clone(validDoc());
    doc.schemaVersion = 99;
    const errors = errorsOf(doc);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("schemaVersion");
    expect(errors[0]?.message).toContain("99");
    expect(errors[0]?.message).toContain(String(SUPPORTED_SCHEMA_VERSIONS[0]));
  });

  it("rejects non-object and versionless input", () => {
    expect(errorsOf("nope")[0]?.path).toBe("(document root)");
    expect(errorsOf({})[0]?.path).toBe("schemaVersion");
  });
});

describe("structural and vocabulary validation", () => {
  it("rejects an out-of-vocabulary direction with the failing path", () => {
    const doc = clone(validDoc());
    doc.turns[0].stagedMoves["1"].direction = 9;
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path === "turns[0].stagedMoves.1.direction")).toBe(true);
  });

  it("rejects a bad cell type in the board", () => {
    const doc = clone(validDoc());
    doc.initialState.board.cells[5] = 42;
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path === "initialState.board.cells[5]")).toBe(true);
  });

  it("rejects a non-contiguous snake body with the failing segment path", () => {
    const doc = clone(validDoc());
    const body = doc.initialState.snakes[0].body;
    const tail = body[body.length - 1];
    body.push({ x: tail.x + 3, y: tail.y }); // teleporting segment
    const errors = errorsOf(doc);
    expect(errors.some((e) => /contiguous/.test(e.message))).toBe(true);
  });

  it("accepts stacked body segments (duplicated-tail growth shape)", () => {
    const doc = clone(validDoc());
    const body = doc.initialState.snakes[0].body;
    body.push({ ...body[body.length - 1] }); // duplicated tail
    expect(validateTestSequenceDoc(doc).ok).toBe(true);
  });

  it("rejects a malformed game seed", () => {
    const doc = clone(validDoc());
    doc.gameSeed = "XYZ";
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path === "gameSeed" && /hex/.test(e.message))).toBe(true);
  });

  it("rejects a board whose cells length is not boardSize²", () => {
    const doc = clone(validDoc());
    doc.initialState.board.cells.push(0);
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path === "initialState.board.cells")).toBe(true);
  });

  it("rejects an item whose map key disagrees with its cell index", () => {
    const doc = clone(validDoc());
    const items = doc.initialState.items;
    const key = Object.keys(items)[0] as string;
    items["3"] = items[key];
    delete items[key];
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path === "initialState.items.3")).toBe(true);
  });

  it("rejects an unknown event kind", () => {
    const doc = clone(validDoc());
    doc.turns[0].expected.events.push({ kind: "meteor_strike" });
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path.startsWith("turns[0].expected.events["))).toBe(true);
  });
});

describe("referential integrity (#referential-integrity)", () => {
  it("rejects a staged move for a snake absent from that turn's pre-state", () => {
    const doc = clone(validDoc());
    doc.turns[1].stagedMoves["77"] = doc.turns[1].stagedMoves["1"];
    const errors = errorsOf(doc);
    const err = errors.find((e) => e.path === "turns[1].stagedMoves.77");
    if (err === undefined) throw new Error("expected an error at turns[1].stagedMoves.77");
    expect(err.message).toContain("77");
    expect(err.message).toContain("turn 2");
  });

  it("rejects non-consecutive turn numbers", () => {
    const doc = clone(validDoc());
    doc.turns[1].turnNumber = 5;
    const errors = errorsOf(doc);
    expect(errors.some((e) => e.path === "turns[1].turnNumber")).toBe(true);
  });
});
