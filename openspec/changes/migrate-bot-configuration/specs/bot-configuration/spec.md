## Purpose

How a team configures its automated player. This capability owns the
configuration state the bot framework consumes and the workflows that edit
it: the team's persistent heuristic default configuration and bot parameter
record, the captain's exclusive authority over both, the capture of those
defaults into each game at start, the per-snake portfolio editing every
member performs live during play — Drives with concrete targets, weight and
activation overrides, the temperature override — and the derivation of the
effective configuration and effective temperature the framework consumes as
opaque inputs. Two authority grains structure everything here: team-scoped
defaults belong to the captain alone, while game-scoped portfolio editing
belongs to the whole roster. What the configured heuristics mean — the
Drive/Preference vocabulary and the decision engine that runs them —
belongs to the framework story; when decided moves are submitted, and the
consumption of the submission-timing parameters stored here, belongs to the
pacing story; how decision state is rendered and explained belongs to the
transparency story; which operator holds a snake belongs to the operator
story.

Depends on: bot-framework, team-management.

## ADDED Requirements

### Requirement: bot-configuration/team-heuristic-defaults
Each Centaur Team SHALL have a persistent **heuristic default
configuration**, keyed by heuristic identifier, over the Drives and
Preferences available to it (bot-framework/heuristic-vocabulary): for each
Preference, whether it is active on new snakes by default and its default
weight; for each Drive type, its default weight when added to a snake and a
human-readable nickname for display. Weights are the relative-importance
lever of bot-framework/scalar-discipline. The configuration SHALL be
team-scoped — owned by the team, not by any server that hosts it — and
SHALL persist for the lifetime of the team.

#### Scenario: #server-replacement-inherits-defaults
- **WHEN** a team replaces its hosting server
- **THEN** the new server serves the team's existing heuristic defaults unchanged — configuration belongs to the team, and no server change resets, re-seeds, or re-homes it

#### Scenario: #archiving-preserves-configuration
- **WHEN** a team is archived and later unarchived (team-management/archive-not-delete)
- **THEN** its heuristic defaults and bot parameters are exactly as they were at archiving — team-scoped bot configuration is never deleted or reset by any team lifecycle event

### Requirement: bot-configuration/team-bot-parameters
Each Centaur Team SHALL have a persistent **bot parameter record** holding:
the team's default softmax temperature; three submission-timing parameters
— an automatic submission time allocation, a scheduled-submission interval,
and an imminent-deadline threshold — which this capability stores, edits,
and snapshots as opaque team-tunable scalars whose consumption semantics
are owned elsewhere; and the ordered pinned-heuristics list that governs
Drive ordering (bot-configuration/drive-management-interface).

#### Scenario: #timing-parameters-are-tunable-not-constants
- **WHEN** a team's hosting topology makes the built-in submission timing wrong for it
- **THEN** the timing values are editable per team as ordinary bot parameters — retuning them requires no code change and no redeployment

#### Scenario: #pinning-is-team-configuration
- **WHEN** the captain pins or reorders heuristics
- **THEN** the pinned list is stored on the team's bot parameter record — ordering preference is team configuration every member's client reflects, not local client state

### Requirement: bot-configuration/captain-only-team-configuration
Only a team's current captain (team-management/team-record) SHALL be able
to mutate the team's heuristic default configuration and bot parameter
record — creating, updating, and deleting default entries, editing
parameters, and pinning. The captain gate SHALL be enforced server-side at
the mutating function contract; interface gating reflects it and never
substitutes for it. Team-scoped bot configuration SHALL be readable by
every current member and by the team's coaches
(team-management/coaches) at all times, regardless of any game's state.

#### Scenario: #non-captain-write-rejected-at-the-function
- **WHEN** a member who is not the captain invokes a team-configuration mutation directly, bypassing every interface affordance
- **THEN** the mutation is rejected server-side — the captain check lives at the function contract, not in the interface

#### Scenario: #members-and-coaches-read-regardless-of-game-state
- **WHEN** any current member or designated coach reads the team's heuristic defaults or bot parameters — mid-game or between games
- **THEN** the read succeeds; readability of team configuration never depends on whether a game is in progress

