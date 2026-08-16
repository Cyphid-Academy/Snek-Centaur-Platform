// Convex validators for the `games` table — the configuration record's
// physical home (spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal).
//
// These validators declare SHAPE only. Numeric ranges are deliberately NOT
// encoded here: every bound is enforced by the pure record state machine in
// @cyphid/snek-game-configuration, which reads the two parameter descriptor
// tables — restating a range in a validator would be the second set of
// numbers the bounds-sourcing rule forbids.
// spec: game-configuration/parameter-bounds-sourcing
//
// Every validator that renders an engine or game-configuration type is
// guarded field-for-field, modifiers included, in mirror-guard.ts.
// spec: game-configuration/engine-schema-fidelity, global-invariants/engine-mirrors-are-guarded
//
// This file imports nothing but convex/values, so any consumer (the
// component's schema, the host's argument validators, a test) can pull the
// validators in without dragging the engine or the generator along.
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// The two halves of a game's configuration — exactly two, nothing else.
// spec: game-configuration/closed-parameter-vocabulary
// ---------------------------------------------------------------------------

/** Mirror of game-configuration's BoardGenerationConfig (this capability's own half). */
// spec: game-configuration/generation-parameters
export const generationConfigValidator = v.object({
  boardSize: v.number(),
  snakesPerTeam: v.number(),
  hazardPercentage: v.number(),
  fertileGround: v.object({
    density: v.number(),
    clustering: v.number(),
  }),
});

/** Mirror of the engine's GameRuntimeConfig — the gameplay half, field-for-field. */
// spec: game-configuration/engine-schema-fidelity#no-translation-at-handoff
export const runtimeConfigValidator = v.object({
  maxHealth: v.number(),
  maxTurns: v.number(),
  maxGameDurationMs: v.number(),
  hazardDamage: v.number(),
  foodSpawnRate: v.number(),
  invulnPotionSpawnRate: v.number(),
  invisPotionSpawnRate: v.number(),
  clock: v.object({
    initialBudgetMs: v.number(),
    budgetIncrementMs: v.number(),
    firstTurnTimeMs: v.number(),
    maxTurnTimeMs: v.number(),
  }),
});

/** The whole stored configuration: the two disjoint halves and nothing else. */
// spec: game-configuration/closed-parameter-vocabulary
export const gameConfigValidator = v.object({
  generation: generationConfigValidator,
  runtime: runtimeConfigValidator,
});

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

/** Mirror of game-configuration's TeamRegistration. */
export const teamValidator = v.object({
  centaurTeamId: v.string(),
  name: v.string(),
});

// ---------------------------------------------------------------------------
// The generated starting state and the generator's structured failure —
// the two arms of a preview slot's result, exactly as the one shared
// generator returns them (never translated at the boundary).
// spec: global-invariants/one-shared-generation
// ---------------------------------------------------------------------------

const cellValidator = v.object({ x: v.number(), y: v.number() });

// CellType is the engine's closed 0-3 set; Direction its closed 0-3 set.
// Encoded as literal unions so a stored board can never hold a cell kind the
// engine does not define.
const cellTypeValidator = v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3));
const directionValidator = v.union(v.literal(0), v.literal(1), v.literal(2), v.literal(3));

/** Mirror of game-configuration's GeneratedInitialState (engine domain types inside). */
// spec: game-configuration/generated-board-shape, game-configuration/initial-snakes, game-configuration/initial-food
export const initialStateValidator = v.object({
  board: v.object({
    boardSize: v.number(),
    cells: v.array(cellTypeValidator),
  }),
  snakes: v.array(
    v.object({
      snakeId: v.number(),
      letter: v.string(),
      centaurTeamId: v.string(),
      health: v.number(),
      activeEffects: v.array(
        v.object({
          family: v.union(v.literal("invulnerability"), v.literal("invisibility")),
          state: v.union(v.literal("buff"), v.literal("debuff")),
          expiryTurn: v.number(),
        }),
      ),
      alive: v.boolean(),
      turn: v.number(),
      body: v.array(cellValidator),
      lastDirection: v.union(directionValidator, v.null()),
    }),
  ),
  // Initial items are food only (ItemType.Food = 0).
  // spec: game-configuration/initial-food
  items: v.array(
    v.object({
      spawnTurn: v.number(),
      spawnIndex: v.number(),
      cell: cellValidator,
      itemType: v.literal(0),
    }),
  ),
});

/** Mirror of game-configuration's BoardGenerationFailure. */
// spec: game-configuration/board-generation-retry#infeasible-configuration
export const generationFailureValidator = v.object({
  code: v.union(
    v.literal("HAZARD_CONNECTIVITY"),
    v.literal("TERRITORY_PARITY_SHORTAGE"),
    v.literal("INITIAL_FOOD_SHORTAGE"),
  ),
  attemptsUsed: v.literal(4),
  details: v.object({
    centaurTeamId: v.optional(v.string()),
    innerCellCount: v.number(),
    eligibleCellCount: v.optional(v.number()),
  }),
});

/**
 * The single current-preview slot: the seed the candidate was drawn from
 * (hex-encoded, platform-private) and the generator's own all-or-nothing
 * outcome — success or structured infeasibility, never substituted.
 * spec: game-configuration/board-preview#one-slot-no-archive
 */
export const previewSlotValidator = v.object({
  seedHex: v.string(),
  result: v.union(initialStateValidator, generationFailureValidator),
});

// ---------------------------------------------------------------------------
// The games table — created here, minimally: the game's identity (roomId,
// phase) plus the configuration this capability owns. Capabilities owning the
// rest of a game's life extend THIS record; a second record per game is never
// introduced.
// spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
// ---------------------------------------------------------------------------

export const gameFields = {
  /**
   * Rooms are a later story; until it lands the only room key is the dev
   * room, encoded as null. One-open-game exclusivity is guarded per room key,
   * null included.
   * spec: game-configuration/config-lives-on-the-game#one-game-configured-at-a-time
   */
  roomId: v.union(v.string(), v.null()),
  // spec: game-configuration/launch-freeze
  phase: v.union(v.literal("configuring"), v.literal("playing"), v.literal("finished")),
  config: gameConfigValidator,
  teams: v.array(teamValidator),
  currentPreview: v.union(previewSlotValidator, v.null()),
  // spec: game-configuration/board-preview-lock-in
  boardLocked: v.boolean(),
  /** Set at launch only; null before launch and for a never-launched ending. */
  startingState: v.union(initialStateValidator, v.null()),
  /**
   * True exactly when startingState came from the unlocked fresh-seed launch
   * path; public reads omit startingState while this is set.
   * spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
   */
  startingStateHidden: v.boolean(),
};
