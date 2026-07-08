// @cyphid/snek-engine — the shared game engine.
// spec: 02-REQ-034 — single shared codebase exporting module 01's domain
// type vocabulary and the eleven-phase turn resolver, consumed by the
// SpacetimeDB module (authoritative), the Centaur Server library
// (simulation), and web clients (pre-validation/rendering).
//
// The export list mirrors 02 §2.17 / 01 §3 (Exported Interfaces). Everything
// else in this package is module-internal detail.

// 01 §3.1 — enums, branded ids, Agent, derived effect values
export { ALL_DIRECTIONS, CellType, DEFAULT_GAME_CONFIG, Direction, ItemType } from "./types.js";
export type {
  Agent,
  Cell,
  CentaurTeamId,
  EffectFamily,
  EffectState,
  ItemId,
  SnakeId,
  TurnNumber,
  UserId,
} from "./types.js";
export { invulnerabilityLevel, isVisible } from "./effects.js";

// 01 §3.2 — state shapes
export type {
  Board,
  CentaurTeamClockState,
  GameState,
  ItemState,
  PotionEffect,
  SnakeState,
} from "./types.js";

// 01 §3.3 — game configuration
export type { GameConfig, GameOrchestrationConfig, GameRuntimeConfig } from "./types.js";

// 01 §3.4 / §3.5 / §3.6 — outcome, events, board-generation failure
export type { BoardGenerationFailure, DeathCause, GameOutcome, TurnEvent } from "./types.js";

// 01 §3.7 — randomness primitives
export { rngFromSeed, subSeed } from "./rng.js";
export type { Rng } from "./rng.js";

// 01 §3.8 — entry points
export { generateBoardAndInitialState } from "./boardgen.js";
export type { GeneratedInitialState, TeamRegistration } from "./boardgen.js";
export { resolveTurn } from "./resolve.js";
export type { TurnResolution } from "./resolve.js";
export type { StagedMove } from "./types.js";

// Board geometry helpers (01 §2.2; fertileGroundEnabled is contract-level
// per 02 §2.17's export list, the rest are shared conveniences).
export {
  advance,
  cellAt,
  cellIndex,
  cellKey,
  fertileGroundEnabled,
  isInner,
  parityOf,
  sameCell,
} from "./board.js";

// Chess-timer arithmetic (01 §2.9) — exported so module 04's reducers apply
// the exact formulas.
export { applyTurnStart, declareTurnOver, initialClock } from "./clock.js";

// Move pre-validation (02-REQ-037 consumers; see validate.ts for semantics).
export { isValidMove } from "./validate.js";

// Derived-effect helpers beyond the §3.1 pair — shared conveniences.
export { EFFECT_DURATION_TURNS, familyOfPotion } from "./effects.js";

// Local game driver — convenience harness (not contract surface; see
// driver.ts) for demos, module-07 bot loops, and replay tooling.
export { createLocalGame, seedFromText } from "./driver.js";
export type { LocalGame } from "./driver.js";
