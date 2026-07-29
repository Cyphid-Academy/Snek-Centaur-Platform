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
Because every game is owned here, this capability is also the single
publisher of whether a team is competitively engaged right now — the one
fact a capability gates on when it must know a team is playing without
knowing anything about games. What happens during play — operating snakes,
watching the board, pacing turns — and what the persisted record must
contain to be replayable belong to the capabilities that own those
workflows; the scoring consequences of forfeits and walkovers belong to the
competition formats that define them.

Depends on: game-engine, game-configuration, global-invariants, identity-and-authorization, team-server-management.

## ADDED Requirements

### Requirement: game-lifecycle/game-record
Depends on: global-invariants/single-convex-deployment, game-configuration/config-lives-on-the-game.

Convex SHALL maintain a persistent record of every game, existing from the game's creation onward and never deleted. The record SHALL capture at minimum: the game's configuration, its status, a reference to the game's SpacetimeDB instance while one exists, the timestamps at which the game entered `playing` and `finished`, the final outcome recorded at finish, and — when a launch proceeded without seating every participating team — which teams were not seated.

#### Scenario: #record-precedes-everything
- **WHEN** any lifecycle act occurs — launch, invitation delivery, initialization, finish handling, successor creation
- **THEN** it reads and advances an already-existing game record; no lifecycle activity happens for a game that has no record

#### Scenario: #record-outlives-the-instance
- **WHEN** a finished game's instance has been torn down
- **THEN** the record persists indefinitely with its outcome, timestamps, and seating history intact; only the instance reference stops resolving to a live instance

### Requirement: game-lifecycle/status-authority
Depends on: global-invariants/runtime-ownership, global-invariants/transactional-invariant-enforcement.

Convex SHALL be the sole authority for every game's status, drawn from the closed set `not-started`, `playing`, `finished`, and advancing only forward. The permitted transitions SHALL be exactly three: `not-started → playing` on successful completion of launch orchestration; `playing → finished` through terminal-state handling; and `not-started → finished` — the walkover — when a launch whose abort has been overridden cannot seat the minimum number of teams needed to play, taking the record straight to `finished` without it ever entering `playing`. An aborted launch is not a transition: the game simply remains `not-started`.

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
Depends on: global-invariants/game-instance-hermeticity, global-invariants/authenticated-unambiguous-identity#instance-team-ids-resolve-uniquely, identity-and-authorization/roster-snapshot-binding.

Convex SHALL keep, for every launched game, a persistent snapshot of the participating Centaur Teams and, for each, the team's authorized members, captured at initialization. The snapshot SHALL be treated as append-only historical fact, SHALL seed the instance's admission state through the initialization payload, and is the snapshot that binds the game's authorization for its whole life. When a launch proceeds with a restricted participant set, the snapshot SHALL reflect exactly the teams actually seated.

#### Scenario: #snapshot-survives-later-edits
- **WHEN** team membership or team records change after the game was initialized — during play or after finish
- **THEN** the game's snapshot is unchanged: it records who was authorized when the game was initialized, and nothing later rewrites or erases it

#### Scenario: #restricted-set-is-what-binds
- **WHEN** a launch seats fewer teams than were enrolled
- **THEN** the snapshot contains only the seated teams, and the game's admission — which humans may obtain operator access, which teams participate — follows the snapshot, not the enrollment

### Requirement: game-lifecycle/competitive-engagement
Depends on: global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction, global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard.

Convex SHALL publish, for every Centaur Team, whether that team is competitively engaged right now — a fact derived from the games this capability owns and from nothing else. A team SHALL be engaged from the moment a game it participates in commits to `playing` until that game reaches `finished`, and SHALL stay engaged while any such game of its own is still being played; a game that never enters play SHALL never engage anyone. The published fact SHALL be the platform's single definition of engagement: stated about the team, readable by any capability that must gate on it without knowing that games exist, and readable inside the transaction of a write that must be refused while it holds — so no consumer ever assembles an answer of its own out of game records.

#### Scenario: #published-not-inferred
- **WHEN** any capability needs to know whether a team is competitively engaged — to hold something frozen, to refuse a mutation, to explain an unavailable affordance
- **THEN** it reads the published fact and nothing else: it opens no game record, matches no status, and joins no participant list — engagement has exactly one definition, and it lives with the games it is derived from

