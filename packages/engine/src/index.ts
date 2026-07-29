// @cyphid/snek-engine — the shared game engine.
// spec: global-invariants/one-shared-engine — single shared codebase
// exporting the game-engine type vocabulary and the staged turn resolver,
// consumed by the SpacetimeDB module (authoritative), the Centaur Server
// library (simulation), and web clients (pre-validation/rendering).
//
// The export list mirrors the engine's exported-interface surface. Everything
// else in this package is module-internal detail.
//
// The engine is handed a fully specified board and plays it: nothing here
// builds one. Board generation and the parameters that drive it are
// @cyphid/snek-game-configuration's (spec: game-configuration/generation-parameters).

// Enums, branded ids, Agent, derived effect values
export { CellType, DEFAULT_RUNTIME_CONFIG, Direction, ItemType } from "./types.js";
export type {
  Agent,
  Cell,
  CellIndex,
  CentaurTeamId,
  EffectFamily,
  EffectState,
  ItemId,
  SnakeId,
  TurnNumber,
  UserId,
} from "./types.js";
export { invulnerabilityLevel, isVisible } from "./effects.js";

// State shapes (itemsByCell/itemAt bridge the flat wire form of present items
// to the logical cell-keyed map). A PartialGameState permits a snake's turn to
// lag; a GameState is the lockstep case every runtime persists.
export type {
  Board,
  BoardOccupant,
  CentaurTeamClockState,
  GameState,
  ItemsByCell,
  FoodItem,
  Item,
  ItemBase,
  PartialGameState,
  PotionItem,
  PotionType,
  PotionEffect,
  ProjectedSnake,
  SnakeCore,
  SnakeState,
} from "./types.js";
// SETUP_SPAWN_TURN is the boundary at which an item placed before the first
// turn exists — the engine's vocabulary, read by whoever places one.
// spec: game-engine/item-identity
export { SETUP_SPAWN_TURN, itemAt, itemsByCell } from "./items.js";

// The two grains of "turn", and the narrowing that is the only way to obtain
// the persisted state form. spec: game-engine/domain-vocabulary
export {
  asGameState,
  currentTurn,
  isLockstep,
  narrowToGameState,
  rosterOf,
  isProjection,
  occupiedCells,
  projectionOf,
  unlocatedSegments,
} from "./state.js";

// The engine's own configuration vocabulary: exactly what a turn's
// resolution reads. spec: game-engine/configuration-parameters
export type { GameRuntimeConfig } from "./types.js";

// Outcome, events
export type { DeathCause, GameOutcome, TurnEvent } from "./types.js";

// Randomness primitives
export { rngFromSeed, subSeed } from "./rng.js";
export type { Rng } from "./rng.js";

// Entry points. Both require the turn's timings — how long it lasted and how
// much of its own clock each team burned on it — as declared inputs.
// spec: game-engine/turn-resolution-model
export { advanceTurn, imagineMoves } from "./resolve.js";
export type {
  HypotheticalResolution,
  HypotheticalResult,
  ResolutionFailure,
  ResolutionFailureKind,
  TurnResolution,
} from "./resolve.js";
export type { StagedMove, TurnTimings } from "./types.js";

// Board geometry helpers (game-engine/board-geometry; fertileGroundEnabled is
// contract-level, the rest are shared conveniences).
export { advance, cellAt, cellIndex, fertileGroundEnabled, isInner, parityOf } from "./board.js";

// The timer's game-start half. Every later carve-out happens inside a
// resolution, so no second writer of a budget is offered here.
// spec: game-engine/chess-timer#only-a-resolution-moves-a-budget
export { initialClock } from "./clock.js";

// A team's standing score at any turn — the formula the final score is built
// on. spec: game-engine/scoring#standing-score-at-any-turn
export { standingScores } from "./resolve/win.js";

// Move pre-validation (web-client consumers of the shared build per
// global-invariants/one-shared-engine; see validate.ts for semantics).
export { isValidMove } from "./validate.js";
