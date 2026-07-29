// Domain type vocabulary for the Team Snek game engine.
// This file is the canonical TypeScript rendering of spec module 01's
// Exported Interfaces (spec/01-game-rules.md Section 3), consumed by all
// three runtimes per global-invariants/one-shared-engine.
//
// Note on enums: the spec drafts `Direction`/`CellType`/`ItemType` as
// `const enum`s. This workspace compiles with `isolatedModules` +
// `verbatimModuleSyntax`, and the engine is consumed by esbuild-based
// bundlers (Vite) that transpile file-by-file and cannot inline cross-module
// const enum members. We therefore use the erasable `as const` object +
// literal-union pattern, which preserves the spec's numeric values exactly
// while remaining safe in every consumer runtime.

// spec: game-engine/domain-vocabulary
export const Direction = { Up: 0, Right: 1, Down: 2, Left: 3 } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

// Canonical iteration order (Up, Right, Down, Left) — also the draw order of
// the turn-0 seeded random pick (game-engine/movement), so reordering changes replays.
export const ALL_DIRECTIONS: ReadonlyArray<Direction> = [
  Direction.Up,
  Direction.Right,
  Direction.Down,
  Direction.Left,
];

// spec: game-engine/domain-vocabulary. Fertile is an overlay on Normal — a cell is never
// simultaneously Fertile and Wall/Hazard — but is represented as a distinct
// CellType so every inner cell sits in exactly one category.
export const CellType = { Normal: 0, Wall: 1, Hazard: 2, Fertile: 3 } as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

// spec: game-engine/domain-vocabulary
export const ItemType = { Food: 0, InvulnPotion: 1, InvisPotion: 2 } as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

// spec: game-engine/domain-vocabulary
export type EffectFamily = "invulnerability" | "invisibility";
export type EffectState = "buff" | "debuff";

// Coordinate convention: (0,0) is the top-left wall cell. x is column, y is row.
export interface Cell {
  readonly x: number;
  readonly y: number;
}

// Branded ID types so SnakeId, CentaurTeamId, ItemId and TurnNumber cannot be
// accidentally mixed at call sites.
export type SnakeId = number & { readonly __brand: "SnakeId" };
export type CentaurTeamId = string & { readonly __brand: "CentaurTeamId" };
// ItemId is a DERIVED scalar rendering "spawnTurn:spawnIndex" of the item
// identity pair (game-engine/item-identity) — computed via itemIdOf for
// display/keying, never stored: the identity lives as the ItemIdentity
// fields on the item itself.
export type ItemId = string & { readonly __brand: "ItemId" };
export type TurnNumber = number & { readonly __brand: "TurnNumber" };
export type UserId = string & { readonly __brand: "UserId" };
// Canonical flat cell index, `y * boardSize + x` (DOWNSTREAM IMPACT note 3).
export type CellIndex = number & { readonly __brand: "CellIndex" };

// Agent: the actor that staged a move. Module 01 distinguishes two kinds —
// the team's Centaur bot and an individual human operator. The mapping from
// a concrete deployment identity (e.g. module 04's SpacetimeDB `Identity`)
// to an `Agent` is owned by downstream modules.
export type Agent =
  | { readonly kind: "centaur_team"; readonly centaurTeamId: CentaurTeamId }
  | { readonly kind: "operator"; readonly operatorUserId: UserId };

// spec: game-engine/domain-vocabulary. A snake holds at most one active effect per family
// (game-engine/team-potion-effects). `expiryTurn` is the last turn on which the effect is active
// (game-engine/team-potion-effects#three-turn-expiry).
export interface PotionEffect {
  readonly family: EffectFamily;
  readonly state: EffectState;
  readonly expiryTurn: TurnNumber;
}

