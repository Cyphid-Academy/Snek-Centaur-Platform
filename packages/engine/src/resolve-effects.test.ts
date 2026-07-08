import { describe, expect, it } from "vitest";
import { resolveTurn } from "./resolve.js";
import { effect, emptyBoard, makeItem, makeSnake, seed, sid, tid, turn } from "./testkit.js";
import type {
  Direction as DirectionT,
  GameRuntimeConfig,
  GameState,
  SnakeId,
  SnakeState,
  StagedMove,
  TurnEvent,
} from "./types.js";
import { CellType, DEFAULT_GAME_CONFIG, Direction, ItemType } from "./types.js";

const QUIET: GameRuntimeConfig = {
  ...DEFAULT_GAME_CONFIG.runtime,
  maxTurns: 0,
  foodSpawnRate: 0,
  invulnPotionSpawnRate: 0,
  invisPotionSpawnRate: 0,
};

function state(snakes: SnakeState[], extra: Partial<GameState> = {}): GameState {
  return {
    board: extra.board ?? emptyBoard(11),
    snakes,
    items: extra.items ?? [],
    clocks: extra.clocks ?? [],
  };
}

function moves(entries: Array<[number, DirectionT]>): Map<SnakeId, StagedMove> {
  return new Map(
    entries.map(([id, direction]) => [
      sid(id),
      { direction, stagedBy: { kind: "centaur_team", centaurTeamId: tid("red") } as const },
    ]),
  );
}

function doResolve(
  gameState: GameState,
  stagedMoves: Map<SnakeId, StagedMove>,
  turnNumber = 1,
  config: Partial<GameRuntimeConfig> = {},
) {
  return resolveTurn(gameState, stagedMoves, turn(turnNumber), seed(50), {
    ...QUIET,
    ...config,
  });
}

function snakeById(s: { snakes: ReadonlyArray<SnakeState> }, id: number): SnakeState {
  const snake = s.snakes.find((sn) => sn.snakeId === sid(id));
  if (snake === undefined) throw new Error(`no snake ${id}`);
  return snake;
}

function eventsOfKind<K extends TurnEvent["kind"]>(
  events: ReadonlyArray<TurnEvent>,
  kind: K,
): Array<Extract<TurnEvent, { kind: K }>> {
  return events.filter((e): e is Extract<TurnEvent, { kind: K }> => e.kind === kind);
}

// Red team: snake 0 (the collector, holding the family debuff) and snake 1
// (holding the family buff), both mid-board and safe unless a test steers
// them into trouble.
function collectorPair(family: "invulnerability" | "invisibility") {
  const collector = makeSnake({
    snakeId: sid(0),
    body: [
      { x: 3, y: 5 },
      { x: 3, y: 6 },
      { x: 3, y: 7 },
    ],
    activeEffects: [effect(family, "debuff", 9)],
  });
  const mate = makeSnake({
    snakeId: sid(1),
    letter: "B",
    body: [
      { x: 7, y: 5 },
      { x: 7, y: 6 },
      { x: 7, y: 7 },
    ],
    activeEffects: [effect(family, "buff", 9)],
  });
  return { collector, mate };
}

