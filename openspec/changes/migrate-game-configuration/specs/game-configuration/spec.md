## Purpose

The pre-launch shaping of a game: a configuration surface edits the game's
rule parameters on its single authoritative configuration record, previews
the board those parameters produce, optionally locks that board in, and at
launch the configuration freezes for the rest of the game's life. This
capability owns the configuration record and its closed parameter
vocabulary, validation and the sourcing of its bounds, **the rules by which
a board is built** — its shape, its hazards, its fertile ground, the
starting territories and the snakes and food placed in them, and the
bounded retry that makes generation all-or-nothing — the board-preview
workflow, the boundary that keeps board-generation parameters platform-side,
and the self-contained configuration surface itself — a component that holds
no access rule of its own and takes the affordances it offers as parameters
from whatever host mounts it. The engine plays a board it is handed and
knows nothing of how one is made; everything that decides what a board looks
like before its first turn is here.

Depends on: game-engine, global-invariants, application-shell.

## ADDED Requirements

### Requirement: game-configuration/config-lives-on-the-game
Depends on: global-invariants/single-convex-deployment, global-invariants/transactional-invariant-enforcement.

Each game SHALL have exactly one configuration record, held on the game record itself in the single persistent deployment that is configuration's sole home and serving as the sole source of truth for that game's configured parameter values. That game record is established here in its minimal form — the game's identity plus this configuration — and the capabilities that own the rest of a game's life extend that same record rather than introducing a second one. No surrounding container (such as a room) holds configuration state of its own, at most one game per room is open for configuration at any time — an exclusivity rule guarded inside the transaction of any write that could violate it — and every view of a game's configuration SHALL read that game's own record.

#### Scenario: #the-game-record-starts-minimal
- **WHEN** the game record first exists, before anything that orchestrates a game's life has been built
- **THEN** it already carries the game's identity and its configuration, and later work adds fields to that same record — a second record for the same game is never introduced

#### Scenario: #one-game-configured-at-a-time
- **WHEN** configuration is edited in a room whose previous games have ended
- **THEN** the edit addresses the single not-yet-launched game record that is currently open for configuration — there is no room-level parameter set for concurrent game turnover to race against

#### Scenario: #views-read-the-games-own-record
- **WHEN** a game's configuration is viewed — while it is being played, after it has finished, or from history — after other games have since been configured differently
- **THEN** the view shows that game's own parameter values, never a default set or another game record's current values

### Requirement: game-configuration/closed-parameter-vocabulary
Depends on: game-engine/configuration-parameters, global-invariants/one-contract-many-surfaces.

A game's configuration SHALL comprise exactly two disjoint halves and nothing else: the engine's gameplay parameter vocabulary — the parameters, defaults, and disable sentinels the engine defines for a game already under way — together with the board-generation parameters this capability declares itself. In particular it SHALL NOT include any parameter that configures bot behaviour, heuristics, or Drive management (bot behaviour parameters are owned elsewhere and travel their own path). Every write SHALL be validated authoritatively at the configuration record — a value outside its parameter's defined type or range is rejected there, identically for the writes of every surface.

#### Scenario: #out-of-range-rejected-regardless-of-client
- **WHEN** a write sets `boardSize` to 40 — through an editing surface with inline validation or by calling the mutation surface directly
- **THEN** the configuration record rejects it identically either way; the client's inline feedback merely spares the round-trip

#### Scenario: #no-bot-parameters
- **WHEN** a parameter that tunes bot behaviour or heuristics is proposed for the game-configuration parameter set
- **THEN** it does not belong: the vocabulary stays exactly the engine's, and configuration surfaces expose no bot-tuning affordances

#### Scenario: #the-duration-limit-is-an-ordinary-parameter
- **WHEN** the limit on a game's wall-clock duration is edited
- **THEN** it is offered, written, validated, and frozen exactly as every other parameter of the vocabulary — being a limit that only takes effect while the game runs makes it no more special here than the clock values are, and it is not a second kind of setting held somewhere else

#### Scenario: #board-size-round-trip
- **WHEN** board size is edited through its preset-plus-custom affordance
- **THEN** the persisted and transmitted value is always the raw integer within the engine's range, and on load the affordance derives its display from the stored integer — a matching preset's label, otherwise custom with the integer pre-filled — so the stored value never depends on how it was entered