#### Scenario: #engaged-while-any-of-its-games-plays
- **WHEN** a team is participating in two games at once and one of them finishes
- **THEN** the team is still engaged, and stops being engaged only once the last of its games in play has reached its terminal state — the fact is about the team, never about one game

#### Scenario: #a-game-that-never-played-engages-nobody
- **WHEN** a game is waiting to launch, has had its launch aborted, or walks straight over to `finished` without ever being played
- **THEN** no team is engaged on that game's account — engagement begins at the commit to play and at no earlier moment

### Requirement: game-lifecycle/instance-per-game
Depends on: global-invariants/runtime-ownership, global-invariants/state-confined-to-owning-runtime#game-instance-holds-only-its-games-state.

Each started game SHALL be served by its own freshly provisioned, transient SpacetimeDB instance: Convex provisions it during that game's launch orchestration and tears it down after the game ends. A game that has not been launched SHALL have no instance; no instance is ever reused across games; and an instance's lifetime is bounded by its game's, extended only by the persistence gate on teardown. This SHALL hold uniformly across every game-creation path.

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
Depends on: global-invariants/authenticated-unambiguous-identity, game-configuration/launch-freeze, game-configuration/board-preview-lock-in, game-configuration/infeasibility-surfaced, team-server-management/game-invitations, team-server-management/invitation-acceptance, global-invariants/security-enforced-outside-the-library.

Launching a game SHALL be a single Convex-orchestrated sequence, and every privileged operation in it — provisioning, initialization, callback registration, teardown — SHALL be authenticated as the platform, invocable by no other party. In order, the orchestration SHALL: freeze the game's configuration; obtain the starting state the configuration locked in, halting before provisioning when generation fails; provision the game's fresh instance; deliver the game invitations and await their resolution; and only after every invitation has resolved initialize the instance, with the participant roster restricted to the teams whose servers accepted, then commit the game to `playing`.

#### Scenario: #invitations-resolve-before-init
- **WHEN** the orchestration runs
- **THEN** initialization is not invoked until every invitation has been accepted, refused, or timed out, and the initialization roster contains exactly the seated teams — a snake is never spawned for a team that is not participating

#### Scenario: #generation-failure-provisions-nothing
- **WHEN** launch-time board generation fails
- **THEN** the launch halts with the structured infeasibility surfaced to the configuring user, and no instance was provisioned for the attempt

#### Scenario: #privileged-operations-are-platform-only
- **WHEN** any party other than the platform's authenticated orchestration attempts provisioning, initialization, or teardown of an instance
- **THEN** the operation is refused

### Requirement: game-lifecycle/launch-gates
Depends on: team-server-management/server-healthcheck, global-invariants/client-truthfulness.

A manually started game SHALL NOT launch while any participating team's nominated server reports unhealthy: the start is blocked, with an indication of which teams' servers are failing, until every participating team's server passes. And when any participating team's server refuses its game invitation or fails to answer within the invitation window, the launch SHALL abort: the provisioned instance is torn down, the game remains `not-started`, and the record carries an error naming the declining or unresponsive servers. A schedule-bound competition format MAY override both gates for its starts: unhealthy servers are then ignored — the team participates if its server accepts in time — and a refusal or timeout costs that team its seat rather than aborting the launch, falling to a walkover when fewer than the minimum remain.

#### Scenario: #unhealthy-server-blocks-manual-start
- **WHEN** a manual start is attempted while one participating team's server is unhealthy
- **THEN** the game does not launch, the failing teams' servers are identified to the starting user, and the start becomes possible once all pass

#### Scenario: #refusal-aborts-cleanly
- **WHEN** a manually started game's invitation is refused by, or times out against, any participating team's server
- **THEN** the launch aborts — instance torn down, game still `not-started` — and the record names which servers declined or timed out, so the teams know whose server to fix

#### Scenario: #override-seats-the-willing
- **WHEN** an override-governed start runs while one team's server is down or refusing
- **THEN** the launch proceeds without that team — and if its server recovers in time to accept within the invitation window, the team is seated and plays

