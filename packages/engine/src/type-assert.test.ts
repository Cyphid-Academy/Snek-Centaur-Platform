// spec: global-invariants/engine-mirrors-are-guarded#modifier-only-divergence-is-divergence
//
// Proves AssertExact rejects a modifier-only divergence (readonly alone,
// optionality alone) and accepts an exact match. The rejection cases are
// type-level only — `@ts-expect-error` is the assertion, checked by `tsc`,
// never executed — while the acceptance case also runs at runtime so a
// regression that silently widened the check still fails a test, not only a
// build.
import { describe, expect, it } from "vitest";
import type { AssertExact } from "./type-assert.js";

describe("AssertExact", () => {
  it("resolves true for an exact structural match", () => {
    interface Shape {
      readonly foo: string;
      readonly bar?: number;
    }
    const check: AssertExact<Shape, Shape> = true;
    expect(check).toBe(true);
  });

  it("resolves true regardless of argument order", () => {
    interface A {
      readonly x: number;
    }
    interface B {
      readonly x: number;
    }
    const forward: AssertExact<A, B> = true;
    const backward: AssertExact<B, A> = true;
    expect(forward).toBe(true);
    expect(backward).toBe(true);
  });
});

// Type-level only: a readonly-only divergence must fail the exact-equality
// check, even though the two shapes are mutually assignable structurally
// (plain assignability ignores readonly, which is exactly the gap this
// invariant closes).
function _typeOnly_rejectsReadonlyOnlyDivergence(): void {
  interface MirroredReadonly {
    readonly foo: string;
  }
  interface EngineMutable {
    foo: string;
  }
  // @ts-expect-error — readonly-only divergence: AssertExact resolves to
  // `false`, which does not satisfy the `true` annotation.
  const _check: AssertExact<MirroredReadonly, EngineMutable> = true;
  void _check;
}

// Type-level only: an optionality-only divergence must fail the same way.
function _typeOnly_rejectsOptionalityOnlyDivergence(): void {
  interface MirroredOptional {
    readonly foo?: string;
  }
  interface EngineRequired {
    readonly foo: string;
  }
  // @ts-expect-error — optionality-only divergence: AssertExact resolves to
  // `false`, which does not satisfy the `true` annotation.
  const _check: AssertExact<MirroredOptional, EngineRequired> = true;
  void _check;
}

void _typeOnly_rejectsReadonlyOnlyDivergence;
void _typeOnly_rejectsOptionalityOnlyDivergence;
