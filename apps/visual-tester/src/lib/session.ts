// In-memory session model: initial state plus every simulated turn, with
// immutable per-turn snapshots and history-rewrite truncation semantics.
//
// The session is a pure value; every operation returns a new Session and
// deep-copies inbound/outbound state so no caller can mutate a recorded
// snapshot through a retained reference.
import { resolveTurn } from "@cyphid/snek-engine";
import type {
  GameOutcome,
  GameRuntimeConfig,
  GameState,
  SnakeId,
  StagedMove,
  TurnEvent,
  TurnNumber,
} from "@cyphid/snek-engine";
import { turnSeedFor } from "./seed.js";

export interface TurnRecord {
  /** The turn number this record was resolved as (first simulated turn is 0). */
  readonly turnNumber: TurnNumber;
  /** Exactly the staged moves submitted to the resolver (unstaged = absent). */
  readonly stagedMoves: ReadonlyMap<SnakeId, StagedMove>;
  // spec: visual-tester/turn-simulation#full-output-recorded — the resolver's
  // complete output is recorded per turn.
  readonly nextState: GameState;
  readonly events: ReadonlyArray<TurnEvent>;
  readonly outcome: GameOutcome;
}

export interface Session {
  readonly gameSeed: Uint8Array;
  readonly config: GameRuntimeConfig;
  readonly initialState: GameState;
  readonly turns: ReadonlyArray<TurnRecord>;
}

/** Deep copy of a GameState (handles the ReadonlyMap items component). */
export function cloneState(state: GameState): GameState {
  return structuredClone(state) as GameState;
}

export function createSession(
  initialState: GameState,
  config: GameRuntimeConfig,
  gameSeed: Uint8Array,
): Session {
  return {
    gameSeed: gameSeed.slice(),
    config: structuredClone(config),
    initialState: cloneState(initialState),
    turns: [],
  };
}

/** Number of navigable positions: 0 (initial state) .. turns.length. */
export function turnCount(session: Session): number {
  return session.turns.length;
}

/** The board state displayed at history position k (0 = initial state). */
export function stateAt(session: Session, k: number): GameState {
  if (k < 0 || k > session.turns.length) {
    throw new Error(`history position ${k} out of range 0..${session.turns.length}`);
  }
  if (k === 0) return session.initialState;
  const record = session.turns[k - 1];
  if (record === undefined) throw new Error(`missing turn record at ${k - 1}`);
  return record.nextState;
}

/**
 * Simulate the next turn from the end of history with the given staged
 * moves, appending the resolver's full output as a new turn.
 */
// spec: visual-tester/turn-simulation — resolves current state with staged
// moves and the production-derived turn seed; repeatable without limit.
// spec: visual-tester/dedicated-app#engine-is-authoritative — the shared
// engine's resolveTurn is the only way a turn advances.
export function simulateNext(
  session: Session,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
): Session {
  const turnNumber = session.turns.length as TurnNumber;
  const base = stateAt(session, session.turns.length);
  // spec: visual-tester/move-staging — staged moves pass through unchanged;
  // unstaged snakes are simply absent from the map.
  const moves = new Map(structuredClone(new Map(stagedMoves)));
  const resolution = resolveTurn(
    base,
    moves,
    turnNumber,
    turnSeedFor(session.gameSeed, turnNumber),
    session.config,
  );
  const record: TurnRecord = {
    turnNumber,
    stagedMoves: moves,
    // Deep-copied so no later edit of a live reference can reach into the
    // recorded snapshot (immutable per-turn snapshots).
    nextState: cloneState(resolution.nextState),
    events: structuredClone(resolution.events) as TurnEvent[],
    outcome: structuredClone(resolution.outcome) as GameOutcome,
  };
  return { ...session, turns: [...session.turns, record] };
}

/**
 * Discard all turns after history position k, making k the end of history.
 */
// spec: visual-tester/history-rewrite#future-turns-discarded
export function truncateAfter(session: Session, k: number): Session {
  if (k < 0 || k > session.turns.length) {
    throw new Error(`history position ${k} out of range 0..${session.turns.length}`);
  }
  if (k === session.turns.length) return session;
  return { ...session, turns: session.turns.slice(0, k) };
}

/**
 * Replace the state displayed at history position k with an edited state,
 * discarding every later turn. Position 0 edits the initial state; position
 * k > 0 replaces turn k's recorded next-state (that turn's staged moves,
 * events, and outcome remain as recorded — the tester deliberately diverged
 * from the resolver's output).
 */
// spec: visual-tester/history-rewrite — editing turn k truncates k+1..n and
// simulation continues from the edited turn.
export function editStateAt(session: Session, k: number, newState: GameState): Session {
  const truncated = truncateAfter(session, k);
  const copy = cloneState(newState);
  if (k === 0) {
    return { ...truncated, initialState: copy };
  }
  const turns = truncated.turns.slice();
  const record = turns[k - 1];
  if (record === undefined) throw new Error(`missing turn record at ${k - 1}`);
  turns[k - 1] = { ...record, nextState: copy };
  return { ...truncated, turns };
}

/** Replace the session's runtime config, truncating turns after position k. */
export function editConfigAt(session: Session, k: number, config: GameRuntimeConfig): Session {
  return { ...truncateAfter(session, k), config: structuredClone(config) };
}

/** Replace the game seed, truncating turns after position k. */
export function editSeedAt(session: Session, k: number, gameSeed: Uint8Array): Session {
  return { ...truncateAfter(session, k), gameSeed: gameSeed.slice() };
}
