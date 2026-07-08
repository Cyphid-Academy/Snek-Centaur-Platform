import {
  CellType,
  DEFAULT_GAME_CONFIG,
  Direction,
  ItemType,
  createLocalGame,
  seedFromText,
} from "@cyphid/snek-centaur-server-lib";
import type {
  Board,
  Cell,
  CentaurTeamId,
  GameConfig,
  GameRuntimeConfig,
  GameState,
  ItemId,
  ItemState,
  SnakeId,
  SnakeState,
  TurnEvent,
  TurnNumber,
} from "@cyphid/snek-centaur-server-lib";
import { describe, expect, it } from "vitest";
import { computeBotMoves } from "./bot";

// --- state builders -------------------------------------------------------

const sid = (n: number): SnakeId => n as SnakeId;
const tid = (s: string): CentaurTeamId => s as CentaurTeamId;

function makeBoard(size: number, hazards: ReadonlyArray<Cell> = []): Board {
  const cells: CellType[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wall = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      cells.push(wall ? CellType.Wall : CellType.Normal);
    }
  }
  for (const h of hazards) cells[h.y * size + h.x] = CellType.Hazard;
  return { boardSize: size, cells };
}

interface SnakeOpts {
  readonly id: number;
  readonly team?: string;
  readonly body: ReadonlyArray<Cell>;
  readonly health?: number;
  readonly effects?: SnakeState["activeEffects"];
}

function makeSnake(opts: SnakeOpts): SnakeState {
  return {
    snakeId: sid(opts.id),
    letter: "A",
    centaurTeamId: tid(opts.team ?? "red"),
    body: opts.body,
    health: opts.health ?? 100,
    activeEffects: opts.effects ?? [],
    lastDirection: null,
    alive: true,
  };
}

function food(id: number, cell: Cell): ItemState {
  return { itemId: id as ItemId, itemType: ItemType.Food, cell, consumed: false };
}

function makeState(snakes: SnakeState[], items: ItemState[] = [], board?: Board): GameState {
  return { board: board ?? makeBoard(11), snakes, items, clocks: [] };
}

const RUNTIME: GameRuntimeConfig = DEFAULT_GAME_CONFIG.runtime; // hazardDamage 15

function moveOf(state: GameState, id: number): Direction {
  const move = computeBotMoves(state, RUNTIME).get(sid(id));
  if (move === undefined) throw new Error(`no move staged for snake ${id}`);
  return move.direction;
}

// --- unit scenarios -------------------------------------------------------

describe("computeBotMoves basics", () => {
  it("stages one move per alive snake, by its team's Centaur; none for the dead", () => {
    const state = makeState([
      makeSnake({ id: 0, team: "red", body: [c(3, 3), c(3, 4), c(3, 5)] }),
      { ...makeSnake({ id: 1, team: "blue", body: [c(7, 7), c(7, 8), c(7, 9)] }), alive: false },
    ]);
    const moves = computeBotMoves(state, RUNTIME);
    expect([...moves.keys()]).toEqual([sid(0)]);
    expect(moves.get(sid(0))?.stagedBy).toEqual({
      kind: "centaur_team",
      centaurTeamId: tid("red"),
    });
  });

  it("chases the nearest food", () => {
    const state = makeState(
      [makeSnake({ id: 0, body: [c(5, 5), c(5, 6), c(5, 7)] })],
      [food(0, c(8, 5)), food(1, c(5, 1))],
    );
    expect(moveOf(state, 0)).toBe(Direction.Right);
  });
});

