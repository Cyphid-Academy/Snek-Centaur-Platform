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

// 01 §3.1 — enums, branded ids, Agent, derived effect values
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

// 01 §3.2 — state shapes (itemsByCell/itemAt bridge the flat wire form of
// present items to the logical cell-keyed map)
export type {
  Board,
  CentaurTeamClockState,
  GameState,
  ItemsByCell,
  FoodItem,
  Item,
  ItemBase,
  PotionItem,
  PotionType,
  PotionEffect,
  SnakeState,
} from "./types.js";
// SETUP_SPAWN_TURN is the boundary at which an item placed before the first
// turn exists — the engine's vocabulary, read by whoever places one.
// spec: game-engine/item-identity
export { SETUP_SPAWN_TURN, itemAt, itemsByCell } from "./items.js";

// 01 §3.3 — the engine's own configuration vocabulary
export type { GameRuntimeConfig } from "./types.js";

// 01 §3.4 / §3.5 — outcome, events
export type { DeathCause, GameOutcome, TurnEvent } from "./types.js";

// 01 §3.7 — randomness primitives
export { rngFromSeed, subSeed } from "./rng.js";
export type { Rng } from "./rng.js";

// 01 §3.8 — entry point. Board generation is NOT one: the engine is handed a
// fully specified board and plays it (see @cyphid/snek-game-configuration).
export { resolveTurn } from "./resolve.js";
export type { TurnResolution } from "./resolve.js";
export type { StagedMove } from "./types.js";

// Board geometry helpers (01 §2.2; fertileGroundEnabled is contract-level
// per 02 §2.17's export list, the rest are shared conveniences).
export { advance, cellAt, cellIndex, fertileGroundEnabled, isInner, parityOf } from "./board.js";

// Chess-timer arithmetic (01 §2.9) — exported so module 04's reducers apply
// the exact formulas.
export { applyTurnStart, declareTurnOver, initialClock } from "./clock.js";

// Move pre-validation (web-client consumers of the shared build per
// global-invariants/one-shared-engine; see validate.ts for semantics).
export { isValidMove } from "./validate.js";
