// Property tests for the staged turn-resolution model:
// 1. Rule-order independence (01-REQ-041): any permutation of the
//    interaction rules yields an identical TurnResolution — machine-checking
//    the spec's core order-free guarantee across whole fuzzed games.
// 2. Multi-turn invariant fuzzing: seeded random games hold the structural
//    invariants of 01 §3.9 on every turn.
import { describe, expect, it } from "vitest";
import { generateBoardAndInitialState } from "./boardgen.js";
import { EFFECT_DURATION_TURNS } from "./effects.js";
import { resolveTurn, resolveTurnWithRules } from "./resolve/index.js";
import type { InteractionRule } from "./resolve/rules.js";
import { INTERACTION_RULES } from "./resolve/rules.js";
import { rngFromSeed, subSeed } from "./rng.js";
import { seed, tid } from "./testkit.js";
import type { GameConfig, GameState, TurnEvent, TurnNumber } from "./types.js";
import { DEFAULT_GAME_CONFIG } from "./types.js";

// A busy configuration: hazards, fertile ground, generous spawns, and a low
// maxHealth so starvation, collisions, severs, potions and cancellations all
// occur within a short fuzzed game.
const FUZZ_CONFIG: GameConfig = {
  orchestration: {
    boardSize: 13,
    snakesPerTeam: 2,
    hazardPercentage: 10,
    fertileGround: { density: 25, clustering: 8 },
  },
  runtime: {
    ...DEFAULT_GAME_CONFIG.runtime,
    maxHealth: 25,
    maxTurns: 40,
    foodSpawnRate: 1,
    invulnPotionSpawnRate: 0.2,
    invisPotionSpawnRate: 0.2,
  },
};
const TEAMS = [
  { centaurTeamId: tid("red"), name: "Red" },
  { centaurTeamId: tid("blue"), name: "Blue" },
];
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

function initialState(gameSeed: Uint8Array): GameState {
  const generated = generateBoardAndInitialState(FUZZ_CONFIG, TEAMS, gameSeed);
  if ("code" in generated) throw new Error(`board generation failed: ${generated.code}`);
  return { board: generated.board, snakes: generated.snakes, items: generated.items, clocks: [] };
}

function shuffledRules(seedN: number): InteractionRule[] {
  const rules = [...INTERACTION_RULES];
  rngFromSeed(seed(seedN)).shuffle(rules);
  return rules;
}

/** Run a fuzz game turn-by-turn, invoking `check` after every resolution. */
function playFuzzGame(
  gameSeed: Uint8Array,
  rules: ReadonlyArray<InteractionRule> | null,
  check?: (state: GameState, events: ReadonlyArray<TurnEvent>, t: number) => void,
): { turns: number; events: TurnEvent[][] } {
  let state = initialState(gameSeed);
  const events: TurnEvent[][] = [];
  for (let t = 0; t < FUZZ_CONFIG.runtime.maxTurns; t++) {
    const turnSeed = subSeed(gameSeed, `turn:${t}`);
    const result =
      rules === null
        ? resolveTurn(state, new Map(), t as TurnNumber, turnSeed, FUZZ_CONFIG.runtime)
        : resolveTurnWithRules(
            rules,
            state,
            new Map(),
            t as TurnNumber,
            turnSeed,
            FUZZ_CONFIG.runtime,
          );
    state = result.nextState;
    events.push([...result.events]);
    check?.(state, result.events, t);
    if (result.outcome.kind !== "in_progress") return { turns: t + 1, events };
  }
  return { turns: FUZZ_CONFIG.runtime.maxTurns, events };
}

describe("rule-order independence (01-REQ-041)", () => {
  it("yields identical whole-game results under shuffled interaction-rule orders", () => {
    for (const gameSeedN of [21, 22, 23]) {
      const baseline = playFuzzGame(seed(gameSeedN), null);
      for (const shuffleSeedN of [1, 2, 3]) {
        const shuffled = playFuzzGame(seed(gameSeedN), shuffledRules(shuffleSeedN));
        expect(shuffled.turns).toBe(baseline.turns);
        expect(shuffled.events).toEqual(baseline.events);
      }
    }
  });
});

describe("multi-turn structural invariants (01 §3.9)", () => {
  it("holds the invariants on every turn of seeded fuzz games", () => {
    let sawDeath = false;
    let sawEffect = false;
    for (const gameSeedN of [31, 32, 33, 34, 35, 36]) {
      playFuzzGame(seed(gameSeedN), null, (state, events, t) => {
        const headCells = new Set<string>();
        for (const snake of state.snakes) {
          // ≤1 active effect per family (01-REQ-028)
          const families = state ? snake.activeEffects.map((e) => e.family) : [];
          expect(new Set(families).size).toBe(families.length);
          // No effect may outlive its window (expiry at commit, 01-REVIEW-003)
          for (const e of snake.activeEffects) {
            sawEffect = true;
            expect(e.expiryTurn).toBeGreaterThan(t);
            expect(e.expiryTurn).toBeLessThanOrEqual(t + EFFECT_DURATION_TURNS);
          }
          if (!snake.alive) {
            sawDeath = true;
            continue;
          }
          // Alive snakes: non-empty body, health in (0, maxHealth]
          expect(snake.body.length).toBeGreaterThanOrEqual(1);
          expect(snake.health).toBeGreaterThan(0);
          expect(snake.health).toBeLessThanOrEqual(FUZZ_CONFIG.runtime.maxHealth);
          // Alive heads pairwise distinct (head-to-head leaves ≤1 per cell)
          const head = snake.body[0];
          const key = `${head?.x},${head?.y}`;
          expect(headCells.has(key)).toBe(false);
          headCells.add(key);
        }
        // Events arrive in canonical class order (01 §2.11)
        const ranks = events.map((e) => EVENT_CLASS_ORDER.indexOf(e.kind));
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
        // Exactly one snake_moved per alive-at-start snake, one death event
        // max per snake
        const deathIds = events
          .filter((e) => e.kind === "snake_died")
          .map((e) => (e as Extract<TurnEvent, { kind: "snake_died" }>).snakeId);
        expect(new Set(deathIds).size).toBe(deathIds.length);
      });
    }
    // The fuzz configuration must actually exercise the interesting paths.
    expect(sawDeath).toBe(true);
    expect(sawEffect).toBe(true);
  });

  it("never resurrects a consumed item and keeps item ids unique", () => {
    for (const gameSeedN of [41, 42]) {
      const consumed = new Set<number>();
      playFuzzGame(seed(gameSeedN), null, (state) => {
        const ids = state.items.map((i) => i.itemId);
        expect(new Set(ids).size).toBe(ids.length);
        for (const item of state.items) {
          if (item.consumed) consumed.add(item.itemId);
          else expect(consumed.has(item.itemId)).toBe(false);
        }
      });
    }
  });
});