describe("Cancellation — collector disruption cancels the family team-wide (01-REQ-031)", () => {
  it("cancels teammates' buffs when the collector dies", () => {
    const { collector, mate } = collectorPair("invulnerability");
    // Collector drives into the wall: body starts adjacent to it.
    const doomed = {
      ...collector,
      body: [
        { x: 1, y: 5 },
        { x: 1, y: 6 },
        { x: 1, y: 7 },
      ],
    };
    const { nextState, events } = doResolve(
      state([doomed, mate]),
      moves([
        [0, Direction.Left],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 1).activeEffects).toEqual([]);
    const cancelled = eventsOfKind(events, "effect_cancelled");
    expect(cancelled).toContainEqual({
      kind: "effect_cancelled",
      snakeId: sid(1),
      family: "invulnerability",
      reason: "collector_disruption",
    });
  });

  it("cancels when the collector enters a hazard", () => {
    const { collector, mate } = collectorPair("invulnerability");
    const board = emptyBoard(11);
    const cells = [...board.cells];
    cells[4 * 11 + 3] = CellType.Hazard; // (3,4) — directly above the collector
    const { nextState } = doResolve(
      state([collector, mate], { board: { boardSize: 11, cells } }),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(true); // damaged, not dead
    expect(snakeById(nextState, 0).activeEffects).toEqual([]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([]);
  });

  it("cancels when the collector receives a body collision", () => {
    // Invisibility collector (level 0) is hit by an equal-level attacker:
    // attacker dies, collector suffers body_collision_received → invis cancelled.
    const { collector, mate } = collectorPair("invisibility");
    const attacker = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("blue"),
      body: [
        { x: 2, y: 6 },
        { x: 1, y: 6 },
        { x: 1, y: 7 },
      ],
    });
    const { nextState } = doResolve(
      state([collector, mate, attacker]),
      moves([
        [0, Direction.Up], // collector moves; body occupies (3,5),(3,6) after
        [1, Direction.Up],
        [2, Direction.Right], // attacker head → (3,6): collector's body
      ]),
    );
    expect(snakeById(nextState, 2).alive).toBe(false);
    expect(snakeById(nextState, 0).alive).toBe(true);
    expect(snakeById(nextState, 0).activeEffects).toEqual([]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([]);
  });

  it("cancels when the collector is severed", () => {
    const { collector, mate } = collectorPair("invisibility");
    const buffedAttacker = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("blue"),
      body: [
        { x: 2, y: 6 },
        { x: 1, y: 6 },
        { x: 1, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "buff", 9)],
    });
    const { nextState } = doResolve(
      state([collector, mate, buffedAttacker]),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
        [2, Direction.Right], // +1 level attacker severs the collector's body
      ]),
    );
    expect(snakeById(nextState, 2).alive).toBe(true);
    expect(snakeById(nextState, 0).body.length).toBeLessThan(3); // severed
    expect(snakeById(nextState, 0).activeEffects).toEqual([]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([]);
  });

  it("cancels when the collector severs another snake (severing is a disruption)", () => {
    // Invisibility collector that also holds an invuln buff severs an enemy →
    // 'severing_other' disruption → its own team's INVISIBILITY family cancels.
    const { collector, mate } = collectorPair("invisibility");
    const armed = {
      ...collector,
      activeEffects: [...collector.activeEffects, effect("invulnerability", "buff", 9)],
    };
    const enemy = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("blue"),
      body: [
        { x: 4, y: 4 },
        { x: 3, y: 4 },
        { x: 2, y: 4 },
        { x: 2, y: 3 },
      ],
    });
    // Enemy moves Right: body [(5,4),(4,4),(3,4),(2,4)]. Collector head → (3,4),
    // a non-head enemy segment: the +1-level collector severs it.
    const { nextState } = doResolve(
      state([armed, mate, enemy]),
      moves([
        [0, Direction.Up],
        [1, Direction.Up],
        [2, Direction.Right],
      ]),
    );
    expect(snakeById(nextState, 0).alive).toBe(true);
    // Invisibility cancelled team-wide; the collector's invuln buff survives.
    expect(snakeById(nextState, 0).activeEffects).toEqual([effect("invulnerability", "buff", 9)]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([]);
  });

  it("does NOT cancel when a mere buff-holder dies", () => {
    const { collector, mate } = collectorPair("invulnerability");
    const doomedMate = {
      ...mate,
      body: [
        { x: 9, y: 5 },
        { x: 9, y: 6 },
        { x: 9, y: 7 },
      ],
    };
    const { nextState } = doResolve(
      state([collector, doomedMate]),
      moves([
        [0, Direction.Up],
        [1, Direction.Right], // into the wall at x=10
      ]),
    );
    expect(snakeById(nextState, 1).alive).toBe(false);
    expect(snakeById(nextState, 0).activeEffects).toEqual([effect("invulnerability", "debuff", 9)]);
  });

  it("cancels both families independently for a dual-family collector", () => {
    const dual = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 1, y: 5 },
        { x: 1, y: 6 },
        { x: 1, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "debuff", 9), effect("invisibility", "debuff", 9)],
    });
    const mate = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "buff", 9), effect("invisibility", "buff", 9)],
    });
    const { nextState } = doResolve(
      state([dual, mate]),
      moves([
        [0, Direction.Left], // wall death
        [1, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 1).activeEffects).toEqual([]);
  });

  it("leaves the opposing team's effects untouched", () => {
    const { collector, mate } = collectorPair("invulnerability");
    const doomed = {
      ...collector,
      body: [
        { x: 1, y: 5 },
        { x: 1, y: 6 },
        { x: 1, y: 7 },
      ],
    };
    const enemy = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("blue"),
      body: [
        { x: 7, y: 9 },
        { x: 8, y: 9 },
        { x: 9, y: 9 },
      ],
      activeEffects: [effect("invulnerability", "buff", 9)],
    });
    const { nextState } = doResolve(
      state([doomed, mate, enemy]),
      moves([
        [0, Direction.Left],
        [1, Direction.Up],
        [2, Direction.Up],
      ]),
    );
    expect(snakeById(nextState, 2).activeEffects).toEqual([effect("invulnerability", "buff", 9)]);
  });

  it("lets a same-turn re-collection supersede the cancellation (01-REQ-031)", () => {
    // The collector dies, but a teammate collects a fresh potion of the same
    // family in the same turn: 9a strips the old buffs, 9b still applies the
    // new rebuild. Requirements override §2.8's discard-pending pseudocode.
    const { collector, mate } = collectorPair("invulnerability");
    const doomed = {
      ...collector,
      body: [
        { x: 1, y: 5 },
        { x: 1, y: 6 },
        { x: 1, y: 7 },
      ],
    };
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 7, y: 4 });
    const { nextState } = doResolve(
      state([doomed, mate], { items: [potion] }),
      moves([
        [0, Direction.Left], // collector dies
        [1, Direction.Up], // mate collects at (7,4)
      ]),
      4,
    );
    expect(snakeById(nextState, 1).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
  });
});

