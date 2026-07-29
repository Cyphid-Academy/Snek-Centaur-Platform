## Purpose

The bot explains itself: how a team's automated decision-making becomes
something an operator can see, trust, and later replay. This capability
owns the recorded decision surface — the per-snake computed display state
and what it must carry, the publication contract over it (the team's
hosting server as sole writer, full-snapshot semantics, unthrottled
cadence), and the standardized recorded-output slots that keep even novel
bot logic producing replayable data — and the live displays rendered from
that surface: score-coloured direction affordances, the worst-case world
preview, and the per-direction decision breakdown, together with the
client-local examined selection that decides which snake and direction
those displays explain. Everything shown is read from what was published;
nothing is ever recomputed on the consumer side, and nothing the displays
need is joined from state that may have moved since the snapshot was
written. Producing the decision state — scoring, worst-case aggregation,
the dirty flag — belongs to the bot framework; the staging affordances
these displays decorate, and who holds a snake, belong to operator
control; when decided moves are submitted belongs to the pacing story;
the post-game consumption of the recorded slots belongs to the replay
story.

Depends on: bot-framework, operator-control, global-invariants.

## ADDED Requirements

### Requirement: decision-transparency/computed-display-state
Depends on: bot-framework/worst-case-statemap, bot-framework/frozen-snake-timestamps, bot-framework/per-snake-portfolio, bot-framework/score-composition, bot-framework/total-heuristic-coverage, global-invariants/team-private-centaur-state.

For each snake owned by a hosted team in an active game, the team's Centaur state SHALL persist a **computed display state** record carrying, per candidate direction, at minimum: the direction's current worst-case weighted score — its stateMap entry — the worst-case simulated world that produced the score, carrying its per-snake turn timestamps, and one entry per heuristic the score was composed from, giving the heuristic's display label, its normalised output in that worst-case world, and **the portfolio weight in force at the moment the score was computed**. The record SHALL keep every heuristic it was handed for a direction, at one scoring-time weight per heuristic for the whole snapshot — the producer answers every candidate with every heuristic, so the recorded set is the same under every direction and a snapshot decomposes one portfolio at one moment. The record is team-private recorded deliberation, and it SHALL be self-sufficient: every quantity a consumer needs to decompose the recorded score is inside the snapshot, never resolved against configuration that may have moved since. The recorded worst-case world for a direction SHALL be selected deterministically: among the active worlds achieving the direction's minimum score, ties are broken by a fixed deterministic rule, so identical evaluation state always records the identical world. Directions whose stateMap entry is undefined SHALL be absent from the record — never zero-filled and never carried over.

#### Scenario: #worst-case-world-is-deterministic
- **WHEN** two or more active worlds tie for a direction's minimum score
- **THEN** the recorded worst-case world is picked by the fixed deterministic rule — the same evaluation state never publishes different worlds on different runs, so everything rendered from the record is reproducible from the record alone

#### Scenario: #per-direction-coherence
- **WHEN** a direction's entry is published
- **THEN** its score, its worst-case world, and its heuristic entries all describe that same recorded world — the recorded outputs and their recorded weights decompose exactly the score shown and the world previewed, with the weighted contributions summing to the recorded score, never a different world's or a different moment's numbers

#### Scenario: #weights-and-labels-are-recorded-not-joined
- **WHEN** a heuristic's portfolio weight is changed, or its display label edited, after a snapshot was published
- **THEN** that snapshot keeps the weight and label it recorded — nothing re-resolves them against current configuration, so its contributions still sum to the score it recorded however far the configuration has since moved

#### Scenario: #timestamps-travel-with-the-world
- **WHEN** a recorded worst-case world holds snakes that were frozen rather than freshly advanced
- **THEN** the per-snake turn timestamps distinguishing them are part of the record itself, so any renderer can mark frozen snakes without consulting anything beyond the record

