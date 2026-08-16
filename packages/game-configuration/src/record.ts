// The configuration record's pure state machine: the single declaration of
// how a game's configuration may be read, edited, previewed, locked, and
// launched — the one place these rules are written. Convex mutations call
// these functions inside their transactions (their atomicity is what makes
// the joint outcomes below — "clears the lock AND signals regenerate",
// "the freeze binds at the moment of launch" — indivisible in practice; see
// global-invariants/transactional-invariant-enforcement). The dev harness
// behind the standalone configuration surface reuses the same functions.
//
// Every function here is pure and deterministic: seeds are inputs, never
// drawn. Nothing here performs I/O, and nothing here knows what a Convex
// document or a React prop looks like.
// spec: game-configuration/config-lives-on-the-game
import type { CentaurTeamId, GameRuntimeConfig } from "@cyphid/snek-engine";
import { RUNTIME_PARAMETER_DESCRIPTORS, descriptorFor } from "@cyphid/snek-engine";
import type { GeneratedInitialState, TeamRegistration } from "./boardgen.js";
import { generateBoardAndInitialState } from "./boardgen.js";
import { GENERATION_PARAMETER_DESCRIPTORS } from "./config-descriptors.js";
import type { BoardGenerationConfig, BoardGenerationFailure, GameConfig } from "./config.js";
import { DEFAULT_GAME_CONFIG } from "./config.js";

/**
 * A game's configuration is editable only while it is "configuring". A game
 * that ends without ever launching becomes "finished" directly and is
 * equally frozen — there is no third way to leave the edit window.
 * spec: game-configuration/launch-freeze#post-launch-writes-rejected
 */
export type GamePhase = "configuring" | "playing" | "finished";

/**
 * The single held preview candidate. `result` is the generator's own
 * all-or-nothing outcome — a success or a structured infeasibility — never
 * substituted or interpreted here.
 * spec: game-configuration/board-preview#one-slot-no-archive
 */
export interface PreviewSlot {
  readonly seed: Uint8Array;
  readonly result: GeneratedInitialState | BoardGenerationFailure;
}

/**
 * The board-generation inputs a change to which regenerates the preview and
 * clears the lock — the generation half of the config, plus the roster.
 * Never the runtime half: a turn's resolution reads that, generation does
 * not. spec: game-configuration/board-preview-lock-in (design.md,
 * "the lock's clearing trigger is generation inputs, not parameters")
 */
export interface GenerationInputs {
  readonly generation: BoardGenerationConfig;
  readonly teams: ReadonlyArray<TeamRegistration>;
}

/**
 * The configuration record's complete pre-launch state.
 * spec: game-configuration/config-lives-on-the-game
 */
export interface ConfigRecordState {
  readonly phase: GamePhase;
  /** The two halves, exactly as stored — never translated at the boundary. */
  // spec: game-configuration/closed-parameter-vocabulary, game-configuration/engine-schema-fidelity
  readonly config: GameConfig;
  /** The roster: itself a generation input (game-configuration/board-preview-lock-in#roster-change-clears-the-lock). */
  readonly teams: ReadonlyArray<TeamRegistration>;
  /** ONE slot, overwritten every regeneration. spec: game-configuration/board-preview */
  readonly currentPreview: PreviewSlot | null;
  /** spec: game-configuration/board-preview-lock-in */
  readonly boardLocked: boolean;
  /** Set at launch only; null before launch and for a never-launched ending. */
  readonly startingState: GeneratedInitialState | null;
  /**
   * True exactly when `startingState` came from the unlocked fresh-seed
   * launch path — the signal read layers use to honour
   * game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
   * (never surface it to a configuration-mode view). False whenever
   * `startingState` is null.
   */
  readonly startingStateHidden: boolean;
}

/**
 * A structured, machine-readable rejection — naming the parameter or
 * constraint that failed, never a prose message alone. "Client-truthfulness
 * wants legible rejections" (task brief); every write's authoritative check
 * lives here regardless of which surface issued it.
 * spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
 */
export type ConfigRejection =
  | { readonly kind: "wrong-phase"; readonly phase: GamePhase }
  | {
      readonly kind: "invalid-parameter";
      readonly path: string;
      readonly reason: "OUT_OF_RANGE" | "NOT_INTEGER";
      readonly value: number;
      readonly min?: number;
      readonly max?: number;
    }
  // spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
  | { readonly kind: "unbounded-duration" }
  | { readonly kind: "empty-roster" }
  | { readonly kind: "duplicate-team-id"; readonly centaurTeamId: CentaurTeamId }
  // spec: judgment call — a lock designates a board; a failure or an empty
  // slot has no board to designate, so a lock request against one is refused
  // rather than silently accepted as "locked onto nothing".
  | { readonly kind: "no-lockable-preview" }
  // spec: game-configuration/infeasibility-surfaced#failed-launch-halts
  | { readonly kind: "generation-failed"; readonly failure: BoardGenerationFailure };

