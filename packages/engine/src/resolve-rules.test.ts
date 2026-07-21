// White-box unit tests for the individual interaction rules and derived
// rules (01 §2.8 stages 3-4). Each test builds a TurnContext from a small
// state, runs ONE rule, and inspects the claim set directly — no commit.
import { describe, expect, it } from "vitest";
import { itemIdOf } from "./items.js";
import { ClaimSet } from "./resolve/claims.js";
import { buildTurnContext } from "./resolve/context.js";
import type { TurnContext } from "./resolve/context.js";
import {
  bodyCollisionRule,
  foodRule,
  hazardRule,
  healthTickRule,
  potionRule,
  runDerivedRules,
  selfCollisionRule,
  wallRule,
} from "./resolve/rules.js";
import {
  QUIET_CONFIG,
  effect,
  emptyBoard,
  makeItem,
  makeSnake,
  makeState,
  seed,
  sid,
  stagedMoves,
  tid,
  turn,
} from "./testkit.js";
import type { GameState, SnakeId, StagedMove } from "./types.js";
import { CellType, Direction, ItemType } from "./types.js";

function build(
  state: GameState,
  moves: Map<SnakeId, StagedMove>,
): { ctx: TurnContext; claims: ClaimSet } {
  const claims = new ClaimSet();
  const ctx = buildTurnContext(state, moves, turn(1), seed(50), QUIET_CONFIG, claims);
  return { ctx, claims };
}

describe("wallRule (game-engine/collisions-and-severing)", () => {
  it("claims certain death for a head on a wall cell and nothing else", () => {
    const doomed = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
      ],
    });
    const safe = makeSnake({ snakeId: sid(1), letter: "B" });
    const { ctx, claims } = build(
      makeState([doomed, safe]),
      stagedMoves([
        [0, Direction.Left],
        [1, Direction.Up],
      ]),
    );
    wallRule(ctx, claims);
    expect(claims.certainDeathClaims(sid(0))).toEqual([{ cause: "wall", killer: null }]);
    expect(claims.hasCertainDeath(sid(1))).toBe(false);
    expect(claims.disruptions).toEqual([{ snakeId: sid(0), cause: "wall_death" }]);
  });
});

describe("selfCollisionRule (game-engine/collisions-and-severing)", () => {
  it("claims death for a head entering its own moved body, but not a tail-chase", () => {
    const selfHit = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 3, y: 3 },
        { x: 3, y: 4 },
        { x: 4, y: 4 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
      ],
    });
    const tailChaser = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 3 },
        { x: 7, y: 4 },
        { x: 8, y: 4 },
        { x: 8, y: 3 },
      ],
    });
    const { ctx, claims } = build(
      makeState([selfHit, tailChaser]),
      stagedMoves([
        [0, Direction.Right],
        [1, Direction.Right],
      ]),
    );
    selfCollisionRule(ctx, claims);
    expect(claims.hasCertainDeath(sid(0))).toBe(true);
    expect(claims.hasCertainDeath(sid(1))).toBe(false);
  });
});

describe("bodyCollisionRule (game-engine/collisions-and-severing)", () => {
  function combatants(attackerBuffed: boolean) {
    const attacker = makeSnake({
      snakeId: sid(0),
      body: [
        { x: 4, y: 5 },
        { x: 4, y: 6 },
        { x: 4, y: 7 },
      ],
      activeEffects: attackerBuffed ? [effect("invulnerability", "buff", 5)] : [],
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
    });
    return build(
      makeState([attacker, victim]),
      stagedMoves([
        [0, Direction.Right],
        [1, Direction.Up],
      ]),
    );
  }

  it("claims attacker death against an equal-level victim", () => {
    const { ctx, claims } = combatants(false);
    bodyCollisionRule(ctx, claims);
    expect(claims.certainDeathClaims(sid(0))).toEqual([
      { cause: "body_collision", killer: sid(1) },
    ]);
    expect(claims.severRecords).toHaveLength(0);
    expect(claims.disruptions).toContainEqual({
      snakeId: sid(1),
      cause: "body_collision_received",
    });
  });

  it("claims a sever when the attacker's snapshot level is higher", () => {
    const { ctx, claims } = combatants(true);
    bodyCollisionRule(ctx, claims);
    expect(claims.hasCertainDeath(sid(0))).toBe(false);
    // Victim's moved body spans (5,3)..(5,6); contact at moved index 2.
    expect(claims.severIndex(sid(1))).toBe(2);
    expect(claims.severRecords).toEqual([
      {
        attackerSnakeId: sid(0),
        victimSnakeId: sid(1),
        contactCell: { x: 5, y: 5 },
        segmentsLost: 2,
      },
    ]);
  });
});

