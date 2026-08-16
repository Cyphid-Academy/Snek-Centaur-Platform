// @cyphid/convex-snek-platform — the Convex Component owning platform-wide
// tables. Mounted by @cyphid/snek-convex-host via `component/convex.config.ts`
// (exported as "@cyphid/convex-snek-platform/convex.config").
//
// What is REAL today: the `games` table in its minimal form — the game's
// identity plus the configuration this capability owns — and the component
// functions over it (component/games.ts). Every other table arrives with the
// story that owns it and extends this same component.
// spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
//
// This src/ layer is the component's client-facing surface: the validators
// (shared by the component schema and the host's argument declarations), the
// mirror guard, the document codec, and the typed shapes downstream packages
// consume. The runtime component itself lives in component/.

// ---------------------------------------------------------------------------
// The games table — real, implemented in component/.
// ---------------------------------------------------------------------------

export {
  gameConfigValidator,
  gameFields,
  generationConfigValidator,
  generationFailureValidator,
  initialStateValidator,
  previewSlotValidator,
  runtimeConfigValidator,
  teamValidator,
} from "./validators.js";
export type {
  CreateGameResult,
  GameDoc,
  GameDocFields,
  GamePreviewView,
  GamePublicView,
  GameRejection,
  GameWriteResult,
  PreviewFailure,
} from "./game-doc.js";
export { docToRecord, recordToFields, toPublicView } from "./game-doc.js";
export { bytesToHex, hexToBytes } from "./hex.js";
export type { MirrorShape } from "./mirror-guard.js";
// Importing the guard for its side effect of existing in the build: the
// assertions are constants, so any mirror drift fails this package's tsc.
// spec: global-invariants/engine-mirrors-are-guarded#drift-fails-the-build
export {
  GAME_CONFIG_MIRROR,
  GENERATION_CONFIG_MIRROR,
  GENERATION_FAILURE_MIRROR,
  INITIAL_STATE_MIRROR,
  RUNTIME_CONFIG_MIRROR,
  TEAM_MIRROR,
} from "./mirror-guard.js";

/**
 * A launched-or-finished game's record as clients read it. Kept under its
 * historical name for downstream skeletons (centaur-server-lib); the real
 * shape is the redacted public view.
 */
export type { GamePublicView as GameRecord } from "./game-doc.js";

// ---------------------------------------------------------------------------
// Typed skeletons for tables that arrive with LATER stories. These are
// deliberately types-only: no schema, no functions, no claim of existence.
// spec: accounts-and-profiles/user-record, team-management/team-record,
//       rooms-and-matchmaking/room-record
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

// The room holds NO configuration state of its own: every game carries its
// own record, and at most one game per room is open for configuration at a
// time. (The pre-implementation skeleton carried a room-level config field;
// it is gone deliberately, not accidentally.)
// spec: game-configuration/config-lives-on-the-game
export interface RoomRecord {
  readonly _id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly enrolledTeamIds: ReadonlyArray<string>;
  readonly currentGameId: string | null;
  readonly createdAt: number;
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
// own session and access token. Carries no seed either — the game seed is
// accessible to no game client (spec: game-configuration/board-generation-retry)
// — and only the dynamic gameplay half of the configuration: the generation
// half is consumed platform-side and never forwarded.
// spec: game-configuration/generation-parameter-boundary#only-the-gameplay-subtree-crosses
// spec: team-server-management/invitation-acceptance#accepting-then-authenticating
// ---------------------------------------------------------------------------

export interface TeamGameContext {
  readonly gameId: string;
  readonly teamId: string;
  readonly stdbInstanceUrl: string;
  readonly config: import("@cyphid/snek-engine").GameRuntimeConfig;
}
