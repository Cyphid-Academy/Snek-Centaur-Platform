# @cyphid/snek-engine

Shared game engine for the Team Snek Centaur Platform.

Implements spec module 01 in full: the domain type vocabulary, seeded randomness (Xoshiro256++ + BLAKE3 sub-seed derivation), the board generation pipeline (hazards, Perlin fertile tiles, territories, snake init, initial food, bounded retry), chess-timer arithmetic, and the authoritative eleven-phase `resolveTurn`. All three runtimes — SpacetimeDB (authoritative), Centaur Server (simulation), and web clients (pre-validation/rendering) — import from this package.

Everything is pure ECMAScript with no runtime-specific APIs; the only dependency is `@noble/hashes` (BLAKE3, mandated by module 01 DOWNSTREAM IMPACT note 4).

**Spec module**: 01-game-rules, 02-platform-architecture (§2.17 Shared Engine Codebase)

Key entry points:

- `generateBoardAndInitialState(config, teams, gameSeed)` — board + snakes + initial food, or a machine-readable `BoardGenerationFailure`
- `resolveTurn(state, stagedMoves, turnNumber, turnSeed, config)` — one atomic turn: next state, ordered `TurnEvent`s, `GameOutcome`
- `initialClock` / `applyTurnStart` / `declareTurnOver` — chess-timer arithmetic for module 04's reducers
- `invulnerabilityLevel(snake)` / `isVisible(snake)` — derived effect values
- `rngFromSeed` / `subSeed` — reproducible randomness primitives

Implementation decisions and spec divergences are recorded in [`DECISIONS.md`](./DECISIONS.md).