#### Scenario: #the-same-heuristics-under-every-direction
- **WHEN** a snapshot records more than one candidate direction
- **THEN** every direction's entry lists the same heuristics at the same recorded weights, differing only in the outputs their own worst-case worlds produced — the record drops none of what it was handed and every candidate was answered by every heuristic, so a consumer compares one heuristic across the recorded directions without ever inventing a value for a direction that omitted it

### Requirement: decision-transparency/hosting-server-sole-writer
Depends on: bot-framework/embedded-team-player, global-invariants/security-enforced-outside-the-library, global-invariants/one-contract-many-surfaces, global-invariants/authenticated-unambiguous-identity.

A snake's computed display state SHALL be written only by the hosting server of the team that owns the snake — the process the team's automated player runs in. No operator client, no other runtime, and no other team's server ever writes it; sole writership is enforced where every other platform invariant bounding a Server is, not by the framework a team is free to replace. The platform SHALL impose no per-turn or per-second rate limit on these writes: the writing framework alone owns update cadence.

#### Scenario: #only-the-hosting-server-writes
- **WHEN** any identity other than the owning team's hosting server attempts to write a snake's computed display state, from any surface
- **THEN** the write is rejected — the writer's identity and its kind are decidable, so every recorded snapshot in a game's history originates from the owning team's own hosting server

#### Scenario: #cadence-is-the-writers-choice
- **WHEN** the framework publishes a rapid burst of snapshots for one snake within a single turn
- **THEN** every write is accepted — nothing between the framework and the record throttles, samples, or coalesces them, and the record's density is exactly the cadence the framework chose

### Requirement: decision-transparency/snapshot-full-replacement
Depends on: bot-framework/score-composition, bot-framework/selection-promotion.

Every computed-display-state update SHALL be a full snapshot that replaces the snake's record wholesale, independently interpretable with no reference to any prior snapshot, and a snapshot SHALL be published whenever the snake's dirty flag is set. Consumers SHALL treat each update as a complete replacement: never merging a new snapshot into an earlier one, and never back-filling entries absent from the newest snapshot out of older ones.

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
- **WHEN** an operator selects a manual-mode snake and promotion rescoring changes its entries
- **THEN** the resulting dirty flag yields fresh snapshots, and the operator's displays converge on current analysis rather than showing stale leftovers from the unselected tier

### Requirement: decision-transparency/published-slots-only
Depends on: global-invariants/client-truthfulness, bot-framework/author-fault-containment.

The interface SHALL render decision state purely from the published computed display state: it SHALL never re-evaluate any heuristic, never re-run any simulation, and never interpolate or extrapolate values the record does not carry — a score, world, or heuristic output with no published value renders as visibly absent, never as zero and never back-filled. The published slots SHALL be the complete operator-visible decision surface: heuristic contract violations contained by the framework are diagnosed in the hosting server's process log only and have no operator-interface surface.

#### Scenario: #missing-cell-renders-absent
- **WHEN** a direction or heuristic cell has no value in the newest snapshot
- **THEN** a distinct absent indicator renders in its place — the interface never displays a number the framework did not publish

#### Scenario: #no-client-recomputation
- **WHEN** any decision display needs a value
- **THEN** it reads the published record — no heuristic code and no simulation runs on the consumer side, so what the operator sees is exactly what was recorded, and the live view and any later replay of the same snapshot agree

#### Scenario: #violations-stay-in-the-server-log
- **WHEN** an author-supplied heuristic violates its contract during evaluation
- **THEN** the operator's displays are unaffected — they render the published values, substituted ones included — and the diagnosis exists solely in the hosting server's process log

### Requirement: decision-transparency/examined-subject
Depends on: global-invariants/team-private-centaur-state, operator-control/board-and-move-interface.

