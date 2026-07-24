## Purpose

A game's whole life as a platform object: the persistent game record and
its closed, forward-only status machine; the launch orchestration that
freezes configuration, provisions the game's own SpacetimeDB instance,
resolves server invitations, and initializes play — or aborts, or walks
the record straight to finished when too few teams can be seated; the
game-end bracket — the commit boundary at which play stops, the pushed
finish notification, and the teardown that waits for the record's
persistence; and the successor auto-creation that keeps play going. The
per-game instance's provision/teardown bracket is owned here end to end.
What happens during play — operating snakes, watching the board, pacing
turns — and what the persisted record must contain to be replayable belong
to the capabilities that own those workflows; the scoring consequences of
forfeits and walkovers belong to the competition formats that define them.

Depends on: game-engine, game-configuration, identity-and-authorization, team-server-management.

## ADDED Requirements

### Requirement: game-lifecycle/game-record
Convex SHALL maintain a persistent record of every game, existing from the game's creation onward and never deleted. The record SHALL capture at minimum: the game's configuration (game-configuration/config-lives-on-the-game), its status per game-lifecycle/status-authority, a reference to the game's SpacetimeDB instance while one exists, the timestamps at which the game entered `playing` and `finished`, the final outcome recorded at finish, and — when a launch proceeded without seating every participating team — which teams were not seated.

#### Scenario: #record-precedes-everything
- **WHEN** any lifecycle act occurs — launch, invitation delivery, initialization, finish handling, successor creation
- **THEN** it reads and advances an already-existing game record; no lifecycle activity happens for a game that has no record

#### Scenario: #record-outlives-the-instance
- **WHEN** a finished game's instance has been torn down
- **THEN** the record persists indefinitely with its outcome, timestamps, and seating history intact; only the instance reference stops resolving to a live instance

### Requirement: game-lifecycle/status-authority
Convex SHALL be the sole authority for every game's status, drawn from the closed set `not-started`, `playing`, `finished`, and advancing only forward. The permitted transitions SHALL be exactly three: `not-started → playing` on successful completion of launch orchestration; `playing → finished` through terminal-state handling (game-lifecycle/finish-notification); and `not-started → finished` — the walkover — when a launch whose abort has been overridden (game-lifecycle/launch-gates) cannot seat the minimum number of teams needed to play, taking the record straight to `finished` without it ever entering `playing`. An aborted launch is not a transition: the game simply remains `not-started`.

#### Scenario: #no-backward-motion
- **WHEN** any path — administrative, programmatic, or a retried orchestration — would move a game's status backward
- **THEN** it is refused; a `finished` game is never played again, and the only way onward from `finished` is a successor record

#### Scenario: #walkover-straight-to-finished
- **WHEN** an override-governed launch resolves with fewer seated teams than the minimum needed to play — one team, or none
- **THEN** the record transitions directly from `not-started` to `finished` without entering `playing`, no turn is ever resolved, and any instance already provisioned for the launch is torn down

#### Scenario: #aborted-launch-was-never-playing
- **WHEN** a launch aborts partway — after provisioning, after some invitations resolved
- **THEN** no observer ever saw the game as `playing`: the status commits to `playing` only when the whole orchestration has succeeded

### Requirement: game-lifecycle/roster-snapshot
Convex SHALL keep, for every launched game, a persistent snapshot of the participating Centaur Teams and, for each, the team's authorized members and their roles, captured at initialization. The snapshot SHALL be treated as append-only historical fact, SHALL seed the instance's admission state through the initialization payload, and is the snapshot that binds the game's authorization for its whole life per identity-and-authorization/roster-snapshot-binding. When a launch proceeds with a restricted participant set, the snapshot SHALL reflect exactly the teams actually seated.

#### Scenario: #snapshot-survives-later-edits
- **WHEN** team membership or team records change after the game was initialized — during play or after finish
- **THEN** the game's snapshot is unchanged: it records who was authorized when the game was initialized, and nothing later rewrites or erases it

#### Scenario: #restricted-set-is-what-binds
- **WHEN** a launch seats fewer teams than were enrolled
- **THEN** the snapshot contains only the seated teams, and the game's admission — which humans may obtain operator access, which teams participate — follows the snapshot, not the enrollment

### Requirement: game-lifecycle/instance-per-game
Each started game SHALL be served by its own freshly provisioned, transient SpacetimeDB instance: Convex provisions it during that game's launch orchestration and tears it down after the game ends. A game that has not been launched SHALL have no instance; no instance is ever reused across games; and an instance's lifetime is bounded by its game's, extended only by the persistence gate of game-lifecycle/teardown-after-persistence. This SHALL hold uniformly across every game-creation path.

