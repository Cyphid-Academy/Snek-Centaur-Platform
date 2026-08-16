// spec: application-shell/one-state-binding — fixture and source-backed
// bindings share one read surface; a read-only binding carries no
// `mutations` member at all (#absence-not-refusal); connection loss reaches
// a surface through `status` (#loss-is-the-bindings-to-report).
import { describe, expect, it } from "vitest";
import {
  type BindingSource,
  type MutableBinding,
  type StateBinding,
  bindingFromSource,
  fixtureBinding,
  mutableBinding,
} from "./binding.svelte.js";

describe("fixtureBinding", () => {
  it("delivers its value, always connected", () => {
    const binding = fixtureBinding(42);
    expect(binding.value).toBe(42);
    expect(binding.status).toEqual({ kind: "connected" });
  });

  // spec: application-shell/one-state-binding#absence-not-refusal — a plain
  // StateBinding has no `mutations` to invoke at all.
  it("has no mutations member to invoke", () => {
    const binding = fixtureBinding(42);
    expect("mutations" in binding).toBe(false);
  });
});

// spec: application-shell/one-state-binding#a-surface-does-not-know-its-source
describe("bindingFromSource", () => {
  function fakeSource(): {
    source: BindingSource<number>;
    emitValue: (v: number) => void;
    emitLoss: (reason: string) => void;
  } {
    let onValue: ((v: number) => void) | undefined;
    let onLoss: ((reason: string) => void) | undefined;
    const source: BindingSource<number> = {
      subscribe(v, l) {
        onValue = v;
        onLoss = l;
        return () => {
          onValue = undefined;
          onLoss = undefined;
        };
      },
    };
    return {
      source,
      emitValue: (v) => onValue?.(v),
      emitLoss: (reason) => onLoss?.(reason),
    };
  }

  it("starts undefined and connected, then updates as the source emits", () => {
    const { source, emitValue } = fakeSource();
    const binding = bindingFromSource(source);
    expect(binding.value).toBeUndefined();
    expect(binding.status).toEqual({ kind: "connected" });

    emitValue(7);
    expect(binding.value).toBe(7);
    expect(binding.status).toEqual({ kind: "connected" });

    emitValue(8);
    expect(binding.value).toBe(8);
  });

  // spec: application-shell/one-state-binding#loss-is-the-bindings-to-report
  it("reports connection loss through status without a surface detecting it itself", () => {
    const { source, emitValue, emitLoss } = fakeSource();
    const binding = bindingFromSource(source);
    emitValue(1);
    emitLoss("subscription closed");
    expect(binding.status).toEqual({ kind: "lost", reason: "subscription closed" });
    // The last-known value is left in place rather than cleared — the surface
    // learns of loss from `status`, not from `value` going missing.
    expect(binding.value).toBe(1);
  });
});

describe("mutableBinding", () => {
  it("adds mutations while delegating reads to the base binding", () => {
    const base = fixtureBinding("state");
    const mutations = { rename: (_next: string) => {} };
    const binding = mutableBinding(base, mutations);
    expect(binding.value).toBe("state");
    expect(binding.status).toEqual({ kind: "connected" });
    expect(binding.mutations).toBe(mutations);
  });
});

// Type-level check: a plain StateBinding offers no `mutations` to reach for.
// Not executed — this function exists only for `tsc` to typecheck.
function _typeOnly_readOnlyHasNoMutations(binding: StateBinding<number>): void {
  // @ts-expect-error — StateBinding carries no `mutations` member.
  binding.mutations;
}

// Type-level check: MutableBinding is assignable where a StateBinding is
// expected (structural widening), confirming the two share one read shape.
function _typeOnly_mutableIsAStateBinding(binding: MutableBinding<number, { inc(): void }>): void {
  const asRead: StateBinding<number> = binding;
  void asRead;
}

void _typeOnly_readOnlyHasNoMutations;
void _typeOnly_mutableIsAStateBinding;