The decision displays SHALL take their subject from an **examined selection**: at most one snake whose recorded decision state the viewer is authorized to read, and at most one of that snake's candidate directions. The selection SHALL be purely client-local — held only in the viewing client, written to no store or recorded slot, invisible to every other client, and surviving neither reload nor reconnect — and SHALL be independent of who, if anyone, holds the snake. Examining a snake or a direction SHALL never hold, stage, enter manual mode, or alter any state of the game or the team: it selects what is explained, never what is done.

#### Scenario: #examining-is-not-acting
- **WHEN** a viewer examines a direction
- **THEN** nothing is staged, no hold is taken or disturbed, and no mode changes — the displays re-aim and the game is untouched

#### Scenario: #any-readable-snake-is-examinable
- **WHEN** the viewer's read scope covers a snake that no operator holds, or one a teammate holds
- **THEN** it can be examined and every decision display renders for it — holding decides who may act on a snake, never who may have it explained

#### Scenario: #never-persisted
- **WHEN** the viewing client reloads, or another client looks at the same game
- **THEN** the examined selection is simply gone, and absent from the other client — no slot, record, or coordination state ever held it, so there is nothing for a later reader to mistake for a decision the team made

#### Scenario: #operator-pick-also-examines
- **WHEN** the holder of a snake picks a direction on its four-direction staging affordance
- **THEN** that pick both stages the direction and makes it the examined direction — one gesture, so trying a direction and seeing its explanation are not two chores — while examining a direction any other way stages nothing

### Requirement: decision-transparency/scored-direction-display
Depends on: operator-control/board-and-move-interface, operator-control/selection-is-view-only#no-affordances-without-holding.

For the examined snake the interface SHALL display each candidate direction's current score on the board cells adjacent to that snake's head, coloured by score on a monotone ramp; wherever the viewer is also presented that snake's four-direction staging affordance, the same score SHALL appear as its direction labels, coloured consistently with the cells. A direction with no published score SHALL render, in every place it appears, in a distinct neutral state visually distinguishable from every score value.

#### Scenario: #one-ramp-two-surfaces
- **WHEN** a direction's score is displayed on both the board and a staging affordance
- **THEN** the candidate cell's colour and the direction button's label and colour agree — one score, one ramp, two surfaces that never contradict each other

#### Scenario: #neutral-is-not-worst
- **WHEN** a direction has no published score yet
- **THEN** its cell and, where present, its button render the neutral not-yet-computed state — distinguishable from every point on the ramp, so absence never reads as the worst (or any) score

#### Scenario: #display-decorates-never-gates
- **WHEN** no computed display state exists yet for a snake the viewer holds
- **THEN** the staging affordance remains fully usable with its score decoration absent — the transparency layer informs the operator's controls and never disables them

#### Scenario: #cells-need-no-holder
- **WHEN** the examined snake is held by nobody, or by someone other than the viewer
- **THEN** the coloured candidate cells still render for it — only the direction labels are absent, because the affordance carrying them is not presented

### Requirement: decision-transparency/worst-case-preview
Depends on: operator-control/board-and-move-interface.

While a direction is examined for the examined snake, the board SHALL additionally render the recorded worst-case world for that snake and direction: current positions stay rendered solidly, and the worst-case simulated positions render as translucent overlays. The preview SHALL appear the moment the direction becomes the examined one, SHALL update in place as new snapshots are published, and SHALL not render at all when no direction is examined or when no computed display state exists for the snake — the board then shows only the current state.

#### Scenario: #pick-triggers-preview
- **WHEN** the holder of a snake picks a direction on its staging affordance
- **THEN** alongside the staging the pick performs, that direction becomes the examined one and its worst-case preview renders — trying a direction and seeing its pessimistic consequence are one gesture

#### Scenario: #preview-evolves-in-place
- **WHEN** a direction stays examined while evaluation proceeds
- **THEN** each newly published snapshot re-renders the preview from its recorded worst-case world — the viewer watches the pessimistic picture sharpen without re-examining

#### Scenario: #no-record-no-preview
- **WHEN** no direction is examined, or the examined snake has no computed display state yet
- **THEN** no overlay renders and the board shows only the current state — the interface never previews a world it has no record of

