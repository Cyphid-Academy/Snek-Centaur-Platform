## ADDED Requirements

### Requirement: global-invariants/engine-mirrors-are-guarded
Depends on: game-engine/runtime-portability.

Wherever a runtime must hold its own declaration of one of the shared engine's types — a stored schema, a validator, a codec, or a table definition — that declaration SHALL be checked against the engine's own type by a build-time assertion that fails on any divergence, including a divergence in modifiers alone, and every such site SHALL use the same assertion. A mirror resting on a check that can pass while the two shapes differ is an unguarded mirror.

#### Scenario: #drift-fails-the-build
- **WHEN** the engine adds, renames, retypes, or moves a field of a type some runtime mirrors
- **THEN** every mirror of that type fails to build until it matches again — the divergence can never ship silently, whichever runtime holds the mirror

#### Scenario: #modifier-only-divergence-is-divergence
- **WHEN** a mirror differs from the engine's type only in readonly-ness or optionality
- **THEN** the check fails: an assertion that accepts it is not the check this invariant requires, and modifier-only drift is precisely the class a hand-maintained mirror acquires without anyone noticing

#### Scenario: #one-assertion-every-site
- **WHEN** a new mirror site is added in any runtime
- **THEN** it uses the same assertion every other site uses, so no site carries a check of its own strength and no mirror is guarded only as well as its author happened to manage

### Requirement: global-invariants/one-shared-generation
Depends on: game-engine/board-geometry.

The rules by which a board is built SHALL have exactly one implementation across the platform, and every board that any runtime or surface offers as what those rules produce for a game's inputs — the board a launch starts a game on, and every candidate shown as the board a launch would start it on — SHALL be that implementation's output, obtained by running it or by receiving what it produced. No runtime or surface SHALL reimplement it, approximate it, or reproduce any stage of it, however faithfully and for whatever reason. A board nobody offers as the product of those rules — hand-authored, edited, restored from a recorded fixture, or constructed by a test — is outside this invariant entirely: what is governed is the claim a board carries, not the act of making one.

#### Scenario: #preview-and-launch-are-one-implementation
- **WHEN** boards are produced for a game at more than one moment — a candidate shown while its parameters are still being edited, and the board the game is finally started on
- **THEN** each is the output of the same one implementation, so two boards for one game can differ only in the inputs they were generated from and never in which code drew them

#### Scenario: #a-local-preview-is-a-second-implementation
- **WHEN** a surface generates its own candidate board locally so it can redraw without a round trip — the same declared parameters, the same roster, even the same seed
- **THEN** it violates this invariant however faithful it looks: two code paths that agree today diverge on the first change to either, and the divergence is discoverable only by comparing a board someone was shown against the board they were given, which is after the game has started

#### Scenario: #authoring-a-board-is-not-generating-one
- **WHEN** a board is authored by hand, edited cell by cell, restored from a saved fixture or sequence, or constructed by a test's arbitrary — including boards generation would never produce
- **THEN** nothing here is violated, because none of them is offered as the board a game's inputs generate: the rules of a turn read the board as data and resolve any board identically however it came to exist
