import { describe, expect, it } from "vitest";
import {
  TEST_OPERATOR,
  doResolve,
  effect,
  emptyBoard,
  eventsOfKind,
  itemList,
  makeItem,
  makeSnake,
  stagedMoves as moves,
  sid,
  snakeById,
  makeState as state,
  tid,
  turn,
} from "./testkit.js";
import type { SnakeState } from "./types.js";
import { Direction, ItemType } from "./types.js";

describe("Move projection — direction (game-rules/movement)", () => {
  it("uses the staged move and attributes it in the snake_moved event", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      lastDirection: Direction.Up,
    });
    const { nextState, events } = doResolve(state([s]), moves([[0, Direction.Right]]));
    expect(snakeById(nextState, 0).body[0]).toEqual({ x: 6, y: 5 });
    const moved = eventsOfKind(events, "snake_moved");
    expect(moved).toHaveLength(1);
    expect(moved[0]?.direction).toBe(Direction.Right);
    expect(moved[0]?.stagedBy).toEqual(TEST_OPERATOR);
  });

  it("falls back to lastDirection with stagedBy null when nothing is staged", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      lastDirection: Direction.Up,
    });
    const { nextState, events } = doResolve(state([s]), new Map());
    expect(snakeById(nextState, 0).body[0]).toEqual({ x: 5, y: 4 });
    expect(eventsOfKind(events, "snake_moved")[0]?.stagedBy).toBeNull();
  });

  it("falls back to lastDirection even when that move is lethal", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
      lastDirection: Direction.Left, // into the wall at x=0
    });
    const { nextState, events } = doResolve(state([s]), new Map());
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(eventsOfKind(events, "snake_died")[0]?.cause).toBe("wall");
  });

  it("on turn 0 with no history picks a deterministic seeded random direction", () => {
    const mk = () =>
      makeSnake({
        snakeId: sid(0),
        body: [
          { x: 5, y: 5 },
          { x: 5, y: 5 },
          { x: 5, y: 5 },
        ],
        lastDirection: null,
      });
    const a = doResolve(state([mk()]), new Map(), { turnNumber: 0, seedN: 9 });
    const b = doResolve(state([mk()]), new Map(), { turnNumber: 0, seedN: 9 });
    const dirA = eventsOfKind(a.events, "snake_moved")[0]?.direction;
    expect(dirA).toBeDefined();
    expect(eventsOfKind(b.events, "snake_moved")[0]?.direction).toBe(dirA);
  });
});

describe("Move projection — body advance and growth (game-rules/movement, game-rules/food-and-growth)", () => {
  it("advances the head and drops the tail, keeping length constant", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
    });
    const { nextState } = doResolve(state([s]), moves([[0, Direction.Up]]));
    expect(snakeById(nextState, 0).body).toEqual([
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
    ]);
    expect(snakeById(nextState, 0).lastDirection).toBe(Direction.Up);
  });

  it("advances a grown snake by dropping only one tail copy (game-rules/movement)", () => {
    // Doubled tail from an earlier meal: the cell stays occupied after a move.
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
        { x: 5, y: 7 },
      ],
    });
    const { nextState } = doResolve(state([s]), moves([[0, Direction.Up]]));
    expect(snakeById(nextState, 0).body).toEqual([
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 7 },
    ]);
  });

  it("grows exactly once, as a doubled tail at the eating turn's commit (game-rules/food-and-growth)", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      health: 50,
    });
    const withFood = state([s], { items: [makeItem(0, ItemType.Food, { x: 5, y: 4 })] });
    const turn1 = doResolve(withFood, moves([[0, Direction.Up]]));
    // Growth is committed on the eating turn as a duplicated tail segment...
    expect(snakeById(turn1.nextState, 0).body).toEqual([
      { x: 5, y: 4 },
      { x: 5, y: 5 },
      { x: 5, y: 6 },
      { x: 5, y: 6 },
    ]);
    // ...and the length is stable (+1 exactly) on subsequent turns.
    const turn2 = doResolve(turn1.nextState, moves([[0, Direction.Up]]), { turnNumber: 2 });
    expect(snakeById(turn2.nextState, 0).body).toHaveLength(4);
    const turn3 = doResolve(turn2.nextState, moves([[0, Direction.Up]]), { turnNumber: 3 });
    expect(snakeById(turn3.nextState, 0).body).toHaveLength(4);
  });

  it("does not move dead snakes", () => {
    const dead = makeSnake({ snakeId: sid(0), alive: false });
    const { nextState, events } = doResolve(state([dead]), new Map());
    expect(snakeById(nextState, 0).body).toEqual(dead.body);
    expect(events).toHaveLength(0);
  });
});

