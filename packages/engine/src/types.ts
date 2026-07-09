// Domain type vocabulary for the Team Snek game engine.
// This file is the canonical TypeScript rendering of spec module 01's
// Exported Interfaces (spec/01-game-rules.md Section 3), consumed by all
// three runtimes per 02-REQ-034.
//
// Note on enums: the spec drafts `Direction`/`CellType`/`ItemType` as
// `const enum`s. This workspace compiles with `isolatedModules` +
// `verbatimModuleSyntax`, and the engine is consumed by esbuild-based
// bundlers (Vite) that transpile file-by-file and cannot inline cross-module
// const enum members. We therefore use the erasable `as const` object +
// literal-union pattern, which preserves the spec's numeric values exactly
// while remaining safe in every consumer runtime.

// spec: 01-REQ-001
export const Direction = { Up: 0, Right: 1, Down: 2, Left: 3 } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

// Canonical iteration order (Up, Right, Down, Left) — also the draw order of
// the turn-0 seeded random pick (01-REQ-042), so reordering changes replays.
export const ALL_DIRECTIONS: ReadonlyArray<Direction> = [
  Direction.Up,
  Direction.Right,
  Direction.Down,
  Direction.Left,
];

// spec: 01-REQ-002. Fertile is an overlay on Normal — a cell is never
// simultaneously Fertile and Wall/Hazard — but is represented as a distinct
// CellType so every inner cell sits in exactly one category.
export const CellType = { Normal: 0, Wall: 1, Hazard: 2, Fertile: 3 } as const;
export type CellType = (typeof CellType)[keyof typeof CellType];

// spec: 01-REQ-005
export const ItemType = { Food: 0, InvulnPotion: 1, InvisPotion: 2 } as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

// spec: 01-REQ-006
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
export type ItemId = number & { readonly __brand: "ItemId" };
export type TurnNumber = number & { readonly __brand: "TurnNumber" };
export type UserId = string & { readonly __brand: "UserId" };

// Agent: the actor that staged a move. Module 01 distinguishes two kinds —
// the team's Centaur bot and an individual human operator. The mapping from
// a concrete deployment identity (e.g. module 04's SpacetimeDB `Identity`)
// to an `Agent` is owned by downstream modules.
export type Agent =
  | { readonly kind: "centaur_team"; readonly centaurTeamId: CentaurTeamId }
  | { readonly kind: "operator"; readonly operatorUserId: UserId };

// spec: 01-REQ-006. A snake holds at most one active effect per family
// (01-REQ-028). `expiryTurn` is the last turn on which the effect is active
// (resolved 01-REVIEW-003).
export interface PotionEffect {
  readonly family: EffectFamily;
  readonly state: EffectState;
  readonly expiryTurn: TurnNumber;
}

// spec: 01-REQ-004. `invulnerabilityLevel` and `visible` are NOT stored
// fields — they are derived from `activeEffects` per 01-REQ-022/023 via
// `invulnerabilityLevel(snake)` and `isVisible(snake)` in effects.ts.
// SnakeState carries no intra-turn bookkeeping: growth is a duplicated tail
// segment in `body` (01-REQ-062) and team rebuilds are intra-turn claims.
export interface SnakeState {
  readonly snakeId: SnakeId;
  readonly letter: string; // single alphabetic char, 'A' + index within team
  readonly centaurTeamId: CentaurTeamId;
  // Head at index 0, tail at last index. Consecutive entries may share a
  // cell (duplicated tail from growth; fully stacked game-start body).
  readonly body: ReadonlyArray<Cell>;
  readonly health: number;
  readonly activeEffects: ReadonlyArray<PotionEffect>; // ≤1 per family (01-REQ-028)
  readonly lastDirection: Direction | null;
  readonly alive: boolean;
}

// spec: 01-REQ-007
export interface ItemState {
  readonly itemId: ItemId;
  readonly itemType: ItemType;
  readonly cell: Cell;
  readonly consumed: boolean;
}

// spec: 01-REQ-003, 01-REQ-008. Flat row-major cell array; index is
// `y * boardSize + x` (module 01 DOWNSTREAM IMPACT note 3).
export interface Board {
  readonly boardSize: number; // edge length in cells
  readonly cells: ReadonlyArray<CellType>; // length = boardSize * boardSize
}

// spec: 01-REQ-034..037
export interface CentaurTeamClockState {
  readonly centaurTeamId: CentaurTeamId;
  readonly budgetMs: number; // persistent across turns
  readonly perTurnMs: number; // current turn only
  readonly declaredTurnOver: boolean;
}

