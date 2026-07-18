// Property tests for the staged turn-resolution model, driven by fast-check
// over configurations drawn from the FULL documented parameter ranges, 2-6
// teams, and arbitrary seeds (see arbitraries.ts):
// 1. Rule-order independence (game-rules/turn-resolution-model#order-independence): any
//    permutation of the interaction rules yields an identical TurnResolution
//    across whole fuzzed games.
// 2. Multi-turn structural invariants: every reachable state honours the
//    per-family effect bound, the effect expiry window, health bounds, and
//    head uniqueness; events arrive in canonical class order.
// 3. Item identity (game-rules/item-identity#ids-never-collide): the (spawnTurn, spawnIndex)
//    pair is never re-issued, never moves, and keys its own cell; and
//    re-resolving a turn emits an identical event sequence
//    (game-rules/turn-events#deterministic-order).
// Directed coverage of the interesting paths (potions guaranteed to be
// collected, exact health/head-to-head outcomes) lives in
// resolve-rules-properties.test.ts via constructive generators.
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { gameConfigArb, gameSeedArb, teamsArb } from "./arbitraries.js";
import { cellIndex } from "./board.js";
import type { TeamRegistration } from "./boardgen.js";
import { generateBoardAndInitialState } from "./boardgen.js";
import { EFFECT_DURATION_TURNS } from "./effects.js";
import { itemIdOf, itemsByCell } from "./items.js";
import { resolveTurn, resolveTurnWithRules } from "./resolve/index.js";
import type { InteractionRule } from "./resolve/rules.js";
import { INTERACTION_RULES } from "./resolve/rules.js";
import { rngFromSeed, subSeed } from "./rng.js";
import { seed } from "./testkit.js";
import type { GameConfig, GameState, TurnEvent, TurnNumber } from "./types.js";

// Harness bound, NOT a spec range: maxTurns is generated from its full
// documented range, but each fuzzed game simulates at most this many turns
// to keep wall-clock in check. Games still end earlier on any win condition
// or a smaller generated maxTurns.
const SIMULATED_TURN_BUDGET = 25;

const EVENT_CLASS_ORDER: ReadonlyArray<TurnEvent["kind"]> = [
  "snake_moved",
  "snake_died",
  "snake_severed",
  "food_eaten",
  "potion_collected",
  "food_spawned",
  "potion_spawned",
  "effect_applied",
  "effect_cancelled",
];

const fuzzArb = fc.record({
  config: gameConfigArb,
  teams: teamsArb,
  gameSeed: gameSeedArb,
});
interface FuzzDraw {
  config: GameConfig;
  teams: TeamRegistration[];
  gameSeed: Uint8Array;
}

function initialState(draw: FuzzDraw): GameState | null {
  const generated = generateBoardAndInitialState(draw.config, draw.teams, draw.gameSeed);
  if ("code" in generated) return null;
  return {
    board: generated.board,
    snakes: generated.snakes,
    items: itemsByCell(generated.board, generated.items),
    clocks: [],
  };
}

function shuffledRules(seedN: number): InteractionRule[] {
  const rules = [...INTERACTION_RULES];
  rngFromSeed(seed(seedN)).shuffle(rules);
  return rules;
}

function turnsToSimulate(config: GameConfig): number {
  const { maxTurns } = config.runtime;
  return maxTurns === 0 ? SIMULATED_TURN_BUDGET : Math.min(maxTurns, SIMULATED_TURN_BUDGET);
}

/** Run a fuzz game turn-by-turn, invoking `check` after every resolution. */
function playFuzzGame(
  draw: FuzzDraw,
  rules: ReadonlyArray<InteractionRule> | null,
  check?: (state: GameState, events: ReadonlyArray<TurnEvent>, t: number) => void,
): { turns: number; events: TurnEvent[][] } | null {
  const initial = initialState(draw);
  if (initial === null) return null; // infeasible draw — discard via fc.pre
  let state: GameState = initial;
  const events: TurnEvent[][] = [];
  const budget = turnsToSimulate(draw.config);
  for (let t = 0; t < budget; t++) {
    const turnSeed = subSeed(draw.gameSeed, `turn:${t}`);
    const result =
      rules === null
        ? resolveTurn(state, new Map(), t as TurnNumber, turnSeed, draw.config.runtime)
        : resolveTurnWithRules(
            rules,
            state,
            new Map(),
            t as TurnNumber,
            turnSeed,
            draw.config.runtime,
          );
    state = result.nextState;
    events.push([...result.events]);
    check?.(state, result.events, t);
    if (result.outcome.kind !== "in_progress") return { turns: t + 1, events };
  }
  return { turns: budget, events };
}

