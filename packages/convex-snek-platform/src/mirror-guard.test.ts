// The mirror guard's presence test. The guard itself is compile-time — each
// constant in mirror-guard.ts is typed `AssertExact<validator-inferred,
// MirrorShape<engine type>>` and declared `= true`, so any drift refuses to
// typecheck long before this file runs. What this suite adds is (a) the
// type-level restatement via expectTypeOf, so the vitest run exercises the
// same assertions, and (b) a runtime canary that fails loudly if the guard
// module is ever emptied out.
// spec: game-configuration/engine-schema-fidelity
// spec: global-invariants/engine-mirrors-are-guarded#drift-fails-the-build
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  GAME_CONFIG_MIRROR,
  GENERATION_CONFIG_MIRROR,
  GENERATION_FAILURE_MIRROR,
  INITIAL_STATE_MIRROR,
  RUNTIME_CONFIG_MIRROR,
  TEAM_MIRROR,
} from "./mirror-guard.js";

describe("engine-schema mirror guard", () => {
  it("every mirror assertion resolves to the literal type `true`", () => {
    // A drifted mirror makes AssertExact resolve to `false`, which fails the
    // `= true` initializer in mirror-guard.ts AND these type expectations.
    expectTypeOf(RUNTIME_CONFIG_MIRROR).toEqualTypeOf<true>();
    expectTypeOf(GENERATION_CONFIG_MIRROR).toEqualTypeOf<true>();
    expectTypeOf(GAME_CONFIG_MIRROR).toEqualTypeOf<true>();
    expectTypeOf(TEAM_MIRROR).toEqualTypeOf<true>();
    expectTypeOf(INITIAL_STATE_MIRROR).toEqualTypeOf<true>();
    expectTypeOf(GENERATION_FAILURE_MIRROR).toEqualTypeOf<true>();
  });

  it("the guard constants exist at runtime", () => {
    for (const guard of [
      RUNTIME_CONFIG_MIRROR,
      GENERATION_CONFIG_MIRROR,
      GAME_CONFIG_MIRROR,
      TEAM_MIRROR,
      INITIAL_STATE_MIRROR,
      GENERATION_FAILURE_MIRROR,
    ]) {
      expect(guard).toBe(true);
    }
  });
});