#### Scenario: #no-instance-before-launch
- **WHEN** a game is `not-started` — a freshly created game or an auto-created successor
- **THEN** no instance exists for it; provisioning is an act of launch, never of record creation

#### Scenario: #fresh-on-every-path
- **WHEN** any game launches — the first in its setting, an auto-created successor, a scheduled competition round
- **THEN** it is served by a newly provisioned instance carrying no state from any predecessor; no path reuses or recycles an instance

### Requirement: game-lifecycle/no-orphans
Convex SHALL NOT provision an instance before the game record it serves exists, and SHALL NOT create a game record without intending an instance for its eventual launch: instances without a game and started games left permanently without an instance are both disallowed states. When launch orchestration fails at any step after provisioning, the same orchestration SHALL tear the just-provisioned instance down before leaving the game `not-started`.

#### Scenario: #post-provisioning-failure-cleans-up
- **WHEN** any launch step after provisioning fails — initialization rejects the payload, an invitation abort triggers, the orchestration errors
- **THEN** the failure path tears the instance down; an instance is never left running against a game that is not `playing`

#### Scenario: #record-always-first
- **WHEN** provisioning would be attempted for a game with no record
- **THEN** no such path exists — every provisioning call is made by the launch orchestration of an existing record, so an instance can always be traced to its game

### Requirement: game-lifecycle/launch-orchestration
Launching a game SHALL be a single Convex-orchestrated sequence, and every privileged operation in it — provisioning, initialization, callback registration, teardown — SHALL be authenticated as the platform, invocable by no other party. In order, the orchestration SHALL: freeze the game's configuration (game-configuration/launch-freeze); obtain the starting state per game-configuration/board-preview-lock-in, halting before provisioning when generation fails (game-configuration/infeasibility-surfaced); provision the game's fresh instance; deliver the game invitations and await their resolution (team-server-management/game-invitations); and only after every invitation has resolved initialize the instance, with the participant roster restricted to the teams whose servers accepted (team-server-management/invitation-acceptance), then commit the game to `playing`.

#### Scenario: #invitations-resolve-before-init
- **WHEN** the orchestration runs
- **THEN** initialization is not invoked until every invitation has been accepted, refused, or timed out, and the initialization roster contains exactly the seated teams — a snake is never spawned for a team that is not participating

#### Scenario: #generation-failure-provisions-nothing
- **WHEN** launch-time board generation fails
- **THEN** the launch halts with the structured infeasibility surfaced per game-configuration/infeasibility-surfaced, and no instance was provisioned for the attempt

#### Scenario: #privileged-operations-are-platform-only
- **WHEN** any party other than the platform's authenticated orchestration attempts provisioning, initialization, or teardown of an instance
- **THEN** the operation is refused

### Requirement: game-lifecycle/launch-gates
A manually started game SHALL NOT launch while any participating team's nominated server reports unhealthy (team-server-management/server-healthcheck): the start is blocked, with an indication of which teams' servers are failing, until every participating team's server passes. And when any participating team's server refuses its game invitation or fails to answer within the invitation window, the launch SHALL abort: the provisioned instance is torn down, the game remains `not-started`, and the record carries an error naming the declining or unresponsive servers. A schedule-bound competition format MAY override both gates for its starts: unhealthy servers are then ignored — the team participates if its server accepts in time — and a refusal or timeout costs that team its seat rather than aborting the launch, falling to the walkover of game-lifecycle/status-authority when fewer than the minimum remain.

#### Scenario: #unhealthy-server-blocks-manual-start
- **WHEN** a manual start is attempted while one participating team's server is unhealthy
- **THEN** the game does not launch, the failing teams' servers are identified to the starting user, and the start becomes possible once all pass

#### Scenario: #refusal-aborts-cleanly
- **WHEN** a manually started game's invitation is refused by, or times out against, any participating team's server
- **THEN** the launch aborts — instance torn down, game still `not-started` — and the record names which servers declined or timed out, so the teams know whose server to fix

#### Scenario: #override-seats-the-willing
- **WHEN** an override-governed start runs while one team's server is down or refusing
- **THEN** the launch proceeds without that team — and if its server recovers in time to accept within the invitation window, the team is seated and plays

