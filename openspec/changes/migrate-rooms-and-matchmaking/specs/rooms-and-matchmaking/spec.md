## Purpose

Getting teams into games. A room is the persistent meeting place where a
succession of games is played: any user can found one, an optional owner
governs it, Centaur Teams are enrolled in it, and it always holds a
current game whose readiness state fills up — captain by captain — until
the room's administrative actor starts it. This capability owns the room
record and its lifecycle (ownership, abdication, archival), team
enrolment, the captain-declared readiness that expresses a team's consent
to play, the start gate over enrolment and readiness, and the discovery
surfaces — browser and lobby — through which players find and join the
action. What a start sets in motion — the launch, its own gates, the
game's life and its successor — belongs to the game lifecycle; the
parameter values being configured belong to game configuration; the teams
being enrolled are run by their captains elsewhere.

Depends on: game-lifecycle, game-configuration, team-management.

## ADDED Requirements

### Requirement: rooms-and-matchmaking/room-record
The platform SHALL maintain a persistent record of every room, capturing at minimum the room's name, its optional owner, a reference to the room's current game, the set of Centaur Teams currently enrolled, and whether the room is archived. The room record SHALL hold no game-configuration state and no readiness state of its own: both live on the current game's own record (game-configuration/config-lives-on-the-game), and every room-scoped view of them reads that record.

#### Scenario: #no-parameter-state-on-the-room
- **WHEN** a room's parameter values or readiness state are read or written through any surface
- **THEN** the reads and writes address the current game's own record — the room carries nothing that could go stale, or race, as games turn over

#### Scenario: #currency-moves-with-the-succession
- **WHEN** the room's current game finishes and its successor is auto-created (game-lifecycle/successor-auto-creation)
- **THEN** the room's current-game reference designates the successor from the same atomic step, and the finished game remains reachable as history rather than as the room's current game

### Requirement: rooms-and-matchmaking/room-creation
Any authenticated user SHALL be able to create a room, supplying at minimum its name; the creating user becomes the room's owner at creation. Creating a room SHALL also eagerly create the room's initial game — a not-yet-launched game record (game-lifecycle/game-record) with default parameter values and no team ready — installed as the room's current game in the same act, so a room never exists without a current game.

#### Scenario: #born-with-a-game
- **WHEN** a room has just been created
- **THEN** its current game already exists with default configuration and empty readiness — parameter editing and readiness declarations can begin immediately, with no separate game-creation step for anyone to perform or forget

#### Scenario: #creator-owns-from-the-first-instant
- **WHEN** the creating user acts on the room immediately after creation
- **THEN** they hold the owner's full administrative control (rooms-and-matchmaking/room-administration); no interval exists in which the new room is ownerless or controlled by anyone else

### Requirement: rooms-and-matchmaking/room-administration
Each room SHALL have an administrative actor holding administrative control over it: managing team enrolment, configuring the room's current not-yet-launched game within its edit window (game-configuration/launch-freeze), starting the game, abdicating ownership, and archiving the room. While the room has an owner, the administrative actor SHALL be exactly the owner; when it has no owner, every authenticated user with access to the room SHALL hold equivalent administrative control. An owner MAY abdicate ownership, after which the room is ownerless; abdication SHALL be irreversible — the platform never reassigns ownership of a room to anyone. Administrative affordances SHALL be enforced server-side at the mutating functions; surfaces expose them exclusively to the administrative actor, and that gating reflects the enforcement rather than substituting for it.

#### Scenario: #ownerless-means-open-control
- **WHEN** a room has no owner and any authenticated user with access to it performs an administrative act — enrolment change, configuration edit, game start, archival
- **THEN** the act is permitted exactly as it would be for an owner; open control is the defined administrative state of an ownerless room, not a gap

#### Scenario: #abdication-is-forever
- **WHEN** ownership of a room has been abdicated and any party — the former owner included — seeks to become its owner
- **THEN** no path exists: the room remains ownerless for the rest of its life, and the former owner retains only the same open control every authenticated user now holds