describe("Collision rules (game-rules/collisions-and-severing)", () => {
  it("kills a snake whose head enters a wall (044a)", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
    });
    const { nextState, events } = doResolve(state([s]), moves([[0, Direction.Left]]));
    expect(snakeById(nextState, 0).alive).toBe(false);
    const died = eventsOfKind(events, "snake_died");
    expect(died).toEqual([
      {
        kind: "snake_died",
        snakeId: sid(0),
        cause: "wall",
        killerSnakeId: null,
        location: { x: 0, y: 5 },
      },
    ]);
  });

  it("kills a snake that runs into its own body (044b)", () => {
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
      ],
    });
    const { nextState, events } = doResolve(state([s]), moves([[0, Direction.Right]]));
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(eventsOfKind(events, "snake_died")[0]?.cause).toBe("self_collision");
  });

  it("allows tail-chasing: moving into the just-vacated tail cell is safe (044b)", () => {
    // 2x2 loop: head chases its own tail around the block forever.
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 3 },
      ],
    });
    const { nextState } = doResolve(state([s]), moves([[0, Direction.Right]]));
    expect(snakeById(nextState, 0).alive).toBe(true);
    expect(snakeById(nextState, 0).body[0]).toEqual({ x: 4, y: 3 });
  });

  it("kills an equal-level attacker entering another snake's body (044c)", () => {
    const attacker = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });
    const victim = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      lastDirection: Direction.Up,
    });
    const { nextState, events } = doResolve(
      state([attacker, victim]),
      moves([
        [0, Direction.Right],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 1).alive).toBe(true);
    expect(snakeById(nextState, 1).body).toHaveLength(3);
    const died = eventsOfKind(events, "snake_died")[0];
    expect(died?.cause).toBe("body_collision");
    expect(died?.killerSnakeId).toBe(sid(1));
  });

  it("severs the victim when the attacker's start-of-turn level is higher (044c)", () => {
    const attacker = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "buff", 5)],
    });
    // Victim moving Up: post-move body spans (5,3)..(5,7); attacker hits (5,5).
    const victim = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
        { x: 5, y: 8 },
      ],
    });
    const { nextState, events } = doResolve(
      state([attacker, victim]),
      moves([
        [0, Direction.Right],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(true);
    expect(snakeById(nextState, 1).alive).toBe(true);
    // Post-move victim body: [(5,3),(5,4),(5,5),(5,6),(5,7)]; contact at index 2.
    expect(snakeById(nextState, 1).body).toEqual([
      { x: 5, y: 3 },
      { x: 5, y: 4 },
    ]);
    const severed = eventsOfKind(events, "snake_severed");
    expect(severed).toEqual([
      {
        kind: "snake_severed",
        attackerSnakeId: sid(0),
        victimSnakeId: sid(1),
        contactCell: { x: 5, y: 5 },
        segmentsLost: 3,
      },
    ]);
  });

  it("severs a debuffed victim even for a level-0 attacker (044c)", () => {
    const attacker = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });
    const victim = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "debuff", 5)],
    });
    const { nextState } = doResolve(
      state([attacker, victim]),
      moves([
        [0, Direction.Right],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(true);
    expect(snakeById(nextState, 1).body.length).toBeLessThan(4);
  });

  it("kills both in an equal-level, equal-length head-to-head (044d)", () => {
    const a = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
      ],
    });
    const b = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
      ],
    });
    const { nextState, events } = doResolve(
      state([a, b]),
      moves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 1).alive).toBe(false);
    const died = eventsOfKind(events, "snake_died");
    expect(died).toHaveLength(2);
    expect(died.every((d) => d.cause === "head_to_head")).toBe(true);
    expect(died.every((d) => d.killerSnakeId === null)).toBe(true);
  });

  it("kills only the shorter snake in an equal-level head-to-head (044d)", () => {
    const short = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
      ],
    });
    const long = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 6 },
      ],
    });
    const { nextState, events } = doResolve(
      state([short, long]),
      moves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 1).alive).toBe(true);
    const died = eventsOfKind(events, "snake_died");
    expect(died).toHaveLength(1);
    expect(died[0]?.snakeId).toBe(sid(0));
    expect(died[0]?.killerSnakeId).toBe(sid(1));
  });

  it("kills below-max-level snakes regardless of length in a head-to-head (044d)", () => {
    const longNormal = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
        { x: 2, y: 4 },
        { x: 2, y: 3 },
      ],
    });
    const shortBuffed = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
      ],
      activeEffects: [effect("invulnerability", "buff", 5)],
    });
    const { nextState } = doResolve(
      state([longNormal, shortBuffed]),
      moves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 1).alive).toBe(true);
  });

  it("keeps a wall-dying snake's body lethal in the same phase (game-rules/collisions-and-severing#dead-bodies-remain-lethal-all-turn)", () => {
    // A drives into the wall; B simultaneously enters A's body. Both die.
    const a = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
    });
    const b = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 2, y: 7 },
        { x: 2, y: 8 },
        { x: 2, y: 9 },
      ],
      lastDirection: Direction.Up,
    });
    // B moves Up twice conceptually; here (2,7) -> (2,6)? No: A's post-move
    // body is [(0,5)... wall] — use A's segment at (2,5): B at (2,6) moving Up.
    const b2 = {
      ...b,
      body: [
        { x: 2, y: 6 },
        { x: 2, y: 7 },
        { x: 2, y: 8 },
      ],
    };
    const { nextState, events } = doResolve(
      state([a, b2]),
      moves([
        [0, Direction.Left],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 1).alive).toBe(false);
    const causes = eventsOfKind(events, "snake_died").map((d) => [d.snakeId, d.cause]);
    expect(causes).toContainEqual([sid(0), "wall"]);
    expect(causes).toContainEqual([sid(1), "body_collision"]);
  });

  it("ignores effects gained this turn for this turn's collisions (game-rules/turn-resolution-model)", () => {
    // Attacker collects an invuln potion THIS turn and hits a body: still level 0 → dies.
    const attacker = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });
    const victim = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      lastDirection: Direction.Up,
    });
    // Potion sits on the collision cell — collection happens in Phase 6, but
    // the attacker is dead by then; nothing is collected and level stays 0.
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 5, y: 5 });
    const { nextState } = doResolve(
      state([attacker, victim], { items: [potion] }),
      moves([
        [0, Direction.Right],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
  });
});

