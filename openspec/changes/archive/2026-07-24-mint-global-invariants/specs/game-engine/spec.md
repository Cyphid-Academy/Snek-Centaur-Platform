## RENAMES CAPABILITY: game-rules

## Purpose

Domain model and game behaviour for Team Snek, provided as the single shared
executable engine that is their canonical definition: the type vocabulary,
board construction, movement, collisions and severing, health, food and
growth, the team potion mechanic, invisibility, the staged turn-resolution
model, item spawning and identity, the chess timer, game end and scoring,
determinism, and runtime portability. This capability defines game behaviour
with no reference to storage, networking, or UI.

Depends on: (none — root of the capability graph). Consumed by:
global-invariants and, directly or transitively, every capability that
touches gameplay.

## ADDED Requirements

### Requirement: game-engine/runtime-portability
The engine SHALL depend only on portable ECMAScript facilities and SHALL take all nondeterminism and external input as explicit parameters — using no ambient clock, randomness, I/O, or runtime-specific API — so that a single build runs unchanged in any conformant JavaScript runtime.

#### Scenario: #no-ambient-nondeterminism
- **WHEN** the engine needs randomness or the current time
- **THEN** it reads them from explicit inputs (the `Rng` state, the game seed, the configuration), never from host facilities such as `Date.now` or `crypto`

#### Scenario: #no-runtime-specific-api
- **WHEN** the same engine build is loaded into a different conformant JavaScript runtime
- **THEN** it runs unchanged, relying on no Node-, browser-, or host-specific API
