# @cyphid/snek-game-configuration

The pre-launch shaping of a game: the closed parameter vocabulary a game is configured with, and **the one shared implementation of the rules by which a board is built**.

The engine plays a board it is handed and knows nothing of how one is made. Everything that decides what a board looks like before its first turn is here — its shape, its hazards, its fertile ground, the starting territories, the snakes and food placed in them, and the bounded retry that makes generation all-or-nothing.

**Capability**: `game-configuration`

## There is exactly one generator

A preview, a launched game, a committed fixture and the visual tester's generated session all call this code. A second implementation is forbidden however locally convenient: two code paths over the same parameters and seed agree on the day the second is written and diverge silently afterwards, surfacing only when somebody compares the two boards (`global-invariants/one-shared-generation`).

## Exports

- `generateBoardAndInitialState(config, teams, gameSeed)` — board + snakes + initial food, or a machine-readable `BoardGenerationFailure`. Deterministic from the seed, and all-or-nothing: an infeasible parameter set yields the failure rather than a board of the generator's own choosing.
- `BoardGenerationConfig` / `GameConfig` — a game's configuration in exactly two disjoint halves: this capability's generation parameters, and the engine's gameplay vocabulary by reference (never restated, so a widget's limits and the record's rejection threshold cannot disagree).
- `DEFAULT_GENERATION_CONFIG` / `DEFAULT_GAME_CONFIG`.

## What is not here yet

The capability's persistent configuration record, its authoritative validation surface, the board-preview workflow and the launch freeze belong to the runtimes that hold them, and arrive with the rest of `migrate-game-configuration`'s implementation. This package is the runtime-agnostic core they will build on.
