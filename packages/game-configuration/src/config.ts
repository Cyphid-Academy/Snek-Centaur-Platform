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
import type { CentaurTeamId, GameRuntimeConfig } from "@cyphid/snek-engine";
import { DEFAULT_RUNTIME_CONFIG } from "@cyphid/snek-engine";

/** The parameters that decide what a board looks like before its first turn. */
// spec: game-configuration/generation-parameters
export interface BoardGenerationConfig {
  /** 7-32, default 21 — the generated board's edge length, wall ring included. */
  // spec: game-configuration/generated-board-shape
  readonly boardSize: number;
  /** 1-10, default 5. */
  // spec: game-configuration/initial-snakes
  readonly snakesPerTeam: number;
  /** 0-30, default 0 — percentage of inner cells designated Hazard. */
  // spec: game-configuration/hazards
  readonly hazardPercentage: number;
  // spec: game-configuration/fertile-ground
  readonly fertileGround: {
    /** 0-90, default 30. 0 disables fertile ground entirely. */
    readonly density: number;
    /** 1-20, default 10 — patch coherence of the noise field. */
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
