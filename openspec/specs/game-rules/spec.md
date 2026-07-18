# game-rules Specification

## Purpose

Domain model and game behaviour for Team Snek: the type vocabulary, board
construction, movement, collisions and severing, health, food and growth,
the team potion mechanic, invisibility, the staged turn-resolution model,
item spawning and identity, the chess timer, game end and scoring, and
determinism. This capability defines game behaviour with no reference to
storage, networking, or UI.

Depends on: (none — root of the capability graph). Consumed by:
platform-architecture, stdb-engine, bot-framework (and transitively all
other capabilities).

## Requirements

### Requirement: game-rules/domain-vocabulary
The game SHALL use a closed domain vocabulary: four directions (`Up`/`Right`/`Down`/`Left`), four cell types (`Normal`/`Wall`/`Hazard`/`Fertile`), three item types (`Food`/`InvulnPotion`/`InvisPotion`), potion effects as `(family, state, expiryTurn)` triples over two families (`invulnerability`/`invisibility`) and two states (`buff`/`debuff`), present items as (identity, type, cell) per game-rules/item-identity, and the snake state shape: `snakeId`, `letter`, `centaurTeamId`, `body` (ordered cells, head first), `health`, `activeEffects`, `lastDirection`, `alive`.

#### Scenario: #closed-sets
- **WHEN** any rule, event, or state refers to a direction, cell type, item type, or potion effect
- **THEN** it uses one of the enumerated values; no other variants exist anywhere in the game

#### Scenario: #derived-values-are-not-stored
- **WHEN** a snake's invulnerability level or visibility is needed
- **THEN** it is computed on demand from `activeEffects` (see game-rules/collisions-and-severing, game-rules/invisibility); neither is a stored field of the snake state

### Requirement: game-rules/board-geometry
The board SHALL be a square grid of `boardSize × boardSize` cells whose outermost 1-cell-thick border is entirely `Wall`. The playable area is the `(boardSize − 2)²` inner cells.

#### Scenario: #construction
- **WHEN** a board is generated with edge length N
- **THEN** it is an N×N grid with a complete Wall ring and an (N−2)² playable interior

### Requirement: game-rules/hazards
When the configured hazard percentage H is greater than 0, board generation SHALL designate `floor(inner_cell_count × H / 100)` inner cells as Hazard terrain, seeded from the game seed. Hazard cells are permanent for the whole game.

#### Scenario: #connectivity-guarantee
- **WHEN** hazards are placed
- **THEN** all non-Hazard, non-Wall inner cells form a single connected region

#### Scenario: #permanence-and-coexistence
- **WHEN** the game progresses
- **THEN** the set of Hazard cells never changes, and items may occupy a Hazard cell simultaneously with the hazard terrain

### Requirement: game-rules/fertile-ground
When fertile ground is enabled, board generation SHALL designate a fixed subset of inner non-Wall non-Hazard cells as `Fertile` at game start, forming organic clustered patches: the density parameter D sets coverage (the top D% of candidate cells ranked by seeded fractal noise) and the clustering parameter C sets patch scale.

#### Scenario: #stable-designation
- **WHEN** the game progresses
- **THEN** fertile designations never change

#### Scenario: #knob-semantics
- **WHEN** C is low
- **THEN** fertile cells form small scattered patches; high C forms large contiguous blobs, with D controlling total coverage in both cases

### Requirement: game-rules/starting-placement
For an N-team game, board generation SHALL divide the board into N starting territories using a circular pie of N equal angular sectors centred on the board with a seeded-random angular offset. Each snake's starting head SHALL be placed on a seeded-random non-Wall, non-Hazard inner cell inside its team's territory, and all starting heads across all teams SHALL share one seeded-random parity of `(x + y) mod 2`.

#### Scenario: #territory-assignment
- **WHEN** inner cells are assigned to territories
- **THEN** each cell belongs to the sector it overlaps most, ties broken by seeded randomness