// spec: game-engine/domain-vocabulary. `invulnerabilityLevel` and `visible` are NOT stored
// fields — they are derived from `activeEffects` per game-engine/collisions-and-severing/023 via
// `invulnerabilityLevel(snake)` and `isVisible(snake)` in effects.ts.
//
// What EVERY occupant of a board carries, whether it is a whole snake or the
// projection of one held through a resolution. Declared once so the two stay
// siblings by construction: a field added here reaches both, and every stage
// that does not care which kind it has — team effect cancellation, rebuilds,
// expiry, clock exhaustion, roster membership — is typed against this and
// therefore cannot diverge between them.
export interface SnakeCore {
  readonly snakeId: SnakeId;
  readonly letter: string; // single alphabetic char, 'A' + index within team
  readonly centaurTeamId: CentaurTeamId;
  readonly health: number;
  readonly activeEffects: ReadonlyArray<PotionEffect>; // ≤1 per family (game-engine/team-potion-effects)
  readonly alive: boolean;
  // The turn this occupant has advanced to — absolute, never a staleness
  // counter (game-engine/domain-vocabulary#turns-at-two-grains). Deliberately
  // NOT optional: "absent means caught up" defeats the lockstep invariant and
  // pushes an `undefined` case into every consumer's analysis.
  readonly turn: TurnNumber;
}

// SnakeState carries no intra-turn bookkeeping: growth is a duplicated tail
// segment in `body` (game-engine/food-and-growth) and team rebuilds are intra-turn claims.
export interface SnakeState extends SnakeCore {
  // Head at index 0, tail at last index. Consecutive entries may share a
  // cell (duplicated tail from growth; fully stacked game-start body).
  readonly body: ReadonlyArray<Cell>;
  readonly lastDirection: Direction | null;
}

// spec: game-engine/held-snakes
//
// A snake held through a resolution splits in two, and the split is the whole
// of what holding means.
//
// The snake itself CRYSTALLIZES into the HISTORIC record below: frozen at the
// turn it was held from, and changed by nothing thereafter — not a sever, not
// an expiry, not its team's collection. It is a record, not a participant, and
// no turn's calculation resolves against it.
//
// Its PROJECTION is what stands on the board from then on: the same snake, one
// turn later, minus what a hold declines to model. It shares `SnakeCore` with a
// snake, so severing, team effects, expiry and the clock reach it through the
// same code as reaches any snake. It differs in exactly one way, stated in the
// type by what it is missing: it HAS NO HEAD.
//
// The head is what a hold declines to model. A snake vacates its head cell only
// by putting its own next segment there, so the cell its record names as the
// head is the one cell whose occupant next turn is certain — the neck. Where
// the head itself went is precisely the thing nobody chose, so it is in no
// plane this resolution can touch.
export interface ProjectedSnake extends SnakeCore {
  /**
   * The cells it stands in, nearest the unlocated head first — its BODY, never
   * its head. Empty means a sever took every cell it could name; it is alive
   * and obstructs nothing.
   *
   * Held from turn T and read at turn T+N, `segments[i]` plays body index
   * `N + i`: the first N are at cells no record names (see `unlocatedSegments`).
   * This is a computed list rather than a view over `historic.body`, which is
   * what leaves room for a later projection to drop tail segments it can prove
   * were vacated.
   */
  readonly segments: ReadonlyArray<Cell>;
  /**
   * `health` (from `SnakeCore`) is conservatively the configured maximum,
   * always. A snake nobody modelled might have reached food on any turn since
   * it was held, so any lower figure asserts a starvation the hold has no
   * grounds to claim. A less conservative figure is available to the same
   * future pass that would shorten `segments`: both fall out of reasoning about
   * the food a projection could have reached.
   *
   * The HISTORIC record this projects, frozen at the turn it was held from.
   * Read it for the last modelled position; never write it, and never resolve
   * against it — its projection is what the turn's calculations run over.
   */
  readonly historic: SnakeState;
}

/**
 * Either kind of occupant, where a consumer needs the cells as well as the
 * common fields. `occupiedCells` and `isProjection` in state.ts are the ONE
 * place the difference between the two is handled.
 */
export type BoardOccupant = SnakeState | ProjectedSnake;

// spec: game-engine/item-identity — a present item. Consumption removes the entry from the
// items collection at commit; there is no consumed flag. The full lifetime
// (spawn/destruction turns) is module 04's item_lifetimes record, maintained
// from spawn/consumption events.
// The potion half of the closed item-type set.
export type PotionType = typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion;

