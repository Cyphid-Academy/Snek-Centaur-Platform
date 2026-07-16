# Module 01: Game Rules

## Requirements

### 1.1 Domain Type Vocabulary

**01-REQ-001**: The system shall define a `Direction` type with exactly four values: `Up`, `Right`, `Down`, `Left`.

**01-REQ-002**: The system shall define a `CellType` with values: `Normal`, `Wall`, `Hazard`, `Fertile`.

**01-REQ-003**: The board shall be a square of edge length `boardSize` cells, where `boardSize` is a positive integer. See resolved **01-REVIEW-018**.

**01-REQ-004**: The system shall define a `SnakeState` type with the following fields:
- `snakeId`: unique identifier
- `letter`: single alphabetic character assigned at game start
- `centaurTeamId`: owning CentaurTeam
- `body`: ordered list of cell positions, head first, tail last; length = number of segments. Consecutive entries may share a cell: growth from food is represented as a duplicated tail segment (01-REQ-062), and the game-start body stacks all segments on one cell (01-REQ-020).
- `health`: integer
- `activeEffects`: collection of active potion effects, each with shape `{ family, state, expiryTurn }` where `family ∈ {invulnerability, invisibility}` and `state ∈ {buff, debuff}`. A snake holds at most one active effect per family (see 01-REQ-028).
- `lastDirection`: nullable Direction
- `alive`: boolean

`invulnerabilityLevel` and `visible` are *not* fields of `SnakeState`. They are derived from `activeEffects` per 01-REQ-022 and 01-REQ-023 respectively and computed on demand; the design section specifies the functions. `SnakeState` carries no intra-turn bookkeeping fields: team rebuilds are intra-turn claims resolved at commit (01-REQ-047, 01-REQ-050) and growth state lives in `body` itself. (See resolved 01-REVIEW-022.)

**01-REQ-005**: The system shall define an `ItemType` with values: `Food`, `InvulnPotion`, `InvisPotion`.

**01-REQ-006**: The system shall define a potion `EffectFamily` with values `invulnerability` and `invisibility`, and an `EffectState` with values `buff` and `debuff`. A potion effect is a `(family, state, expiryTurn)` triple. The four combinations are the exhaustive set of potion effects a snake can hold.

**01-REQ-007**: The system shall define an `ItemState` describing a present item's identity (`itemId`), type, and cell position. The `items` component of game state contains only items currently present on the board and is keyed by cell — at most one item per cell, an invariant maintained by unique consumption (01-REQ-044d) and unoccupied-cell spawning (01-REQ-048/049). Consumption removes the item from the collection at commit; there is no consumed flag. An item's complete lifetime (spawn turn, destruction turn) is a single data-layer record owned by the historical store ([04-REQ-007]); the game-state collection is the present-items projection of that record. *(Amended per 01-REVIEW-023 resolution.)*

---

### 1.2 Board Construction

**01-REQ-008**: The board shall be a rectangular grid of the configured size. All cells on the outermost 1-cell-thick border shall be `Wall` type. All remaining cells are inner cells.

**01-REQ-009**: The playable area is the inner cells of the `boardSize × boardSize` grid: the `(boardSize − 2) × (boardSize − 2)` cells not on the 1-cell-thick border.

**01-REQ-010**: If the configured hazard percentage H > 0, `floor(inner_cell_count × H / 100)` inner cells shall be designated `Hazard`, chosen using randomness seeded from the game seed. Hazard placement shall guarantee that all non-Hazard, non-Wall inner cells form a single connected region.

**01-REQ-011**: Hazard cells are permanent terrain for the duration of the game. Items may occupy a Hazard cell simultaneously with hazard terrain.

**01-REQ-012**: If fertile ground is enabled, a subset of inner non-Wall non-Hazard cells shall be designated `Fertile` at game start. Fertile designations shall not change during the game.

**01-REQ-013**: Fertile tile selection shall use 4-octave fractal Perlin noise seeded from the game seed. Each successive octave doubles the base frequency of the previous and halves its amplitude. The clustering parameter C (integer 1–20) controls the base frequency of the first octave: low C → high base frequency → small scattered patches; high C → low base frequency → large contiguous blobs. The density parameter D (integer percent 1–90) controls coverage: the top D% of candidate inner non-Wall non-Hazard cells ranked by their noise score are designated Fertile.

**01-REQ-014**: For an N-team game, the board shall be divided into N starting territories by overlaying a circular pie centred on the board with N equal angular sectors. The angular offset of the pie shall be chosen randomly using the game seed. Each inner cell shall be assigned to the sector it overlaps most with; ties broken randomly using the game seed.

**01-REQ-015**: Each snake's starting head position shall be placed on a randomly chosen non-Wall, non-Hazard inner cell within its team's starting territory, using randomness seeded from the game seed.

**01-REQ-016**: All snake head starting positions across all teams shall be placed on cells of the same parity, where parity is `(x + y) mod 2`. The parity value (0 or 1) shall be chosen randomly using the game seed.

**01-REQ-017**: After all snake starting positions are assigned, one food item per snake shall be spawned on an eligible cell chosen randomly using the game seed. An eligible cell is inner, non-Wall, non-Hazard, and not occupied by a snake body. If fertile ground is enabled, eligible cells are additionally restricted to Fertile cells.

**01-REQ-061 (Board generation feasibility and bounded retry)**: Board generation (the full sequence of hazard placement, fertile tile selection, territory assignment, parity choice, starting-position assignment, and initial food placement, per 01-REQ-010 through 01-REQ-017) shall be treated as a single attempt that either succeeds or fails. An attempt **fails** if any of the following conditions holds:
- Hazard placement cannot satisfy the single-connected-region constraint of 01-REQ-010.
- For the chosen parity (01-REQ-016), at least one team's territory does not contain `snakesPerTeam` distinct non-Wall, non-Hazard inner cells of that parity for starting-head placement per 01-REQ-015.
- After starting-position assignment, the set of cells eligible for initial food placement under 01-REQ-017 (inner, non-Wall, non-Hazard, not occupied by a snake body; additionally Fertile if fertile ground is enabled) contains fewer than `totalSnakeCount` distinct cells, so that 01-REQ-017's one-food-per-snake mandate cannot be satisfied.

If an attempt fails, the setup process shall retry using a deterministic sub-seed derived from the game seed and an attempt counter, re-running the full generation sequence. Up to **three retries** shall be performed (four attempts total). If all four attempts fail, board generation shall be reported as **infeasible** for the current game configuration: the game shall be left in an unplayable state accompanied by a machine-readable error identifying which constraint failed on the final attempt, and the room owner shall be able to modify the game configuration and re-attempt provisioning.

The mechanism for deriving per-attempt sub-seeds from the game seed is a design-phase concern; the requirement here is only that each attempt uses a distinct deterministic seed derivable from the game seed plus the attempt index, so that the sequence of attempts (and the ultimate success or failure) is reproducible from the game seed alone.

---

### 1.3 Snake Initialization

**01-REQ-018**: Each snake shall be assigned a unique letter designation within its team, assigned consecutively starting from `A`. A snake's display name is `{centaurTeamName}.{letter}` (e.g., `Red.A`).

**01-REQ-019**: The number of snakes each team fields per game shall be equal across all teams and is determined by the configured `snakesPerTeam` parameter (1–10).

**01-REQ-020**: At game start, every snake shall have length 3 with all three body segments positioned on the snake's starting cell.

**01-REQ-021**: At game start, every snake shall have `health = MaxHealth`, `activeEffects = []`, `lastDirection = null`, `alive = true`. Because `activeEffects` is empty, the derived `invulnerabilityLevel` is `0` and the derived `visible` is `true` for every snake at game start.

---

### 1.4 Items and Derived Effect Fields

**01-REQ-022**: A snake's `invulnerabilityLevel` is a derived value in `{-1, 0, +1}` computed from its `activeEffects`:
- `+1` if the snake holds an active effect with `family = invulnerability` and `state = buff`
- `-1` if the snake holds an active effect with `family = invulnerability` and `state = debuff`
- `0` otherwise (no active invulnerability effect)

Because a snake holds at most one active effect per family (01-REQ-028), these cases are exhaustive and mutually exclusive. `invulnerabilityLevel` is used exclusively for collision outcome resolution in 01-REQ-044c and 01-REQ-044d; it is not a stored field.

**01-REQ-023**: A snake's `visible` value is derived: `visible = false` if and only if the snake holds an active effect with `family = invisibility` and `state = buff`; otherwise `visible = true`. A snake holding an active `(invisibility, debuff)` effect — the invisibility collector — **remains visible**, so that opponents can target them for disruption. `visible` is not a stored field.

**01-REQ-024**: Invisible snakes (visible = false) shall not be observable by connections belonging to opponent teams. All game mechanics (collision, severing, health, scoring) apply to invisible snakes identically to visible snakes. Invisibility is an information asymmetry only.

**01-REQ-025**: When a snake's surviving moved head (01-REQ-044d) occupies a food cell during turn resolution, the food item is consumed: the snake's health resolves to `MaxHealth` at commit (01-REQ-046c/046d) and its final tail segment is duplicated (01-REQ-062). Item collection (food or potions) is *not* a disruption — see 01-REQ-030.

**01-REQ-026**: When one or more snakes belonging to a team T collect one or more InvulnPotions in the same turn (01-REQ-047), a single **team rebuild claim** of the `invulnerability` family is recorded. At commit it grants effects `(family = invulnerability, state, expiryTurn = currentTurn + 3)`: `state = debuff` for every member that collected this turn, `state = buff` for every other member alive at commit. The rebuild *replaces* any existing invulnerability-family effect on every affected member (01-REQ-050).

**01-REQ-027**: When one or more snakes belonging to a team T collect one or more InvisPotions in the same turn, a single team rebuild claim of the `invisibility` family is recorded analogously to 01-REQ-026: at commit, `(family = invisibility, state, expiryTurn = currentTurn + 3)` with `state = debuff` for this turn's collectors and `state = buff` for other members alive at commit, replacing any existing invisibility-family effect. An invisibility-family `debuff` holder remains visible per 01-REQ-023.

---

### 1.5 Disruptions and Potion Effect Cancellation

**01-REQ-028**: A snake holds at most one active effect per family. This is a structural invariant maintained by the single-rebuild-claim-per-(team, family)-per-turn aggregation of 01-REQ-047 and the replace-semantics commit of 01-REQ-050; the commit never inserts an effect of a family already present without first removing the prior one. A snake is the **active collector for family F** if and only if it currently holds an active effect `(family = F, state = debuff)`. A snake may simultaneously be the active collector for both families (one debuff of each); the two families are independent.

**01-REQ-029**: *(Retired. ID not reused. See resolved 01-REVIEW-015.)*

**01-REQ-030**: A **disruption** is any of the following events experienced by a snake during turn resolution. This set is closed:
- (a) Death from any cause
- (b) Severing another snake's body
- (c) Being severed by another snake
- (d) Receiving a body collision — a foreign snake's head enters a cell occupied by this snake's body
- (e) Entering a hazard cell

Item collection (food, InvulnPotion, InvisPotion) is explicitly *not* a disruption.

