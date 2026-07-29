# Agent Context — packages/game-configuration

This package is `@cyphid/snek-game-configuration`: the runtime-agnostic core of the `game-configuration` capability — the configuration vocabulary a game is shaped with, and the platform's **one** board generator.

## Spec scope

- **`game-configuration`** (`openspec/changes/migrate-game-configuration/specs/game-configuration/spec.md` until that change archives, then `openspec/specs/`).
- **`global-invariants/one-shared-generation`** — there is exactly one generator on the platform, and it is this one.

## What goes here

- `BoardGenerationConfig`, `GameConfig`, and the generation half's defaults. The gameplay half is read from the engine (`DEFAULT_RUNTIME_CONFIG`), never restated.
- `generateBoardAndInitialState(config, teams, gameSeed)` — the generation pipeline as named stage functions with a bounded, sub-seeded retry.
- `BoardGenerationFailure` — the all-or-nothing outcome. Generation never substitutes a board it *can* seat for one it cannot.
- Perlin noise and any other generation-only maths.

## What does NOT go here

- Anything a **turn's resolution** reads. Those are the engine's, and the boundary is checkable: if a resolution consults it, it belongs to `game-engine`.
- Any SpacetimeDB, Convex, or Svelte imports, and any I/O — this package is pure like the engine it sits above.
- A second copy of a gameplay bound. Bounds come from exactly one declaration (`game-configuration/parameter-bounds-sourcing`).

## Why this package exists at all

`revise-game-engine-contract` took board generation out of `game-engine`'s contract: seven requirements and five configuration parameters described how a board is *built*, and nothing in turn resolution read any of them. The boundary keeping generation platform-side was an old, argued decision — what never caught up was the packaging. This is the packaging catching up.

Four surfaces need a board (a preview, a launched game, a fixture, the visual tester), which is why the algorithm ships as a shared package rather than living inside whichever one got there first.

## Testing note

The engine's property suite used to build every initial state by *calling* this generator. It cannot any more — the dependency runs the other way — so it draws states directly from arbitraries that are deliberately harsher than generation (see `packages/engine/src/arbitraries.ts`). If you strengthen a generation guarantee here, do not assume the engine's fuzzer inherits it: it is specifically built not to.