describe("Health rules (game-rules/health-and-starvation)", () => {
  it("subtracts 1 health per turn unconditionally (046a)", () => {
    const s = makeSnake({ snakeId: sid(0), health: 42 });
    const { nextState } = doResolve(state([s]), moves([[0, Direction.Up]]));
    expect(snakeById(nextState, 0).health).toBe(41);
  });

  it("applies hazard damage when the head enters a hazard cell (046b)", () => {
    const board = emptyBoard(11);
    const cells = [...board.cells];
    cells[4 * 11 + 3] = 2; // CellType.Hazard at (3,4)
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 5 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
      ],
      health: 42,
    });
    const { nextState } = doResolve(
      state([s], { board: { boardSize: 11, cells } }),
      moves([[0, Direction.Up]]),
    );
    expect(snakeById(nextState, 0).health).toBe(42 - 1 - 15);
  });

  it("dies of health_depletion with hazard among sources when hazard damage is lethal", () => {
    const board = emptyBoard(11);
    const cells = [...board.cells];
    cells[4 * 11 + 3] = 2;
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 5 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
      ],
      health: 10,
    });
    const { nextState, events } = doResolve(
      state([s], { board: { boardSize: 11, cells } }),
      moves([[0, Direction.Up]]),
    );
    const died = eventsOfKind(events, "snake_died")[0];
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(died?.cause).toBe("health_depletion");
    expect(new Set(died?.sources)).toEqual(new Set(["tick", "hazard"]));
  });

  it("restores health to max and grows on food (046c, game-rules/food-and-growth)", () => {
    const s = makeSnake({ snakeId: sid(0), health: 30 });
    const head = s.body[0];
    if (head === undefined) throw new Error("no head");
    const target = { x: head.x, y: head.y - 1 };
    const { nextState, events } = doResolve(
      state([s], { items: [makeItem(0, ItemType.Food, target)] }),
      moves([[0, Direction.Up]]),
    );
    expect(snakeById(nextState, 0).health).toBe(100);
    expect(snakeById(nextState, 0).body).toHaveLength(4); // grew at commit
    expect(itemList(nextState)).toHaveLength(0); // consumed item removed from the board
    const eaten = eventsOfKind(events, "food_eaten");
    expect(eaten).toHaveLength(1);
    expect(eaten[0]?.healthRestored).toBe(100 - 29); // after the tick
    // reference to the consumed item by derived id (game-rules/item-identity)
    expect(eaten[0]?.itemId).toBe("0:0");
  });

  it("nets to max health on a food-on-hazard cell (046c)", () => {
    const board = emptyBoard(11);
    const cells = [...board.cells];
    cells[4 * 11 + 3] = 2; // hazard at (3,4)
    const s = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 5 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
      ],
      health: 50,
    });
    const { nextState } = doResolve(
      state([s], {
        board: { boardSize: 11, cells },
        items: [makeItem(0, ItemType.Food, { x: 3, y: 4 })],
      }),
      moves([[0, Direction.Up]]),
    );
    expect(snakeById(nextState, 0).health).toBe(100);
    expect(snakeById(nextState, 0).alive).toBe(true);
  });

  it("kills a snake whose health reaches 0 from the tick (046d)", () => {
    const s = makeSnake({ snakeId: sid(0), health: 1 });
    const { nextState, events } = doResolve(state([s]), moves([[0, Direction.Up]]));
    expect(snakeById(nextState, 0).alive).toBe(false);
    const died = eventsOfKind(events, "snake_died")[0];
    expect(died?.cause).toBe("health_depletion");
    expect(died?.sources).toEqual(["tick"]);
  });

  it("saves a 1-health snake that reaches food (all modifications before starvation)", () => {
    const s = makeSnake({ snakeId: sid(0), health: 1 });
    const head = s.body[0];
    if (head === undefined) throw new Error("no head");
    const { nextState } = doResolve(
      state([s], { items: [makeItem(0, ItemType.Food, { x: head.x, y: head.y - 1 })] }),
      moves([[0, Direction.Up]]),
    );
    expect(snakeById(nextState, 0).alive).toBe(true);
    expect(snakeById(nextState, 0).health).toBe(100);
  });

  it("leaves an item uncollected when a head-to-head tie kills every entrant (044d)", () => {
    const a = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
      ],
    });
    const b = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
      ],
    });
    const food = makeItem(0, ItemType.Food, { x: 5, y: 5 }); // the contested cell
    const { nextState } = doResolve(
      state([a, b], { items: [food] }),
      moves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 1).alive).toBe(false);
    expect(itemList(nextState)).toHaveLength(1); // no surviving entrant — item stays
  });

  it("lets the unique head-to-head winner collect the contested item (044d)", () => {
    const short = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
      ],
    });
    const long = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 6 },
      ],
      health: 40,
    });
    const food = makeItem(0, ItemType.Food, { x: 5, y: 5 });
    const { nextState } = doResolve(
      state([short, long], { items: [food] }),
      moves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false); // loser eats nothing
    expect(snakeById(nextState, 1).alive).toBe(true);
    expect(itemList(nextState)).toHaveLength(0); // winner consumed the item
    expect(snakeById(nextState, 1).health).toBe(100); // winner healed
  });

  it("lets a snake dying by body collision still eat (sacrificial collection)", () => {
    // Food sits on a cell crossed by the victim's body; the attacker dies
    // there but its head reached the cell — the food is consumed.
    const attacker = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });
    const victim = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      lastDirection: Direction.Up,
    });
    const food = makeItem(0, ItemType.Food, { x: 5, y: 5 });
    const { nextState, events } = doResolve(
      state([attacker, victim], { items: [food] }),
      moves([
        [0, Direction.Right],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(eventsOfKind(events, "snake_died")[0]?.cause).toBe("body_collision");
    expect(itemList(nextState)).toHaveLength(0); // sacrificial collection consumed it
    expect(eventsOfKind(events, "food_eaten")).toHaveLength(1);
  });
});