// Common item supertype: the identity pair plus location. Concrete item
// kinds extend it, discriminated by itemType; `Item` below is the sealed
// union (the closed set of game-engine/domain-vocabulary, compiler-enforced
// via never-checked switches — see assertNever).
export interface ItemBase {
  // The turn boundary at which the item first exists: game setup spawns at
  // boundary 0; items spawned by turn T's resolution first exist at T + 1.
  readonly spawnTurn: TurnNumber;
  // Index within that boundary's spawn order, from 0.
  readonly spawnIndex: number;
  readonly cell: Cell;
}

export interface FoodItem extends ItemBase {
  readonly itemType: typeof ItemType.Food;
}

export interface PotionItem extends ItemBase {
  readonly itemType: PotionType;
}

export type Item = FoodItem | PotionItem;

/** Exhaustiveness backstop: only typechecks while every union member is handled. */
export function assertNever(x: never): never {
  throw new Error(`unreachable: ${JSON.stringify(x)}`);
}

// spec: game-engine/item-identity, 01 §3.2 — the present-items component of game state,
// keyed by canonical cell index so a second occupant of a cell is
// unrepresentable. Build from flat lists via itemsByCell (items.ts).
export type ItemsByCell = ReadonlyMap<CellIndex, Item>;

// spec: game-engine/board-geometry. Flat row-major cell array; index is
// `y * boardSize + x` (module 01 DOWNSTREAM IMPACT note 3).
export interface Board {
  readonly boardSize: number; // edge length in cells
  readonly cells: ReadonlyArray<CellType>; // length = boardSize * boardSize
}

// spec: game-engine/chess-timer..037
export interface CentaurTeamClockState {
  readonly centaurTeamId: CentaurTeamId;
  readonly budgetMs: number; // persistent across turns
  readonly perTurnMs: number; // current turn only
  readonly declaredTurnOver: boolean;
}

// The engine's own configuration vocabulary: exactly the parameters a turn's
// resolution reads, with their ranges, defaults and disable sentinels. Ranges
// are enforced by the user-facing configuration surfaces, not here.
// spec: game-engine/configuration-parameters
export interface GameRuntimeConfig {
  readonly maxHealth: number; // 1-500, default 100, game-engine/configuration-parameters
  readonly maxTurns: number; // 0 (disabled) or 1-1000, default 100, game-engine/configuration-parameters
  // 0 (disabled) or 1000-86400000, default 0 — the wall-clock duration a game
  // may consume. Evaluated against the durations DECLARED to the engine's own
  // resolutions, never against a clock the engine reads
  // (game-engine/game-end-conditions#the-duration-limit-is-an-ending-like-any-other).
  readonly maxGameDurationMs: number;
  readonly hazardDamage: number; // 1-100, default 15, game-engine/configuration-parameters
  readonly foodSpawnRate: number; // 0-5, default 0.5, game-engine/configuration-parameters
  readonly invulnPotionSpawnRate: number; // 0-0.2, default 0.15, game-engine/configuration-parameters
  readonly invisPotionSpawnRate: number; // 0-0.2, default 0.1, game-engine/configuration-parameters
  readonly clock: {
    readonly initialBudgetMs: number; // 0-600000, default 60000, game-engine/configuration-parameters
    readonly budgetIncrementMs: number; // 100-5000, default 500, game-engine/configuration-parameters
    readonly firstTurnTimeMs: number; // 1000-300000, default 60000, game-engine/configuration-parameters
    readonly maxTurnTimeMs: number; // 100-300000, default 10000, game-engine/configuration-parameters
  };
}

// Canonical gameplay defaults. spec: game-engine/configuration-parameters.
// The board-generation half's defaults are game-configuration's own
// declaration and live with the generator they drive.
export const DEFAULT_RUNTIME_CONFIG: GameRuntimeConfig = {
  maxHealth: 100,
  maxTurns: 100,
  maxGameDurationMs: 0,
  hazardDamage: 15,
  foodSpawnRate: 0.5,
  invulnPotionSpawnRate: 0.15,
  invisPotionSpawnRate: 0.1,
  clock: {
    initialBudgetMs: 60000,
    budgetIncrementMs: 500,
    firstTurnTimeMs: 60000,
    maxTurnTimeMs: 10000,
  },
};

