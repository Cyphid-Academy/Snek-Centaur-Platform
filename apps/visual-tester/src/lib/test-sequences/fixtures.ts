// Test fixtures for the Test Sequence contract modules: a small hand-built
// game state and a recorder that produces a genuine sequence by running the
// real engine, so replay tests exercise byte-real resolver output.
// Test-only helper (imported from *.test.ts); not part of the contract API.

import {
  type Agent,
  CellType,
  type CentaurTeamId,
  DEFAULT_GAME_CONFIG,
  Direction,
  type GameConfig,
  type GameState,
  type Item,
  type SnakeId,
  type SnakeState,
  type StagedMove,
  type TurnNumber,
  type UserId,
  itemsByCell,
  resolveTurn,
} from "@cyphid/snek-engine";
import type { TestSequence, TurnRecord } from "./codec.js";

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
  return {
    board,
    items: itemsByCell(board, items),
    snakes: [
      snake(1, TEAM_RED, "A", { x: 2, y: 2 }, Direction.Right),
      snake(2, TEAM_BLUE, "A", { x: 6, y: 6 }, Direction.Left),
    ],
    clocks: [
      { centaurTeamId: TEAM_RED, budgetMs: 60000, perTurnMs: 10000, declaredTurnOver: false },
      { centaurTeamId: TEAM_BLUE, budgetMs: 60000, perTurnMs: 10000, declaredTurnOver: false },
    ],
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
    const resolution = resolveTurn(
      state,
      input.stagedMoves,
      input.turnNumber as TurnNumber,
      deriveTurnSeed(seed, input.turnNumber),
      config.runtime,
    );
    turns.push({
      turnNumber: input.turnNumber as TurnNumber,
      stagedMoves: input.stagedMoves,
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
    orchestration: { ...DEFAULT_GAME_CONFIG.orchestration, boardSize: 9, snakesPerTeam: 1 },
  };
}
