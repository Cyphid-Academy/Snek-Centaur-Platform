// spec: application-shell/one-state-binding
// The two implementations answer the same three questions — what the state is,
// what the connection is doing, and what may be written — so a surface written
// against one runs against the other unchanged
// (`#a-surface-does-not-know-its-source`).
import type { ConvexClient } from "convex/browser";
import type { FunctionReference } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import {
  type BindingSnapshot,
  type MutableFixtureBinding,
  type StateBinding,
  convexBinding,
  convexMutableBinding,
  fixtureBinding,
  mutableFixtureBinding,
} from "./lib/binding";

interface Game {
  readonly turn: number;
}

/** Anything a surface may do with a read-only binding, and nothing else. */
function readAll<TState>(binding: StateBinding<TState>): BindingSnapshot<TState>[] {
  const seen: BindingSnapshot<TState>[] = [];
  binding.subscribe((snapshot) => seen.push(snapshot));
  return seen;
}

describe("fixtureBinding", () => {
  it("reports connecting with no value until one is set", () => {
    const binding = fixtureBinding<Game>();
    expect(binding.current).toEqual({ value: undefined, status: { kind: "connecting" } });

    const seen = readAll(binding);
    binding.set({ turn: 1 });
    expect(seen.map((s) => s.value)).toEqual([undefined, { turn: 1 }]);
    expect(binding.current.status).toEqual({ kind: "live" });
  });

  it("starts live when constructed with a value", () => {
    const binding = fixtureBinding<Game>({ turn: 7 });
    expect(binding.current).toEqual({ value: { turn: 7 }, status: { kind: "live" } });
  });

  it("stops notifying an unsubscribed listener, and everyone after close", () => {
    const binding = fixtureBinding<Game>({ turn: 0 });
    const seen: number[] = [];
    const unsubscribe = binding.subscribe((s) => seen.push(s.value?.turn ?? -1));
    binding.set({ turn: 1 });
    unsubscribe();
    binding.set({ turn: 2 });
    expect(seen).toEqual([0, 1]);

    const kept = readAll(binding);
    binding.close();
    binding.set({ turn: 3 });
    expect(kept).toHaveLength(1);
  });

  // spec: application-shell/one-state-binding#loss-is-the-bindings-to-report
  it("reports a lost connection through the binding, keeping the last value", () => {
    const binding = fixtureBinding<Game>({ turn: 4 });
    binding.report({ kind: "lost", reason: "socket closed" });
    expect(binding.current).toEqual({
      value: { turn: 4 },
      status: { kind: "lost", reason: "socket closed" },
    });
  });

  // spec: application-shell/one-state-binding#absence-not-refusal
  it("offers no mutation at all unless mutations were given", () => {
    const readOnly: StateBinding<Game> = fixtureBinding<Game>({ turn: 0 });
    expect(Object.keys(readOnly)).not.toContain("mutations");
    // @ts-expect-error — a read-only binding has no `mutations` to reach for,
    // so a surface cannot write through it even by mistake.
    expect(readOnly.mutations).toBeUndefined();
  });

  it("runs the scripted mutations it was given", async () => {
    interface GameMutations {
      advance: (by: number) => Promise<number>;
    }
    const advance = async (by: number): Promise<number> => {
      const next = (binding.current.value?.turn ?? 0) + by;
      binding.set({ turn: next });
      return next;
    };
    const binding: MutableFixtureBinding<Game, GameMutations> = mutableFixtureBinding<
      Game,
      GameMutations
    >({ turn: 0 }, { advance });
    await expect(binding.mutations.advance(2)).resolves.toBe(2);
    expect(binding.current.value).toEqual({ turn: 2 });
  });
});

/** A stand-in for the `ConvexClient` transport: no socket, one captured call. */
function mockClient(): {
  client: ConvexClient;
  push: (value: unknown) => void;
  fail: (error: Error) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  mutation: ReturnType<typeof vi.fn>;
  queryArgs: () => Record<string, unknown>;
} {
  let onValue: ((value: unknown) => void) | undefined;
  let onError: ((error: Error) => void) | undefined;
  let args: Record<string, unknown> = {};
  const unsubscribe = vi.fn();
  const mutation = vi.fn(async () => "ok");
  const onUpdate = vi.fn(
    (
      _query: unknown,
      callArgs: Record<string, unknown>,
      callback: (value: unknown) => void,
      errorCallback?: (error: Error) => void,
    ) => {
      args = callArgs;
      onValue = callback;
      onError = errorCallback;
      return unsubscribe;
    },
  );
  return {
    client: { onUpdate, mutation } as unknown as ConvexClient,
    push: (value) => onValue?.(value),
    fail: (error) => onError?.(error),
    unsubscribe,
    mutation,
    queryArgs: () => args,
  };
}

const gameQuery = "games:configuration" as unknown as FunctionReference<"query">;
const updateMutation = "games:update" as unknown as FunctionReference<"mutation">;

describe("convexBinding", () => {
  it("is connecting until the subscription delivers, then live", () => {
    const transport = mockClient();
    const binding = convexBinding({
      client: transport.client,
      query: gameQuery,
      args: { gameId: "g1" },
    });
    const seen = readAll(binding);
    expect(binding.current.status).toEqual({ kind: "connecting" });

    transport.push({ turn: 3 });
    expect(binding.current).toEqual({ value: { turn: 3 }, status: { kind: "live" } });
    expect(seen).toHaveLength(2);
  });

  it("passes the credential as an argument of the call, and omits it when absent", () => {
    const anonymous = mockClient();
    convexBinding({ client: anonymous.client, query: gameQuery, args: { gameId: "g1" } });
    expect(anonymous.queryArgs()).toEqual({ gameId: "g1" });

    const signedIn = mockClient();
    convexBinding({
      client: signedIn.client,
      query: gameQuery,
      args: { gameId: "g1" },
      credential: "token",
    });
    expect(signedIn.queryArgs()).toEqual({ gameId: "g1", credential: "token" });
  });

  // spec: application-shell/one-state-binding#loss-is-the-bindings-to-report
  it("turns a transport error into a lost status on the binding", () => {
    const transport = mockClient();
    const binding = convexBinding({ client: transport.client, query: gameQuery, args: {} });
    transport.push({ turn: 1 });
    transport.fail(new Error("websocket closed"));
    expect(binding.current.status).toEqual({ kind: "lost", reason: "websocket closed" });
    expect(binding.current.value).toEqual({ turn: 1 });
  });

  it("releases the subscription on close", () => {
    const transport = mockClient();
    const binding = convexBinding({ client: transport.client, query: gameQuery, args: {} });
    binding.close();
    expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
    binding.close();
    expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("sends declared mutations through the client with the same credential", async () => {
    const transport = mockClient();
    const binding = convexMutableBinding({
      client: transport.client,
      query: gameQuery,
      args: {},
      credential: "token",
      mutations: { update: updateMutation },
    });

    await binding.mutations.update({ size: 11 });
    expect(transport.mutation).toHaveBeenCalledWith(updateMutation, {
      size: 11,
      credential: "token",
    });
  });
});
