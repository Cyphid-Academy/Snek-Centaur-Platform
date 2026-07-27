// spec: identity-and-authorization/identity-kinds, game-lifecycle/game-record
// Convex Component: snek-platform
// Owns platform-wide tables: users, rooms, games, replays, api_keys, webhooks.
// This is a typed skeleton — implementation deferred.

// ---------------------------------------------------------------------------
// Table record types
// spec: accounts-and-profiles/user-record (users), team-management/team-record
//       (centaur_teams), rooms-and-matchmaking/room-record (rooms),
//       game-lifecycle/game-record (games)
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
  readonly finishedAt: number | null;
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
// The game-start invitation: a bare notification that wakes a possibly-idle
// server and asks whether it will operate this team in this game. Carries no
// credential and confers nothing; the response status is the whole answer.
// spec: team-server-management/game-invitations
// ---------------------------------------------------------------------------

export interface GameInvitation {
  readonly gameId: string;
  readonly teamId: string;
}

// ---------------------------------------------------------------------------
// What a Centaur Server reads about a game once it has accepted and
// authenticated for the team. Carries no credential: the server obtains its
// own session and access token.
// spec: team-server-management/invitation-acceptance#accepting-then-authenticating
// ---------------------------------------------------------------------------

export interface TeamGameContext {
  readonly gameId: string;
  readonly teamId: string;
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