**01-REQ-031**: If a snake that is the active collector for family F in the turn's snapshot (01-REQ-028, 01-REQ-033) suffers any disruption during turn resolution, a team-wide, family-scoped **cancellation claim** is recorded: at commit, every active effect of family F is removed from every alive member of the collector's team. Other families are untouched. If the disrupted snake is the active collector for both families simultaneously, both families cancel independently. Cancellation removes active effects only; team rebuild claims recorded in the same turn (01-REQ-047) are unaffected and apply at commit normally. A same-turn re-collection therefore supersedes a disruption-triggered cancellation of the same family.

**01-REQ-032**: *(Retired. ID not reused. See resolved 01-REVIEW-015.)*

---

### 1.6 Effect Immutability

**01-REQ-033**: All reads of `activeEffects` (and the values derived from it — `invulnerabilityLevel` per 01-REQ-022 and `visible` per 01-REQ-023) by the turn's interaction and derived rules shall return the snapshot values (01-REQ-041). Any effect gained, cancelled, or expired at the current turn's commit has no observable influence on the current turn's outcomes; such changes become observable in the following turn's snapshot. The commit is the sole writer of `activeEffects`. See resolved 01-REVIEW-014 and 01-REVIEW-022.

---

### 1.7 Chess Timer

**01-REQ-034**: Each team shall have a **time budget** (non-negative integer, milliseconds) that persists across turns within a game.

**01-REQ-035**: The time budget for each team at game start shall be the configured `initialBudget`.

**01-REQ-036**: At the start of each turn, each team's budget shall be incremented by the configured `budgetIncrement` (default 500ms).

**01-REQ-037**: At the start of each turn, each team's **per-turn clock** shall be set to `min(effectiveCap, currentBudget)`, and that amount shall simultaneously be deducted from the team's budget — the per-turn clock is carved out of the budget, so the budget holds only time not currently on the clock. The effective cap is `firstTurnTime` (default 60s) on turn 0 and `maxTurnTime` (default 10s) on all subsequent turns. A team's total remaining time at any instant is `budget + perTurnClock`. (See resolved 01-REVIEW-019.)

**01-REQ-038**: A team may **declare turn over** at any time during the current turn. Upon declaration, the team's remaining per-turn clock time is added back to its budget. The team's per-turn clock stops.

**01-REQ-039**: A team's turn shall be automatically declared over when its per-turn clock reaches zero.

**01-REQ-040**: Turn resolution shall commence when all teams have declared turn over (whether explicitly or by clock expiry).

---

### 1.8 Turn Resolution

**01-REQ-041**: Turn resolution shall execute the following stages once per turn, in order:

1. **Move Projection** — determine each alive snake's direction and moved body (01-REQ-042, 01-REQ-043).
2. **Head-to-Head Precedence** — resolve head-to-head collisions and filter the moved-head set (01-REQ-044d).
3. **Interaction Rules** — evaluate all interaction rules, producing outcome claims (01-REQ-044a–c, 01-REQ-046a–c, 01-REQ-047).
4. **Derived Rules** — evaluate rules over the interaction claims (effect cancellation, 01-REQ-045).
5. **Commit** — deterministically combine all claims into the end-of-turn state (01-REQ-046d, 01-REQ-050, 01-REQ-062).
6. **Item Spawning** — spawn food and potions using the turn seed (01-REQ-048, 01-REQ-049).
7. **Win Condition Check** (01-REQ-051).
8. **Event Derivation** (01-REQ-052).

The **snapshot** for a turn is the committed game state at the end of the previous turn (for turn 0, the initial state produced by game setup). Interaction rules are pure functions of the snapshot, the surviving moved-head set produced by stage 2, and the turn seed; derived rules additionally read interaction-rule claims. No rule reads state mutated during the current turn — the commit is the sole writer of game state, and no claim can observe another claim's committed effect. The rules within stages 3 and 4 may therefore be evaluated in any order, or concurrently, without changing any outcome. (See resolved 01-REVIEW-021 and 01-REVIEW-022.)

**01-REQ-042 (Move Projection — direction)**: For each alive snake, its direction for this turn shall be determined as follows: (a) if a move is staged, use that direction; (b) else if `lastDirection` is non-null, use `lastDirection` unconditionally (even if that cell is lethal); (c) else (no prior direction, only possible on turn 0 with no move staged) choose a direction uniformly at random from {Up, Right, Down, Left} using the turn seed (01-REQ-060). The random choice is not constrained to non-lethal cells — if the chosen direction leads into a wall or the snake's own body, the snake dies via the collision rules as it would from any other fatal move. See resolved 01-REVIEW-006.

**01-REQ-043 (Move Projection — body advance)**: All alive snakes shall move simultaneously. Each snake's **moved body** is obtained by advancing the head one cell in its chosen direction and dropping the final tail segment: `movedBody = [newHead] ⧺ body[0 .. len−2]`, unconditionally — movement has no growth branch, because growth is represented by tail duplication at commit (01-REQ-062). `lastDirection` is updated to the direction moved. The **moved-head set H** is the set of all alive snakes' new head positions.

**01-REQ-044 (Collision rules)**: Collision outcomes shall be evaluated by parallel interaction rules reading only the snapshot and the surviving moved-head set **H\*** of 01-REQ-044d. The logical board for collision purposes comprises every alive snake's moved body. A snake incurring certain death from any rule retains its body segments on the logical board for the whole turn: its segments remain valid collision targets for every other rule. Severing (01-REQ-044c) is recorded as a claim and applied only at commit; no rule observes a severed body. Invulnerability levels and body lengths are read from the snapshot (01-REQ-033). See resolved 01-REVIEW-002 for a worked example and resolved 01-REVIEW-021/01-REVIEW-022 for the governing model.

**01-REQ-044a (Wall collision)**: A snake whose surviving moved head occupies a Wall cell incurs certain death (cause `wall`).

**01-REQ-044b (Self-collision)**: A snake whose surviving moved head occupies a cell containing any non-head segment of its own moved body incurs certain death (cause `self_collision`). (The just-vacated tail cell is excluded by construction — 01-REQ-043 drops the final tail segment — unless the tail segment is duplicated per 01-REQ-062, in which case its cell remains occupied and lethal.)

**01-REQ-044c (Body collision)**: For a snake (attacker) whose surviving moved head occupies a cell containing a non-head segment of another snake's (victim's) moved body, resolution uses each snake's snapshot `invulnerabilityLevel` (01-REQ-033): if the attacker's level exceeds the victim's, a **sever claim** is recorded — at commit, all victim segments from the contact segment through the tail are removed — and the attacker survives; otherwise the attacker incurs certain death (cause `body_collision`) and the victim incurs a body-collision-received disruption. When several attackers sever the same victim in one turn, the commit truncates the victim once, at the head-closest contact segment.

**01-REQ-044d (Head-to-head precedence)**: Head-to-head resolution takes precedence over every other interaction rule. For each cell occupied by two or more moved heads: occupants whose snapshot `invulnerabilityLevel` is below the maximum among the occupants die; among occupants at the maximum level, those whose snapshot body length is below the maximum die; if two or more occupants remain, all of them die. Snapshot body length is the segment count of `body` in the snapshot — growth from food eaten on an earlier turn is already present as a duplicated tail segment (01-REQ-062). Every head-to-head loser incurs certain death (cause `head_to_head`) and its head is withdrawn from the moved-head set: the **surviving moved-head set H\*** consumed by every other interaction rule contains only heads that did not lose a head-to-head. A losing snake's body segments remain on the logical board (01-REQ-044); only its head is withdrawn — a head-to-head loser collects no items, enters no hazard, and triggers no body collisions. Head-to-head resolution leaves at most one surviving head per cell, guaranteeing unique entrancy for item collection (01-REQ-046c, 01-REQ-047).

**01-REQ-045 (Derived rule — cancellation)**: A team-wide, family-scoped cancellation claim per 01-REQ-031 shall be derived for team T and family F whenever any disruption claim of 01-REQ-030 targets a snake of team T holding an active `(F, debuff)` effect in the snapshot. Derived rules read interaction-rule claims and the snapshot only. Because cancellation scope is determined solely by snapshot debuff holdings, effects granted by the current turn's rebuild claims are never cancellation triggers: a collector becomes disruptable only from the turn after its debuff is committed.

**01-REQ-046 (Health rules)**: Health shall be resolved from parallel damage and heal claims combined at commit.

**01-REQ-046a (Health tick)**: Every snake alive in the snapshot incurs a damage claim of 1 (source `tick`), unconditionally.

**01-REQ-046b (Hazard damage)**: A snake whose surviving moved head occupies a Hazard cell incurs a damage claim of the configured `hazardDamage` (default 15, source `hazard`) and a hazard-entry disruption claim.

**01-REQ-046c (Food consumption)**: For a snake whose surviving moved head occupies a cell holding a food item, the rule records a **consumption claim** for the item together with a **heal claim** and a **growth claim** for the snake (01-REQ-062). At commit the consumption claim removes the item from the board (01-REQ-007), and the `food_eaten` event reports the consumed `itemId`. 01-REQ-044d guarantees at most one surviving head per cell, so each food item is collected by at most one snake per turn. Eating is not a disruption; a hazard entry on the same cell still is (01-REQ-046b applies independently, and the heal claim dominates the damage at resolution per 01-REQ-046d).

**01-REQ-046d (Health resolution and health death)**: At commit, each snake's health resolves to `MaxHealth` if the snake holds any heal claim, else to `snapshot health − Σ(damage claims)`. A snake whose resolved health is ≤ 0 dies (cause `health_depletion`), reporting the set of damage sources that contributed. Health death is a disruption (subcase of "death from any cause" in 01-REQ-030). Certain-death claims (wall, self-collision, body collision, head-to-head) are independent of health resolution: a snake dies if it incurs any certain-death claim or its resolved health is ≤ 0; when both hold, the certain-death cause is reported (Section 2.11).

**01-REQ-047 (Potion rule)**: For each snake whose surviving moved head occupies a cell holding a potion, the rule records a **consumption claim** for the potion (unique entrancy per 01-REQ-044d; at commit the claim removes the item from the board and the `potion_collected` event reports the consumed `itemId`). All collections by one team of one family in the same turn collapse into a single **team rebuild claim** per 01-REQ-026 (invulnerability) or 01-REQ-027 (invisibility): every collector-of-this-turn takes `state = debuff`, every other member takes `state = buff`, and all entries carry the same `expiryTurn = currentTurn + 3`. At commit the rebuild applies with replace-semantics (01-REQ-050): each collector receives its `debuff` entry regardless of whether it is alive at commit; non-collector members receive their `buff` entries only if alive at commit. A collector killed in its collection turn by a cause other than head-to-head therefore yields a buff window whose debuff-holder is already dead and can never be disrupted — the team's buffs run their full course, the accepted reward for a sacrificial collection play. Potion collection is not a disruption (01-REQ-030). (See resolved 01-REVIEW-022.)

**01-REQ-048 (Food spawning)**: Food shall spawn each turn after commit. The expected count is the configured `foodSpawnRate` (a non-negative decimal; 0 means no food ever spawns). The guaranteed count is `floor(foodSpawnRate)` items, with probability `foodSpawnRate mod 1` of one additional item. Spawn locations are chosen randomly using the turn seed from eligible cells of the committed state: inner, non-Wall, non-Hazard, and not currently occupied by an alive snake, food, or potion. When `fertileGroundEnabled(board)` is true (Section 3.2), eligible cells are further restricted to Fertile cells.