describe("Potion rule (game-rules/team-potion-effects/027)", () => {
  function teamPair() {
    const collector = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 5 },
        { x: 3, y: 6 },
        { x: 3, y: 7 },
      ],
    });
    const mate = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 7 },
      ],
    });
    return [collector, mate];
  }

  it("gives the collector a debuff and teammates a buff, expiring at T+3", () => {
    const [collector, mate] = teamPair();
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 3, y: 4 });
    const { nextState, events } = doResolve(
      state([collector as SnakeState, mate as SnakeState], { items: [potion] }),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
      { turnNumber: 4 },
    );
    // Phase 9 of the same turn applies the rebuild to activeEffects.
    expect(snakeById(nextState, 0).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([
      { family: "invulnerability", state: "buff", expiryTurn: turn(7) },
    ]);
    const collected = eventsOfKind(events, "potion_collected");
    expect(collected).toHaveLength(1);
    expect(collected[0]?.snakeId).toBe(sid(0));
    expect(collected[0]?.potionType).toBe(ItemType.InvulnPotion);
    expect(collected[0]?.affectedTeammateIds).toEqual([sid(1)]);
    const applied = eventsOfKind(events, "effect_applied");
    expect(applied).toHaveLength(2);
  });

  it("collapses simultaneous multi-collection into one coherent team rebuild", () => {
    const [collector, mate] = teamPair();
    const third = makeSnake({
      snakeId: sid(2),
      letter: "C",
      body: [
        { x: 5, y: 8 },
        { x: 5, y: 9 },
        { x: 5, y: 9 },
      ],
    });
    const potions = [
      makeItem(0, ItemType.InvulnPotion, { x: 3, y: 4 }),
      makeItem(1, ItemType.InvulnPotion, { x: 7, y: 4 }),
    ];
    const { nextState } = doResolve(
      state([collector as SnakeState, mate as SnakeState, third], { items: potions }),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
        [2, Direction.Up],
      ]),
      { turnNumber: 4 },
    );
    expect(snakeById(nextState, 0).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
    expect(snakeById(nextState, 2).activeEffects).toEqual([
      { family: "invulnerability", state: "buff", expiryTurn: turn(7) },
    ]);
  });

  it("treats the two potion families independently (game-rules/team-potion-effects)", () => {
    const [collector, mate] = teamPair();
    const potions = [
      makeItem(0, ItemType.InvulnPotion, { x: 3, y: 4 }),
      makeItem(1, ItemType.InvisPotion, { x: 7, y: 4 }),
    ];
    const { nextState } = doResolve(
      state([collector as SnakeState, mate as SnakeState], { items: potions }),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
      { turnNumber: 4 },
    );
    const s0 = snakeById(nextState, 0).activeEffects;
    const s1 = snakeById(nextState, 1).activeEffects;
    expect(s0).toContainEqual({ family: "invulnerability", state: "debuff", expiryTurn: turn(7) });
    expect(s0).toContainEqual({ family: "invisibility", state: "buff", expiryTurn: turn(7) });
    expect(s1).toContainEqual({ family: "invulnerability", state: "buff", expiryTurn: turn(7) });
    expect(s1).toContainEqual({ family: "invisibility", state: "debuff", expiryTurn: turn(7) });
  });

  it("replaces an existing active effect on re-collection instead of stacking", () => {
    const [collectorBase, mateBase] = teamPair();
    const collector = {
      ...(collectorBase as SnakeState),
      activeEffects: [effect("invulnerability", "buff", 5)],
    };
    const mate = {
      ...(mateBase as SnakeState),
      activeEffects: [effect("invulnerability", "debuff", 5)],
    };
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 3, y: 4 });
    const { nextState } = doResolve(
      state([collector, mate], { items: [potion] }),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
      { turnNumber: 4 },
    );
    // Old roles were swapped; the new rebuild replaces both, no stacking.
    expect(snakeById(nextState, 0).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([
      { family: "invulnerability", state: "buff", expiryTurn: turn(7) },
    ]);
  });
});
