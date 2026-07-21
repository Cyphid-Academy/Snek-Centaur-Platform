# test-sequences Specification

## Purpose

Portable record-and-replay contract for the turn resolver: the canonical
JSON encoding of recorded runs, schema versioning, validation,
deterministic seed derivation, persistence semantics, and the replay-check
that compares recorded expectations against freshly computed resolver
output. This capability defines the data contract with no reference to any
UI, so it can be consumed headlessly.

Depends on: game-engine. Consumed by: visual-tester (and any future
headless sequence runner, e.g. CI regression replay).

## Requirements

### Requirement: test-sequences/sequence-format
A Test Sequence SHALL be a self-contained JSON document recording one deterministic run of the turn resolver: a schema version, a human-readable name, a 32-byte game seed, the runtime game configuration, the initial game state, and an ordered list of turns. Each turn records the staged moves submitted for that turn (per snake, entries optional) and the expected resolver output for that turn: the next game state, the turn's events, and the game outcome.

#### Scenario: #self-contained
- **WHEN** a Test Sequence document is replayed on any machine
- **THEN** no information beyond the document and the engine itself is needed — every input to every turn's resolution is contained in or derivable from the document

#### Scenario: #optional-moves
- **WHEN** a turn's staged moves omit a snake
- **THEN** the omission is preserved as an absent entry (never an explicit null or default direction), matching the resolver's treatment of unstaged snakes per game-engine/turn-resolution-model

### Requirement: test-sequences/canonical-encoding
The Test Sequence format SHALL define exactly one JSON encoding for every recorded engine value — including byte-array seeds, map-valued fields, and per-team score maps — such that two equal engine values always serialize to structurally identical JSON. Equality and difference reporting over recorded values are defined over this canonical encoding.

#### Scenario: #equal-values-equal-json
- **WHEN** two engine values that compare equal are serialized
- **THEN** the resulting JSON values are structurally identical, so value comparison can be performed on the JSON encoding alone

#### Scenario: #lossless-round-trip
- **WHEN** an engine value is serialized to the canonical encoding and decoded back
- **THEN** the decoded value equals the original

### Requirement: test-sequences/schema-version
Every Test Sequence document SHALL carry an integer schema version identifying the format it was written against, and any breaking change to the format SHALL increment it. Consumers SHALL reject documents whose schema version they do not support, identifying the unsupported version.

#### Scenario: #unknown-version-rejected
- **WHEN** a consumer encounters a document with a schema version it does not support
- **THEN** the document is rejected with an error naming the document's version and the supported version(s); it is never partially interpreted

### Requirement: test-sequences/determinism
Replaying a Test Sequence SHALL derive each turn's seed from the document's game seed and that turn's number using the platform's seed-derivation convention (`subSeed(gameSeed, "turn-" + turnNumber)` per game-engine/determinism), so that replaying the same document against the same engine build always produces identical resolver outputs.

#### Scenario: #production-seed-derivation
- **WHEN** turn T of a sequence is resolved during replay
- **THEN** the turn seed is derived exactly as the platform derives it for a live game with the same game seed and turn number, so recorded live-game turns and hand-built sequences share one seed model

#### Scenario: #reproducible-replay
- **WHEN** the same Test Sequence is replayed twice against the same engine build
- **THEN** every computed next state, event list, and outcome is identical between the two replays

### Requirement: test-sequences/validation
A JSON document SHALL be accepted as a Test Sequence only if it passes schema validation: structural conformance to the format, closed-vocabulary conformance for every domain value per game-engine/domain-vocabulary, and referential integrity (every snake referenced by a staged move exists in the state that turn resolves from). Structural conformance includes snake-body contiguity: each consecutive pair of body segments is orthogonally adjacent or shares a cell, the only shapes producible under game-engine/movement. Rejection SHALL identify each failing document path with a human-readable reason.

#### Scenario: #invalid-document-creates-nothing
- **WHEN** a document fails validation on import
- **THEN** no Test Sequence is created or modified, and the reported errors identify the failing paths and reasons

#### Scenario: #referential-integrity
- **WHEN** a turn's staged moves reference a snake id absent from that turn's pre-state
- **THEN** validation fails identifying the turn and the unknown snake id

### Requirement: test-sequences/persistence
Saved Test Sequences SHALL be stored durably, each with a unique identifier, a name, creation and last-modified timestamps, and the JSON document. The store SHALL support listing saved sequences, retrieving a sequence's document by identifier, and saving a new sequence; a retrieved document SHALL be value-identical to the document that was saved.

#### Scenario: #round-trip-fidelity
- **WHEN** a Test Sequence is saved and later retrieved
- **THEN** the retrieved JSON document is value-identical to the saved one (identical canonical encoding)

#### Scenario: #listing
- **WHEN** saved sequences are listed
- **THEN** each entry carries at least the identifier, name, and timestamps, without requiring retrieval of full documents

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
