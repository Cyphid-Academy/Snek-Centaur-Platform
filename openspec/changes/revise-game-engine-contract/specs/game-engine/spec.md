## MODIFIED Requirements

### Requirement: game-engine/domain-vocabulary
The game SHALL use a closed domain vocabulary: four directions (`Up`/`Right`/`Down`/`Left`), four cell types (`Normal`/`Wall`/`Hazard`/`Fertile`), three item types (`Food`/`InvulnPotion`/`InvisPotion`), potion effects as `(family, state, expiryTurn)` triples over two families (`invulnerability`/`invisibility`) and two states (`buff`/`debuff`), present items as (identity, type, cell), and the snake state shape: `snakeId`, `letter`, `centaurTeamId`, `body` (ordered cells, head first), `health`, `activeEffects`, `lastDirection`, `alive`, `turn` (the turn this snake has advanced to). Game state SHALL carry a current turn, which SHALL be the greatest turn any snake on it has reached. A **partial game state** permits a snake's turn to lag the state's; a **game state** is the case where every alive snake's turn equals the state's, and is the only form a runtime persists — so a game state is a partial game state, and anything accepting the partial form accepts both.

#### Scenario: #closed-sets
- **WHEN** any rule, event, or state refers to a direction, cell type, item type, or potion effect
- **THEN** it uses one of the enumerated values; no other variants exist anywhere in the game

#### Scenario: #derived-values-are-not-stored
- **WHEN** a snake's invulnerability level or visibility is needed
- **THEN** it is computed on demand from `activeEffects`; neither is a stored field of the snake state

#### Scenario: #turns-at-two-grains
- **WHEN** a consumer asks how far behind the state a snake is
- **THEN** it subtracts the snake's turn from the state's — the turn is absolute on both, never a staleness counter, because staleness is a fact about a comparison whose other operand changes as a search descends

#### Scenario: #lockstep-is-the-game-state-invariant
- **WHEN** a partial game state is narrowed to a game state
- **THEN** it succeeds only if every alive snake's turn equals the state's, and the narrowing is the sole way to obtain the persisted form — so a caller that left a snake behind cannot produce it

### Requirement: game-engine/board-geometry
The engine SHALL take the board as fully specified data: a square grid of `boardSize × boardSize` cells, each carrying its own terrain, held as one flat row-major array in which the cell at `(x, y)` is the entry at index `y × boardSize + x`. The grid's own dimensions SHALL be the whole statement of the board's size, and the snakes placed on it the whole statement of how many each team fields — the engine reads no size, count, density, or clustering from configuration, and no rule of a turn consults how the board came to look as it does. The **playable area** is the `(boardSize − 2)²` inner cells, those off the outermost 1-cell ring, and is the area within which items may spawn. A cell beyond the grid's edge SHALL be treated exactly as a `Wall` cell is. Terrain SHALL be fixed for the whole game: no rule changes any cell's type, so hazard and fertile designations made before the first turn are permanent, and the board handed to one resolution is the board every later resolution sees.

#### Scenario: #dimensions-state-the-size
- **WHEN** a rule needs the board's edge length or a team's snake count
- **THEN** it reads the grid and the placed snakes — the same board resolves identically however it was produced, which is what lets a hand-authored state and a generated one be the same kind of input

#### Scenario: #row-major-addressing
- **WHEN** a cell is addressed by coordinates
- **THEN** it is the entry at `y × boardSize + x` of the flat array, one encoding shared by every runtime that holds a board

#### Scenario: #playable-interior
- **WHEN** the playable area is needed — for a spawn location, or to decide whether a cell is an inner one
- **THEN** it is the `(boardSize − 2)²` cells off the outermost ring, excluded by position rather than by what terrain that ring happens to carry

#### Scenario: #off-board-is-wall
- **WHEN** a moved head leaves the grid
- **THEN** the outcome is the one a `Wall` cell produces — so a complete wall ring is a convention of the boards handed in, not a precondition the rules rest on, and a board without one still resolves correctly

