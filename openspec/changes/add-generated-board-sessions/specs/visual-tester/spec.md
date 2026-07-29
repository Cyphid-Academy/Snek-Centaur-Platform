## MODIFIED Purpose

The dedicated visual testing application for the game rules: board-state
editing — of a board authored by hand or of one the platform's standard
generator produced for a given set of parameters and seed — manual move
staging, engine-driven turn simulation with in-memory session history, and
management and replay of saved Test Sequences with discrepancy annotation. A
development tool for humans vetting resolver behaviour — never part of the
player- or operator-facing platform.

Depends on: game-configuration, game-engine, global-invariants,
test-sequences. Consumed by: (none — leaf capability).

## ADDED Requirements

### Requirement: visual-tester/generated-board-sessions
Depends on: game-configuration/generation-parameters, game-configuration/board-generation-retry, global-invariants/one-shared-generation.

The tool SHALL offer, beside hand-authoring, a second way to obtain the board a session starts from: running the platform's one shared implementation of the board-generation rules over a set of generation parameters and a seed the tester supplies, and beginning a session on the state it returns. Both routes are first class and yield the same kind of session — a generated board is thereafter editable, stageable, simulable, scrubbable and savable exactly as a hand-authored one, and no affordance of the tool is reachable only through generation. Where generation declines the parameters it was given — a roster that cannot be seated, an interior that cannot carry the requested hazards — the tool SHALL surface the reported reason and leave the session in progress untouched, rather than putting a board of its own on screen in its place.

#### Scenario: #generation-is-a-session-source
- **WHEN** the tester generates a board from a chosen set of generation parameters and a seed
- **THEN** a session begins on the state generation returned, indistinguishable in kind from one begun on a hand-authored board: the same staging, simulation, history, autosave and promotion to a fixture apply to it

#### Scenario: #same-parameters-and-seed-same-board
- **WHEN** the tester generates twice from the same parameters and the same seed
- **THEN** the same board comes back both times, so a board worth investigating is reachable again from the two values that produced it and need not be preserved as a saved document to be seen twice

#### Scenario: #a-generated-board-is-editable
- **WHEN** the tester edits a board that arrived from generation — repainting terrain, moving or removing a snake, placing an item, or driving it into a state generation itself would never produce
- **THEN** the edit applies exactly as it would on a hand-authored board: generation supplied a starting point and asserts nothing about the board afterwards

#### Scenario: #hand-authoring-needs-no-generator
- **WHEN** the tester works entirely from an empty or hand-authored board and never generates one
- **THEN** every affordance of the tool remains available, because generation is a second source of a starting board and never a step on the way to authoring one

#### Scenario: #declined-generation-changes-nothing
- **WHEN** the supplied parameters admit no board at all
- **THEN** the tester is told which constraint could not be satisfied, and the session in progress is exactly as it was — no partial board, no substituted board, and no silent no-op
