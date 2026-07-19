## Purpose

The dedicated visual testing application for the game rules: board-state
editing, manual move staging, engine-driven turn simulation with in-memory
session history, and management and replay of saved Test Sequences with
discrepancy annotation. A development tool for humans vetting resolver
behaviour — never part of the player- or operator-facing platform.

Depends on: game-rules, test-sequences. Consumed by: (none — leaf
capability).

## ADDED Requirements

### Requirement: visual-tester/dedicated-app
The visual tester SHALL be a dedicated application for game-rules testing, separate from every player- and operator-facing surface, and SHALL advance turns exclusively through the shared engine's turn resolver — never through a reimplementation or approximation of any game rule.

#### Scenario: #engine-is-authoritative
- **WHEN** the tool simulates a turn or runs a Test Sequence
- **THEN** the next state, events, and outcome come from the shared engine's resolver invoked on the exact edited inputs, so tool behaviour and platform behaviour cannot drift apart

#### Scenario: #isolated-from-product-surfaces
- **WHEN** the platform's player- or operator-facing applications are built or deployed
- **THEN** the visual tester is not part of them and nothing in them depends on it

### Requirement: visual-tester/board-editor
The tool SHALL provide a map editor over every component of game state: per-cell terrain (Hazard/Fertile/Normal within the fixed Wall ring per game-rules/board-geometry), board size, snakes (add/remove, team and letter, ordered body cells, health, active effects, last direction, alive flag), items (place/remove any item type on any cell), the runtime game configuration, and the game seed. The editor SHALL permit any structurally valid state — including states board generation would never produce — enforcing only structural validity: in-bounds cells and the closed domain vocabulary per game-rules/domain-vocabulary.

#### Scenario: #arbitrary-states-allowed
- **WHEN** a tester authors a state unreachable by board generation (e.g. disconnected hazard regions, adjacent starting heads, a 1-segment snake)
- **THEN** the editor accepts it, so resolver edge cases can be exercised directly

#### Scenario: #structural-validity-enforced
- **WHEN** an edit would place a cell out of bounds or use a value outside the domain vocabulary
- **THEN** the edit is rejected at the editor boundary and the state is unchanged

### Requirement: visual-tester/move-staging
The tool SHALL allow manually staging a move direction for each living snake and leaving any snake unstaged, and SHALL indicate per staged move whether it passes the engine's move pre-validation — without blocking invalid or unstaged moves from simulation.

#### Scenario: #invalid-moves-stageable
- **WHEN** a tester stages a move the engine's pre-validation rejects (e.g. reversing into the neck)
- **THEN** the tool marks it as invalid but still submits it unchanged on simulation, so the resolver's own handling is what gets exercised

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
The tool SHALL keep the session's full turn history in memory — initial state plus every simulated turn with its staged moves and resolver output — navigable via a scrub bar; scrubbing to any turn displays that turn's board state and, where present, its staged moves, events, and outcome. Session history SHALL never be persisted implicitly; it becomes durable only through an explicit save as a Test Sequence.

#### Scenario: #scrub-navigation
- **WHEN** the tester scrubs to any recorded turn
- **THEN** the display shows exactly that turn's recorded data, and scrubbing alone never alters history

#### Scenario: #no-implicit-persistence
- **WHEN** the session ends without an explicit save
- **THEN** the session's history is gone; nothing was written to the sequence store

### Requirement: visual-tester/history-rewrite
When the tester edits the board state or staged moves at any past turn, the tool SHALL discard all turns after the edited turn, make the edited turn the new end of history, and continue simulation from it.

#### Scenario: #future-turns-discarded
- **WHEN** the tester edits turn k of an n-turn session (k < n)
- **THEN** turns k+1 through n are discarded, the session ends at the edited turn k, and the next simulation produces a new turn k+1

### Requirement: visual-tester/sequence-management
The tool SHALL save the current session as a new named Test Sequence conforming to test-sequences/sequence-format; list all saved sequences; load a saved sequence into the session (replacing it, with history navigable and editable as if just simulated); copy any saved sequence's JSON document to the clipboard; and create a new saved sequence from pasted raw JSON, accepting it only if it passes test-sequences/validation.

#### Scenario: #save-from-session
- **WHEN** the tester saves the session
- **THEN** the stored document records the session's initial state, per-turn staged moves, and per-turn resolver outputs as the sequence's expectations

#### Scenario: #paste-import-validated
- **WHEN** pasted JSON fails validation
- **THEN** no sequence is created and the validation errors are shown; valid JSON becomes a new saved sequence

#### Scenario: #copy-json
- **WHEN** the tester invokes copy on a saved sequence
- **THEN** the clipboard receives the sequence's complete JSON document

### Requirement: visual-tester/sequence-run
The tool SHALL run a Test Sequence per test-sequences/replay-check and present the result on the board view: on success, a pass indication over all turns; on divergence, the run halts at the first divergent turn, displays that turn, and annotates every reported difference below the board as a colour-coded diff distinguishing expected values from computed values, covering state, event, and outcome differences.

#### Scenario: #divergence-annotated
- **WHEN** a run halts at a divergent turn
- **THEN** the board shows that turn and each difference is listed below it with its path, the expected value, and the computed value, colour-coded by side

#### Scenario: #pass-indication
- **WHEN** a run completes with no divergence
- **THEN** the tool reports the pass and the number of turns verified
