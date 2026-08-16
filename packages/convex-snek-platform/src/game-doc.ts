// The games-table document: its inferred type, the codec between the stored
// document and the pure ConfigRecordState the state machine operates on, and
// the redacted public view every game client reads.
//
// The codec is deliberately dumb: hex-encode/decode the seed, and otherwise
// pass values through. The casts between stored shapes and engine-typed
// shapes are sound because mirror-guard.ts proves the two sides equal
// field-for-field modulo `readonly` and brands (see MirrorShape's contract) —
// a cast here can only be wrong if that guard has already failed the build.
// spec: game-configuration/engine-schema-fidelity#no-translation-at-handoff
import type {
  ConfigRecordState,
  GamePhase,
  GeneratedInitialState,
  PreviewSlot,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";
import type { ConfigRejection } from "@cyphid/snek-game-configuration";
import type { ObjectType } from "convex/values";
import { bytesToHex, hexToBytes } from "./hex.js";
import type { gameFields } from "./validators.js";

/** The games table's stored fields, exactly as the schema validates them. */
export type GameDocFields = ObjectType<typeof gameFields>;

/** A stored games document: the fields plus Convex's system columns. */
export type GameDoc = GameDocFields & {
  readonly _id: string;
  readonly _creationTime: number;
};

// ---------------------------------------------------------------------------
// Public view — what any game client may see of a game record.
// ---------------------------------------------------------------------------

/**
 * The preview slot as clients see it: the generator's result only. The seed
 * is stripped unconditionally — it is accessible to no game client, in any
 * phase, through any public return.
 * spec: game-configuration/board-generation-retry
 */
export interface GamePreviewView {
  readonly result: GeneratedInitialState | PreviewFailure;
}

/** The failure arm of a preview result (re-derived so this file stays type-only over the union). */
export type PreviewFailure = Exclude<PreviewSlot["result"], GeneratedInitialState>;

/**
 * The public rendering of a game record. `startingState` is null while
 * `startingStateHidden` is set: an unlocked launch's fresh board is shown in
 * no configuration-mode view and first becomes visible through gameplay
 * delivery once the game is under way.
 * spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
 */
export interface GamePublicView {
  readonly gameId: string;
  readonly roomId: string | null;
  readonly phase: GamePhase;
  readonly config: ConfigRecordState["config"];
  readonly teams: ReadonlyArray<TeamRegistration>;
  readonly currentPreview: GamePreviewView | null;
  readonly boardLocked: boolean;
  readonly startingState: GeneratedInitialState | null;
  readonly startingStateHidden: boolean;
}

// ---------------------------------------------------------------------------
// Structured results — the one convention every game function uses.
// ---------------------------------------------------------------------------

/**
 * Every rejection a game write can return: the pure state machine's own
 * rejections, plus the two conditions only the store can detect. Returned as
 * data (never thrown) so every surface can render them legibly.
 * spec: game-configuration/infeasibility-surfaced
 * spec: global-invariants/client-truthfulness#rejections-reach-the-user
 */
export type GameRejection =
  | ConfigRejection
  | { readonly kind: "game-not-found" }
  // spec: game-configuration/config-lives-on-the-game#one-game-configured-at-a-time
  | { readonly kind: "room-occupied"; readonly openGameId: string };

/** The uniform mutation result: the transitioned record's public view, or a structured rejection. */
export type GameWriteResult =
  | { readonly ok: true; readonly game: GamePublicView }
  | { readonly ok: false; readonly rejection: GameRejection };

export type CreateGameResult =
  | { readonly ok: true; readonly gameId: string; readonly game: GamePublicView }
  | { readonly ok: false; readonly rejection: GameRejection };

// ---------------------------------------------------------------------------
// Codec
// ---------------------------------------------------------------------------

/**
 * Rebrand stored team rows as TeamRegistration. Sound because TEAM_MIRROR
 * (mirror-guard.ts) proves the two shapes equal modulo the CentaurTeamId
 * brand, which has no serialized rendering — the `unknown` hop exists only
 * because TS refuses a direct downcast onto a brand.
 */
export function asTeamRegistrations(
  teams: ReadonlyArray<{ centaurTeamId: string; name: string }>,
): ReadonlyArray<TeamRegistration> {
  return teams as unknown as ReadonlyArray<TeamRegistration>;
}

/** Stored document -> the pure state machine's record state. */
export function docToRecord(doc: GameDocFields): ConfigRecordState {
  return {
    phase: doc.phase,
    config: doc.config,
    teams: asTeamRegistrations(doc.teams),
    currentPreview:
      doc.currentPreview === null
        ? null
        : {
            seed: hexToBytes(doc.currentPreview.seedHex),
            // Mirror-guarded cast (INITIAL_STATE_MIRROR / GENERATION_FAILURE_MIRROR).
            result: doc.currentPreview.result as PreviewSlot["result"],
          },
    boardLocked: doc.boardLocked,
    // Mirror-guarded cast (INITIAL_STATE_MIRROR).
    startingState: doc.startingState as GeneratedInitialState | null,
    startingStateHidden: doc.startingStateHidden,
  };
}

/** The pure record state -> the stored document's fields (roomId travels beside the record, it is not configuration state). */
export function recordToFields(record: ConfigRecordState, roomId: string | null): GameDocFields {
  return {
    roomId,
    phase: record.phase,
    config: record.config,
    teams: [...record.teams],
    currentPreview:
      record.currentPreview === null
        ? null
        : {
            seedHex: bytesToHex(record.currentPreview.seed),
            // Mirror-guarded cast: the engine-typed result IS the stored
            // shape modulo readonly/brands, which serialization erases.
            result: record.currentPreview.result as NonNullable<
              GameDocFields["currentPreview"]
            >["result"],
          },
    boardLocked: record.boardLocked,
    startingState: record.startingState as GameDocFields["startingState"],
    startingStateHidden: record.startingStateHidden,
  };
}

/**
 * The redacted public rendering: seed stripped from the preview slot, and the
 * starting state withheld while it is hidden.
 * spec: game-configuration/board-generation-retry ("accessible to no game client")
 * spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
 */
export function toPublicView(
  gameId: string,
  roomId: string | null,
  record: ConfigRecordState,
): GamePublicView {
  return {
    gameId,
    roomId,
    phase: record.phase,
    config: record.config,
    teams: record.teams,
    currentPreview:
      record.currentPreview === null ? null : { result: record.currentPreview.result },
    boardLocked: record.boardLocked,
    startingState: record.startingStateHidden ? null : record.startingState,
    startingStateHidden: record.startingStateHidden,
  };
}