#### Scenario: #shared-parity
- **WHEN** all starting heads are placed
- **THEN** every head cell has the same `(x + y) mod 2` parity

### Requirement: game-rules/initial-snakes
Each team SHALL field exactly `snakesPerTeam` snakes. Every snake starts with length 3 (all three segments stacked on its starting cell), `health = MaxHealth`, no active effects, no prior direction, and alive. Snakes are lettered consecutively from `A` within their team; a snake's display name is `{centaurTeamName}.{letter}`.

#### Scenario: #initial-state
- **WHEN** a game starts
- **THEN** every snake is a 3-segment stack on its start cell at full health with empty `activeEffects` (so derived invulnerability level 0 and visible true) and null `lastDirection`

#### Scenario: #naming
- **WHEN** team Red fields three snakes
- **THEN** they are `Red.A`, `Red.B`, `Red.C`

### Requirement: game-rules/initial-food
After all starting positions are assigned, setup SHALL spawn one food item per snake on seeded-random eligible cells: inner, non-Wall, non-Hazard, not occupied by any snake body, and restricted to Fertile cells when fertile ground is enabled.

#### Scenario: #one-food-per-snake
- **WHEN** a game with S total snakes is set up
- **THEN** exactly S food items are placed on distinct eligible cells

### Requirement: game-rules/board-generation-retry
Board generation SHALL be an all-or-nothing attempt, retried on failure with deterministic sub-seeds derived from the game seed and the attempt index, up to three retries (four attempts total); if all attempts fail, generation SHALL be reported infeasible with a machine-readable error.

#### Scenario: #failure-conditions
- **WHEN** an attempt runs
- **THEN** it fails if hazard connectivity cannot be satisfied, or any team's territory lacks `snakesPerTeam` eligible starting cells of the chosen parity, or fewer eligible food cells remain than snakes

#### Scenario: #reproducible-retries
- **WHEN** the same game seed is used twice
- **THEN** the sequence of attempts and the final outcome are identical

#### Scenario: #infeasible-configuration
- **WHEN** all four attempts fail
- **THEN** the game is left unplayable, the error identifies the constraint that failed on the last attempt, and the room owner can reconfigure and re-provision

### Requirement: game-rules/determinism
All randomness SHALL be deterministic from seeds — game setup from the per-game seed, each turn's resolution from a per-turn seed derived from it — and no seed SHALL be accessible to any game client.

#### Scenario: #reproducibility
- **WHEN** a game is replayed from the same seed and the same staged moves
- **THEN** every board, spawn, and outcome is identical

#### Scenario: #secrecy
- **WHEN** any client (operator, bot, or spectator) reads game state
- **THEN** neither the game seed nor any turn seed is observable

### Requirement: game-rules/turn-resolution-model
Each turn SHALL resolve in fixed stages: move projection, head-to-head precedence, interaction rules, derived rules, commit, item spawning, win-condition check, event derivation. Every rule reads only the start-of-turn snapshot (plus the surviving moved-head set from head-to-head precedence, and — for derived rules — interaction-rule claims); the commit is the sole writer of game state.

#### Scenario: #snapshot-purity
- **WHEN** any rule evaluates during a turn
- **THEN** nothing committed during that same turn is observable to it — effects gained, cancelled, or expired at this commit first influence the next turn

#### Scenario: #order-independence
- **WHEN** the rules within the interaction stage or the derived stage are evaluated in any order or concurrently
- **THEN** every outcome is identical

### Requirement: game-rules/movement
All alive snakes SHALL move simultaneously each turn. Direction: the staged move if any; else `lastDirection` unconditionally, even into a lethal cell; else (turn 0 with nothing staged) a seeded-random direction, also unconstrained by lethality. The moved body advances the head one cell and drops the final tail segment; `lastDirection` updates to the direction moved.

