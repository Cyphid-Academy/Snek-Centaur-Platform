import { DEFAULT_RUNTIME_CONFIG } from "@cyphid/snek-engine";
// The mirror guard: the stored configuration's gameplay half against the
// engine's own configuration type.
//
// `engine-schema-fidelity` says the gameplay half mirrors the engine's
// configuration types field-for-field, so the half a game is played from is
// handed to the engine without translation. A `v.object` is data at runtime,
// and `DEFAULT_RUNTIME_CONFIG` is an instance of the type being mirrored, so
// the correspondence is checkable rather than merely asserted in prose — which
// is what `global-invariants/engine-mirrors-are-guarded` asks of a mirror.
//
// What fails here: a field the engine added and the validator does not carry, a
// field the validator carries and the engine does not, a nesting that moved,
// and a board-generation field appearing on the gameplay side (the engine
// declares only what a turn's resolution reads, so it is an extra either way).
//
// spec: game-configuration/engine-schema-fidelity
// spec: game-configuration/engine-schema-fidelity#a-generation-field-is-not-a-mirror-failure
// spec: global-invariants/engine-mirrors-are-guarded
import { DEFAULT_GENERATION_CONFIG } from "@cyphid/snek-game-configuration";
import { describe, expect, it } from "vitest";
import { gameplayConfig, generationConfig } from "./schema";

/** Every leaf path of a plain value, dotted. */
function leaves(value: unknown, prefix: readonly string[] = []): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix.join(".")];
  }
  return Object.keys(value).flatMap((key) =>
    leaves((value as Record<string, unknown>)[key], [...prefix, key]),
  );
}

/** Every leaf path a validator declares, walked the same way. */
function validatorLeaves(validator: unknown, prefix: readonly string[] = []): string[] {
  const node = validator as { kind?: string; fields?: Record<string, unknown> };
  if (node.kind !== "object" || node.fields === undefined) return [prefix.join(".")];
  return Object.keys(node.fields).flatMap((key) =>
    validatorLeaves(node.fields?.[key], [...prefix, key]),
  );
}

describe("the stored gameplay half mirrors the engine's configuration type", () => {
  it("carries exactly the leaves of GameRuntimeConfig, at the same nesting", () => {
    expect(validatorLeaves(gameplayConfig).sort()).toEqual(leaves(DEFAULT_RUNTIME_CONFIG).sort());
  });

  it("names every leaf as a number, since the engine's vocabulary is numeric throughout", () => {
    for (const path of leaves(DEFAULT_RUNTIME_CONFIG)) {
      let node: unknown = gameplayConfig;
      for (const segment of path.split(".")) {
        node = (node as { fields: Record<string, unknown> }).fields[segment];
      }
      expect((node as { kind: string }).kind, path).toBe("float64");
    }
  });
});

describe("the generation half mirrors nothing", () => {
  it("carries exactly this capability's own declaration", () => {
    // Checked against `DEFAULT_GENERATION_CONFIG` rather than the engine,
    // because no engine field corresponds to any of these — the partition
    // between the halves is what the guard above holds the boundary at.
    expect(validatorLeaves(generationConfig).sort()).toEqual(
      leaves(DEFAULT_GENERATION_CONFIG).sort(),
    );
  });

  it("shares no leaf name with the gameplay half", () => {
    const gameplay = new Set(validatorLeaves(gameplayConfig));
    for (const leaf of validatorLeaves(generationConfig)) expect(gameplay.has(leaf)).toBe(false);
  });
});
