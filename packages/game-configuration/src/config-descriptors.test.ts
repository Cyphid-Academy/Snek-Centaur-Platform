// spec: game-configuration/generation-parameters, game-configuration/parameter-bounds-sourcing
import { describe, expect, it } from "vitest";
import { GENERATION_RANGES } from "./arbitraries.js";
import { GENERATION_PARAMETER_DESCRIPTORS } from "./config-descriptors.js";
import { DEFAULT_GENERATION_CONFIG } from "./config.js";

/** Every leaf path of a nested plain-object config, dotted (e.g. "fertileGround.density"). */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (obj !== null && typeof obj === "object" && !Array.isArray(obj)) {
    return Object.entries(obj as Record<string, unknown>).flatMap(([key, value]) =>
      leafPaths(value, prefix ? `${prefix}.${key}` : key),
    );
  }
  return [prefix];
}

/** Read a dotted path out of a nested plain object. */
function at(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => (cur as Record<string, unknown>)[key], obj);
}

describe("GENERATION_PARAMETER_DESCRIPTORS", () => {
  // spec: game-configuration/generation-parameters — the descriptor table is
  // a public declaration of exactly BoardGenerationConfig's shape.
  it("covers exactly the fields of BoardGenerationConfig, 1:1", () => {
    const configPaths = leafPaths(DEFAULT_GENERATION_CONFIG).sort();
    const descriptorPaths = GENERATION_PARAMETER_DESCRIPTORS.map((d) => d.path).sort();
    expect(descriptorPaths).toEqual(configPaths);
  });

  it("declares no duplicate paths", () => {
    const paths = GENERATION_PARAMETER_DESCRIPTORS.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter
  it("agrees with DEFAULT_GENERATION_CONFIG on every default", () => {
    for (const d of GENERATION_PARAMETER_DESCRIPTORS) {
      expect(at(DEFAULT_GENERATION_CONFIG, d.path)).toBe(d.default);
    }
  });

  // spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
  it("is the sole source of GENERATION_RANGES's numbers", () => {
    const byPath = (path: string) => {
      const d = GENERATION_PARAMETER_DESCRIPTORS.find((desc) => desc.path === path);
      if (!d) throw new Error(`missing descriptor for ${path}`);
      return { min: d.min, max: d.max };
    };
    expect(GENERATION_RANGES).toEqual({
      boardSize: byPath("boardSize"),
      snakesPerTeam: byPath("snakesPerTeam"),
      hazardPercentage: byPath("hazardPercentage"),
      fertileDensity: byPath("fertileGround.density"),
      fertileClustering: byPath("fertileGround.clustering"),
    });
  });

  // spec: game-configuration/generation-parameters — table literal, checked
  // field-for-field against the requirement's authored ranges/defaults/sentinels.
  it("matches the spec table literally", () => {
    const table: Record<
      string,
      { min: number; max: number; default: number; disableSentinel?: number }
    > = {
      boardSize: { min: 7, max: 32, default: 21 },
      snakesPerTeam: { min: 1, max: 10, default: 5 },
      hazardPercentage: { min: 0, max: 30, default: 0, disableSentinel: 0 },
      "fertileGround.density": { min: 0, max: 90, default: 30, disableSentinel: 0 },
      "fertileGround.clustering": { min: 1, max: 20, default: 10 },
    };
    for (const d of GENERATION_PARAMETER_DESCRIPTORS) {
      const expected = table[d.path];
      expect(expected, `unexpected descriptor path ${d.path}`).toBeDefined();
      expect({
        min: d.min,
        max: d.max,
        default: d.default,
        disableSentinel: d.disableSentinel,
      }).toEqual({ ...expected, disableSentinel: expected?.disableSentinel });
    }
    expect(GENERATION_PARAMETER_DESCRIPTORS.length).toBe(Object.keys(table).length);
  });
});