### Requirement: decision-transparency/decision-breakdown
Depends on: bot-framework/score-composition, bot-framework/total-heuristic-coverage.

For the examined snake and direction the interface SHALL render a decision breakdown: one row per heuristic the snapshot records, showing at minimum the heuristic's recorded display label, its recorded normalised output in that direction's recorded worst-case world, the portfolio weight recorded alongside that output, the weighted contribution those two give, and that contribution's **relative impact**: the heuristic's weighted contribution for this direction minus the mean of its weighted contributions across every candidate direction the snapshot records. Relative impact is therefore a signed, centred quantity, not a share of the score — a heuristic that contributes the same to every candidate has zero relative impact everywhere, because it says nothing about which move is better. Every quantity in the table SHALL come from the one snapshot being explained — never from the snake's current configuration, and never from another snapshot. The breakdown SHALL update reactively both when new snapshots are published and when the examined direction changes.

#### Scenario: #rows-explain-the-recorded-world
- **WHEN** the breakdown renders for a direction
- **THEN** every row's output, weight, and label are that direction's recorded entry's own — the table decomposes exactly the score and world the other displays show, never a fresher or different evaluation

#### Scenario: #contributions-sum-to-the-recorded-score
- **WHEN** the rows' weighted contributions are added up
- **THEN** they equal the score the same snapshot recorded for that direction — a table that explains a score it does not reproduce would be worse than no table

#### Scenario: #uniform-heuristic-has-zero-relative-impact
- **WHEN** a heuristic's weighted contribution is identical for every candidate direction the snapshot records
- **THEN** its relative impact reads zero on every one of them — a heuristic that scores every candidate alike carries no information about which move is best, and the column exists to say precisely that rather than to award it a share of a score it did not discriminate

#### Scenario: #the-mean-ranges-over-the-snapshots-candidates
- **WHEN** the snapshot records fewer candidate directions than the snake has, the rest having no evaluated score yet
- **THEN** each relative impact is centred on the mean over exactly the directions that snapshot carries — the column is a property of the one snapshot, so a later replay of it computes the same numbers

#### Scenario: #weight-edits-do-not-rewrite-the-past
- **WHEN** an operator changes a heuristic's weight and the breakdown is then rendered for a snapshot published before the change
- **THEN** it shows the weight that snapshot recorded, and still adds up — a later configuration edit never silently restates what the bot was thinking

#### Scenario: #direction-switch-is-a-re-read
- **WHEN** the examined direction changes
- **THEN** the table re-renders immediately from the already-published record — explaining a different direction requires no new computation, no publication, and no game action

#### Scenario: #snapshot-updates-the-open-table
- **WHEN** a new snapshot is published while the breakdown is open
- **THEN** the rows update in place to the new snapshot's outputs, weights, and contributions — the open table is as live as the board

### Requirement: decision-transparency/extensible-state-slots
Depends on: global-invariants/centaur-state-boundary, global-invariants/team-private-centaur-state.

The Centaur-subsystem schema SHALL provide its recorded decision outputs through standardized, bounded slots — the per-snake computed display state record and the append-only action log — and a hosting server running novel bot logic SHALL record its decision and analysis outputs within those fixed slots, so that novel logic produces recorded, replayable data without any per-team change to the schema. The slots are Centaur-subsystem state holding team-private deliberation; that is what lets one platform-wide shape carry every team's novel analysis.

#### Scenario: #novel-bot-same-schema
- **WHEN** a team replaces the stock automated player with its own novel bot logic
- **THEN** that logic's decisions and analysis land in the same two slots every consumer already reads — recorded and replayable with zero schema change for the team

#### Scenario: #no-per-team-slots
- **WHEN** a team wants to record an output shape the slots do not carry
- **THEN** the answer is never a per-team schema addition — the slots' shapes evolve only platform-wide, keeping every team's recorded data uniformly consumable