#### Scenario: #terrain-is-fixed
- **WHEN** the game progresses
- **THEN** no cell's type ever changes: the set of Hazard cells and the set of Fertile cells are the ones the board arrived with

### Requirement: game-engine/determinism
All randomness in a turn's resolution SHALL be deterministic from that turn's seed, itself derived from the per-game seed, and no seed SHALL be accessible to any game client. A resolution SHALL be a function of its declared inputs alone: the state it resolves, the directions it is given, its turn seed, and the timings declared for the turn. Time is one of those inputs rather than something the engine observes, so a resolution's dependence on real time is entirely a dependence on values its caller supplied.

#### Scenario: #reproducibility
- **WHEN** a game is replayed from the same initial state, the same seed, the same staged moves, and the same declared turn timings
- **THEN** every state, spawn, and outcome is identical

#### Scenario: #time-is-an-input-not-a-reading
- **WHEN** one turn is resolved twice from an identical state, directions, turn seed, and declared timings
- **THEN** the two resolutions agree in every respect, including whether the game ended on time — the tuple grew by two quantities and stayed closed, which is why a limit measured in real time can be an ordinary rule of the game without any resolution ever consulting a clock

#### Scenario: #secrecy
- **WHEN** any client (operator, bot, or spectator) reads game state
- **THEN** neither the game seed nor any turn seed is observable

### Requirement: game-engine/turn-resolution-model
Resolution SHALL run in fixed stages: move projection, head-to-head precedence, interaction rules, derived rules, commit, item spawning, win-condition check, event derivation. Every rule reads only the start-of-turn snapshot (plus the surviving moved-head set from head-to-head precedence, and — for derived rules — interaction-rule claims); the commit is the sole writer of game state.

The engine SHALL offer two entry points over that one stage list. **Imagining moves** takes a partial game state, explicit directions for a caller-chosen subset of its alive snakes, and the remainder held, and yields a partial game state with its events. **Advancing a turn** takes a game state and staged moves, resolves every alive snake's direction by the movement rules, imagines exactly those moves with nothing held, and yields a game state. Item spawning and the win-condition check SHALL run only when every alive snake's turn equals the state's current turn — a condition on the state alone, independent of which entry point was called and of what the caller supplied. Imagining moves MAY be given a turn seed, and uses it only where a stage that runs requires one, so a caller that wants seeded stages can have them the moment the state is caught up.

Both entry points SHALL require the timings of the turn being resolved: how long the turn lasted, and how much of its own clock each team burned on it. They are declared inputs of the call, like the directions and the turn seed, and they are the **only** channel by which elapsed time reaches committed state — the movements they drive land at the commit, together with everything else the turn commits, and only when the state's current turn advances.

#### Scenario: #snapshot-purity
- **WHEN** any rule evaluates during a turn
- **THEN** nothing committed during that same turn is observable to it — effects gained, cancelled, or expired at this commit first influence the next turn

#### Scenario: #order-independence
- **WHEN** the rules within the interaction stage or the derived stage are evaluated in any order or concurrently
- **THEN** every outcome is identical

#### Scenario: #imagining-moves-yields-a-partial-state
- **WHEN** moves are imagined with one or more snakes held
- **THEN** the result is a partial game state that will not narrow, so the hypothetical cannot be mistaken for, or persisted as, the game's actual state

#### Scenario: #advancing-is-imagining-with-nothing-held
- **WHEN** a turn is advanced over a game state
- **THEN** the state and events are identical to imagining the same complete set of directions and the same timings with nothing held, then spawning and checking the outcome — one rule set, reached two ways

#### Scenario: #spawning-and-outcome-need-lockstep
- **WHEN** a resolution leaves any alive snake behind the state's current turn
- **THEN** no item spawns and no outcome is reported, whether or not a seed was supplied: eligible spawn cells are those unoccupied by any alive body and the eligible set determines where items land, so a mixed-turn board would place items where the real game cannot, and aggregate body length would compare snakes from different turns

