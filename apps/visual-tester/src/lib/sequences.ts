// Bridge between the in-memory Session and the Test Sequence contract.
//
// spec: visual-tester/sequence-management#save-from-session — the stored
// document records the session's initial state, per-turn staged moves, and
// per-turn resolver outputs as the sequence's expectations.
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-engine";
import type { GameConfig } from "@cyphid/snek-engine";
import type { Session } from "./session.js";
import type { TestSequence } from "./test-sequences/codec.js";

/**
 * Snapshot the session as a Test Sequence. The session only carries the
 * runtime config (orchestration parameters play no part in turn resolution),
 * so the document's orchestration section is the platform default with the
 * board size taken from the authored state — enough to keep the document
 * self-contained per test-sequences/sequence-format#self-contained.
 */
export function sessionToSequence(session: Session, name: string): TestSequence {
  const config: GameConfig = {
    orchestration: {
      ...DEFAULT_GAME_CONFIG.orchestration,
      boardSize: session.initialState.board.boardSize,
    },
    runtime: session.config,
  };
  return {
    name,
    gameSeed: session.gameSeed,
    config,
    initialState: session.initialState,
    turns: session.turns.map((t) => ({
      turnNumber: t.turnNumber,
      stagedMoves: t.stagedMoves,
      // spec: visual-tester/turn-simulation#full-output-recorded — saving
      // yields expectations without re-resolving.
      expected: { nextState: t.nextState, events: t.events, outcome: t.outcome },
    })),
  };
}

/**
 * Rebuild a Session from a loaded Test Sequence so its history is navigable
 * and editable exactly as if it had just been simulated.
 */
// spec: visual-tester/sequence-management — loading replaces the session.
export function sequenceToSession(seq: TestSequence): Session {
  return {
    gameSeed: seq.gameSeed.slice(),
    config: structuredClone(seq.config.runtime),
    initialState: structuredClone(seq.initialState),
    turns: seq.turns.map((t) => ({
      turnNumber: t.turnNumber,
      stagedMoves: new Map(t.stagedMoves),
      nextState: structuredClone(t.expected.nextState),
      events: structuredClone(t.expected.events) as typeof t.expected.events,
      outcome: structuredClone(t.expected.outcome) as typeof t.expected.outcome,
    })),
  };
}