### Requirement: game-configuration/engine-schema-fidelity
Depends on: global-invariants/one-shared-engine, global-invariants/engine-mirrors-are-guarded.

The gameplay half of the stored configuration schema, and its validator, SHALL mirror the configuration types of the one shared engine build every runtime consumes field-for-field — the same field names, nesting, and types — so that the half a game is played from is handed to the engine without translation. The board-generation half mirrors nothing: it is this capability's own declaration, and the partition between the two halves is what the platform's mirror guard holds the boundary at.

#### Scenario: #no-translation-at-handoff
- **WHEN** a game's gameplay configuration is handed to the engine
- **THEN** it is passed as stored, with no field-by-field mapping layer that could drift on its own

#### Scenario: #a-generation-field-is-not-a-mirror-failure
- **WHEN** a board-generation parameter is added, renamed, or retyped here
- **THEN** the mirror check is silent, because no engine field corresponds to it — and conversely a generation field appearing in the engine's configuration types fails the check, since the engine declares only what a turn's resolution reads

### Requirement: game-configuration/parameter-bounds-sourcing
Depends on: game-engine/configuration-parameters, global-invariants/one-shared-engine.

Every numeric bound this capability enforces, and every bound its editing surface presents, SHALL come from exactly one declaration — never restated as a second set of numbers — so a widget's limits and the record's rejection threshold cannot disagree. For a gameplay parameter that declaration is the engine's, read as data and reflected here unchanged. For a board-generation parameter it is this capability's own, because the engine declares no such parameter at all; the roster-contextual tightening of a generation bound — narrowing it against the teams and snakes that must actually be seated — is a derivation over that declaration and never a second set of numbers for the same fact.

#### Scenario: #widget-and-validator-agree
- **WHEN** a parameter's declared bound changes
- **THEN** the record's rejection threshold and the editing surface's widget limits both move with it, because both read the same declaration — there is no second copy to forget, whichever half of the vocabulary the parameter belongs to

#### Scenario: #live-game-bounds-are-reflected-not-owned
- **WHEN** a parameter that only affects a game already under way is edited — hazard damage, a potion spawn rate, maximum health, the limit on the game's wall-clock duration
- **THEN** the surface offers exactly the engine's declared range for it and this capability adds no limit of its own

#### Scenario: #roster-tightens-generation-bounds
- **WHEN** a board-generation parameter's usable range narrows with the game's roster — more teams to seat, or more snakes to seat per team
- **THEN** the tightened limit is derived here from this capability's own declared range for that parameter, which stays the outer limit the tightening may narrow but never exceed — there is no engine-declared range underneath it to reconcile with, because a parameter the engine never reads is a parameter the engine never bounds

### Requirement: game-configuration/bounded-game-duration
Depends on: game-engine/configuration-parameters, game-engine/game-end-conditions, global-invariants/transactional-invariant-enforcement.

A game's configuration SHALL carry at least one of the two limits that bound how long the game can last — a turn limit or a limit on wall-clock duration — so that a configuration holding both at their disable sentinels is invalid. That is a condition on the record as a whole rather than a range on either parameter, so no per-value check can express it: it SHALL be guarded inside the transaction of every write that could leave the record with neither limit, and a launch SHALL NOT proceed for a game whose configuration lacks both. Either limit alone SHALL be a complete answer, and carrying both is equally valid — nothing here prefers one, and neither limit is what the other is for.

#### Scenario: #neither-limit-is-rejected
- **WHEN** a write would leave a game with neither limit — disabling one while the other is already disabled, or disabling both at once
- **THEN** it is rejected at the configuration record, so no game record ever holds terms under which the game could run without end; withholding the combination in an editing surface is a convenience and never the check

#### Scenario: #a-turn-limit-alone-is-valid
- **WHEN** a game carries a turn limit and no duration limit
- **THEN** the configuration stands as complete and no duration limit is demanded of it — the turn limit together with the clock values already bounds how long the game can take

#### Scenario: #a-duration-limit-alone-is-valid
- **WHEN** a game carries a duration limit and no turn limit
- **THEN** the configuration stands as complete — the game may reach any turn count, and the duration limit is the whole of what makes it finite

#### Scenario: #switching-which-limit-applies
- **WHEN** a turn-limited game is reconfigured to be duration-limited instead
- **THEN** the duration limit is set before the turn limit is disabled, and the intermediate record carrying both is valid — there is no ordering of the two edits that passes through a record carrying neither, which is what makes the record's own terms always sufficient to bound the game