#### Scenario: #direction-precedence
- **WHEN** a snake has a staged move, or none but a prior direction, or neither
- **THEN** it moves the staged direction, or repeats `lastDirection`, or moves a seeded-random direction respectively

#### Scenario: #no-steering-assistance
- **WHEN** the repeated or random direction leads into a wall or a body
- **THEN** the snake moves there anyway and dies by the collision rules

#### Scenario: #body-advance
- **WHEN** move projection runs
- **THEN** each moved body is `[newHead] ⧺ body[0 .. len−2]` unconditionally — growth never skips the tail drop; it is represented by tail duplication at commit (game-rules/food-and-growth)

### Requirement: game-rules/collisions-and-severing
Collision outcomes SHALL be decided from snapshot values, where a snake's invulnerability level is derived from `activeEffects`: `+1` with an invulnerability buff, `−1` with the debuff, else `0`. A surviving moved head on a Wall cell or on a non-head segment of its own moved body dies (`wall`, `self_collision`). A surviving moved head entering a non-head segment of another snake's moved body severs the victim from the contact segment through the tail if the attacker's level exceeds the victim's; otherwise the attacker dies (`body_collision`) and the victim suffers a disruption.

#### Scenario: #tail-chase-is-safe-unless-the-tail-is-duplicated
- **WHEN** a snake's moved head enters the cell its target's final tail segment just vacated
- **THEN** no collision occurs — unless that tail segment is duplicated by same-turn growth, in which case the cell is still occupied and lethal

#### Scenario: #level-comparison-decides-sever-versus-death
- **WHEN** attacker and victim have equal snapshot levels
- **THEN** the attacker dies; only a strictly higher attacker level severs

#### Scenario: #multiple-attackers-one-truncation
- **WHEN** several attackers sever the same victim in one turn
- **THEN** the commit truncates the victim once, at the head-closest contact segment

#### Scenario: #dead-bodies-remain-lethal-all-turn
- **WHEN** a snake incurs certain death from any rule
- **THEN** its body segments remain valid collision targets for every other rule for the whole turn, and severing is observable only after commit

### Requirement: game-rules/head-to-head-precedence
When two or more moved heads occupy the same cell, head-to-head resolution SHALL run before every other interaction rule: occupants below the maximum snapshot invulnerability level die; among those at the maximum, occupants below the maximum snapshot body length die; if two or more still remain, all die (`head_to_head`). Losers' heads are withdrawn from the turn; their bodies remain on the board.

#### Scenario: #level-then-length-then-mutual-destruction
- **WHEN** heads meet with distinct levels, or equal levels and distinct lengths, or full ties
- **THEN** the lower level dies, or the shorter dies, or all occupants die respectively

#### Scenario: #withdrawal
- **WHEN** a snake loses a head-to-head
- **THEN** it collects no items, enters no hazard, and triggers no body collisions this turn, while its body segments stay on the logical board

#### Scenario: #unique-entrancy
- **WHEN** head-to-head resolution completes
- **THEN** at most one surviving head occupies any cell, so every item is collected by at most one snake per turn

### Requirement: game-rules/health-and-starvation
Every snake alive in the snapshot SHALL take 1 damage per turn (`tick`), and a surviving moved head on a Hazard cell SHALL additionally take the configured `hazardDamage` and suffer a disruption. At commit, a snake with any heal claim resolves to `MaxHealth`; otherwise health resolves to snapshot health minus total damage, and at ≤ 0 the snake dies (`health_depletion`, reporting contributing sources). Certain-death outcomes (wall, self, body, head-to-head) are independent of health and win the reported cause when both apply.

#### Scenario: #heal-dominates-same-turn-damage
- **WHEN** a snake eats food and takes hazard and tick damage in the same turn
- **THEN** its health commits at `MaxHealth`

#### Scenario: #starvation-with-sources
- **WHEN** accumulated tick and hazard damage drive resolved health to zero or below
- **THEN** the snake dies of `health_depletion` and the event reports which damage sources contributed