describe("rule-order independence (game-rules/turn-resolution-model#order-independence)", () => {
  it("yields identical whole-game results under shuffled interaction-rule orders", () => {
    fc.assert(
      fc.property(fuzzArb, fc.integer({ min: 1, max: 1000 }), (draw, shuffleSeedN) => {
        const baseline = playFuzzGame(draw, null);
        fc.pre(baseline !== null);
        const shuffled = playFuzzGame(draw, shuffledRules(shuffleSeedN));
        expect(shuffled).toEqual(baseline);
      }),
      { numRuns: 6 },
    );
  });
});

describe("multi-turn structural invariants", () => {
  it("holds the invariants on every turn of fuzzed games", () => {
    fc.assert(
      fc.property(fuzzArb, (draw) => {
        const played = playFuzzGame(draw, null, (state, events, t) => {
          const headCells = new Set<string>();
          for (const snake of state.snakes) {
            // ≤1 active effect per family (game-rules/team-potion-effects)
            const families = snake.activeEffects.map((e) => e.family);
            expect(new Set(families).size).toBe(families.length);
            // No effect may outlive its window (game-rules/team-potion-effects#three-turn-expiry)
            for (const e of snake.activeEffects) {
              expect(e.expiryTurn).toBeGreaterThan(t);
              expect(e.expiryTurn).toBeLessThanOrEqual(t + EFFECT_DURATION_TURNS);
            }
            if (!snake.alive) continue;
            // Alive snakes: non-empty body, health in (0, maxHealth]
            expect(snake.body.length).toBeGreaterThanOrEqual(1);
            expect(snake.health).toBeGreaterThan(0);
            expect(snake.health).toBeLessThanOrEqual(draw.config.runtime.maxHealth);
            // Alive heads pairwise distinct (game-rules/head-to-head-precedence#unique-entrancy)
            const head = snake.body[0];
            const key = `${head?.x},${head?.y}`;
            expect(headCells.has(key)).toBe(false);
            headCells.add(key);
          }
          // Events arrive in canonical class order (game-rules/turn-events)
          const ranks = events.map((e) => EVENT_CLASS_ORDER.indexOf(e.kind));
          expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
          // At most one death event per snake
          const deathIds = events
            .filter((e) => e.kind === "snake_died")
            .map((e) => (e as Extract<TurnEvent, { kind: "snake_died" }>).snakeId);
          expect(new Set(deathIds).size).toBe(deathIds.length);
        });
        fc.pre(played !== null);
      }),
      { numRuns: 10 },
    );
  });

  it("never re-issues an item identity and keys every item by its own cell", () => {
    fc.assert(
      fc.property(fuzzArb, (draw) => {
        // Once an identity leaves the board (consumed) it must never
        // reappear (game-rules/item-identity#ids-never-collide), and every map entry must
        // sit under its own cell's index (game-rules/item-identity#one-item-per-cell).
        const everSeen = new Map<string, string>(); // identity -> home cell
        const departed = new Set<string>();
        const played = playFuzzGame(draw, null, (state) => {
          const presentIds = new Set<string>();
          for (const [key, item] of state.items) {
            const id = itemIdOf(item);
            expect(key).toBe(cellIndex(state.board, item.cell));
            expect(presentIds.has(id)).toBe(false); // identities unique on board
            presentIds.add(id);
            expect(departed.has(id)).toBe(false); // no resurrection
            const home = `${item.cell.x},${item.cell.y}`;
            const prior = everSeen.get(id);
            if (prior !== undefined) expect(prior).toBe(home); // identities never move
            everSeen.set(id, home);
          }
          for (const id of everSeen.keys()) {
            if (!presentIds.has(id)) departed.add(id);
          }
        });
        fc.pre(played !== null);
      }),
      { numRuns: 8 },
    );
  });

  it("re-resolving any turn emits an identical event sequence (game-rules/turn-events#deterministic-order)", () => {
    fc.assert(
      fc.property(fuzzArb, (draw) => {
        let state = initialState(draw);
        fc.pre(state !== null);
        const budget = Math.min(turnsToSimulate(draw.config), 10);
        for (let t = 0; t < budget && state !== null; t++) {
          const turnSeed = subSeed(draw.gameSeed, `turn:${t}`);
          const once = resolveTurn(
            state,
            new Map(),
            t as TurnNumber,
            turnSeed,
            draw.config.runtime,
          );
          const twice = resolveTurn(
            state,
            new Map(),
            t as TurnNumber,
            turnSeed,
            draw.config.runtime,
          );
          expect(twice.events).toEqual(once.events);
          expect(twice.nextState).toEqual(once.nextState);
          state = once.outcome.kind === "in_progress" ? once.nextState : null;
        }
      }),
      { numRuns: 5 },
    );
  });
});