#### Scenario: #launch-cannot-freeze-an-unbounded-game
- **WHEN** launch is attempted for a game whose configuration carries neither limit
- **THEN** it does not proceed and no snapshot is frozen — the condition binds at the moment the configuration becomes the game's permanent terms, not only as each edit arrives

### Requirement: game-configuration/launch-freeze
Depends on: global-invariants/transactional-invariant-enforcement.

A game's configuration SHALL be editable only while the game awaits launch. At launch the configuration SHALL be frozen as an immutable snapshot for the remainder of the game's life — a freeze guarded inside the transaction of every write it must exclude, so a write cannot slip past a launch committing concurrently; a game that reaches its end without ever launching likewise stops being editable.

#### Scenario: #post-launch-writes-rejected
- **WHEN** a configuration write reaches a game that is past its edit window — in play, or finished without ever launching
- **THEN** it is rejected at the configuration record

#### Scenario: #editable-until-launch
- **WHEN** any parameter of a not-yet-launched game is edited, even moments before launch
- **THEN** the edit applies, and launch freezes exactly the values the record then holds

### Requirement: game-configuration/generation-parameter-boundary
Depends on: global-invariants/runtime-ownership, global-invariants/game-instance-hermeticity, global-invariants/one-shared-generation.

The parameter set is partitioned into board-generation parameters and dynamic gameplay parameters. Board-generation parameters SHALL be consumed entirely platform-side, by running the one shared board-generation implementation to produce the game's initial state, and the per-game runtime is not where that happens. That runtime SHALL receive only the dynamic gameplay parameters together with that precomputed initial state, seeded at initialisation and never refreshed — board-generation parameters are never forwarded to it, and it never generates a board.

#### Scenario: #only-the-gameplay-subtree-crosses
- **WHEN** a launched game's runtime instance is initialised
- **THEN** its payload carries the dynamic gameplay parameters and the precomputed initial state; no board-generation parameter (board size, hazard percentage, fertile-ground settings, snakes per team) crosses

#### Scenario: #the-runtime-never-generates
- **WHEN** the per-game runtime starts a game
- **THEN** it uses the delivered initial state as-is, holding neither the inputs nor the responsibility to generate a board

### Requirement: game-configuration/generation-parameters
Depends on: game-engine/configuration-parameters.

Board generation SHALL be configured by exactly these parameters, with these ranges, defaults, and disable sentinels:

| Parameter | Range | Default | Sentinel |
|---|---|---|---|
| `boardSize` | 7–32 | 21 | |
| `snakesPerTeam` | 1–10 | 5 | |
| `hazardPercentage` | 0–30 | 0 | 0 = no hazards |
| `fertileGround.density` | 0–90 | 30 | 0 = fertile ground disabled |
| `fertileGround.clustering` | 1–20 | 10 | |

This is the sole declaration of these parameters anywhere: the engine's vocabulary carries none of them, because a turn's resolution reads none of them, so there is no outer range here to reconcile against and no second copy of a bound to drift.

#### Scenario: #generation-parameters-are-declared-here
- **WHEN** a parameter that shapes a board before its first turn is proposed
- **THEN** it is declared in this table, never in the engine's — the two vocabularies are disjoint by construction, so no surface has to work out which one to ask

#### Scenario: #generation-sentinels
- **WHEN** `hazardPercentage` or `fertileGround.density` is 0
- **THEN** generation designates no cell of the corresponding kind, and clustering has nothing to shape

#### Scenario: #a-default-for-every-generation-parameter
- **WHEN** a game record is first created, before anything has been edited
- **THEN** every board-generation parameter already holds the default above, so a board can be generated from an untouched record

### Requirement: game-configuration/generated-board-shape
Depends on: game-engine/board-geometry.

Board generation SHALL produce a square grid of `boardSize × boardSize` cells whose outermost 1-cell-thick border is entirely `Wall`, every remaining cell being one of the playable inner cells the engine addresses.

#### Scenario: #complete-wall-ring
- **WHEN** a board is generated with edge length N
- **THEN** it is an N×N grid with a complete Wall ring and an (N−2)² playable interior

#### Scenario: #the-ring-is-generations-to-supply
- **WHEN** the generated board reaches the engine
- **THEN** the ring is already there and nothing rebuilds or checks it — resolution treats leaving the grid exactly as hitting a wall, so the ring exists because players should meet walls where the board ends, not because the rules would otherwise be wrong