#### Scenario: #certain-death-outranks-health-death
- **WHEN** a snake both incurs a certain-death claim and resolves to non-positive health
- **THEN** it dies with the certain-death cause reported

### Requirement: game-rules/food-and-growth
A surviving moved head on a cell holding food SHALL consume it (the item leaves the board — game-rules/item-identity): the snake heals to `MaxHealth` and grows by one segment via duplication of its final tail segment at commit, applied after any severing. Growth changes cell occupancy only when the duplicated tail advances on a later turn; the grown length is present in the next turn's snapshot. Eating is never a disruption.

#### Scenario: #duplication-after-severing
- **WHEN** a snake that ate this turn is also severed this turn
- **THEN** the tail duplication applies to the post-sever body

#### Scenario: #growth-counts-from-the-next-snapshot
- **WHEN** the following turn resolves
- **THEN** the grown length participates in head-to-head length comparisons and its duplicated tail cell is occupied (and lethal to tail-chasers)

#### Scenario: #food-on-a-hazard-cell
- **WHEN** the food cell is also Hazard
- **THEN** the heal dominates the damage at resolution, but the hazard-entry disruption still occurs

### Requirement: game-rules/item-spawning
After each commit, food SHALL spawn at expected rate `foodSpawnRate` and each potion type SHALL spawn independently at its configured rate: `floor(rate)` items guaranteed plus one more with probability `rate mod 1`, a rate of 0 spawning nothing. Locations are seeded-random eligible cells of the committed state: inner, non-Wall, non-Hazard, unoccupied by alive snake, food, or potion — Fertile-only when fertile ground is enabled.

#### Scenario: #floor-plus-fraction-mechanic
- **WHEN** `foodSpawnRate` is 1.25
- **THEN** each turn spawns one guaranteed food and a second with probability 0.25, decided by the turn seed

#### Scenario: #eligibility
- **WHEN** spawn locations are drawn
- **THEN** occupied, border, and hazard cells are never chosen, and with fertile ground enabled only Fertile cells are
- **AND** whether fertile ground is enabled is derived from the board's cells, not from configuration

### Requirement: game-rules/team-potion-effects
Potions are team plays with a painted target. When members of one team collect potions of one family in a turn, the team SHALL receive a single rebuild: every collector gets that family's `debuff` and every other member alive at commit gets its `buff`, all expiring 3 turns later (`expiryTurn = currentTurn + 3`), replacing any prior effect of that family — a snake holds at most one active effect per family. If a snake holding a family's `debuff` in the snapshot suffers any disruption — death from any cause, severing another snake, being severed, receiving a body collision, or entering a hazard; item collection is never a disruption — the team SHALL lose all its active effects of that family at commit.

#### Scenario: #rebuild-shape
- **WHEN** two snakes of one team collect invulnerability potions in the same turn
- **THEN** one rebuild claim grants both collectors `(invulnerability, debuff)` and every other living member `(invulnerability, buff)`, all with the same expiry, replacing any prior invulnerability-family effects

#### Scenario: #collector-marked-even-in-death
- **WHEN** a collector is dead at commit
- **THEN** it still receives its `debuff` entry, while `buff` entries go only to members alive at commit

#### Scenario: #disrupting-the-collector-strips-the-family
- **WHEN** the snapshot debuff-holder for family F is disrupted
- **THEN** every alive member of its team loses every active F effect at commit, and the other family is untouched

#### Scenario: #same-turn-re-collection-outlives-cancellation
- **WHEN** a team's collector is disrupted in the same turn that any teammate collects the same family again
- **THEN** the new rebuild applies at commit, superseding the cancellation

#### Scenario: #fresh-debuffs-are-not-triggers
- **WHEN** a snake gains a `debuff` at this turn's commit
- **THEN** disrupting it this turn cancels nothing — it becomes the disruptable collector only from the next snapshot