/** Every operation below returns this shape: an ok transition or a structured rejection. */
export type ConfigOpResult =
  | {
      readonly ok: true;
      readonly record: ConfigRecordState;
      /**
       * True when the caller must, in the SAME transaction, also call
       * `regeneratePreview` — the generation inputs changed. Meaningful only
       * for `applyConfigEdit`/`applyRosterChange`; every other operation
       * reports `false` because none of them changes what a board is
       * generated from.
       * spec: game-configuration/board-preview-lock-in (design.md: "the
       * clear happens in the same transaction as the edit that provokes it")
       */
      readonly regenerate: boolean;
    }
  | { readonly ok: false; readonly rejection: ConfigRejection };

export type ValidateResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly rejection: ConfigRejection };

/** Read a dotted path (e.g. "clock.initialBudgetMs") out of a nested plain object. */
function at(obj: unknown, path: string): number {
  return path
    .split(".")
    .reduce<unknown>((cur, key) => (cur as Record<string, unknown>)[key], obj) as number;
}

/**
 * The bounded-game-duration record-level predicate: a cross-field condition
 * over the two limits, never expressible as a range on either alone.
 * spec: game-configuration/bounded-game-duration
 */
function boundedDurationRejection(runtime: GameRuntimeConfig): ConfigRejection | null {
  const maxTurnsSentinel = descriptorFor("maxTurns").disableSentinel;
  const maxDurationSentinel = descriptorFor("maxGameDurationMs").disableSentinel;
  if (runtime.maxTurns === maxTurnsSentinel && runtime.maxGameDurationMs === maxDurationSentinel) {
    return { kind: "unbounded-duration" };
  }
  return null;
}

/**
 * Every value against its OWN descriptor's type/range
 * (game-configuration/closed-parameter-vocabulary), plus the
 * record-level bounded-duration predicate. Bounds come ONLY from the two
 * descriptor tables — never restated as a second set of numbers.
 * spec: game-configuration/parameter-bounds-sourcing
 *
 * Deliberately does NOT special-case a gated dependent value (e.g.
 * fertileGround.clustering while density is 0): every parameter validates
 * against its own descriptor alone, so a gated value validates and persists
 * exactly like any other.
 * spec: game-configuration/conditional-parameter-semantics
 */
export function validateConfig(config: GameConfig): ValidateResult {
  for (const descriptor of GENERATION_PARAMETER_DESCRIPTORS) {
    const value = at(config.generation, descriptor.path);
    const rejection = checkParameter(`generation.${descriptor.path}`, value, descriptor);
    if (rejection !== null) return { ok: false, rejection };
  }
  for (const descriptor of RUNTIME_PARAMETER_DESCRIPTORS) {
    const value = at(config.runtime, descriptor.path);
    const rejection = checkParameter(`runtime.${descriptor.path}`, value, descriptor);
    if (rejection !== null) return { ok: false, rejection };
  }
  const durationRejection = boundedDurationRejection(config.runtime);
  if (durationRejection !== null) return { ok: false, rejection: durationRejection };
  return { ok: true };
}

function checkParameter(
  path: string,
  value: number,
  descriptor: {
    readonly kind: "integer" | "number";
    readonly min: number;
    readonly max: number;
    readonly disableSentinel?: number;
  },
): ConfigRejection | null {
  if (descriptor.kind === "integer" && !Number.isInteger(value)) {
    return { kind: "invalid-parameter", path, reason: "NOT_INTEGER", value };
  }
  const isSentinel =
    descriptor.disableSentinel !== undefined && value === descriptor.disableSentinel;
  if (!isSentinel && (value < descriptor.min || value > descriptor.max)) {
    return {
      kind: "invalid-parameter",
      path,
      reason: "OUT_OF_RANGE",
      value,
      min: descriptor.min,
      max: descriptor.max,
    };
  }
  return null;
}

function generationConfigEqual(a: BoardGenerationConfig, b: BoardGenerationConfig): boolean {
  return (
    a.boardSize === b.boardSize &&
    a.snakesPerTeam === b.snakesPerTeam &&
    a.hazardPercentage === b.hazardPercentage &&
    a.fertileGround.density === b.fertileGround.density &&
    a.fertileGround.clustering === b.fertileGround.clustering
  );
}