### Requirement: game-configuration/hazards
Depends on: game-engine/board-geometry.

When the configured hazard percentage H is greater than 0, board generation SHALL designate `floor(inner_cell_count × H / 100)` inner cells as Hazard terrain, seeded from the game seed.

#### Scenario: #connectivity-guarantee
- **WHEN** hazards are placed
- **THEN** all non-Hazard, non-Wall inner cells form a single connected region

#### Scenario: #proportion-of-the-interior
- **WHEN** H is applied
- **THEN** the count is taken over the inner cells alone and rounded down, so the border ring is never a candidate and a small board never over-hazards

### Requirement: game-configuration/fertile-ground
Depends on: game-engine/board-geometry.

When fertile ground is enabled, board generation SHALL designate a fixed subset of inner non-Wall non-Hazard cells as `Fertile`, forming organic clustered patches: the density parameter D sets coverage (the top D% of candidate cells ranked by seeded fractal noise) and the clustering parameter C sets patch scale.

#### Scenario: #knob-semantics
- **WHEN** C is low
- **THEN** fertile cells form small scattered patches; high C forms large contiguous blobs, with D controlling total coverage in both cases

#### Scenario: #designated-before-the-first-turn
- **WHEN** the board reaches the engine
- **THEN** its fertile cells are already designated and no later act designates another — whether fertile ground is in play is thereafter read from the board's own cells

### Requirement: game-configuration/starting-placement
Depends on: game-engine/board-geometry.

For an N-team game, board generation SHALL divide the board into N starting territories using a circular pie of N equal angular sectors centred on the board with a seeded-random angular offset. Each snake's starting head SHALL be placed on a seeded-random non-Wall, non-Hazard inner cell inside its team's territory, and all starting heads across all teams SHALL share one seeded-random parity of `(x + y) mod 2`.

#### Scenario: #territory-assignment
- **WHEN** inner cells are assigned to territories
- **THEN** each cell belongs to the sector it overlaps most, ties broken by seeded randomness

#### Scenario: #shared-parity
- **WHEN** all starting heads are placed
- **THEN** every head cell has the same `(x + y) mod 2` parity

### Requirement: game-configuration/initial-snakes
Depends on: game-engine/domain-vocabulary.

Each team SHALL field exactly `snakesPerTeam` snakes. Every snake starts with length 3 (all three segments stacked on its starting cell), `health = MaxHealth`, no active effects, no prior direction, and alive. Snakes are lettered consecutively from `A` within their team; a snake's display name is `{centaurTeamName}.{letter}`.

#### Scenario: #initial-state
- **WHEN** a game starts
- **THEN** every snake is a 3-segment stack on its start cell at full health with empty `activeEffects` (so derived invulnerability level 0 and visible true) and null `lastDirection`

#### Scenario: #naming
- **WHEN** team Red fields three snakes
- **THEN** they are `Red.A`, `Red.B`, `Red.C`

#### Scenario: #the-count-travels-in-the-snakes
- **WHEN** the generated state reaches anything that plays or replays the game
- **THEN** how many snakes each team fields is read off the placed snakes and their team assignments — the parameter that decided it is never forwarded, because the board it produced already says what it produced

### Requirement: game-configuration/initial-food
Depends on: game-engine/domain-vocabulary.

After all starting positions are assigned, board generation SHALL spawn `snakesPerTeam` food items per starting territory — one per snake of the owning team — each on a seeded-random distinct eligible cell within that territory: inner, non-Wall, non-Hazard, and not occupied by any snake body. Initial food eligibility ignores fertile designations.

#### Scenario: #food-count-per-territory
- **WHEN** a game with N teams and S snakes per team is set up
- **THEN** exactly N × S food items are placed, S inside each starting territory, on distinct eligible cells — Fertile or not

### Requirement: game-configuration/board-generation-retry

Board generation SHALL be an all-or-nothing attempt, retried on failure with deterministic sub-seeds derived from the game seed and the attempt index, up to three retries (four attempts total); if all attempts fail, generation SHALL be reported infeasible with a machine-readable error. Every random choice generation makes SHALL be drawn from the game seed, and that seed SHALL be accessible to no game client.