**01-REQ-049 (Potion spawning)**: InvulnPotions shall spawn each turn using `invulnPotionSpawnRate` by the same probabilistic mechanism and eligible-cell criteria as food; a spawn rate of 0 results in no invulnerability potions spawning. InvisPotions shall spawn independently each turn using `invisPotionSpawnRate` by the same mechanism; a spawn rate of 0 results in no invisibility potions spawning.

**01-REQ-078 (Item identity)**: Every item shall carry a game-unique `ItemId`, assigned by the engine and treated as opaque by downstream modules. Ids are allocated by turn namespace: items placed by game setup (01-REQ-017) take `itemId = k` for `k = 0, 1, …` in placement order; items spawned by turn T's resolution take `itemId = (T + 1) × 256 + k` in spawn order within the turn — the namespace of the turn boundary at which the item first exists. Configured spawn rates (01-REQ-071–073) keep per-turn spawn counts far below the 256-per-namespace bound; the engine shall fail loudly rather than allocate a colliding id if an out-of-range configuration exceeds it. Because allocation depends only on the turn number and within-turn spawn order, uniqueness holds across the whole game without the engine ever observing consumed items. *(Added per 01-REVIEW-023 resolution.)*

**01-REQ-050 (Commit — effect resolution)**: At commit, effect changes shall apply in the following fixed order: (a) cancellation claims (01-REQ-031, 01-REQ-045) remove all active effects of the cancelled families from every alive member of the affected team; (b) team rebuild claims (01-REQ-047) apply with replace-semantics — for each affected `(snake, family)` pair, any remaining active effect of that family is removed and the rebuild entry becomes active; rebuild claims are unaffected by same-turn cancellation claims (01-REQ-031); (c) all active effects whose expiry condition has been reached (`currentTurn >= expiryTurn`) are removed. The per-family single-effect invariant of 01-REQ-028 holds after commit. `invulnerabilityLevel` and `visible` are derived values per 01-REQ-022/023 and require no separate recomputation step.

**01-REQ-051 (Win condition check)**: Win conditions shall be evaluated as specified in Section 1.9 against the committed end-of-turn state.

**01-REQ-052 (Event derivation)**: Events shall be derived from the turn's claims and commit for all significant outcomes. The emitted event types are a closed set covering: snake movements (direction, identity of who staged the move), deaths (cause — including `health_depletion` with its contributing damage sources — killer where applicable, and location), severing events, food consumption and potion collection (each carrying the consumed item's identity; potion collection also carries the collector and affected teammates), food spawning, potion spawning, effect applications, and effect cancellations.

**01-REQ-062 (Growth from food consumption)**: If a snake consumes food during turn T (01-REQ-025, 01-REQ-046c), then at turn T's commit — after any severing is applied (01-REQ-044c) — the snake's final tail segment shall be duplicated in place. The snake's committed body length at the end of turn T is thereby one greater than its moved-body length, while its cell occupancy is unchanged until the duplicated tail advances on a later turn. The grown length is present in the snapshot consumed by the following turn's rules, including head-to-head resolution (01-REQ-044d). See resolved 01-REVIEW-008 and 01-REVIEW-022.

---

### 1.9 Win Conditions and Scoring

**01-REQ-053**: A team's **score** at game end is the normalised body-share multiplied by the number of competing teams:

```
score(team) = (alive_segments_owned(team) / total_alive_segments) × competing_teams
```

where `alive_segments_owned(team)` is the sum of body lengths of all alive snakes belonging to that team at the game-end moment, `total_alive_segments` is the sum of body lengths of all alive snakes across all competing teams at that moment, and `competing_teams` is the count of non-forfeited teams. Par is `1`: a team holding a strictly proportional share of living segments scores exactly `1.0`. The previous per-team aggregate of alive body lengths is retained as an intermediate display statistic (`aggregateLength`) but is not a score and is not the basis of win or draw decisions. (See resolved 01-REVIEW-018.)

**01-REQ-053a**: Forfeited teams (per [03-REQ-056] / [05-REQ-027a]) are excluded from `competing_teams` and from both `alive_segments_owned` and `total_alive_segments` in 01-REQ-053. A forfeited team's recorded score is `0`. When `competing_teams = 0` (every team forfeited), every team's score is `0`; this is the only situation in which `competing_teams = 0`.

**01-REQ-054 (Last team standing)**: The game ends when all snakes of every competing team except one are dead. The surviving team scores `1.0 × competing_teams`; every eliminated competing team scores `0`.

**01-REQ-055 (Simultaneous elimination)**: If all remaining alive snakes across all competing teams die in the same turn, the game ends. Each competing team that was alive at the start of that final turn scores `1.0` (par); each competing team eliminated on an earlier turn scores `0`. The team with the highest score wins; if two or more teams tie, the result is a draw.

**01-REQ-056**: For the simultaneous elimination case where the game ends on turn 0 (all competing snakes die on the first turn), every competing team scores `1.0` (par).

**01-REQ-057 (Turn limit)**: If the configured `maxTurns` is reached and the game has not ended by another condition, the game ends. Scores are computed by applying 01-REQ-053 to the alive-segment aggregates at the final turn. The team with the highest score wins; ties are permitted and produce a draw.

**01-REQ-058**: A `maxTurns` of zero or absent means no turn limit; the game continues until last-team-standing or simultaneous elimination.

---

### 1.10 Randomness

**01-REQ-059**: All random operations during game setup (hazard placement, fertile tile generation, territory angular offset, snake starting positions, parity choice, initial food placement) shall use a randomness source seeded from a per-game seed. This seed shall not be accessible to any game client.

**01-REQ-060**: All random operations during turn resolution (food spawn locations, potion spawn locations) shall use a randomness source seeded from a per-turn seed. This seed shall not be accessible to any game client.

---

### 1.11 Game Configuration Parameter Ranges

**01-REQ-063 (Board size range)**: `boardSize` shall be a positive integer. The `[7, 32]` bound is enforced by user-facing surfaces only: the Convex configuration mutation per [05-REQ-023] and the room-lobby board-size widget per [08] §2.13. See resolved **01-REVIEW-018**.

**01-REQ-064 (Snakes per team range)**: `snakesPerTeam` shall be an integer in the range 1–10, default 5 (consistent with 01-REQ-019).

**01-REQ-065 (Max health range)**: `maxHealth` shall be an integer in the range 1–500, default 100. The lower bound ensures snakes can take at least one hit; the upper bound prevents degenerate immortality configurations.

**01-REQ-066 (Max turns range)**: `maxTurns` shall be 0 (disabled, per 01-REQ-058) or an integer in the range 1–1000, default 100. The upper bound prevents excessively long games.

**01-REQ-067 (Hazard percentage range)**: `hazardPercentage` shall be an integer in the range 0–30, default 0 (informal spec §9.3).

**01-REQ-068 (Hazard damage range)**: `hazardDamage` shall be an integer in the range 1–100, default 15 (informal spec §9.3).

**01-REQ-069 (Fertile ground density range)**: `fertileGround.density` shall be an integer in the range 0–90, default 30 (informal spec §9.3). A value of 0 disables fertile ground (no cell is marked `CellType.Fertile` during board generation and food spawning is not restricted to Fertile cells); any positive value enables it with the specified density percentage. See resolved **01-REVIEW-017**.

**01-REQ-070 (Fertile ground clustering range)**: `fertileGround.clustering` shall be an integer in the range 1–20, default 10 (informal spec §9.3). Has no effect when `fertileGround.density` is 0.

**01-REQ-071 (Food spawn rate range)**: `foodSpawnRate` shall be a number in the range 0–5, default 0.5 (informal spec §9.3).

**01-REQ-072 (Invulnerability potion spawn rate range)**: `invulnPotionSpawnRate` shall be a number in the range 0–0.2, default 0.15 (informal spec §9.3). A value of 0 disables invulnerability potions (none ever spawn); any positive value within [0.01, 0.2] yields the standard probabilistic spawn mechanic of 01-REQ-049. Values in `(0, 0.01)` are permitted by the type but operationally indistinguishable from a very rare rate. See resolved **01-REVIEW-017**.

**01-REQ-073 (Invisibility potion spawn rate range)**: `invisPotionSpawnRate` shall be a number in the range 0–0.2, default 0.1 (informal spec §9.3). A value of 0 disables invisibility potions (none ever spawn); any positive value within [0.01, 0.2] yields the standard probabilistic spawn mechanic of 01-REQ-049. See resolved **01-REVIEW-017**.

**01-REQ-074 (Initial time budget range)**: `clock.initialBudgetMs` shall be an integer in the range 0–600000 (0–10 minutes), default 60000 (informal spec §9.3). Zero means no initial budget.

**01-REQ-075 (Budget increment range)**: `clock.budgetIncrementMs` shall be an integer in the range 100–5000, default 500 (informal spec §9.3).

**01-REQ-076 (First turn time range)**: `clock.firstTurnTimeMs` shall be an integer in the range 1000–300000, default 60000. The lower bound of 1000ms is higher than `maxTurnTimeMs`'s 100ms floor because the first turn involves initial orientation and should not be blitz-constrained.

**01-REQ-077 (Max turn time range)**: `clock.maxTurnTimeMs` shall be an integer in the range 100–300000, default 10000. The lower bound of 100ms supports blitz-style play configurations.

See resolved **01-REVIEW-012**.

---

## Design

The Design section specifies *how* the requirements are satisfied. It cites requirement IDs throughout. Type definitions here are drafts that the Exported Interfaces section then elevates to the module's contract; where a type appears in both, the Exported Interfaces version is authoritative.

### 2.1 Domain Type Vocabulary

Implements 01-REQ-001 through 01-REQ-007.

```typescript
// 01-REQ-001
export const enum Direction { Up = 0, Right = 1, Down = 2, Left = 3 }

// 01-REQ-002. Fertile is an overlay on Normal — a cell is never simultaneously
// Fertile and Wall/Hazard — but is represented as a distinct CellType so that
// every inner cell sits in exactly one category and board lookups are O(1).
export const enum CellType { Normal = 0, Wall = 1, Hazard = 2, Fertile = 3 }

// 01-REQ-005
export const enum ItemType { Food = 0, InvulnPotion = 1, InvisPotion = 2 }

// 01-REQ-006. Potion effects are a `(family, state, expiryTurn)` triple.
// String values rather than numeric to keep event-stream and database rows
// human-readable; the perf cost is negligible because effect operations are
// low frequency compared to collision detection.
export type EffectFamily = 'invulnerability' | 'invisibility'
export type EffectState  = 'buff' | 'debuff'

// Coordinate convention: (0,0) is the top-left wall cell. x is column, y is row.
export interface Cell { readonly x: number; readonly y: number }

// Branded ID types so that SnakeId, CentaurTeamId, ItemId, and TurnNumber cannot be
// accidentally mixed at call sites.
export type SnakeId    = number & { readonly __brand: 'SnakeId' }
export type CentaurTeamId     = string & { readonly __brand: 'CentaurTeamId' }
export type ItemId     = number & { readonly __brand: 'ItemId' }
export type TurnNumber = number & { readonly __brand: 'TurnNumber' }
export type CellIndex  = number & { readonly __brand: 'CellIndex' }  // y * boardSize + x (note 3)

// 01-REQ-006 potion effect entry. A snake holds at most one active effect
// per family per 01-REQ-028; the collection shape is retained (rather than
// flat per-family slots) so that the family is carried on the member and
// iteration is uniform across families. `expiryTurn` is the last turn on
// which the effect is active; see resolved 01-REVIEW-003.
export interface PotionEffect {
  readonly family:     EffectFamily
  readonly state:      EffectState
  readonly expiryTurn: TurnNumber
}

// 01-REQ-004, 01-REQ-020, 01-REQ-021. Note: `invulnerabilityLevel` and
// `visible` are NOT stored fields — they are derived values computed from
// `activeEffects` by the functions in Section 3.1. Consecutive `body`
// entries may share a cell: growth is a duplicated tail segment
// (01-REQ-062) and the game-start body is fully stacked (01-REQ-020).
export interface SnakeState {
  readonly snakeId: SnakeId
  readonly letter: string             // single alphabetic char, 'A' + index within team
  readonly centaurTeamId: CentaurTeamId
  readonly body: ReadonlyArray<Cell>  // head at index 0, tail at last index
  readonly health: number
  readonly activeEffects: ReadonlyArray<PotionEffect>   // ≤1 per family (01-REQ-028)
  readonly lastDirection: Direction | null
  readonly alive: boolean
}

// 01-REQ-007 — a present item. Consumption removes the entry from the
// items collection at commit; there is no consumed flag.
export interface ItemState {
  readonly itemId: ItemId
  readonly itemType: ItemType
  readonly cell: Cell
}

// The present-items component of game state: keyed by canonical cell index,
// so a second occupant of a cell is unrepresentable (01-REQ-007).
export type ItemsByCell = ReadonlyMap<CellIndex, ItemState>
```

