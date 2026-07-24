// spec: 03-REQ-001, 05-REQ-001
// Convex Component: snek-platform
// Owns platform-wide tables: users, rooms, games, replays, api_keys, webhooks.
// This is a typed skeleton — implementation deferred.

// ---------------------------------------------------------------------------
// Table record types
// spec: 05-REQ-004 (users), 05-REQ-020 (centaur_teams),
//       05-REQ-030 (rooms), 05-REQ-040 (games)
// ---------------------------------------------------------------------------

export interface UserRecord {
  readonly _id: string;
  readonly email: string;
  readonly googleSub: string;
  readonly displayName: string;
  readonly isAdmin: boolean;
  readonly createdAt: number;
}

export interface CentaurTeamRecord {
  readonly _id: string;
  readonly name: string;
  readonly captainUserId: string;
  readonly nominatedServerDomain: string | null;
  readonly createdAt: number;
}

export interface RoomRecord {
  readonly _id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly enrolledTeamIds: ReadonlyArray<string>;
  readonly currentGameId: string | null;
  readonly config: GameConfigRecord;
  readonly createdAt: number;
}

export interface GameConfigRecord {
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

export type GameStatus = "not-started" | "playing" | "finished";

export interface GameRecord {
  readonly _id: string;
  readonly roomId: string;
  readonly status: GameStatus;
  readonly teamIds: ReadonlyArray<string>;
  readonly config: GameConfigRecord;
  readonly stdbInstanceId: string | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly winnerTeamId: string | null;
}

export interface ReplayRecord {
  readonly _id: string;
  readonly gameId: string;
  readonly turnLog: unknown;
  readonly createdAt: number;
}

export interface ApiKeyRecord {
  readonly _id: string;
  readonly keyHash: string;
  readonly ownerUserId: string;
  readonly description: string;
  readonly createdAt: number;
  readonly revokedAt: number | null;
}

export interface WebhookRecord {
  readonly _id: string;
  readonly ownerUserId: string;
  readonly url: string;
  readonly events: ReadonlyArray<"game_start" | "game_end">;
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// Game invitation payload
// spec: 03-REQ-050, 05-REQ-060
// ---------------------------------------------------------------------------

export interface GameInvitationPayload {
  readonly gameId: string;
  readonly teamId: string;
  readonly gameCredential: string;
  readonly stdbInstanceUrl: string;
  readonly boardSeed: string;
  readonly config: GameConfigRecord;
}

// ---------------------------------------------------------------------------
// Convex Component config — placeholder
// ---------------------------------------------------------------------------

export const componentConfig = {
  name: "snek-platform",
} as const;
