// Shared fast-check arbitraries and outcome predictors for the engine's
// property suites. fast-check's reusable fixture unit is the Arbitrary —
// stateless and composable, designed to be shared across properties — so
// the domain's arbitraries live here, next to testkit.ts, and every
// property file draws from the same definitions.
//
// Configuration parameters are generated from their FULL documented ranges
// (game-rules/configuration-parameters, mirrored in CONFIG_RANGES):
// fast-check biases toward range boundaries, so narrowing ranges by hand
// hides exactly the extreme cases property testing is best at finding.
// Bounds that exist only to keep test wall-clock in check (turn budgets,
// run counts) are the callers' explicit harness constants — never baked
// into these arbitraries. Not part of the package's public API.
import * as fc from "fast-check";
import { tid } from "./testkit.js";
import type {
  GameConfig,
  GameOrchestrationConfig,
  GameRuntimeConfig,
  TurnNumber,
} from "./types.js";

// Full documented parameter ranges. spec: game-rules/configuration-parameters
export const CONFIG_RANGES = {
  boardSize: { min: 7, max: 32 },
  snakesPerTeam: { min: 1, max: 10 },
  maxHealth: { min: 1, max: 500 },
  maxTurns: { min: 1, max: 1000 }, // 0 is the no-limit sentinel, drawn separately
  hazardPercentage: { min: 0, max: 30 },
  hazardDamage: { min: 1, max: 100 },
  fertileDensity: { min: 0, max: 90 },
  fertileClustering: { min: 1, max: 20 },
  foodSpawnRate: { min: 0, max: 5 },
  potionSpawnRate: { min: 0, max: 0.2 },
  initialBudgetMs: { min: 0, max: 600000 },
  budgetIncrementMs: { min: 100, max: 5000 },
  firstTurnTimeMs: { min: 1000, max: 300000 },
  maxTurnTimeMs: { min: 100, max: 300000 },
} as const;

const int = (r: { min: number; max: number }) => fc.integer({ min: r.min, max: r.max });
const rate = (r: { min: number; max: number }) =>
  fc.double({ min: r.min, max: r.max, noNaN: true, noDefaultInfinity: true });

export const orchestrationConfigArb: fc.Arbitrary<GameOrchestrationConfig> = fc.record({
  boardSize: int(CONFIG_RANGES.boardSize),
  snakesPerTeam: int(CONFIG_RANGES.snakesPerTeam),
  hazardPercentage: int(CONFIG_RANGES.hazardPercentage),
  fertileGround: fc.record({
    density: int(CONFIG_RANGES.fertileDensity),
    clustering: int(CONFIG_RANGES.fertileClustering),
  }),
});

export const runtimeConfigArb: fc.Arbitrary<GameRuntimeConfig> = fc.record({
  maxHealth: int(CONFIG_RANGES.maxHealth),
  maxTurns: fc.oneof(fc.constant(0), int(CONFIG_RANGES.maxTurns)), // 0 = no turn limit
  hazardDamage: int(CONFIG_RANGES.hazardDamage),
  foodSpawnRate: rate(CONFIG_RANGES.foodSpawnRate),
  invulnPotionSpawnRate: rate(CONFIG_RANGES.potionSpawnRate),
  invisPotionSpawnRate: rate(CONFIG_RANGES.potionSpawnRate),
  clock: fc.record({
    initialBudgetMs: int(CONFIG_RANGES.initialBudgetMs),
    budgetIncrementMs: int(CONFIG_RANGES.budgetIncrementMs),
    firstTurnTimeMs: int(CONFIG_RANGES.firstTurnTimeMs),
    maxTurnTimeMs: int(CONFIG_RANGES.maxTurnTimeMs),
  }),
});

export const gameConfigArb: fc.Arbitrary<GameConfig> = fc.record({
  orchestration: orchestrationConfigArb,
  runtime: runtimeConfigArb,
});

/** Any 32-byte game seed — not just the fill-byte seeds of testkit's seed(). */
export const gameSeedArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({
  minLength: 32,
  maxLength: 32,
});

// Team count is not a configuration parameter (teams are registrations);
// the supported range exercised by the suites is 2-6 teams.
export const TEAM_POOL = ["red", "blue", "green", "gold", "violet", "cyan"].map((name) => ({
  centaurTeamId: tid(name),
  name: name[0]?.toUpperCase() + name.slice(1),
}));
export const teamsArb = fc
  .integer({ min: 2, max: TEAM_POOL.length })
  .map((n) => TEAM_POOL.slice(0, n));

/** Derived invulnerability levels (game-rules/collisions-and-severing). */
export const invulnLevelArb = fc.constantFrom(-1, 0, 1);

// ---------------------------------------------------------------------------
// Outcome predictors — independent re-statements of spec'd outcomes that
// properties compare the resolver against.
// ---------------------------------------------------------------------------

/**
 * game-rules/head-to-head-precedence#level-then-length-then-mutual-destruction:
 * occupants below max level die; among the rest, below max length die; two
 * or more finalists all die. Returns the indices of survivors (0 or 1 of
 * them).
 */
export function headToHeadSurvivors(
  occupants: ReadonlyArray<{ level: number; length: number }>,
): number[] {
  const maxLevel = Math.max(...occupants.map((o) => o.level));
  const candidates = occupants.flatMap((o, i) => (o.level === maxLevel ? [i] : []));
  const maxLen = Math.max(...candidates.map((i) => (occupants[i] as { length: number }).length));
  const finalists = candidates.filter((i) => occupants[i]?.length === maxLen);
  return finalists.length === 1 ? finalists : [];
}

/**
 * game-rules/health-and-starvation: a heal claim resolves to maxHealth;
 * otherwise snapshot health minus tick and any hazard damage, dead at <= 0.
 */
export function predictedHealth(input: {
  health: number;
  ate: boolean;
  onHazard: boolean;
  hazardDamage: number;
  maxHealth: number;
}): { health: number; alive: boolean } {
  if (input.ate) return { health: input.maxHealth, alive: true };
  const resolved = input.health - 1 - (input.onHazard ? input.hazardDamage : 0);
  return { health: resolved, alive: resolved > 0 };
}

/** Effect expiry turn for a rebuild at turn T (game-rules/team-potion-effects). */
export function expiryFor(collectionTurn: TurnNumber): TurnNumber {
  return (collectionTurn + 3) as TurnNumber;
}
