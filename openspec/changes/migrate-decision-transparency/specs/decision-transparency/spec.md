## Purpose

The bot explains itself: how a team's automated decision-making becomes
something an operator can see, trust, and later replay. This capability
owns the recorded decision surface — the per-snake computed display state
and what it must carry, the publication contract over it (the team's
hosting server as sole writer, full-snapshot semantics, unthrottled
cadence), and the standardized recorded-output slots that keep even novel
bot logic producing replayable data — and the live displays rendered from
that surface: score-coloured direction affordances, the worst-case world
preview, and the per-direction decision breakdown. Everything shown is
read from what was published; nothing is ever recomputed on the consumer
side. Producing the decision state — scoring, worst-case aggregation, the
dirty flag — belongs to the bot framework; the staging affordances these
displays decorate, and who holds a snake, belong to operator control; when
decided moves are submitted belongs to the pacing story; the post-game
consumption of the recorded slots belongs to the replay story.

Depends on: bot-framework, operator-control.

## ADDED Requirements

### Requirement: decision-transparency/computed-display-state
For each snake owned by a hosted team in an active game, the team's Centaur state in Convex SHALL persist a **computed display state** record carrying, per candidate direction, at minimum: the direction's current worst-case weighted score — its stateMap entry (bot-framework/worst-case-statemap) — the worst-case simulated world that produced the score, carrying its per-snake turn timestamps (bot-framework/frozen-snake-timestamps), and the per-heuristic normalised outputs in that worst-case world. The recorded worst-case world for a direction SHALL be selected deterministically: among the active worlds achieving the direction's minimum score, ties are broken by a fixed deterministic rule, so identical evaluation state always records the identical world. Directions whose stateMap entry is undefined SHALL be absent from the record — never zero-filled and never carried over.

#### Scenario: #worst-case-world-is-deterministic
- **WHEN** two or more active worlds tie for a direction's minimum score
- **THEN** the recorded worst-case world is picked by the fixed deterministic rule — the same evaluation state never publishes different worlds on different runs, so everything rendered from the record is reproducible from the record alone

#### Scenario: #per-direction-coherence
- **WHEN** a direction's entry is published
- **THEN** its score, its worst-case world, and its heuristic outputs all describe that same recorded world — the outputs decompose exactly the score shown and the world previewed, never a different world's numbers

#### Scenario: #timestamps-travel-with-the-world
- **WHEN** a recorded worst-case world holds snakes that were frozen rather than freshly advanced
- **THEN** the per-snake turn timestamps distinguishing them are part of the record itself, so any renderer can mark frozen snakes without consulting anything beyond the record

### Requirement: decision-transparency/hosting-server-sole-writer
A snake's computed display state SHALL be written only by the hosting server of the team that owns the snake — the process the team's automated player runs in (bot-framework/embedded-team-player). No operator client, no other runtime, and no other team's server ever writes it. The platform SHALL impose no per-turn or per-second rate limit on these writes: the writing framework alone owns update cadence.

#### Scenario: #only-the-hosting-server-writes
- **WHEN** any identity other than the owning team's hosting server attempts to write a snake's computed display state
- **THEN** the write is rejected — every recorded snapshot in a game's history originates from the owning team's own hosting server

#### Scenario: #cadence-is-the-writers-choice
- **WHEN** the framework publishes a rapid burst of snapshots for one snake within a single turn
- **THEN** every write is accepted — nothing between the framework and the record throttles, samples, or coalesces them, and the record's density is exactly the cadence the framework chose

### Requirement: decision-transparency/snapshot-full-replacement
Every computed-display-state update SHALL be a full snapshot that replaces the snake's record wholesale, independently interpretable with no reference to any prior snapshot, and a snapshot SHALL be published whenever the snake's dirty flag is set (bot-framework/score-composition). Consumers SHALL treat each update as a complete replacement: never merging a new snapshot into an earlier one, and never back-filling entries absent from the newest snapshot out of older ones.

#### Scenario: #any-snapshot-stands-alone
- **WHEN** a single recorded snapshot is read in isolation — long after the game, with no neighbouring snapshots at hand
- **THEN** it renders completely on its own; nothing in it is a delta against history that might be unavailable

#### Scenario: #absence-is-meaningful
- **WHEN** a direction present in the previous snapshot is absent from the newest one
- **THEN** it renders absent — the framework deliberately withdrew it, and resurrecting the old value would display decision state that no longer exists

#### Scenario: #dirty-flag-drives-publication
- **WHEN** rescoring changes a snake's stateMap and sets its dirty flag
- **THEN** a fresh full snapshot is published — the display surface receives news whenever there is news, without waiting on any submission or turn event

#### Scenario: #selection-converges-the-display
- **WHEN** an operator selects a manual-mode snake and promotion rescoring changes its entries (bot-framework/selection-promotion)
- **THEN** the resulting dirty flag yields fresh snapshots, and the operator's displays converge on current analysis rather than showing stale leftovers from the unselected tier

