## MODIFIED Requirements

### Requirement: test-sequences/sequence-format
Depends on: game-engine/turn-resolution-model.

A Test Sequence SHALL be a self-contained JSON document recording one deterministic run of the turn resolver: a schema version, a human-readable name, a 32-byte game seed, the runtime game configuration, the initial game state, and an ordered list of turns. Each turn records the staged moves submitted for that turn (per snake, entries optional) and the expected resolver output for that turn: the next game state, the turn's events, and the game outcome.

#### Scenario: #self-contained
- **WHEN** a Test Sequence document is replayed on any machine
- **THEN** no information beyond the document and the engine itself is needed — every input to every turn's resolution is contained in or derivable from the document

#### Scenario: #optional-moves
- **WHEN** a turn's staged moves omit a snake
- **THEN** the omission is preserved as an absent entry (never an explicit null or default direction), matching the resolver's treatment of unstaged snakes

### Requirement: test-sequences/validation
Depends on: game-engine/domain-vocabulary, game-engine/movement.

A JSON document SHALL be accepted as a Test Sequence only if it passes schema validation: structural conformance to the format, closed-vocabulary conformance for every domain value, and referential integrity (every snake referenced by a staged move exists in the state that turn resolves from). Structural conformance includes snake-body contiguity: each consecutive pair of body segments is orthogonally adjacent or shares a cell, the only shapes the engine's movement rules can produce. Rejection SHALL identify each failing document path with a human-readable reason.

#### Scenario: #invalid-document-creates-nothing
- **WHEN** a document fails validation on import
- **THEN** no Test Sequence is created or modified, and the reported errors identify the failing paths and reasons

#### Scenario: #referential-integrity
- **WHEN** a turn's staged moves reference a snake id absent from that turn's pre-state
- **THEN** validation fails identifying the turn and the unknown snake id

### Requirement: test-sequences/replay-check
Running a Test Sequence SHALL resolve its turns in recorded order, each from the turn's recorded pre-state with its recorded staged moves and derived turn seed, comparing the computed next state, events, and outcome against the turn's recorded expectations under the canonical encoding. The run SHALL halt at the first turn with any difference, reporting that turn's number and the complete set of value-level differences (path, expected value, computed value); a run with no differing turn passes.

#### Scenario: #pass
- **WHEN** every turn's computed output matches its recorded expectation
- **THEN** the run reports success over all turns and no differences

#### Scenario: #halt-at-first-divergence
- **WHEN** turn k is the first turn whose computed output differs from its recorded expectation
- **THEN** the run evaluates no turn after k and reports k's differences — covering state, events, and outcome — as the run's result

#### Scenario: #event-only-divergence
- **WHEN** a turn's computed next state matches but its events or outcome differ from the recording
- **THEN** the run halts and reports the divergence exactly as for a state difference