describe("collection and death in the same turn (01-REVIEW-022)", () => {
  it("applies the team rebuild when the collector dies by body collision (sacrificial collection)", () => {
    // The collector grabs the potion on a cell crossed by an enemy body and
    // dies there; the rebuild still applies — debuff on the corpse, buff on
    // the living teammate, and the buff window cannot be disrupted.
    const collector = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
    });
    const mate = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 8 },
        { x: 7, y: 9 },
        { x: 7, y: 9 },
      ],
    });
    const enemy = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("blue"),
      body: [
        { x: 5, y: 4 },
        { x: 5, y: 5 },
        { x: 5, y: 6 },
      ],
      lastDirection: Direction.Up,
    });
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 5, y: 5 });
    const { nextState, events } = doResolve(
      state([collector, mate, enemy], { items: [potion] }),
      moves([
        [0, Direction.Right], // into the enemy body AND onto the potion
        [1, Direction.Up],
        [2, Direction.Up],
      ]),
      4,
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(nextState.items[0]?.consumed).toBe(true);
    // Corpse keeps the debuff; living teammate holds the buff.
    expect(snakeById(nextState, 0).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
    expect(snakeById(nextState, 1).activeEffects).toEqual([
      { family: "invulnerability", state: "buff", expiryTurn: turn(7) },
    ]);
    expect(eventsOfKind(events, "potion_collected")).toHaveLength(1);
  });

  it("keeps the buff window alive when the dead collector's corpse is hit later", () => {
    // Turn 1: collector dies by wall while a teammate re-collects — no,
    // simpler: dead-in-snapshot snakes are not on the logical board, so a
    // corpse debuff-holder can never be disrupted. Verify: mate keeps its
    // buff on the following turn even when an enemy crosses the corpse cell.
    const corpse = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 5, y: 5 },
        { x: 5, y: 6 },
        { x: 5, y: 7 },
      ],
      alive: false,
      activeEffects: [effect("invulnerability", "debuff", 9)],
    });
    const mate = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 8, y: 5 },
        { x: 8, y: 6 },
        { x: 8, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "buff", 9)],
    });
    const enemy = makeSnake({
      snakeId: sid(2),
      centaurTeamId: tid("blue"),
      body: [
        { x: 4, y: 6 },
        { x: 3, y: 6 },
        { x: 2, y: 6 },
      ],
    });
    const { nextState } = doResolve(
      state([corpse, mate, enemy]),
      moves([
        [1, Direction.Up],
        [2, Direction.Right], // onto the corpse's old body cell — no collision, no disruption
      ]),
      5,
    );
    expect(snakeById(nextState, 2).alive).toBe(true); // corpse bodies are not obstacles
    expect(snakeById(nextState, 1).activeEffects).toEqual([effect("invulnerability", "buff", 9)]);
  });

  it("denies collection to a head-to-head loser (044d precedence)", () => {
    const loser = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 3, y: 5 },
        { x: 2, y: 5 },
      ],
    });
    const winner = makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 6, y: 5 },
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 8, y: 6 },
      ],
    });
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 5, y: 5 });
    const { nextState, events } = doResolve(
      state([loser, winner], { items: [potion] }),
      moves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
      4,
    );
    expect(snakeById(nextState, 0).alive).toBe(false);
    expect(snakeById(nextState, 0).activeEffects).toEqual([]); // loser collected nothing
    // The unique winner collected: it is this turn's collector (debuff).
    expect(snakeById(nextState, 1).activeEffects).toEqual([
      { family: "invulnerability", state: "debuff", expiryTurn: turn(7) },
    ]);
    expect(eventsOfKind(events, "potion_collected")[0]?.snakeId).toBe(sid(1));
  });
});

describe("Expiry (resolved 01-REVIEW-003)", () => {
  it("keeps an effect active on turns T+1..T+3 and removes it at the end of T+3", () => {
    const collector = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 7 },
        { x: 3, y: 8 },
        { x: 3, y: 9 },
      ],
    });
    const potion = makeItem(0, ItemType.InvulnPotion, { x: 3, y: 6 });
    // Collect on turn 2 → expiryTurn 5.
    let current = doResolve(state([collector], { items: [potion] }), moves([[0, Direction.Up]]), 2);
    expect(snakeById(current.nextState, 0).activeEffects).toHaveLength(1);
    // Turns 3 and 4: still active.
    for (const t of [3, 4]) {
      current = doResolve(current.nextState, moves([[0, Direction.Up]]), t);
      expect(snakeById(current.nextState, 0).activeEffects).toHaveLength(1);
    }
    // Turn 5 (= expiryTurn): active during the turn, removed in Phase 9c.
    current = doResolve(current.nextState, moves([[0, Direction.Up]]), 5);
    expect(snakeById(current.nextState, 0).activeEffects).toEqual([]);
    expect(eventsOfKind(current.events, "effect_cancelled")).toContainEqual({
      kind: "effect_cancelled",
      snakeId: sid(0),
      family: "invulnerability",
      reason: "expiry",
    });
  });
});
