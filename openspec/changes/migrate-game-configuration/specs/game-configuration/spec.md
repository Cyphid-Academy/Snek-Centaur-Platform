## Purpose

The pre-launch shaping of a game: permitted administrative users edit the
game's rule parameters on its single authoritative configuration record,
preview the board those parameters produce, optionally lock that board in,
and at launch the configuration freezes for the rest of the game's life.
This capability owns the configuration record and its closed parameter
vocabulary, validation, the board-preview workflow, and the boundary that
keeps board-generation parameters platform-side.

Depends on: game-engine.

## ADDED Requirements

### Requirement: game-configuration/config-lives-on-the-game
Each game SHALL have exactly one configuration record, held on the game record itself in the platform's persistent store and serving as the sole source of truth for that game's configured parameter values. No surrounding container (such as a room) holds configuration state of its own, at most one game per room is open for configuration at any time, and every view of a game's configuration SHALL read that game's own record.

#### Scenario: #one-game-configured-at-a-time
- **WHEN** configuration is edited in a room whose previous games have ended
- **THEN** the edit addresses the single not-yet-launched game record that is currently open for configuration — there is no room-level parameter set for concurrent game turnover to race against

#### Scenario: #views-read-the-games-own-record
- **WHEN** a game's configuration is viewed — while it is being played, after it has finished, or from history — after other games have since been configured differently
- **THEN** the view shows that game's own parameter values, never a default set or another game record's current values

### Requirement: game-configuration/closed-parameter-vocabulary
A game's configuration SHALL comprise exactly the engine's parameter vocabulary — the parameters, ranges, defaults, and disable sentinels of game-engine/configuration-parameters — and nothing else; in particular it SHALL NOT include any parameter that configures bot behaviour, heuristics, or Drive management (bot behaviour parameters are owned elsewhere and travel their own path). Every write SHALL be validated authoritatively at the configuration record — a value outside its parameter's defined type or range is rejected there — while client-side range enforcement with inline feedback is a user-experience affordance only, never the enforcement point.

#### Scenario: #out-of-range-rejected-regardless-of-client
- **WHEN** a write sets `boardSize` to 40 — through an editing surface with inline validation or by calling the mutation surface directly
- **THEN** the configuration record rejects it identically either way; the client's inline feedback merely spares the round-trip

#### Scenario: #no-bot-parameters
- **WHEN** a parameter that tunes bot behaviour or heuristics is proposed for the game-configuration parameter set
- **THEN** it does not belong: the vocabulary stays exactly the engine's, and configuration surfaces expose no bot-tuning affordances

#### Scenario: #board-size-round-trip
- **WHEN** board size is edited through its preset-plus-custom affordance
- **THEN** the persisted and transmitted value is always the raw integer within the engine's range, and on load the affordance derives its display from the stored integer — a matching preset's label, otherwise custom with the integer pre-filled — so the stored value never depends on how it was entered

### Requirement: game-configuration/engine-schema-fidelity
The stored configuration schema and its validator SHALL mirror the engine's configuration types field-for-field — the same field names, nesting, types, and two-subtree partition — verified by an automated check that fails the build on any divergence, so that a configuration is handed to the engine without translation.

#### Scenario: #drift-fails-the-build
- **WHEN** the engine adds, renames, retypes, or moves any configuration field
- **THEN** the mirror check fails until the stored schema and validator match again — the divergence can never ship silently

#### Scenario: #no-translation-at-handoff
- **WHEN** a game's configuration is consumed by the engine — for board generation or gameplay
- **THEN** it is passed as stored, with no field-by-field mapping layer that could drift on its own

### Requirement: game-configuration/launch-freeze
A game's configuration SHALL be editable by permitted administrative users only while the game awaits launch. At launch the configuration SHALL be frozen as an immutable snapshot for the remainder of the game's life; a game that reaches its end without ever launching likewise stops being editable.

#### Scenario: #post-launch-writes-rejected
- **WHEN** a configuration write reaches a game that is past its edit window — in play or finished, whatever surface the write came through
- **THEN** it is rejected at the configuration record; no affordance, client, or programmatic path bypasses the freeze

#### Scenario: #editable-until-launch
- **WHEN** a permitted user edits any parameter of a not-yet-launched game, even moments before launch
- **THEN** the edit applies, and launch freezes exactly the values the record then holds

### Requirement: game-configuration/generation-parameter-boundary
The parameter set follows the engine's partition into board-generation parameters and dynamic gameplay parameters. Board-generation parameters SHALL be consumed entirely platform-side, by running the shared engine's board generation to produce the game's initial state; the per-game runtime SHALL receive only the dynamic gameplay parameters together with that precomputed initial state — board-generation parameters are never forwarded to it, and it never generates a board.

#### Scenario: #only-the-gameplay-subtree-crosses
- **WHEN** a launched game's runtime instance is initialised
- **THEN** its payload carries the dynamic gameplay parameters and the precomputed initial state; no board-generation parameter (board size, hazard percentage, fertile-ground settings, snakes per team) crosses

