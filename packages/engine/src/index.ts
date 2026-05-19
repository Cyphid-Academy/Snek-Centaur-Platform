// spec: 01-REQ-001, 02-REQ-034
// Shared game engine — domain types, turn resolution, collision detection.
// All runtimes (SpacetimeDB, Centaur Server, web clients) import from here.
// No feature code exists yet — this is a typed skeleton.

// ---------------------------------------------------------------------------
// Direction
// ---------------------------------------------------------------------------

export type Direction = "Up" | "Right" | "Down" | "Left";

// ---------------------------------------------------------------------------
// Cell types
// ---------------------------------------------------------------------------

export type CellType = "Normal" | "Wall" | "Hazard" | "Fertile";

export interface Cell {
  readonly x: number;
  readonly y: number;
  readonly type: CellType;
}

// ---------------------------------------------------------------------------
// Board geometry
// ---------------------------------------------------------------------------

export type BoardSize = "Small" | "Medium" | "Large" | "Giant";

export interface BoardDimensions {
  readonly width: number;
  readonly height: number;
}

export interface Board {
  readonly size: BoardSize;
  readonly dimensions: BoardDimensions;
  readonly cells: ReadonlyArray<ReadonlyArray<Cell>>;
}

// ---------------------------------------------------------------------------
// Item types
// ---------------------------------------------------------------------------

export type ItemType = "Food" | "InvulnerabilityPotion" | "InvisibilityPotion";

export interface Item {
  readonly id: string;
  readonly type: ItemType;
  readonly x: number;
  readonly y: number;
}

// ---------------------------------------------------------------------------
// Effect types
// ---------------------------------------------------------------------------

export type EffectFamily = "Invulnerability" | "Invisibility";
export type EffectKind = "Buff" | "Debuff";

export interface Effect {
  readonly family: EffectFamily;
  readonly kind: EffectKind;
  readonly turnsRemaining: number;
}

// ---------------------------------------------------------------------------
// Snake state
// ---------------------------------------------------------------------------

export interface SnakeSegment {
  readonly x: number;
  readonly y: number;
}

export interface Snake {
  readonly id: string;
  readonly teamId: string;
  readonly letter: string;
  readonly segments: ReadonlyArray<SnakeSegment>;
  readonly health: number;
  readonly maxHealth: number;
  readonly invulnerabilityLevel: number;
  readonly effects: ReadonlyArray<Effect>;
  readonly alive: boolean;
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export interface GameState {
  readonly gameId: string;
  readonly turn: number;
  readonly board: Board;
  readonly snakes: ReadonlyArray<Snake>;
  readonly items: ReadonlyArray<Item>;
  readonly teamIds: ReadonlyArray<string>;
}

// ---------------------------------------------------------------------------
// Turn input / output
// ---------------------------------------------------------------------------

export interface StagedMoves {
  readonly [snakeId: string]: Direction;
}

export interface TurnResult {
  readonly nextState: GameState;
  readonly events: ReadonlyArray<TurnEvent>;
}

// ---------------------------------------------------------------------------
// Turn events (closed enumeration)
// ---------------------------------------------------------------------------

export type TurnEvent =
  | {
      readonly type: "SnakeMoved";
      readonly snakeId: string;
      readonly direction: Direction;
      readonly stagedBy: string;
    }
  | { readonly type: "SnakeDied"; readonly snakeId: string; readonly cause: DeathCause }
  | { readonly type: "SnakeSevered"; readonly snakeId: string; readonly segmentsRemoved: number }
  | { readonly type: "FoodConsumed"; readonly snakeId: string; readonly itemId: string }
  | {
      readonly type: "PotionConsumed";
      readonly snakeId: string;
      readonly itemId: string;
      readonly family: EffectFamily;
    }
  | {
      readonly type: "EffectExpired";
      readonly snakeId: string;
      readonly family: EffectFamily;
      readonly kind: EffectKind;
    }
  | { readonly type: "ItemSpawned"; readonly item: Item }
  | { readonly type: "TurnTimeExpired"; readonly teamId: string }
  | {
      readonly type: "GameEnded";
      readonly winnerTeamId: string | null;
      readonly reason: WinReason;
    };

export type DeathCause =
  | "WallCollision"
  | "BodyCollision"
  | "HeadToHead"
  | "HealthDepleted"
  | "HazardDamage";

export type WinReason = "LastTeamStanding" | "HealthTimeout" | "AdminTerminated";

// ---------------------------------------------------------------------------
// resolveTurn — authoritative turn resolution
// spec: 01-REQ-050, 02-REQ-034
// ---------------------------------------------------------------------------

/**
 * Resolve one complete turn of Team Snek game logic.
 * Implements all eleven turn-resolution phases from spec module 01.
 *
 * @throws Error("not implemented") — implementation is deferred to the first
 *   SpacetimeDB implementation task (packages/stdb).
 */
export function resolveTurn(_state: GameState, _moves: StagedMoves): TurnResult {
  throw new Error("not implemented");
}

// ---------------------------------------------------------------------------
// Validation helpers — stubs
// ---------------------------------------------------------------------------

/**
 * Returns true if the given direction is a legal staged move for the snake.
 * @throws Error("not implemented")
 */
export function isValidMove(_state: GameState, _snakeId: string, _direction: Direction): boolean {
  throw new Error("not implemented");
}
