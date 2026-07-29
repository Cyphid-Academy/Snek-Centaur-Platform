## MODIFIED Requirements

### Requirement: visual-tester/board-editor
Depends on: game-engine/board-geometry, game-engine/domain-vocabulary, game-engine/movement, game-engine/item-spawning.

The tool SHALL provide a map editor over every authorable component of game state: per-cell terrain (Hazard/Fertile/Normal within the fixed Wall ring), board size, snakes (add/remove, team, ordered body cells of any length ≥ 1, health, active effects; the letter is derived, see #letters-auto-assigned), items (place/remove any item type on any cell not occupied by a snake body; placing over an existing item replaces it), the runtime game configuration, and the game seed. A fresh session with no loaded sequence SHALL always start with a valid game seed and a board, so editing and board generation are immediately available without any manual setup. Two snake fields are lifecycle-derived and never directly editable: a snake present in the editor is alive — death arises only from turn resolution — and last direction is null in a hand-authored state, otherwise the direction the snake last moved. The editor SHALL permit any structurally valid state — including states board generation would never produce — enforcing only structural validity: in-bounds cells, the closed domain vocabulary, snake-body contiguity (each consecutive segment pair orthogonally adjacent or sharing a cell, the only shapes the engine's movement rules can produce), and shared head parity (see #head-parity-enforced).

#### Scenario: #arbitrary-states-allowed
- **WHEN** a tester authors a state board generation would never produce — disconnected hazard regions, diagonally adjacent heads, or a single-segment snake
- **THEN** the editor accepts it, so resolver edge cases can be exercised directly

#### Scenario: #head-parity-enforced
- **WHEN** the tester places a new snake head while other snakes are present
- **THEN** the head is accepted only on a cell whose `(x + y) mod 2` matches the parity the existing heads share this turn — a parity the movement rules preserve every turn, because all heads step one cell together — a head on the wrong parity is rejected at the editor boundary, and the board marks every wrong-parity cell with a translucent red checkerboard overlay while the add-snake tool is active; the first head, with no parity yet fixed, may go on any cell

#### Scenario: #item-placement-replaces
- **WHEN** the tester places an item on a cell that already holds an item
- **THEN** the new item replaces the old one (never a silent failure), leaving exactly one item in the cell and any snake body there untouched

#### Scenario: #item-not-on-body
- **WHEN** the tester places an item on a cell holding a snake body, or extends/adds a snake body onto a cell holding an item
- **THEN** the edit is rejected — the engine never lets an item share a cell with an alive snake body, and every editor snake is alive

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

### Requirement: visual-tester/turn-simulation
Depends on: test-sequences/determinism, game-engine/turn-resolution-model.

The tool SHALL simulate the next turn on demand: it resolves the current state with the currently staged moves, the timings it supplies for that turn, and the turn seed derived from the game seed and that turn's number, appends the resolver's full output (next state, events, outcome) as a new turn in the session, and makes the next state current so the process repeats. The tool SHALL hold a configurable default turn duration — 500 ms out of the box — supplied as both the turn's length and every team's burn, and SHALL let the tester choose distinct values for an individual turn advance, so a clock can be spent unevenly or run down deliberately.

#### Scenario: #repeatable
- **WHEN** a turn is simulated
- **THEN** the resulting state becomes the base for fresh move staging and further simulation, without limit other than memory

#### Scenario: #full-output-recorded
- **WHEN** a turn is simulated
- **THEN** the session records the resolver's next state, events, and outcome for that turn, so saving the session yields expectations without re-resolving

#### Scenario: #a-default-that-needs-no-attention
- **WHEN** a tester who does not care about time stages moves and simulates
- **THEN** the default duration is supplied for the turn and for every team, so the resolver's required timings never become a step the tester has to perform — the tool is for vetting rules, and a mandatory input it can answer sensibly by itself is one it should

#### Scenario: #per-advance-values-reach-the-timed-endings
- **WHEN** a tester chooses a large burn for one team on a single advance
- **THEN** that turn resolves with exactly those values, so a team can be driven to the end of its clock and the endings that depend on time can be authored in the tool like every other rule — no separate clock-editing surface is needed to reach them

### Requirement: visual-tester/session-history

The tool SHALL keep the session's full turn history in memory — initial state plus every simulated turn with its staged moves, the timings supplied for it, and resolver output — navigable via a scrub bar; scrubbing to any turn displays that turn's board state and, where present, its staged moves, timings, events, and outcome. The session is continuously auto-saved to a scratch sequence; durability across environments comes only from promoting a snapshot to a git-tracked fixture.

#### Scenario: #scrub-navigation
- **WHEN** the tester scrubs to any recorded turn
- **THEN** the display shows exactly that turn's recorded data, and scrubbing alone never alters history

#### Scenario: #scrubbing-does-not-persist
- **WHEN** the tester only scrubs, without editing
- **THEN** no autosave occurs (scrubbing is not a modification), and history is unchanged

#### Scenario: #a-re-simulated-turn-reuses-its-timings
- **WHEN** the tester scrubs back to a turn and simulates it again without changing anything
- **THEN** the timings that turn recorded are the ones re-supplied, so the outcome is the one already on screen — had the current default been substituted instead, an untouched turn could resolve differently on the second look and the tool would be reporting a discrepancy it created

### Requirement: visual-tester/sequence-management
Depends on: test-sequences/validation.

The tool SHALL promote the current session to a git-tracked fixture as its one explicit save; list all saved sequences filtered by tier (fixtures, scratch, or the union) and distinguishing the two; load a saved sequence into the session (a fixture loads read-only, forking to a scratch on first edit); copy any saved sequence's JSON document to the clipboard; and import pasted raw JSON as a new scratch sequence, accepting it only if it passes sequence validation.

#### Scenario: #save-from-session
- **WHEN** the tester saves the session as a fixture
- **THEN** the stored document records the session's initial state, its per-turn resolution inputs — staged moves and timings alike — and its per-turn resolver outputs as the fixture's expectations

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