// spec: game-engine/scoring..058 (Section 3.4)
export type GameOutcome =
  | { readonly kind: "in_progress" }
  | {
      readonly kind: "victory";
      readonly winnerCentaurTeamId: CentaurTeamId;
      readonly scores: ReadonlyMap<CentaurTeamId, number>;
    }
  | {
      readonly kind: "draw";
      readonly tiedCentaurTeamIds: ReadonlyArray<CentaurTeamId>;
      readonly scores: ReadonlyMap<CentaurTeamId, number>;
    }
  | { readonly kind: "error"; readonly reason: string };

// spec: game-engine/turn-events (Section 2.11) — closed discriminated union.
export type DeathCause =
  | "wall"
  | "self_collision"
  | "body_collision"
  | "head_to_head"
  | "health_depletion"
  // A competing team left with no remaining time at all loses every snake
  // still alive at that commit. A cause of death, not an ending — what the
  // deaths leave behind is what decides the game
  // (game-engine/chess-timer#exhaustion-kills-the-teams-snakes).
  | "clock_exhaustion";

// Damage-claim sources reported on health_depletion deaths (game-engine/health-and-starvation).
export type DamageSource = "tick" | "hazard";

export type TurnEvent =
  | {
      readonly kind: "snake_moved";
      readonly snakeId: SnakeId;
      readonly from: Cell;
      readonly to: Cell;
      readonly direction: Direction;
      // null when no move was staged this turn — the direction came from the
      // `lastDirection` fallback or, on turn 0, the seeded random pick.
      readonly stagedBy: Agent | null;
    }
  | {
      readonly kind: "snake_died";
      readonly snakeId: SnakeId;
      readonly cause: DeathCause;
      readonly killerSnakeId: SnakeId | null;
      readonly location: Cell;
      // Present iff cause === 'health_depletion': every damage source that
      // contributed to the fatal health resolution (game-engine/health-and-starvation).
      readonly sources?: ReadonlyArray<DamageSource>;
    }
  | {
      readonly kind: "snake_severed";
      readonly attackerSnakeId: SnakeId;
      readonly victimSnakeId: SnakeId;
      readonly contactCell: Cell;
      readonly segmentsLost: number;
    }
  | {
      readonly kind: "food_eaten";
      readonly snakeId: SnakeId;
      // Reference to the consumed item by derived id (game-engine/item-identity);
      // the item's full data travelled on its spawn record.
      readonly itemId: ItemId;
      readonly cell: Cell;
      readonly healthRestored: number;
    }
  | {
      readonly kind: "potion_collected";
      readonly snakeId: SnakeId;
      // Reference to the consumed item by derived id (game-engine/item-identity).
      readonly itemId: ItemId;
      readonly cell: Cell;
      readonly potionType: PotionType;
      readonly affectedTeammateIds: ReadonlyArray<SnakeId>;
    }
  | {
      readonly kind: "food_spawned";
      readonly spawnTurn: TurnNumber;
      readonly spawnIndex: number;
      readonly cell: Cell;
    }
  | {
      readonly kind: "potion_spawned";
      readonly spawnTurn: TurnNumber;
      readonly spawnIndex: number;
      readonly cell: Cell;
      readonly potionType: PotionType;
    }
  | {
      readonly kind: "effect_applied";
      readonly snakeId: SnakeId;
      readonly family: EffectFamily;
      readonly state: EffectState;
      readonly expiryTurn: TurnNumber;
    }
  | {
      readonly kind: "effect_cancelled";
      readonly snakeId: SnakeId;
      readonly family: EffectFamily;
      readonly reason: "collector_disruption" | "expiry" | "replaced";
    }
  | {
      // Hazard damage taken by a snake that survived the turn, so a consumer
      // learns why its health fell without diffing successive snapshots. A
      // snake the damage kills reports through its death event instead, which
      // already carries its contributing damage sources — one act never
      // produces two events (game-engine/turn-events#hazard-damage-is-announced).
      readonly kind: "hazard_damage_taken";
      readonly snakeId: SnakeId;
      readonly damage: number;
      readonly cell: Cell;
    };

// spec: Section 3.8
export interface StagedMove {
  readonly direction: Direction;
  readonly stagedBy: Agent; // never null on input; absence = omit the map entry
}