#### Scenario: #sacrificial-collection
- **WHEN** a collector is killed in its collection turn by a cause other than head-to-head
- **THEN** the team's buffs apply with a dead debuff-holder that can never be disrupted, so the buffs run their full course

#### Scenario: #dual-family-collector
- **WHEN** one snake holds both families' debuffs and is disrupted
- **THEN** both families cancel, independently

#### Scenario: #three-turn-expiry
- **WHEN** a rebuild grants effects at turn T's commit
- **THEN** the effects influence turns T+1 through T+3 and are absent from turn T+4's snapshot

### Requirement: game-rules/invisibility
An invisibility `buff` SHALL hide a snake from connections belonging to opponent teams only — every game mechanic (collision, severing, health, scoring) applies identically — and the invisibility `debuff` holder SHALL remain visible, so opponents can target the collector for disruption.

#### Scenario: #information-asymmetry-only
- **WHEN** a snake is invisible
- **THEN** opponent connections cannot observe it, teammates can, and it still collides, severs, takes damage, and scores exactly as if visible

#### Scenario: #the-collector-stays-visible
- **WHEN** a snake holds `(invisibility, debuff)`
- **THEN** its derived visibility is true

### Requirement: game-rules/chess-timer
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

### Requirement: game-rules/game-end-conditions
The game SHALL end at last-team-standing (all snakes of every competing team but one are dead), at simultaneous elimination (all remaining alive snakes die in one turn), or when the configured `maxTurns` is reached; `maxTurns` of 0 or absent means no turn limit. Win conditions are evaluated against each turn's committed state.

#### Scenario: #last-team-standing
- **WHEN** only one competing team still has a living snake after commit
- **THEN** the game ends

#### Scenario: #simultaneous-elimination-including-turn-0
- **WHEN** every remaining alive snake dies in the same turn — even the first
- **THEN** the game ends that turn

#### Scenario: #turn-limit-and-no-limit
- **WHEN** `maxTurns` is reached, or is 0/absent
- **THEN** the game ends at that turn, or continues indefinitely until an elimination ending, respectively

### Requirement: game-rules/scoring
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

### Requirement: game-rules/turn-events
Each turn SHALL emit a closed set of events sufficient to reconstruct and narrate the turn: movements (with who staged them), deaths (cause — including contributing damage sources for starvation — killer where applicable, and location), severs, food consumption and potion collection (each carrying the consumed item's identity; potion collection also the collector and affected teammates), spawns, effect applications, and effect cancellations.

#### Scenario: #every-significant-outcome-is-an-event
- **WHEN** any turn resolves
- **THEN** each movement, death, sever, consumption, collection, spawn, and effect change appears as exactly one typed event from the closed set

#### Scenario: #deterministic-order
- **WHEN** the same turn resolves twice from an identical snapshot, staged moves, and turn seed
- **THEN** the emitted event sequence is identical

### Requirement: game-rules/configuration-parameters
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

### Requirement: game-rules/item-identity
Every item SHALL carry a game-unique `ItemId`, assigned by the engine and opaque to downstream consumers. Game state holds only items presently on the board — at most one item per cell, structurally — and consumption SHALL resolve as a claim at commit: the item is removed from the board and the consumption event reports its id, from which the data layer completes the item's single spawn-to-destruction lifetime record.

#### Scenario: #ids-never-collide
- **WHEN** items spawn across a whole game — at setup and on every turn
- **THEN** every id is unique without the engine observing consumed items, and the engine fails loudly rather than allocate a colliding id if a spawn count exceeds its turn's namespace

#### Scenario: #consumption-removes-and-reports
- **WHEN** a snake consumes an item
- **THEN** the item is absent from game state after commit, and the `food_eaten`/`potion_collected` event carries the consumed `itemId`

#### Scenario: #one-item-per-cell
- **WHEN** the board holds items
- **THEN** no cell holds more than one — a second occupant is structurally unrepresentable
