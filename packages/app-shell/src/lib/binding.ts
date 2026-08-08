// The one binding every surface obtains its state through.
//
// spec: application-shell/one-state-binding
//
// A surface takes a binding and renders what it reports. It is not told, and
// cannot ask, whether a live runtime subscription, a persisted record or a
// fixture is behind it (`#a-surface-does-not-know-its-source`) — the two
// implementations here, `convexBinding` and `fixtureBinding`, are the same type
// to their consumer.
//
// A read-only mounting is read-only because there is nothing to call, rather
// than because something refuses the call (`#absence-not-refusal`): mutations
// are `MutableBinding`'s member, and `StateBinding` has none.
import type { ConvexClient } from "convex/browser";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

/**
 * What the binding says about the connection behind it.
 *
 * Reported alongside the value rather than folded into it, so a surface renders
 * the loss instead of quietly presenting the last value it saw as live state
 * (`#loss-is-the-bindings-to-report`). No surface polls or times anything out
 * for itself; there is nowhere else for staleness to be detected.
 */
export type ConnectionStatus =
  | { readonly kind: "connecting" }
  | { readonly kind: "live" }
  | { readonly kind: "lost"; readonly reason: string };

/**
 * One reading of a binding: the state, and the standing of the connection that
 * produced it.
 *
 * `value` is `undefined` until the first value arrives — the pre-first-read
 * state a live subscription genuinely has, and one a surface must render
 * something for rather than assume away.
 */
export interface BindingSnapshot<TState> {
  readonly value: TState | undefined;
  readonly status: ConnectionStatus;
}

/**
 * A read of state, and nothing more.
 *
 * `subscribe` is Svelte's store contract — it calls the listener immediately
 * with the current snapshot and returns an unsubscribe — so a component reads a
 * binding as `$binding` and stays reactive without this package knowing
 * anything about runes. `current` is the same snapshot for imperative reads.
 */
export interface StateBinding<TState> {
  readonly current: BindingSnapshot<TState>;
  subscribe(run: (snapshot: BindingSnapshot<TState>) => void): () => void;
  /** Release the underlying subscription. Idempotent. */
  close(): void;
}

/**
 * The shape a binding's mutations take: named, argument-typed, async.
 *
 * A mapped type over the caller's own mutation names rather than
 * `Record<string, …>`, for the same reason `AffordanceSet` is one: an interface
 * has no implicit index signature and would not satisfy the `Record` form, and
 * a surface's mutations are exactly the kind of thing an author declares as an
 * interface.
 */
export type MutationRecord<TMutations = Record<string, (...args: never[]) => Promise<unknown>>> = {
  readonly [K in keyof TMutations]: (...args: never[]) => Promise<unknown>;
};

/**
 * A binding that also offers writes.
 *
 * The mutations are a typed record rather than a generic `mutate(name, args)`,
 * so which writes a binding offers is visible in its type — and a binding that
 * offers none is `StateBinding`, with no member to express the absence with.
 */
export interface MutableBinding<TState, TMutations extends MutationRecord<TMutations>>
  extends StateBinding<TState> {
  readonly mutations: TMutations;
}

/**
 * The notification machinery both implementations share.
 *
 * Not exported: a binding is obtained from a factory, and a third
 * implementation belongs in this module beside the other two rather than
 * anywhere a surface can reach.
 */
class BindingSource<TState> {
  #snapshot: BindingSnapshot<TState>;
  #listeners = new Set<(snapshot: BindingSnapshot<TState>) => void>();
  #closed = false;
  #release: () => void = () => {};

  constructor(initial: BindingSnapshot<TState>) {
    this.#snapshot = initial;
  }

  get snapshot(): BindingSnapshot<TState> {
    return this.#snapshot;
  }

  onClose(release: () => void): void {
    this.#release = release;
  }

  publish(snapshot: BindingSnapshot<TState>): void {
    if (this.#closed) return;
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) listener(snapshot);
  }

  value(value: TState): void {
    this.publish({ value, status: { kind: "live" } });
  }

