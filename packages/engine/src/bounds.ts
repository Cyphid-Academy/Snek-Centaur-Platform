// The engine's gameplay parameter bounds, published as reflectable data.
//
// spec: game-engine/configuration-parameters — the ranges, defaults and
// disable sentinels this table carries are that requirement's table, stated
// once. Publishing them changes nothing about where they are ENFORCED: the
// engine still accepts any type-valid configuration and rejects nothing on
// range grounds (#bounds-live-at-the-surfaces). Nothing in this file
// validates; it only describes.
//
// It exists because the surfaces that DO enforce — the configuration
// record's validator and the editing surface's widgets — must read one
// declaration rather than restate it, and a prose comment on a field of
// GameRuntimeConfig cannot be read by code
// (spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree).
//
// Defaults are READ from DEFAULT_RUNTIME_CONFIG, never restated here, so a
// changed default cannot disagree with the descriptor that reports it.
import { DEFAULT_RUNTIME_CONFIG } from "./types.js";

/**
 * How a parameter's values are drawn: whole milliseconds/points versus a
 * fractional per-turn rate. Consumers use it to pick an input widget and an
 * integrality check; the engine reads neither.
 */
export type GameplayParameterKind = "integer" | "rate";

/** One gameplay parameter of `GameRuntimeConfig`, described as data. */
export interface GameplayParameterDescriptor {
  /**
   * The parameter's path in the configuration tree, e.g.
   * `["clock", "maxTurnTimeMs"]`. A one-element path is a top-level field.
   */
  readonly path: readonly [string, ...string[]];
  readonly kind: GameplayParameterKind;
  /** Inclusive lower bound of the range of values that ENABLE the feature. */
  readonly min: number;
  /** Inclusive upper bound of that same range. */
  readonly max: number;
  /** The value `DEFAULT_RUNTIME_CONFIG` holds at `path`. */
  readonly default: number;
  /**
   * The value that disables the feature, or `null` where the parameter has
   * no disabled state. It is admissible in ADDITION to `[min, max]` — for
   * `maxTurns` and `maxGameDurationMs` it lies outside that range, which is
   * why a bare min/max pair cannot express these two parameters at all. For
   * the spawn rates and the initial budget the sentinel is the range's own
   * lower end and the extra admission is a no-op.
   * spec: game-engine/configuration-parameters#disable-sentinels
   */
  readonly disableSentinel: number | null;
}

// The table. Ordered as GameRuntimeConfig declares its fields; nested
// subtrees follow their parent. Every leaf of GameRuntimeConfig appears
// exactly once — bounds.test.ts walks DEFAULT_RUNTIME_CONFIG to hold that.
// spec: game-engine/configuration-parameters
export const GAMEPLAY_PARAMETER_DESCRIPTORS: readonly GameplayParameterDescriptor[] = [
  {
    path: ["maxHealth"],
    kind: "integer",
    min: 1,
    max: 500,
    default: DEFAULT_RUNTIME_CONFIG.maxHealth,
    disableSentinel: null,
  },
  {
    path: ["maxTurns"],
    kind: "integer",
    min: 1,
    max: 1000,
    default: DEFAULT_RUNTIME_CONFIG.maxTurns,
    disableSentinel: 0, // no turn limit
  },
  {
    path: ["maxGameDurationMs"],
    kind: "integer",
    min: 1000,
    max: 86400000,
    default: DEFAULT_RUNTIME_CONFIG.maxGameDurationMs,
    disableSentinel: 0, // no time limit
  },
  {
    path: ["hazardDamage"],
    kind: "integer",
    min: 1,
    max: 100,
    default: DEFAULT_RUNTIME_CONFIG.hazardDamage,
    disableSentinel: null,
  },
  {
    path: ["foodSpawnRate"],
    kind: "rate",
    min: 0,
    max: 5,
    default: DEFAULT_RUNTIME_CONFIG.foodSpawnRate,
    disableSentinel: 0, // no food spawns
  },
  {
    path: ["invulnPotionSpawnRate"],
    kind: "rate",
    min: 0,
    max: 0.2,
    default: DEFAULT_RUNTIME_CONFIG.invulnPotionSpawnRate,
    disableSentinel: 0, // no invulnerability potions
  },
  {
    path: ["invisPotionSpawnRate"],
    kind: "rate",
    min: 0,
    max: 0.2,
    default: DEFAULT_RUNTIME_CONFIG.invisPotionSpawnRate,
    disableSentinel: 0, // no invisibility potions
  },
  {
    path: ["clock", "initialBudgetMs"],
    kind: "integer",
    min: 0,
    max: 600000,
    default: DEFAULT_RUNTIME_CONFIG.clock.initialBudgetMs,
    disableSentinel: 0, // no initial budget
  },
  {
    path: ["clock", "budgetIncrementMs"],
    kind: "integer",
    min: 100,
    max: 5000,
    default: DEFAULT_RUNTIME_CONFIG.clock.budgetIncrementMs,
    disableSentinel: null,
  },
  {
    path: ["clock", "firstTurnTimeMs"],
    kind: "integer",
    min: 1000,
    max: 300000,
    default: DEFAULT_RUNTIME_CONFIG.clock.firstTurnTimeMs,
    disableSentinel: null,
  },
  {
    path: ["clock", "maxTurnTimeMs"],
    kind: "integer",
    min: 100,
    max: 300000,
    default: DEFAULT_RUNTIME_CONFIG.clock.maxTurnTimeMs,
    disableSentinel: null,
  },
];

/** A descriptor's path in dotted form, e.g. `"clock.maxTurnTimeMs"`. */
export function gameplayParameterKey(descriptor: GameplayParameterDescriptor): string {
  return descriptor.path.join(".");
}

const BY_KEY: ReadonlyMap<string, GameplayParameterDescriptor> = new Map(
  GAMEPLAY_PARAMETER_DESCRIPTORS.map((d) => [gameplayParameterKey(d), d]),
);

/**
 * Look a descriptor up by dotted path (`"clock.maxTurnTimeMs"`). Throws on
 * an unknown path rather than returning undefined: a caller naming a
 * parameter that does not exist has a bug now, not a value to fall back on.
 */
export function gameplayParameter(key: string): GameplayParameterDescriptor {
  const found = BY_KEY.get(key);
  if (found === undefined) throw new Error(`unknown gameplay parameter: ${key}`);
  return found;
}

/**
 * Whether a value is admissible for a parameter: inside the declared range,
 * or exactly the disable sentinel. This is the predicate a configuration
 * surface enforces WITH — the engine itself calls it nowhere
 * (spec: game-engine/configuration-parameters#bounds-live-at-the-surfaces).
 */
export function isWithinGameplayBounds(
  descriptor: GameplayParameterDescriptor,
  value: number,
): boolean {
  if (value === descriptor.disableSentinel) return true;
  return value >= descriptor.min && value <= descriptor.max;
}
