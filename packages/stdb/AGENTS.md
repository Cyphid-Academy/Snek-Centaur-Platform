# Agent Context — packages/stdb

This package is `@cyphid/snek-stdb`: the SpacetimeDB TypeScript module. It is the authoritative executor of Team Snek game logic within the SpacetimeDB runtime.

## Spec scope

- **Module 04** (`legacy-spec-archive/spec/04-stdb-engine.md`) — reducers, schema, RLS, chess timer, subscription queries.
- **Module 01 / `game-engine` capability** (`openspec/specs/game-engine/spec.md`) — consumed via `@cyphid/snek-engine`.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — lifecycle and identity context.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — OIDC/JWT validation, RLS identity model.

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

Concretely: `spacetime build` bundles the module *and everything it imports from `node_modules`* into one `bundle.js` with rolldown, and the host runs that in a V8 isolate. So npm dependencies are inlined and work (the shared engine, including its BLAKE3 dependency, runs unmodified inside a reducer — no shim, no vendored copy), but there are no Node builtins: no `fs`, no `process`, no `node:` imports anywhere in the import graph.

**The package has two halves, on purpose.**

- `src/` is an ordinary workspace package in the strict composite build. It re-exports the engine's types and holds, in time, the row codecs mapping the engine's `GameState` to and from table rows. Anything that can be checked under the workspace's real settings belongs here. It deliberately holds **no** hand-written table of reducer or table names: a string literal is not a reference, so such a table drifts silently on a rename. Real bindings come from `spacetime generate` when a caller needs to address the instance over the wire.
- `spacetimedb/` is the module project that `spacetime build` owns. Its `tsconfig.json` is SpacetimeDB's, not the workspace's, and it is excluded from `tsc -b`. It is a separate pnpm workspace member (declared in `pnpm-workspace.yaml`) so `spacetimedb` and the engine are installed into it — without that, the bundle fails with `Module not found`.

Keep reducer bodies thin and push anything worth checking into `src/`. The module project's tsconfig is looser than the workspace's, so logic left in `spacetimedb/` is logic checked less carefully.

**What is here now is a skeleton.** The module publishes one table (`module_info`) and one reducer (`ping`), which together prove the toolchain end to end — build, publish, call, and the shared engine running unmodified inside the isolate. The gameplay tables and the four real reducers (`initialize_game`, `stage_move`, `declare_turn_over`, `resolve_turn`) land with `migrate-game-lifecycle`, `migrate-operator-control` and `migrate-turn-pacing`. Do not add them ahead of those changes: a reducer body is where the rules end up, and a table is a schema the instance then agrees to.

**One instance, one game.** No table is keyed by game id: `global-invariants/spacetimedb-instance-isolation` makes the database itself the game. A reducer that throws aborts its transaction — that is the intended failure mode for turn resolution, and the message surfaces in `spacetime logs`, not in the CLI's response.

`pnpm codegen` remains a no-op: client bindings (`spacetime generate`) are only worth generating once something consumes them.

## Key files

- `spacetimedb/src/index.ts` — tables and reducers (the module itself)
- `src/index.ts` — engine re-exports, and constants the published module itself imports
- `legacy-spec-archive/spec/04-stdb-engine.md` — binding source of truth
- `docs/external-setup.md` → *Local development* — how to run and drive it
