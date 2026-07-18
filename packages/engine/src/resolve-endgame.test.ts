import { describe, expect, it } from "vitest";
import { cellIndex } from "./board.js";
import {
  blueSnake,
  doResolve,
  emptyBoard,
  eventsOfKind,
  makeItem,
  makeSnake,
  stagedMoves as moves,
  redSnake,
  sid,
  makeState as state,
  tid,
} from "./testkit.js";
import { CellType, Direction, ItemType } from "./types.js";

describe("Item spawning (game-rules/item-spawning)", () => {
  it("spawns exactly floor(rate) items for an integer rate, on unoccupied inner cells", () => {
    const s = redSnake(0, 5);
    const existing = makeItem(5, ItemType.Food, { x: 8, y: 8 });
    const { nextState, events } = doResolve(
      state([s], { items: [existing] }),
      moves([[0, Direction.Up]]),
      { turnNumber: 1, config: { foodSpawnRate: 2 } },
    );
    const spawned = eventsOfKind(events, "food_spawned");
    expect(spawned).toHaveLength(2);
    const bodyCells = new Set(
      nextState.snakes.flatMap((sn) => sn.body.map((c) => `${c.x},${c.y}`)),
    );
    const cellsSeen = new Set<string>(["8,8"]);
    for (const e of spawned) {
      expect(e.spawnTurn).toBe(2); // spawned by turn 1's resolution (game-rules/item-identity)
      expect(e.spawnIndex).toBeGreaterThanOrEqual(0);
      expect(bodyCells.has(`${e.cell.x},${e.cell.y}`)).toBe(false);
      expect(cellsSeen.has(`${e.cell.x},${e.cell.y}`)).toBe(false); // distinct
      cellsSeen.add(`${e.cell.x},${e.cell.y}`);
      expect(e.cell.x).toBeGreaterThan(0);
      expect(e.cell.x).toBeLessThan(10);
      expect(e.cell.y).toBeGreaterThan(0);
      expect(e.cell.y).toBeLessThan(10);
    }
    expect(nextState.items).toHaveLength(3);
  });

  it("spawns nothing at rate 0 and is deterministic for fractional rates", () => {
    const mk = () => state([redSnake(0, 5)]);
    const zero = doResolve(mk(), moves([[0, Direction.Up]]), {
      turnNumber: 1,
      config: { foodSpawnRate: 0 },
    });
    expect(eventsOfKind(zero.events, "food_spawned")).toHaveLength(0);
    const a = doResolve(mk(), moves([[0, Direction.Up]]), {
      turnNumber: 1,
      config: { foodSpawnRate: 0.5 },
      seedN: 7,
    });
    const b = doResolve(mk(), moves([[0, Direction.Up]]), {
      turnNumber: 1,
      config: { foodSpawnRate: 0.5 },
      seedN: 7,
    });
    expect(a.events).toEqual(b.events);
    const count = eventsOfKind(a.events, "food_spawned").length;
    expect(count === 0 || count === 1).toBe(true);
  });

  it("restricts food to fertile cells but lets potions spawn anywhere eligible", () => {
    // Exactly one fertile cell, pre-occupied by an item: food has no eligible
    // cell and cannot spawn; potions ignore the fertile restriction and can.
    const board = emptyBoard(11);
    const cells = [...board.cells];
    const fertileCell = { x: 8, y: 8 };
    cells[cellIndex(board, fertileCell)] = CellType.Fertile;
    const blocker = makeItem(0, ItemType.Food, fertileCell);
    const { events } = doResolve(
      state([redSnake(0, 5)], { board: { boardSize: 11, cells }, items: [blocker] }),
      moves([[0, Direction.Up]]),
      {
        turnNumber: 1,
        config: { foodSpawnRate: 1, invulnPotionSpawnRate: 1, invisPotionSpawnRate: 1 },
      },
    );
    expect(eventsOfKind(events, "food_spawned")).toHaveLength(0);
    const potions = eventsOfKind(events, "potion_spawned");
    expect(potions).toHaveLength(2);
    for (const p of potions) {
      expect(`${p.cell.x},${p.cell.y}`).not.toBe("8,8"); // occupied
    }
    expect(new Set(potions.map((p) => p.potionType))).toEqual(
      new Set([ItemType.InvulnPotion, ItemType.InvisPotion]),
    );
  });

  it("spawns food only on fertile cells when fertile ground is enabled", () => {
    const board = emptyBoard(11);
    const cells = [...board.cells];
    const fertile = [
      { x: 8, y: 8 },
      { x: 8, y: 9 },
      { x: 9, y: 8 },
    ];
    for (const c of fertile) cells[cellIndex(board, c)] = CellType.Fertile;
    const { events } = doResolve(
      state([redSnake(0, 5)], { board: { boardSize: 11, cells } }),
      moves([[0, Direction.Up]]),
      { turnNumber: 1, config: { foodSpawnRate: 2 } },
    );
    const spawned = eventsOfKind(events, "food_spawned");
    expect(spawned).toHaveLength(2);
    for (const e of spawned) {
      expect(fertile).toContainEqual(e.cell);
    }
  });
});

