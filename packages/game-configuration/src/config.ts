// A game's configuration: exactly two disjoint halves and nothing else.
//
// The GAMEPLAY half is the engine's own vocabulary — the parameters, defaults
// and disable sentinels the engine defines for a game already under way —
// mirrored here by reference rather than restated, so the half a game is
// played from is handed to the engine without translation.
// spec: game-configuration/closed-parameter-vocabulary, game-configuration/engine-schema-fidelity
//
// The GENERATION half is this capability's own declaration. The engine
// declares no such parameter at all, because no turn's resolution reads one:
// it is handed a fully specified board, whose dimensions state its size and
// whose placed snakes state how many each team fields.
// spec: game-configuration/generation-parameters
import type {
  CentaurTeamId,
  GameRuntimeConfig,
  GameplayParameterDescriptor,
} from "@cyphid/snek-engine";
import { DEFAULT_RUNTIME_CONFIG } from "@cyphid/snek-engine";

/** The parameters that decide what a board looks like before its first turn. */
// The ranges are NOT written here: `GENERATION_PARAMETER_DESCRIPTORS` below is
// this capability's one declaration of them, and a comment restating a number
// is a second copy that no test can see drift.
// spec: game-configuration/generation-parameters
// spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
export interface BoardGenerationConfig {
  /** The generated board's edge length, wall ring included. */
  // spec: game-configuration/generated-board-shape
  readonly boardSize: number;
  // spec: game-configuration/initial-snakes
  readonly snakesPerTeam: number;
  /** Percentage of inner cells designated Hazard; 0 designates none. */
  // spec: game-configuration/hazards
  readonly hazardPercentage: number;
  // spec: game-configuration/fertile-ground
  readonly fertileGround: {
    /** Coverage; 0 disables fertile ground entirely. */
    readonly density: number;
    /** Patch coherence of the noise field. */
    readonly clustering: number;
  };
}

/** A game's complete configuration record. */
// spec: game-configuration/closed-parameter-vocabulary
export interface GameConfig {
  readonly generation: BoardGenerationConfig;
  readonly runtime: GameRuntimeConfig;
}

/** The generation half's defaults — this capability's own declaration. */
export const DEFAULT_GENERATION_CONFIG: BoardGenerationConfig = {
  boardSize: 21,
  snakesPerTeam: 5,
  hazardPercentage: 0,
  fertileGround: { density: 30, clustering: 10 },
};

/**
 * One board-generation parameter, described as data.
 *
 * Structurally the engine's own descriptor, and deliberately the same type
 * rather than a twin of it: a surface reflecting over both halves of the
 * vocabulary reads one shape, and the predicate that decides admissibility
 * (`isWithinGameplayBounds`) is the engine's one implementation for both.
 * What differs between the halves is who *declares* the numbers, not how they
 * are shaped or checked.
 */
export type GenerationParameterDescriptor = GameplayParameterDescriptor;

/**
 * The board-generation half's ranges and disable sentinels, as reflectable
 * data. **This is the sole declaration of these numbers anywhere** — the
 * engine's vocabulary carries none of them, because a turn's resolution reads
 * none of them, so there is no outer range to reconcile against and no second
 * copy to drift. Defaults are READ from `DEFAULT_GENERATION_CONFIG` rather
 * than restated beside it, for the same reason the engine reads its own.
 *
 * The roster-contextual tightening a surface may apply (does this board size
 * seat these teams' snakes?) is a derivation over this table and never a
 * second set of numbers.
 *
 * spec: game-configuration/generation-parameters
 * spec: game-configuration/parameter-bounds-sourcing#roster-tightens-generation-bounds
 */
export const GENERATION_PARAMETER_DESCRIPTORS: readonly GenerationParameterDescriptor[] = [
  {
    path: ["boardSize"],
    kind: "integer",
    min: 7,
    max: 32,
    default: DEFAULT_GENERATION_CONFIG.boardSize,
    disableSentinel: null,
  },
  {
    path: ["snakesPerTeam"],
    kind: "integer",
    min: 1,
    max: 10,
    default: DEFAULT_GENERATION_CONFIG.snakesPerTeam,
    disableSentinel: null,
  },
  {
    path: ["hazardPercentage"],
    kind: "integer",
    min: 0,
    max: 30,
    default: DEFAULT_GENERATION_CONFIG.hazardPercentage,
    disableSentinel: 0, // no hazards
  },
  {
    path: ["fertileGround", "density"],
    kind: "integer",
    min: 0,
    max: 90,
    default: DEFAULT_GENERATION_CONFIG.fertileGround.density,
    disableSentinel: 0, // fertile ground disabled
  },
  {
    path: ["fertileGround", "clustering"],
    kind: "integer",
    min: 1,
    max: 20,
    default: DEFAULT_GENERATION_CONFIG.fertileGround.clustering,
    disableSentinel: null,
  },
];

/**
 * A whole default configuration: this capability's generation defaults plus
 * the engine's gameplay defaults, read from the engine rather than restated so
 * a widget's limits and the record's threshold cannot disagree.
 */
// spec: game-configuration/parameter-bounds-sourcing
export const DEFAULT_GAME_CONFIG: GameConfig = {
  generation: DEFAULT_GENERATION_CONFIG,
  runtime: DEFAULT_RUNTIME_CONFIG,
};

/**
 * Whether a value is a plain record — the only interior node a configuration
 * tree has. A configuration is numbers in nested plain objects and nothing
 * else, which is what the closed vocabulary makes true and what lets every
 * walk over one be total.
 * spec: game-configuration/closed-parameter-vocabulary
 */
export const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The value at a descriptor's path within a configuration tree, or `undefined`
 * where the tree does not reach that far.
 *
 * The one walk over a descriptor's `path`: the validator reads a candidate with
 * it and an editing surface reads the stored record with it, so neither can
 * disagree with the other about where a declared parameter lives.
 * spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
 */
export function valueAtPath(tree: unknown, path: readonly string[]): unknown {
  let cursor: unknown = tree;
  for (const segment of path) {
    if (!isPlainRecord(cursor)) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/**
 * Why an all-or-nothing generation attempt gave up, after its bounded retry.
 * Generation never substitutes a board of its own: an infeasible parameter set
 * yields this instead.
 */
// spec: game-configuration/board-generation-retry, game-configuration/infeasibility-surfaced
export interface BoardGenerationFailure {
  readonly code: "HAZARD_CONNECTIVITY" | "TERRITORY_PARITY_SHORTAGE" | "INITIAL_FOOD_SHORTAGE";
  readonly attemptsUsed: 4;
  readonly details: {
    readonly centaurTeamId?: CentaurTeamId;
    readonly innerCellCount: number;
    readonly eligibleCellCount?: number;
  };
}