#### Scenario: #time-enters-a-turn-once
- **WHEN** a resolution applies the timings it was given
- **THEN** the team clocks and the game's consumed duration move here and nowhere else — a caller that moved them between turns would leave the time a turn committed and the time its outcome was decided on free to disagree, which is the one disagreement a limit measured in real time cannot survive

#### Scenario: #a-turn-nobody-took-charges-nothing
- **WHEN** every alive snake is held, so the state's current turn does not advance
- **THEN** no clock moves and no duration accumulates, whatever timings were declared — time is charged per turn taken, which is what keeps holding everything the no-op it already was rather than a way to burn a team's clock down for free

### Requirement: game-engine/movement
All alive snakes taking a turn SHALL move simultaneously, and advancing a turn SHALL have every alive snake take it — only a hold excuses a snake from moving, and only while moves are being imagined. Direction, when advancing a turn: the staged move if any; else `lastDirection` unconditionally, even into a lethal cell; else (turn 0 with nothing staged) a seeded-random direction, also unconstrained by lethality. Imagining moves SHALL apply no fallback: a direction is supplied for every snake taking the turn. The moved body advances the head one cell and drops the final tail segment; `lastDirection` updates to the direction moved.

#### Scenario: #direction-precedence
- **WHEN** a snake has a staged move, or none but a prior direction, or neither
- **THEN** it moves the staged direction, or repeats `lastDirection`, or moves a seeded-random direction respectively

#### Scenario: #fallback-belongs-to-advancing-a-turn
- **WHEN** moves are imagined and a snake taking the turn has no direction supplied
- **THEN** nothing is inferred from `lastDirection` or drawn from a seed — a hypothetical never invents a snake's choice, because inventing one is the false assumption the second entry point exists to avoid

#### Scenario: #no-steering-assistance
- **WHEN** the repeated or random direction leads into a wall or a body
- **THEN** the snake moves there anyway and dies by the collision rules

#### Scenario: #body-advance
- **WHEN** move projection runs
- **THEN** each moved body is `[newHead] ⧺ body[0 .. len−2]` unconditionally — growth never skips the tail drop; it is represented by tail duplication at commit

### Requirement: game-engine/chess-timer
Each team SHALL have a persistent millisecond time budget: `initialBudget` at game start, incremented by `budgetIncrement` each turn. At each turn start, `min(cap, budget)` moves from the budget onto the team's per-turn clock — the cap is `firstTurnTime` on turn 0 and `maxTurnTime` afterwards — so total remaining time is always `budget + perTurnClock`. Declaring turn over returns the unused clock to the budget; a clock reaching zero auto-declares; turn resolution commences when every team has declared.

A turn's resolution SHALL apply the time the turn is declared to have cost, in this order and all within the one commit: each team's declared burn is spent from its per-turn clock — a burn exceeding what that clock holds spends the clock and no more — the unspent remainder returns to the budget; every competing team then left with no remaining time at all SHALL have each of its snakes still alive at that commit die (`clock_exhaustion`); and only after that does the next turn's increment and carve-out follow. Running out of time is therefore a cause of death and not an ending of its own, and the increment is not a floor beneath a team: a team that burns the whole of its remaining time on one turn reaches zero before the next turn's increment ever arrives. The game SHALL additionally carry the wall-clock duration it has consumed, advanced at that commit by the turn's declared duration. A team's burn and the turn's duration are distinct quantities: the turn lasts until its last declaration while a team that declared early burned less, and the teams' clocks run concurrently, so no aggregate of the burns is the turn's length.

#### Scenario: #carve-out-arithmetic
- **WHEN** a turn starts with budget B and cap C
- **THEN** the clock holds `min(C, B)`, the budget holds `B − min(C, B)`, and their sum is unchanged

#### Scenario: #declaration-banks-the-remainder
- **WHEN** a team declares turn over with time left on its clock
- **THEN** that remainder returns to its budget and the clock stops

#### Scenario: #expiry-declares-automatically
- **WHEN** a team's clock reaches zero
- **THEN** its turn is declared over without action, and resolution starts once all teams have declared

