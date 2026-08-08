// Authoritative validation of a game's configuration record.
//
// Pure, and deliberately so: the rules below are the ones the configuration
// record enforces, and the ones an editing surface reflects, so they may not
// live in either. Nothing here does IO, reads a clock, or knows what a
// deployment is — the Convex mutation that owns the record calls this and
// stores the answer.
//
// spec: game-configuration/closed-parameter-vocabulary
// spec: game-configuration/parameter-bounds-sourcing
// spec: game-configuration/bounded-game-duration
import type { GameplayParameterDescriptor } from "@cyphid/snek-engine";
import {
  GAMEPLAY_PARAMETER_DESCRIPTORS,
  gameplayParameter,
  gameplayParameterKey,
  isWithinGameplayBounds,
} from "@cyphid/snek-engine";
import type { GameConfig } from "./config.js";
import { GENERATION_PARAMETER_DESCRIPTORS, isPlainRecord, valueAtPath } from "./config.js";

/**
 * The two disjoint halves the vocabulary comprises, named by the field each
 * occupies on the record.
 *
 * spec: game-configuration/closed-parameter-vocabulary
 */
export type ConfigurationHalf = "generation" | "runtime";

/**
 * One way a candidate configuration is not a valid one, machine-readable so a
 * surface can point at the parameter that failed rather than restating a
 * sentence. `path` is dotted from the record's root — `"generation.boardSize"`,
 * `"runtime.clock.maxTurnTimeMs"` — which is the same spelling the descriptor
 * tables use one level down.
 */
export type ConfigViolation =
  | {
      readonly code: "out-of-range";
      readonly path: string;
      readonly value: number;
      readonly min: number;
      readonly max: number;
      readonly disableSentinel: number | null;
    }
  | { readonly code: "not-a-number"; readonly path: string }
  | { readonly code: "not-an-integer"; readonly path: string; readonly value: number }
  | { readonly code: "missing-parameter"; readonly path: string }
  | { readonly code: "unknown-parameter"; readonly path: string }
  | { readonly code: "unbounded-game"; readonly paths: readonly string[] };

/** What validation answers: the configuration, or every reason it is not one. */
export type GameConfigValidation =
  | { readonly ok: true; readonly config: GameConfig }
  | { readonly ok: false; readonly violations: readonly ConfigViolation[] };

/** The descriptor table declaring each half's parameters. */
const DESCRIPTORS: Readonly<Record<ConfigurationHalf, readonly GameplayParameterDescriptor[]>> = {
  generation: GENERATION_PARAMETER_DESCRIPTORS,
  runtime: GAMEPLAY_PARAMETER_DESCRIPTORS,
};

const HALVES: readonly ConfigurationHalf[] = ["generation", "runtime"];

/** The two parameters between which `bounded-game-duration` is a condition. */
const TURN_LIMIT = "maxTurns";
const DURATION_LIMIT = "maxGameDurationMs";

/** Every leaf path of a value, dotted — what a closed vocabulary is closed over. */
function leaves(value: unknown, prefix: readonly string[] = []): readonly string[] {
  if (!isPlainRecord(value)) return [prefix.join(".")];
  return Object.keys(value).flatMap((key) => leaves(value[key], [...prefix, key]));
}

/**
 * Validate a whole configuration record — the POST-WRITE record, never a patch.
 *
 * Whole rather than incremental because one of the rules is a condition on the
 * record as a whole: `#switching-which-limit-applies` turns on what the record
 * will hold once the write lands, which no per-field check can see. A caller
 * merges its edit into the stored record and validates the result.
 *
 * No bound is restated here: every range comes from the one declaration its
 * half has — the engine's descriptors for the gameplay half, this package's own
 * for the generation half.
 *
 * spec: game-configuration/closed-parameter-vocabulary
 * spec: game-configuration/parameter-bounds-sourcing
 * spec: game-configuration/bounded-game-duration
 * spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
 * spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
 */
