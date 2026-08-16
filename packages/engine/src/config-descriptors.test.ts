// spec: game-engine/configuration-parameters, game-configuration/parameter-bounds-sourcing
import { describe, expect, it } from "vitest";
import { CONFIG_RANGES } from "./arbitraries.js";
import { RUNTIME_PARAMETER_DESCRIPTORS } from "./config-descriptors.js";
import { DEFAULT_RUNTIME_CONFIG } from "./types.js";

/** Every leaf path of a nested plain-object config, dotted (e.g. "clock.maxTurnTimeMs"). */
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

describe("RUNTIME_PARAMETER_DESCRIPTORS", () => {
  // spec: game-engine/configuration-parameters — the descriptor table is a
  // public declaration of exactly GameRuntimeConfig's shape, no more and no
  // less, so a consumer can trust it as the complete parameter set.
  it("covers exactly the fields of GameRuntimeConfig, 1:1", () => {
    const configPaths = leafPaths(DEFAULT_RUNTIME_CONFIG).sort();
    const descriptorPaths = RUNTIME_PARAMETER_DESCRIPTORS.map((d) => d.path).sort();
    expect(descriptorPaths).toEqual(configPaths);
  });

  it("declares no duplicate paths", () => {
    const paths = RUNTIME_PARAMETER_DESCRIPTORS.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  // spec: game-engine/configuration-parameters — defaults declared here must
  // be the same defaults the engine actually ships (DEFAULT_RUNTIME_CONFIG),
  // never a second, driftable copy of the same numbers.
  it("agrees with DEFAULT_RUNTIME_CONFIG on every default", () => {
    for (const d of RUNTIME_PARAMETER_DESCRIPTORS) {
      expect(at(DEFAULT_RUNTIME_CONFIG, d.path)).toBe(d.default);
    }
  });

  // spec: game-configuration/parameter-bounds-sourcing — CONFIG_RANGES (the
  // property suites' fixture) must be a pure derivation of this table, so the
  // suites and the public descriptors can never quietly disagree.
  it("is the sole source of CONFIG_RANGES's numbers", () => {
    const byPath = (path: string) => {
      const d = RUNTIME_PARAMETER_DESCRIPTORS.find((desc) => desc.path === path);
      if (!d) throw new Error(`missing descriptor for ${path}`);
      return { min: d.min, max: d.max };
    };
    expect(CONFIG_RANGES).toEqual({
      maxHealth: byPath("maxHealth"),
      maxTurns: byPath("maxTurns"),
      hazardDamage: byPath("hazardDamage"),
      foodSpawnRate: byPath("foodSpawnRate"),
      potionSpawnRate: byPath("invulnPotionSpawnRate"),
      initialBudgetMs: byPath("clock.initialBudgetMs"),
      budgetIncrementMs: byPath("clock.budgetIncrementMs"),
      firstTurnTimeMs: byPath("clock.firstTurnTimeMs"),
      maxTurnTimeMs: byPath("clock.maxTurnTimeMs"),
    });
    // invulnPotionSpawnRate and invisPotionSpawnRate share one declared range.
    expect(byPath("invulnPotionSpawnRate")).toEqual(byPath("invisPotionSpawnRate"));
  });

  // spec: game-engine/configuration-parameters — table literal, checked
  // field-for-field against the requirement's authored ranges/defaults/sentinels.
  it("matches the spec table literally", () => {
    const table: Record<
      string,
      { min: number; max: number; default: number; disableSentinel?: number }
    > = {
      maxHealth: { min: 1, max: 500, default: 100 },
      maxTurns: { min: 1, max: 1000, default: 100, disableSentinel: 0 },
      maxGameDurationMs: { min: 1000, max: 86400000, default: 0, disableSentinel: 0 },
      hazardDamage: { min: 1, max: 100, default: 15 },
      foodSpawnRate: { min: 0, max: 5, default: 0.5, disableSentinel: 0 },
      invulnPotionSpawnRate: { min: 0, max: 0.2, default: 0.15, disableSentinel: 0 },
      invisPotionSpawnRate: { min: 0, max: 0.2, default: 0.1, disableSentinel: 0 },
      "clock.initialBudgetMs": { min: 0, max: 600000, default: 60000, disableSentinel: 0 },
      "clock.budgetIncrementMs": { min: 100, max: 5000, default: 500 },
      "clock.firstTurnTimeMs": { min: 1000, max: 300000, default: 60000 },
      "clock.maxTurnTimeMs": { min: 100, max: 300000, default: 10000 },
    };
    for (const d of RUNTIME_PARAMETER_DESCRIPTORS) {
      const expected = table[d.path];
      expect(expected, `unexpected descriptor path ${d.path}`).toBeDefined();
      expect({
        min: d.min,
        max: d.max,
        default: d.default,
        disableSentinel: d.disableSentinel,
      }).toEqual({ ...expected, disableSentinel: expected?.disableSentinel });
    }
    expect(RUNTIME_PARAMETER_DESCRIPTORS.length).toBe(Object.keys(table).length);
  });
});