function teamsEqual(
  a: ReadonlyArray<TeamRegistration>,
  b: ReadonlyArray<TeamRegistration>,
): boolean {
  if (a.length !== b.length) return false;
  return a.every((team, i) => {
    const other = b[i];
    return (
      other !== undefined && team.centaurTeamId === other.centaurTeamId && team.name === other.name
    );
  });
}

/**
 * Whether what a board is generated from changed between two moments — the
 * board-generation half of the config, or the roster (team count or
 * composition; order matters, since starting-territory sectors are assigned
 * by team index). This is the ONE predicate `applyConfigEdit`'s regenerate
 * trigger and the lock's clear trigger both consult, so the pair can never
 * disagree about what counts as a change.
 * spec: game-configuration/board-preview-lock-in (design.md, 2026-07-28:
 * "the lock's clearing trigger is generation inputs, not parameters")
 */
export function generationInputsChanged(
  before: GenerationInputs,
  after: GenerationInputs,
): boolean {
  if (!generationConfigEqual(before.generation, after.generation)) return true;
  return !teamsEqual(before.teams, after.teams);
}

/**
 * Every board-generation parameter already holds its default
 * (game-configuration/generation-parameters#a-default-for-every-generation-parameter);
 * DEFAULT_GAME_CONFIG's maxTurns of 100 is what makes bounded-duration hold
 * from birth (game-configuration/bounded-game-duration).
 */
export function createRecord(): ConfigRecordState {
  return {
    phase: "configuring",
    config: DEFAULT_GAME_CONFIG,
    teams: [],
    currentPreview: null,
    boardLocked: false,
    startingState: null,
    startingStateHidden: false,
  };
}

/**
 * Refuses when phase !== "configuring" (game-configuration/launch-freeze).
 * Validates the proposed config wholesale, then determines whether the
 * generation half changed — the roster is a separate operation, so only
 * `proposedConfig.generation` is compared against the record's current
 * generation half. If it changed, the lock clears and `regenerate: true` is
 * signalled in this SAME returned transition; the caller's transaction is
 * what makes "clears the lock and regenerates" atomic
 * (global-invariants/transactional-invariant-enforcement). A dynamic
 * gameplay-only edit — the runtime half changed, the generation half did not
 * — leaves the lock and the preview standing untouched.
 * spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
 */