describe("Win conditions (game-rules/scoring..058)", () => {
  it("declares last-team-standing victory with score 1.0 x N (game-rules/game-end-conditions)", () => {
    const red = redSnake(0, 5);
    const blueDoomed = {
      ...blueSnake(1, 1),
      lastDirection: Direction.Left,
    };
    const { outcome } = doResolve(
      state([red, blueDoomed]),
      moves([[0, Direction.Up]]), // blue falls back to Left → wall
    );
    if (outcome.kind !== "victory") throw new Error(`expected victory, got ${outcome.kind}`);
    expect(outcome.winnerCentaurTeamId).toBe(tid("red"));
    expect(outcome.scores.get(tid("red"))).toBe(2);
    expect(outcome.scores.get(tid("blue"))).toBe(0);
  });

  it("stays in progress while multiple teams live and no turn limit applies", () => {
    const { outcome } = doResolve(
      state([redSnake(0, 3), blueSnake(1, 7)]),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
      { turnNumber: 500 },
    );
    expect(outcome.kind).toBe("in_progress");
  });

  it("scores par 1.0 for all teams alive at the start of a simultaneous elimination (game-rules/game-end-conditions)", () => {
    const red = { ...redSnake(0, 1), lastDirection: Direction.Left };
    const blue = { ...blueSnake(1, 9), lastDirection: Direction.Right };
    const { outcome } = doResolve(state([red, blue]), new Map());
    if (outcome.kind !== "draw") throw new Error(`expected draw, got ${outcome.kind}`);
    expect(new Set(outcome.tiedCentaurTeamIds)).toEqual(new Set([tid("red"), tid("blue")]));
    expect(outcome.scores.get(tid("red"))).toBe(1);
    expect(outcome.scores.get(tid("blue"))).toBe(1);
  });

  it("scores 0 for teams eliminated on an earlier turn (game-rules/game-end-conditions)", () => {
    const deadGreen = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("green"),
      alive: false,
    });
    const red = { ...redSnake(0, 1), lastDirection: Direction.Left };
    const blue = { ...blueSnake(1, 9), lastDirection: Direction.Right };
    const { outcome } = doResolve(state([red, blue, deadGreen]), new Map());
    if (outcome.kind !== "draw") throw new Error(`expected draw, got ${outcome.kind}`);
    expect(new Set(outcome.tiedCentaurTeamIds)).toEqual(new Set([tid("red"), tid("blue")]));
    expect(outcome.scores.get(tid("green"))).toBe(0);
  });

  it("handles simultaneous elimination on turn 0 with par for everyone (game-rules/game-end-conditions)", () => {
    const red = { ...redSnake(0, 1), lastDirection: Direction.Left };
    const blue = { ...blueSnake(1, 9), lastDirection: Direction.Right };
    const { outcome } = doResolve(state([red, blue]), new Map(), { turnNumber: 0 });
    if (outcome.kind !== "draw") throw new Error(`expected draw, got ${outcome.kind}`);
    expect(outcome.scores.get(tid("red"))).toBe(1);
    expect(outcome.scores.get(tid("blue"))).toBe(1);
  });

  it("ends at the turn limit with normalised body-share scores (game-rules/game-end-conditions, game-rules/scoring)", () => {
    // Red 4 segments, blue 3: total 7. Red = 4/7*2, blue = 3/7*2.
    const base = redSnake(0, 3);
    const red = { ...base, body: [...base.body, base.body[2] as { x: number; y: number }] };
    const blue = blueSnake(1, 7);
    const { outcome } = doResolve(
      state([red, blue]),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
      { turnNumber: 9, config: { maxTurns: 10 } },
    );
    if (outcome.kind !== "victory") throw new Error(`expected victory, got ${outcome.kind}`);
    expect(outcome.winnerCentaurTeamId).toBe(tid("red"));
    expect(outcome.scores.get(tid("red"))).toBeCloseTo((4 / 7) * 2, 10);
    expect(outcome.scores.get(tid("blue"))).toBeCloseTo((3 / 7) * 2, 10);
  });

  it("does not end before the turn limit (game-rules/game-end-conditions) and never with maxTurns 0 (game-rules/game-end-conditions)", () => {
    const mk = () => state([redSnake(0, 3), blueSnake(1, 7)]);
    const m = () =>
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]);
    expect(doResolve(mk(), m(), { turnNumber: 8, config: { maxTurns: 10 } }).outcome.kind).toBe(
      "in_progress",
    );
    expect(doResolve(mk(), m(), { turnNumber: 9999, config: { maxTurns: 0 } }).outcome.kind).toBe(
      "in_progress",
    );
  });

  it("draws on equal scores at the turn limit", () => {
    const { outcome } = doResolve(
      state([redSnake(0, 3), blueSnake(1, 7)]),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
      { turnNumber: 9, config: { maxTurns: 10 } },
    );
    if (outcome.kind !== "draw") throw new Error(`expected draw, got ${outcome.kind}`);
    expect(outcome.scores.get(tid("red"))).toBeCloseTo(1, 10);
    expect(outcome.scores.get(tid("blue"))).toBeCloseTo(1, 10);
  });
});