**Invisibility as information asymmetry only** (01-REQ-024). `isVisible(snake) = false` has no effect on collision detection, severing, health ticks, or any other turn-resolution mechanic — those phases operate against the full live state. The derived value exists exclusively to support filtering at the observation boundary: module 04's RLS rules use it to hide invisible snakes from opponent-team subscribers, and module 09's spectator views respect the same filter. The turn-resolution pseudocode in Section 2.8 never computes `isVisible(snake)` during Phases 1–8; it is only consulted by observation-boundary code.

**Derived values, not stored fields** (01-REQ-022, 01-REQ-023). `invulnerabilityLevel ∈ {-1, 0, +1}` and `isVisible` are pure O(k) functions over `activeEffects` with k ≤ 2 per 01-REQ-028; consumers call the exported `invulnerabilityLevel(snake)` and `isVisible(snake)` helpers from Section 3.1. See resolved **01-REVIEW-014** and **01-REVIEW-015**.

**Invisibility collector remains visible** (01-REQ-023). The active collector of the invisibility family holds `(invisibility, debuff)` and is therefore `isVisible(snake) = true`. Their teammates who hold `(invisibility, buff)` are invisible to opponents. The collector is the visible "weak link" opponents can target to disrupt their team's invisibility — this is the whole point of the collector role and is symmetric to the invulnerability collector's `invulnerabilityLevel = -1` vulnerability. See resolved **01-REVIEW-016**.

### 2.2 Board Geometry

Implements 01-REQ-003, 01-REQ-008, 01-REQ-009. See resolved **01-REVIEW-018**.

```typescript
// Flat row-major cell array. Flat layout chosen over nested arrays for
// cache locality — collision detection and hazard lookup are the hot path.
export interface Board {
  readonly boardSize: number                   // edge length in cells (01-REQ-003)
  readonly cells: ReadonlyArray<CellType>      // length = boardSize * boardSize
}

export function cellIndex(board: Board, cell: Cell): number {
  return cell.y * board.boardSize + cell.x
}

export function isInner(board: Board, cell: Cell): boolean {
  return cell.x > 0 && cell.x < board.boardSize - 1
      && cell.y > 0 && cell.y < board.boardSize - 1
}

export function parityOf(cell: Cell): 0 | 1 {
  return ((cell.x + cell.y) & 1) as 0 | 1
}

export function fertileGroundEnabled(board: Board): boolean {
  return board.cells.includes(CellType.Fertile)
}
```

`fertileGroundEnabled(board)` is the canonical predicate for whether fertile-ground food-eligibility restriction applies. Runtime consumers (food spawning per [01-REQ-048]) must derive the answer from the board rather than the config because `config.orchestration.fertileGround.density` is not forwarded to SpacetimeDB (see resolved [01-REVIEW-017]) — the board itself is the authoritative record of whether fertile-ground generation ran. The predicate is a pure function of `Board` and `Board.cells` is static for the lifetime of a game, so implementations may cache the result at init time; the observable value never changes across turns.

Direction semantics:

| Direction | Δx | Δy |
|-----------|----|----|
| `Up`      |  0 | −1 |
| `Right`   | +1 |  0 |
| `Down`    |  0 | +1 |
| `Left`    | −1 |  0 |

### 2.3 Randomness & Seed Derivation

Implements 01-REQ-059, 01-REQ-060, 01-REQ-061.

**PRNG**: Xoshiro256++. Chosen over `Math.random` (non-reproducible), Mulberry32 (32-bit state, insufficient for thousands of turns of per-turn reseeding), and SplitMix64 (acceptable but weaker statistical quality than Xoshiro). Xoshiro256++ has a 256-bit state that maps naturally to a 32-byte seed.

**Game seed**: 32 bytes, generated at game provisioning time, stored in the module-04 static configuration, not exposed to any client (01-REQ-059).

