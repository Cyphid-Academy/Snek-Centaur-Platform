# @cyphid/snek-engine

Shared game engine for the Team Snek Centaur Platform.

The complete rules of the game: the domain type vocabulary, seeded randomness (Xoshiro256++ + BLAKE3 sub-seed derivation), chess-timer arithmetic, and the authoritative staged `resolveTurn` (snapshot → parallel interaction rules → deterministic commit). All three runtimes — SpacetimeDB (authoritative), Centaur Server (simulation), and web clients (pre-validation/rendering) — import from this package.

The engine is **handed a fully specified board and plays it**. Nothing here builds one: board generation, and the parameters that only feed it, live in [`@cyphid/snek-game-configuration`](../game-configuration/README.md).

Everything is pure ECMAScript with no runtime-specific APIs; the only dependency is `@noble/hashes` (BLAKE3, mandated by module 01 DOWNSTREAM IMPACT note 4).

**Spec module**: 01-game-rules, 02-platform-architecture (§2.17 Shared Engine Codebase)

Key entry points:

- `resolveTurn(state, stagedMoves, turnNumber, turnSeed, config)` — one atomic turn: next state, ordered `TurnEvent`s, `GameOutcome`
- `initialClock` / `applyTurnStart` / `declareTurnOver` — chess-timer arithmetic for module 04's reducers
- `invulnerabilityLevel(snake)` / `isVisible(snake)` — derived effect values
- `rngFromSeed` / `subSeed` — reproducible randomness primitives

Implementation-level decisions are recorded in [`DECISIONS.md`](./DECISIONS.md).
