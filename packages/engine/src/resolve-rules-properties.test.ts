// Property tests for the interaction and derived rules, using CONSTRUCTIVE
// generation: fast-check draws parameters and the test builds a state where
// the path under test is guaranteed to run, then compares the resolver
// against an independently-computed predicted outcome (see the predictors
// in arbitraries.ts).
// 1. Team potion collection (game-engine/team-potion-effects#rebuild-shape): a generated
//    collector subset — every collection actually happens, and the rebuild,
//    events, and item removal are checked exactly. Each constructed state is
//    also re-resolved under a shuffled rule order
//    (game-engine/turn-resolution-model#order-independence).
// 2. Health resolution (game-engine/health-and-starvation) over {empty, hazard, food} target
//    cells and the full documented maxHealth/hazardDamage ranges — including
//    game-engine/health-and-starvation#heal-dominates-same-turn-damage and
//    #starvation-with-sources.
// 3. Head-to-head (game-engine/head-to-head-precedence#level-then-length-then-mutual-destruction):
//    survivors are exactly the level-then-length filter's output.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CONFIG_RANGES,
  expiryFor,
  headToHeadSurvivors,
  invulnLevelArb,
  predictedHealth,
} from "./arbitraries.js";
import { familyOfPotion } from "./effects.js";
import { itemIdOf } from "./items.js";
import { resolveTurnWithRules } from "./resolve/index.js";
import { INTERACTION_RULES } from "./resolve/rules.js";
import { rngFromSeed } from "./rng.js";
import {
  QUIET_CONFIG,
  boardWith,
  doResolve,
  effect,
  eventsOfKind,
  itemList,
  makeItem,
  makeSnake,
  makeState,
  seed,
  sid,
  snakeById,
  stagedMoves,
  tid,
  turn,
} from "./testkit.js";
import type { Cell, SnakeState } from "./types.js";
import { CellType, Direction, ItemType } from "./types.js";

const byId = (a: number, b: number) => a - b;

// ---------------------------------------------------------------------------
// 1. Constructive team potion collection
// ---------------------------------------------------------------------------

const potionArb = fc.record({
  potionType: fc.constantFrom(ItemType.InvulnPotion, ItemType.InvisPotion),
  // Construction bounds (board-layout capacity on the fixed 13-board), not
  // spec ranges: red snakes sit on distinct columns 2,4,6,8.
  teamSize: fc.integer({ min: 2, max: 4 }),
  rawCollectors: fc.integer({ min: 1, max: 4 }),
  shuffleSeedN: fc.integer({ min: 1, max: 1000 }),
});

