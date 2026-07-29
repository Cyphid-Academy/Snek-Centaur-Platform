// Imagining moves: the second way of using the engine, its held-snake
// semantics, and the fence that refuses rather than guesses.
// spec: game-engine/turn-resolution-model, game-engine/held-snakes,
// game-engine/hypothetical-resolution-failure
import { describe, expect, it } from "vitest";
import type { HypotheticalResolution } from "./resolve.js";
import type { HistoryResult, HistoryRevision } from "./resolve.js";
import { advanceHistory, imagineMoves } from "./resolve.js";
import { currentTurn, isLockstep, narrowToGameState } from "./state.js";
import {
  QUIET_CONFIG,
  atTurn,
  boardWith,
  doImagine,
  doResolve,
  effect,
  eventsOfKind,
  imagineFrom,
  makeItem,
  makeSnake,
  makeState,
  projectionById,
  quietTimings,
  seed,
  sid,
  snakeById,
  stagedMoves,
  tid,
  timings,
} from "./testkit.js";
import type { PartialGameState, SnakeId, TurnNumber } from "./types.js";
import { CellType, Direction, ItemType } from "./types.js";

/** Two snakes on separate teams, three segments each, heading right. */
function pair() {
  return [
    makeSnake({
      snakeId: sid(0),
      centaurTeamId: tid("red"),
      body: [
        { x: 3, y: 5 },
        { x: 2, y: 5 },
        { x: 1, y: 5 },
      ],
      lastDirection: Direction.Right,
    }),
    makeSnake({
      snakeId: sid(1),
      centaurTeamId: tid("blue"),
      body: [
        { x: 7, y: 5 },
        { x: 8, y: 5 },
        { x: 9, y: 5 },
      ],
      lastDirection: Direction.Left,
    }),
  ];
}

function ok(result: ReturnType<typeof doImagine>): HypotheticalResolution {
  if (!result.ok) throw new Error(`unexpected refusal: ${result.failure.reason}`);
  return result.resolution;
}

function okHistory(result: HistoryResult): HistoryRevision {
  if (!result.ok) throw new Error(`unexpected refusal: ${result.failure.reason}`);
  return result.revision;
}

/** Directions as a map, for advanceHistory. */
function moves(entries: Array<[number, Direction]>): Map<SnakeId, Direction> {
  return new Map(entries.map(([id, d]) => [sid(id), d]));
}

describe("advancing is imagining with nothing held", () => {
  // spec: game-engine/turn-resolution-model#advancing-is-imagining-with-nothing-held
  it("produces the same state, events and outcome as the mainline", () => {
    const state = makeState(pair(), { items: [makeItem(0, ItemType.Food, { x: 4, y: 5 })] });
    const moves = stagedMoves([
      [0, Direction.Right],
      [1, Direction.Left],
    ]);
    const advanced = doResolve(state, moves);
    const imagined = ok(
      doImagine(
        state,
        [
          [0, Direction.Right],
          [1, Direction.Left],
        ],
        [],
      ),
    );
    expect(imagined.nextState.snakes).toEqual(advanced.nextState.snakes);
    expect(imagined.nextState.items).toEqual(advanced.nextState.items);
    expect(imagined.outcome).toEqual(advanced.outcome);
    // Only the attribution differs: a hypothetical stages nothing.
    expect(eventsOfKind(imagined.events, "snake_moved").map((e) => e.stagedBy)).toEqual([
      null,
      null,
    ]);
    expect(imagined.events.map((e) => e.kind)).toEqual(advanced.events.map((e) => e.kind));
  });

  // spec: game-engine/turn-resolution-model#imagining-moves-yields-a-partial-state
  it("yields a state that will not narrow when anything is held", () => {
    const state = makeState(pair());
    const imagined = ok(doImagine(state, [[0, Direction.Up]], [1]));
    expect(isLockstep(imagined.nextState)).toBe(false);
    expect(narrowToGameState(imagined.nextState)).toBeNull();
    expect(currentTurn(imagined.nextState)).toBe(2); // the mover advanced 1 → 2
    // The held snake left the board as a projection, crystallized at turn 1.
    expect(projectionById(imagined.nextState, 1).historic.turn).toBe(1);
  });

  // spec: game-engine/turn-resolution-model#spawning-and-outcome-need-lockstep
  it("spawns nothing and reports no outcome while a snake lags", () => {
    const state = makeState(pair());
    const imagined = ok(
      doImagine(state, [[0, Direction.Up]], [1], { config: { foodSpawnRate: 5 } }),
    );
    expect(imagined.outcome).toBeNull();
    expect(eventsOfKind(imagined.events, "food_spawned")).toEqual([]);
  });
});