#### Scenario: #failure-conditions
- **WHEN** an attempt runs
- **THEN** it fails if hazard connectivity cannot be satisfied, or any team's territory lacks `snakesPerTeam` eligible starting cells of the chosen parity, or any starting territory holds fewer than `snakesPerTeam` distinct eligible initial-food cells after head placement

#### Scenario: #reproducible-retries
- **WHEN** the same game seed is used twice
- **THEN** the sequence of attempts and the final outcome are identical

#### Scenario: #infeasible-configuration
- **WHEN** all four attempts fail
- **THEN** the game is left unplayable, the error identifies the constraint that failed on the last attempt, and the room owner can reconfigure and re-provision

### Requirement: game-configuration/conditional-parameter-semantics
Depends on: game-engine/configuration-parameters.

Feature disablement SHALL be encoded solely by the zero sentinels the two halves of the vocabulary declare, with no auxiliary gating flags to validate against. A dependent parameter whose gate is off SHALL still accept and persist any in-range value, which is simply ignored while gated; editing surfaces SHALL visually gate such parameters and communicate their inactivity without blocking persistence.

#### Scenario: #gated-value-persists-and-is-ignored
- **WHEN** fertile-ground clustering is set to a valid value while fertile-ground density is 0
- **THEN** the value persists on the record and has no effect on generation; raising density above 0 later brings the stored clustering into effect without re-entry

#### Scenario: #ui-communicates-without-blocking
- **WHEN** a user edits a dependent parameter whose gating parameter is off
- **THEN** the surface shows the parameter as currently inactive but still lets the value be persisted

### Requirement: game-configuration/board-preview
Depends on: global-invariants/one-shared-engine, global-invariants/one-shared-generation, global-invariants/state-confined-to-owning-runtime#clients-restart-clean.

Any change to what a board is generated from on a not-yet-launched game — a board-affecting parameter, the number of players, or the team composition — SHALL regenerate the board preview by running the one shared board-generation implementation platform-side against the game's current inputs; boards are only ever generated by the platform, never by a client, so the preview is produced by the same generation the launch will use. Each regeneration SHALL overwrite the game's single current-preview value, which is delivered reactively to every configuration surface so that all viewers render the same candidate; surfaces render the delivered preview and SHALL NOT run any board-generation algorithm themselves. The current-preview value holds only the latest candidate — prior candidates are not retained — and it designates the game's starting state only through lock-in or launch.

#### Scenario: #one-slot-no-archive
- **WHEN** board-affecting parameters are edited repeatedly, generating a stream of candidate previews
- **THEN** each regeneration overwrites the one current-preview value; no archive of past candidates accumulates, and abandoning a candidate is simply regenerating

#### Scenario: #roster-change-regenerates
- **WHEN** the number of players or the composition of teams changes on a not-yet-launched game, without any parameter being touched
- **THEN** the preview regenerates all the same, because the roster is one of the inputs generation reads — a stale board drawn for a roster that no longer applies is never left standing

#### Scenario: #all-viewers-in-sync
- **WHEN** several configuration surfaces show a game concurrently, or one rejoins after a refresh
- **THEN** every one of them renders the same current preview from the shared platform-held value — none holds a private candidate, and none survived the refresh

#### Scenario: #clients-render-never-generate
- **WHEN** the preview updates after a parameter edit
- **THEN** the surface renders the platform-generated state it received reactively; because no board generation runs client-side, what is shown is exactly what locking would designate

#### Scenario: #a-playing-game-is-never-touched
- **WHEN** a preview regenerates while another game in the same room is being played
- **THEN** the playing game is unaffected — preview state belongs only to the not-yet-launched game being configured

### Requirement: game-configuration/board-preview-lock-in
Depends on: global-invariants/transactional-invariant-enforcement.

A per-game boolean lock SHALL designate the current-preview value as the game's starting state for the upcoming launch. A lock request carries no board data — the flag designates the platform-held current preview, so what launches is always a board the platform generated and every viewer saw. While locked, launch SHALL use the designated board exactly, and any change to what the board is generated from — a board-generation parameter, the number of players, or the team composition — SHALL clear the lock as it regenerates the preview, so a frozen configuration and a launched board can never describe different generation inputs. When no board is locked at launch, launch SHALL generate a fresh board from the then-current inputs and a fresh seed, persist it as the game's starting state, and SHALL NOT surface it to any configuration-mode view — it first becomes visible through gameplay delivery once the game is under way.

