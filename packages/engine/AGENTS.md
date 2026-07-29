# Agent Context — packages/engine

This package is `@cyphid/snek-engine`: the shared game engine. It is the single source of truth for domain types and turn resolution logic — all three runtimes (SpacetimeDB, Centaur Server, web clients) import from here.

## Spec scope

- **Module 01 / `game-engine` capability** (`openspec/specs/game-engine/spec.md`) — all domain types and the full staged turn-resolution model.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — `02-REQ-034` mandates this shared codebase.

## What goes here

- Domain type vocabulary: `Direction`, `CellType`, `SnakeState`, `Board`, `ItemState`, `PotionEffect`, `TurnEvent`, etc.
- `advanceTurn(state, stagedMoves, turnSeed, timings, config)` — the mainline entry point: every alive snake takes the turn, directions resolved by the movement rules, and the result narrows to a `GameState`.
- `imagineMoves(state, directions, held, timings, config, turnSeed?)` — the hypothetical entry point over a `PartialGameState`: the named snakes take the directions given, the rest are held, and the result is a partial state or a typed refusal. Same stage list, same rules.
- `isValidMove(state, snakeId, direction): boolean` — pre-validation helper.
- Any pure game-logic utilities (spawning algorithms, collision math, seeded randomness, chess-timer arithmetic).

## What does NOT go here

- Any SpacetimeDB, Convex, or Svelte imports.
- Any I/O or network code.
- Any persistence layer references.
- **Board generation, and any parameter that only feeds it.** The engine is handed a fully specified board and plays it: its dimensions state its size and its placed snakes state each team's count. A parameter no turn's resolution reads is a parameter the engine must not declare (`game-engine/configuration-parameters#no-parameter-the-engine-does-not-read`). Generation lives in `@cyphid/snek-game-configuration`.
- **A second writer of a team's clock.** A turn's resolution applies the declared burn, banks the remainder, judges exhaustion and carves the next turn — all at one commit. `initialClock` is the game-start half and the only clock helper exported (`game-engine/chess-timer#only-a-resolution-moves-a-budget`).

## Implementation notes

Module 01 is fully implemented and tested. Non-trivial implementation-level decisions are recorded in `DECISIONS.md` — read it before changing turn-resolution or clock semantics.

Every non-trivial decision must cite the spec requirement it satisfies:

```typescript
// spec: 01-REQ-042
```

Structural invariants to preserve (01 §2.8, resolved 01-REVIEW-022):

- Turn resolution is snapshot → parallel rules → deterministic commit. Interaction rules read only the snapshot, the surviving moved-head set `H*` (after head-to-head precedence), and the turn seed; they emit claims and never write game state. The commit is the sole writer. A new mechanic is a new rule emitting claims plus, at most, one clause in the commit — never an in-place mutation during rule evaluation.
- `SnakeState` carries no intra-turn bookkeeping: growth is a duplicated tail segment in `body` (01-REQ-062); there is no `ateLastTurn` or `pendingEffects` field.
- **Time is a declared input, never a reading.** Both entry points take the turn's duration and each team's burn. The engine reads no clock, so determinism is untouched — the input tuple grew by two quantities and stayed closed. Reaching for `Date.now()` inside the resolver compiles, mostly passes, and destroys replay (`game-engine/determinism#time-is-an-input-not-a-reading`).
- **The state's current turn is derived, never stored** — the greatest turn any snake has reached. That is what makes holding every snake a no-op rather than a special case, and it removes a denormalisation that could disagree with the snakes it summarises.
- **The board has two kinds of occupant.** Participants are whole snakes taking the turn; projections are snakes held through it — headless, severable, carrying effects that expire and that team events reach. Move projection, head-to-head precedence, the health tick and health resolution iterate participants; occupancy, collisions, effects and the clock iterate `ctx.occupants` and mostly cannot tell which kind they have. A held snake's own record CRYSTALLIZES and is changed by nothing thereafter — resolve against its projection, never against the record (`game-engine/held-snakes`).
- `subSeed` is BLAKE3 keyed hashing via `@noble/hashes` — changing the algorithm or the context tags breaks replay reproducibility everywhere (module 01 DOWNSTREAM IMPACT note 4).

## Key files

- `src/index.ts` — public API surface, mirrors 02 §2.17's export list
- `src/types.ts` — canonical domain types (01 §3.1–3.6)
- `src/resolve/` — the staged rule/commit resolver:
  - `context.ts` — TurnContext build (move projection, head-to-head precedence → H*)
  - `claims.ts` — ClaimSet: the turn's typed claim vocabulary, canonically ordered
  - `rules.ts` — INTERACTION_RULES (one pure function per mechanic) + derived rules
  - `commit.ts` — the sole writer; fixed-order combinator + event derivation
  - `plan.ts` — direction resolution for both entry points, and the failure fence
  - `spawn.ts`, `win.ts`, `events.ts`, `work.ts`, `index.ts` (orchestrator)
- `src/resolve.ts` — stable re-export shim for the resolver
- `src/state.ts` — the two grains of "turn" and the `PartialGameState` → `GameState` narrowing
- `src/rng.ts` — seeded randomness
- `src/clock.ts` — chess-timer arithmetic, applied by the commit
- `src/effects.ts` — derived effect values + family helpers + EFFECT_DURATION_TURNS
- `src/testkit.ts` — shared test builders and the doResolve harness (not exported)
- `src/arbitraries.ts` — fast-check arbitraries, including the drawn initial
  states that replaced generated boards as the fuzzer's input (deliberately
  harsher than generation: interior walls, ringless boards, mixed head
  parities, snakes on hazards, near-empty clocks)
- `src/resolve-properties.test.ts` — rule-order-shuffle property test and the
  multi-turn invariant fuzzer; run these after ANY resolver change
- `src/resolve-hypothetical.test.ts` — held-snake semantics and the refusal fence
- `src/resolve-clock.test.ts` — the clock commit, exhaustion, and the timed ending
- `DECISIONS.md` — implementation decision log
- `openspec/specs/game-engine/spec.md` — binding source of truth
- `legacy-spec-archive/spec/02-platform-architecture.md` § Shared Engine Codebase

## Adding a mechanic

Write one pure rule `(ctx, claims) => void` in `src/resolve/rules.ts`, add it
to `INTERACTION_RULES`, and (only for a brand-new claim type) add one clause
to `commit.ts`. Claim collections must expose canonically-ordered views (see
`damageSources`/`cancellations` in claims.ts) so outputs stay independent of
rule evaluation order — the order-shuffle property test enforces this.