export function validateGameConfig(candidate: unknown): GameConfigValidation {
  const violations: ConfigViolation[] = [];
  if (!isPlainRecord(candidate)) {
    return { ok: false, violations: HALVES.map((half) => missing(half)) };
  }

  for (const key of Object.keys(candidate)) {
    if (!(HALVES as readonly string[]).includes(key)) {
      violations.push({ code: "unknown-parameter", path: key });
    }
  }

  for (const half of HALVES) {
    const subtree = candidate[half];
    if (!isPlainRecord(subtree)) {
      violations.push(missing(half));
      continue;
    }
    const declared = new Set(DESCRIPTORS[half].map(gameplayParameterKey));
    for (const leaf of leaves(subtree)) {
      if (!declared.has(leaf))
        violations.push({ code: "unknown-parameter", path: `${half}.${leaf}` });
    }
    for (const descriptor of DESCRIPTORS[half]) {
      const path = `${half}.${gameplayParameterKey(descriptor)}`;
      const value = valueAtPath(subtree, descriptor.path);
      if (value === undefined) {
        violations.push({ code: "missing-parameter", path });
      } else if (typeof value !== "number" || !Number.isFinite(value)) {
        violations.push({ code: "not-a-number", path });
      } else if (descriptor.kind === "integer" && !Number.isInteger(value)) {
        violations.push({ code: "not-an-integer", path, value });
      } else if (!isWithinGameplayBounds(descriptor, value)) {
        // The engine's predicate for both halves: it reads a descriptor, and
        // the two halves differ in who declares one rather than in shape.
        violations.push({
          code: "out-of-range",
          path,
          value,
          min: descriptor.min,
          max: descriptor.max,
          disableSentinel: descriptor.disableSentinel,
        });
      }
    }
  }

  if (bothLimitsDisabled(candidate["runtime"])) {
    violations.push({
      code: "unbounded-game",
      paths: [`runtime.${TURN_LIMIT}`, `runtime.${DURATION_LIMIT}`],
    });
  }

  if (violations.length > 0) return { ok: false, violations };
  return { ok: true, config: candidate as unknown as GameConfig };
}

const missing = (half: ConfigurationHalf): ConfigViolation => ({
  code: "missing-parameter",
  path: half,
});

/**
 * Whether a gameplay half holds both limits at their disable sentinels — the
 * one state `bounded-game-duration` makes unrepresentable. The sentinels are
 * read from the engine's descriptors rather than compared against a literal
 * zero, so a changed sentinel moves this check with it.
 */
function bothLimitsDisabled(runtime: unknown): boolean {
  const disabled = (parameter: string): boolean =>
    valueAtPath(runtime, [parameter]) === gameplayParameter(parameter).disableSentinel;
  return disabled(TURN_LIMIT) && disabled(DURATION_LIMIT);
}

/**
 * Whether an update changes what a board is generated from.
 *
 * The trigger the preview regenerates on and the lock clears on is the same
 * one, named once here so the pair can never disagree about what counts as a
 * change: the generation subtree, or the roster. A gameplay-only edit — the
 * turn limit, the duration limit, a clock value, hazard damage — is none of
 * generation's inputs, so it leaves a deliberate designation standing.
 *
 * Presence rather than difference: an update carrying a generation subtree is
 * an edit to generation's inputs whether or not the numbers happen to match
 * what was stored. Regenerating from an identical input costs one board and
 * yields the same one; deciding equality would put a second notion of "changed"
 * beside this one.
 *
 * spec: game-configuration/board-preview#roster-change-regenerates
 * spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
 * The roster counts as one of those inputs (why, in `migrate-game-configuration`'s
 * design record), so a team joining under a standing lock cannot leave a
 * designated board whose snake set no longer matches.
 */
export function changesGenerationInputs(update: {
  readonly generation?: unknown;
  readonly roster?: unknown;
}): boolean {
  return update.generation !== undefined || update.roster !== undefined;
}
