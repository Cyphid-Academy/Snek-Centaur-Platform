# Agent Context — packages/convex-centaur-state

This package is `@cyphid/convex-centaur-state`: a Convex Component that owns the Centaur subsystem Convex tables. It is imported and mounted by `packages/convex-host`.

## Spec scope

- **Module 06** (`legacy-spec-archive/spec/06-centaur-state.md`) — Centaur subsystem tables, selection invariants, action log schema, drive management mutations, data contract for sub-turn replay.

## What goes here

- Convex schema for: `snake_config`, `snake_drives`, `heuristic_config`, `snake_heuristic_overrides`, `bot_params`, `centaur_action_log`.
- Convex Component configuration (`convex.config.ts`).
- Selection invariant enforcement (at most one operator per snake, at most one snake per operator).
- Drive management mutations.
- Action log writes.

## What does NOT go here

- Platform-wide tables — those are in `packages/convex-snek-platform`.
- Auth wrappers — those belong in `packages/convex-host`.

## Implementation notes

This is a Convex Component. Its tables are isolated from `convex-snek-platform`'s tables even though both are mounted in the same deployment. The Convex Component isolation model guarantees no table name collisions.

Selection invariants in `06-REQ-070` and `06-REQ-071` must be enforced at the Convex function level — not at the client. Optimistic UI may show the action, but the server mutation is the authoritative gate.

`pnpm codegen` is a no-op stub until real `convex codegen` is wired up.

## Key files

- `src/index.ts` — exported types and component config stub
- `legacy-spec-archive/spec/06-centaur-state.md` — binding source of truth