### Requirement: game-lifecycle/instance-provisioning-authority
Depends on: global-invariants/no-shared-secrets, global-invariants/issuer-anchored-trust.

The platform SHALL authenticate every provisioning call with a credential it issued itself, and SHALL hold no credential specific to the system instances are provisioned on. The identity that provisions an instance SHALL own it and SHALL be the only identity that can update or delete it. Because the provisioning host admits instance creation without authorization of its own, the deployment SHALL restrict the creation route at the network boundary to callers bearing a valid platform-issued credential — ownership protects instances that already exist, and nothing otherwise protects the act of creating them.

#### Scenario: #no-provisioning-credential-is-stored
- **WHEN** the platform's stored configuration is examined for what lets it provision instances
- **THEN** there is nothing to find: it signs its own credential at the moment of the call, so there is no provisioning secret to leak, rotate, or forget to rotate

#### Scenario: #only-the-provisioner-can-touch-an-instance
- **WHEN** any party other than the platform attempts to update or delete a provisioned instance
- **THEN** it is refused by the provisioning system on ownership, independently of anything the platform does — the instance belongs to the identity that created it

#### Scenario: #open-creation-is-closed-at-the-boundary
- **WHEN** the provisioning host is reached on its creation route by anything other than the platform's own orchestration
- **THEN** it does not create an instance: the boundary in front of that route admits only callers bearing a valid platform-issued credential, and the credential check is what carries the guarantee — any narrowing by network origin is defence in depth on top of it, never the thing relied upon

### Requirement: game-lifecycle/instance-initialization
Depends on: global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants, global-invariants/game-instance-hermeticity#seeded-once-never-refreshed, game-configuration/generation-parameter-boundary, game-engine/determinism.

A provisioned instance SHALL expose a privileged initialization operation, invocable exactly once, before any client connection is admitted, and authorized by an ordinary platform-issued credential naming that instance and carrying the capability to initialize it — never by anything configured into the instance when it was built or deployed. Its payload SHALL deliver everything the instance needs to run its one game: the precomputed starting state and the dynamic gameplay parameters, the game's root seed — always forwarded, since turn-resolution randomness and the eventual export depend on it — the roster snapshot seeding admission, the game's unique identifier for validating access-token audience, and the finish-notification callback registration. The instance SHALL validate the payload's structural integrity and reject a malformed payload synchronously as an error to the caller; it never generates a board. Successful initialization SHALL leave turn 0 fully written and the instance ready to accept connections, move staging, and turn declarations.

#### Scenario: #nothing-is-built-into-the-instance
- **WHEN** an instance's build and deployment inputs are examined for what authorizes its initialization
- **THEN** they contain no credential at all: the instance validates the caller's credential against the platform's published material like any other, so no build artifact is worth stealing

#### Scenario: #initialization-is-once-only
- **WHEN** the initialization operation is invoked again after it has once completed successfully
- **THEN** the second invocation is rejected and the instance's state is untouched

#### Scenario: #nothing-before-init
- **WHEN** a client connects, or a gameplay operation arrives, before initialization has completed
- **THEN** the operation is rejected and the client is disconnected; no game clock is running before initialization completes — the game's playable life begins strictly after it

#### Scenario: #malformed-payload-rejected
- **WHEN** the delivered payload is structurally invalid — board dimensions wrong, snake set inconsistent with the roster, invalid placements
- **THEN** the instance rejects it synchronously without initializing, and the launch fails through the orchestration's cleanup path

### Requirement: game-lifecycle/fresh-game-state
Depends on: global-invariants/transactional-invariant-enforcement, global-invariants/state-confined-to-owning-runtime.

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
Depends on: game-engine/game-end-conditions, global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic.

A game SHALL end at the commit of the turn whose resolution detects an end condition, and that commit SHALL be the sole event that establishes the game as over: nothing outside the game's own runtime decides it, and terminal handling — the notification, the record's persistence, the transition to `finished`, teardown — proceeds from it. What the runtime refuses from that commit onward is that runtime's own obligation, on the same terms.

#### Scenario: #the-commit-is-the-end
- **WHEN** a game's end condition becomes true
- **THEN** it is the resolving commit that establishes the game as over — no later sweep, poll, administrative act, or external observation makes a game ended before that commit, and none is needed after it

