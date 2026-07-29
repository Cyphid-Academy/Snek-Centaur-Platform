# @cyphid/snek-engine

Shared game engine for the Team Snek Centaur Platform.

The complete rules of the game: the domain type vocabulary, seeded randomness (Xoshiro256++ + BLAKE3 sub-seed derivation), chess-timer arithmetic, and the authoritative staged turn resolution (snapshot → parallel interaction rules → deterministic commit). All three runtimes — SpacetimeDB (authoritative), Centaur Server (simulation), and web clients (pre-validation/rendering) — import from this package.

The engine is **handed a fully specified board and plays it**. Nothing here builds one: board generation, and the parameters that only feed it, live in [`@cyphid/snek-game-configuration`](../game-configuration/README.md).

Everything is pure ECMAScript with no runtime-specific APIs; the only dependency is `@noble/hashes` (BLAKE3, mandated by module 01 DOWNSTREAM IMPACT note 4).

**Capability**: `game-engine` (`openspec/specs/game-engine/spec.md`)

Two entry points over one stage list:

- `advanceTurn(state, stagedMoves, turnSeed, timings, config)` — the mainline. Every alive snake takes the turn, its direction resolved by the movement rules; yields the next `GameState`, ordered `TurnEvent`s and the `GameOutcome`.
- `imagineMoves(state, directions, held, timings, config, turnSeed?)` — the hypothetical. The named snakes take the directions given and the rest are **held**. A held snake crystallizes into a frozen record and leaves a headless **projection** standing on the board in its place: an obstacle and a severable body that asserts nothing about where the snake's head actually went. Yields a `PartialGameState` (which will not narrow while a live projection stands) or a typed refusal — a worst-case search would rather be told "I cannot answer that" than be guessed at.
- `advanceHistory(state, directions, config)` — a projection's move at the turn it was **held**, learned after the fact. Resolves the board again from before that turn and replays everything since, so the result is at the same turn with the snake one turn less historic. It may rewrite what already happened, and says which snakes' fates it changed.

Both **require the turn's timings**: how long it lasted, and how much of its own clock each team burned on it. The engine reads no clock — time is a declared input like the staged moves and the turn seed, which is what lets a limit measured in real time be an ordinary rule of the game.

Also exported:

- `initialClock(teamId, clockConfig)` — a team's clock at game start, already carved out for turn 0. Every later carve happens inside a resolution: nothing outside one moves a budget.
- `currentTurn` / `isLockstep` / `narrowToGameState` / `asGameState` — the two grains of "turn", and the only way to obtain the persisted state form.
- `standingScores(snakes, roster)` — a team's normalised body-share at any turn, the formula the final score is built on.
- `invulnerabilityLevel(snake)` / `isVisible(snake)` — derived effect values.
- `rngFromSeed` / `subSeed` — reproducible randomness primitives.

Implementation-level decisions are recorded in [`DECISIONS.md`](./DECISIONS.md).