describe("certain-death avoidance", () => {
  it("takes the only exit from its own body pocket, away from food", () => {
    // Head at (5,5), own body blocking Up/Left/Down; tail at (6,6) vacates
    // but is not adjacent. Only Right is survivable; food tempts Left.
    const body = [c(5, 5), c(5, 4), c(4, 4), c(4, 5), c(4, 6), c(5, 6), c(6, 6)];
    const state = makeState([makeSnake({ id: 0, body })], [food(0, c(2, 5))]);
    expect(moveOf(state, 0)).toBe(Direction.Right);
  });

  it("detours around another snake's guaranteed post-move body", () => {
    const enemyWall = makeSnake({
      id: 1,
      team: "blue",
      body: [c(6, 3), c(6, 4), c(6, 5), c(6, 6), c(6, 7)],
    });
    const me = makeSnake({ id: 0, body: [c(5, 5), c(4, 5), c(3, 5)] });
    const state = makeState([me, enemyWall], [food(0, c(8, 5))]);
    const dir = moveOf(state, 0);
    expect(dir).not.toBe(Direction.Right); // (6,5) is a guaranteed enemy segment
    expect([Direction.Up, Direction.Down]).toContain(dir);
  });

  it("treats an enemy tail cell as safe when the tail will vacate", () => {
    const enemy = makeSnake({ id: 1, team: "blue", body: [c(5, 5), c(5, 4), c(5, 3)] });
    const me = makeSnake({ id: 0, body: [c(5, 2), c(4, 2), c(3, 2)] });
    const state = makeState([me, enemy], [food(0, c(5, 8))]);
    expect(moveOf(state, 0)).toBe(Direction.Down); // through the vacating tail at (5,3)
  });

  it("avoids an enemy tail cell when growth duplicated the tail (01-REQ-062)", () => {
    const enemy = makeSnake({
      id: 1,
      team: "blue",
      body: [c(5, 5), c(5, 4), c(5, 3), c(5, 3)], // duplicated tail: cell stays occupied
    });
    const me = makeSnake({ id: 0, body: [c(5, 2), c(4, 2), c(3, 2)] });
    const state = makeState([me, enemy], [food(0, c(5, 8))]);
    expect(moveOf(state, 0)).not.toBe(Direction.Down);
  });

  it("walks through a weaker snake's body when holding an invulnerability buff", () => {
    const enemyWall = makeSnake({
      id: 1,
      team: "blue",
      body: [c(6, 3), c(6, 4), c(6, 5), c(6, 6), c(6, 7)],
    });
    const me = makeSnake({
      id: 0,
      body: [c(5, 5), c(4, 5), c(3, 5)],
      effects: [{ family: "invulnerability", state: "buff", expiryTurn: 10 as TurnNumber }],
    });
    const state = makeState([me, enemyWall], [food(0, c(8, 5))]);
    expect(moveOf(state, 0)).toBe(Direction.Right); // sever, not death (01-REQ-044c)
  });

  it("refuses a hazard whose damage would be fatal, despite food beyond it", () => {
    const board = makeBoard(11, [c(6, 5)]);
    const me = makeSnake({ id: 0, body: [c(5, 5), c(4, 5), c(3, 5)], health: 10 });
    const state = makeState([me], [food(0, c(8, 5))], board);
    expect(moveOf(state, 0)).not.toBe(Direction.Right); // 1 + 15 damage ≥ 10 health
  });

  it("enters a survivable hazard when it is the only safe move", () => {
    const board = makeBoard(11, [c(6, 5)]);
    const body = [c(5, 5), c(5, 4), c(4, 4), c(4, 5), c(4, 6), c(5, 6), c(6, 6)];
    const state = makeState([makeSnake({ id: 0, body, health: 100 })], [], board);
    expect(moveOf(state, 0)).toBe(Direction.Right);
  });

  it("prefers contested food over certain starvation at 1 health", () => {
    // Every non-food move starves (tick kills at 1 health). The food cell is
    // reachable by an equal-length enemy head (head-to-head risk) — the bot
    // must still take it, since risk beats certainty.
    const enemy = makeSnake({ id: 1, team: "blue", body: [c(4, 4), c(3, 4), c(2, 4)] });
    const me = makeSnake({ id: 0, body: [c(5, 5), c(5, 6), c(5, 7)], health: 1 });
    const state = makeState([me, enemy], [food(0, c(4, 5))]);
    expect(moveOf(state, 0)).toBe(Direction.Left);
  });
});

describe("head-to-head risk", () => {
  it("declines adjacent food an equal-length enemy head can contest", () => {
    const me = makeSnake({ id: 0, body: [c(5, 5), c(4, 5), c(3, 5)] });
    const enemy = makeSnake({ id: 1, team: "blue", body: [c(7, 5), c(8, 5), c(9, 5)] });
    const state = makeState([me, enemy], [food(0, c(6, 5))]);
    expect(moveOf(state, 0)).not.toBe(Direction.Right); // tie is mutual death (01-REQ-044d)
  });

  it("takes the same food when it outlengths the rival", () => {
    const me = makeSnake({ id: 0, body: [c(5, 5), c(4, 5), c(3, 5), c(2, 5), c(2, 4)] });
    const enemy = makeSnake({ id: 1, team: "blue", body: [c(7, 5), c(8, 5), c(9, 5)] });
    const state = makeState([me, enemy], [food(0, c(6, 5))]);
    expect(moveOf(state, 0)).toBe(Direction.Right);
  });
});

// --- whole-game integration ------------------------------------------------

const FUZZ_CONFIG: GameConfig = {
  orchestration: {
    boardSize: 13,
    snakesPerTeam: 2,
    hazardPercentage: 8,
    fertileGround: { density: 30, clustering: 10 },
  },
  runtime: {
    ...DEFAULT_GAME_CONFIG.runtime,
    maxTurns: 150,
    foodSpawnRate: 0.6,
    invulnPotionSpawnRate: 0.1,
    invisPotionSpawnRate: 0.07,
  },
};

const TEAMS = [
  { centaurTeamId: tid("red"), name: "Red" },
  { centaurTeamId: tid("blue"), name: "Blue" },
];

function playBotGame(seedText: string): { events: TurnEvent[]; outcome: unknown; turns: number } {
  const game = createLocalGame(FUZZ_CONFIG, TEAMS, seedFromText(seedText));
  if ("code" in game) throw new Error(`board generation failed for ${seedText}: ${game.code}`);
  const events: TurnEvent[] = [];
  while (!game.finished) {
    const res = game.step(computeBotMoves(game.state, FUZZ_CONFIG.runtime));
    events.push(...res.events);
  }
  return { events, outcome: game.outcome, turns: game.turnNumber };
}

describe("full bot games", () => {
  it("terminate with no wall deaths across seeds", () => {
    for (let i = 0; i < 8; i++) {
      const { events, turns } = playBotGame(`bot-fuzz-${i}`);
      expect(turns).toBeLessThanOrEqual(FUZZ_CONFIG.runtime.maxTurns);
      const wallDeaths = events.filter((e) => e.kind === "snake_died" && e.cause === "wall");
      expect(wallDeaths).toEqual([]);
    }
  });

  it("replay deterministically from the same seed", () => {
    const a = playBotGame("bot-fuzz-0");
    const b = playBotGame("bot-fuzz-0");
    expect(a.turns).toBe(b.turns);
    expect(a.outcome).toEqual(b.outcome);
    expect(a.events).toEqual(b.events);
  });
});

function c(x: number, y: number): Cell {
  return { x, y };
}