#### Scenario: #burn-is-not-the-turns-length
- **WHEN** one team declares two seconds into a turn and another ten seconds into it
- **THEN** each team's clock is charged its own burn while the game's consumed duration grows by the turn's own length — one number cannot serve both, so collapsing them would either credit a slow team with a fast team's economy or bill the game for time no clock spent

#### Scenario: #only-a-resolution-moves-a-budget
- **WHEN** a team's remaining time is read between two turns
- **THEN** it is exactly what the last resolution committed: the arithmetic runs once, at a commit, from a declared burn, so no separately ticked copy of a budget exists to disagree with the committed one

#### Scenario: #exhaustion-kills-the-teams-snakes
- **WHEN** a competing team's per-turn clock and budget are both empty once its declared burn has been spent and the remainder banked
- **THEN** every one of its snakes still alive at that commit dies, and nothing else follows from the clock: whether the game is over is decided from the state the commit leaves, on exactly the terms that decide it after any other cause of death. A clock that merely reached zero while the budget still holds time is the ordinary expiry that ends only the turn

#### Scenario: #the-increment-is-not-a-floor
- **WHEN** a team spends the entirety of its remaining time on one turn rather than declaring early, in a game whose per-turn increment is positive
- **THEN** it is at zero when exhaustion is judged, because the increment and carve-out are applied only afterwards — the arrival of more time next turn is what a team that survives this one gets, not a reason it cannot run out

### Requirement: game-engine/game-end-conditions
The game SHALL end at the end of the turn whose commit leaves at most one competing team with a living snake — last-team-standing (one team survives) or simultaneous elimination (none does); at the end of the turn in which the configured `maxTurns` is reached; or at the end of the turn whose commit takes the game's consumed duration to the configured `maxGameDurationMs`. `maxTurns` of 0 or absent means no turn limit, and `maxGameDurationMs` of 0 or absent means no duration limit. Every condition SHALL be evaluated against each turn's committed state and the first met SHALL end the game, so the duration limit is an ordinary end condition rather than a second kind of ending: the time a turn cost is one of the resolution's declared inputs, and the total it moves is committed state like any other. A team left with no remaining time is not an ending here at all — its snakes die at that commit and the elimination conditions then decide, exactly as they do for any other cause of death. Where an elimination condition and a limit are both met at one commit the game still ends once, and the elimination is the ending: it says what became of the game, while a limit only says a game still in progress may run no further.

#### Scenario: #last-team-standing
- **WHEN** only one competing team still has a living snake after commit
- **THEN** the game ends at the end of that turn

#### Scenario: #simultaneous-elimination-including-turn-0
- **WHEN** every remaining alive snake dies in the same turn — even the first
- **THEN** the game ends at the end of that turn

#### Scenario: #turn-limit-and-no-limit
- **WHEN** `maxTurns` is reached, or is 0/absent
- **THEN** the game ends at the end of that turn, or runs on until an elimination or the duration limit, respectively

#### Scenario: #a-team-out-of-time-ends-nothing-by-itself
- **WHEN** a competing team is left with no remaining time at all and its snakes die at that commit
- **THEN** the game ends at that commit only if what the deaths leave behind meets an elimination condition — with three teams left it carries on with two, and with two it ends by last-team-standing on that condition's terms, so there is no ending that names the clock and nothing to reconcile with the limits

#### Scenario: #the-first-condition-met-ends-the-game
- **WHEN** a game is configured with both a turn limit and a duration limit, or an elimination arrives at a commit that also reaches a limit
- **THEN** the earlier commit is the one that ends it, and a commit meeting several conditions ends it once — an elimination present at that commit is the ending, and the limits are silent

#### Scenario: #the-duration-limit-is-an-ending-like-any-other
- **WHEN** the game's consumed duration reaches a positive `maxGameDurationMs` at a commit
- **THEN** the game ends at the end of that turn and the final turn resolves exactly as any other — and a reader recomputes this ending from the record just as it recomputes the turn limit, because the duration the game consumed is committed state rather than a measurement only the thing that took it remembers