  status(status: ConnectionStatus): void {
    this.publish({ value: this.#snapshot.value, status });
  }

  subscribe(run: (snapshot: BindingSnapshot<TState>) => void): () => void {
    this.#listeners.add(run);
    run(this.#snapshot);
    return () => {
      this.#listeners.delete(run);
    };
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#listeners.clear();
    this.#release();
  }
}

/**
 * The read surface over a source, plus whatever members the caller composes
 * onto it — the one place `current`/`subscribe`/`close` are built.
 *
 * Composed by construction rather than by spreading a built read surface:
 * spreading an object copies a getter's *current value* as a plain property,
 * which would freeze `current` at the moment of construction. The extra members
 * are plain functions and values, so spreading THEM is safe.
 */
function bindingOver<TState, TExtra extends object>(
  source: BindingSource<TState>,
  extra: TExtra,
): StateBinding<TState> & TExtra {
  return {
    get current() {
      return source.snapshot;
    },
    subscribe: (run: (snapshot: BindingSnapshot<TState>) => void) => source.subscribe(run),
    close: () => source.close(),
    ...extra,
  };
}

// --- Fixture -------------------------------------------------------------

/**
 * A binding whose state is set from the test (or the standalone dev mount) that
 * created it. `set` and `report` are the *driver's* handles, not a surface's:
 * a surface is handed the binding as `StateBinding` and sees neither.
 */
export interface FixtureBinding<TState> extends StateBinding<TState> {
  /** Publish a new value; the status becomes live. */
  set(value: TState): void;
  /** Publish a connection status without changing the value. */
  report(status: ConnectionStatus): void;
}

/** A fixture binding that also offers the scripted mutations it was given. */
export interface MutableFixtureBinding<TState, TMutations extends MutationRecord<TMutations>>
  extends FixtureBinding<TState>,
    MutableBinding<TState, TMutations> {}

function fixtureSource<TState>(initial?: TState): BindingSource<TState> {
  return new BindingSource<TState>(
    initial === undefined
      ? { value: undefined, status: { kind: "connecting" } }
      : { value: initial, status: { kind: "live" } },
  );
}

function fixtureHandles<TState>(source: BindingSource<TState>): FixtureBinding<TState> {
  return bindingOver(source, {
    set: (value: TState) => source.value(value),
    report: (status: ConnectionStatus) => source.status(status),
  });
}

/**
 * An in-memory read-only binding — the source a surface renders under test, and
 * the one a standalone mount runs against with no host at all.
 */
export function fixtureBinding<TState>(initial?: TState): FixtureBinding<TState> {
  return fixtureHandles(fixtureSource(initial));
}

/**
 * The same, plus scripted mutations. Whatever the mutations do — record their
 * arguments, reject, or drive `set` — is the fixture's business; the surface
 * sees only that the binding offers them.
 */
export function mutableFixtureBinding<TState, TMutations extends MutationRecord<TMutations>>(
  initial: TState | undefined,
  mutations: TMutations,
): MutableFixtureBinding<TState, TMutations> {
  const source = fixtureSource(initial);
  return bindingOver(source, {
    set: (value: TState) => source.value(value),
    report: (status: ConnectionStatus) => source.status(status),
    mutations,
  });
}

// --- Convex --------------------------------------------------------------

/**
 * A credential is passed as an argument of the call, not as ambient client
 * state: the host's public functions all take an optional `credential` arg
 * (`packages/convex-host/convex/publicFunctions.ts`), and a binding built for a
 * signed-in visitor and one built for an anonymous one differ only in whether
 * this was supplied.
 */
const CREDENTIAL_ARG = "credential";

export interface ConvexBindingOptions<TQuery extends FunctionReference<"query">> {
  /** A live `ConvexClient` from `convex/browser`, owned by the caller. */
  readonly client: ConvexClient;
  /** The generated function reference — never a name string. */
  readonly query: TQuery;
  readonly args: FunctionArgs<TQuery>;
  readonly credential?: string | undefined;
}

export type ConvexMutationSpec = Record<string, FunctionReference<"mutation">>;

export type ConvexMutations<TSpec extends ConvexMutationSpec> = {
  [K in keyof TSpec]: (args: FunctionArgs<TSpec[K]>) => Promise<FunctionReturnType<TSpec[K]>>;
};

function withCredential(
  args: Record<string, unknown>,
  credential: string | undefined,
): Record<string, unknown> {
  return credential === undefined ? args : { ...args, [CREDENTIAL_ARG]: credential };
}

function convexSource<TQuery extends FunctionReference<"query">>(
  options: ConvexBindingOptions<TQuery>,
): BindingSource<FunctionReturnType<TQuery>> {
  const source = new BindingSource<FunctionReturnType<TQuery>>({
    value: undefined,
    status: { kind: "connecting" },
  });
  // The repo's one reactive read: `onUpdate` re-runs the query on every write
  // that touches it, so every viewer of the same record is looking at the same
  // value without any of them polling.
  const unsubscribe = options.client.onUpdate(
    options.query,
    withCredential(options.args as Record<string, unknown>, options.credential) as FunctionArgs<
      typeof options.query
    >,
    (value: FunctionReturnType<TQuery>) => {
      source.value(value);
    },
    (error: Error) => {
      source.status({ kind: "lost", reason: error.message });
    },
  );
  source.onClose(unsubscribe);
  return source;
}

export function convexBinding<TQuery extends FunctionReference<"query">>(
  options: ConvexBindingOptions<TQuery>,
): StateBinding<FunctionReturnType<TQuery>> {
  return bindingOver(convexSource(options), {});
}

/**
 * The same live read, plus the named mutations the host offers over it. The
 * credential travels with the writes exactly as it travels with the read.
 */
export function convexMutableBinding<
  TQuery extends FunctionReference<"query">,
  TSpec extends ConvexMutationSpec,
>(
  options: ConvexBindingOptions<TQuery> & { readonly mutations: TSpec },
): MutableBinding<FunctionReturnType<TQuery>, ConvexMutations<TSpec>> {
  const source = convexSource(options);
  const { client, credential } = options;
  const mutations = {} as Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
  for (const [name, reference] of Object.entries(options.mutations)) {
    mutations[name] = (args) =>
      client.mutation(
        reference,
        withCredential(args, credential) as FunctionArgs<typeof reference>,
      );
  }
  return bindingOver(source, { mutations: mutations as ConvexMutations<TSpec> });
}