#### Scenario: #non-actor-rejected-at-the-function
- **WHEN** a user who is not an owned room's administrative actor invokes an administrative mutation directly, bypassing every surface affordance
- **THEN** the mutation is rejected server-side; the absence of affordances in their view of the lobby is presentation only

### Requirement: rooms-and-matchmaking/team-enrolment
The room's administrative actor SHALL be able to enrol Centaur Teams in the room and to remove them; enrolment requires no acceptance step by the team — a team's consent to actually play is expressed through its captain's readiness declaration (rooms-and-matchmaking/team-readiness), not through enrolment. The enrolled teams form a set: a team is enrolled at most once. Enrolling an archived team SHALL be rejected (team-management/archive-not-delete). Enrolment changes affect which teams the room's future starts consider; they never alter a game already launched.

#### Scenario: #enrolment-is-a-set
- **WHEN** two racing enrolments name the same team, or an enrolment names a team already enrolled
- **THEN** the room's enrolled set afterwards contains that team exactly once — no duplicate enrolment ever exists to count twice toward the start gate

#### Scenario: #archived-team-cannot-enrol
- **WHEN** enrolment names a team that is archived
- **THEN** it is rejected; the team becomes enrollable again only once it has been unarchived

#### Scenario: #removal-never-reaches-a-launched-game
- **WHEN** a team is removed from the room while a game it is playing in is under way
- **THEN** the playing game is untouched — its participation was bound at initialization by its snapshot (game-lifecycle/roster-snapshot) — and the removal takes effect only for the room's subsequent starts

### Requirement: rooms-and-matchmaking/team-readiness
Each not-yet-launched game SHALL carry, from its creation onward, a per-enrolled-team readiness state, and only the enrolled team's current captain (team-management/team-record) SHALL be able to declare their team ready or retract that declaration; no other member, and no room actor, sets it for them. Readiness SHALL be scoped to the one game it is declared for: every freshly created game — a room's initial game or an auto-created successor — begins with no team ready. To everyone but the team's captain, readiness SHALL be visible strictly as a read-only indicator.

#### Scenario: #captain-only-even-for-insiders
- **WHEN** a non-captain member of the team — or the room's administrative actor — attempts to declare or retract that team's readiness, through an affordance or by invoking the mutation directly
- **THEN** it is rejected server-side; their surfaces offer readiness only as a read-only indicator, with no toggling affordance

#### Scenario: #stale-readiness-never-survives
- **WHEN** a successor game is auto-created after its predecessor finishes (game-lifecycle/successor-auto-creation)
- **THEN** the successor begins with every team not ready — a team ready for the finished game has expressed nothing about the next one, and leftover readiness can never trigger an unintended start

#### Scenario: #retractable-until-start
- **WHEN** a captain retracts their team's readiness while the game is still not started
- **THEN** the retraction applies and the start gate immediately stops counting the team as ready

### Requirement: rooms-and-matchmaking/game-start-gate
Only the room's administrative actor SHALL be able to initiate the start of the room's current game, and initiation SHALL be permitted only when the room has at least two enrolled Centaur Teams and every enrolled team has declared itself ready. The gate SHALL be checked authoritatively at initiation, atomically with it. A permitted initiation hands the game to launch orchestration (game-lifecycle/launch-orchestration), whose own gates may still block or abort the launch (game-lifecycle/launch-gates) — passing the room's gate is necessary, never sufficient. Surfaces SHALL enable the start affordance only while the gate is satisfied, and while it is disabled SHALL communicate to the administrative actor which precondition is unmet.

#### Scenario: #unanimity-over-the-whole-enrolled-set
- **WHEN** two enrolled teams are ready but a third enrolled team is not
- **THEN** the start is not permitted — readiness is unanimous over every enrolled team, not a quorum of two

#### Scenario: #gate-checked-at-initiation-not-in-the-surface
- **WHEN** a captain retracts readiness, or enrolment changes, in the instant between the surface enabling the start affordance and the initiation arriving
- **THEN** the authoritative check at initiation rejects the start; a stale enabled affordance never starts a game

