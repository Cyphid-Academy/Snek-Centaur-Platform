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
import type { CentaurTeamId } from "@cyphid/snek-engine";
import {
  DEFAULT_GAME_CONFIG,
  DEFAULT_GENERATION_CONFIG,
  generateBoardAndInitialState,
  previewDocument,
} from "@cyphid/snek-game-configuration";
import type { Infer } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  type boardPreview,
  gameplayConfig,
  generatedBoardPreview,
  generationConfig,
} from "./schema";

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

describe("the preview slot holds the capability's own preview document", () => {
  // The document is `@cyphid/snek-game-configuration`'s `previewDocument`, and
  // this validator is the wire contract for it. Nothing derives one from the
  // other, so the correspondence is checked here rather than asserted: a field
  // the serializer emits and the validator omits would be rejected at the write.
  // spec: game-configuration/board-preview
  const board = previewDocument(
    generateBoardAndInitialState(
      DEFAULT_GAME_CONFIG,
      [
        { centaurTeamId: "team-red" as CentaurTeamId, name: "Red" },
        { centaurTeamId: "team-blue" as CentaurTeamId, name: "Blue" },
      ],
      new Uint8Array(32),
    ),
  );

  /**
   * Compare field names at EVERY object level the document reaches, not a fixed
   * few: the `Infer` assignment below applies no excess-property check to a
   * variable, so an extra serializer field nested past the levels a hand-picked
   * comparison covers would otherwise fail only at a real Convex write.
   */
  function sameShape(value: unknown, validator: unknown, path: string): void {
    const node = validator as { kind: string; fields?: Record<string, unknown>; element?: unknown };
    if (node.kind === "array") {
      if (Array.isArray(value) && value[0] !== undefined) {
        sameShape(value[0], node.element, `${path}[0]`);
      }
      return;
    }
    if (node.kind === "object" && node.fields !== undefined) {
      const fields = node.fields;
      expect(Object.keys(value as object).sort(), path).toEqual(Object.keys(fields).sort());
      for (const [key, sub] of Object.entries(fields)) {
        sameShape((value as Record<string, unknown>)[key], sub, `${path}.${key}`);
      }
    }
    // Unions and primitives carry no field names to compare at this level.
  }

  it("declares exactly the fields the serializer emits", () => {
    if (board.kind !== "generated") throw new Error(`default parameters: ${board.code}`);
    // The assignment is half the check: a field the validator declares and the
    // document does not carry is a compile error here.
    const stored: Infer<typeof boardPreview> = board;
    expect(stored).not.toBeNull();

    sameShape(board, generatedBoardPreview, "generated");
  });
});
