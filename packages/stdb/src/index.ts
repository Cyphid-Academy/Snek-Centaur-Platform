// spec: game-lifecycle/instance-initialization, turn-pacing/in-game-clock, live-game-observation/invisibility-filtering
// SpacetimeDB TypeScript module skeleton.
// Implements authoritative turn resolution, RLS, and chess timer.
// All source files are typed stubs — implementation deferred.

export type {
  Direction,
  GameState,
  StagedMove,
  TurnResolution,
  TurnEvent,
  SnakeState,
  Board,
  Item,
  ItemsByCell,
} from "@cyphid/snek-engine";
// GameState.items assembly from active item_lifetimes rows.
export { itemsByCell } from "@cyphid/snek-engine";

// ---------------------------------------------------------------------------
// SpacetimeDB reducer stubs
// spec: game-lifecycle/instance-initialization (initialize_game),
//       operator-control/staged-move-log (stage_move),
//       turn-pacing/turn-declaration (declare_turn_over),
//       turn-pacing/exactly-once-resolution (resolve_turn)
// ---------------------------------------------------------------------------

export interface InitializeGameParams {
  readonly gameId: string;
  readonly boardSeed: string;
  readonly teamIds: ReadonlyArray<string>;
  readonly config: GameConfig;
}

export interface GameConfig {
  readonly boardSize: string;
  readonly snakesPerTeam: number;
  readonly hazardPercent: number;
  readonly fertileGround: boolean;
  readonly foodSpawnRate: number;
  readonly potionSpawnRate: number;
  readonly chessTimerBudgetMs: number;
  readonly chessTimerIncrementMs: number;
  readonly chessTimerMaxMs: number;
}

/**
 * Initialize a new game in SpacetimeDB.
 * @throws Error("not implemented")
 */
export function initializeGame(_params: InitializeGameParams): void {
  throw new Error("not implemented");
}

/**
 * Stage a move for a snake.
 * @throws Error("not implemented")
 */
export function stageMove(_gameId: string, _snakeId: string, _direction: string): void {
  throw new Error("not implemented");
}

/**
 * Declare that a team has finished their turn deliberation.
 * @throws Error("not implemented")
 */
export function declareTurnOver(_gameId: string, _teamId: string): void {
  throw new Error("not implemented");
}

/**
 * Resolve the current turn — called by the scheduler when all teams have
 * declared or the turn deadline has expired.
 * @throws Error("not implemented")
 */
export function resolveTurnReducer(_gameId: string): void {
  throw new Error("not implemented");
}
