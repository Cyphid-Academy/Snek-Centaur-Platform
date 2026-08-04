// spec: bot-framework/embedded-team-player
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
  GameInvitation,
  TeamGameContext,
  GameRecord,
} from "@cyphid/convex-snek-platform";

// Credential custody: the assertion a Server signs to prove who it is, the
// proactive renewal schedule, and the memory-only hold on what it earns.
export {
  type CredentialHandle,
  type GameScope,
  type Redeem,
  type Renewal,
  type ServerIdentity,
  holdGameCredential,
  renewalAction,
  signAssertion,
} from "./credentials";

export type {
  DriveRecord,
  CentaurActionRecord,
  SnakeConfigRecord,
} from "@cyphid/convex-centaur-state";

// ---------------------------------------------------------------------------
// The enumerated fork compatibility surface: the three — and only three —
// HTTP endpoints the platform touches on a Snek Centaur Server's own domain.
// These are spec'd values, not mechanism: they are fixed platform-wide, and
// altering one is a deliberate breaking change to every fork. Read them from
// here rather than re-typing the strings, so the conformance suite and the
// drift check test what the platform actually calls.
//
// The converse matters as much and is part of the same contract: the platform
// reserves NOTHING outside the `/.well-known/snek-` prefix. Everything else
// on a server's domain belongs to its fork — including the short obvious
// names (`/healthcheck`, `/admin`) a fork will want for its own pages.
// spec: centaur-server-runtime/forkable-reference-app#enumerated-surface-is-the-contract
// spec: centaur-server-runtime/forkable-reference-app#the-rest-of-the-path-space-is-the-forks
// ---------------------------------------------------------------------------

export const WELL_KNOWN_PATHS = {
  /**
   * Game-start invitation: a bare notification the platform POSTs to wake the
   * server. Carries no credential and confers nothing.
   * spec: team-server-management/game-invitations
   */
  gameInvite: "/.well-known/snek-game-invite",
  /**
   * Published verification material for the server's own signing key (a JWK
   * Set). Deliberately not `jwks.json`: that suffix is unregistered, implies
   * an OIDC discovery surface a Centaur Server does not publish, and collides
   * in meaning with the platform's own OIDC document at the same relative
   * path.
   * spec: centaur-server-runtime/server-key-publication
   */
  serverKeys: "/.well-known/snek-server-keys",
  /**
   * Unauthenticated liveness. Under the well-known prefix rather than at the
   * conventional `/health` root because the convention exists for clients
   * that must guess the path, and the only caller here is the platform,
   * which is handed the domain by a captain and holds a fixed contract.
   * spec: team-server-management/server-healthcheck
   */
  healthcheck: "/.well-known/snek-healthcheck",
} as const;

export type WellKnownPath = (typeof WELL_KNOWN_PATHS)[keyof typeof WELL_KNOWN_PATHS];

// ---------------------------------------------------------------------------
// Healthcheck contract
// spec: team-server-management/server-healthcheck
// ---------------------------------------------------------------------------

// Liveness only. Team-scoped state (how many teams this server hosts, which
// ones, whether any are playing) is deliberately absent: the endpoint answers
// anyone without a credential, so enriching it would change the threat model.
// spec: centaur-server-runtime/healthcheck-endpoint#unauthenticated-and-minimal
export interface HealthcheckResponse {
  readonly status: "ok";
  readonly version: string;
}

// ---------------------------------------------------------------------------
// Game-start invitation handler. The platform POSTs a bare notification to
// wake the server; the response status is accept or decline, decided from the
// whitelist alone. Nothing in the request is trusted or verified — the server
// authenticates outward afterwards to obtain anything it can act on.
// spec: team-server-management/game-invitations#the-invitation-carries-no-authority
// ---------------------------------------------------------------------------

export interface GameInvitationHandler {
  /**
   * Answer a game-start invitation.
   * spec: team-server-management/invitation-acceptance
   * @throws Error("not implemented")
   */
  handleInvitation(
    invitation: import("@cyphid/convex-snek-platform").GameInvitation,
  ): Promise<{ accepted: boolean }>;
}

// ---------------------------------------------------------------------------
// Team whitelist — this server's half of two-sided consent. Asking the
// platform for a team's session is the act of admission, so whitelisting and
// a captain naming this domain are independent and order-independent.
// spec: team-server-management/whitelist-admission
// ---------------------------------------------------------------------------

export interface TeamWhitelist {
  /** Whether this server will operate the given team. */
  has(teamId: string): Promise<boolean>;
  /**
   * Admit a team. Idempotent: admitting an already-admitted team succeeds
   * unchanged, so an automation may retry freely.
   * spec: centaur-server-runtime/server-administration-api#adding-an-already-whitelisted-team-succeeds
   * @throws Error("not implemented")
   */
  add(teamId: string): Promise<void>;
  /** Stop operating a team. Idempotent. @throws Error("not implemented") */
  remove(teamId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Bot framework — Drive and Preference abstractions
// spec: bot-framework/heuristic-vocabulary
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
// spec: bot-framework/embedded-team-player, bot-framework/heuristic-vocabulary
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
   * Start bot computation for a game the server's hosted team is in.
   * @throws Error("not implemented")
   */
  start(context: import("@cyphid/convex-snek-platform").TeamGameContext): Promise<void>;
  /**
   * Stop bot computation after a game ends.
   * @throws Error("not implemented")
   */
  stop(gameId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Typed Convex component clients — stubs
// spec: bot-framework/embedded-team-player (component client types)
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
  /** Fetch the context for a game this client's team is in. */
  readonly getTeamGameContext: (
    gameId: string,
  ) => Promise<import("@cyphid/convex-snek-platform").TeamGameContext | null>;
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