#### Scenario: #disabled-start-explains-itself
- **WHEN** the administrative actor views the lobby while the gate is unsatisfied — too few teams enrolled, or teams not yet ready
- **THEN** the start affordance is disabled and the view names the unmet precondition, so the actor knows what they are waiting on

### Requirement: rooms-and-matchmaking/room-archival
A room's lifetime SHALL be independent of the games played in it: rooms persist indefinitely and SHALL never be deleted — no deletion path exists. The administrative actor MAY instead archive the room, but not while its current game is being played. While archived, the room SHALL be excluded from default listings, and no game SHALL be created or started in it; everything the room accumulated — its historical games, their replays and action logs, its enrolment and current game — SHALL be preserved intact. The administrative actor MAY unarchive the room to resume activity.

#### Scenario: #archive-preserves-everything
- **WHEN** an archived room's history is consulted — a historical game opened, its replay or action log viewed, an attribution resolved
- **THEN** everything resolves exactly as it did before archiving; archiving hides the room from default listings and stops new play, and removes nothing

#### Scenario: #no-start-in-an-archived-room
- **WHEN** a start of the current game is attempted in an archived room
- **THEN** it is rejected for as long as the room stays archived, whoever attempts it

#### Scenario: #archive-blocked-mid-play
- **WHEN** archival is attempted while the room's current game is playing
- **THEN** it is rejected — a room is archived only between games, so a game never finishes into an archived room and the succession of current games (game-lifecycle/successor-auto-creation) never has to fire inside one

#### Scenario: #unarchive-resumes-intact
- **WHEN** the administrative actor unarchives a room
- **THEN** the room resumes with its enrolled teams, ownership state, and current game exactly as they were at archiving — nothing was reset by the round trip

### Requirement: rooms-and-matchmaking/room-discovery
The application SHALL provide a Room Browser listing rooms — excluding archived rooms from the default listing — showing for each at minimum the room's name, its owner or ownerless state, the number of enrolled teams, and whether the room's current game is being played; the listing SHALL be searchable by room name, each listed room SHALL link directly to its lobby, and the browser SHALL offer the room-creation affordance (rooms-and-matchmaking/room-creation). The browser is the platform-wide discovery surface: no other surface lists games in progress platform-wide, and surfaces scoped to a user list only games involving that user's own teams.

#### Scenario: #hidden-is-not-gone
- **WHEN** the browser is viewed with its default listing
- **THEN** archived rooms are absent — yet they still exist, and their history remains reachable through the surfaces that reference it; absence from the listing is presentation, not deletion

#### Scenario: #live-games-found-through-the-browser
- **WHEN** a user wants to find a game in progress between teams they have no affiliation with
- **THEN** the browser's playing indicator is the discovery path — their own user-scoped surfaces list only their own teams' games, and no dedicated platform-wide live-games listing exists

### Requirement: rooms-and-matchmaking/room-lobby
The application SHALL provide a lobby view for every room, accessible to every authenticated user, displaying at minimum the room's owner or its ownerless state, the current game's configured parameter values — read from that game's own record (game-configuration/config-lives-on-the-game) — the set of enrolled Centaur Teams, and each enrolled team's readiness. Users who are neither the room's administrative actor nor members of an enrolled team SHALL see the lobby read-only, with no mutating affordance of any kind.

#### Scenario: #unaffiliated-viewers-see-everything-touch-nothing
- **WHEN** an authenticated user with no relationship to the room — not its administrative actor, not a member of any enrolled team — opens the lobby
- **THEN** the full lobby state is visible to them, and not one mutating affordance is offered

#### Scenario: #lobby-shows-the-current-games-own-values
- **WHEN** the lobby is viewed after games have turned over in the room
- **THEN** the parameter values and readiness shown are the current game record's own — never a room-level default set, and never a predecessor's values lingering after succession
