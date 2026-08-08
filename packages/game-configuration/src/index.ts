// @cyphid/snek-game-configuration — the pre-launch shaping of a game.
//
// This package is the runtime-agnostic core of the `game-configuration`
// capability: the closed parameter vocabulary a game is configured with, and
// **the one shared implementation of the rules by which a board is built**.
// The engine plays a board it is handed and knows nothing of how one is made;
// everything that decides what a board looks like before its first turn is
// here (spec: game-configuration/generation-parameter-boundary).
//
// There is exactly ONE generator on the platform. A preview, a launched game,
// a fixture and the visual tester's generated session all call this code —
// a second implementation is forbidden however locally convenient, because
// two code paths over the same parameters and seed diverge only when someone
// compares the two boards (spec: global-invariants/one-shared-generation).
//
// The capability's persistent record, its validation surface and its preview
// workflow are not here yet: they belong to the runtimes that hold them, and
// arrive with `migrate-game-configuration`'s remaining implementation.

// The configuration vocabulary: the engine's gameplay half by reference, this
// capability's generation half by declaration.
export type {
  BoardGenerationConfig,
  BoardGenerationFailure,
  GameConfig,
  GenerationParameterDescriptor,
} from "./config.js";
export {
  DEFAULT_GAME_CONFIG,
  DEFAULT_GENERATION_CONFIG,
  GENERATION_PARAMETER_DESCRIPTORS,
} from "./config.js";

// Authoritative validation of a whole configuration record — the rules the
// configuration record enforces and an editing surface reflects, so neither
// owns them (spec: game-configuration/closed-parameter-vocabulary,
// game-configuration/parameter-bounds-sourcing,
// game-configuration/bounded-game-duration).
export type { ConfigViolation, ConfigurationHalf, GameConfigValidation } from "./validate.js";
export { changesGenerationInputs, validateGameConfig } from "./validate.js";

// The generator itself — all-or-nothing over a bounded retry.
export { generateBoardAndInitialState } from "./boardgen.js";
export type { GeneratedInitialState, TeamRegistration } from "./boardgen.js";