describe("Event ordering (game-rules/turn-events)", () => {
  it("orders events by phase, then ascending snakeId within a phase", () => {
    // Snake 1 (lower x) and snake 0 both move; snake 0 dies on a wall; food
    // spawning follows. Kind order must follow phase order regardless of
    // internal processing order.
    const a = makeSnake({
      snakeId: sid(1),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
    });
    const b = makeSnake({
      snakeId: sid(0),
      centaurTeamId: tid("blue"),
      body: [
        { x: 1, y: 3 },
        { x: 1, y: 4 },
        { x: 1, y: 5 },
      ],
    });
    const { events } = doResolve(
      state([a, b]),
      moves([
        [1, Direction.Up],
        [0, Direction.Left],
      ]),
      { turnNumber: 1, config: { foodSpawnRate: 1 } },
    );
    const kinds = events.map((e) => e.kind);
    expect(kinds).toEqual(["snake_moved", "snake_moved", "snake_died", "food_spawned"]);
    const moved = eventsOfKind(events, "snake_moved");
    expect(moved[0]?.snakeId).toBe(sid(0)); // ascending within the phase
    expect(moved[1]?.snakeId).toBe(sid(1));
  });
});

describe("purity", () => {
  it("does not mutate the input state", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 5 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
      ],
    });
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 3, y: 4 });
    const input = state([s], { items: [potion] });
    const snapshot = JSON.parse(JSON.stringify(input));
    doResolve(input, moves([[0, Direction.Up]]), { turnNumber: 1, config: { foodSpawnRate: 1 } });
    expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot);
  });
});
