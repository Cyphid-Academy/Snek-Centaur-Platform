// spec: identity-and-authorization/identity-kinds, game-lifecycle/game-record
// Convex Component: snek-platform
// Owns platform-wide tables: users, rooms, games, replays, api_keys, webhooks.
//
// What lives here: typed skeletons for tables their own capability changes
// have yet to define, and the cross-package shapes a consumer reads.
//
// **A skeleton may forward-declare a table; it may not re-declare a type
// somebody else owns.** Twice now a re-declaration here drifted with nothing
// to catch it — a `GameConfigRecord` wrong on nearly every field that
// `@cyphid/centaur-server-lib` re-exported to bot authors as the public SDK,
// and a set of interfaces restating seven `convex/schema.ts` tables, one
// silently missing the security-critical `challenge` field. So a table
// `convex/schema.ts` owns appears here not at all (its type is `Infer<>` of
// its validator, exported from the schema itself, so a rename is a compile
// error), and the authority for shapes is imported.
//
// `game-configuration` owns the generation half
// and mirrors the engine's runtime half by reference, which is what
// `global-invariants/engine-mirrors-are-guarded` asks of a mirror — and the
// cheapest way to satisfy an invariant about mirrors is to hold no mirror.
// spec: global-invariants/engine-mirrors-are-guarded
import type {
  BoardGenerationFailure,
  GameConfig,
  GeneratedInitialState,
} from "@cyphid/snek-game-configuration";

// ---------------------------------------------------------------------------
// Table record types
// spec: accounts-and-profiles/user-record (users), team-management/team-record
//       (centaur_teams), rooms-and-matchmaking/room-record (rooms),
//       game-lifecycle/game-record (games)
// ---------------------------------------------------------------------------

// spec: identity-and-authorization/linked-provider-credentials
// The durable record behind a human identity, and the thing every other record
// references.
//
// It carries no provider subject. A provider account is a credential *linked
// to* this record, and the linkage — the provider, plus that provider's
// immutable subject — is a record of its own, so the subject appears in exactly
// one place and authentication resolves through that linkage and nothing else.
// A `googleSub` column here would be a second lookup path and a second place
// for the mapping to drift, which is what the one-to-one guarantee exists to
// prevent; it is also what keeps the eventual move onto a central Cyphid
// identity service a re-pointing of one table rather than a reconciliation of
// histories. The linkage record itself lands with the change that owns
// issuance.
//
// `email` stays, as a profile attribute for display, notification, and
// inviting someone who has no account yet — never an identity key and never a
// join key.
// The admin designation is not a column here: it is the `platform_admins`
// table in `convex/schema.ts`. A boolean on the user record would be a second
// place the designation could be read from, and the one a session or a minted
// credential would end up copying — which is exactly what
// `#role-effective-without-reload` forbids.
// spec: identity-and-authorization/platform-admin-role
export interface UserRecord {
  readonly _id: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: number;
}

export interface RoomRecord {
  readonly _id: string;
  readonly ownerUserId: string;
  readonly name: string;
  readonly enrolledTeamIds: ReadonlyArray<string>;
  readonly currentGameId: string | null;
  readonly config: GameConfig;
  readonly createdAt: number;
}

export type GameStatus = "not-started" | "playing" | "finished";

/**
 * One participating team as the roster snapshot recorded it when the game was
 * initialized. Membership and coach designations are copied in at that moment,
 * so the answer a running game gives cannot move when a team record does.
 *
 * spec: identity-and-authorization/roster-snapshot-binding
 */
export interface ParticipantSnapshotRecord {
  readonly teamId: string;
  readonly memberUserIds: ReadonlyArray<string>;
  readonly coachUserIds: ReadonlyArray<string>;
}

/**
 * The board a preview regeneration produced, or the structured reason there is
 * none — the game's ONE current-preview value, overwritten by each
 * regeneration and never accumulated into an archive. `null` is a game whose
 * preview has not been generated yet.
 *
 * The generated arm is the generator's own `GeneratedInitialState`, imported
 * rather than restated: a preview a surface renders and a board a launch
 * designates are the same document, and a second spelling of it here is the
 * re-declaration this file's header forbids.
 *
 * spec: game-configuration/board-preview#one-slot-no-archive
 * spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
 */
export type BoardPreviewRecord =
  | ({ readonly kind: "generated" } & GeneratedInitialState)
  | ({ readonly kind: "infeasible" } & BoardGenerationFailure)
  | null;

/**
 * A game in its minimal form: the status token issuance re-reads at the moment
 * of every request, the roster snapshot every other authorization question
 * about the game is answered from, and the configuration record this game is
 * shaped by — held on the game record itself, which is configuration's sole
 * source of truth for this game. There is no `teamIds` beside the snapshot — a
 * second list of participants is a second answer waiting to disagree with the
 * first.
 *
 * `boardSeed` is absent from this interface as it is absent from every query
 * result: the seed every random choice generation makes is drawn from is
 * accessible to no game client, so nothing outside the component's own write
 * path holds a type for it.
 *
 * migrate-game-lifecycle adds the room, the instance attachment and the
 * outcome to this same record; it does not introduce a second one.
 *
 * spec: identity-and-authorization/live-game-issuance
 * spec: identity-and-authorization/roster-snapshot-binding
 * spec: game-configuration/config-lives-on-the-game#the-game-record-starts-minimal
 * spec: game-configuration/board-generation-retry
 */
export interface GameRecord {
  readonly _id: string;
  readonly status: GameStatus;
  readonly roster: ReadonlyArray<ParticipantSnapshotRecord>;
  readonly config: GameConfig;
  readonly boardPreview: BoardPreviewRecord;
  readonly boardPreviewLocked: boolean;
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
  readonly config: GameConfig;
}
