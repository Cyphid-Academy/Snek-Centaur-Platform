import type { CentaurTeamId } from "@cyphid/snek-engine";
// The dev harness behind the standalone /dev/game-config route: an
// in-memory `ConfigRecordState` driven entirely by the pure state machine
// `@cyphid/snek-game-configuration` already declares (`applyConfigEdit`,
// `applyRosterChange`, `regeneratePreview`, `setBoardLock`). This is the SAME
// code the platform's Convex mutations will call inside their transactions
// once that wiring lands — the harness stands in for the platform, per
// design.md's "First delivery is that component standing alone in the
// development environment, every affordance offered".
// spec: game-configuration/self-contained-configuration-surface,
// game-configuration/config-lives-on-the-game
//
// Generation itself runs by CALLING the one shared generator
// (`regeneratePreview`, which calls `generateBoardAndInitialState`) rather
// than reimplementing it — permitted by
// global-invariants/one-shared-generation, whose only requirement is that
// every board come from that one implementation, "obtained by running it".
import {
  applyConfigEdit,
  applyRosterChange,
  createRecord,
  regeneratePreview,
  setBoardLock,
} from "@cyphid/snek-game-configuration";
import type {
  ConfigRecordState,
  ConfigRejection,
  GameConfig,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";
import type { ConfigSurfaceState } from "../../../lib/config-surface/types.js";

// spec: game-configuration/board-generation-retry — "that seed SHALL be
// accessible to no game client": drawn here, server-side, and never
// returned to the page (see `toClientState`).
function freshSeed(): Uint8Array {
  const seed = new Uint8Array(32);
  crypto.getRandomValues(seed);
  return seed;
}

const DEFAULT_TEAMS: ReadonlyArray<TeamRegistration> = [
  { centaurTeamId: "team-0" as CentaurTeamId, name: "Red" },
  { centaurTeamId: "team-1" as CentaurTeamId, name: "Blue" },
];

/** Seed a fresh record with a starting roster and its first preview, so the
 * dev route shows a real board immediately rather than an empty slot. */
function seedDefaultRoster(record: ConfigRecordState): ConfigRecordState {
  const rosterResult = applyRosterChange(record, DEFAULT_TEAMS);
  if (!rosterResult.ok) return record;
  const previewResult = regeneratePreview(rosterResult.record, freshSeed());
  return previewResult.ok ? previewResult.record : rosterResult.record;
}

// Module-level: one record for this dev harness, mirroring
// game-configuration/config-lives-on-the-game's "at most one game per room
// open for configuration at any time" for the single dev "game" this route
// stands in for.
let record: ConfigRecordState = seedDefaultRoster(createRecord());

/** Strips the seed and every post-launch field before handing state to a
 * client. spec: game-configuration/board-generation-retry (seed custody) */
export function toClientState(r: ConfigRecordState): ConfigSurfaceState {
  return {
    phase: r.phase,
    config: r.config,
    teams: r.teams,
    currentPreview: r.currentPreview === null ? null : r.currentPreview.result,
    boardLocked: r.boardLocked,
  };
}

export function currentState(): ConfigSurfaceState {
  return toClientState(record);
}

/** Test-only: reset the module-level record to a freshly seeded state. */
export function resetHarness(): void {
  record = seedDefaultRoster(createRecord());
}

/** Test-only: read the full server-side record, seed included. */
export function debugRecord(): ConfigRecordState {
  return record;
}

// spec: game-configuration/board-preview-lock-in (design.md: "the clear
// happens in the same transaction as the edit that provokes it") — this
// harness is single-threaded and synchronous, so calling `regeneratePreview`
// immediately after a `regenerate: true` result is the harness's analogue of
// that same-transaction guarantee.
export function editConfig(config: GameConfig): ConfigRejection | null {
  const result = applyConfigEdit(record, config);
  if (!result.ok) return result.rejection;
  record = result.record;
  if (result.regenerate) {
    const previewResult = regeneratePreview(record, freshSeed());
    if (previewResult.ok) record = previewResult.record;
  }
  return null;
}

export function editRoster(teams: ReadonlyArray<TeamRegistration>): ConfigRejection | null {
  const result = applyRosterChange(record, teams);
  if (!result.ok) return result.rejection;
  record = result.record;
  if (result.regenerate) {
    const previewResult = regeneratePreview(record, freshSeed());
    if (previewResult.ok) record = previewResult.record;
  }
  return null;
}

export function editBoardLock(locked: boolean): ConfigRejection | null {
  const result = setBoardLock(record, locked);
  if (!result.ok) return result.rejection;
  record = result.record;
  return null;
}
