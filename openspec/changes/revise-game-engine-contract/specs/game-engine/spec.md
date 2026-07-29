## MODIFIED Requirements

### Requirement: game-engine/domain-vocabulary

The game SHALL use a closed domain vocabulary: four directions (`Up`/`Right`/`Down`/`Left`), four cell types (`Normal`/`Wall`/`Hazard`/`Fertile`), three item types (`Food`/`InvulnPotion`/`InvisPotion`), potion effects as `(family, state, expiryTurn)` triples over two families (`invulnerability`/`invisibility`) and two states (`buff`/`debuff`), present items as (identity, type, cell), and the snake state shape: `snakeId`, `letter`, `centaurTeamId`, `body` (ordered cells, head first), `health`, `activeEffects`, `lastDirection`, `alive`.

#### Scenario: #closed-sets
- **WHEN** any rule, event, or state refers to a direction, cell type, item type, or potion effect
- **THEN** it uses one of the enumerated values; no other variants exist anywhere in the game

#### Scenario: #derived-values-are-not-stored
- **WHEN** a snake's invulnerability level or visibility is needed
- **THEN** it is computed on demand from `activeEffects`; neither is a stored field of the snake state

### Requirement: game-engine/board-geometry
The board SHALL be a square grid of `boardSize × boardSize` cells whose outermost 1-cell-thick border is entirely `Wall`. The playable area is the `(boardSize − 2)²` inner cells.

#### Scenario: #construction
- **WHEN** a board is generated with edge length N
- **THEN** it is an N×N grid with a complete Wall ring and an (N−2)² playable interior

### Requirement: game-engine/determinism
All randomness SHALL be deterministic from seeds — game setup from the per-game seed, each turn's resolution from a per-turn seed derived from it — and no seed SHALL be accessible to any game client.

#### Scenario: #reproducibility
- **WHEN** a game is replayed from the same seed and the same staged moves
- **THEN** every board, spawn, and outcome is identical

#### Scenario: #secrecy
- **WHEN** any client (operator, bot, or spectator) reads game state
- **THEN** neither the game seed nor any turn seed is observable

### Requirement: game-engine/turn-resolution-model
Each turn SHALL resolve in fixed stages: move projection, head-to-head precedence, interaction rules, derived rules, commit, item spawning, win-condition check, event derivation. Every rule reads only the start-of-turn snapshot (plus the surviving moved-head set from head-to-head precedence, and — for derived rules — interaction-rule claims); the commit is the sole writer of game state.

#### Scenario: #snapshot-purity
- **WHEN** any rule evaluates during a turn
- **THEN** nothing committed during that same turn is observable to it — effects gained, cancelled, or expired at this commit first influence the next turn

#### Scenario: #order-independence
- **WHEN** the rules within the interaction stage or the derived stage are evaluated in any order or concurrently
- **THEN** every outcome is identical

### Requirement: game-engine/movement

All alive snakes SHALL move simultaneously each turn. Direction: the staged move if any; else `lastDirection` unconditionally, even into a lethal cell; else (turn 0 with nothing staged) a seeded-random direction, also unconstrained by lethality. The moved body advances the head one cell and drops the final tail segment; `lastDirection` updates to the direction moved.

#### Scenario: #direction-precedence
- **WHEN** a snake has a staged move, or none but a prior direction, or neither
- **THEN** it moves the staged direction, or repeats `lastDirection`, or moves a seeded-random direction respectively

#### Scenario: #no-steering-assistance
- **WHEN** the repeated or random direction leads into a wall or a body
- **THEN** the snake moves there anyway and dies by the collision rules

#### Scenario: #body-advance
- **WHEN** move projection runs
- **THEN** each moved body is `[newHead] ⧺ body[0 .. len−2]` unconditionally — growth never skips the tail drop; it is represented by tail duplication at commit

### Requirement: game-engine/chess-timer
Each team SHALL have a persistent millisecond time budget: `initialBudget` at game start, incremented by `budgetIncrement` each turn. At each turn start, `min(cap, budget)` moves from the budget onto the team's per-turn clock — the cap is `firstTurnTime` on turn 0 and `maxTurnTime` afterwards — so total remaining time is always `budget + perTurnClock`. Declaring turn over returns the unused clock to the budget; a clock reaching zero auto-declares; turn resolution commences when every team has declared.

#### Scenario: #carve-out-arithmetic
- **WHEN** a turn starts with budget B and cap C
- **THEN** the clock holds `min(C, B)`, the budget holds `B − min(C, B)`, and their sum is unchanged

#### Scenario: #declaration-banks-the-remainder
- **WHEN** a team declares turn over with time left on its clock
- **THEN** that remainder returns to its budget and the clock stops

#### Scenario: #expiry-declares-automatically
- **WHEN** a team's clock reaches zero
- **THEN** its turn is declared over without action, and resolution starts once all teams have declared

### Requirement: game-engine/game-end-conditions
The game SHALL end at the end of the turn whose commit leaves at most one competing team with a living snake — last-team-standing (one team survives) or simultaneous elimination (none does) — or at the end of the turn in which the configured `maxTurns` is reached; `maxTurns` of 0 or absent means no turn limit. Win conditions are evaluated against each turn's committed state.

#### Scenario: #last-team-standing
- **WHEN** only one competing team still has a living snake after commit
- **THEN** the game ends at the end of that turn