describe("held snakes (game-engine/held-snakes)", () => {
  // spec: game-engine/held-snakes#a-projection-has-no-head — equal levels, so
  // the ordinary body-collision outcome: the mover dies.
  it("kills an equal-level mover that enters a projection's first segment", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
      }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      }),
    ];
    const imagined = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    const death = eventsOfKind(imagined.events, "snake_died")[0];
    expect(death?.snakeId).toBe(sid(0));
    expect(death?.cause).toBe("body_collision");
    expect(death?.killerSnakeId).toBe(sid(1));
    expect(projectionById(imagined.nextState, 1).alive).toBe(true);
  });

  // spec: game-engine/held-snakes#a-projection-has-no-head — the higher level
  // prevails here as it does anywhere else. The projection's first segment
  // stands where the snake's head was, because that is where its own next
  // segment goes, so the sever takes every cell the projection locates and
  // leaves it standing in nothing at all.
  it("lets a higher-level mover sever a projection at its first segment", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
        activeEffects: [effect("invulnerability", "buff", 9)],
      }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      }),
    ];
    const imagined = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    const sever = eventsOfKind(imagined.events, "snake_severed")[0];
    expect(sever?.victimSnakeId).toBe(sid(1));
    expect(sever?.contactCell).toEqual({ x: 5, y: 5 });
    expect(sever?.segmentsLost).toBe(2); // every cell it stood in
    expect(snakeById(imagined.nextState, 0).alive).toBe(true);

    // The victim left `snakes` when it was held; it is a projection now.
    expect(imagined.nextState.snakes.map((s) => s.snakeId)).toEqual([sid(0)]);
    const victim = projectionById(imagined.nextState, 1);
    expect(victim.alive).toBe(true); // its head advanced out of the projection
    expect(victim.segments).toEqual([]);
    // The historic record is untouched: the last modelled position survives
    // for a reader even though nothing it names still stands.
    expect(victim.historic.body).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    expect(victim.historic.turn).toBe(1);
  });

  // spec: game-engine/held-snakes#a-projection-has-no-head — the same rule one
  // segment further back is the ordinary truncating sever.
  it("truncates a projection when the sever lands behind its first segment", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [
          { x: 5, y: 4 },
          { x: 4, y: 4 },
        ],
        activeEffects: [effect("invulnerability", "buff", 9)],
      }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [
          { x: 5, y: 6 },
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      }),
    ];
    const imagined = ok(doImagine(makeState(snakes), [[0, Direction.Down]], [1]));
    const sever = eventsOfKind(imagined.events, "snake_severed")[0];
    expect(sever?.contactCell).toEqual({ x: 5, y: 5 });
    expect(sever?.segmentsLost).toBe(2);
    expect(projectionById(imagined.nextState, 1).segments).toEqual([{ x: 5, y: 6 }]);
  });

  // spec: game-engine/held-snakes#a-severed-projection-locates-nothing
  it("leaves a projection severed to nothing obstructing nothing", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
        activeEffects: [effect("invulnerability", "buff", 9)],
      }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      }),
    ];
    const first = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    expect(projectionById(first.nextState, 1).segments).toEqual([]);
    // (6,5) is the second cell of the historic record. The mover walks
    // straight through it: the record is a memory, not an obstacle.
    const second = ok(imagineFrom(first.nextState, [[0, Direction.Right]], []));
    const third = ok(imagineFrom(second.nextState, [[0, Direction.Right]], []));
    expect(snakeById(third.nextState, 0).alive).toBe(true);
    expect(snakeById(third.nextState, 0).body[0]).toEqual({ x: 7, y: 5 });
    expect(eventsOfKind(third.events, "snake_severed")).toEqual([]);
  });

  // A projection carries maxHealth, always: a snake nobody modelled might have
  // reached food on any turn since, so any lower figure asserts a starvation
  // the hold has no grounds to claim.
  // spec: game-engine/held-snakes#a-projection-cannot-be-starved-by-a-hold
  it("projects at full health however low the snake was when it was held", () => {
    const snakes = [
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 2, y: 2 }] }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [{ x: 8, y: 8 }],
        health: 1,
      }),
    ];
    const imagined = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    const projection = projectionById(imagined.nextState, 1);
    expect(projection.alive).toBe(true);
    expect(projection.health).toBe(QUIET_CONFIG.maxHealth);
    expect(projection.historic.health).toBe(1); // the record is untouched
  });

  // spec: game-engine/held-snakes#a-projection-carries-its-own-effects — the
  // projection's timers run; the record's cannot, because nothing changes it.
  it("expires a projection's effects while leaving the record's alone", () => {
    const snakes = [
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 2, y: 2 }] }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [{ x: 8, y: 8 }],
        // Active through turn 2, so the turn-1 resolution keeps it and the
        // turn-2 one expires it.
        activeEffects: [effect("invulnerability", "buff", 2)],
      }),
    ];
    const first = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    expect(projectionById(first.nextState, 1).activeEffects).toHaveLength(1);
    const second = ok(imagineFrom(first.nextState, [[0, Direction.Right]], []));
    const projection = projectionById(second.nextState, 1);
    expect(projection.activeEffects).toEqual([]);
    expect(projection.historic.activeEffects).toHaveLength(1); // the record never changes
  });

  // spec: game-engine/hypothetical-resolution-failure#only-holds-may-lag — a
  // projection is a snake an earlier resolution declined to model, so it can
  // never be asked to move, and the state carrying it will never narrow.
  it("refuses to move a projection, and will not narrow the state carrying one", () => {
    const snakes = [
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 2, y: 2 }] }),
      makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 8, y: 8 }] }),
    ];
    const first = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    expect(narrowToGameState(first.nextState)).toBeNull();

    const moved = imagineFrom(
      first.nextState,
      [
        [0, Direction.Right],
        [1, Direction.Right],
      ],
      [],
    );
    expect(moved.ok).toBe(false);
    if (moved.ok) return;
    expect(moved.failure.kind).toBe("stale_snake_moved");
    expect(moved.failure.snakeId).toBe(sid(1));

    // Nor is it named as held: it is held by what it is.
    const heldAgain = imagineFrom(first.nextState, [[0, Direction.Right]], [1]);
    expect(heldAgain.ok).toBe(false);
    if (heldAgain.ok) return;
    expect(heldAgain.failure.kind).toBe("impossible_input");
    expect(heldAgain.failure.reason).toContain("already projected");
  });

  // spec: game-engine/held-snakes#a-projected-tail-is-impassable
  it("makes a held snake's tail lethal, unlike a moving snake's", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [
          { x: 4, y: 5 },
          { x: 3, y: 5 },
        ],
      }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [
          { x: 6, y: 5 },
          { x: 5, y: 5 },
        ],
      }),
    ];
    // Held: snake 1's tail at (5,5) does not vacate.
    const held = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    expect(snakeById(held.nextState, 0).alive).toBe(false);
    // Moving right, the same tail vacates and the follow is legal.
    const moving = ok(
      doImagine(
        makeState(snakes),
        [
          [0, Direction.Right],
          [1, Direction.Right],
        ],
        [],
      ),
    );
    expect(snakeById(moving.nextState, 0).alive).toBe(true);
  });

  // spec: game-engine/held-snakes#a-projection-cannot-be-starved-by-a-hold
  it("takes no tick and does not resolve a held snake's health", () => {
    const snakes = pair().map((s, i) => ({ ...s, health: i === 1 ? 1 : 100 }));
    const imagined = ok(doImagine(makeState(snakes), [[0, Direction.Up]], [1]));
    const held = projectionById(imagined.nextState, 1);
    expect(held.health).toBe(QUIET_CONFIG.maxHealth); // not 0 — a hold does not starve a snake
    expect(held.historic.health).toBe(1); // and the record keeps what it saw
    expect(held.alive).toBe(true);
    expect(snakeById(imagined.nextState, 0).health).toBe(99); // the mover ticked
  });

  // spec: game-engine/held-snakes#a-projection-carries-its-own-effects
  it("expires a held snake's effects on schedule", () => {
    const snakes = pair();
    snakes[1] = {
      ...(snakes[1] as (typeof snakes)[1]),
      activeEffects: [effect("invisibility", "buff", 1)],
    };
    const imagined = ok(doImagine(makeState(snakes), [[0, Direction.Up]], [1], { turnNumber: 1 }));
    expect(projectionById(imagined.nextState, 1).activeEffects).toEqual([]);
    expect(eventsOfKind(imagined.events, "effect_cancelled")[0]?.reason).toBe("expiry");
  });

  // spec: game-engine/held-snakes#a-hold-does-not-shield-the-snake
  it("delivers a teammate's collected potion to a held snake", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [{ x: 3, y: 5 }],
      }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("red"),
        body: [{ x: 8, y: 8 }],
      }),
      makeSnake({ snakeId: sid(2), centaurTeamId: tid("blue"), body: [{ x: 2, y: 2 }] }),
    ];
    const state = makeState(snakes, {
      items: [makeItem(0, ItemType.InvulnPotion, { x: 4, y: 5 })],
    });
    const imagined = ok(
      doImagine(
        state,
        [
          [0, Direction.Right],
          [2, Direction.Right],
        ],
        [1],
      ),
    );
    expect(projectionById(imagined.nextState, 1).activeEffects).toHaveLength(1);
    expect(eventsOfKind(imagined.events, "potion_collected")[0]?.affectedTeammateIds).toEqual([
      sid(1),
    ]);
  });

  // spec: game-engine/hypothetical-resolution-failure#holding-everything-is-a-no-op-not-a-failure
  it("returns the state unchanged when every alive snake is held", () => {
    const state = makeState(pair(), {
      clocks: [
        { centaurTeamId: tid("red"), budgetMs: 900, perTurnMs: 100, declaredTurnOver: false },
        { centaurTeamId: tid("blue"), budgetMs: 900, perTurnMs: 100, declaredTurnOver: false },
      ],
    });
    const at = atTurn(state, 1);
    const imagined = ok(doImagine(state, [], [0, 1], { timings: timings(at, 5000, 5000) }));
    expect(imagined.nextState).toEqual(at);
    expect(imagined.events).toEqual([]);
    // spec: game-engine/turn-resolution-model#a-turn-nobody-took-charges-nothing
    expect(imagined.nextState.consumedDurationMs).toBe(0);
    expect(imagined.nextState.clocks).toEqual(at.clocks);
  });
});

