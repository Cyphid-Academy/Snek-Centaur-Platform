# Agent Context — packages/engine

This package is `@cyphid/snek-engine`: the shared game engine. It is the single source of truth for domain types and turn resolution logic — all three runtimes (SpacetimeDB, Centaur Server, web clients) import from here.

## Spec scope

- **Module 01** (`spec/01-game-rules.md`) — all domain types and the full turn resolution algorithm (eleven phases).
- **Module 02** (`spec/02-platform-architecture.md`) — `02-REQ-034` mandates this shared codebase.

## What goes here

- Domain type vocabulary: `Direction`, `CellType`, `Snake`, `Board`, `Item`, `Effect`, `TurnEvent`, etc.
- `resolveTurn(state, moves): TurnResult` — the authoritative eleven-phase turn resolver.
- `isValidMove(state, snakeId, direction): boolean` — pre-validation helper.
- Any pure game-logic utilities (spawning algorithms, collision math, etc.).

## What does NOT go here

- Any SpacetimeDB, Convex, or Svelte imports.
- Any I/O or network code.
- Any persistence layer references.

## Implementation notes

All exports in `src/index.ts` are currently typed stubs that throw `Error("not implemented")`. The implementing engineer should work through `spec/01-game-rules.md` requirements in order, adding tests alongside each implemented phase.

Every non-trivial decision must cite the spec requirement it satisfies:

```typescript
// spec: 01-REQ-042
```

## Key files

- `src/index.ts` — all exports live here (single-file package is fine for now; split as needed)
- `spec/01-game-rules.md` — binding source of truth
- `spec/02-platform-architecture.md` § Shared Engine Codebase
