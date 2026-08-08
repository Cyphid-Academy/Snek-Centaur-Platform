// A game's configuration record, held in this dev server's memory.
//
// No host means no auth, no Convex deployment and no session: the surface is
// fully usable over this, and the same component mounted over a `convexBinding`
// against the real deployment is the same component.
// spec: game-configuration/self-contained-configuration-surface#runs-with-no-host
//
// **The rules are not re-implemented here.** Validation, the regeneration
// trigger, the generator and the preview document are the capability package's
// own — the same four the Convex mutation calls — because a second spelling
// would diverge in the mount whose whole purpose is exercising the real
// workflow. Generation runs HERE, on the server, and never in the browser.
// spec: global-invariants/one-shared-generation
// spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
// spec: game-configuration/board-preview#clients-render-never-generate
import { randomBytes } from "node:crypto";
import type { GameConfigurationRecord } from "$lib/surfaces/game-configuration/record";
import type { CentaurTeamId } from "@cyphid/snek-engine";
import type {
  BoardPreview,
  ConfigViolation,
  GameConfig,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";
import {
  DEFAULT_GAME_CONFIG,
  changesGenerationInputs,
  generateBoardAndInitialState,
  previewDocument,
  validateGameConfig,
} from "@cyphid/snek-game-configuration";

/**
 * The roster this dev game is configured for. Fixed, because the roster is
 * `migrate-team-management`'s to edit and generation only reads it — two teams
 * is enough for the pie of starting territories to be a real constraint.
 */
const ROSTER: readonly TeamRegistration[] = [
  { centaurTeamId: "team-red" as CentaurTeamId, name: "Red" },
  { centaurTeamId: "team-blue" as CentaurTeamId, name: "Blue" },
];

interface DevGame {
  config: GameConfig;
  boardPreview: BoardPreview;
  boardPreviewLocked: boolean;
  /** Never leaves this module: no query answers with it. */
  // spec: game-configuration/board-generation-retry
  boardSeed: Uint8Array;
}

/** Why a write was refused, in the structured shape the surface points with. */
export interface ConfigurationRejection {
  readonly kind: "configuration-rejected";
  readonly violations: readonly ConfigViolation[];
}

let game: DevGame | null = null;

/** The one game record, created on first visit with every parameter at default. */
// spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
function current(): DevGame {
  if (game === null) {
    game = {
      config: DEFAULT_GAME_CONFIG,
      boardPreview: null,
      boardPreviewLocked: false,
      boardSeed: new Uint8Array(32),
    };
    regenerate(game, DEFAULT_GAME_CONFIG);
  }
  return game;
}

/** What a configuration surface reads. The seed is not among it. */
export function readRecord(): GameConfigurationRecord {
  const { config, boardPreview, boardPreviewLocked } = current();
  return { config, boardPreview, boardPreviewLocked };
}

/**
 * Edit the configuration, validating the POST-WRITE record and — only when the
 * write changed what a board is generated from — regenerating the preview and
 * clearing the lock, in that one step.
 *
 * spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
 * spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
 */
export function updateConfiguration(update: {
  readonly generation?: unknown;
  readonly runtime?: unknown;
}): ConfigurationRejection | null {
  const record = current();
  const candidate = {
    generation: update.generation ?? record.config.generation,
    runtime: update.runtime ?? record.config.runtime,
  };
  const validation = validateGameConfig(candidate);
  if (!validation.ok) {
    return { kind: "configuration-rejected", violations: validation.violations };
  }
  if (changesGenerationInputs(update)) {
    regenerate(record, validation.config);
  } else {
    record.config = validation.config;
  }
  return null;
}

/** Designate the current preview, or withdraw the designation. No board travels. */
// spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
export function setPreviewLock(locked: boolean): void {
  current().boardPreviewLocked = locked;
}

/** Forget the game, so a suite can start from an untouched record. */
export function resetRecord(): void {
  game = null;
}

function regenerate(record: DevGame, config: GameConfig): void {
  const seed = new Uint8Array(randomBytes(32));
  const result = generateBoardAndInitialState(config, ROSTER, seed);
  record.config = config;
  record.boardSeed = seed;
  record.boardPreview = previewDocument(result);
  // Every regeneration overwrites the one slot and clears the designation: a
  // lock that survived would designate a board its own parameters no longer
  // produce.
  // spec: game-configuration/board-preview#one-slot-no-archive
  record.boardPreviewLocked = false;
}
