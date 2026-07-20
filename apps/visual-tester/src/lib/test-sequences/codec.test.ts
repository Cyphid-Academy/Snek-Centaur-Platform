// spec: test-sequences/canonical-encoding — round-trip and
// equal-values-equal-json tests for the canonical codec.
import {
  type CellIndex,
  type CentaurTeamId,
  Direction,
  type Item,
  type SnakeId,
} from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  bytesToHex,
  decodeGameState,
  decodeOutcome,
  decodeStagedMoves,
  decodeTestSequence,
  encodeEvent,
  encodeGameState,
  encodeOutcome,
  encodeStagedMoves,
  encodeTestSequence,
  hexToBytes,
} from "./codec.js";
import {
  TEAM_BLUE,
  TEAM_RED,
  buildInitialState,
  defaultConfig,
  gameSeed,
  moves,
  operator,
  recordSequence,
} from "./fixtures.js";
import { deriveTurnSeed } from "./seed.js";

describe("seed hex encoding", () => {
  it("round-trips 32-byte seeds through lowercase hex", () => {
    const seed = deriveTurnSeed(gameSeed(), 3);
    const hex = bytesToHex(seed);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    expect(hexToBytes(hex)).toEqual(seed);
  });

  it("rejects non-canonical hex", () => {
    expect(() => hexToBytes("AB")).toThrow();
    expect(() => hexToBytes("abc")).toThrow();
  });
});

describe("game state encoding", () => {
  it("round-trips losslessly (test-sequences/canonical-encoding#lossless-round-trip)", () => {
    const state = buildInitialState();
    const decoded = decodeGameState(encodeGameState(state));
    expect(decoded).toEqual(state);
  });

  it("survives JSON.stringify/parse", () => {
    const state = buildInitialState();
    const json = JSON.parse(JSON.stringify(encodeGameState(state)));
    expect(decodeGameState(json)).toEqual(state);
  });

  it("encodes equal item maps built in different insertion orders identically (#equal-values-equal-json)", () => {
    const state = buildInitialState();
    const a: Item = { itemType: 0, spawnTurn: 1 as never, spawnIndex: 0, cell: { x: 3, y: 3 } };
    const b: Item = { itemType: 1, spawnTurn: 1 as never, spawnIndex: 1, cell: { x: 5, y: 5 } };
    const idxA = (3 * 9 + 3) as CellIndex;
    const idxB = (5 * 9 + 5) as CellIndex;
    const s1 = {
      ...state,
      items: new Map<CellIndex, Item>([
        [idxA, a],
        [idxB, b],
      ]),
    };
    const s2 = {
      ...state,
      items: new Map<CellIndex, Item>([
        [idxB, b],
        [idxA, a],
      ]),
    };
    expect(JSON.stringify(encodeGameState(s1))).toBe(JSON.stringify(encodeGameState(s2)));
  });
});

describe("staged moves encoding", () => {
  it("preserves absence as key absence (test-sequences/sequence-format#optional-moves)", () => {
    const staged = moves([[2, Direction.Left]]); // snake 1 unstaged
    const json = encodeStagedMoves(staged);
    expect(Object.keys(json)).toEqual(["2"]);
    expect("1" in json).toBe(false);
    expect(decodeStagedMoves(json)).toEqual(staged);
  });

  it("encodes equal maps built in different insertion orders identically", () => {
    const m1 = moves([
      [1, Direction.Up],
      [2, Direction.Down],
    ]);
    const m2 = moves([
      [2, Direction.Down],
      [1, Direction.Up],
    ]);
    expect(JSON.stringify(encodeStagedMoves(m1))).toBe(JSON.stringify(encodeStagedMoves(m2)));
  });
});

describe("outcome encoding", () => {
  it("encodes score maps with lexicographically sorted keys and round-trips", () => {
    const outcome = {
      kind: "victory" as const,
      winnerCentaurTeamId: TEAM_RED,
      scores: new Map<CentaurTeamId, number>([
        [TEAM_RED, 3],
        [TEAM_BLUE, 1],
      ]),
    };
    const json = encodeOutcome(outcome);
    if (json.kind !== "victory") throw new Error("unexpected kind");
    expect(Object.keys(json.scores)).toEqual(["team-blue", "team-red"]);
    expect(decodeOutcome(json)).toEqual(outcome);

    const reordered = encodeOutcome({
      ...outcome,
      scores: new Map<CentaurTeamId, number>([
        [TEAM_BLUE, 1],
        [TEAM_RED, 3],
      ]),
    });
    expect(JSON.stringify(json)).toBe(JSON.stringify(reordered));
  });
});

describe("event encoding", () => {
  it("omits the sources key when absent, includes it when present", () => {
    const base = {
      kind: "snake_died" as const,
      snakeId: 1 as SnakeId,
      cause: "wall" as const,
      killerSnakeId: null,
      location: { x: 1, y: 1 },
    };
    expect("sources" in encodeEvent(base)).toBe(false);
    const withSources = encodeEvent({
      ...base,
      cause: "health_depletion",
      sources: ["tick", "hazard"],
    });
    expect(withSources).toHaveProperty("sources", ["tick", "hazard"]);
  });
});

describe("full sequence document", () => {
  it("round-trips a real recorded sequence losslessly", () => {
    const seq = recordSequence(
      "roundtrip",
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
    );
    const doc = encodeTestSequence(seq);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    const decoded = decodeTestSequence(JSON.parse(JSON.stringify(doc)));
    expect(decoded).toEqual(seq);
    // Re-encoding the decoded value reproduces the identical document.
    expect(JSON.stringify(encodeTestSequence(decoded))).toBe(JSON.stringify(doc));
  });

  it("uses operator agents faithfully", () => {
    const agent = operator("op-x");
    expect(agent.kind).toBe("operator");
  });
});