#### Scenario: #captaincy-change-applies-without-reload
- **WHEN** captaincy is transferred while members have configuration surfaces open
- **THEN** the captain-gated affordances follow the transfer reactively — the new captain gains them and the former captain loses them without anyone reloading

### Requirement: bot-configuration/game-start-snapshot
At each game's start the team's heuristic defaults and bot parameters SHALL
be captured for that game: every team snake's portfolio is initialised from
the captured defaults — each active-by-default Preference present at its
default weight, no Drives, and no per-snake overrides — and the bot
parameters are copied into game-scoped values that may be adjusted during
the game independently of the team defaults. Edits to team-scoped
configuration SHALL never affect any game already in progress, and the
configuration surfaces SHALL make explicit that edits take effect from the
next game.

#### Scenario: #in-progress-game-unaffected
- **WHEN** the captain edits a default or parameter while the team's game is being played
- **THEN** the running game's captured values and every snake's portfolio are untouched — the edit is first visible in the team's next game

#### Scenario: #initial-portfolio-is-defaults-only
- **WHEN** a game starts
- **THEN** each team snake's portfolio holds exactly the active-by-default Preferences at their default weights — no Drives, no overrides; Drives and overrides accrue only through play

#### Scenario: #game-scoped-values-fork-from-defaults
- **WHEN** a game-scoped parameter value — the temperature among them — is adjusted during play
- **THEN** the team default is unchanged, and a simultaneous default edit leaves the game value unchanged — the launch capture severs the two

#### Scenario: #surfaces-say-future-games-only
- **WHEN** a member views a team-scoped configuration surface
- **THEN** the surface states that edits configure future games only — the snapshot semantics are communicated, not left for the team to discover mid-game

### Requirement: bot-configuration/registry-defines-availability
The heuristics a team can operate SHALL be the **intersection** of its
heuristic default configuration with the heuristic registry compiled into
its hosting server's build: a registry entry with no configuration row is
not yet operable, and a configuration row whose identifier the current
build does not register is retained but inert — never offered in play,
never evaluated. No interface SHALL offer an affordance to add a Drive
outside this intersection.

#### Scenario: #stale-rows-retained-not-deleted
- **WHEN** a server replacement drops heuristics the team had configured
- **THEN** the orphaned rows survive untouched — displayed on the heuristic configuration surface visibly marked stale, with a captain-only delete affordance — while vanishing from every in-game affordance; cleanup is the captain's decision, never automatic

#### Scenario: #unconfigured-registry-entries-not-offered
- **WHEN** a newly registered heuristic has no configuration row yet
- **THEN** it appears in no in-game Drive affordance until its row exists (bot-configuration/registry-sync-insert-only)

#### Scenario: #no-unregistered-drive-affordance
- **WHEN** an operator manages Drives during a game
- **THEN** every Drive type offered is in the current intersection — nothing offers a Drive the running server cannot evaluate

### Requirement: bot-configuration/registry-sync-insert-only
Configuration rows for newly registered heuristics SHALL enter the team's
heuristic default configuration through a **registry sync** that runs when
the captain visits the team's heuristic configuration surface, inserting a
row at the registry's declared defaults for each registered heuristic that
has none. The sync SHALL be insert-only: it never modifies an existing row,
so captain-edited values survive every sync and every registry change. The
bot framework SHALL never write the team's heuristic defaults or bot
parameters — team-scoped configuration changes only through the captain's
own workflows.

#### Scenario: #captain-visit-adopts-new-heuristics
- **WHEN** the captain first visits the heuristic configuration surface after the server's registry gained new heuristics
- **THEN** rows for the new heuristics appear at the registry's defaults and the addition is surfaced to the captain — the visit is the captain's act of adopting the registry's defaults; no background process adopts them unattended

#### Scenario: #sync-never-overwrites
- **WHEN** the sync runs against heuristics whose rows already exist — however many times, and whatever the registry now declares as defaults
- **THEN** those rows are left untouched — a captain-authored weight, activation flag, or nickname is never silently reverted to a registry default

#### Scenario: #framework-never-writes-configuration
- **WHEN** the framework runs — including observing missing or stale configuration rows
- **THEN** it writes nothing to team-scoped configuration; a running game has no path by which it could mutate the team's defaults

