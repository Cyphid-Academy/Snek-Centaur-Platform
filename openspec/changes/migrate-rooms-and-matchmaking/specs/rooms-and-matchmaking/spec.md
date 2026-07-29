## Purpose

Getting teams into games. A room is the persistent meeting place where a
succession of games is played: any user can found one, an optional owner
governs it, Centaur Teams are enrolled in it, and it always holds a
current game whose readiness state fills up — captain by captain — until
the room's administrative actor starts it. A room is at every moment
either configuring that next game or playing its current one, and while it
plays it settles nothing further. This capability owns the room
record and its lifecycle (ownership, abdication, archival), those two
modes, team
enrolment, the captain-declared readiness that expresses a team's consent
to play, the start gate over enrolment and readiness, and the discovery
surfaces — browser and lobby — through which players find and join the
action. A room may instead be created by a competition format as the
setting for a contest it governs, and this capability owns the shape of
that arrangement too: which of a room's acts such a format reserves, and
that the room is otherwise an ordinary room. What a start sets in motion
— the launch, its own gates, the game's life and its successor — belongs
to the game lifecycle; the parameter values being configured belong to
game configuration; the teams being enrolled are run by their captains
elsewhere; and the formats that govern rooms define themselves.

Depends on: game-lifecycle, game-configuration, team-management, global-invariants.

## ADDED Requirements

### Requirement: rooms-and-matchmaking/room-record
Depends on: game-configuration/config-lives-on-the-game, game-lifecycle/successor-auto-creation#atomic-with-currency.

The platform SHALL maintain a persistent record of every room, capturing at minimum the room's name, its optional owner, a reference to the room's current game, the set of Centaur Teams currently enrolled, and whether the room is archived. The room record SHALL hold no game-configuration state and no readiness state of its own: both live on the current game's own record, and every room-scoped view of them reads that record.

#### Scenario: #no-parameter-state-on-the-room
- **WHEN** a room's parameter values or readiness state are read or written through any surface
- **THEN** the reads and writes address the current game's own record — the room carries nothing that could go stale, or race, as games turn over

#### Scenario: #currency-moves-with-the-succession
- **WHEN** the room's current game finishes and its successor is auto-created
- **THEN** the room's current-game reference designates the successor, and the finished game remains reachable as history rather than as the room's current game

### Requirement: rooms-and-matchmaking/room-creation
Depends on: game-lifecycle/game-record, global-invariants/transactional-invariant-enforcement.

Any authenticated user SHALL be able to create a room, supplying at minimum its name; the creating user becomes the room's owner at creation. A room MAY also be created by a competition format as the setting for a contest it governs, in which case the user on whose behalf the format acts becomes its owner — a format never founds an ownerless room. Creating a room SHALL also eagerly create the room's initial game — a not-yet-launched game record with default parameter values and no team ready — installed as the room's current game in the same act, so a room never exists without a current game.

#### Scenario: #a-formats-room-is-an-ordinary-room
- **WHEN** a competition format creates the room its contest will be played in
- **THEN** the room is an ordinary room in every respect this capability defines — named, owned, born with a current game, discoverable, and readable in the lobby; only the specific acts the format reserves are withheld from its owner

#### Scenario: #born-with-a-game
- **WHEN** a room has just been created
- **THEN** its current game already exists with default configuration and empty readiness — parameter editing and readiness declarations can begin immediately, with no separate game-creation step for anyone to perform or forget

#### Scenario: #creator-owns-from-the-first-instant
- **WHEN** the creating user acts on the room immediately after creation
- **THEN** they hold the owner's full administrative control; no interval exists in which the new room is ownerless or controlled by anyone else

### Requirement: rooms-and-matchmaking/room-administration
Depends on: game-configuration/launch-freeze, global-invariants/security-enforced-outside-the-library.