### Requirement: game-lifecycle/instance-initialization
A provisioned instance SHALL expose a privileged initialization operation, invocable exactly once, by the platform's authenticated orchestration only, before any client connection is admitted. Its payload SHALL deliver everything the instance needs to run its one game: the precomputed starting state and the dynamic gameplay parameters (game-configuration/generation-parameter-boundary), the game's root seed — always forwarded, since turn-resolution randomness (game-engine/determinism) and the eventual export depend on it — the roster snapshot seeding admission (game-lifecycle/roster-snapshot), the game's unique identifier for validating access-token audience, and the finish-notification callback registration (game-lifecycle/finish-notification). The instance SHALL validate the payload's structural integrity and reject a malformed payload synchronously as an error to the caller; it never generates a board. Successful initialization SHALL leave turn 0 fully written and the instance ready to accept connections, move staging, and turn declarations.

#### Scenario: #initialization-is-once-only
- **WHEN** the initialization operation is invoked again after it has once completed successfully
- **THEN** the second invocation is rejected and the instance's state is untouched

#### Scenario: #nothing-before-init
- **WHEN** a client connects, or a gameplay operation arrives, before initialization has completed
- **THEN** the operation is rejected and the client is disconnected; no game clock is running before initialization completes — the game's playable life begins strictly after it

#### Scenario: #malformed-payload-rejected
- **WHEN** the delivered payload is structurally invalid — board dimensions wrong, snake set inconsistent with the roster, invalid placements
- **THEN** the instance rejects it synchronously without initializing, and the launch fails through the orchestration's cleanup path (game-lifecycle/no-orphans)

### Requirement: game-lifecycle/fresh-game-state
A fresh game SHALL begin with no pre-existing per-game platform state: before its launch orchestration creates them, no per-game records of any kind exist for the new game, and nothing per-game is carried over from any predecessor. Launch orchestration SHALL initialize each seated team's per-game platform state as part of the launch; that initialization SHALL be idempotent, and SHALL create state under exactly the snake identifiers assigned by the game's board generation, so runtime state and platform state name the same snakes.

#### Scenario: #successor-inherits-config-not-state
- **WHEN** a successor game launches after its predecessor finished
- **THEN** it inherited configuration only: every piece of per-game platform state starts absent and is created fresh by the successor's own launch

#### Scenario: #idempotent-initialization
- **WHEN** the orchestration retries and per-game state initialization runs a second time for the same game and team
- **THEN** the repeat is a harmless no-op — no duplicate records, no reset of state already created

#### Scenario: #identifiers-agree
- **WHEN** per-game platform state is initialized
- **THEN** it is keyed by exactly the snake identifiers the delivered starting state contains — every snake in the game has its platform state, and no state is created for a snake that does not exist

### Requirement: game-lifecycle/game-end-boundary
A game SHALL end at the commit of the turn whose resolution detects an end condition (game-engine/game-end-conditions). From that commit onward the instance SHALL reject all further gameplay operations — move staging, turn declarations, turn resolution — as game-over, with zero grace window: an in-flight operation arriving after the commit is rejected, and no further turn is ever resolved.

#### Scenario: #zero-grace-window
- **WHEN** a staged move races the final turn's commit and arrives after it
- **THEN** it is rejected as game-over — there is no window between the commit and enforcement in which late operations land

#### Scenario: #no-turns-after-end
- **WHEN** the end-detecting turn has committed
- **THEN** no subsequent turn resolves under any circumstances; the committed final turn is the last

### Requirement: game-lifecycle/finish-notification
Convex SHALL learn of a game's terminal state only from a notification the game's instance pushes to the callback registered at initialization; Convex SHALL hold no live gameplay subscription to any instance. The registration SHALL consist of the callback address and a callback credential the platform pre-signs before initialization: the instance stores and presents it unchanged, performing no credential-signing of its own, keeping Convex the sole issuer per identity-and-authorization/sole-credential-issuer. Convex SHALL validate the presented credential on receipt as a self-contained proof — verifying it, never comparing against a stored copy, and never persisting it. The notification SHALL carry the game's outcome together with the complete game record for persistence; on receipt Convex SHALL record the outcome, persist the record, transition the game to `finished`, and tear down the instance. An error outcome — a game terminated by failure rather than by play — SHALL still take the game to `finished` and tear the instance down, without recording scores. Delivery SHALL be retried a bounded number of times; because it can still be lost, Convex SHALL detect stale games — records still `playing` whose instance has fallen silent — by polling as a required fallback, so a lost notification never leaves a game `playing` forever.

#### Scenario: #pushed-never-polled-live
- **WHEN** a game is being played
- **THEN** Convex consumes no live gameplay state from the instance; the first thing it hears from the instance after initialization is the terminal notification