### Requirement: bot-configuration/per-snake-portfolio-record
For each team snake in each active game the platform SHALL persist a
**portfolio record** realising the snake's portfolio
(bot-framework/per-snake-portfolio): its active Drives — each with a
concrete target, a specific snake or a specific cell, and a current weight
— and its deviations from the game's captured defaults: weight overrides,
Preference activation overrides, and a nullable temperature override. A
Drive SHALL always carry a concrete target; a Drive whose target cannot
currently be resolved against the board is omitted from play — contributing
nothing — but never deleted by the platform, re-entering automatically if
its target becomes resolvable again. The record SHALL persist across turns,
and no selection change or turn transition SHALL reset any part of it.

#### Scenario: #no-drive-without-a-target
- **WHEN** a Drive is added to a snake's portfolio
- **THEN** it is added with its concrete target already chosen — no targetless or pending-target Drive ever exists in a portfolio

#### Scenario: #dead-target-omits-never-deletes
- **WHEN** a Drive's target snake dies, or its cell target becomes unresolvable
- **THEN** the Drive stops contributing but its record remains — listed for an operator to remove or keep — and if the target becomes resolvable again the Drive resumes contributing without being re-added

#### Scenario: #temperature-override-survives-deselection
- **WHEN** an operator sets a snake's temperature override and later stops working with that snake
- **THEN** the override persists exactly as Drives and weight overrides do — deselection and turn transitions reset nothing in the portfolio record

### Requirement: bot-configuration/any-member-live-editing
During a game, every current member of the owning team
(team-management/roster-of-operators) SHALL be able to mutate its snakes'
portfolio records: adding a Drive with a target, removing a Drive,
retargeting a Drive, changing Drive and Preference weights, toggling a
Preference's activation, and setting or clearing the temperature override.
This game-scoped editing authority is deliberately broader than the
team-scoped captain gate
(bot-configuration/captain-only-team-configuration). Edits SHALL take
effect on the running player reactively: the framework observes them and
rescores without restarting and without discarding accumulated evaluation
(bot-framework/turn-scoped-evaluation) — a weight change is pure rescoring
of already-evaluated worlds (bot-framework/reactive-inputs).

#### Scenario: #any-member-not-only-captain
- **WHEN** an ordinary member — not the captain — edits a snake's Drives, weights, activations, or temperature override mid-game
- **THEN** the edit succeeds; the captain gate covers team defaults only, never live portfolio editing

#### Scenario: #weight-edit-keeps-evaluated-work
- **WHEN** a member changes a portfolio weight mid-turn
- **THEN** already-evaluated worlds are rescored under the new weight — nothing is re-simulated, no evaluation progress is lost, and the new scores stand at the snake's next decision

#### Scenario: #edits-never-touch-team-defaults
- **WHEN** any portfolio edit is made during a game
- **THEN** the team's heuristic defaults and bot parameters are unchanged — game-scoped editing writes game-scoped state only

### Requirement: bot-configuration/effective-configuration
A snake's **effective heuristic configuration** at any moment SHALL be the
game's captured team defaults overlaid by the snake's portfolio record: an
override wins wherever one is present, the captured default applies
otherwise, field by field. The effective configuration SHALL be computable
from persisted state alone — any authorised reader derives it from the
captured defaults and the portfolio record without negotiating with the
framework or any other party.

#### Scenario: #override-wins-field-by-field
- **WHEN** a snake overrides one Preference's weight
- **THEN** only that field deviates — the Preference's activation and every other heuristic still read from the captured defaults; overlaying is per field, never a wholesale replacement of the snake's configuration

#### Scenario: #derivable-by-any-reader
- **WHEN** any authorised consumer — the framework, an interface, an auditor — needs a snake's effective configuration
- **THEN** the persisted captured defaults and portfolio record suffice to compute it; no additional channel or party is consulted

