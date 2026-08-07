import { describe, expect, it } from "vitest";
import {
  GAMEPLAY_PARAMETER_DESCRIPTORS,
  gameplayParameter,
  gameplayParameterKey,
  isWithinGameplayBounds,
} from "./bounds.js";
import { DEFAULT_RUNTIME_CONFIG } from "./types.js";

// Walk the default configuration rather than a hand-written list of names:
// the point of the check is that the descriptor table and GameRuntimeConfig
// cannot drift, and a hand-written list is a third thing that could.
function leavesOf(node: unknown, prefix: readonly string[] = []): Map<string, number> {
  const leaves = new Map<string, number>();
  for (const [name, value] of Object.entries(node as Record<string, unknown>)) {
    const path = [...prefix, name];
    if (typeof value === "number") leaves.set(path.join("."), value);
    else if (typeof value === "object" && value !== null) {
      for (const [k, v] of leavesOf(value, path)) leaves.set(k, v);
    } else throw new Error(`unexpected configuration leaf type at ${path.join(".")}`);
  }
  return leaves;
}

// spec: game-engine/configuration-parameters
describe("gameplay parameter descriptors", () => {
  const leaves = leavesOf(DEFAULT_RUNTIME_CONFIG);
  const keys = GAMEPLAY_PARAMETER_DESCRIPTORS.map(gameplayParameterKey);

  it("covers exactly the leaves of the runtime configuration", () => {
    expect([...keys].sort()).toEqual([...leaves.keys()].sort());
  });

  it("names each parameter once", () => {
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("reports the default the configuration actually holds", () => {
    for (const descriptor of GAMEPLAY_PARAMETER_DESCRIPTORS) {
      const key = gameplayParameterKey(descriptor);
      expect(descriptor.default, key).toBe(leaves.get(key));
    }
  });

  it("declares a coherent range that admits its own default", () => {
    for (const descriptor of GAMEPLAY_PARAMETER_DESCRIPTORS) {
      const key = gameplayParameterKey(descriptor);
      expect(descriptor.min, key).toBeLessThanOrEqual(descriptor.max);
      expect(isWithinGameplayBounds(descriptor, descriptor.default), key).toBe(true);
    }
  });

  // The property suites collapse both potions onto one range
  // (arbitraries.ts CONFIG_RANGES.potionSpawnRate); that collapse is only
  // sound while the two declarations agree.
  it("declares the same range for both potion spawn rates", () => {
    const invuln = gameplayParameter("invulnPotionSpawnRate");
    const invis = gameplayParameter("invisPotionSpawnRate");
    expect({ min: invuln.min, max: invuln.max }).toEqual({ min: invis.min, max: invis.max });
  });

  // spec: game-engine/configuration-parameters#disable-sentinels — the two
  // limits whose sentinel lies OUTSIDE their live range are exactly the two a
  // bare min/max pair would misdescribe.
  it("admits the disable sentinel of the two limits that carry one outside their range", () => {
    for (const key of ["maxTurns", "maxGameDurationMs"]) {
      const descriptor = gameplayParameter(key);
      expect(descriptor.disableSentinel, key).toBe(0);
      expect(descriptor.min, key).toBeGreaterThan(0);
      expect(isWithinGameplayBounds(descriptor, 0), key).toBe(true);
      expect(isWithinGameplayBounds(descriptor, descriptor.max + 1), key).toBe(false);
    }
  });

  it("refuses an unknown parameter name rather than inventing bounds", () => {
    expect(() => gameplayParameter("boardSize")).toThrow(/unknown gameplay parameter/);
  });
});