#### Scenario: #terminal-handling-follows-the-commit
- **WHEN** terminal handling runs for a game that ended in play
- **THEN** every step of it is downstream of that one commit, so the outcome it records and the record it persists are the committed final turn's and no other

### Requirement: game-lifecycle/finish-notification
Depends on: global-invariants/game-instance-hermeticity#no-egress-before-game-end, global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game, global-invariants/credential-confinement#signing-keys-never-leave-convex, identity-and-authorization/sole-credential-issuer.

Convex SHALL learn of a game's terminal state from a notification the game's instance pushes to the callback registered at initialization, and never from any observation of the game in progress. The registration SHALL consist of the callback address and a callback credential the platform pre-signs before initialization: the instance stores and presents it unchanged. Convex SHALL validate the presented credential on receipt as a self-contained proof — verifying it, never comparing against a stored copy, and never persisting it. The notification SHALL carry the game's outcome together with the complete game record for persistence; on receipt Convex SHALL record the outcome, persist the record, transition the game to `finished`, and tear down the instance. An error outcome — a game terminated by failure rather than by play — SHALL still take the game to `finished` and tear the instance down, without recording scores. Delivery SHALL be retried a bounded number of times; because it can still be lost, the push SHALL NOT be the only path to `finished` — a game whose notification never arrives is carried there by the recovery this capability owns for games gone stale, so a lost notification never leaves a game `playing` forever.

#### Scenario: #pushed-never-polled-live
- **WHEN** a game is being played
- **THEN** its status stays `playing` until the instance's terminal notification arrives — or, if it never does, until stale-game recovery fires: the push is the only thing that carries the outcome and the record to Convex while the game is running, and no observation of the game in progress advances the status

#### Scenario: #forged-callback-refused
- **WHEN** a notification arrives whose credential does not validate as platform-issued for this game
- **THEN** it is refused and the game's status does not change

#### Scenario: #lost-notification-recovered
- **WHEN** every delivery attempt of the terminal notification fails
- **THEN** stale-game recovery eventually notices the game still marked `playing` and drives it to `finished` with nothing of its instance left running — the fallback is required behaviour, not an operational nicety

#### Scenario: #error-outcome-still-finishes
- **WHEN** an error outcome is recorded for a game — the game died to a failure rather than to play — however it arises: reported by the instance, or reached by recovery for a game whose instance is gone and can report nothing
- **THEN** the game still transitions to `finished` and nothing of its instance is left running; no scores are recorded for it

### Requirement: game-lifecycle/stale-game-recovery
Depends on: global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game, global-invariants/runtime-ownership, global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard, game-engine/chess-timer, game-engine/game-end-conditions.

Convex SHALL sweep on a recurring schedule for stale games — records still marked `playing` whose finish notification has not arrived within a bound longer than the longest game the configured clocks and turn limit can produce — and SHALL drive every one it finds to `finished`. The bound SHALL be set generously above that maximum rather than tuned to a typical game, because a game still being played must never be mistaken for a lost one. For a record found stale, and for no other, Convex SHALL establish whether a live instance still stands behind it, learning nothing else: the probe consumes no gameplay state. When a live instance answers, Convex SHALL retrieve the game's completed record from it and carry out the same terminal handling a pushed notification receives — persist, transition to `finished`, tear down — the complete record still arriving exactly once, merely fetched because the push was lost; a retrieval that yields no completed record SHALL leave the status untouched for a later sweep. When no live instance answers, Convex SHALL take the game to `finished` with an error outcome, recording no scores, and reclaim whatever of the instance remains. Either branch SHALL commit its transition under the same guard the pushed path commits under, so a notification arriving late can never finish a game twice.

#### Scenario: #stale-only-past-the-maximum-game-duration
- **WHEN** a record has stood at `playing` with no finish notification for longer than any game its configuration's clocks and turn limit could produce
- **THEN** the sweep treats it as stale and recovers it — while a quiet game still inside that bound is left entirely alone, since the bound's generosity is the whole reason a game in play is never recovered out from under itself