#### Scenario: #simultaneous-elimination-including-turn-0
- **WHEN** every remaining alive snake dies in the same turn — even the first
- **THEN** the game ends at the end of that turn

#### Scenario: #turn-limit-and-no-limit
- **WHEN** `maxTurns` is reached, or is 0/absent
- **THEN** the game ends at the end of that turn, or continues indefinitely until an elimination ending, respectively

### Requirement: game-engine/scoring
A team's score at game end SHALL be its normalised body-share times the number of competing teams: `score(team) = (alive_segments_owned / total_alive_segments) × competing_teams`, with par exactly `1.0` for a proportional share. Forfeited teams are excluded from all terms and score `0` (if every team forfeited, all score `0`). Ending-specific scores: the last-standing survivor scores `1.0 × competing_teams` and eliminated teams `0`; at simultaneous elimination, teams alive at the final turn's start score `1.0` and earlier-eliminated teams `0`. Highest score wins; ties produce a draw.

#### Scenario: #proportional-par
- **WHEN** three competing teams hold equal living segment counts at the turn limit
- **THEN** each scores exactly 1.0 and the game is a draw

#### Scenario: #forfeit-exclusion
- **WHEN** one of three teams forfeits
- **THEN** it scores 0 and the survivors' scores are computed over 2 competing teams

#### Scenario: #ending-specific-scores
- **WHEN** the game ends by survival, simultaneous elimination, or turn limit
- **THEN** scores follow the ending's rule above, and any tie at the top is a draw

### Requirement: game-engine/turn-events
Each turn SHALL emit a closed set of events sufficient to reconstruct and narrate the turn: movements (with who staged them), deaths (cause — including contributing damage sources for starvation — killer where applicable, and location), severs, food consumption and potion collection (each carrying the consumed item's identity; potion collection also the collector and affected teammates), spawns, effect applications, and effect cancellations.

#### Scenario: #every-significant-outcome-is-an-event
- **WHEN** any turn resolves
- **THEN** each movement, death, sever, consumption, collection, spawn, and effect change appears as exactly one typed event from the closed set

#### Scenario: #deterministic-order
- **WHEN** the same turn resolves twice from an identical snapshot, staged moves, and turn seed
- **THEN** the emitted event sequence is identical

### Requirement: game-engine/configuration-parameters
Game configuration SHALL comprise exactly these parameters, with these ranges, defaults, and disable sentinels:

| Parameter | Range | Default | Sentinel |
|---|---|---|---|
| `boardSize` | 7–32 | — | |
| `snakesPerTeam` | 1–10 | 5 | |
| `maxHealth` | 1–500 | 100 | |
| `maxTurns` | 0 or 1–1000 | 100 | 0 = no turn limit |
| `hazardPercentage` | 0–30 | 0 | 0 = no hazards |
| `hazardDamage` | 1–100 | 15 | |
| `fertileGround.density` | 0–90 | 30 | 0 = fertile ground disabled |
| `fertileGround.clustering` | 1–20 | 10 | |
| `foodSpawnRate` | 0–5 | 0.5 | 0 = no food spawns |
| `invulnPotionSpawnRate` | 0–0.2 | 0.15 | 0 = no invulnerability potions |
| `invisPotionSpawnRate` | 0–0.2 | 0.1 | 0 = no invisibility potions |
| `clock.initialBudgetMs` | 0–600000 | 60000 | 0 = no initial budget |
| `clock.budgetIncrementMs` | 100–5000 | 500 | |
| `clock.firstTurnTimeMs` | 1000–300000 | 60000 | |
| `clock.maxTurnTimeMs` | 100–300000 | 10000 | |

Numeric bounds SHALL be enforced by the user-facing configuration surfaces; the game engine itself accepts any type-valid configuration (for `boardSize`, any positive integer).

#### Scenario: #disable-sentinels
- **WHEN** `maxTurns`, `fertileGround.density`, `foodSpawnRate`, or a potion spawn rate is 0
- **THEN** the corresponding feature is fully disabled (no limit, no fertile cells, no spawns of that kind)

#### Scenario: #bounds-live-at-the-surfaces
- **WHEN** a value outside a documented range (e.g. `boardSize` outside 7–32) reaches the engine
- **THEN** the engine does not reject it on range grounds — rejection is the configuration surfaces' job

#### Scenario: #cross-runtime-expressibility
- **WHEN** the configuration schema evolves
- **THEN** every field remains expressible identically in all three runtimes' type systems: plain numbers (no bigint), no optional or null fields (zero sentinels encode disabled features), string-literal enums, milliseconds for time values

### Requirement: game-engine/runtime-portability
The engine SHALL depend only on portable ECMAScript facilities and SHALL take all nondeterminism and external input as explicit parameters — using no ambient clock, randomness, I/O, or runtime-specific API — so that a single build runs unchanged in any conformant JavaScript runtime.

#### Scenario: #no-ambient-nondeterminism
- **WHEN** the engine needs randomness or the current time
- **THEN** it reads them from explicit inputs (the `Rng` state, the game seed, the configuration), never from host facilities such as `Date.now` or `crypto`

#### Scenario: #no-runtime-specific-api
- **WHEN** the same engine build is loaded into a different conformant JavaScript runtime
- **THEN** it runs unchanged, relying on no Node-, browser-, or host-specific API