Each room SHALL have an administrative actor holding administrative control over it: managing team enrolment, configuring the room's current not-yet-launched game within its edit window, starting the game, abdicating ownership, and archiving the room. While the room has an owner, the administrative actor SHALL be exactly the owner; when it has no owner, every authenticated user with access to the room SHALL hold equivalent administrative control. An owner MAY abdicate ownership, after which the room is ownerless; abdication SHALL be irreversible — the platform never reassigns ownership of a room to anyone. Surfaces SHALL expose administrative affordances exclusively to the administrative actor, mirroring an authority enforced where the platform's security enforcement lives. While a competition format governs the room, the acts that format reserves — at minimum enrolling and removing teams, starting the room's current game, and archiving the room — SHALL be the format's alone and SHALL be refused to every user, the administrative actor included; every other administrative act stays with the administrative actor for as long as the format governs.

#### Scenario: #reserved-acts-belong-to-the-governing-format
- **WHEN** the administrative actor of a room a competition format governs attempts one of the acts that format reserves
- **THEN** it is rejected for as long as the format governs the room — those acts follow the format's own rules, and the actor keeps the control the format did not reserve

#### Scenario: #ownerless-means-open-control
- **WHEN** a room has no owner and any authenticated user with access to it performs an administrative act — enrolment change, configuration edit, game start, archival
- **THEN** the act is permitted exactly as it would be for an owner; open control is the defined administrative state of an ownerless room, not a gap

#### Scenario: #abdication-is-forever
- **WHEN** ownership of a room has been abdicated and any party — the former owner included — seeks to become its owner
- **THEN** no path exists: the room remains ownerless for the rest of its life, and the former owner retains only the same open control every authenticated user now holds

#### Scenario: #non-actor-rejected-at-the-function
- **WHEN** a user who is not an owned room's administrative actor invokes an administrative mutation directly, bypassing every surface affordance
- **THEN** the mutation is rejected; the absence of the affordance in their view of the lobby was never what stopped them

### Requirement: rooms-and-matchmaking/room-mode
Depends on: game-configuration/launch-freeze, game-lifecycle/launch-orchestration, game-lifecycle/status-authority, game-lifecycle/successor-auto-creation#atomic-with-currency, game-lifecycle/competitive-engagement, global-invariants/transactional-invariant-enforcement.

A room SHALL be in exactly one of two modes at every moment of its life: **configuring** its next game, or **playing** its current one. A room is configuring while its current game awaits launch and no launch of that game is under way; it plays from the moment a launch of that game begins until the room's current game is once again one awaiting launch — the successor installed once the game reached its terminal state, or that same game again when its launch aborted before play began. While a room is playing, every change to its enrolled set SHALL be refused, and the refusal SHALL live with the mutation that handles the write rather than with the absence of an affordance; the parallel bar on editing that game's parameter values belongs to the configuration story, which freezes them over the same interval. A team is therefore only ever enrolled in a room that is configuring, and the enrolled set a game was launched from cannot be edited underneath it while it runs.

#### Scenario: #enrolment-refused-while-playing
- **WHEN** an enrolment or a removal is addressed to a room while a game is under way in it — through a surface affordance or by invoking the mutation directly
- **THEN** it is rejected for as long as the room plays; the roster a room's game was launched from is settled before the launch begins, so no team joins a room's participant set after the game it would have played in is already going

#### Scenario: #the-withdrawal-is-the-one-change-a-playing-room-admits
- **WHEN** a team is archived while it is enrolled in a room where a game is under way — reachable only for a team that game did not seat, because a team participating in a game being played is competitively engaged and cannot be archived at all
- **THEN** the withdrawal lands and the enrolment is dropped: it is the one enrolment change a playing room admits, licensed because the team it drops was never a participant of that game, and refusing it would hold a retiring team hostage to a game it is not playing in

#### Scenario: #configuring-resumes-with-the-successor
- **WHEN** the room's current game reaches its terminal state and its successor becomes the room's current game
- **THEN** the room is configuring again in that same moment, with enrolment changes open on the successor — no interval exists in which the finished game is still the room's current game and the room is therefore neither configuring nor playing

