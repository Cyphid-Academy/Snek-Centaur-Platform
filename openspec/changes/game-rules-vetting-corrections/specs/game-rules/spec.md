## MODIFIED Requirements

### Requirement: game-rules/hazards
When the configured hazard percentage H is greater than 0, board generation SHALL designate `floor(inner_cell_count × H / 100)` inner cells as Hazard terrain, seeded from the game seed. Hazard cells are permanent for the whole game.

#### Scenario: #connectivity-guarantee
- **WHEN** hazards are placed
- **THEN** all non-Hazard, non-Wall inner cells form a single connected region

#### Scenario: #permanence
- **WHEN** the game progresses
- **THEN** the set of Hazard cells never changes

### Requirement: game-rules/initial-food
After all starting positions are assigned, setup SHALL spawn `snakesPerTeam` food items per starting territory — one per snake of the owning team — each on a seeded-random distinct eligible cell within that territory: inner, non-Wall, non-Hazard, and not occupied by any snake body. Initial food eligibility ignores fertile designations.

#### Scenario: #food-count-per-territory
- **WHEN** a game with N teams and S snakes per team is set up
- **THEN** exactly N × S food items are placed, S inside each starting territory, on distinct eligible cells — Fertile or not

### Requirement: game-rules/board-generation-retry
Board generation SHALL be an all-or-nothing attempt, retried on failure with deterministic sub-seeds derived from the game seed and the attempt index, up to three retries (four attempts total); if all attempts fail, generation SHALL be reported infeasible with a machine-readable error.

#### Scenario: #failure-conditions
- **WHEN** an attempt runs
- **THEN** it fails if hazard connectivity cannot be satisfied, or any team's territory lacks `snakesPerTeam` eligible starting cells of the chosen parity, or any starting territory holds fewer than `snakesPerTeam` distinct eligible initial-food cells after head placement

#### Scenario: #reproducible-retries
- **WHEN** the same game seed is used twice
- **THEN** the sequence of attempts and the final outcome are identical

#### Scenario: #infeasible-configuration
- **WHEN** all four attempts fail
- **THEN** the game is left unplayable, the error identifies the constraint that failed on the last attempt, and the room owner can reconfigure and re-provision

### Requirement: game-rules/health-and-starvation
Every snake alive in the snapshot SHALL take 1 damage per turn (`tick`), and a surviving moved head on a Hazard cell SHALL additionally take the configured `hazardDamage` and suffer a disruption. At commit, a snake with any heal claim resolves to `MaxHealth`; otherwise health resolves to snapshot health minus total damage, and at ≤ 0 the snake dies (`health_depletion`, reporting contributing sources). Certain-death outcomes (wall, self, body, head-to-head) are independent of health and win the reported cause when both apply.

#### Scenario: #heal-dominates-same-turn-damage
- **WHEN** a snake eats food in a turn whose damage would otherwise reduce its health
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
- **WHEN** a snake consumed food in turn T and turn T+1 resolves
- **THEN** the grown length participates in head-to-head length comparisons and the duplicated tail cell is occupied (and lethal to tail-chasers)

### Requirement: game-rules/item-spawning
After each commit, food SHALL spawn at expected rate `foodSpawnRate` and each potion type SHALL spawn independently at its configured rate: `floor(rate)` items guaranteed plus one more with probability `rate mod 1`, a rate of 0 spawning nothing. Locations are seeded-random eligible cells of the committed state: inner, non-Wall, non-Hazard, unoccupied by alive snake, food, or potion. Food placement is additionally restricted to Fertile cells when fertile ground is enabled; potion placement never is.

#### Scenario: #floor-plus-fraction-mechanic
- **WHEN** `foodSpawnRate` is 1.25
- **THEN** each turn spawns one guaranteed food and a second with probability 0.25, decided by the turn seed

#### Scenario: #eligibility
- **WHEN** spawn locations are drawn
- **THEN** occupied, border, and hazard cells are never chosen; with fertile ground enabled, food spawns only on Fertile cells while potions spawn on any eligible cell
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
- **WHEN** a collector is killed in its collection turn
- **THEN** the team's buffs apply with a dead debuff-holder that can never be disrupted, so the buffs run their full course

#### Scenario: #dual-family-collector
- **WHEN** one snake holds both families' debuffs and is disrupted
- **THEN** both families cancel, independently

#### Scenario: #three-turn-expiry
- **WHEN** a rebuild grants effects at turn T's commit
- **THEN** the effects influence turns T+1 through T+3 and are absent from turn T+4's snapshot

### Requirement: game-rules/game-end-conditions
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

### Requirement: game-rules/item-identity
Every item SHALL be identified by the pair (spawn turn, spawn index): the turn boundary at which the item first exists — game-setup items at boundary 0, items spawned by turn T's resolution at boundary T+1 — and the item's index within that boundary's spawn order, counting from 0. The pair is game-unique, is carried by the item itself, and is what downstream consumers use directly; any scalar item id is computed from the pair, never stored or independently assigned. Game state holds only items presently on the board — at most one item per cell, structurally — and consumption SHALL resolve as a claim at commit: the item is removed from the board and the consumption event reports its identity, from which the data layer completes the item's single spawn-to-destruction lifetime record.

#### Scenario: #ids-never-collide
- **WHEN** items spawn across a whole game — at setup and on every turn
- **THEN** every (spawn turn, spawn index) pair is unique across the whole game

#### Scenario: #consumption-removes-and-reports
- **WHEN** a snake consumes an item
- **THEN** the item is absent from game state after commit, and the `food_eaten`/`potion_collected` event carries the consumed item's identity

#### Scenario: #one-item-per-cell
- **WHEN** the board holds items
- **THEN** no cell holds more than one — a second occupant is structurally unrepresentable
