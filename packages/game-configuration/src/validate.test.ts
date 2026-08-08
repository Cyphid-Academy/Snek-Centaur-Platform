import { DEFAULT_RUNTIME_CONFIG, GAMEPLAY_PARAMETER_DESCRIPTORS } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_CONFIG,
  DEFAULT_GENERATION_CONFIG,
  GENERATION_PARAMETER_DESCRIPTORS,
} from "./config.js";
import { type ConfigViolation, changesGenerationInputs, validateGameConfig } from "./validate.js";

/** A configuration with the named leaves overridden, as a caller would build one. */
const withGeneration = (patch: Record<string, unknown>) => ({
  ...DEFAULT_GAME_CONFIG,
  generation: { ...DEFAULT_GENERATION_CONFIG, ...patch },
});
const withRuntime = (patch: Record<string, unknown>) => ({
  ...DEFAULT_GAME_CONFIG,
  runtime: { ...DEFAULT_RUNTIME_CONFIG, ...patch },
});

const codes = (result: ReturnType<typeof validateGameConfig>): ReadonlyArray<string> =>
  result.ok ? [] : result.violations.map((v: ConfigViolation) => v.code);

const paths = (result: ReturnType<typeof validateGameConfig>): ReadonlyArray<string> =>
  result.ok ? [] : result.violations.map((v: ConfigViolation) => ("path" in v ? v.path : "—"));