#### Scenario: #the-mode-is-never-a-stored-flag
- **WHEN** the room's mode is read at any moment of the room's life — just created, mid-launch, mid-play, the instant a game finishes
- **THEN** it is derived from the room's current game and nothing else; the room record carries no mode of its own that could fall out of step with the game whose progress defines it

### Requirement: rooms-and-matchmaking/team-enrolment
Depends on: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard, team-management/archive-not-delete, game-lifecycle/roster-snapshot, global-invariants/game-instance-hermeticity#seeded-once-never-refreshed, game-configuration/board-preview-lock-in.

The room's administrative actor SHALL be able to enrol Centaur Teams in the room and to remove them, except where a competition format governing the room has reserved that act; enrolment requires no acceptance step by the team — a team's consent to actually play is expressed through its captain's readiness declaration, not through enrolment. The enrolled teams form a set: a team is enrolled at most once, however enrolments interleave. Enrolling an archived team SHALL be rejected. Enrolment changes affect which teams the room's future starts consider; they never alter a game already launched — which is what makes an archival-driven withdrawal safe even when it lands on a room where a game is under way. Because a board is generated from the roster as much as from the parameters, an enrolment change on the room's not-yet-launched current game SHALL clear any board standing designated for that game's launch and regenerate its preview, in the same transaction that commits the enrolment change. Archiving a Centaur Team SHALL withdraw it from the enrolled set of every room in which it is enrolled, committed in the same transaction as the archival, so no moment exists at which an archived team sits enrolled where a subsequent start could still reach it. That withdrawal is an enrolment change in every respect: it clears a standing board designation and regenerates the preview exactly as a removal the administrative actor performs does, and it leaves a game already launched untouched.

#### Scenario: #enrolment-change-clears-a-standing-board
- **WHEN** a team is enrolled in, or removed from, a room whose not-yet-launched current game has a board designated for launch
- **THEN** the designation is cleared and the preview regenerated as part of the same act — a late join, or a removal, never leaves a board designated that was generated for a different set of teams, and no window exists in which a start could consume one

#### Scenario: #enrolment-is-a-set
- **WHEN** two racing enrolments name the same team, or an enrolment names a team already enrolled
- **THEN** the room's enrolled set afterwards contains that team exactly once — no duplicate enrolment ever exists to count twice toward the start gate

#### Scenario: #archived-team-cannot-enrol
- **WHEN** enrolment names a team that is archived
- **THEN** it is rejected; the team becomes enrollable again only once it has been unarchived

#### Scenario: #archiving-withdraws-the-team-from-every-room
- **WHEN** a team is archived while it is enrolled in several rooms
- **THEN** the archival and its withdrawal from every one of those rooms' enrolled sets commit together — no window exists in which the team is archived and still enrolled, so no later start has to turn an archived team away at all

#### Scenario: #the-withdrawal-clears-a-standing-board-too
- **WHEN** the withdrawal that archiving performs lands on a room whose not-yet-launched current game has a board designated for launch
- **THEN** the designation is cleared and the preview regenerated in that same transaction — an archival-driven withdrawal is an enrolment change like any other, never a quiet edit that leaves a board standing for a team that will never play

#### Scenario: #removal-never-reaches-a-launched-game
- **WHEN** a team is withdrawn by archiving from a room where a launched game is under way — the only enrolment change that ever lands while a room is playing
- **THEN** the launched game is untouched — its participation was bound at initialization by its snapshot, and nothing changed in the room afterwards can reach the running instance — and the withdrawal takes effect only for the room's subsequent starts

### Requirement: rooms-and-matchmaking/team-readiness
Depends on: team-management/team-record, global-invariants/security-enforced-outside-the-library, game-lifecycle/successor-auto-creation.

