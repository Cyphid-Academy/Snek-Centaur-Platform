// The platform's mirror guard: every validator in validators.ts that renders
// an engine or game-configuration type is asserted equal to that type —
// field names, nesting, types, and modifiers — with the one shared assertion
// (`AssertExact`). Drift in either direction fails `tsc -b`, so it fails
// `pnpm build:packages`, `pnpm typecheck`, and CI alike.
// spec: game-configuration/engine-schema-fidelity
// spec: global-invariants/engine-mirrors-are-guarded#one-assertion-every-site
//
// WHY THE ENGINE SIDE IS TRANSFORMED, AND WHY THAT IS SOUND
//
// Convex's `Infer` produces plain serialized shapes: every property mutable,
// every scalar unbranded (a stored document cannot carry a `readonly`
// modifier or a compile-time brand). Asserting `Infer<validator>` against the
// engine type raw would therefore fail on every field for reasons that are
// not drift. `MirrorShape<T>` is applied to the ENGINE side only, and
// discards exactly the two features `Infer` is structurally incapable of
// producing:
//
//   1. `readonly` modifiers (properties and arrays) — `Infer` never emits
//      them, so no validator divergence can hide behind their removal;
//   2. brand intersections (`number & { __brand }`, `string & { __brand }`)
//      — a brand has no serialized rendering, so no validator divergence can
//      hide behind their erasure either. Literal unions (CellType's 0-3,
//      an effect family's names) are NOT brands and are NOT collapsed: the
//      validator must reproduce them literal-for-literal.
//
// Because the transform touches only the engine side, the validator-inferred
// type is asserted exactly as Convex will enforce it at every write — nothing
// is widened on the side that could actually drift. The alternative (a
// DeepReadonly wrapper on the inferred side) was rejected: wrapping the
// inferred type would assert a shape Convex never enforces, and a brand still
// has to be erased somewhere, which lands the transform on both sides at
// once. One transform, one side, both erasures provably information-free.
// design: openspec/changes/migrate-game-configuration/design.md (constraint-mining, engine-schema-fidelity)
import type { AssertExact, GameRuntimeConfig } from "@cyphid/snek-engine";
import type {
  BoardGenerationConfig,
  BoardGenerationFailure,
  GameConfig,
  GeneratedInitialState,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";
import type { Infer } from "convex/values";
import type {
  gameConfigValidator,
  generationConfigValidator,
  generationFailureValidator,
  initialStateValidator,
  runtimeConfigValidator,
  teamValidator,
} from "./validators.js";

/**
 * The serialized rendering of an engine-side type: `readonly` stripped at
 * every depth, brand intersections erased, everything else — field names,
 * nesting, optionality, literal unions — preserved exactly.
 */
export type MirrorShape<T> = T extends number & { readonly __brand: unknown }
  ? number
  : T extends string & { readonly __brand: unknown }
    ? string
    : T extends ReadonlyArray<infer E>
      ? Array<MirrorShape<E>>
      : T extends object
        ? { -readonly [K in keyof T]: MirrorShape<T[K]> }
        : T;

// The gameplay half mirrors the engine's own configuration type.
// spec: game-configuration/engine-schema-fidelity#no-translation-at-handoff
export const RUNTIME_CONFIG_MIRROR: AssertExact<
  Infer<typeof runtimeConfigValidator>,
  MirrorShape<GameRuntimeConfig>
> = true;

// The generation half mirrors this capability's own declaration — and
// because the two halves are disjoint by construction, a generation field
// appearing in the engine's config types fails RUNTIME_CONFIG_MIRROR above.
// spec: game-configuration/engine-schema-fidelity#a-generation-field-is-not-a-mirror-failure
export const GENERATION_CONFIG_MIRROR: AssertExact<
  Infer<typeof generationConfigValidator>,
  MirrorShape<BoardGenerationConfig>
> = true;

// The whole stored configuration: exactly the two halves, nothing else.
// spec: game-configuration/closed-parameter-vocabulary
export const GAME_CONFIG_MIRROR: AssertExact<
  Infer<typeof gameConfigValidator>,
  MirrorShape<GameConfig>
> = true;

export const TEAM_MIRROR: AssertExact<
  Infer<typeof teamValidator>,
  MirrorShape<TeamRegistration>
> = true;

// The stored starting state / preview result is the generator's output
// verbatim — engine domain types inside, so it is a mirror site like any
// other and is guarded at the same strength.
// spec: global-invariants/engine-mirrors-are-guarded#drift-fails-the-build
export const INITIAL_STATE_MIRROR: AssertExact<
  Infer<typeof initialStateValidator>,
  MirrorShape<GeneratedInitialState>
> = true;

export const GENERATION_FAILURE_MIRROR: AssertExact<
  Infer<typeof generationFailureValidator>,
  MirrorShape<BoardGenerationFailure>
> = true;