### Requirement: game-engine/scoring
A team's **standing score** at any turn SHALL be its normalised body-share times the number of competing teams: `score(team) = (alive_segments_owned / total_alive_segments) × competing_teams`, with par exactly `1.0` for a proportional share. Forfeited teams are excluded from all terms and score `0` (if every team forfeited, all score `0`). A team's **final score** is its standing score at the game's last turn with the ending-specific adjustments applied: the last-standing survivor scores `1.0 × competing_teams` and eliminated teams `0`; at simultaneous elimination, teams alive at the final turn's start score `1.0` and earlier-eliminated teams `0`. Highest final score wins; ties produce a draw.

#### Scenario: #proportional-par
- **WHEN** three competing teams hold equal living segment counts at the turn limit
- **THEN** each scores exactly 1.0 and the game is a draw

#### Scenario: #forfeit-exclusion
- **WHEN** one of three teams forfeits
- **THEN** it scores 0 and the survivors' scores are computed over 2 competing teams

#### Scenario: #standing-score-at-any-turn
- **WHEN** a standing score is taken partway through a game
- **THEN** every competing team has one, from the same formula the final score is built on — so a mid-game figure and the figure the game is decided by can never be two different calculations

#### Scenario: #ending-specific-scores
- **WHEN** the game ends by survival, simultaneous elimination, the turn limit, or the duration limit
- **THEN** scores follow the ending's rule above, and any tie at the top is a draw

#### Scenario: #running-out-of-time-needs-no-adjustment
- **WHEN** a team's snakes all die because it was left with no remaining time
- **THEN** it is scored as any other team whose snakes died at that commit — `0` if those deaths ended the game by an elimination, and otherwise its plain standing score, which holds no living segment and is therefore `0` for as long as the game runs on. Nothing here reads the clock, because the clock's whole effect on the game was the deaths it caused

#### Scenario: #the-duration-limit-faults-nobody
- **WHEN** the game ends on its duration limit
- **THEN** every competing team simply scores its standing score at that turn — the limit is a bound on the game rather than a fault of any team

