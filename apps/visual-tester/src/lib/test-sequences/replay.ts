// Replay-check: compare recorded expectations against freshly computed
// resolver output.
//
// spec: test-sequences/replay-check — turns resolve in recorded order, each
// from its recorded pre-state; the run halts at the first turn with any
// difference and reports (path, expected, computed) over state + events +
// outcome under the canonical encoding.
// design: add-visual-tester (D5) — halt-at-first-divergence is spec-level
// behaviour: one run surfaces one actionable divergence with zero noise.

import { type GameState, type TurnNumber, resolveTurn } from "@cyphid/snek-engine";
import { type TestSequence, type TurnOutputJson, encodeTurnOutput } from "./codec.js";
import { deriveTurnSeed } from "./seed.js";

export interface Difference {
  readonly path: string; // e.g. "nextState.snakes[1].health"
  readonly expected: unknown; // undefined = absent on the expected side
  readonly computed: unknown; // undefined = absent on the computed side
}

export type ReplayResult =
  | { readonly passed: true; readonly turnsVerified: number }
  | {
      readonly passed: false;
      readonly divergentTurnNumber: number;
      readonly turnsVerified: number; // turns that matched before the halt
      readonly differences: ReadonlyArray<Difference>;
      // Full canonical outputs of the divergent turn, so a consumer can
      // resolve any difference path against either side (e.g. to map a
      // difference back onto a board cell) without re-resolving the turn.
      readonly expected: TurnOutputJson;
      readonly computed: TurnOutputJson;
    };

// ---------------------------------------------------------------------------
// Canonical-JSON diff
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// spec: test-sequences/canonical-encoding#equal-values-equal-json — value
// comparison is performed on the canonical JSON encoding alone, so a plain
// structural walk is a complete equality/difference procedure.
function collectDifferences(
  path: string,
  expected: unknown,
  computed: unknown,
  out: Difference[],
): void {
  if (Object.is(expected, computed)) return;

  if (Array.isArray(expected) && Array.isArray(computed)) {
    const len = Math.max(expected.length, computed.length);
    for (let i = 0; i < len; i++) {
      collectDifferences(
        `${path}[${i}]`,
        i < expected.length ? expected[i] : undefined,
        i < computed.length ? computed[i] : undefined,
        out,
      );
    }
    return;
  }

  if (isPlainObject(expected) && isPlainObject(computed)) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(computed)])].sort();
    for (const key of keys) {
      collectDifferences(
        path === "" ? key : `${path}.${key}`,
        key in expected ? expected[key] : undefined,
        key in computed ? computed[key] : undefined,
        out,
      );
    }
    return;
  }

  out.push({ path, expected, computed });
}

export function diffTurnOutputs(expected: TurnOutputJson, computed: TurnOutputJson): Difference[] {
  const out: Difference[] = [];
  collectDifferences("nextState", expected.nextState, computed.nextState, out);
  collectDifferences("events", expected.events, computed.events, out);
  collectDifferences("outcome", expected.outcome, computed.outcome, out);
  return out;
}

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

export function runReplayCheck(seq: TestSequence): ReplayResult {
  // Recorded pre-state of turn k: initialState for the first turn, the
  // previous turn's recorded (expected) nextState afterwards. Because the
  // run halts at the first divergence, every evaluated turn started from a
  // state the resolver just reproduced (design D5).
  let preState: GameState = seq.initialState;

  for (const [i, turn] of seq.turns.entries()) {
    const turnSeed = deriveTurnSeed(seq.gameSeed, turn.turnNumber);
    const resolution = resolveTurn(
      preState,
      turn.stagedMoves,
      turn.turnNumber as TurnNumber,
      turnSeed,
      seq.config.runtime,
    );

    const expected = encodeTurnOutput(turn.expected);
    const computed = encodeTurnOutput(resolution);
    const differences = diffTurnOutputs(expected, computed);
    if (differences.length > 0) {
      // spec: test-sequences/replay-check#halt-at-first-divergence — no turn
      // after this one is evaluated.
      return {
        passed: false,
        divergentTurnNumber: turn.turnNumber,
        turnsVerified: i,
        differences,
        expected,
        computed,
      };
    }

    preState = turn.expected.nextState;
  }

  return { passed: true, turnsVerified: seq.turns.length };
}
