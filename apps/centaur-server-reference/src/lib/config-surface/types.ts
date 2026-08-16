// Types the game-configuration surface is written against: the client-visible
// slice of the configuration record, and the mutations a host may offer.
// A surface is written against these two shapes alone, never against what
// backs a binding (application-shell/one-state-binding#a-surface-does-not-know-its-source).
// spec: game-configuration/self-contained-configuration-surface,
// game-configuration/host-selected-affordances
import type {
  BoardGenerationFailure,
  ConfigRejection,
  GameConfig,
  GamePhase,
  GeneratedInitialState,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";

/**
 * The client-visible record: everything a configuration surface renders, and
 * nothing more. Deliberately narrower than `ConfigRecordState`:
 *
 * - No `startingState`/`startingStateHidden` — those exist only once a game
 *   has launched, and this surface's whole edit window is pre-launch
 *   (`game-configuration/launch-freeze`).
 * - `currentPreview` carries no seed. The seed behind a `PreviewSlot` is the
 *   platform's own — never a game client's
 *   (`game-configuration/board-generation-retry`: "that seed SHALL be
 *   accessible to no game client"). `null` means no candidate has been
 *   generated yet (`game-configuration/board-preview#one-slot-no-archive`);
 *   otherwise it is the generator's own all-or-nothing outcome, a success or
 *   a structured infeasibility, never substituted or reinterpreted here.
 */
export interface ConfigSurfaceState {
  readonly phase: GamePhase;
  readonly config: GameConfig;
  readonly teams: ReadonlyArray<TeamRegistration>;
  readonly currentPreview: GeneratedInitialState | BoardGenerationFailure | null;
  readonly boardLocked: boolean;
}

/**
 * A rejection is the record's own structured answer to a write — never
 * re-derived or restated by this surface (`ConfigRejection` is that answer's
 * one declaration, in `@cyphid/snek-game-configuration`).
 */
export type Rejection = ConfigRejection;

/**
 * The mutations a `MutableBinding` may offer this surface. Every mutation
 * resolves to the rejection the record produced, or `null` on success, so a
 * rejection reaches the user at the point of the action that provoked it
 * rather than a boolean the surface would have to reinterpret.
 * spec: global-invariants/client-truthfulness#rejections-reach-the-user
 */
export interface ConfigSurfaceMutations {
  readonly updateConfig: (config: GameConfig) => Promise<Rejection | null>;
  readonly updateRoster: (teams: ReadonlyArray<TeamRegistration>) => Promise<Rejection | null>;
  readonly setBoardLock: (locked: boolean) => Promise<Rejection | null>;
}