describe("the failure fence (game-engine/hypothetical-resolution-failure)", () => {
  // spec: #every-snake-needs-a-disposition
  it("refuses when an alive snake is neither given a direction nor held", () => {
    const result = doImagine(makeState(pair()), [[0, Direction.Up]], []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("missing_disposition");
    expect(result.failure.snakeId).toBe(sid(1));
  });

  // spec: #only-holds-may-lag
  it("refuses to advance a snake whose turn is behind the state's", () => {
    // Snake 1 was held through an earlier resolution and now lags: advancing
    // it would need interactions that already committed to be re-resolved.
    // Built as a PartialGameState, because a lagging state is exactly what
    // will not narrow.
    const base = makeState(pair());
    const lagged: PartialGameState = {
      ...base,
      snakes: base.snakes.map((s) => ({
        ...s,
        turn: (s.snakeId === sid(0) ? 3 : 1) as TurnNumber,
      })),
    };
    const result = imagineMoves(
      lagged,
      new Map([
        [sid(0), Direction.Up],
        [sid(1), Direction.Up],
      ]),
      new Set(),
      { durationMs: 0, burnMs: new Map() },
      QUIET_CONFIG,
      seed(1),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("stale_snake_moved");
    expect(result.failure.snakeId).toBe(sid(1));
  });

  // spec: #impossible-input-is-refused
  it("refuses a direction supplied for a held snake", () => {
    const result = doImagine(makeState(pair()), [[0, Direction.Up]], [0, 1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("impossible_input");
    expect(result.failure.snakeId).toBe(sid(0));
  });

  it("refuses a hold on a snake that is not alive", () => {
    const snakes = pair();
    snakes[1] = { ...(snakes[1] as (typeof snakes)[1]), alive: false };
    const result = doImagine(makeState(snakes), [[0, Direction.Up]], [1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe("impossible_input");
    expect(result.failure.snakeId).toBe(sid(1));
  });

  it("refuses a declared duration or burn that is not a length of time", () => {
    const state = makeState(pair());
    const bad = doImagine(state, [[0, Direction.Up]], [1], {
      timings: { durationMs: -1, burnMs: new Map() },
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.failure.kind).toBe("impossible_input");
  });

  // A resolution needs a burn for each clocked team: filling in a missing one
  // would decide the game on a number nobody measured.
  it("refuses timings that do not name every clocked team", () => {
    const state = makeState(pair(), {
      clocks: [
        { centaurTeamId: tid("red"), budgetMs: 100, perTurnMs: 100, declaredTurnOver: false },
      ],
    });
    const result = doImagine(state, [[0, Direction.Up]], [1], {
      timings: { durationMs: 10, burnMs: new Map() },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toContain("declared no burn");
  });

  it("refuses a structurally impossible state", () => {
    const state = makeState(pair());
    const result = imagineMoves(
      { ...state, board: { boardSize: 11, cells: [CellType.Normal] } },
      new Map([[sid(0), Direction.Up]]),
      new Set([sid(1)]),
      { durationMs: 0, burnMs: new Map() },
      QUIET_CONFIG,
      seed(1),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("impossible_input");
  });

  // A caught-up resolution runs item spawning, which cannot run without
  // entropy — so a caller reaching it without a seed is asking for an answer
  // that depends on information it did not supply.
  it("refuses a lockstep resolution with no turn seed", () => {
    const state = atTurn(makeState(pair()), 1);
    const result = imagineMoves(
      state,
      new Map([
        [sid(0), Direction.Up],
        [sid(1), Direction.Up],
      ]),
      new Set(),
      quietTimings(state),
      QUIET_CONFIG,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.kind).toBe("missing_turn_seed");
  });

  // ...but a resolution that holds something never reaches spawning, so it
  // needs no seed at all — which is the one-turn-ahead search's case.
  it("needs no turn seed while a snake is held", () => {
    const state = atTurn(makeState(pair()), 1);
    const result = imagineMoves(
      state,
      new Map([[sid(0), Direction.Up]]),
      new Set([sid(1)]),
      quietTimings(state),
      QUIET_CONFIG,
    );
    expect(result.ok).toBe(true);
  });
});

describe("hazard damage is announced (game-engine/turn-events)", () => {
  const hazardBoard = boardWith(11, [[{ x: 4, y: 5 }, CellType.Hazard]]);

  // spec: game-engine/turn-events#hazard-damage-is-announced
  it("emits a hazard-damage event for a snake that survives it", () => {
    const state = makeState(pair(), { board: hazardBoard });
    const result = doResolve(state, stagedMoves([[0, Direction.Right]]), {
      config: { hazardDamage: 15 },
    });
    const event = eventsOfKind(result.events, "hazard_damage_taken")[0];
    expect(event).toEqual({
      kind: "hazard_damage_taken",
      snakeId: sid(0),
      damage: 15,
      cell: { x: 4, y: 5 },
    });
    expect(snakeById(result.nextState, 0).health).toBe(100 - 15 - 1);
  });

  it("reports through the death event instead when the damage kills", () => {
    const snakes = pair();
    snakes[0] = { ...(snakes[0] as (typeof snakes)[0]), health: 5 };
    const state = makeState(snakes, { board: hazardBoard });
    const result = doResolve(state, stagedMoves([[0, Direction.Right]]), {
      config: { hazardDamage: 15 },
    });
    expect(eventsOfKind(result.events, "hazard_damage_taken")).toEqual([]);
    const death = eventsOfKind(result.events, "snake_died")[0];
    expect(death?.cause).toBe("health_depletion");
    expect(death?.sources).toEqual(["tick", "hazard"]);
  });
});

// ---------------------------------------------------------------------------
// Advancing a historic snake (game-engine/historic-advance)
// ---------------------------------------------------------------------------

describe("advancing a historic snake", () => {
  /** Three snakes far apart; 0 and 2 move right, 1 is held. */
  function spread() {
    return [
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 2, y: 2 }] }),
      makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 2, y: 8 }] }),
      makeSnake({ snakeId: sid(2), centaurTeamId: tid("green"), body: [{ x: 8, y: 2 }] }),
    ];
  }

  // spec: game-engine/historic-advance#a-learned-move-settles-the-turn-it-was-made-at
  it("settles the held turn and leaves the snake one turn less historic", () => {
    const first = ok(
      doImagine(
        makeState(spread()),
        [
          [0, Direction.Right],
          [2, Direction.Right],
        ],
        [1],
      ),
    );
    const second = ok(
      imagineFrom(
        first.nextState,
        [
          [0, Direction.Right],
          [2, Direction.Right],
        ],
        [],
      ),
    );
    // Held at turn 1, and the board has since reached turn 3.
    expect(projectionById(second.nextState, 1).historic.turn).toBe(1);
    expect(currentTurn(second.nextState)).toBe(3);

    const revised = okHistory(
      advanceHistory(second.nextState, moves([[1, Direction.Down]]), QUIET_CONFIG),
    );
    // Same current turn; the snake advanced one turn of HISTORY, not of board.
    expect(currentTurn(revised.nextState)).toBe(3);
    const projection = projectionById(revised.nextState, 1);
    expect(projection.historic.turn).toBe(2);
    // It moved down at turn 1, so its historic head is one cell down.
    expect(projection.historic.body[0]).toEqual({ x: 2, y: 9 });
    expect(revised.discontinuities).toEqual([]);
  });

  // spec: game-engine/historic-advance#a-revision-can-rewrite-what-already-happened
  it("reports a discontinuity when the newly located head kills a snake that lived", () => {
    const snakes = [
      // Red walks right along row 5 and will pass through (5,5) at turn 2.
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 3, y: 5 }] }),
      // Blue sits one cell above (5,5). Held, so nothing knows it steps down.
      makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 5, y: 4 }] }),
    ];
    const first = ok(doImagine(makeState(snakes), [[0, Direction.Right]], [1]));
    const second = ok(imagineFrom(first.nextState, [[0, Direction.Right]], []));
    // Red passed through the cell blue's projection did not stand in.
    expect(snakeById(second.nextState, 0).alive).toBe(true);
    expect(snakeById(second.nextState, 0).body[0]).toEqual({ x: 5, y: 5 });

    // Blue actually stepped down at turn 1, so (5,5) was its head all along.
    const revised = okHistory(
      advanceHistory(second.nextState, moves([[1, Direction.Down]]), QUIET_CONFIG),
    );
    expect(revised.discontinuities).toEqual([{ snakeId: sid(0), wasAlive: true, nowAlive: false }]);
    expect(snakeById(revised.nextState, 0).alive).toBe(false);
  });

  // spec: game-engine/historic-advance — the log is what makes the replay a
  // recomputation rather than a guess, so it exists exactly while it is needed.
  it("carries a rewind log only while something is projected", () => {
    const state = makeState(spread());
    expect(state.rewind).toBeNull();
    const held = ok(
      doImagine(
        state,
        [
          [0, Direction.Right],
          [2, Direction.Right],
        ],
        [1],
      ),
    );
    expect(held.nextState.rewind?.resolutions).toHaveLength(1);
    expect(held.nextState.rewind?.base.snakes).toHaveLength(3); // before the hold
    const again = ok(
      imagineFrom(
        held.nextState,
        [
          [0, Direction.Right],
          [2, Direction.Right],
        ],
        [],
      ),
    );
    expect(again.nextState.rewind?.resolutions).toHaveLength(2);
    expect(again.nextState.rewind?.base).toBe(held.nextState.rewind?.base); // one base, shared

    // The mainline holds nothing, so it never accumulates one.
    expect(
      doResolve(
        state,
        stagedMoves([
          [0, Direction.Right],
          [1, Direction.Right],
          [2, Direction.Right],
        ]),
      ).nextState.rewind,
    ).toBeNull();
  });

  it("refuses a move for a snake that is not projected, and names where to send it", () => {
    const held = ok(
      doImagine(
        makeState(spread()),
        [
          [0, Direction.Right],
          [2, Direction.Right],
        ],
        [1],
      ),
    );
    const refused = advanceHistory(held.nextState, moves([[0, Direction.Up]]), QUIET_CONFIG);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.failure.reason).toContain("is not projected");

    // And the next turn's resolution points the other way.
    const wrongWay = imagineFrom(
      held.nextState,
      [
        [0, Direction.Right],
        [1, Direction.Up],
        [2, Direction.Right],
      ],
      [],
    );
    expect(wrongWay.ok).toBe(false);
    if (wrongWay.ok) return;
    expect(wrongWay.failure.kind).toBe("stale_snake_moved");
    expect(wrongWay.failure.reason).toContain("advanceHistory");
  });

  // spec: game-engine/historic-advance#a-revision-adapts-the-record-it-replays
  it("holds a snake the revision spared, because the log says nothing about it", () => {
    const snakes = [
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 3, y: 5 }] }),
      makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 5, y: 4 }] }),
      makeSnake({ snakeId: sid(2), centaurTeamId: tid("green"), body: [{ x: 9, y: 9 }] }),
    ];
    const first = ok(
      doImagine(
        makeState(snakes),
        [
          [0, Direction.Right],
          [2, Direction.Up],
        ],
        [1],
      ),
    );
    const second = ok(
      imagineFrom(
        first.nextState,
        [
          [0, Direction.Right],
          [2, Direction.Up],
        ],
        [],
      ),
    );
    const revised = okHistory(
      advanceHistory(second.nextState, moves([[1, Direction.Down]]), QUIET_CONFIG),
    );
    // Red died in the revised line, so the log's later direction for it was
    // dropped rather than refused, and the replay ran every recorded turn.
    expect(snakeById(revised.nextState, 0).alive).toBe(false);
    expect(currentTurn(revised.nextState)).toBe(3);
    expect(snakeById(revised.nextState, 2).body[0]).toEqual({ x: 9, y: 7 });
  });
});
