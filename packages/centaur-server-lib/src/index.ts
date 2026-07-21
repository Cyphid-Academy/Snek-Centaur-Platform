// spec: 07-REQ-001
// Centaur Server Library — bot framework + invitation handler + healthcheck.
// Teams use this library to build their Centaur Server implementation.
// This is a typed skeleton — implementation deferred.

export type {
  Direction,
  GameState,
  SnakeState,
  Board,
  Item,
  ItemsByCell,
  PotionEffect,
  EffectFamily,
  TurnEvent,
} from "@cyphid/snek-engine";

export type {
  GameInvitationPayload,
  GameRecord,
} from "@cyphid/convex-snek-platform";

export type {
  DriveRecord,
  CentaurActionRecord,
  SnakeConfigRecord,
} from "@cyphid/convex-centaur-state";

// ---------------------------------------------------------------------------
// Healthcheck contract
// spec: 08-REQ-010 (healthcheck endpoint at /.well-known/snek-game-invite)
// ---------------------------------------------------------------------------

export interface HealthcheckResponse {
  readonly status: "ok";
  readonly version: string;
  readonly activeTeamCount: number;
}

// ---------------------------------------------------------------------------
// Game invitation handler
// spec: 03-REQ-050, 08-REQ-020
// ---------------------------------------------------------------------------

export interface GameInvitationHandler {
  /**
   * Called by the framework when Convex POSTs to /.well-known/snek-game-invite.
   * Must return accepted:true to join the game, or accepted:false to refuse.
   * @throws Error("not implemented")
   */
  handleInvitation(
    payload: import("@cyphid/convex-snek-platform").GameInvitationPayload,
  ): Promise<{ accepted: boolean }>;
}

// ---------------------------------------------------------------------------
// Bot framework — Drive and Preference abstractions
// spec: 07-REQ-010, 07-REQ-020
// ---------------------------------------------------------------------------

export type Target =
  | { readonly kind: "Snake"; readonly snakeId: string }
  | { readonly kind: "Cell"; readonly x: number; readonly y: number };

export interface Drive<T extends Target = Target> {
  readonly type: string;
  readonly target: T;
  readonly weight: number;
  /**
   * Reward function over simulated board configurations.
   * @throws Error("not implemented")
   */
  reward(state: import("@cyphid/snek-engine").GameState, snakeId: string): number;
  /**
   * Distance function in author-defined terms (not necessarily grid distance).
   * @throws Error("not implemented")
   */
  distance(state: import("@cyphid/snek-engine").GameState, snakeId: string): number;
  /**
   * Returns true when this Drive's goal is satisfied.
   * @throws Error("not implemented")
   */
  isSatisfied(state: import("@cyphid/snek-engine").GameState, snakeId: string): boolean;
}

export interface Preference {
  readonly type: string;
  readonly weight: number;
  /**
   * Scalar heuristic over board state, independent of any specific target.
   * @throws Error("not implemented")
   */
  evaluate(state: import("@cyphid/snek-engine").GameState, snakeId: string): number;
}

export interface Portfolio {
  readonly snakeId: string;
  readonly drives: ReadonlyArray<Drive>;
  readonly preferences: ReadonlyArray<Preference>;
}

// ---------------------------------------------------------------------------
// defineBot — entry point for teams building a Centaur Server
// spec: 07-REQ-001
// ---------------------------------------------------------------------------

export interface BotDefinition {
  readonly drives: ReadonlyArray<new (target: Target, weight: number) => Drive>;
  readonly preferences: ReadonlyArray<new (weight: number) => Preference>;
}

/**
 * Define the bot implementation for a Centaur Server.
 * Returns a bot runner instance ready to be wired into the server.
 * @throws Error("not implemented")
 */
export function defineBot(_definition: BotDefinition): BotRunner {
  throw new Error("not implemented");
}

export interface BotRunner {
  /**
   * Start bot computation for a game after accepting an invitation.
   * @throws Error("not implemented")
   */
  start(
    invitationPayload: import("@cyphid/convex-snek-platform").GameInvitationPayload,
  ): Promise<void>;
  /**
   * Stop bot computation after a game ends.
   * @throws Error("not implemented")
   */
  stop(gameId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Typed Convex component clients — stubs
// spec: 07-REQ-050 (component client types)
// ---------------------------------------------------------------------------

/**
 * Placeholder interface for the typed platform component client.
 * Replace with the real Convex-generated client type once the SDK is wired up.
 */
export interface PlatformClient {
  /** Fetch a game record by ID. */
  readonly getGame: (
    gameId: string,
  ) => Promise<import("@cyphid/convex-snek-platform").GameRecord | null>;
  /** Fetch the game invitation payload for this server's team. */
  readonly getInvitation: (
    gameId: string,
  ) => Promise<import("@cyphid/convex-snek-platform").GameInvitationPayload | null>;
}

/**
 * Placeholder interface for the typed centaur-state component client.
 * Replace with the real Convex-generated client type once the SDK is wired up.
 */
export interface CentaurStateClient {
  /** Fetch the current snake selection state for a game. */
  readonly getSnakeConfig: (
    gameId: string,
    snakeId: string,
  ) => Promise<import("@cyphid/convex-centaur-state").SnakeConfigRecord | null>;
  /** Fetch the active drives for a snake in a game. */
  readonly getDrives: (
    gameId: string,
    snakeId: string,
  ) => Promise<ReadonlyArray<import("@cyphid/convex-centaur-state").DriveRecord>>;
}

/**
 * Returns a typed client for the convex-snek-platform component.
 * @throws Error("not implemented")
 */
export function createPlatformClient(_gameCredential: string): PlatformClient {
  throw new Error("not implemented");
}

/**
 * Returns a typed client for the convex-centaur-state component.
 * @throws Error("not implemented")
 */
export function createCentaurStateClient(_gameCredential: string): CentaurStateClient {
  throw new Error("not implemented");
}