### Requirement: decision-transparency/published-slots-only
The interface SHALL render decision state purely from the published computed display state: it SHALL never re-evaluate any heuristic, never re-run any simulation, and never interpolate or extrapolate values the record does not carry — a score, world, or heuristic output with no published value renders as visibly absent, never as zero and never as a stale earlier value. The published slots SHALL be the complete operator-visible decision surface: heuristic contract violations contained by the framework (bot-framework/author-fault-containment) are diagnosed in the hosting server's process log only and have no operator-interface surface.

#### Scenario: #missing-cell-renders-absent
- **WHEN** a direction or heuristic cell has no value in the newest snapshot
- **THEN** a distinct absent indicator renders in its place — the interface never displays a number the framework did not publish

#### Scenario: #no-client-recomputation
- **WHEN** any decision display needs a value
- **THEN** it reads the published record — no heuristic code and no simulation runs on the consumer side, so what the operator sees is exactly what was recorded, and the live view and any later replay of the same snapshot agree

#### Scenario: #violations-stay-in-the-server-log
- **WHEN** an author-supplied heuristic violates its contract during evaluation
- **THEN** the operator's displays are unaffected — they render the published values, substituted ones included — and the diagnosis exists solely in the hosting server's process log

### Requirement: decision-transparency/scored-direction-display
For the operator's held snake (operator-control/exclusive-selection) the interface SHALL display each candidate direction's current score in two mutually consistent places: the board cells adjacent to the snake's head, coloured by score on a monotone ramp, and the score labels on the four-direction staging affordance (operator-control/board-and-move-interface), coloured consistently with the cells. A direction with no published score SHALL render, in both places, in a distinct neutral state visually distinguishable from every score value.

#### Scenario: #one-ramp-two-surfaces
- **WHEN** a direction's score is displayed
- **THEN** the candidate cell's colour and the direction button's label and colour agree — one score, one ramp, two surfaces that never contradict each other

#### Scenario: #neutral-is-not-worst
- **WHEN** a direction has no published score yet
- **THEN** its cell and button render the neutral not-yet-computed state — distinguishable from every point on the ramp, so absence never reads as the worst (or any) score

#### Scenario: #display-decorates-never-gates
- **WHEN** no computed display state exists yet for the held snake
- **THEN** the staging affordance remains fully usable with its score decoration absent — the transparency layer informs the operator's controls and never disables them

### Requirement: decision-transparency/worst-case-preview
While the operator has a direction picked for their held snake, the board SHALL additionally render the recorded worst-case world for that snake and direction: current positions stay rendered solidly, and the worst-case simulated positions render as translucent overlays. The preview SHALL appear with the direction pick (operator-control/board-and-move-interface), SHALL update in place as new snapshots are published, and SHALL not render at all when no direction is picked or when no computed display state exists for the snake — the board then shows only the current state.

#### Scenario: #pick-triggers-preview
- **WHEN** the operator picks a direction on the staging affordance
- **THEN** alongside the staging the pick performs, the worst-case preview for that direction renders — trying a direction and seeing its pessimistic consequence are one gesture

#### Scenario: #preview-evolves-in-place
- **WHEN** the operator leaves a direction picked while evaluation proceeds
- **THEN** each newly published snapshot re-renders the preview from its recorded worst-case world — the operator watches the pessimistic picture sharpen without re-picking

#### Scenario: #no-record-no-preview
- **WHEN** no direction is picked, or the held snake has no computed display state yet
- **THEN** no overlay renders and the board shows only the current state — the interface never previews a world it has no record of

### Requirement: decision-transparency/decision-breakdown
For the operator's held snake the interface SHALL render a per-direction decision breakdown: one row per heuristic active on the snake, showing at minimum the heuristic's name, its raw normalised output in the direction's recorded worst-case world, its current portfolio weight, its weighted contribution to the direction's score, and its relative impact on that score. The breakdown SHALL update reactively both when new snapshots are published and when the operator switches which direction is examined.

#### Scenario: #rows-explain-the-recorded-world
- **WHEN** the breakdown renders for a direction
- **THEN** every row's output is that direction's recorded worst-case world's value — the table decomposes exactly the score and world the other displays show, never a fresher or different evaluation

#### Scenario: #direction-switch-is-a-re-read
- **WHEN** the operator switches which direction is examined
- **THEN** the table re-renders immediately from the already-published record — explaining a different direction requires no new computation or publication

#### Scenario: #snapshot-updates-the-open-table
- **WHEN** a new snapshot is published while the breakdown is open
- **THEN** the rows update in place to the new snapshot's outputs and contributions — the open table is as live as the board

### Requirement: decision-transparency/extensible-state-slots
The Centaur-subsystem schema SHALL provide its recorded decision outputs through standardized, bounded slots — the per-snake computed display state record and the append-only action log — and a hosting server running novel bot logic SHALL record its decision and analysis outputs within those fixed slots, so that novel logic produces recorded, replayable data without any per-team change to the schema.

#### Scenario: #novel-bot-same-schema
- **WHEN** a team replaces the stock automated player with its own novel bot logic
- **THEN** that logic's decisions and analysis land in the same two slots every consumer already reads — recorded and replayable with zero schema change for the team

#### Scenario: #no-per-team-slots
- **WHEN** a team wants to record an output shape the slots do not carry
- **THEN** the answer is never a per-team schema addition — the slots' shapes evolve only platform-wide, keeping every team's recorded data uniformly consumable
