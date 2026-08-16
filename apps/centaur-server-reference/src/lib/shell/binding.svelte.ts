// The one state binding every surface in the application reads through.
// spec: application-shell/one-state-binding
//
// A surface is written against `StateBinding`/`MutableBinding` alone, never
// against what backs one — a live runtime subscription, a persisted record,
// or a fixture (#a-surface-does-not-know-its-source). What the surface may do
// to the state is a property of which shape it was handed: a plain
// `StateBinding` carries no `mutations` member at all, so there is nothing to
// invoke rather than something that refuses when invoked
// (#absence-not-refusal). Connection loss is the binding's own thing to
// report through `status`, never a staleness check a surface performs on its
// own (#loss-is-the-bindings-to-report).

// spec: application-shell/one-state-binding#loss-is-the-bindings-to-report
export type BindingStatus =
  | { readonly kind: "connected" }
  | { readonly kind: "lost"; readonly reason: string };

// spec: application-shell/one-state-binding
export interface StateBinding<T> {
  readonly value: T | undefined;
  readonly status: BindingStatus;
}

// spec: application-shell/one-state-binding#absence-not-refusal — the ABSENCE
// of `mutations` on a plain `StateBinding` is what makes a binding read-only;
// this interface only exists to add the member back for a binding that has
// one, never to declare that a binding might refuse a mutation it was handed.
export interface MutableBinding<T, M> extends StateBinding<T> {
  readonly mutations: M;
}

// spec: application-shell/one-state-binding#a-surface-does-not-know-its-source
// — the shape a real source backs `bindingFromSource` with. Deliberately just
// two callbacks and an unsubscribe: a Convex subscription, a SpacetimeDB
// subscription, or a persisted-record poller can all be adapted to this
// without the binding surface knowing which one it got.
export interface BindingSource<T> {
  subscribe(onValue: (value: T) => void, onLoss: (reason: string) => void): () => void;
}

// spec: application-shell/one-state-binding — a static, always-connected
// binding over a value that never changes. Its read surface is identical to
// a live one's, so a surface written against a fixture is unmodified once a
// real source stands behind the same binding shape.
export function fixtureBinding<T>(value: T): StateBinding<T> {
  return {
    value,
    status: { kind: "connected" },
  };
}

// spec: application-shell/one-state-binding#a-surface-does-not-know-its-source
export function bindingFromSource<T>(source: BindingSource<T>): StateBinding<T> {
  let value = $state<T | undefined>(undefined);
  let status = $state<BindingStatus>({ kind: "connected" });

  source.subscribe(
    (next) => {
      value = next;
      status = { kind: "connected" };
    },
    // spec: application-shell/one-state-binding#loss-is-the-bindings-to-report
    // — the loss reaches the surface through `status`; `value` is left as it
    // stood rather than cleared, since clearing it would be a second, silent
    // way for a surface to notice loss instead of reading `status`.
    (reason) => {
      status = { kind: "lost", reason };
    },
  );

  return {
    get value() {
      return value;
    },
    get status() {
      return status;
    },
  };
}

// spec: application-shell/one-state-binding — wraps a `StateBinding` with the
// mutations a surface mounted against it may perform, delegating every read
// to `base` so a mutable binding stays exactly as reactive as the binding it
// wraps.
export function mutableBinding<T, M>(base: StateBinding<T>, mutations: M): MutableBinding<T, M> {
  return {
    get value() {
      return base.value;
    },
    get status() {
      return base.status;
    },
    mutations,
  };
}
