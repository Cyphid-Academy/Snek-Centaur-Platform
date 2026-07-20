// spec: test-sequences/replay-check — pass, halt-at-first-divergence, and
// event-only-divergence tests over genuine engine output.
import { Direction } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import type { TestSequence } from "./codec.js";
import { buildInitialState, defaultConfig, gameSeed, moves, recordSequence } from "./fixtures.js";
import { runReplayCheck } from "./replay.js";
import { deriveTurnSeed } from "./seed.js";

function recordThreeTurns(): TestSequence {
  return recordSequence(
    "replay",
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
      {
        turnNumber: 2,
        stagedMoves: moves([
          [1, Direction.Down],
          [2, Direction.Up],
        ]),
      },
      { turnNumber: 3, stagedMoves: moves([[1, Direction.Right]]) },
    ],
    deriveTurnSeed,
  );
}

describe("runReplayCheck", () => {
  it("passes a faithfully recorded sequence (#pass, #reproducible-replay)", () => {
    const result = runReplayCheck(recordThreeTurns());
    expect(result).toEqual({ passed: true, turnsVerified: 3 });
    // Determinism: a second replay of the same document is identical.
    expect(runReplayCheck(recordThreeTurns())).toEqual(result);
  });

  it("halts at the first state divergence and evaluates no later turn (#halt-at-first-divergence)", () => {
    const seq = recordThreeTurns();
    // Tamper with turn 2's expected next state: snake 1's recorded health.
    const t2 = seq.turns[1];
    if (t2 === undefined) throw new Error("fixture must record three turns");
    const snake1 = t2.expected.nextState.snakes.find((s) => (s.snakeId as number) === 1);
    if (snake1 === undefined) throw new Error("snake 1 missing from fixture");
    const tampered: TestSequence = {
      ...seq,
      turns: seq.turns.map((t, i) =>
        i === 1
          ? {
              ...t,
              expected: {
                ...t.expected,
                nextState: {
                  ...t.expected.nextState,
                  snakes: t.expected.nextState.snakes.map((s) =>
                    s === snake1 ? { ...s, health: s.health + 13 } : s,
                  ),
                },
              },
            }
          : t,
      ),
    };
    const result = runReplayCheck(tampered);
    expect(result.passed).toBe(false);
    if (result.passed) throw new Error("unreachable");
    expect(result.divergentTurnNumber).toBe(2);
    expect(result.turnsVerified).toBe(1); // turn 3 was never evaluated
    const diff = result.differences.find((d) => /nextState\.snakes\[\d+\]\.health/.test(d.path));
    if (diff === undefined) throw new Error("expected a health difference");
    expect(diff.expected).toBe(snake1.health + 13);
    expect(diff.computed).toBe(snake1.health);
  });

  it("halts on event-only divergence when the state matches (#event-only-divergence)", () => {
    const seq = recordThreeTurns();
    // Tamper with turn 1's recorded events only: drop the last event.
    const tampered: TestSequence = {
      ...seq,
      turns: seq.turns.map((t, i) =>
        i === 0 ? { ...t, expected: { ...t.expected, events: t.expected.events.slice(0, -1) } } : t,
      ),
    };
    const result = runReplayCheck(tampered);
    expect(result.passed).toBe(false);
    if (result.passed) throw new Error("unreachable");
    expect(result.divergentTurnNumber).toBe(1);
    expect(result.turnsVerified).toBe(0);
    expect(result.differences.length).toBeGreaterThan(0);
    expect(result.differences.every((d) => d.path.startsWith("events"))).toBe(true);
    // The dropped event is absent on the expected side.
    const missing = result.differences.find((d) => d.expected === undefined);
    expect(missing).toBeDefined();
  });

  it("reports outcome divergence under the outcome section", () => {
    const seq = recordThreeTurns();
    const tampered: TestSequence = {
      ...seq,
      turns: seq.turns.map((t, i) =>
        i === 2
          ? { ...t, expected: { ...t.expected, outcome: { kind: "error", reason: "tampered" } } }
          : t,
      ),
    };
    const result = runReplayCheck(tampered);
    expect(result.passed).toBe(false);
    if (result.passed) throw new Error("unreachable");
    expect(result.divergentTurnNumber).toBe(3);
    expect(result.differences.some((d) => d.path.startsWith("outcome"))).toBe(true);
  });
});