**Sub-seed derivation** (resolving 01-REVIEW-007's explicit deferral): given a parent seed `s` (32 bytes) and a UTF-8 context tag `t`, the sub-seed is

```
subSeed(s, t) = BLAKE3(key = s, input = t).firstBytes(32)
```

BLAKE3's keyed-hash mode gives a PRF whose output has strong uniformity properties, making it suitable for reseeding both Xoshiro and the Perlin noise offset. The requirement is only that the derivation be deterministic and reproducible from the game seed plus attempt index; BLAKE3 is a specific choice rather than the only valid one (see DOWNSTREAM IMPACT note 4).

Defined context tags:

| Context tag                | Purpose                                                          |
|----------------------------|------------------------------------------------------------------|
| `"board-attempt:{0..3}"`   | Per-retry board-generation seed (01-REQ-061)                     |
| `"hazards"`                | Hazard placement within an attempt                               |
| `"fertile"`                | Fertile tile noise sampling                                      |
| `"territory-angle"`        | Angular offset for team territories (01-REQ-014)                 |
| `"territory-tiebreak"`     | Tie-break for boundary cells on sector edges                     |
| `"parity"`                 | Parity choice (01-REQ-016)                                       |
| `"starting-positions"`     | Per-team head placement                                          |
| `"initial-food"`           | Initial food placement (01-REQ-017)                              |
| `"turn:{N}"`               | Per-turn seed for turn N (01-REQ-060)                            |
| `"phase-1-random"`         | Turn-0 random direction choice (01-REQ-042)                      |
| `"phase-7-food"`           | Food spawning randomness                                         |
| `"phase-8-potions"`        | Potion spawning randomness                                       |

The per-turn seed is derived as `subSeed(gameSeed, "turn:" + turnNumber)`; phase-level sub-seeds within a turn are then derived from that per-turn seed.

```typescript
export interface Rng {
  nextU32(): number
  nextFloat(): number                  // [0, 1)
  nextIntExclusive(maxExclusive: number): number
  pick<T>(items: ReadonlyArray<T>): T
  shuffle<T>(items: T[]): void         // in place, Fisher–Yates
}

export function rngFromSeed(seed: Uint8Array): Rng
export function subSeed(parent: Uint8Array, tag: string): Uint8Array
```

### 2.4 Board Generation Pipeline

Implements 01-REQ-010 through 01-REQ-017 and 01-REQ-061. A single *attempt* runs the six stages below using the current attempt's sub-seed; the attempt either succeeds or fails atomically.

**Stage 1 — Hazards** (01-REQ-010, 01-REQ-011). Using `subSeed(attemptSeed, "hazards")`:

1. `hazardCount = floor(innerCellCount * config.hazardPercentage / 100)`.
2. Sample `hazardCount` inner cells uniformly without replacement. Mark them `CellType.Hazard`.
3. Run BFS from any non-hazard inner cell over the graph of non-hazard, non-wall inner cells (4-connectivity). If BFS does not visit every non-hazard inner cell, the attempt **fails** with code `HAZARD_CONNECTIVITY`.

**Stage 2 — Fertile tiles** (01-REQ-012, 01-REQ-013): only runs if `config.fertileGround.density > 0`. Per Section 2.5 below. Marks selected cells `CellType.Fertile`. A fertile cell is never simultaneously a hazard because the candidate pool excludes hazards.

**Stage 3 — Territory angular offset** (01-REQ-014). Using `subSeed(attemptSeed, "territory-angle")`: sample `theta0 ∈ [0, 2π)` uniformly. For an N-team game the sector boundaries are `theta0 + k·(2π/N)` for `k = 0..N-1`. Each inner cell is assigned to the sector containing the point `(x + 0.5, y + 0.5)` (the cell centre). The "overlaps most" phrasing of 01-REQ-014 simplifies here to "sector containing the centre" because sectors have straight-line boundaries and inner cells are unit squares — the sector containing the centre is always the one with the largest overlap. Boundary-centre ties (measure-zero but possible under exact rational arithmetic) are broken using `subSeed(attemptSeed, "territory-tiebreak")`.

**Stage 4 — Parity choice** (01-REQ-016). Using `subSeed(attemptSeed, "parity")`: sample parity ∈ {0, 1} uniformly.

**Stage 5 — Starting positions** (01-REQ-015). Using `subSeed(attemptSeed, "starting-positions")`:

1. For each team `t`, build candidate set `C_t` = inner cells in team `t`'s territory that are (a) not Wall, (b) not Hazard, (c) of the chosen parity.
2. If any `|C_t| < config.snakesPerTeam`, the attempt **fails** with code `TERRITORY_PARITY_SHORTAGE` and records the offending team ID.
3. Otherwise, for each team sample `snakesPerTeam` distinct cells from `C_t` without replacement; these become head starting positions.

**Stage 6 — Initial food placement** (01-REQ-017). Using `subSeed(attemptSeed, "initial-food")`:

1. `E` = inner cells that are (a) not Wall, (b) not Hazard, (c) not occupied by any snake body segment. (At game start each snake's three segments all stack on the starting cell, so that single cell is marked occupied.)
2. If `config.fertileGround.density > 0`, restrict `E` further to Fertile cells.
3. If `|E| < totalSnakeCount`, the attempt **fails** with code `INITIAL_FOOD_SHORTAGE`.
4. Otherwise sample `totalSnakeCount` distinct cells from `E` and spawn one Food item per cell.

**Retry loop** (01-REQ-061): `attemptIndex` starts at 0. On failure, increment and re-derive `attemptSeed = subSeed(gameSeed, "board-attempt:" + attemptIndex)`, then rerun stages 1–6 from scratch. The loop runs up to 4 attempts (`attemptIndex ∈ {0, 1, 2, 3}`). If attempt 3 fails, surface:

```typescript
export interface BoardGenerationFailure {
  readonly code: 'HAZARD_CONNECTIVITY' | 'TERRITORY_PARITY_SHORTAGE' | 'INITIAL_FOOD_SHORTAGE'
  readonly attemptsUsed: 4
  readonly details: {
    readonly centaurTeamId?: CentaurTeamId
    readonly innerCellCount: number
    readonly eligibleCellCount?: number
  }
}
```

This structure satisfies the "machine-readable error identifying which constraint failed" obligation of 01-REQ-061. The room owner can then reconfigure and re-provision.

### 2.5 Fertile Tile Noise Spec

Implements 01-REQ-013. Given clustering `C ∈ [1, 20]` and density `D ∈ [1, 90]`:

1. **Base frequency** via log-linear mapping from `C`:
   ```
   baseFreq = 2 ** lerp(log2(1.0), log2(1/32), (C - 1) / 19)
   ```
   At `C = 1`, base period ≈ 1 cell (high frequency → scattered flecks). At `C = 20`, base period ≈ 32 cells (low frequency → contiguous blobs). Log-linear because human perception of spatial frequency is logarithmic; a linear mapping would visually compress most of the slider range into the low-clustering half.

2. **Noise score per inner non-Wall non-Hazard cell `(x, y)`**:
   - Derive a random 2D offset `(dx, dy) ∈ [0, 1024) × [0, 1024)` from `subSeed(attemptSeed, "fertile")` so the noise field shifts every game.
   - 4-octave fractal Perlin:
     ```
     sum = 0; amp = 1; freq = baseFreq; norm = 0
     for i in 0..3:
       sum  += amp * perlin((x + dx) * freq, (y + dy) * freq)
       norm += amp
       amp  *= 0.5
       freq *= 2
     score = sum / norm                 // ≈ [-1, 1]
     ```
   Each octave doubles frequency and halves amplitude per 01-REQ-013.

3. **Candidate pool**: all inner cells that are not Wall and not Hazard. Sort by score descending. Tie-break deterministically by `(y, x)` ascending.

4. **Selection**: take the top `ceil(|candidates| * D / 100)` cells. `ceil` rather than `floor` so that `D = 1` on small boards still yields at least one fertile cell, matching the intuitive meaning of a non-zero density knob.

**Perlin vs. alternatives**: Value noise produces visibly grid-aligned patches; simplex noise is advantageous only in ≥3 dimensions. 2D Perlin is the right level of complexity for this use case.

### 2.6 Snake Initialization

Implements 01-REQ-018 through 01-REQ-021.

1. For each team in team-registration order, assign letters consecutively starting at `'A'`. Display name is `${centaurTeamName}.${letter}` (01-REQ-018).
2. Assign the starting cells produced by Section 2.4 Stage 5 to the team's snakes in an order determined by a per-team Fisher–Yates shuffle drawn from the same `"starting-positions"` sub-seed.
3. For each snake:
   - `body = [startCell, startCell, startCell]` (length 3 with all segments stacked, per 01-REQ-020).
   - `health = config.maxHealth`.
   - `activeEffects = []` — derived `invulnerabilityLevel(snake) = 0` and `isVisible(snake) = true`.
   - `lastDirection = null`.
   - `alive = true`.

### 2.7 Effect State Machine

Implements 01-REQ-022, 01-REQ-023, 01-REQ-028, 01-REQ-031, 01-REQ-033, 01-REQ-050, and the expiry semantics resolved in 01-REVIEW-003.

**Effect model: symmetric buff/debuff states**. Each potion family (`invulnerability`, `invisibility`) has two possible states on a snake: `buff` or `debuff`. A snake holds at most one active effect per family (01-REQ-028). The two families are independent; a snake can hold any combination of `{none, buff, debuff} × {none, buff, debuff}` across the two families. Effects are stored as members of an `activeEffects` collection on `SnakeState`, with each member carrying `(family, state, expiryTurn)`. The flat collection form supports uniform iteration over all current effects. See resolved **01-REVIEW-015**.

The per-family single-effect invariant is maintained by two mechanisms:

1. **Single rebuild claim per (team, family) per turn** (01-REQ-047): all of a team's same-family collections in one turn collapse into one rebuild claim carrying exactly one entry per affected member.
2. **Replace-semantics commit** (01-REQ-050b): applying a rebuild entry first removes any existing active effect of that family on the member.

**Derived values, not stored fields** (01-REQ-022, 01-REQ-023):

```
invulnerabilityLevel(snake) =
  +1  if snake.activeEffects has (invulnerability, buff)
  -1  if snake.activeEffects has (invulnerability, debuff)
   0  otherwise

isVisible(snake) =
  false  if snake.activeEffects has (invisibility, buff)
  true   otherwise  // including the case of (invisibility, debuff)
```

These are the *only* effect reads the interaction rules perform. No cached fields, no denormalisation.

**Effect immutability as a structural invariant** (01-REQ-033). Interaction and derived rules read `activeEffects` from the snapshot; the commit (stage 5) is the sole writer. The derived `invulnerabilityLevel(snake)` and `isVisible(snake)` helpers consequently return snapshot values at every rule read site by construction. See resolved **01-REVIEW-014**.

**Correctness-critical invariant**:

> No rule may write to `snake.activeEffects` — rules emit claims, and the commit is the sole writer of effect state. A future mechanic that changes effect state must be expressed as a claim resolved at commit, never as an in-place mutation during rule evaluation.

**Effect duration encoding** (resolving 01-REVIEW-003). For a potion collected on turn T:

1. The turn's potion rule (01-REQ-047) records the team rebuild claim with every entry carrying `expiryTurn = T + 3`.
2. Turn T's commit applies the entries to `activeEffects`; they influence none of turn T's outcomes because rules read the snapshot.
3. The effect is observable to the rules of turns T+1, T+2, and T+3 — three turns as required. The commit of turn T+3 removes it in the expiry pass (`currentTurn >= expiryTurn`), after turn T+3's rules have already read their snapshot.

**Re-collection refreshes, does not stack**. If a team already holds an active invulnerability-family rebuild from turn T₀ and re-collects on turn T₁ > T₀, the new rebuild claim's `expiryTurn = T₁ + 3` entries unconditionally replace the previous family-F state on every affected member (01-REQ-050b). A debuff-holder who re-collects the same family remains a debuff-holder (it is in this turn's collector set).

**Cancellation semantics** (01-REQ-031, 01-REQ-045). When a snake holding `(family = F, state = debuff)` in the snapshot suffers a disruption during turn T:

- The derived cancellation rule records a `(team, F)` cancellation claim.
- The commit applies cancellations before rebuilds and expiry: every active family-F effect is removed from every alive member of the team. Rebuild claims recorded this turn are unaffected and apply normally — a same-turn re-collection supersedes the cancellation. (See resolved 01-REVIEW-020.)
- If the disrupted snake holds debuffs of both families, both families cancel independently.

See resolved **01-REVIEW-010** and **01-REVIEW-015** for the rationale behind the family-scoped, attribution-free cancellation model.

**Disruption claims**. Interaction rules record disruption claims; the derived cancellation rule (01-REQ-045) reads this claim set:

```typescript
interface DisruptionClaim {
  readonly snakeId: SnakeId
  readonly cause:
    | 'wall_death'     | 'self_death'    | 'body_collision_death'
    | 'severed'        | 'severing_other'| 'body_collision_received'
    | 'head_to_head_death' | 'hazard_entry' | 'health_depletion'
}
```

The `health_depletion` disruption is derived in stage 4 from the turn's damage and heal claims (health resolution per 01-REQ-046d is a pure function of the snapshot and the claim set, so it is available before commit).

### 2.8 Turn Resolution

Implements 01-REQ-041 through 01-REQ-052 and 01-REQ-062.

**Reference-state resolution principle** (see resolved 01-REVIEW-021 and 01-REVIEW-022). Interaction outcomes within a turn are pure functions of the snapshot, the staged moves, and the turn seed. Stage 1 projects movement mechanically; stage 2 resolves head-to-head precedence and yields the surviving moved-head set **H\***; each stage-3 interaction rule reads only `(snapshot, H*, seed)` and emits claims; stage-4 derived rules read the claim set plus the snapshot; the stage-5 commit is the sole writer of game state. Because no rule observes another rule's committed effect, rule evaluation within a stage is order-free — rules may be evaluated in any order or concurrently without changing any outcome. A new mechanic is added as a new rule emitting claims (plus, if it introduces a new claim type, one clause in the commit); no position in a pipeline has to be chosen. The commit's internal order is fixed and centralised: health resolution, death union, body mutation (move → sever → grow), effect resolution (cancel → rebuild → expire), item removal for consumption claims.

Pseudocode; `S` is the snapshot, `T` the current turn number, `turnSeed = subSeed(gameSeed, "turn:" + T)`:

```text
function resolveTurn(S, stagedMoves, T, turnSeed):
  # ---------- Stage 1: Move Projection (01-REQ-042, 01-REQ-043) ----------
  rngMove = rngFromSeed(subSeed(turnSeed, "phase-1-random"))
  for snake in aliveIn(S):                        # ascending snakeId
    dir[snake]  = stagedMoves.get(snake)?.direction
                  ?? snake.lastDirection
                  ?? rngMove.pick([Up, Right, Down, Left])
    head[snake]      = advance(S.body[snake][0], dir[snake])
    movedBody[snake] = [head[snake]] ++ S.body[snake][0 .. len-2]   # unconditional

  claims = {}         # the turn's claim set; rules only ever add to it

  # ---------- Stage 2: Head-to-Head Precedence (01-REQ-044d) ----------
  for cell, group in groupByCell(head) where |group| >= 2:
    maxLvl  = max(invulnerabilityLevel(S, s) for s in group)
    topTier = [s in group where invulnerabilityLevel(S, s) == maxLvl]
    maxLen  = max(|S.body[s]| for s in topTier)                 # snapshot lengths
    atMax   = [s in topTier where |S.body[s]| == maxLen]
    losers  = (|atMax| == 1) ? group minus atMax : group
    killer  = (|atMax| == 1) ? atMax[0] : null
    for s in losers:
      claims += CertainDeath(s, head_to_head, killer)
      claims += Disruption(s, head_to_head_death)
  Hs = { snake -> head[snake] : snake has no head_to_head CertainDeath }   # H*

  # ---------- Stage 3: Interaction Rules over (S, Hs) — order-free ----------
  # Wall (01-REQ-044a)
  for (s, h) in Hs where cellAt(board, h) == Wall:
    claims += CertainDeath(s, wall, null); claims += Disruption(s, wall_death)

  # Self-collision (01-REQ-044b)
  for (s, h) in Hs where h in movedBody[s][1:]:
    claims += CertainDeath(s, self_collision, null); claims += Disruption(s, self_death)

  # Body collision (01-REQ-044c) — victims include head-to-head losers
  for (a, h) in Hs, for victim v != a where h in movedBody[v][1:]:
    contactIndex = first i >= 1 with movedBody[v][i] == h
    if invulnerabilityLevel(S, a) > invulnerabilityLevel(S, v):
      claims += Sever(v, contactIndex, attacker = a)
      claims += Disruption(a, severing_other); claims += Disruption(v, severed)
    else:
      claims += CertainDeath(a, body_collision, killer = v)
      claims += Disruption(a, body_collision_death)
      claims += Disruption(v, body_collision_received)

  # Hazard (01-REQ-046b)
  for (s, h) in Hs where cellAt(board, h) == Hazard:
    claims += Damage(s, config.hazardDamage, source = hazard)
    claims += Disruption(s, hazard_entry)

  # Health tick (01-REQ-046a)
  for snake in aliveIn(S): claims += Damage(snake, 1, source = tick)

  # Food (01-REQ-046c) — unique entrant guaranteed by stage 2
  for (s, h) in Hs where itemAt(S.items, h) is a Food item:
    claims += Consume(itemAt(S.items, h)); claims += Heal(s); claims += Grow(s)

  # Potions (01-REQ-047) — aggregate to one rebuild claim per (team, family)
  for (s, h) in Hs where itemAt(S.items, h) is a potion item:
    item = itemAt(S.items, h)
    claims += Consume(item); collectors[(team(s), familyOf(item))] += s
  for (team, family), collectorIds in collectors:
    claims += Rebuild(team, family, collectorIds, expiryTurn = T + 3)

  # ---------- Stage 4: Derived Rules ----------
  # Health resolution (01-REQ-046d) — pure function of S and the claim set
  for snake in aliveIn(S):
    resolvedHealth[snake] = anyHeal(claims, snake)
        ? config.maxHealth
        : S.health[snake] - sumDamage(claims, snake)
    if resolvedHealth[snake] <= 0 and snake has no CertainDeath:
      claims += HealthDeath(snake, sources = damageSources(claims, snake))
      claims += Disruption(snake, health_depletion)

  # Cancellation (01-REQ-045, 01-REQ-031) — snapshot debuff-holders only
  for d in disruptionClaims(claims):
    for e in S.activeEffects[d.snakeId] where e.state == debuff:
      claims += CancelFamily(team(d.snakeId), e.family)

  # ---------- Stage 5: Commit (sole writer; fixed internal order) ----------
  for snake in aliveIn(S):
    snake.health = resolvedHealth[snake]
    snake.alive  = snake has no CertainDeath and no HealthDeath
    snake.body   = movedBody[snake]
    if Sever claims on snake:   # min contact index across attackers
      snake.body = snake.body[0 .. minContactIndex - 1]
    if Grow claim on snake:     # sever first, then grow (01-REQ-062)
      snake.body = snake.body ++ [snake.body.last]
    snake.lastDirection = dir[snake]
  for Consume(item) in claims: remove item from items   # present-items map (01-REQ-007)
  # Effect resolution (01-REQ-050): cancel -> rebuild -> expire
  for CancelFamily(team, family) in claims:
    for mate in aliveAfterCommit(team): removeActiveOfFamily(mate, family)
  for Rebuild(team, family, collectorIds, expiry) in claims:
    for member in teamMembers(team):
      isCollector = member in collectorIds
      # Collectors receive the debuff even if dead at commit (01-REQ-047);
      # non-collectors receive the buff only while alive.
      if not isCollector and not aliveAfterCommit(member): continue
      removeActiveOfFamily(member, family)              # replace-semantics
      member.activeEffects += (family, isCollector ? debuff : buff, expiry)
  for snake, e in allActiveEffects where T >= e.expiryTurn:
    removeActive(snake, e)

  # ---------- Stage 6: Item Spawning (01-REQ-048, 01-REQ-049) ----------
  # Spawned items take ids in namespace T+1 (01-REQ-078).
  rngFood = rngFromSeed(subSeed(turnSeed, "phase-7-food"))
  spawnItems(Food, config.foodSpawnRate, rngFood, eligibleFoodCells(committed))
  rngPotion = rngFromSeed(subSeed(turnSeed, "phase-8-potions"))
  spawnItems(InvulnPotion, config.invulnPotionSpawnRate, rngPotion, eligiblePotionCells(committed))
  spawnItems(InvisPotion,  config.invisPotionSpawnRate,  rngPotion, eligiblePotionCells(committed))

  # ---------- Stage 7: Win Condition Check (01-REQ-051) ----------
  outcome = checkWinConditions(committed, T)

  # ---------- Stage 8: Event Derivation (01-REQ-052) ----------
  events = canonicalOrder(deriveEvents(claims, committed))
  return { nextState: committed, events, outcome }
```

**Simultaneity and accepted corollaries** (resolved 01-REVIEW-002, 01-REVIEW-021). Every collision reads the same logical board — all moved bodies, including those of snakes dying in the same turn — and the snapshot's levels and lengths. Two corollaries are deliberate: an attacker entering a segment that another attacker severs in the same turn still resolves its collision against that segment (it exists in the reference state though it is gone by turn end), and a snake severed this turn fights any same-turn head-to-head at its snapshot length. These match player expectations: the effect of one's move is determined by the state visible when the move was chosen, plus only the parallel movements of other snakes.

**Head-to-head precedence and item entrancy** (01-REQ-044d). Withdrawing losing heads before the other rules run guarantees each item cell has at most one collecting head, and means a head-to-head loser collects nothing, enters no hazard, and triggers no body collision in its death turn. Its body segments remain lethal to others for the whole turn.

**Present-items projection and single occupancy** (01-REQ-007, 01-REQ-078). `GameState.items` holds only items presently on the board, keyed by cell — at most one occupant per cell, so rules read a single nullable lookup, `itemAt(items, cell)`. Consumption is a claim like every other outcome: the commit removes consumed entries, and the `food_eaten`/`potion_collected` events carry the removed item's `itemId`, from which the data layer stamps `destroyedTurn` on the item's lifetime record ([04-REQ-007]). Every item's spawn-to-destruction span thus lives losslessly in one historical record while the engine's working state carries only live items.

**Sacrificial collection** (01-REQ-047). A snake may die and collect in the same turn when the death cause is anything other than a head-to-head loss — e.g. a body collision on the item's cell, or fatal health depletion. The team rebuild still applies at commit; if the dead snake was a collector, the debuff entry rests on a corpse that can never be disrupted, so the team's buffs run their full course.

**Food on hazard** (01-REQ-046c/046d). A head on a food-on-hazard cell records both the hazard damage claim (with its disruption — a collector still loses its team's effects) and the heal claim; health resolution gives the heal claim precedence, so net health is `MaxHealth`.

**Commit effect-order rationale** (01-REQ-050). Cancel-before-rebuild is required by 01-REQ-031's supersede rule: the cancellation strips snapshot-era effects, then the same turn's rebuild applies on top. Expiry runs last; a rebuild entry's `expiryTurn = T + 3` is always strictly greater than `T`, so expiry can never remove a just-applied entry and its position is observably free — last is cleanest to read.

**Growth observability** (01-REQ-062). The `food_eaten` event at turn T plus the committed body's duplicated tail make growth directly observable at the end of the eating turn; the following turn's snapshot already carries the grown length for 01-REQ-044d.

**Extensibility**. A poison mechanic is one new rule emitting `Damage(snake, amount, source = poison)` claims (and one new `DamageSource` member); an exploding trap is a rule emitting `CertainDeath`/`Sever` claims; a shield potion is a new effect family read by the level derivation. None of these require choosing an ordering position or auditing existing rules — the claim set and the commit absorb them.

### 2.9 Chess Timer

Implements 01-REQ-034 through 01-REQ-040. Per-team clock state:

```typescript
export interface CentaurTeamClockState {
  readonly centaurTeamId: CentaurTeamId
  readonly budgetMs: number          // persistent across turns (01-REQ-034, 01-REQ-035)
  readonly perTurnMs: number         // current turn only (01-REQ-037)
  readonly declaredTurnOver: boolean
}
```

**At turn start** for each team (01-REQ-036, 01-REQ-037):

```
budgetMs  += config.clock.budgetIncrementMs
cap        = (T === 0) ? config.clock.firstTurnTimeMs : config.clock.maxTurnTimeMs
perTurnMs  = min(cap, budgetMs)
budgetMs  -= perTurnMs        # clock time is carved out of the budget (01-REQ-037)
declaredTurnOver = false
```

The invariant `totalRemainingTime = budgetMs + perTurnMs` holds at every instant. Time draining off an expiring clock leaves that total — which is how a consistently slow team's budget depletes toward increment-only turns — while an early declare returns the unspent remainder to the budget. (See resolved 01-REVIEW-019.)

**On explicit declare-turn-over** (01-REQ-038):

```
budgetMs += perTurnMs      # credit unspent time back to the budget
perTurnMs = 0
declaredTurnOver = true
```

**On clock expiry** (01-REQ-039): automatically invoke the declare-turn-over sequence when real-time elapsed causes `perTurnMs` to reach zero; the credit-back is a no-op because `perTurnMs === 0`.

**Turn resolution trigger** (01-REQ-040): `resolveTurn(...)` is invoked when every team has `declaredTurnOver === true`.

Module 01 only specifies the *arithmetic* of the clock. The physical mechanism — how real-time elapsing mutates `perTurnMs` — is a module-04 concern. This is **DOWNSTREAM IMPACT** note 6.

### 2.10 Win Condition Evaluation

Implements 01-REQ-053 through 01-REQ-058. Stage 7 at the end of turn T:

```
competingTeams  = non-forfeited teams in the game roster           # [01-REQ-053a]
N               = competingTeams.length
aliveTeams      = competing teams with ≥1 alive snake in the committed state of turn T
aggregateLength(t) = sum of body.length over alive snakes in team t

if N === 0:
  # All-forfeit degenerate case (01-REQ-053a)
  return { kind: 'draw', tiedCentaurTeamIds: [], scores: allZero }

if aliveTeams.length === 0:
  # Simultaneous elimination (01-REQ-055, 01-REQ-056)
  # Teams alive at the start of turn T score 1.0 (par); earlier-eliminated teams score 0.
  # For T === 0 all competing teams were alive at game start, so all score 1.0 (01-REQ-056).
  # For T > 0 read aliveSnakeCount from the prior-turn scoreboard row (module-04 concern).
  simElimScores(t) = if hadAliveSnakesAtStartOfT(t) then 1.0 else 0.0
  return winnerOrDraw(simElimScores)

if aliveTeams.length === 1:
  # Last team standing (01-REQ-054)
  victoryScores(t) = if t === aliveTeams[0] then 1.0 * N else 0.0
  return { kind: 'victory', winnerCentaurTeamId: aliveTeams[0], scores: victoryScores }

if config.maxTurns > 0 and T === config.maxTurns - 1:
  # Turn limit (01-REQ-057) — apply normalised formula
  totalAliveSegments = sum of aggregateLength(t) for t in aliveTeams
  normalizedScores(t) =
    if t not in aliveTeams: 0.0
    elif totalAliveSegments === 0: 0.0    # all surviving teams have zero-length snakes
    else: (aggregateLength(t) / totalAliveSegments) * N
  return winnerOrDraw(normalizedScores)

return { kind: 'in_progress' }                                     # 01-REQ-058 (no limit)
```

Where `winnerOrDraw(scoreMap)` returns `{kind: 'victory', winnerCentaurTeamId: ...}` if there is a unique maximum score among competing teams, else `{kind: 'draw', tiedCentaurTeamIds: [...]}`.

**Prior-turn alive-snake data (simultaneous-elimination branch)**: For T > 0, `hadAliveSnakesAtStartOfT(t)` is true when `aliveSnakeCount > 0` in the scoreboard row for `turn = T - 1`. Module 01 specifies the arithmetic; the storage location is a module-04 concern.

**Turn limit boundary**: `maxTurns` is the count of turns played, so the game ends at the end of turn `maxTurns - 1`. `maxTurns = 0` means no limit (01-REQ-058).

### 2.11 Turn Event Schema

Implements 01-REQ-052. Closed discriminated union:

```typescript
export type DeathCause =
  | 'wall' | 'self_collision' | 'body_collision' | 'head_to_head' | 'health_depletion'

// Damage-claim sources reported on health_depletion deaths (01-REQ-046d).
export type DamageSource = 'tick' | 'hazard'

export type TurnEvent =
  | {
      readonly kind: 'snake_moved'
      readonly snakeId: SnakeId
      readonly from: Cell
      readonly to: Cell
      readonly direction: Direction
      // null when no move was staged this turn — the direction came from the
      // `lastDirection` fallback or, on turn 0, the seeded random pick.
      // Team attribution is not carried on the event because it is derivable
      // from `snakeId` via `SnakeState.centaurTeamId`.
      readonly stagedBy: Agent | null
    }
  | {
      readonly kind: 'snake_died'
      readonly snakeId: SnakeId
      readonly cause: DeathCause
      readonly killerSnakeId: SnakeId | null
      readonly location: Cell
      // Present iff cause === 'health_depletion': every damage source that
      // contributed to the fatal health resolution (01-REQ-046d).
      readonly sources?: ReadonlyArray<DamageSource>
    }
  | {
      readonly kind: 'snake_severed'
      readonly attackerSnakeId: SnakeId
      readonly victimSnakeId: SnakeId
      readonly contactCell: Cell
      readonly segmentsLost: number
    }
  | {
      readonly kind: 'food_eaten'
      readonly snakeId: SnakeId
      readonly itemId: ItemId       // the consumed item (01-REQ-046c)
      readonly cell: Cell
      // MaxHealth minus the health the snake would have resolved to without
      // the heal claim (01-REQ-046d).
      readonly healthRestored: number
    }
  | {
      readonly kind: 'potion_collected'
      readonly snakeId: SnakeId
      readonly itemId: ItemId       // the consumed item (01-REQ-047)
      readonly cell: Cell
      readonly potionType: ItemType.InvulnPotion | ItemType.InvisPotion
      readonly affectedTeammateIds: ReadonlyArray<SnakeId>
    }
  | {
      readonly kind: 'food_spawned'
      readonly itemId: ItemId
      readonly cell: Cell
    }
  | {
      readonly kind: 'potion_spawned'
      readonly itemId: ItemId
      readonly cell: Cell
      readonly potionType: ItemType.InvulnPotion | ItemType.InvisPotion
    }
  | {
      readonly kind: 'effect_applied'
      readonly snakeId: SnakeId
      readonly family: EffectFamily
      readonly state: EffectState
      readonly expiryTurn: TurnNumber
    }
  | {
      readonly kind: 'effect_cancelled'
      readonly snakeId: SnakeId
      readonly family: EffectFamily
      readonly reason: 'collector_disruption' | 'expiry' | 'replaced'
    }
```

**Death-cause precedence**. A snake reports exactly one `snake_died` event per turn. When multiple death claims target one snake, the reported cause follows the fixed precedence `head_to_head > wall > self_collision > body_collision > health_depletion`. (In practice only self-collision, body-collision, and health-depletion claims can co-occur: head-to-head losers are withdrawn from the surviving head set before the other rules run, and Wall cells host no body segments or items; the full precedence is stated so every combination is deterministic.)

**Ordering**: the turn's events form a set produced atomically by the commit. Their canonical representation order is by **event-class**, in the fixed order `snake_moved → snake_died → snake_severed → food_eaten → potion_collected → food_spawned → potion_spawned → effect_applied → effect_cancelled`; within a class, ascending by the primary subject's `snakeId` (the victim for `snake_severed`), with spawn events ascending by `itemId`. This determinism lets replay viewers render without re-sorting. (See [04-REQ-045] for the storage-side statement of the same order.)

**Scoping note**. Module 01 owns the *closed enumeration of event kinds and their payload shapes* because these trace directly from turn-resolution semantics (01-REQ-052). Module 04 owns the storage representation (append-only `turn_events` table, keyed by `(turn, eventIndex)`). Downstream modules that see a concrete identity type (most notably module 04's SpacetimeDB `Identity`) are responsible for mapping that identity to an `Agent` variant before passing staged moves into `resolveTurn`. See resolved **01-REVIEW-011**.

---

## Exported Interfaces

This section is the minimal contract module 01 exposes to downstream modules. Any type not listed here is a module-internal detail and may change without a version bump.

### 3.1 Enums and Branded Types

Motivated by 01-REQ-001, 01-REQ-002, 01-REQ-005, 01-REQ-006.

```typescript
export const enum Direction { Up = 0, Right = 1, Down = 2, Left = 3 }
export const enum CellType  { Normal = 0, Wall = 1, Hazard = 2, Fertile = 3 }
export const enum ItemType  { Food = 0, InvulnPotion = 1, InvisPotion = 2 }

// 01-REQ-006. Potion effect taxonomy: two independent families, each with
// two states. At most one active effect per family per snake (01-REQ-028).
export type EffectFamily = 'invulnerability' | 'invisibility'
export type EffectState  = 'buff' | 'debuff'

export interface Cell { readonly x: number; readonly y: number }

export type SnakeId    = number & { readonly __brand: 'SnakeId' }
export type CentaurTeamId     = string & { readonly __brand: 'CentaurTeamId' }
export type ItemId     = number & { readonly __brand: 'ItemId' }
export type TurnNumber = number & { readonly __brand: 'TurnNumber' }
export type UserId    = string & { readonly __brand: 'UserId' }
export type CellIndex  = number & { readonly __brand: 'CellIndex' }  // y * boardSize + x (note 3)

// Agent: the actor that staged a move. Module 01 distinguishes two kinds —
// CentaurTeam (a Centaur Team's bot acting on the team's collective behalf,
// incorporating human and AI heuristics) and Operator (an individual human
// member of a Centaur Team, identified via Google OAuth).
// The `CentaurTeamId` and `UserId` id spaces are disjoint and opaque to
// module 01; the mapping from a concrete deployment identity (e.g. module
// 04's SpacetimeDB `Identity`) to an `Agent` is owned by the downstream
// module that has visibility into that identity namespace.
export type Agent =
  | { readonly kind: 'centaur_team'; readonly centaurTeamId: CentaurTeamId }
  | { readonly kind: 'operator';    readonly operatorUserId: UserId }

// Derived values over `SnakeState.activeEffects`. Defined per 01-REQ-022
// and 01-REQ-023. These are pure functions with no side effects and no
// cached state; call-site cost is O(k) with k ≤ 2 per 01-REQ-028.
export function invulnerabilityLevel(snake: SnakeState): -1 | 0 | 1
export function isVisible(snake: SnakeState): boolean
```

### 3.2 State Shapes

Motivated by 01-REQ-004, 01-REQ-007, 01-REQ-008–009, 01-REQ-022, 01-REQ-023, 01-REQ-031.

```typescript
// 01-REQ-006. Potion effect held on SnakeState. At most one active per family.
export interface PotionEffect {
  readonly family:     EffectFamily
  readonly state:      EffectState
  readonly expiryTurn: TurnNumber
}

export interface SnakeState {
  readonly snakeId: SnakeId
  readonly letter: string
  readonly centaurTeamId: CentaurTeamId
  // Consecutive entries may share a cell: growth is a duplicated tail
  // segment (01-REQ-062); the game-start body is fully stacked (01-REQ-020).
  readonly body: ReadonlyArray<Cell>
  readonly health: number
  readonly activeEffects: ReadonlyArray<PotionEffect>   // ≤1 per family
  readonly lastDirection: Direction | null
  readonly alive: boolean
  // `invulnerabilityLevel` and `visible` are NOT fields. Derive via
  // `invulnerabilityLevel(snake)` and `isVisible(snake)` from Section 3.1.
}

// A present item (01-REQ-007). Consumption removes the entry from the
// items collection at commit; there is no consumed flag.
export interface ItemState {
  readonly itemId: ItemId
  readonly itemType: ItemType
  readonly cell: Cell
}

// The present-items component of game state: cell-keyed (canonical index
// y * boardSize + x, DOWNSTREAM IMPACT note 3), at most one item per cell
// by construction (01-REQ-007).
export type ItemsByCell = ReadonlyMap<CellIndex, ItemState>

// Bridge from the flat wire/rest representation — a list of present items
// on distinct cells (board-generation output, active item_lifetimes rows
// per [04-REQ-007], stored previews) — to the logical map; throws if two
// items share a cell. itemAt is the single nullable lookup rules perform.
export function itemsByCell(board: Board, items: Iterable<ItemState>): ItemsByCell
export function itemAt(board: Board, items: ItemsByCell, cell: Cell): ItemState | null

export interface Board {
  readonly boardSize: number                   // edge length in cells (01-REQ-003)
  readonly cells: ReadonlyArray<CellType>      // length = boardSize * boardSize
}

export interface CentaurTeamClockState {
  readonly centaurTeamId: CentaurTeamId
  readonly budgetMs: number
  readonly perTurnMs: number
  readonly declaredTurnOver: boolean
}
```

### 3.3 Game Configuration

Motivated by 01-REQ-003, 01-REQ-010, 01-REQ-013, 01-REQ-019, 01-REQ-034–040, 01-REQ-046b, 01-REQ-048, 01-REQ-049, 01-REQ-057, 01-REQ-063–077. Numeric ranges are pinned by canonical range requirements 01-REQ-063–077 (see resolved **01-REVIEW-012**) drawing from the informal spec's §9.3 game configuration table. The split between `GameOrchestrationConfig` and `GameRuntimeConfig` traces the boundary between fields consumed only on the platform side (board generation and lifecycle orchestration) and fields consumed by the per-turn engine (see resolved **01-REVIEW-017**).

```typescript
export interface GameOrchestrationConfig {
  readonly boardSize: number                     // positive integer, 01-REQ-003, 01-REQ-063 (See resolved 01-REVIEW-018.)
  readonly snakesPerTeam: number                 // 1–10, default 5, 01-REQ-019, 01-REQ-064
  readonly hazardPercentage: number              // 0–30, default 0, 01-REQ-010, 01-REQ-067
  readonly fertileGround: {
    readonly density: number                     // 0–90, default 30, 01-REQ-013, 01-REQ-069
                                                 //   (0 = no fertile cells generated)
    readonly clustering: number                  // 1–20, default 10, 01-REQ-013, 01-REQ-070
  }
}

export interface GameRuntimeConfig {
  readonly maxHealth: number                     // 1–500, default 100, 01-REQ-065
  readonly maxTurns: number                      // 0 (disabled) or 1–1000, default 100, 01-REQ-058, 01-REQ-066
  readonly hazardDamage: number                  // 1–100, default 15, 01-REQ-046b, 01-REQ-068
  readonly foodSpawnRate: number                 // 0–5, default 0.5, 01-REQ-048, 01-REQ-071
  readonly invulnPotionSpawnRate: number         // 0–0.2, default 0.15, 01-REQ-049, 01-REQ-072
                                                 //   (0 = no invuln potions ever spawn)
  readonly invisPotionSpawnRate: number          // 0–0.2, default 0.1, 01-REQ-049, 01-REQ-073
                                                 //   (0 = no invis potions ever spawn)
  readonly clock: {
    readonly initialBudgetMs: number             // 0–600000, default 60000, 01-REQ-035, 01-REQ-074
    readonly budgetIncrementMs: number           // 100–5000, default 500, 01-REQ-036, 01-REQ-075
    readonly firstTurnTimeMs: number             // 1000–300000, default 60000, 01-REQ-037, 01-REQ-076
    readonly maxTurnTimeMs: number               // 100–300000, default 10000, 01-REQ-037, 01-REQ-077
  }
}

export interface GameConfig {
  readonly orchestration: GameOrchestrationConfig
  readonly runtime: GameRuntimeConfig
}
```

**Schema-mirroring constraints**. The three types above are the canonical TypeScript schema. To make the same shape declarable in both SpacetimeDB (`@type` classes mirroring each interface) and Convex (`v.object({…})` validators with `Infer<typeof v> ≡ GameConfig`) without translation, the following constraints hold throughout: every numeric field is `number` (no `bigint`/`Int64`); no field is `null` or absent in value position (sentinels — `maxTurns: 0`, `fertileGround.density: 0`, `foodSpawnRate: 0`, `invulnPotionSpawnRate: 0`, `invisPotionSpawnRate: 0` — encode "disabled"); enums are string-literal unions (`EffectFamily`, `EffectState`); time values are milliseconds; nested object grouping carries semantic meaning rather than syntactic optionality (e.g., `fertileGround` bundles the two board-gen knobs that parameterise one feature; `clock` bundles the four chess-timer knobs). See resolved **01-REVIEW-017**.

### 3.4 Game Outcome

Motivated by 01-REQ-051, 01-REQ-053–058.

```typescript
export type GameOutcome =
  | { readonly kind: 'in_progress' }
  | {
      readonly kind: 'victory'
      readonly winnerCentaurTeamId: CentaurTeamId
      readonly scores: ReadonlyMap<CentaurTeamId, number>
    }
  | {
      readonly kind: 'draw'
      readonly tiedCentaurTeamIds: ReadonlyArray<CentaurTeamId>
      readonly scores: ReadonlyMap<CentaurTeamId, number>
    }
  | {
      readonly kind: 'error'
      readonly reason: string
    }
```

The `scores` map in `victory` and `draw` variants carries the normalised real-valued scores defined by 01-REQ-053. Each value is in the range `[0, competing_teams]`, with par at `1.0`. Forfeited teams carry score `0` per 01-REQ-053a and are included in the map. The `error` variant carries no `scores` field.

### 3.5 Turn Event Schema

Motivated by 01-REQ-052. Full type as defined in Section 2.11 (`TurnEvent`, `DeathCause`).

### 3.6 Board Generation Failure

Motivated by 01-REQ-061.

```typescript
export interface BoardGenerationFailure {
  readonly code: 'HAZARD_CONNECTIVITY' | 'TERRITORY_PARITY_SHORTAGE' | 'INITIAL_FOOD_SHORTAGE'
  readonly attemptsUsed: 4
  readonly details: {
    readonly centaurTeamId?: CentaurTeamId
    readonly innerCellCount: number
    readonly eligibleCellCount?: number
  }
}
```

### 3.7 Randomness Primitives

Motivated by 01-REQ-059, 01-REQ-060, 01-REQ-061.

```typescript
export interface Rng {
  nextU32(): number
  nextFloat(): number
  nextIntExclusive(maxExclusive: number): number
  pick<T>(items: ReadonlyArray<T>): T
  shuffle<T>(items: T[]): void
}

export function rngFromSeed(seed: Uint8Array): Rng
export function subSeed(parent: Uint8Array, tag: string): Uint8Array
```

### 3.8 Entry Points

Motivated by 01-REQ-010–017 + 01-REQ-061 (board gen) and 01-REQ-041–052 + 01-REQ-062 (turn resolution).

```typescript
export function generateBoardAndInitialState(
  config: GameOrchestrationConfig,
  teams: ReadonlyArray<{ readonly centaurTeamId: CentaurTeamId; readonly name: string }>,
  gameSeed: Uint8Array,
): { readonly board: Board; readonly snakes: ReadonlyArray<SnakeState>;
     readonly items: ReadonlyArray<ItemState> }
  | BoardGenerationFailure

export interface StagedMove {
  readonly direction: Direction
  readonly stagedBy: Agent   // never null on input; absence is represented by
                             // omitting the entry from the `stagedMoves` map
}

export function resolveTurn(
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnNumber: TurnNumber,
  turnSeed: Uint8Array,
): {
  readonly nextState: GameState
  readonly events: ReadonlyArray<TurnEvent>
  readonly outcome: GameOutcome
}

```

```typescript
export interface GameState {
  readonly board: Board
  readonly snakes: ReadonlyArray<SnakeState>
  readonly items: ItemsByCell
  readonly clocks: ReadonlyArray<CentaurTeamClockState>
}
```

`GameState` is the concrete aggregate of the four game-state components. It is the input and output type for `resolveTurn` and is exported so that downstream modules (especially Module 04) use a single canonical shape rather than defining their own aggregates independently. See resolved **01-REVIEW-013**. `items` is the cell-keyed present-items map (§3.2); flat `ItemState` lists — board-generation output, stored previews, active `item_lifetimes` rows — convert via `itemsByCell`. *(Amended per 01-REVIEW-023 resolution.)*

### 3.9 Invariants and Constants

- Wall border is exactly 1 cell thick on every side (01-REQ-008).
- The playable area is `(boardSize − 2) × (boardSize − 2)` inner cells (01-REQ-003, 01-REQ-009).
- Snake starting length is exactly 3 segments, all stacked on the starting cell (01-REQ-020).
- Movement is unconditionally `[newHead] ⧺ body[0 .. len−2]`; growth is a duplicated tail segment appended at the commit of the eating turn, after severing (01-REQ-043, 01-REQ-062).
- `PotionEffect.expiryTurn` is the last turn on which the effect is active; the commit removes it when `currentTurn >= expiryTurn` (resolved 01-REVIEW-003).
- A snake holds at most one active effect per family; a team records at most one rebuild claim per family per turn (01-REQ-028, 01-REQ-047). Stacking is not supported.
- `invulnerabilityLevel(snake) ∈ {-1, 0, +1}` and `isVisible(snake)` are pure O(k≤2) functions over `activeEffects`; they are the only effect reads the interaction rules perform (01-REQ-022, 01-REQ-023, 01-REQ-044c, 01-REQ-044d).
- Disruption of a snapshot debuff-holder cancels that family team-wide; other families are untouched (01-REQ-031). A collector becomes disruptable only from the turn after its debuff is committed (01-REQ-045). Both debuff-holders (invulnerability and invisibility) remain visible — the invisibility-family debuff-holder is explicitly visible to opponents as the targetable weak link for their team's invisibility buff.
- Reference-state resolution (01-REQ-041, Section 2.8): interaction outcomes are pure functions of the snapshot, the surviving moved-head set, and the turn seed; the commit is the sole writer of game state, and no rule observes another rule's committed effect.
- Head-to-head precedence (01-REQ-044d) leaves at most one surviving moved head per cell, so every item is collected by at most one snake per turn.
- `GameState.items` holds only present items, at most one per cell — structurally, because the collection is keyed by cell (01-REQ-007). Consumption is a claim; the commit removes the entry, and the consumption event carries the removed `itemId` (01-REQ-046c, 01-REQ-047).
- `ItemId`s are game-unique and turn-namespaced (01-REQ-078); downstream modules treat them as opaque.
- Turn event ordering within a turn is deterministic: canonical event-class order, then primary-subject `snakeId` ascending (Section 2.11).
- `fertileGroundEnabled(board)` is the canonical runtime predicate for whether food-spawn eligibility restricts to `CellType.Fertile` cells (01-REQ-048). The predicate is derived from the board — not the game config — because `config.orchestration.fertileGround` is not forwarded to STDB; the board's cells are the authoritative record (resolved 01-REVIEW-017). The value is constant for the lifetime of the game since the board is static after generation.

### 3.10 DOWNSTREAM IMPACT Notes

1. **Event schema is closed.** Modules 04, 08, 09 can rely on the nine `TurnEvent` kinds being exhaustive. `snake_died` carries `health_depletion` deaths with their contributing `DamageSource` set; `snake_moved` carries no growth flag — growth is observable via `food_eaten` and the committed body's duplicated tail. `food_eaten` and `potion_collected` carry the consumed item's `itemId`: the data layer stamps `destroyedTurn` on the item's lifetime record from these events alone ([04-REQ-007]). Adding a new kind (or a new `DamageSource`) requires a coordinated change across every consumer and a module-01 version bump.

2. **Effect schema is `PotionEffect { family, state, expiryTurn }`, no source attribution.** Module 04's schema must carry exactly these three fields. Adding back per-stack attribution would require reintroducing stacking. See resolved 01-REVIEW-010 and 01-REVIEW-015.

3. **Board cell encoding is specified, not delegated.** Flat `ReadonlyArray<CellType>` with `y * boardSize + x` indexing is fixed here so that the shared engine codebase (per module 02's principles) is binary-compatible across SpacetimeDB, Convex, and the web clients. Downstream modules must not redefine this.

4. **Sub-seed derivation uses BLAKE3 keyed hashing specifically.** Any consumer of `subSeed()` must import the same BLAKE3 implementation; switching hash algorithms breaks replay reproducibility. This is a hard dependency, not a "pick your favourite hash" situation.

5. **Chess timer arithmetic is specified at the game-rules level** (Section 2.9). Module 04's reducer implementations must match the formulas exactly — in particular the carve-out of the per-turn clock from the budget at turn start (01-REQ-037) and the "credit unspent clock back to budget on early declare" step, both of which are easy to miss.

6. **Turn event ordering is deterministic.** Replay viewers (08, 09) can assume events arrive in canonical event-class order, then primary-subject snakeId order (Section 2.11), and need not re-sort.

7. **`SnakeState` carries no intra-turn bookkeeping fields.** Growth state lives in `body` itself (duplicated tail segment, 01-REQ-062) and team rebuilds are intra-turn claims resolved at commit (01-REQ-047, 01-REQ-050). Module 04's schema must not persist per-snake `ateLastTurn` or `pendingEffects` columns — no such fields exist. (See resolved 01-REVIEW-022.)

8. **`GameState` aggregate shape is exported** (see resolved 01-REVIEW-013). The canonical shape is `{ board: Board, snakes: ReadonlyArray<SnakeState>, items: ItemsByCell, clocks: ReadonlyArray<CentaurTeamClockState> }`. Module 04 must assemble this shape from its SpacetimeDB tables when calling `resolveTurn` — `items` via `itemsByCell` over the active `item_lifetimes` rows — and must destructure it from the result. Module 07 may continue to consume components individually through its simulation layer but should reference the exported `GameState` type for structural alignment.

9. **Rules read the snapshot; the commit is the sole writer.** 01-REQ-033 and 01-REQ-041 are satisfied structurally: interaction and derived rules are pure functions over the snapshot, the surviving moved-head set, and the claim set — never over committed mid-turn state. Downstream modules that implement or extend `resolveTurn` must express every new mechanic as a rule emitting claims resolved at commit; in-place mutation during rule evaluation silently breaks the order-independence guarantees of Section 2.8. (See resolved 01-REVIEW-021 and 01-REVIEW-022.)

10. **Item lifetimes are one historical record each; game state carries present items only.** `GameState.items` never contains consumed items. Module 04's `item_lifetimes` row ([04-REQ-007]) is the lossless spawn-to-destruction record, maintained entirely from events: `food_spawned`/`potion_spawned` insert a row with its `spawnTurn`, and the `itemId` on `food_eaten`/`potion_collected` stamps `destroyedTurn`. Id uniqueness requires no consumed-item bookkeeping — allocation is turn-namespaced (01-REQ-078). (See resolved 01-REVIEW-023.)

---


## REVIEW Items

All REVIEW items for this module (all resolved) have been migrated to [`01-game-rules.review.md`](review/01-game-rules.review.md).