#### Scenario: #locked-board-launches-exactly
- **WHEN** the lock is set at launch
- **THEN** the game starts on precisely the current-preview value the lock designated — what the configuration surface showed is what the players get

#### Scenario: #lock-carries-no-board-data
- **WHEN** a lock request arrives accompanied by board data fabricated by a client
- **THEN** the supplied data is irrelevant: the flag designates only the platform-held current preview, which is what launches

#### Scenario: #board-affecting-edit-clears-the-lock
- **WHEN** a board-generation parameter is edited while the lock is set
- **THEN** the lock clears and the regenerated candidate arrives unlocked — re-locking is a deliberate act on the new preview

#### Scenario: #roster-change-clears-the-lock
- **WHEN** the number of players or the composition of teams changes while the lock is set, with no parameter touched
- **THEN** the lock clears exactly as a parameter edit clears it — the designated board was generated for a roster that no longer applies, so it may not stand into launch

#### Scenario: #a-dynamic-gameplay-edit-leaves-the-lock-standing
- **WHEN** a parameter board generation does not read is edited while the lock is set — the turn limit, the limit on wall-clock duration, a clock value, hazard damage
- **THEN** the lock stands and no preview regenerates: none of these is an input the designated board was generated from, so clearing a deliberate designation over one of them would discard it for no reason

#### Scenario: #lock-toggles-freely-before-launch
- **WHEN** the lock is set, cleared, and set again while the game awaits launch
- **THEN** each set designates the current preview at that moment; only the designation standing at launch has any effect

#### Scenario: #unlocked-regeneration-stays-hidden
- **WHEN** no lock is set at launch
- **THEN** the fresh-seed result is persisted but shown in no configuration-mode view; players first encounter the board in play, preserving board surprise

### Requirement: game-configuration/infeasibility-surfaced
Depends on: global-invariants/client-truthfulness#rejections-reach-the-user.

When board generation fails — during a preview regeneration or during launch — generation's structured infeasibility error SHALL reach the configuring user reactively, identifying the constraint that failed so the configuration can be adjusted and retried; a launch whose board generation fails SHALL NOT proceed.

#### Scenario: #failure-names-the-constraint
- **WHEN** generation reports infeasibility — for example, a starting territory cannot seat its snakes
- **THEN** the configuring user sees which constraint failed on the final attempt, not a generic error

#### Scenario: #failed-launch-halts
- **WHEN** generation fails during launch itself (the unlocked fresh-seed path)
- **THEN** the launch does not proceed, and the same structured error reaches the configuring user for reconfiguration

### Requirement: game-configuration/self-contained-configuration-surface

The configuration surface SHALL be a self-contained component that needs no surrounding application context to function: mounted on its own it presents the whole parameter set, the board generated from it, and the lock. Its outputs SHALL be the game's configuration serialised exactly as the record stores it, plus a rendered view of that generated board. Embedding the component in a larger context adds context to it and SHALL never be a precondition for it working.

#### Scenario: #runs-with-no-host
- **WHEN** the component is mounted with nothing around it
- **THEN** it is fully usable — every parameter editable, the generated board rendered, the lock operable — and the configuration it emits is complete enough to start a game from

#### Scenario: #output-is-the-stored-shape
- **WHEN** the component emits a game's configuration
- **THEN** it emits exactly the shape the configuration record holds, with no surface-specific wrapper or renaming, so what a reader inspects and what the engine consumes are one document

### Requirement: game-configuration/host-selected-affordances
Depends on: global-invariants/one-contract-many-surfaces, application-shell/surface-mounting-contract.

The configuration surface SHALL group its affordances into three kinds — **inspection** (reading the parameters and the current board), **parameter editing**, and **board designation** (setting and clearing the lock) — and SHALL take, when it is mounted, an explicit parameter per kind stating whether that kind is offered. The three kinds SHALL be independently selectable, so that a host offering one of them is never obliged to offer another.

#### Scenario: #inspection-only-mounting
- **WHEN** the component is mounted offering inspection alone
- **THEN** it renders the parameters and the current board with no editing or lock affordance present, and remains fully functional as a view

#### Scenario: #editing-without-designation
- **WHEN** the component is mounted offering inspection and parameter editing but not board designation
- **THEN** parameters can be changed and the preview regenerates as usual while the lock is absent — the kinds are independently selectable