describe("hazardRule and healthTickRule (game-engine/health-and-starvation/b)", () => {
  it("claims hazard damage plus disruption only for heads on hazard cells", () => {
    const board = emptyBoard(11);
    const cells = [...board.cells];
    cells[2 * 11 + 3] = CellType.Hazard; // (3,2) — head (3,3) moves Up into it
    const onHazard = makeSnake({ snakeId: sid(0) }); // head (3,3) moving Up → (3,2)
    const clear = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 7 },
      ],
    });
    const { ctx, claims } = build(
      makeState([onHazard, clear], { board: { boardSize: 11, cells } }),
      stagedMoves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
    );
    hazardRule(ctx, claims);
    expect(claims.totalDamage(sid(0))).toBe(QUIET_CONFIG.hazardDamage);
    expect(claims.totalDamage(sid(1))).toBe(0);
    expect(claims.disruptions).toEqual([{ snakeId: sid(0), cause: "hazard_entry" }]);

    healthTickRule(ctx, claims);
    expect(claims.totalDamage(sid(0))).toBe(QUIET_CONFIG.hazardDamage + 1);
    expect(claims.totalDamage(sid(1))).toBe(1);
    expect(claims.damageSources(sid(0))).toEqual(["tick", "hazard"]); // canonical order
  });
});

describe("foodRule and potionRule (game-engine/food-and-growth, game-engine/team-potion-effects)", () => {
  it("consumes food and claims heal + growth for the entrant", () => {
    const eater = makeSnake({ snakeId: sid(0) }); // head (3,3) → (3,2)
    const food = makeItem(0, ItemType.Food, { x: 3, y: 2 });
    const { ctx, claims } = build(
      makeState([eater], { items: [food] }),
      stagedMoves([[0, Direction.Up]]),
    );
    foodRule(ctx, claims);
    expect(claims.hasHeal(sid(0))).toBe(true);
    expect(claims.hasGrow(sid(0))).toBe(true);
    expect(claims.consumptions()).toEqual([itemIdOf(food)]);
    expect(ctx.items.size).toBe(1); // rules never write the items map
    expect(claims.disruptions).toHaveLength(0); // eating is not a disruption
  });

  it("aggregates same-team same-family collections into one rebuild claim", () => {
    const a = makeSnake({ snakeId: sid(0) });
    const b = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 7 },
      ],
    });
    const potions = [
      makeItem(0, ItemType.InvulnPotion, { x: 3, y: 2 }),
      makeItem(1, ItemType.InvulnPotion, { x: 7, y: 4 }),
    ];
    const { ctx, claims } = build(
      makeState([a, b], { items: potions }),
      stagedMoves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
    );
    potionRule(ctx, claims);
    const rebuilds = claims.rebuilds();
    expect(rebuilds).toHaveLength(1);
    expect(rebuilds[0]?.family).toBe("invulnerability");
    expect(rebuilds[0]?.collectorIds).toEqual(new Set([sid(0), sid(1)]));
    expect(claims.potionCollections).toHaveLength(2);
  });
});

describe("runDerivedRules (game-engine/health-and-starvation, game-engine/team-potion-effects)", () => {
  it("resolves health, derives health deaths, and triggers cancellation from them", () => {
    // Collector debuff-holder at 1 health: the tick alone kills it, and that
    // health-depletion disruption must cancel the family team-wide.
    const collector = makeSnake({
      snakeId: sid(0),
      health: 1,
      activeEffects: [effect("invulnerability", "debuff", 9)],
    });
    const mate = makeSnake({
      snakeId: sid(1),
      letter: "B",
      body: [
        { x: 7, y: 5 },
        { x: 7, y: 6 },
        { x: 7, y: 7 },
      ],
      activeEffects: [effect("invulnerability", "buff", 9)],
    });
    const { ctx, claims } = build(
      makeState([collector, mate]),
      stagedMoves([
        [0, Direction.Up],
        [1, Direction.Up],
      ]),
    );
    healthTickRule(ctx, claims);
    runDerivedRules(ctx, claims);
    expect(claims.resolvedHealth(sid(0))).toBe(0);
    expect(claims.healthDeathSources(sid(0))).toEqual(["tick"]);
    expect(claims.cancellations()).toEqual([{ team: tid("red"), family: "invulnerability" }]);
    expect(claims.resolvedHealth(sid(1))).toBe(99);
  });

  it("gives a heal claim precedence over damage in health resolution", () => {
    const snake = makeSnake({ snakeId: sid(0), health: 5 });
    const { ctx, claims } = build(makeState([snake]), stagedMoves([[0, Direction.Up]]));
    claims.damage(sid(0), 40, "hazard");
    claims.heal(sid(0));
    runDerivedRules(ctx, claims);
    expect(claims.resolvedHealth(sid(0))).toBe(QUIET_CONFIG.maxHealth);
    expect(claims.healthDeathSources(sid(0))).toBeUndefined();
  });
});

describe("head-to-head precedence at context build (game-engine/head-to-head-precedence)", () => {
  it("withdraws losing heads from H* while keeping their bodies on the board", () => {
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
    const { ctx, claims } = build(
      makeState([short, long]),
      stagedMoves([
        [0, Direction.Right],
        [1, Direction.Left],
      ]),
    );
    expect(claims.certainDeathClaims(sid(0))).toEqual([{ cause: "head_to_head", killer: sid(1) }]);
    expect(ctx.survivingHeads.map((h) => h.snake.snakeId)).toEqual([sid(1)]);
    // The loser still projects a moved body (a valid collision target).
    expect(ctx.moved.get(sid(0))?.body).toHaveLength(3);
  });
});