#### Scenario: #forged-callback-refused
- **WHEN** a notification arrives whose credential does not validate as platform-issued for this game
- **THEN** it is refused and the game's status does not change

#### Scenario: #lost-notification-recovered
- **WHEN** every delivery attempt of the terminal notification fails
- **THEN** stale-game detection eventually notices the silent `playing` game and drives it to `finished` with its instance torn down — the fallback is required behaviour, not an operational nicety

#### Scenario: #error-outcome-still-finishes
- **WHEN** the instance reports an error outcome — the game died to a failure, not to play
- **THEN** the game still transitions to `finished` and the instance is still torn down; no scores are recorded for it

### Requirement: game-lifecycle/teardown-after-persistence
An instance SHALL NOT be torn down until Convex has confirmed persistence of the complete game record; until that confirmation the instance SHALL remain available and SHALL NOT discard anything not yet retrieved. Once persistence is confirmed, teardown SHALL follow immediately, within the same terminal handling. Teardown SHALL be exclusively Convex's act, performed under its platform authority: an instance has no self-teardown capability and never destroys itself — not even after its notification has been acknowledged.

#### Scenario: #no-teardown-before-persistence
- **WHEN** persistence of the game record fails or has not yet been confirmed
- **THEN** the instance stays up with its record intact and retrievable, so the persistence can be retried against it

#### Scenario: #no-self-teardown
- **WHEN** an instance has delivered its terminal notification and received acknowledgement
- **THEN** it takes no destructive action of its own — it remains passively available until Convex tears it down

#### Scenario: #prompt-after-confirmation
- **WHEN** Convex confirms the record is persisted
- **THEN** teardown happens immediately in the same handling — not deferred to a later sweep — so a finished game's instance does not linger

### Requirement: game-lifecycle/successor-auto-creation
A finished game SHALL be followed by the auto-creation of its successor — by default immediately upon finishing; a competition format MAY instead govern when its next round is created, or that none follows. Every auto-created successor, on any path, SHALL be a new `not-started`, mutable game record inheriting the predecessor's configuration values, with no instance provisioned, and with no board preview carried over — the successor's preview lock starts clear (game-configuration/board-preview-lock-in). The successor's creation and its installation as the current game in the finished game's setting SHALL be a single atomic step.

#### Scenario: #atomic-with-currency
- **WHEN** a game's finish handling creates its successor
- **THEN** the successor record and its designation as the current game commit atomically — no observer sees a finished game with no successor designated, and concurrent finish handling cannot produce two successors

#### Scenario: #mutable-again
- **WHEN** the successor exists
- **THEN** its inherited configuration is editable again — the predecessor's freeze does not travel; the successor gets its own edit window per game-configuration/launch-freeze

#### Scenario: #no-preview-carried
- **WHEN** the predecessor had locked in a board preview
- **THEN** the successor inherits neither the preview nor the lock: its preview lock is clear and no persisted preview is carried over, so the predecessor's board never silently becomes the successor's

### Requirement: game-lifecycle/host-warm-up
The host from which per-game instances are provisioned MAY suspend when idle, and SHALL expose a warm-up signal distinct from provisioning: on receipt against a suspended host, the host SHALL become ready to accept a provisioning call and answer success within ten seconds; against an already-warm host the signal SHALL be a success no-op within the same budget. The signal SHALL provision nothing and mutate no existing instance, and SHALL NOT require the platform-management credential — a lightweight check sufficient to deter casual abuse suffices, because resuming the host is its only effect. Convex SHALL dispatch a best-effort warm-up on every path that creates a game record, decoupled from the creation itself: warm-up failure or timeout SHALL neither block nor roll back record creation, SHALL be retried at most once, and SHALL NOT be surfaced to the acting user; a launch behind which no warm-up succeeded simply bears the host's cold start.

#### Scenario: #warm-up-never-blocks-creation
- **WHEN** the warm-up dispatched on game-record creation fails or times out
- **THEN** the record is created normally and the acting user sees no error — the warm-up is an amortization, never a dependency

#### Scenario: #cold-start-fallback
- **WHEN** a game launches with no successful warm-up behind it
- **THEN** provisioning still succeeds, absorbing the cold start on the launch path — warm-up affects latency only, never outcome

#### Scenario: #warm-signal-is-idempotent
- **WHEN** warm-up signals arrive repeatedly, against a warm or suspended host
- **THEN** each answers success within the budget and none provisions anything or disturbs any existing instance