describe("team potion collection (game-engine/team-potion-effects#rebuild-shape)", () => {
  it("a generated collector subset yields exactly the predicted rebuild", () => {
    fc.assert(
      fc.property(potionArb, ({ potionType, teamSize, rawCollectors, shuffleSeedN }) => {
        const collectors = Math.min(rawCollectors, teamSize);
        const family = familyOfPotion(potionType);
        // Red snakes on distinct columns, everyone stepping Up; the first
        // `collectors` step onto a potion of the family, the rest onto empty
        // cells. Distinct columns mean no other interaction can fire.
        const redIds = [...Array(teamSize).keys()];
        const snakes: SnakeState[] = redIds.map((i) =>
          makeSnake({
            snakeId: sid(i),
            letter: String.fromCharCode(65 + i),
            body: [
              { x: 2 + 2 * i, y: 5 },
              { x: 2 + 2 * i, y: 6 },
              { x: 2 + 2 * i, y: 7 },
            ],
          }),
        );
        snakes.push(
          makeSnake({
            snakeId: sid(9),
            centaurTeamId: tid("blue"),
            body: [
              { x: 11, y: 5 },
              { x: 11, y: 6 },
              { x: 11, y: 7 },
            ],
          }),
        );
        const items = redIds
          .slice(0, collectors)
          .map((i) => makeItem(i + 1, potionType, { x: 2 + 2 * i, y: 4 }));
        const state = makeState(snakes, { board: boardWith(13, []), items });
        const moves = stagedMoves([
          ...redIds.map((i): [number, Direction] => [i, Direction.Up]),
          [9, Direction.Up],
        ]);

        const result = doResolve(state, moves);

        // Rebuild shape: collectors hold the debuff, the rest of the team
        // the buff, all expiring 3 turns after the collection turn.
        for (const i of redIds) {
          const snake = snakeById(result.nextState, i);
          expect(snake.activeEffects).toEqual([
            effect(family, i < collectors ? "debuff" : "buff", expiryFor(turn(1))),
          ]);
        }
        expect(snakeById(result.nextState, 9).activeEffects).toEqual([]);

        // Collection events reference each consumed item by derived id and
        // carry the affected teammates
        // (game-engine/item-identity#consumption-removes-and-reports).
        const collected = eventsOfKind(result.events, "potion_collected");
        expect([...collected.map((e) => e.snakeId)].sort(byId)).toEqual(
          redIds.slice(0, collectors).map((i) => sid(i)),
        );
        for (const e of collected) {
          const item = items.find((it) => itemIdOf(it) === e.itemId);
          expect(item?.cell).toEqual(e.cell);
          expect([...e.affectedTeammateIds].sort(byId)).toEqual(
            redIds.filter((i) => i !== e.snakeId).map((i) => sid(i)),
          );
        }
        // Consumed items are gone from game state.
        expect(itemList(result.nextState)).toEqual([]);

        // The constructed state resolves identically under a shuffled rule
        // order (game-engine/turn-resolution-model#order-independence).
        const rules = [...INTERACTION_RULES];
        rngFromSeed(seed(shuffleSeedN)).shuffle(rules);
        const shuffled = resolveTurnWithRules(rules, state, moves, turn(1), seed(50), QUIET_CONFIG);
        expect(shuffled.events).toEqual(result.events);
        expect(shuffled.nextState).toEqual(result.nextState);
      }),
      { numRuns: 60 },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Health resolution
// ---------------------------------------------------------------------------

const healthArb = fc.record({
  target: fc.constantFrom("empty", "hazard", "food"),
  maxHealth: fc.integer({ min: CONFIG_RANGES.maxHealth.min, max: CONFIG_RANGES.maxHealth.max }),
  rawHealth: fc.integer({ min: 1, max: CONFIG_RANGES.maxHealth.max }),
  hazardDamage: fc.integer({
    min: CONFIG_RANGES.hazardDamage.min,
    max: CONFIG_RANGES.hazardDamage.max,
  }),
});

describe("health resolution (game-engine/health-and-starvation)", () => {
  it("committed health and death cause match the predicted outcome", () => {
    fc.assert(
      fc.property(healthArb, ({ target, maxHealth, rawHealth, hazardDamage }) => {
        const health = Math.min(rawHealth, maxHealth);
        const targetCell: Cell = { x: 3, y: 2 };
        const board =
          target === "hazard" ? boardWith(9, [[targetCell, CellType.Hazard]]) : boardWith(9, []);
        const items = target === "food" ? [makeItem(1, ItemType.Food, targetCell)] : [];
        const state = makeState(
          [
            makeSnake({
              body: [
                { x: 3, y: 3 },
                { x: 3, y: 4 },
                { x: 3, y: 5 },
              ],
              health,
            }),
          ],
          { board, items },
        );
        const result = doResolve(state, stagedMoves([[0, Direction.Up]]), {
          config: { maxHealth, hazardDamage },
        });
        const snake = snakeById(result.nextState, 0);

        const predicted = predictedHealth({
          health,
          ate: target === "food",
          onHazard: target === "hazard",
          hazardDamage,
          maxHealth,
        });
        expect(snake.alive).toBe(predicted.alive);
        if (predicted.alive) expect(snake.health).toBe(predicted.health);

        if (target === "food") {
          // Heal dominates all same-turn damage
          // (game-engine/health-and-starvation#heal-dominates-same-turn-damage).
          expect(snake.body).toHaveLength(4); // duplicated tail (game-engine/food-and-growth)
          return;
        }
        if (!predicted.alive) {
          // Starvation reports every contributing source
          // (game-engine/health-and-starvation#starvation-with-sources).
          const deaths = eventsOfKind(result.events, "snake_died");
          expect(deaths).toHaveLength(1);
          expect(deaths[0]?.cause).toBe("health_depletion");
          const expectedSources = target === "hazard" ? ["hazard", "tick"] : ["tick"];
          expect([...(deaths[0]?.sources ?? [])].sort()).toEqual(expectedSources);
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Head-to-head
// ---------------------------------------------------------------------------

const headToHeadArb = fc.record({
  levelA: invulnLevelArb,
  levelB: invulnLevelArb,
  // Construction bounds for the stacked-tail bodies, not spec ranges.
  lenA: fc.integer({ min: 3, max: 6 }),
  lenB: fc.integer({ min: 3, max: 6 }),
});

function levelEffects(level: number) {
  if (level === 1) return [effect("invulnerability", "buff", 10)];
  if (level === -1) return [effect("invulnerability", "debuff", 10)];
  return [];
}

/** Body of `len` logical segments: a head plus a stacked tail column. */
function stackedBody(headX: number, tailX: number, len: number): Cell[] {
  return [{ x: headX, y: 5 }, ...Array.from({ length: len - 1 }, () => ({ x: tailX, y: 5 }))];
}

describe("head-to-head (game-engine/head-to-head-precedence#level-then-length-then-mutual-destruction)", () => {
  it("survivors are exactly the level-then-length filter's output", () => {
    fc.assert(
      fc.property(headToHeadArb, ({ levelA, levelB, lenA, lenB }) => {
        const snakes = [
          makeSnake({
            snakeId: sid(0),
            body: stackedBody(4, 3, lenA),
            activeEffects: levelEffects(levelA),
          }),
          makeSnake({
            snakeId: sid(1),
            centaurTeamId: tid("blue"),
            body: stackedBody(6, 7, lenB),
            activeEffects: levelEffects(levelB),
          }),
        ];
        const result = doResolve(
          makeState(snakes),
          stagedMoves([
            [0, Direction.Right],
            [1, Direction.Left],
          ]),
        );

        const survivors = headToHeadSurvivors([
          { level: levelA, length: lenA },
          { level: levelB, length: lenB },
        ]);
        const lengths = [lenA, lenB];

        for (const i of [0, 1]) {
          expect(snakeById(result.nextState, i).alive).toBe(survivors.includes(i));
        }
        const deaths = eventsOfKind(result.events, "snake_died");
        expect(deaths.every((d) => d.cause === "head_to_head")).toBe(true);
        expect([...deaths.map((d) => d.snakeId)].sort(byId)).toEqual(
          [0, 1].filter((i) => !survivors.includes(i)).map((i) => sid(i)),
        );
        // Losers' bodies remain on the board for the whole turn
        // (game-engine/head-to-head-precedence#withdrawal): the committed
        // loser still carries its snapshot body.
        for (const i of [0, 1]) {
          if (!survivors.includes(i)) {
            expect(snakeById(result.nextState, i).body.length).toBe(lengths[i]);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