Each not-yet-launched game SHALL carry, from its creation onward, a per-enrolled-team readiness state, and only the enrolled team's current captain SHALL be able to declare their team ready or retract that declaration; no other member, and no room actor, sets it for them. Readiness SHALL be scoped to the one game it is declared for: every freshly created game — a room's initial game or an auto-created successor — begins with no team ready. To everyone but the team's captain, readiness SHALL be visible strictly as a read-only indicator.

#### Scenario: #captain-only-even-for-insiders
- **WHEN** a non-captain member of the team — or the room's administrative actor — attempts to declare or retract that team's readiness, through an affordance or by invoking the mutation directly
- **THEN** it is rejected; their surfaces offer readiness only as a read-only indicator, with no toggling affordance

#### Scenario: #stale-readiness-never-survives
- **WHEN** a successor game is auto-created after its predecessor finishes
- **THEN** the successor begins with every team not ready — a team ready for the finished game has expressed nothing about the next one, and leftover readiness can never trigger an unintended start

#### Scenario: #retractable-until-start
- **WHEN** a captain retracts their team's readiness while the game is still not started
- **THEN** the retraction applies and the start gate immediately stops counting the team as ready

### Requirement: rooms-and-matchmaking/game-start-gate
Depends on: global-invariants/transactional-invariant-enforcement, game-lifecycle/launch-orchestration, game-lifecycle/launch-gates, global-invariants/client-truthfulness#enablement-derives-from-server-state.

This gate governs the starts a user initiates. Only the room's administrative actor SHALL be able to initiate the start of the room's current game, and initiation SHALL be permitted only when the room has at least two enrolled Centaur Teams and every enrolled team has declared itself ready. Initiation is where the room stops configuring and starts playing, so the gate SHALL be checked authoritatively at initiation itself, never inherited from what a surface last offered: it is the last point at which the room's own preconditions are established, so a readiness retracted or an enrolment changed after a surface enabled the affordance is caught here. A permitted initiation hands the game to launch orchestration, whose own gates may still block or abort the launch — passing the room's gate is necessary, never sufficient. The start affordance is gated by this gate, and while it is disabled the surface SHALL name to the administrative actor which precondition is unmet. A schedule-bound competition format governing the room SHALL be exempt: its games begin at the moments that format schedules, started by the platform with no user initiation and no readiness consulted, and the room offers no start affordance while it governs.

#### Scenario: #unanimity-over-the-whole-enrolled-set
- **WHEN** two enrolled teams are ready but a third enrolled team is not
- **THEN** the start is not permitted — readiness is unanimous over every enrolled team, not a quorum of two

#### Scenario: #gate-checked-at-initiation-not-in-the-surface
- **WHEN** a captain retracts readiness, or enrolment changes, in the instant between the surface enabling the start affordance and the initiation arriving
- **THEN** the authoritative check at initiation rejects the start; a stale enabled affordance never starts a game

#### Scenario: #disabled-start-explains-itself
- **WHEN** the administrative actor views the lobby while the gate is unsatisfied — too few teams enrolled, or teams not yet ready
- **THEN** the start affordance is disabled and the view names the unmet precondition, so the actor knows what they are waiting on

#### Scenario: #a-scheduled-start-does-not-consult-this-gate
- **WHEN** a game begins in a room a schedule-bound competition format governs
- **THEN** neither the readiness requirement nor the actor-initiation requirement is consulted — the format's schedule is what starts the game, and no user could have started it early, late, or at all

### Requirement: rooms-and-matchmaking/room-archival
Depends on: global-invariants/transactional-invariant-enforcement, game-lifecycle/successor-auto-creation.

A room's lifetime SHALL be independent of the games played in it: rooms persist indefinitely and SHALL never be deleted — no deletion path exists. The administrative actor MAY instead archive the room, but not while the room is playing and not at any moment while a competition format governs the room. While archived, the room SHALL be excluded from default listings, and no game SHALL be created or started in it; everything the room accumulated — its historical games, their replays and action logs, its enrolment and current game — SHALL be preserved intact. The administrative actor MAY unarchive the room to resume activity.