// The timings of the turn being resolved — a DECLARED INPUT of every
// resolution, exactly like the staged moves and the turn seed, and the sole
// channel by which elapsed time reaches committed state. The engine reads no
// clock: determinism is "identical inputs give identical outcomes", and the
// input tuple grew by these two quantities and stayed closed
// (game-engine/determinism#time-is-an-input-not-a-reading).
//
// The two quantities do not collapse into one. A team that declared early
// burned less than the turn lasted, and the teams' clocks run concurrently,
// so no aggregate of the burns is the turn's length
// (game-engine/chess-timer#burn-is-not-the-turns-length).
export interface TurnTimings {
  /** How long the turn lasted, in milliseconds. Moves the game's total. */
  readonly durationMs: number;
  /**
   * How much of its own clock each team burned on this turn. An entry is
   * required for exactly the teams the state holds a clock for — a resolution
   * that invented a missing one would decide the game on a number nobody
   * measured.
   */
  readonly burnMs: ReadonlyMap<CentaurTeamId, number>;
}

// spec: game-engine/domain-vocabulary. The canonical aggregate of the
// game-state components; the per-game runtime assembles this shape from its
// tables (`items` via itemsByCell over the active item_lifetimes rows).
//
// A PARTIAL game state is one carrying PROJECTIONS: snakes held through some
// earlier resolution, standing on the board headless while their historic
// records sit beside it. It is what a hypothetical resolution takes and yields.
// The state's current turn is the greatest turn any snake on it has reached,
// derived rather than stored (see currentTurn in state.ts).
export interface PartialGameState {
  readonly board: Board;
  readonly snakes: ReadonlyArray<SnakeState>;
  /**
   * Snakes held through an earlier resolution, as the board finds them now.
   * Each carries the historic record it projects; nothing here is a snake
   * a resolution of the NEXT turn may move, and a state with a live one will
   * not narrow. Their moves at the turn they were held are supplied through
   * `advanceHistory` instead.
   */
  // spec: game-engine/held-snakes
  readonly projections: ReadonlyArray<ProjectedSnake>;
  readonly items: ItemsByCell;
  readonly clocks: ReadonlyArray<CentaurTeamClockState>;
  // The wall-clock duration this game has consumed, advanced at a commit by
  // the turn's declared duration. Committed state like the clocks beside it,
  // which is what lets a reader recompute the duration ending from the record
  // (game-engine/chess-timer).
  readonly consumedDurationMs: number;
  /**
   * Everything needed to resolve this state's history again once a projection's
   * move stops being unknown — `null` exactly when nothing is projected.
   * spec: game-engine/historic-advance
   */
  readonly rewind: RewindLog | null;
}

// spec: game-engine/historic-advance
//
// What a resolution was ASKED, kept so it can be asked again. A resolution is a
// function of its declared inputs alone (game-engine/determinism), so replaying
// these against a revised board is not an approximation of what happened — it
// is the same computation over a different premise.
export interface ResolutionRecord {
  readonly directions: ReadonlyMap<SnakeId, Direction>;
  /** Snakes held here — the record of where each projection crystallized. */
  readonly held: ReadonlySet<SnakeId>;
  readonly timings: TurnTimings;
  readonly turnSeed: Uint8Array | null;
}

/**
 * The board as it stood before the oldest still-standing projection was held,
 * and every resolution applied since.
 *
 * `base` is a GAME state by construction: it is the moment before anything was
 * first held, so nothing was projected then — which is also why the nesting
 * terminates, since a game state's own `rewind` is always `null`.
 *
 * This exists only while something is projected, so the mainline never carries
 * one: `advanceTurn` holds nothing, so its states always have `rewind: null`
 * and no runtime ever persists a log.
 */
export interface RewindLog {
  readonly base: GameState;
  /** Oldest first; one entry per resolution that advanced the turn. */
  readonly resolutions: ReadonlyArray<ResolutionRecord>;
}

// A GAME state is the lockstep case: nothing is still projected, so every
// alive snake is on the board whole and at the state's own turn. It is the only form a runtime persists, and the sole way to obtain
// one is to narrow a partial state (state.ts) — so a caller that left a snake
// behind cannot produce it, and every function taking the partial form takes
// both (game-engine/domain-vocabulary#lockstep-is-the-game-state-invariant).
// The brand follows the same phantom-property pattern as the branded ids
// above: type-only, never present at runtime.
export type GameState = PartialGameState & { readonly __brand: "GameState" };