### Requirement: game-engine/turn-events
Each turn SHALL emit a closed set of events sufficient to reconstruct and narrate the turn: movements (with who staged them), deaths (cause — including contributing damage sources for starvation — killer where applicable, and location), severs, food consumption and potion collection (each carrying the consumed item's identity; potion collection also the collector and affected teammates), spawns, effect applications, effect cancellations, and hazard damage taken by a snake that survived the turn (carrying the snake, the damage applied, and the cell).

#### Scenario: #every-significant-outcome-is-an-event
- **WHEN** any turn resolves
- **THEN** each movement, death, sever, consumption, collection, spawn, effect change, and survived hazard damage appears as exactly one typed event from the closed set

#### Scenario: #deterministic-order
- **WHEN** the same turn resolves twice from an identical snapshot, staged moves, turn seed, and declared timings
- **THEN** the emitted event sequence is identical

#### Scenario: #hazard-damage-is-announced
- **WHEN** a snake's moved head lands on a Hazard cell and it survives the turn
- **THEN** the turn carries a hazard-damage event for it, so a consumer learns why its health fell without diffing successive snapshots; a snake the damage kills reports through its death event instead, which already carries contributing damage sources, so one act never produces two events

### Requirement: game-engine/configuration-parameters
Game configuration SHALL comprise exactly these parameters — every one of them a parameter of a game already under way — with these ranges, defaults, and disable sentinels:

| Parameter | Range | Default | Sentinel |
|---|---|---|---|
| `maxHealth` | 1–500 | 100 | |
| `maxTurns` | 0 or 1–1000 | 100 | 0 = no turn limit |
| `maxGameDurationMs` | 0 or 1000–86400000 | 0 | 0 = no time limit |
| `hazardDamage` | 1–100 | 15 | |
| `foodSpawnRate` | 0–5 | 0.5 | 0 = no food spawns |
| `invulnPotionSpawnRate` | 0–0.2 | 0.15 | 0 = no invulnerability potions |
| `invisPotionSpawnRate` | 0–0.2 | 0.1 | 0 = no invisibility potions |
| `clock.initialBudgetMs` | 0–600000 | 60000 | 0 = no initial budget |
| `clock.budgetIncrementMs` | 100–5000 | 500 | |
| `clock.firstTurnTimeMs` | 1000–300000 | 60000 | |
| `clock.maxTurnTimeMs` | 100–300000 | 10000 | |

The vocabulary SHALL carry no parameter describing how a board is built — no edge length, snake count, hazard proportion, fertile density or clustering — because the engine is handed a board rather than a recipe for one, and a parameter it never reads is a parameter it must not declare. Numeric bounds SHALL be enforced by the user-facing configuration surfaces; the game engine itself accepts any type-valid configuration. `maxGameDurationMs` bounds the wall-clock duration a game may consume and is a dynamic gameplay parameter like the clock values — declared here so that one declaration serves every surface and every runtime, and evaluated here too, against the durations declared to the engine's own resolutions.

#### Scenario: #disable-sentinels
- **WHEN** `maxTurns`, `maxGameDurationMs`, `foodSpawnRate`, or a potion spawn rate is 0
- **THEN** the corresponding feature is fully disabled (no turn limit, no time limit, no spawns of that kind)

#### Scenario: #bounds-live-at-the-surfaces
- **WHEN** a value outside a documented range (e.g. `hazardDamage` outside 1–100) reaches the engine
- **THEN** the engine does not reject it on range grounds — rejection is the configuration surfaces' job

#### Scenario: #no-parameter-the-engine-does-not-read
- **WHEN** a parameter is proposed for this vocabulary
- **THEN** it belongs only if a turn's resolution reads it: whatever shapes the board before the first turn is declared by whoever builds the board, so the two sets are disjoint and no surface has to guess which half the engine wants

#### Scenario: #cross-runtime-expressibility
- **WHEN** the configuration schema evolves
- **THEN** every field remains expressible identically in all three runtimes' type systems: plain numbers (no bigint), no optional or null fields (zero sentinels encode disabled features), string-literal enums, milliseconds for time values

### Requirement: game-engine/runtime-portability
The engine SHALL depend only on portable ECMAScript facilities and SHALL take all nondeterminism and external input as explicit parameters — using no ambient clock, randomness, I/O, or runtime-specific API — so that a single build runs unchanged in any conformant JavaScript runtime.

#### Scenario: #no-ambient-nondeterminism
- **WHEN** the engine needs randomness or the current time
- **THEN** it reads them from explicit inputs (the `Rng` state, the game seed, the configuration, and the timings declared for the turn being resolved), never from host facilities such as `Date.now` or `crypto`

#### Scenario: #no-runtime-specific-api
- **WHEN** the same engine build is loaded into a different conformant JavaScript runtime
- **THEN** it runs unchanged, relying on no Node-, browser-, or host-specific API

## REMOVED Requirements

### Requirement: game-engine/hazards

### Requirement: game-engine/fertile-ground

### Requirement: game-engine/starting-placement

### Requirement: game-engine/initial-snakes

### Requirement: game-engine/initial-food

### Requirement: game-engine/board-generation-retry

## ADDED Requirements

### Requirement: game-engine/held-snakes
A snake **held** for a resolution SHALL not move: its body is unchanged, its turn does not advance, and no movement event is emitted for it. A hold SHALL suspend that snake's own turn and nothing more. Its body SHALL remain on the board as an obstacle including its head, since a head standing still is an occupied cell like any other segment. It SHALL contest nothing — taking no part in head-to-head precedence, entering no cell, consuming no item. What a turn does to it SHALL divide on one line: whatever is determined regardless of how the snake would have moved SHALL apply, and whatever its own movement could have changed SHALL NOT. Its potion effects therefore expire on schedule against the state's current turn, because that timer runs on turns rather than on the snake; its health takes no tick and is not resolved, because a snake that moved could have eaten. What other snakes' actions do to it SHALL apply unchanged.

#### Scenario: #a-held-body-is-an-obstacle-including-its-head
- **WHEN** a moving snake enters a cell occupied by a held snake's head
- **THEN** it dies by body collision — a stationary head is an occupied cell, not a contested one

#### Scenario: #a-held-snake-contests-nothing
- **WHEN** a moving snake's head enters any cell a held snake occupies
- **THEN** head-to-head precedence never applies, so invulnerability and length decide nothing here: the mover collided with something that never moved

#### Scenario: #a-hold-suspends-the-snakes-own-turn
- **WHEN** a snake is held through a resolution
- **THEN** it takes no tick damage and its health is not resolved — holding a snake at one health does not starve it, because a snake allowed to move might have reached food, and a death the hold invented would clear an obstacle the real game keeps

#### Scenario: #timers-do-not-pause-for-a-hold
- **WHEN** a held snake's potion effect is due to expire at the turn being resolved
- **THEN** it expires: the timer is a fact about the turn, not about the snake, so nothing the snake might have done could have changed it and withholding the expiry would model an uncertainty that does not exist

#### Scenario: #a-held-snakes-team-still-spends-its-time
- **WHEN** every snake of a team is held through a resolution that advances the turn
- **THEN** the burn declared for that team is spent from its clock all the same, and if that leaves the team with no remaining time its held snakes die with the rest — the time a turn cost is a fact about the turn on the same terms as an expiry, and a hold that stopped a team's clock would hand a search a free reprieve from the deaths it is meant to see coming

#### Scenario: #a-hold-does-not-shield-the-snake
- **WHEN** a teammate collects a potion whose effects reach a held snake
- **THEN** the held snake receives them, and the collection event's affected-teammate list is what it would be had nobody been held — a hold suspends the snake's turn, not the world's effect on it

#### Scenario: #holding-is-an-input-not-a-correction
- **WHEN** a snake is held and another snake moves through cells the held snake would have vacated had it advanced
- **THEN** the outcome follows from where the held body actually is. Resolving with the snake advanced and restoring its body afterwards would record events for a board that never existed

#### Scenario: #a-held-tail-is-impassable
- **WHEN** a moving snake enters the cell a held snake's tail occupies — a legal follow in lockstep, where the tail vacates as it moves
- **THEN** it dies by body collision. Even had the held snake been simulated its tail might not have vacated, because a snake that reaches food keeps its final segment, and a resolution that will not model a snake must not assume the outcome that happens to be convenient

### Requirement: game-engine/hypothetical-resolution-failure
Imagining moves SHALL yield either a partial game state or a failure, never a partial answer alongside one. It SHALL fail rather than resolve when an alive snake is given neither a direction nor a hold, when a snake whose turn lags the state's is asked to move, or when the input could not have arisen — a direction supplied for a held snake, a held snake that is not alive, a declared duration or burn that is not a non-negative length of time, or a state that is not structurally valid. A failure SHALL name the snake and the kind of refusal.

#### Scenario: #every-snake-needs-a-disposition
- **WHEN** an alive snake is neither given a direction nor held
- **THEN** the resolution fails: nothing is inferred from its last direction, because a silently invented direction is exactly the false assumption this entry point exists to avoid, and the caller is least likely to look for it here

#### Scenario: #only-holds-may-lag
- **WHEN** a snake whose turn is behind the state's is asked to move
- **THEN** the resolution fails — advancing a snake held through earlier turns would need interactions that already committed to be re-resolved, and refusing is the conservative answer for a caller searching for a worst case

#### Scenario: #impossible-input-is-refused
- **WHEN** the input contradicts itself or describes a state the game could not produce
- **THEN** the resolution fails rather than resolving over it, so a malformed hypothetical never reads as a sound one

#### Scenario: #holding-everything-is-a-no-op-not-a-failure
- **WHEN** every alive snake is held
- **THEN** the resolution succeeds and returns the state unchanged. This needs no special case: the current turn is the greatest turn any snake has reached, so with nothing advanced it does not move either, and the state that comes back is the state that went in