#### Scenario: #archive-preserves-everything
- **WHEN** an archived room's history is consulted — a historical game opened, its replay or action log viewed, an attribution resolved
- **THEN** everything resolves exactly as it did before archiving; archiving hides the room from default listings and stops new play, and removes nothing

#### Scenario: #no-start-in-an-archived-room
- **WHEN** a start of the current game is attempted in an archived room
- **THEN** it is rejected for as long as the room stays archived, whoever attempts it

#### Scenario: #archive-blocked-mid-play
- **WHEN** archival is attempted while the room is playing, or at any moment while a competition format governs the room — between that format's games as much as during one, and while its next game is merely scheduled
- **THEN** it is rejected — a room is archived only while it is configuring and unclaimed, so a game never finishes into an archived room, the succession of current games never has to fire inside one, and a format's remaining schedule can never be stranded by an archival taken between its games

#### Scenario: #unarchive-resumes-intact
- **WHEN** the administrative actor unarchives a room
- **THEN** the room resumes with its enrolled teams, ownership state, and current game exactly as they were at archiving — nothing was reset by the round trip

### Requirement: rooms-and-matchmaking/room-discovery

The application SHALL provide a Room Browser listing rooms — excluding archived rooms from the default listing — showing for each at minimum the room's name, its owner or ownerless state, the number of enrolled teams, and whether the room's current game is being played; the listing SHALL be searchable by room name, each listed room SHALL link directly to its lobby, and the browser SHALL offer the room-creation affordance. The browser is the platform-wide discovery surface: no other surface lists games in progress platform-wide, and surfaces scoped to a user list only games involving that user's own teams.

#### Scenario: #hidden-is-not-gone
- **WHEN** the browser is viewed with its default listing
- **THEN** archived rooms are absent — yet they still exist, and their history remains reachable through the surfaces that reference it; absence from the listing is presentation, not deletion

#### Scenario: #live-games-found-through-the-browser
- **WHEN** a user wants to find a game in progress between teams they have no affiliation with
- **THEN** the browser's playing indicator is the discovery path — their own user-scoped surfaces list only their own teams' games, and no dedicated platform-wide live-games listing exists

### Requirement: rooms-and-matchmaking/room-lobby
Depends on: game-configuration/config-lives-on-the-game, game-configuration/host-selected-affordances.

The application SHALL provide a lobby view for every room, accessible to every authenticated user, displaying at minimum the room's owner or its ownerless state, the set of enrolled Centaur Teams, and each enrolled team's readiness. Rather than restating the parameters itself, the lobby SHALL present the current game's configuration by mounting the platform's self-contained configuration surface against that game — read from that game's own record — and, because that surface knows only its own affordance kinds and no room actor at all, the lobby SHALL be where the room's actors are mapped onto them: it offers inspection to every user who can see the room, and parameter editing and board designation to the room's administrative actor alone. Which kinds the lobby offers is presentation only; the authoritative rejection of a write nobody was offered lives with the mutation that handles it. Users who are neither the room's administrative actor nor members of an enrolled team SHALL see the lobby read-only, with no mutating affordance of any kind.

#### Scenario: #the-lobby-supplies-the-actor-mapping
- **WHEN** the lobby mounts the configuration surface for a room's current game, once for the administrative actor and once for an ordinary viewer
- **THEN** the two mountings differ only in the affordance kinds the lobby stated — inspection for both, parameter editing and board designation for the actor — and the surface itself resolved no actor and consulted no room rule to reach that difference

#### Scenario: #unaffiliated-viewers-see-everything-touch-nothing
- **WHEN** an authenticated user with no relationship to the room — not its administrative actor, not a member of any enrolled team — opens the lobby
- **THEN** the full lobby state is visible to them, and not one mutating affordance is offered

#### Scenario: #lobby-shows-the-current-games-own-values
- **WHEN** the lobby is viewed after games have turned over in the room
- **THEN** the parameter values and readiness shown are the current game record's own — never a room-level default set, and never a predecessor's values lingering after succession