### Requirement: bot-configuration/effective-temperature
A snake's **effective temperature** SHALL be its temperature override when
one is set, otherwise the team's game-scoped temperature value, derived
reactively: a change to either source is reflected at the snake's next
sampling decision (bot-framework/softmax-decision) with no cache
invalidation and no restart, the result reaching the framework as the
single opaque scalar of its portfolio contract
(bot-framework/per-snake-portfolio). Lower temperature SHALL bias decisions
more strongly toward the highest-scoring direction and higher temperature
toward more uniform sampling — this direction of effect is the calibration
contract operators tune against.

#### Scenario: #override-else-team-value
- **WHEN** a snake's temperature override is cleared
- **THEN** its effective temperature is the team's game-scoped value from the next decision on — clearing restores the derivation, never a frozen copy of the old override

#### Scenario: #change-applies-at-next-decision
- **WHEN** either temperature source changes mid-turn
- **THEN** no evaluation state is invalidated and nothing restarts — the next sampling decision simply uses the newly derived scalar

#### Scenario: #lower-is-more-deterministic
- **WHEN** an operator lowers a temperature
- **THEN** sampling concentrates more strongly on the best-scoring directions; raising it flattens the distribution — the sign of the effect is stable, so calibration carries across games

### Requirement: bot-configuration/team-configuration-surfaces
The application SHALL provide two team-scoped configuration surfaces per
hosted team: a **heuristic configuration page** listing the team's
heuristic default configuration and editing, per Preference, the
active-by-default flag and default weight and, per Drive type, the default
weight, nickname, and pinned status and order; and a **bot parameters
page** editing the bot parameter record — the temperature default and the
submission-timing parameters. Both surfaces SHALL operate exclusively on
team-scoped configuration, mutating no per-snake or per-game state, and the
bot parameters page SHALL expose no parameter of the game's rules
configuration.

#### Scenario: #read-only-below-captain
- **WHEN** a non-captain member opens either surface
- **THEN** everything is visible but every editing affordance is disabled — a read-only presentation mirroring the server-side captain gate, never substituting for it

#### Scenario: #pages-cannot-touch-games
- **WHEN** either surface is used, whatever is edited
- **THEN** no game-scoped or per-snake state changes — the surfaces write team defaults and parameters only

#### Scenario: #no-game-rules-here
- **WHEN** the bot parameters page is inspected
- **THEN** no game-rules parameter appears on it — tuning the team's bot and configuring a game never share a surface

### Requirement: bot-configuration/drive-management-interface
The live interface SHALL let an operator manage a snake's Drives in place.
A Drive-type chooser SHALL offer the operable Drive types
(bot-configuration/registry-defines-availability) ordered pinned-first:
pinned heuristics in their pinned order, the remainder lexicographically by
nickname with identifier as tiebreak. Choosing a Drive type SHALL enter a
targeting mode that highlights exactly the targets its target-eligibility
predicate accepts (bot-framework/heuristic-vocabulary), dims the rest,
supports deterministic keyboard cycling through eligible targets
nearest-first, and can be cancelled without side effects; confirming an
eligible target adds the Drive at its default weight with no further step.
The snake's active Drives SHALL be listed with their targets and weights,
weight-editable and removable, every edit taking effect immediately
(bot-configuration/any-member-live-editing).

#### Scenario: #pinned-first-ordering
- **WHEN** the Drive chooser opens on any member's client
- **THEN** pinned heuristics lead in the captain's pinned order and the remainder follow lexicographically by nickname — the ordering the captain configured, identical on every client

#### Scenario: #only-eligible-targets-confirmable
- **WHEN** targeting mode is active
- **THEN** only targets the Drive's eligibility predicate accepts respond to confirmation — no gesture can make an ineligible snake or cell a target

#### Scenario: #deterministic-cycling
- **WHEN** an operator cycles candidate targets from the same board state
- **THEN** the traversal order is identical every time — nearest candidates first, remaining ties broken deterministically — so keyboard targeting is reliable under time pressure

#### Scenario: #single-click-commits
- **WHEN** an operator confirms an eligible target
- **THEN** the Drive is added to the portfolio at its default weight immediately — targeting is the confirmation, with no additional dialog

#### Scenario: #cancel-leaves-no-trace
- **WHEN** targeting is cancelled
- **THEN** no Drive is added and nothing else about the operator's working state changes