// spec: 01-REQ-063..070 (ranges enforced by user-facing surfaces, not here)
export interface GameOrchestrationConfig {
  readonly boardSize: number; // positive integer, 01-REQ-003, 01-REQ-063
  readonly snakesPerTeam: number; // 1-10, default 5, 01-REQ-019, 01-REQ-064
  readonly hazardPercentage: number; // 0-30, default 0, 01-REQ-010, 01-REQ-067
  readonly fertileGround: {
    readonly density: number; // 0-90, default 30, 01-REQ-069 (0 = disabled)
    readonly clustering: number; // 1-20, default 10, 01-REQ-070
  };
}

// spec: 01-REQ-065..068, 01-REQ-071..077
export interface GameRuntimeConfig {
  readonly maxHealth: number; // 1-500, default 100, 01-REQ-065
  readonly maxTurns: number; // 0 (disabled) or 1-1000, default 100, 01-REQ-066
  readonly hazardDamage: number; // 1-100, default 15, 01-REQ-068
  readonly foodSpawnRate: number; // 0-5, default 0.5, 01-REQ-071
  readonly invulnPotionSpawnRate: number; // 0-0.2, default 0.15, 01-REQ-072
  readonly invisPotionSpawnRate: number; // 0-0.2, default 0.1, 01-REQ-073
  readonly clock: {
    readonly initialBudgetMs: number; // 0-600000, default 60000, 01-REQ-074
    readonly budgetIncrementMs: number; // 100-5000, default 500, 01-REQ-075
    readonly firstTurnTimeMs: number; // 1000-300000, default 60000, 01-REQ-076
    readonly maxTurnTimeMs: number; // 100-300000, default 10000, 01-REQ-077
  };
}

export interface GameConfig {
  readonly orchestration: GameOrchestrationConfig;
  readonly runtime: GameRuntimeConfig;
}

// Canonical defaults from 01-REQ-063..077. Exported as a convenience for
// downstream configuration surfaces and tests; not part of the minimal
// module-01 contract.
export const DEFAULT_GAME_CONFIG: GameConfig = {
  orchestration: {
    boardSize: 21,
    snakesPerTeam: 5,
    hazardPercentage: 0,
    fertileGround: { density: 30, clustering: 10 },
  },
  runtime: {
    maxHealth: 100,
    maxTurns: 100,
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
  },
};

// spec: 01-REQ-053..058 (Section 3.4)
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

// spec: 01-REQ-052 (Section 2.11) — closed discriminated union.
export type DeathCause =
  | "wall"
  | "self_collision"
  | "body_collision"
  | "head_to_head"
  | "health_depletion";

// Damage-claim sources reported on health_depletion deaths (01-REQ-046d).
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
      // contributed to the fatal health resolution (01-REQ-046d).
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
      readonly cell: Cell;
      readonly healthRestored: number;
    }
  | {
      readonly kind: "potion_collected";
      readonly snakeId: SnakeId;
      readonly cell: Cell;
      readonly potionType: typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion;
      readonly affectedTeammateIds: ReadonlyArray<SnakeId>;
    }
  | {
      readonly kind: "food_spawned";
      readonly itemId: ItemId;
      readonly cell: Cell;
    }
  | {
      readonly kind: "potion_spawned";
      readonly itemId: ItemId;
      readonly cell: Cell;
      readonly potionType: typeof ItemType.InvulnPotion | typeof ItemType.InvisPotion;
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
    };

// spec: 01-REQ-061 (Section 3.6)
export interface BoardGenerationFailure {
  readonly code: "HAZARD_CONNECTIVITY" | "TERRITORY_PARITY_SHORTAGE" | "INITIAL_FOOD_SHORTAGE";
  readonly attemptsUsed: 4;
  readonly details: {
    readonly centaurTeamId?: CentaurTeamId;
    readonly innerCellCount: number;
    readonly eligibleCellCount?: number;
  };
}

// spec: Section 3.8
export interface StagedMove {
  readonly direction: Direction;
  readonly stagedBy: Agent; // never null on input; absence = omit the map entry
}

// spec: Section 3.8 (resolved 01-REVIEW-013). The canonical aggregate of the
// four game-state components; module 04 assembles this shape from its tables.
export interface GameState {
  readonly board: Board;
  readonly snakes: ReadonlyArray<SnakeState>;
  readonly items: ReadonlyArray<ItemState>;
  readonly clocks: ReadonlyArray<CentaurTeamClockState>;
}
