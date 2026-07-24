# visual-tester Specification

## Purpose

The dedicated visual testing application for the game rules: board-state
editing, manual move staging, engine-driven turn simulation with in-memory
session history, and management and replay of saved Test Sequences with
discrepancy annotation. A development tool for humans vetting resolver
behaviour — never part of the player- or operator-facing platform.

Depends on: game-engine, test-sequences. Consumed by: (none — leaf
capability).

## Requirements

### Requirement: visual-tester/dedicated-app
The visual tester SHALL be a dedicated application for game-engine testing, separate from every player- and operator-facing surface, and SHALL advance turns exclusively through the shared engine's turn resolver — never through a reimplementation or approximation of any game rule.

#### Scenario: #engine-is-authoritative
- **WHEN** the tool simulates a turn or runs a Test Sequence
- **THEN** the next state, events, and outcome come from the shared engine's resolver invoked on the exact edited inputs, so tool behaviour and platform behaviour cannot drift apart

#### Scenario: #isolated-from-product-surfaces
- **WHEN** the platform's player- or operator-facing applications are built or deployed
- **THEN** the visual tester is not part of them and nothing in them depends on it

### Requirement: visual-tester/board-editor
The tool SHALL provide a map editor over every authorable component of game state: per-cell terrain (Hazard/Fertile/Normal within the fixed Wall ring per game-engine/board-geometry), board size, snakes (add/remove, team, ordered body cells of any length ≥ 1, health, active effects; the letter is derived, see #letters-auto-assigned), items (place/remove any item type on any cell not occupied by a snake body; placing over an existing item replaces it), the runtime game configuration, and the game seed. A fresh session with no loaded sequence SHALL always start with a valid game seed and a board, so editing and board generation are immediately available without any manual setup. Two snake fields are lifecycle-derived and never directly editable: a snake present in the editor is alive — death arises only from turn resolution — and last direction is null in a hand-authored state, otherwise the direction the snake last moved. The editor SHALL permit any structurally valid state — including states board generation would never produce — enforcing only structural validity: in-bounds cells, the closed domain vocabulary per game-engine/domain-vocabulary, snake-body contiguity (each consecutive segment pair orthogonally adjacent or sharing a cell, the only shapes producible under game-engine/movement), and shared head parity (see #head-parity-enforced).

#### Scenario: #arbitrary-states-allowed
- **WHEN** a tester authors a state board generation would never produce — disconnected hazard regions, diagonally adjacent heads, or a single-segment snake
- **THEN** the editor accepts it, so resolver edge cases can be exercised directly

#### Scenario: #head-parity-enforced
- **WHEN** the tester places a new snake head while other snakes are present
- **THEN** the head is accepted only on a cell whose `(x + y) mod 2` matches the parity the existing heads share this turn (game-engine/starting-placement#shared-parity, preserved every turn because all heads step one cell together), a head on the wrong parity is rejected at the editor boundary, and the board marks every wrong-parity cell with a translucent red checkerboard overlay while the add-snake tool is active; the first head, with no parity yet fixed, may go on any cell

#### Scenario: #item-placement-replaces
- **WHEN** the tester places an item on a cell that already holds an item
- **THEN** the new item replaces the old one (never a silent failure), leaving exactly one item in the cell and any snake body there untouched

#### Scenario: #item-not-on-body
- **WHEN** the tester places an item on a cell holding a snake body, or extends/adds a snake body onto a cell holding an item
- **THEN** the edit is rejected — the engine never lets an item share a cell with an alive snake body (game-engine/item-spawning), and every editor snake is alive

#### Scenario: #fresh-session-ready
- **WHEN** the app is opened with no sequence selected
- **THEN** a valid game seed and board are already set, so board generation and editing work immediately

#### Scenario: #letters-auto-assigned
- **WHEN** snakes are added to or removed from a team
- **THEN** each snake's letter is (re)assigned from its index within its team (A, B, C… in snake order), never entered by hand

#### Scenario: #derived-lifecycle-fields
- **WHEN** a snake is authored in the editor
- **THEN** it is alive with null last direction, neither field being directly editable; both are thereafter carried exclusively by turn resolution

#### Scenario: #structural-validity-enforced
- **WHEN** an edit would place a cell out of bounds, use a value outside the domain vocabulary, or leave a snake body non-contiguous
- **THEN** the edit is rejected at the editor boundary and the state is unchanged

### Requirement: visual-tester/team-configuration
The tool SHALL let the tester configure teams, each with a name and a colour; snakes are rendered in their team's colour. Adding a team SHALL auto-assign the next colour in a fixed sequence together with a matching default name, and both the name and the colour (via a colour picker) SHALL remain editable. The Add Snake tool assigns new snakes to a chosen configured team. Teams present in a loaded or generated state that lack a configuration SHALL receive a default name and the next colour, without disturbing already-configured teams.

#### Scenario: #add-team-auto-colour
- **WHEN** the tester adds a team
- **THEN** it takes the next colour in the sequence and a matching default name, both then editable

#### Scenario: #team-colour-drives-board
- **WHEN** a team's colour is changed
- **THEN** every snake on that team is redrawn in the new colour

### Requirement: visual-tester/snake-selection
The tool SHALL track the selected snake in a single value changed through one atomic operation, and SHALL derive every consequence of selection from it so they can never disagree: the selected snake is the sole expanded entry in the snake list, is highlighted on the board, is highlighted in the move-staging panel, and is the target the body-extend tool grows. Expanding a snake in the list, clicking a snake's body on the board, or clicking its name in the move panel SHALL select it; adding a snake SHALL select the newly created snake. The board highlight SHALL be a channel distinct from the buff-status body border, so both are visible together. A selection naming a snake absent from the displayed turn (removed, or off the board that turn) SHALL read as no selection, without a separate clearing step.

#### Scenario: #selection-is-sole-expansion
- **WHEN** the tester expands a snake in the list or clicks a snake's body on the board
- **THEN** that snake becomes selected and is the only expanded entry; selecting another replaces the selection

#### Scenario: #selection-preserves-buff-border
- **WHEN** a selected snake also carries a buff (an invulnerability effect drawn as a body border)
- **THEN** the selection indicator and the buff border are both visible at once

#### Scenario: #creation-selects
- **WHEN** the tester adds a snake with the Add Snake tool
- **THEN** the new snake becomes the selection in the same operation — the sole expanded row, the highlighted body, and the body-extend target — so the next click extends it rather than a previously selected snake

#### Scenario: #extend-targets-selection
- **WHEN** the tester extends a body by clicking a cell in extend mode
- **THEN** the cell is appended to the selected snake; with no snake selected the click makes no edit and the tool explains that a snake must be selected first

### Requirement: visual-tester/invalid-state-surfacing
The whole point of the tool is to catch bugs, so it SHALL surface — never silently render as a normal state — any structurally invalid state it is asked to display. In particular, when a state contains a snake whose body is discontinuous (a consecutive segment pair neither orthogonally adjacent nor stacked), the tool SHALL show a prominent on-page error identifying the snake and the offending segment pair, and SHALL NOT draw that snake as a continuous silhouette. Because such a state cannot be authored or imported (game-engine/movement shapes are enforced by visual-tester/board-editor and test-sequences/validation), its only source is a turn-resolution bug or a corrupt sequence — exactly what must be caught.

#### Scenario: #discontinuous-body-flagged
- **WHEN** a state to be displayed contains a snake whose consecutive body segments are neither adjacent nor stacked
- **THEN** the tool shows a prominent error naming the snake and the discontinuous segment pair, and marks that snake's raw segments rather than drawing a plausible continuous body

### Requirement: visual-tester/snake-rendering
The tool SHALL render exactly the snakes that are on the board: every alive snake, plus — as a faded one-turn ghost — each snake that died on the turn currently displayed. A dead snake is off the board after its death turn (game-engine/collisions-and-severing keeps a severed body on the board only for the death turn; the engine retains the dead snake in state solely so its effects run their course), so it SHALL NOT be drawn on any later turn. Ghosting the death position for a single turn hints where a snake fell without implying it is still logically present.

#### Scenario: #dead-snake-ghost-one-turn
- **WHEN** a snake dies on turn k and the tester displays turn k, then turn k+1
- **THEN** the snake is drawn as a faded ghost on turn k (it was alive at turn k−1) and is not drawn at all on turn k+1 or any later turn

### Requirement: visual-tester/move-staging
The tool SHALL allow manually staging a move direction for each living snake and leaving any snake unstaged. Every direction is stageable — the game rules never reject a staged move — and the tool SHALL mark, as a purely advisory hint, staged moves the engine's pre-validation identifies as certain death from the snake's own deterministic future, submitting them unchanged on simulation. The board SHALL draw each staged move as a direction arrow on the staged snake's head, so pending moves read at a glance before simulation.

#### Scenario: #staged-arrows
- **WHEN** a move direction is staged for a living snake
- **THEN** the board draws an arrow on that snake's head pointing in the staged direction, and the arrow clears when the move is unstaged or the turn is simulated

#### Scenario: #certain-death-moves-stageable
- **WHEN** a tester stages a move whose death is certain from the snake's own body or the wall (e.g. reversing into the still-occupied neck cell)
- **THEN** the tool marks it as certain death but submits it unchanged, so the resolver's own collision handling per game-engine/collisions-and-severing is what gets exercised

#### Scenario: #unstaged-snakes-omitted
- **WHEN** a snake is left unstaged and the turn is simulated
- **THEN** the resolver receives no entry for that snake

### Requirement: visual-tester/turn-simulation
The tool SHALL simulate the next turn on demand: it resolves the current state with the currently staged moves and the turn seed derived per test-sequences/determinism, appends the resolver's full output (next state, events, outcome) as a new turn in the session, and makes the next state current so the process repeats.

#### Scenario: #repeatable
- **WHEN** a turn is simulated
- **THEN** the resulting state becomes the base for fresh move staging and further simulation, without limit other than memory

#### Scenario: #full-output-recorded
- **WHEN** a turn is simulated
- **THEN** the session records the resolver's next state, events, and outcome for that turn, so saving the session yields expectations without re-resolving

### Requirement: visual-tester/session-history
The tool SHALL keep the session's full turn history in memory — initial state plus every simulated turn with its staged moves and resolver output — navigable via a scrub bar; scrubbing to any turn displays that turn's board state and, where present, its staged moves, events, and outcome. The session is continuously auto-saved to a scratch sequence (see visual-tester/auto-persist); durability across environments comes only from promoting a snapshot to a git-tracked fixture.

#### Scenario: #scrub-navigation
- **WHEN** the tester scrubs to any recorded turn
- **THEN** the display shows exactly that turn's recorded data, and scrubbing alone never alters history

#### Scenario: #scrubbing-does-not-persist
- **WHEN** the tester only scrubs, without editing
- **THEN** no autosave occurs (scrubbing is not a modification), and history is unchanged

### Requirement: visual-tester/auto-persist
The working session SHALL be continuously persisted to a scratch sequence with no explicit save action: editing or simulating at the head of history updates the session's bound scratch in place, and renaming the session updates it. The only explicit save action SHALL promote a snapshot of the current session to a git-tracked fixture. Scratch sequences are working state; fixtures are the durable, version-controlled set.

#### Scenario: #head-edit-autosaves
- **WHEN** the tester edits state, stages-and-simulates, or renames at the head of history
- **THEN** the change is written to the session's scratch sequence without any explicit save action

#### Scenario: #only-fixtures-are-saved-explicitly
- **WHEN** the tester invokes the tool's one save action
- **THEN** a fixture is written (never a scratch), and the scratch autosave continues independently

### Requirement: visual-tester/history-rewrite
When the tester edits the board state or staged moves at a past (non-head) turn k, the tool SHALL discard all turns after k, make k the new end of history, continue simulation from it, and fork the edited history (turns 0..k) into a new scratch sequence — leaving the sequence the session was editing unchanged on disk (design D11). Editing at the head instead updates the current scratch in place.

#### Scenario: #future-turns-discarded
- **WHEN** the tester edits turn k of an n-turn session (k < n)
- **THEN** turns k+1 through n are discarded, the session ends at the edited turn k, and the next simulation produces a new turn k+1

#### Scenario: #middle-edit-forks-scratch
- **WHEN** the tester edits a non-head turn k
- **THEN** a new scratch sequence holding turns 0..k is created and becomes the session's binding, while the previously bound sequence retains its full history unchanged

### Requirement: visual-tester/sequence-management
The tool SHALL promote the current session to a git-tracked fixture as its one explicit save; list all saved sequences filtered by tier (fixtures, scratch, or the union) and distinguishing the two; load a saved sequence into the session (a fixture loads read-only, forking to a scratch on first edit per visual-tester/auto-persist); copy any saved sequence's JSON document to the clipboard; and import pasted raw JSON as a new scratch sequence, accepting it only if it passes test-sequences/validation.

#### Scenario: #save-from-session
- **WHEN** the tester saves the session as a fixture
- **THEN** the stored document records the session's initial state, per-turn staged moves, and per-turn resolver outputs as the fixture's expectations

#### Scenario: #fixture-overwrite-confirm
- **WHEN** the tester saves a fixture whose name matches an existing fixture
- **THEN** the tool asks for confirmation before overwriting, and creates nothing until confirmed; a non-matching name creates a new fixture

#### Scenario: #filter-by-tier
- **WHEN** the tester selects the fixtures, scratch, or union filter
- **THEN** the listing shows exactly the sequences of the selected tier(s), each marked with its tier

#### Scenario: #fixture-loads-read-only
- **WHEN** the tester loads a fixture and then modifies it
- **THEN** the modification forks a new scratch sequence and the fixture on disk is unchanged

#### Scenario: #paste-import-accepted
- **WHEN** pasted JSON passes validation
- **THEN** it becomes a new scratch sequence, immediately listed and loadable like any other

#### Scenario: #paste-import-rejected
- **WHEN** pasted JSON fails validation
- **THEN** no sequence is created and the validation errors are shown

#### Scenario: #copy-json
- **WHEN** the tester invokes copy on a saved sequence
- **THEN** the clipboard receives the sequence's complete JSON document

#### Scenario: #url-selection-sync
- **WHEN** a sequence becomes the active selection (loaded, or the working scratch it auto-persists to)
- **THEN** the URL's `seq` parameter reflects that sequence's id, and opening a URL carrying a `seq` restores that sequence — so the selection is shareable and survives a reload

### Requirement: visual-tester/sequence-run
The tool SHALL run a Test Sequence per test-sequences/replay-check and present the result on the board view: on success, a pass indication over all turns; on divergence, the run halts at the first divergent turn, displays that turn, and annotates every reported difference below the board as a colour-coded diff distinguishing expected values from computed values, covering state, event, and outcome differences.

#### Scenario: #divergence-annotated
- **WHEN** a run halts at a divergent turn
- **THEN** the board shows that turn and each difference is listed below it with its path, the expected value, and the computed value, colour-coded by side

#### Scenario: #pass-indication
- **WHEN** a run completes with no divergence
- **THEN** the tool reports the pass and the number of turns verified