#### Scenario: #the-runtime-never-generates
- **WHEN** the per-game runtime starts a game
- **THEN** it uses the delivered initial state as-is, holding neither the inputs nor the responsibility to generate a board

### Requirement: game-configuration/conditional-parameter-semantics
Feature disablement SHALL be encoded solely by the zero sentinels of game-engine/configuration-parameters, with no auxiliary gating flags to validate against. A dependent parameter whose gate is off SHALL still accept and persist any in-range value, which is simply ignored while gated; editing surfaces SHALL visually gate such parameters and communicate their inactivity without blocking persistence.

#### Scenario: #gated-value-persists-and-is-ignored
- **WHEN** fertile-ground clustering is set to a valid value while fertile-ground density is 0
- **THEN** the value persists on the record and has no effect on generation; raising density above 0 later brings the stored clustering into effect without re-entry

#### Scenario: #ui-communicates-without-blocking
- **WHEN** a user edits a dependent parameter whose gating parameter is off
- **THEN** the surface shows the parameter as currently inactive but still lets the value be persisted

### Requirement: game-configuration/board-preview
Editing a board-affecting parameter of a not-yet-launched game SHALL regenerate the board preview by running the shared engine's board generation platform-side against the game's current parameters — boards are only ever generated by the platform, never by a client. Each regeneration SHALL overwrite the game's single current-preview value, which is delivered reactively to every configuration client so that all viewers render the same candidate; clients render the delivered preview and SHALL NOT run any board-generation algorithm themselves. The current-preview value holds only the latest candidate — prior candidates are not retained — and it designates the game's starting state only through lock-in (game-configuration/board-preview-lock-in) or launch.

#### Scenario: #one-slot-no-archive
- **WHEN** board-affecting parameters are edited repeatedly, generating a stream of candidate previews
- **THEN** each regeneration overwrites the one current-preview value; no archive of past candidates accumulates, and abandoning a candidate is simply regenerating

#### Scenario: #all-viewers-in-sync
- **WHEN** several permitted users view a game's configuration concurrently, or a client rejoins after a refresh
- **THEN** every viewer renders the same current preview from the shared platform-held value — no client holds a private candidate

#### Scenario: #clients-render-never-generate
- **WHEN** the preview updates after a parameter edit
- **THEN** the client renders the platform-generated state it received reactively; because no board generation runs client-side, what is shown is exactly what locking would designate

#### Scenario: #a-playing-game-is-never-touched
- **WHEN** a preview regenerates while another game in the same room is being played
- **THEN** the playing game is unaffected — preview state belongs only to the not-yet-launched game being configured

### Requirement: game-configuration/board-preview-lock-in
A per-game boolean lock SHALL let a permitted administrative user designate the current-preview value as the game's starting state for the upcoming launch. A lock request carries no board data — the flag designates the platform-held current preview, so what launches is always a board the platform generated and every viewer saw. While locked, launch SHALL use the designated board exactly, and a board-affecting parameter edit SHALL clear the lock as it regenerates the preview — a frozen configuration and a launched board can never describe different generation inputs. When no board is locked at launch, launch SHALL generate a fresh board from the then-current parameters and a fresh seed, persist it as the game's starting state, and SHALL NOT surface it to any configuration-mode view — it first becomes visible through gameplay delivery once the game is under way.

#### Scenario: #locked-board-launches-exactly
- **WHEN** the lock is set at launch
- **THEN** the game starts on precisely the current-preview value the lock designated — what the configuring users saw is what the players get

#### Scenario: #lock-carries-no-board-data
- **WHEN** a lock request arrives accompanied by board data fabricated by a client
- **THEN** the supplied data is irrelevant: the flag designates only the platform-held current preview, so a doctored client cannot smuggle a board into a game

#### Scenario: #board-affecting-edit-clears-the-lock
- **WHEN** a board-generation parameter is edited while the lock is set
- **THEN** the lock clears and the regenerated candidate arrives unlocked — re-locking is a deliberate act on the new preview

#### Scenario: #lock-toggles-freely-before-launch
- **WHEN** the lock is set, cleared, and set again while the game awaits launch
- **THEN** each set designates the current preview at that moment; only the designation standing at launch has any effect

#### Scenario: #unlocked-regeneration-stays-hidden
- **WHEN** no lock is set at launch
- **THEN** the fresh-seed result is persisted but shown in no configuration-mode view; players first encounter the board in play, preserving board surprise

### Requirement: game-configuration/infeasibility-surfaced
When board generation fails — during a preview regeneration or during launch — the structured infeasibility error of game-engine/board-generation-retry SHALL be surfaced reactively to the configuring user, identifying the constraint that failed so the configuration can be adjusted and retried; a launch whose board generation fails SHALL NOT proceed.

#### Scenario: #failure-names-the-constraint
- **WHEN** generation reports infeasibility — for example, a starting territory cannot seat its snakes
- **THEN** the configuring user sees which constraint failed on the final attempt, not a generic error

#### Scenario: #failed-launch-halts
- **WHEN** generation fails during launch itself (the unlocked fresh-seed path)
- **THEN** the launch does not proceed, and the same structured error reaches the configuring user for reconfiguration