#### Scenario: #live-instance-yields-the-record
- **WHEN** the probe finds a live instance behind a stale record
- **THEN** Convex retrieves the completed record from it and runs the ordinary terminal handling in the ordinary order — persist, then `finished`, then tear down — so the result is indistinguishable from a notification that had arrived, and the persistence gate binds exactly as it does on the pushed path

#### Scenario: #vanished-instance-finishes-with-an-error
- **WHEN** the probe finds no live instance behind a stale record — reaped, crashed, or unreachable
- **THEN** the game is taken to `finished` with an error outcome and no scores, and any residue of the instance is reclaimed; it does not sit at `playing` awaiting a record that exists nowhere

#### Scenario: #nothing-left-to-persist-when-the-instance-is-gone
- **WHEN** the error-outcome branch reclaims what remains of an instance that never delivered its record
- **THEN** the persistence gate is satisfied vacuously rather than bypassed: there is no retrievable record for the reclamation to destroy, so nothing is lost by reclaiming — and the gate still forbids reclaiming an instance that does hold one

#### Scenario: #probing-is-not-licence-to-watch-a-game
- **WHEN** the probe or the record retrieval is reached for
- **THEN** neither is available against a healthy game: the probe answers only whether an instance stands behind the record, never reading a turn log, a staged move, or a board, and the retrieval is reachable once, at the end, for a record already stale — so recovery opens no channel for observing a game in progress

### Requirement: game-lifecycle/teardown-after-persistence
Depends on: global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game, global-invariants/runtime-ownership.

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
Depends on: game-configuration/board-preview-lock-in, global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction, global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard, game-configuration/launch-freeze.

A finished game SHALL be followed by the auto-creation of its successor — by default immediately upon finishing; a competition format MAY instead govern when its next round is created, or that none follows. Every auto-created successor, on any path, SHALL be a new `not-started`, mutable game record inheriting the predecessor's configuration values, with no instance provisioned, and with no board preview carried over — the successor's preview lock starts clear. The successor's creation and its installation as the current game in the finished game's setting SHALL be a single atomic step.

#### Scenario: #atomic-with-currency
- **WHEN** a game's finish handling creates its successor
- **THEN** the successor record and its designation as the current game commit atomically — no observer sees a finished game with no successor designated, and concurrent finish handling cannot produce two successors

#### Scenario: #mutable-again
- **WHEN** the successor exists
- **THEN** its inherited configuration is editable again — the predecessor's freeze does not travel; the successor gets its own edit window

#### Scenario: #no-preview-carried
- **WHEN** the predecessor had locked in a board preview
- **THEN** the successor inherits neither the preview nor the lock: its preview lock is clear and no persisted preview is carried over, so the predecessor's board never silently becomes the successor's

### Requirement: game-lifecycle/host-warm-up
The host from which per-game instances are provisioned MAY suspend when idle, and SHALL expose a warm-up signal distinct from provisioning: on receipt against a suspended host, the host SHALL become ready to accept a provisioning call and answer success within ten seconds; against an already-warm host the signal SHALL be a success no-op within the same budget. The signal SHALL provision nothing and mutate no existing instance, and SHALL NOT require a credential carrying provisioning authority — a lightweight check sufficient to deter casual abuse suffices, because resuming the host is its only effect. Convex SHALL dispatch a best-effort warm-up on every path that creates a game record, decoupled from the creation itself: warm-up failure or timeout SHALL neither block nor roll back record creation, SHALL be retried at most once, and SHALL NOT be surfaced to the acting user; a launch behind which no warm-up succeeded simply bears the host's cold start.

#### Scenario: #warm-up-never-blocks-creation
- **WHEN** the warm-up dispatched on game-record creation fails or times out
- **THEN** the record is created normally and the acting user sees no error — the warm-up is an amortization, never a dependency

#### Scenario: #cold-start-fallback
- **WHEN** a game launches with no successful warm-up behind it
- **THEN** provisioning still succeeds, absorbing the cold start on the launch path — warm-up affects latency only, never outcome

#### Scenario: #warm-signal-is-idempotent
- **WHEN** warm-up signals arrive repeatedly, against a warm or suspended host
- **THEN** each answers success within the budget and none provisions anything or disturbs any existing instance
