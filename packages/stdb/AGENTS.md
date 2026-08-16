# Agent Context — packages/stdb

This package is `@cyphid/snek-stdb`: the SpacetimeDB TypeScript module. It is the authoritative executor of Team Snek game logic within the SpacetimeDB runtime.

## Spec scope

- **Module 04** (`legacy-spec-archive/spec/04-stdb-engine.md`) — reducers, schema, RLS, chess timer, subscription queries.
- **Module 01 / `game-engine` capability** (`openspec/specs/game-engine/spec.md`) — consumed via `@cyphid/snek-engine`.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — lifecycle and identity context.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — OIDC/JWT validation, RLS identity model.
- **`identity-and-authorization` capability** (`openspec/changes/migrate-identity-and-authorization/specs/identity-and-authorization/spec.md` while the change is open) — admission-validation, consumed via `@cyphid/snek-platform-auth`'s game-token subject codec (see "Admission core" below).

## What goes here

- SpacetimeDB table schemas (static tables, turn-keyed append-only tables, mutable working tables).
- Reducer implementations: `initialize_game`, `register`, `stage_move`, `declare_turn_over`, `resolve_turn`.
- Row-level security rules for snake invisibility.
- Chess timer implementation.
- Subscription query patterns and client query helpers.

## What does NOT go here

- Any Convex imports.
- Business logic that is already in `@cyphid/snek-engine` — import, don't duplicate.

## Implementation notes

Before implementing, read `legacy-spec-archive/spec/04-stdb-engine.md` in full. The SpacetimeDB SDK for TypeScript is distinct from normal Node/Bun TypeScript — reducers run inside the STDB runtime and cannot use arbitrary Node APIs.

Run `pnpm codegen` to regenerate SpacetimeDB bindings once real codegen is wired up (currently a no-op stub).

## Admission core

`src/admission.ts` is the **pure** admission decision core for
`identity-and-authorization/admission-validation`: given seeded
per-instance state and a presented token, it decides whether a connection
is admitted and as which identity, using `@cyphid/snek-platform-auth`'s
game-token subject codec. It imports no SpacetimeDB SDK and touches no
reducer, table, or connection — it is wired into the actual `register`
reducer (reading seeded tables, calling the runtime's own signature check,
disconnecting a rejected client) by the `mint-game-runtime` change.

## Key files

- `src/index.ts` — reducer and schema exports
- `src/admission.ts` — the pure admission decision core (see above)
- `legacy-spec-archive/spec/04-stdb-engine.md` — binding source of truth
