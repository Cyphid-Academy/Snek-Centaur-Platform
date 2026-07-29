# Agent Context — packages/engine

This package is `@cyphid/snek-engine`: the shared game engine. It is the single source of truth for domain types and turn resolution logic — all three runtimes (SpacetimeDB, Centaur Server, web clients) import from here.

## Spec scope

- **Module 01 / `game-engine` capability** (`openspec/specs/game-engine/spec.md`) — all domain types and the full staged turn-resolution model.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — `02-REQ-034` mandates this shared codebase.

## What goes here

- Domain type vocabulary: `Direction`, `CellType`, `SnakeState`, `Board`, `ItemState`, `PotionEffect`, `TurnEvent`, etc.
- `resolveTurn(state, stagedMoves, turnNumber, turnSeed, config)` — the authoritative staged turn resolver.
- `isValidMove(state, snakeId, direction): boolean` — pre-validation helper.
- Any pure game-logic utilities (spawning algorithms, collision math, seeded randomness, chess-timer arithmetic).

## What does NOT go here

- Any SpacetimeDB, Convex, or Svelte imports.
- Any I/O or network code.
- Any persistence layer references.
- **Board generation, and any parameter that only feeds it.** The engine is handed a fully specified board and plays it: its dimensions state its size and its placed snakes state each team's count. A parameter no turn's resolution reads is a parameter the engine must not declare (`game-engine/configuration-parameters#no-parameter-the-engine-does-not-read`). Generation lives in `@cyphid/snek-game-configuration`.

## Implementation notes

Module 01 is fully implemented and tested. Non-trivial implementation-level decisions are recorded in `DECISIONS.md` — read it before changing turn-resolution or clock semantics.

Every non-trivial decision must cite the spec requirement it satisfies:

```typescript
// spec: 01-REQ-042
```

Structural invariants to preserve (01 §2.8, resolved 01-REVIEW-022):

- Turn resolution is snapshot → parallel rules → deterministic commit. Interaction rules read only the snapshot, the surviving moved-head set `H*` (after head-to-head precedence), and the turn seed; they emit claims and never write game state. The commit is the sole writer. A new mechanic is a new rule emitting claims plus, at most, one clause in the commit — never an in-place mutation during rule evaluation.
- `SnakeState` carries no intra-turn bookkeeping: growth is a duplicated tail segment in `body` (01-REQ-062); there is no `ateLastTurn` or `pendingEffects` field.
- `subSeed` is BLAKE3 keyed hashing via `@noble/hashes` — changing the algorithm or the context tags breaks replay reproducibility everywhere (module 01 DOWNSTREAM IMPACT note 4).

## Key files

- `src/index.ts` — public API surface, mirrors 02 §2.17's export list
- `src/types.ts` — canonical domain types (01 §3.1–3.6)
- `src/resolve/` — the staged rule/commit resolver:
  - `context.ts` — TurnContext build (move projection, head-to-head precedence → H*)
  - `claims.ts` — ClaimSet: the turn's typed claim vocabulary, canonically ordered
  - `rules.ts` — INTERACTION_RULES (one pure function per mechanic) + derived rules
  - `commit.ts` — the sole writer; fixed-order combinator + event derivation
  - `spawn.ts`, `win.ts`, `events.ts`, `work.ts`, `index.ts` (orchestrator)
- `src/resolve.ts` — stable re-export shim for the resolver
- `src/rng.ts` — seeded randomness
- `src/clock.ts` — chess-timer arithmetic
- `src/effects.ts` — derived effect values + family helpers + EFFECT_DURATION_TURNS
- `src/testkit.ts` — shared test builders and the doResolve harness (not exported)
- `src/arbitraries.ts` — fast-check arbitraries, including the drawn initial
  states that replaced generated boards as the fuzzer's input (deliberately
  harsher than generation: interior walls, ringless boards, mixed head
  parities, snakes on hazards, near-empty clocks)
- `src/resolve-properties.test.ts` — rule-order-shuffle property test and the
  multi-turn invariant fuzzer; run these after ANY resolver change
- `DECISIONS.md` — implementation decision log
- `openspec/specs/game-engine/spec.md` — binding source of truth
- `legacy-spec-archive/spec/02-platform-architecture.md` § Shared Engine Codebase

## Adding a mechanic

Write one pure rule `(ctx, claims) => void` in `src/resolve/rules.ts`, add it
to `INTERACTION_RULES`, and (only for a brand-new claim type) add one clause
to `commit.ts`. Claim collections must expose canonically-ordered views (see
`damageSources`/`cancellations` in claims.ts) so outputs stay independent of
rule evaluation order — the order-shuffle property test enforces this.