describe("validateGameConfig", () => {
  it("accepts the shipped defaults, which is what an untouched record holds", () => {
    // spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
    expect(validateGameConfig(DEFAULT_GAME_CONFIG)).toEqual({
      ok: true,
      config: DEFAULT_GAME_CONFIG,
    });
  });

  it("rejects every declared parameter one over its maximum and one under its minimum", () => {
    // spec: game-configuration/parameter-bounds-sourcing — the thresholds are
    // read from the two descriptor tables, so this walks them rather than
    // naming a number of its own.
    for (const descriptor of GENERATION_PARAMETER_DESCRIPTORS) {
      const key = descriptor.path.join(".");
      for (const bad of [descriptor.min - 1, descriptor.max + 1]) {
        if (bad === descriptor.disableSentinel) continue;
        const candidate = structuredClone(DEFAULT_GAME_CONFIG) as unknown as Record<
          string,
          unknown
        >;
        set(candidate, ["generation", ...descriptor.path], bad);
        expect(codes(validateGameConfig(candidate)), `generation.${key} = ${bad}`).toContain(
          "out-of-range",
        );
      }
    }
    for (const descriptor of GAMEPLAY_PARAMETER_DESCRIPTORS) {
      const key = descriptor.path.join(".");
      for (const bad of [descriptor.min - 1, descriptor.max + 1]) {
        if (bad === descriptor.disableSentinel) continue;
        const candidate = structuredClone(DEFAULT_GAME_CONFIG) as unknown as Record<
          string,
          unknown
        >;
        set(candidate, ["runtime", ...descriptor.path], bad);
        expect(codes(validateGameConfig(candidate)), `runtime.${key} = ${bad}`).toContain(
          "out-of-range",
        );
      }
    }
  });

  it("rejects boardSize 40 — the scenario's own value", () => {
    // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
    const result = validateGameConfig(withGeneration({ boardSize: 40 }));
    expect(result.ok).toBe(false);
    expect(paths(result)).toEqual(["generation.boardSize"]);
  });

  it("admits a disable sentinel that lies outside its parameter's range", () => {
    // spec: game-configuration/generation-parameters#generation-sentinels
    expect(validateGameConfig(withGeneration({ hazardPercentage: 0 })).ok).toBe(true);
    // spec: game-configuration/conditional-parameter-semantics#gated-value-persists-and-is-ignored
    const gated = withGeneration({ fertileGround: { density: 0, clustering: 17 } });
    expect(validateGameConfig(gated).ok).toBe(true);
  });

  it("rejects a field belonging to neither half, at either level", () => {
    // spec: game-configuration/closed-parameter-vocabulary#no-bot-parameters
    expect(paths(validateGameConfig({ ...DEFAULT_GAME_CONFIG, botAggression: 3 }))).toEqual([
      "botAggression",
    ]);
    expect(paths(validateGameConfig(withGeneration({ botAggression: 3 })))).toEqual([
      "generation.botAggression",
    ]);
  });

  it("rejects a generation parameter written into the gameplay half", () => {
    // The two halves are disjoint, so a generation field is unknown ON the
    // gameplay side rather than merely misplaced.
    // spec: game-configuration/engine-schema-fidelity#a-generation-field-is-not-a-mirror-failure
    expect(paths(validateGameConfig(withRuntime({ boardSize: 21 })))).toEqual([
      "runtime.boardSize",
    ]);
  });

  it("rejects a missing parameter, a non-number and a fractional integer", () => {
    const { maxHealth: _dropped, ...rest } = DEFAULT_RUNTIME_CONFIG;
    expect(codes(validateGameConfig({ ...DEFAULT_GAME_CONFIG, runtime: rest }))).toEqual([
      "missing-parameter",
    ]);
    expect(codes(validateGameConfig(withGeneration({ boardSize: "21" })))).toEqual([
      "not-a-number",
    ]);
    expect(codes(validateGameConfig(withGeneration({ boardSize: 21.5 })))).toEqual([
      "not-an-integer",
    ]);
    expect(codes(validateGameConfig(null))).toEqual(["missing-parameter", "missing-parameter"]);
  });

  it("accepts a rate that is not a whole number", () => {
    expect(validateGameConfig(withRuntime({ foodSpawnRate: 1.25 })).ok).toBe(true);
  });

  describe("bounded-game-duration", () => {
    it("rejects a record holding both limits at their sentinels", () => {
      // spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
      const result = validateGameConfig(withRuntime({ maxTurns: 0, maxGameDurationMs: 0 }));
      expect(codes(result)).toEqual(["unbounded-game"]);
    });

    it("accepts a turn limit alone, a duration limit alone, and both together", () => {
      // spec: game-configuration/bounded-game-duration#a-turn-limit-alone-is-valid
      expect(validateGameConfig(withRuntime({ maxTurns: 100, maxGameDurationMs: 0 })).ok).toBe(
        true,
      );
      // spec: game-configuration/bounded-game-duration#a-duration-limit-alone-is-valid
      expect(validateGameConfig(withRuntime({ maxTurns: 0, maxGameDurationMs: 60_000 })).ok).toBe(
        true,
      );
      expect(validateGameConfig(withRuntime({ maxTurns: 100, maxGameDurationMs: 60_000 })).ok).toBe(
        true,
      );
    });

    it("passes through the both-limits record when switching which limit applies", () => {
      // spec: game-configuration/bounded-game-duration#switching-which-limit-applies
      const turnLimited = withRuntime({ maxTurns: 100, maxGameDurationMs: 0 });
      const both = withRuntime({ maxTurns: 100, maxGameDurationMs: 600_000 });
      const durationLimited = withRuntime({ maxTurns: 0, maxGameDurationMs: 600_000 });
      expect([turnLimited, both, durationLimited].map((c) => validateGameConfig(c).ok)).toEqual([
        true,
        true,
        true,
      ]);
      // and no ordering reaches the record carrying neither
      expect(validateGameConfig(withRuntime({ maxTurns: 0, maxGameDurationMs: 0 })).ok).toBe(false);
    });
  });
});

describe("changesGenerationInputs", () => {
  it("names a generation edit and a roster change, and nothing else", () => {
    // spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
    expect(changesGenerationInputs({ generation: { boardSize: 9 } })).toBe(true);
    // spec: game-configuration/board-preview#roster-change-regenerates
    expect(changesGenerationInputs({ roster: [] })).toBe(true);
    // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
    expect(changesGenerationInputs({})).toBe(false);
  });
});

/** Write `value` at a dotted path inside a mutable clone. */
function set(target: Record<string, unknown>, path: readonly string[], value: unknown): void {
  let cursor = target;
  for (const segment of path.slice(0, -1)) cursor = cursor[segment] as Record<string, unknown>;
  cursor[path[path.length - 1] as string] = value;
}
