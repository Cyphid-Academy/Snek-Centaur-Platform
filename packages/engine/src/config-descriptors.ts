// Public, reflectable declaration of the engine's own configuration
// vocabulary: exactly the parameters a turn's resolution reads, with their
// ranges, defaults and disable sentinels, exported as DATA rather than as
// prose comments or an unpublished test fixture.
// spec: game-engine/configuration-parameters
//
// This is declared data only — the engine still performs no validation of
// it (`game-engine/configuration-parameters#bounds-live-at-the-surfaces`).
// The point of exporting it is that every surface which DOES enforce or
// present a bound reads it from here rather than restating it:
// `game-configuration/parameter-bounds-sourcing` requires the configuration
// capability's validator and editing widgets to derive from this table, and
// `CONFIG_RANGES` below (arbitraries.ts) is this package's own first
// consumer of that same rule.
import { DEFAULT_RUNTIME_CONFIG } from "./types.js";

/**
 * One parameter's declared shape: where it lives in the configuration tree,
 * what kind of number it is, its live (non-sentinel) range, its default, and
 * — for parameters a sentinel value disables — that sentinel.
 */
export interface ParameterDescriptor {
  /** Dotted path into `GameRuntimeConfig`, e.g. "clock.initialBudgetMs". */
  readonly path: string;
  readonly kind: "integer" | "number";
  /** The live range's lower bound. A disable sentinel may fall outside it. */
  readonly min: number;
  /** The live range's upper bound. */
  readonly max: number;
  readonly default: number;
  /** Present only for parameters a single value disables entirely. */
  readonly disableSentinel?: number;
}

/**
 * Exactly the fields of `GameRuntimeConfig`, one descriptor per leaf path.
 * Ranges, defaults and sentinels are the table from
 * `game-engine/configuration-parameters` — this is that table as data.
 */
export const RUNTIME_PARAMETER_DESCRIPTORS: ReadonlyArray<ParameterDescriptor> = [
  {
    path: "maxHealth",
    kind: "integer",
    min: 1,
    max: 500,
    default: DEFAULT_RUNTIME_CONFIG.maxHealth,
  },
  {
    path: "maxTurns",
    kind: "integer",
    min: 1,
    max: 1000,
    default: DEFAULT_RUNTIME_CONFIG.maxTurns,
    disableSentinel: 0, // 0 = no turn limit
  },
  {
    path: "maxGameDurationMs",
    kind: "integer",
    min: 1000,
    max: 86400000,
    default: DEFAULT_RUNTIME_CONFIG.maxGameDurationMs,
    disableSentinel: 0, // 0 = no time limit
  },
  {
    path: "hazardDamage",
    kind: "integer",
    min: 1,
    max: 100,
    default: DEFAULT_RUNTIME_CONFIG.hazardDamage,
  },
  {
    path: "foodSpawnRate",
    kind: "number",
    min: 0,
    max: 5,
    default: DEFAULT_RUNTIME_CONFIG.foodSpawnRate,
    disableSentinel: 0, // 0 = no food spawns
  },
  {
    path: "invulnPotionSpawnRate",
    kind: "number",
    min: 0,
    max: 0.2,
    default: DEFAULT_RUNTIME_CONFIG.invulnPotionSpawnRate,
    disableSentinel: 0, // 0 = no invulnerability potions
  },
  {
    path: "invisPotionSpawnRate",
    kind: "number",
    min: 0,
    max: 0.2,
    default: DEFAULT_RUNTIME_CONFIG.invisPotionSpawnRate,
    disableSentinel: 0, // 0 = no invisibility potions
  },
  {
    path: "clock.initialBudgetMs",
    kind: "integer",
    min: 0,
    max: 600000,
    default: DEFAULT_RUNTIME_CONFIG.clock.initialBudgetMs,
    disableSentinel: 0, // 0 = no initial budget
  },
  {
    path: "clock.budgetIncrementMs",
    kind: "integer",
    min: 100,
    max: 5000,
    default: DEFAULT_RUNTIME_CONFIG.clock.budgetIncrementMs,
  },
  {
    path: "clock.firstTurnTimeMs",
    kind: "integer",
    min: 1000,
    max: 300000,
    default: DEFAULT_RUNTIME_CONFIG.clock.firstTurnTimeMs,
  },
  {
    path: "clock.maxTurnTimeMs",
    kind: "integer",
    min: 100,
    max: 300000,
    default: DEFAULT_RUNTIME_CONFIG.clock.maxTurnTimeMs,
  },
];

/** Look up a descriptor by its dotted path. Throws if the path is unknown. */
export function descriptorFor(path: string): ParameterDescriptor {
  const found = RUNTIME_PARAMETER_DESCRIPTORS.find((d) => d.path === path);
  if (!found) throw new Error(`no parameter descriptor for path "${path}"`);
  return found;
}