export function applyConfigEdit(
  record: ConfigRecordState,
  proposedConfig: GameConfig,
): ConfigOpResult {
  if (record.phase !== "configuring") {
    return { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
  }
  const validated = validateConfig(proposedConfig);
  if (!validated.ok) return { ok: false, rejection: validated.rejection };

  const changed = generationInputsChanged(
    { generation: record.config.generation, teams: record.teams },
    { generation: proposedConfig.generation, teams: record.teams },
  );
  const nextRecord: ConfigRecordState = {
    ...record,
    config: proposedConfig,
    boardLocked: changed ? false : record.boardLocked,
  };
  return { ok: true, record: nextRecord, regenerate: changed };
}

/**
 * Same freeze check as `applyConfigEdit`. Unlike a config edit, a roster
 * change has no "dynamic gameplay" analogue — the roster IS a generation
 * input, full stop — so it always counts as a generation-input change and
 * unconditionally clears the lock and signals regeneration, even if the
 * submitted roster happens to equal the current one: the operation's
 * contract is "the roster changed", not "and it differs by value".
 * spec: game-configuration/board-preview#roster-change-regenerates,
 * game-configuration/board-preview-lock-in#roster-change-clears-the-lock
 *
 * Infeasibility (can this roster's snakes actually be seated) is
 * generation's to report, not this operation's — only structural validity is
 * checked here.
 * spec: game-configuration/board-generation-retry
 */
export function applyRosterChange(
  record: ConfigRecordState,
  teams: ReadonlyArray<TeamRegistration>,
): ConfigOpResult {
  if (record.phase !== "configuring") {
    return { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
  }
  if (teams.length < 1) {
    return { ok: false, rejection: { kind: "empty-roster" } };
  }
  const seen = new Set<CentaurTeamId>();
  for (const team of teams) {
    if (seen.has(team.centaurTeamId)) {
      return {
        ok: false,
        rejection: { kind: "duplicate-team-id", centaurTeamId: team.centaurTeamId },
      };
    }
    seen.add(team.centaurTeamId);
  }
  const nextRecord: ConfigRecordState = { ...record, teams, boardLocked: false };
  return { ok: true, record: nextRecord, regenerate: true };
}

/**
 * Runs the one shared generator (global-invariants/one-shared-generation)
 * against the record's current inputs with the supplied fresh seed,
 * overwriting the single preview slot with success or the structured
 * failure. Arrives unlocked by construction: the edit that triggered this
 * regeneration already cleared the lock (see `applyConfigEdit` /
 * `applyRosterChange`), and calling this directly — a deliberate
 * "regenerate" action untouched by any edit — also clears it, because
 * regenerating is abandonment of whatever candidate stood before.
 * spec: game-configuration/board-preview#one-slot-no-archive
 */
export function regeneratePreview(
  record: ConfigRecordState,
  freshSeed: Uint8Array,
): ConfigOpResult {
  if (record.phase !== "configuring") {
    return { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
  }
  const result = generateBoardAndInitialState(record.config, record.teams, freshSeed);
  const nextRecord: ConfigRecordState = {
    ...record,
    currentPreview: { seed: freshSeed, result },
    boardLocked: false,
  };
  return { ok: true, record: nextRecord, regenerate: false };
}

/**
 * Phase must be "configuring". Locking requires a `currentPreview` holding a
 * SUCCESSFUL result — a failure or an empty slot has no board to designate
 * (judgment call: refused rather than silently accepted as a lock on
 * nothing). A lock request carries no board data by signature: this
 * function's second parameter is a plain boolean, never a board.
 * spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
 * Unlocking is always allowed pre-launch.
 * spec: game-configuration/board-preview-lock-in#lock-toggles-freely-before-launch
 */
export function setBoardLock(record: ConfigRecordState, locked: boolean): ConfigOpResult {
  if (record.phase !== "configuring") {
    return { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
  }
  if (locked) {
    const preview = record.currentPreview;
    if (preview === null || "code" in preview.result) {
      return { ok: false, rejection: { kind: "no-lockable-preview" } };
    }
  }
  return { ok: true, record: { ...record, boardLocked: locked }, regenerate: false };
}

/**
 * Phase must be "configuring". The bounded-duration gate is re-checked here
 * — belt-and-braces, since every write already enforces it, but launch is
 * the moment configuration becomes the game's permanent terms
 * (game-configuration/bounded-game-duration#launch-cannot-freeze-an-unbounded-game).
 *
 * Locked: `startingState` becomes the designated `currentPreview` result
 * EXACTLY, and the preview's own seed becomes the game's seed — `freshSeed`
 * is ignored on this path.
 * spec: game-configuration/board-preview-lock-in#locked-board-launches-exactly
 *
 * Unlocked: generates from the then-current inputs with `freshSeed`. On
 * failure, returns the structured infeasibility and does NOT transition —
 * phase stays "configuring" (game-configuration/infeasibility-surfaced#failed-launch-halts).
 * On success, `startingStateHidden` is set so read layers never surface it
 * to a configuration-mode view before the game is under way.
 * spec: game-configuration/board-preview-lock-in#unlocked-regeneration-stays-hidden
 */
export function launch(record: ConfigRecordState, freshSeed: Uint8Array): ConfigOpResult {
  if (record.phase !== "configuring") {
    return { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
  }
  const durationRejection = boundedDurationRejection(record.config.runtime);
  if (durationRejection !== null) return { ok: false, rejection: durationRejection };

  if (record.boardLocked) {
    const preview = record.currentPreview;
    // setBoardLock never leaves boardLocked true without a successful
    // preview, but a record assembled directly (a test, a corrupted read)
    // might — treated the same as "nothing to launch".
    if (preview === null || "code" in preview.result) {
      return { ok: false, rejection: { kind: "no-lockable-preview" } };
    }
    const nextRecord: ConfigRecordState = {
      ...record,
      phase: "playing",
      startingState: preview.result,
      startingStateHidden: false,
    };
    return { ok: true, record: nextRecord, regenerate: false };
  }

  const result = generateBoardAndInitialState(record.config, record.teams, freshSeed);
  if ("code" in result) {
    return { ok: false, rejection: { kind: "generation-failed", failure: result } };
  }
  const nextRecord: ConfigRecordState = {
    ...record,
    phase: "playing",
    startingState: result,
    startingStateHidden: true,
  };
  return { ok: true, record: nextRecord, regenerate: false };
}

/**
 * A game can end without ever launching (a walkover). Phase
 * "configuring" -> "finished" directly, with no `startingState` — the
 * record stops being editable exactly as a launched game's does.
 * spec: game-configuration/launch-freeze (design.md: "freeze wording covers
 * the never-launched ending")
 */
export function concludeWithoutLaunch(record: ConfigRecordState): ConfigOpResult {
  if (record.phase !== "configuring") {
    return { ok: false, rejection: { kind: "wrong-phase", phase: record.phase } };
  }
  const nextRecord: ConfigRecordState = {
    ...record,
    phase: "finished",
    startingState: null,
    startingStateHidden: false,
  };
  return { ok: true, record: nextRecord, regenerate: false };
}
