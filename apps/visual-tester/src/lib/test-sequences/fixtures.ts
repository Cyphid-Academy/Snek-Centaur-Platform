// Test fixtures for the Test Sequence contract modules: a small hand-built
// game state and a recorder that produces a genuine sequence by running the
// real engine, so replay tests exercise byte-real resolver output.
// Test-only helper (imported from *.test.ts); not part of the contract API.

import {
  type Agent,
  CellType,
  type CentaurTeamId,
  Direction,
  type GameState,
  type Item,
  type SnakeId,
  type SnakeState,
  type StagedMove,
  type TurnNumber,
  type TurnTimings,
  type UserId,
  advanceTurn,
  asGameState,
  itemsByCell,
} from "@cyphid/snek-engine";
import { DEFAULT_GAME_CONFIG, type GameConfig } from "@cyphid/snek-game-configuration";
import type { TestSequence, TurnRecord } from "./codec.js";
import { deriveTurnSeed } from "./seed.js";

export const TEAM_RED = "team-red" as CentaurTeamId;
export const TEAM_BLUE = "team-blue" as CentaurTeamId;

export function operator(id: string): Agent {
  return { kind: "operator", operatorUserId: id as UserId };
}

export function gameSeed(fill = 7): Uint8Array {
  return new Uint8Array(32).fill(fill);
}

function snake(
  id: number,
  team: CentaurTeamId,
  letter: string,
  head: { x: number; y: number },
  lastDirection: Direction,
): SnakeState {
  return {
    snakeId: id as SnakeId,
    letter,
    centaurTeamId: team,
    body: [head, head, head], // fully stacked start body
    health: 100,
    activeEffects: [],
    lastDirection,
    alive: true,
    turn: 0 as TurnNumber,
  };
}

// A 9x9 board: walls on the border, Normal inside; two teams with one snake
// each, far apart; one pre-placed food item.
export function buildInitialState(): GameState {
  const size = 9;
  const cells: CellType[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const border = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      cells.push(border ? CellType.Wall : CellType.Normal);
    }
  }
  const board = { boardSize: size, cells };
  const items: Item[] = [
    { itemType: 0, spawnTurn: 0 as TurnNumber, spawnIndex: 0, cell: { x: 4, y: 4 } },
  ];
  return asGameState({
    board,
    items: itemsByCell(board, items),
    projections: [],
    rewind: null,
    snakes: [
      snake(1, TEAM_RED, "A", { x: 2, y: 2 }, Direction.Right),
      snake(2, TEAM_BLUE, "A", { x: 6, y: 6 }, Direction.Left),
    ],
    clocks: [
      { centaurTeamId: TEAM_RED, budgetMs: 60000, perTurnMs: 10000, declaredTurnOver: false },
      { centaurTeamId: TEAM_BLUE, budgetMs: 60000, perTurnMs: 10000, declaredTurnOver: false },
    ],
    consumedDurationMs: 0,
  });
}

/** Every team present burns the same amount — the tester's own default shape. */
export function fixtureTimings(state: GameState, durationMs = 500): TurnTimings {
  return {
    durationMs,
    burnMs: new Map(state.clocks.map((c) => [c.centaurTeamId, durationMs])),
  };
}

export function moves(entries: Array<[number, Direction]>): ReadonlyMap<SnakeId, StagedMove> {
  return new Map(
    entries.map(([id, direction]) => [
      id as SnakeId,
      { direction, stagedBy: operator(`op-${id}`) },
    ]),
  );
}

// Record a sequence by actually resolving turns with the real engine, so
// expected outputs are genuine resolver outputs.
export function recordSequence(
  name: string,
  seed: Uint8Array,
  config: GameConfig,
  initialState: GameState,
  turnInputs: ReadonlyArray<{
    turnNumber: number;
    stagedMoves: ReadonlyMap<SnakeId, StagedMove>;
  }>,
  deriveTurnSeed: (gameSeed: Uint8Array, turnNumber: number) => Uint8Array,
): TestSequence {
  const turns: TurnRecord[] = [];
  let state = initialState;
  for (const input of turnInputs) {
    const timings = fixtureTimings(state);
    const resolution = advanceTurn(
      state,
      input.stagedMoves,
      deriveTurnSeed(seed, input.turnNumber),
      timings,
      config.runtime,
    );
    turns.push({
      turnNumber: input.turnNumber as TurnNumber,
      stagedMoves: input.stagedMoves,
      timings,
      expected: {
        nextState: resolution.nextState,
        events: resolution.events,
        outcome: resolution.outcome,
      },
    });
    state = resolution.nextState;
  }
  return { name, gameSeed: seed, config, initialState, turns };
}

export function defaultConfig(): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 9, snakesPerTeam: 1 },
  };
}

// ---------------------------------------------------------------------------
// Documents this build cannot read
// ---------------------------------------------------------------------------
//
// Every other helper here builds its input with the CURRENT codec, so the whole
// suite only ever sees documents this build produced. That is the blind spot
// that let a schema bump ship with an ingest path which crashed on an older
// document instead of rejecting it: no test in the repo could produce one.
//
// This is the counterexample, and it belongs beside the recorder rather than in
// any one test, because there is more than one ingest path and each of them
// owes the same answer — a readable rejection naming the version, never a
// throw. spec: test-sequences/schema-version#unknown-version-rejected

/** A recorded document, minimal but real: one turn, actually resolved. */
export function recordedDoc(name: string): TestSequence {
  return recordSequence(
    name,
    gameSeed(),
    defaultConfig(),
    buildInitialState(),
    [{ turnNumber: 0, stagedMoves: moves([[1, Direction.Right]]) }],
    deriveTurnSeed,
  );
}

interface LooseState {
  snakes: Array<{ turn?: number }>;
  consumedDurationMs?: number;
}
interface LooseDoc {
  schemaVersion: number;
  config: { generation?: unknown; orchestration?: unknown };
  initialState: LooseState;
  turns: Array<{ timings?: unknown; expected: { nextState: LooseState } }>;
}

/**
 * `doc` as the PREVIOUS schema version wrote it: before a turn's timings were
 * recorded, before a snake carried the turn it had advanced to, and before the
 * configuration's generation half was named `generation`.
 *
 * Derived by downgrading a current document rather than pasted as a literal, so
 * it cannot rot into something the old version would never have produced.
 */
export function downgradeToPreviousVersion(doc: unknown): unknown {
  const out = JSON.parse(JSON.stringify(doc)) as LooseDoc;
  const downgrade = (state: LooseState): void => {
    Reflect.deleteProperty(state, "consumedDurationMs");
    for (const snake of state.snakes) Reflect.deleteProperty(snake, "turn");
  };
  out.schemaVersion = 1;
  downgrade(out.initialState);
  for (const turn of out.turns) {
    Reflect.deleteProperty(turn, "timings");
    downgrade(turn.expected.nextState);
  }
  out.config.orchestration = out.config.generation;
  Reflect.deleteProperty(out.config, "generation");
  return out;
}
