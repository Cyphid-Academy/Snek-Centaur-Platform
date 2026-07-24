## Purpose

Multi-round competitive play. A tournament is a platform-orchestrated
sequence of game rounds contested by a fixed set of teams on a fixed
schedule: the opening round waits for its scheduled start, each finished
round chains into the next after an interlude, and the event runs to its
final round with no per-round human initiation. Because the schedule
outranks any one team's ability to show up, this capability also owns
what absence means: the forfeit — a loss with score 0, marked apart from
a played loss — the walkover a sole present team wins at par, and the
no-contest that resolves a round nobody could enter. The launch
machinery a round rides on — orchestration, launch gates, the
straight-to-finished status transition, instance provisioning — is the
game lifecycle's; the invitation and healthcheck contracts a round
consults are team-server management's; the readiness-gated manual start
that scheduled rounds deliberately bypass is the matchmaking story's.
This capability defines the competition format that composes them.

Depends on: game-lifecycle, rooms-and-matchmaking, team-server-management.

## ADDED Requirements

### Requirement: tournaments/round-structure
A tournament SHALL consist of a configured number of rounds — one or more, fixed when the tournament is created — each round a distinct game in its own right: a full game record (game-lifecycle/game-record) served by its own freshly provisioned instance (game-lifecycle/instance-per-game). The tournament's meta-parameters — its round count, its inter-round interlude, and its scheduled start time — SHALL be properties of the tournament as a whole, never of any single round. The tournament's participant set SHALL be fixed when the tournament begins — the teams then enrolled in its room (rooms-and-matchmaking/team-enrolment) — and every round SHALL be contested by that same set.

#### Scenario: #every-round-a-real-game
- **WHEN** any round of a tournament is examined
- **THEN** it is a complete game — its own record, its own instance, its own outcome — indistinguishable in kind from a standalone game, and nothing of one round's instance or per-game state survives into the next round

#### Scenario: #forfeit-does-not-unseat
- **WHEN** a team forfeits round N of a tournament
- **THEN** it remains a participant of the tournament — round N+1's start invites its server again, and only the round-N outcome carries the forfeit

### Requirement: tournaments/round-config-inheritance
Every round of a tournament SHALL be played under the same gameplay configuration: the configuration captured from the tournament's opening game when the tournament was created, copied into each subsequent round's own game record (game-lifecycle/game-record). The inherited set SHALL exclude the tournament meta-parameters themselves — round count, interlude, scheduled start time — which describe the tournament, not any round's play.

#### Scenario: #identical-play-round-to-round
- **WHEN** a subsequent round's game is created
- **THEN** its gameplay configuration equals the tournament's captured base configuration — the same board-shaping and play parameters in every round of the event

#### Scenario: #no-nested-tournament
- **WHEN** an auto-created round's configuration is examined
- **THEN** no tournament meta-parameter has been inherited into it — the round's finish chains within the enclosing tournament rather than spawning a tournament of its own

### Requirement: tournaments/round-scheduling
A tournament SHALL begin as an ordinary start of its room's current game through the room's own gate (rooms-and-matchmaking/game-start-gate); from that initiation onward, Convex SHALL be the sole authority for scheduling and starting every round. The first round SHALL NOT begin before the tournament's scheduled start time, however early it was initiated or its teams were ready; each subsequent round SHALL be created and started by the platform after the previous round finishes and the configured interlude has elapsed, gated by no readiness declaration and no human initiation — scheduled rounds auto-start. After the final round finishes the tournament concludes, and no further game SHALL be auto-created: the format-governed arm of game-lifecycle/successor-auto-creation, made concrete.

#### Scenario: #never-before-the-scheduled-moment
- **WHEN** the tournament is initiated with every team ready long before the scheduled start time
- **THEN** the first round still begins no earlier than that moment — readiness accelerates nothing

#### Scenario: #no-ready-check-between-rounds
- **WHEN** a subsequent round's start moment arrives and no team has declared anything about it
- **THEN** the round starts anyway — the readiness gate governs manually initiated starts (rooms-and-matchmaking/game-start-gate), and no scheduled round consults it

#### Scenario: #interlude-then-the-platform-acts
- **WHEN** a round finishes with rounds remaining
- **THEN** the next round begins only after the interlude has elapsed, and beginning it is the platform's act alone — no captain, room actor, or admin initiates a scheduled round

#### Scenario: #nothing-after-the-final-round
- **WHEN** the final round transitions to finished
- **THEN** no successor game is auto-created — the succession that follows ordinary games ends with the tournament

### Requirement: tournaments/scheduled-start-override
Tournament rounds SHALL be schedule-bound starts in the sense of game-lifecycle/launch-gates, exercising its override concretely: a round SHALL start at its scheduled moment regardless of any participating team's recorded server health (team-server-management/server-healthcheck), and a team whose nominated server refuses the round's game invitation or fails to answer within the invitation window (team-server-management/game-invitations, team-server-management/invitation-acceptance) SHALL forfeit its seat in that round rather than delaying or aborting the start. Every round SHALL resolve within its own start orchestration — to play among the seated teams, or to the walkover or no-contest of tournaments/walkover-and-no-contest — never lingering unstarted awaiting a team's recovery.

#### Scenario: #unhealthy-is-ignored-at-the-bell
- **WHEN** the scheduled moment arrives while a participating team's server reports unhealthy
- **THEN** the start proceeds — the manual start's health block never applies to a scheduled round; if the server nevertheless accepts its invitation within the window the team plays, and otherwise the team forfeits the round

#### Scenario: #refusal-costs-the-seat-not-the-round
- **WHEN** a team's server refuses the invitation or times out while two or more other teams' servers accept
- **THEN** the round proceeds with the seated teams and the absent team forfeits — the abort that would answer a manual start's refusal never fires for a scheduled round

#### Scenario: #bounded-resolution
- **WHEN** a round starts, whatever each server answers or fails to answer
- **THEN** the round reaches a resolved state — playing, or finished by walkover or no-contest — within that same orchestration; the tournament schedule never stalls on one team's server

### Requirement: tournaments/forfeit-scoring
A team that forfeits a tournament round SHALL be scored in that round's outcome as a loss with score 0 and recorded among the round's unseated teams on the game record (game-lifecycle/game-record); that marking — not the score value — SHALL be what distinguishes a forfeit from a played loss. The forfeit SHALL be reflected wherever the round's results are consumed: outcome and ranking surfaces, leaderboards, and the finished round's replay presentation.

#### Scenario: #zero-scored-and-marked
- **WHEN** a round proceeds with two or more seated teams while others forfeited
- **THEN** each forfeiting team's outcome entry is a loss with score 0 bearing the forfeit marking, and the seated teams' entries carry whatever their play produced

#### Scenario: #marking-not-value-distinguishes
- **WHEN** a team plays a round to the end and finishes with score 0
- **THEN** its entry is a played loss carrying no forfeit marking — a consumer of the outcome tells forfeits apart by the marking alone, never by inference from the score value

#### Scenario: #forfeit-visible-downstream
- **WHEN** the round's results appear on a ranking or leaderboard surface, or its replay is viewed
- **THEN** the forfeiting teams are presented as having forfeited, not merely as having scored 0

### Requirement: tournaments/walkover-and-no-contest
When a tournament round's invitation resolution seats exactly one team, the round SHALL resolve as a walkover through the direct not-started-to-finished transition of game-lifecycle/status-authority: the sole seated team SHALL be recorded as the round's winner with score 1.0 — par, the exact value the platform's normalised scoring yields for a field of one — and every other team per tournaments/forfeit-scoring. When zero teams are seated, the round SHALL resolve as a no-contest through the same transition: every participating team a forfeiter with score 0 and no winner recorded. No sentinel outcome value — "winner by default" or otherwise — SHALL exist: walkover and no-contest outcomes use the same numeric score shape as played rounds. Round chaining (tournaments/round-scheduling) SHALL proceed from a walkover or no-contest round exactly as from a played one.

#### Scenario: #walkover-scores-par
- **WHEN** exactly one team's server accepts the round's invitation
- **THEN** the round finishes without ever playing, the sole seated team's outcome entry is a win with the plain numeric score 1.0, and every forfeiter's is a marked loss with score 0 — no sentinel, no walkover-specific value

#### Scenario: #no-contest-no-winner
- **WHEN** no team's server accepts the round's invitation
- **THEN** the round finishes without ever playing, every participating team is a forfeiter with score 0, and the outcome records no winner

#### Scenario: #chaining-indifferent-to-branch
- **WHEN** a round resolves as a walkover or no-contest
- **THEN** the interlude runs and the next round is scheduled exactly as after a played round — and a final round concluded on any branch still ends the tournament

### Requirement: tournaments/tournament-roster-freeze
A tournament SHALL be an enclosing competitive engagement holding each participating team's competitive composition frozen for the tournament's entire lifetime: from the moment the first round enters play until the moment the final round finishes — spanning inter-round interludes as well as active rounds — the platform SHALL reject every mutation of a participating team's membership, captaincy, and server nomination. The freeze SHALL be anchored to the tournament's own in-progress state, never derived from whether some round is currently being played.

#### Scenario: #frozen-through-the-interlude
- **WHEN** a roster mutation is attempted for a participating team between two rounds — the previous round finished, the next not yet begun
- **THEN** it is rejected exactly as it would be mid-round: the interlude is inside the tournament, not between freezes

#### Scenario: #anchored-to-the-tournament-not-to-a-round
- **WHEN** the freeze is evaluated during an interlude, at a moment no game of the team's is in play
- **THEN** the check consults the tournament's own in-progress state directly — an implementation deriving the freeze from "some game of this team is playing" would silently unfreeze between rounds and violates this requirement

#### Scenario: #lifts-when-the-final-round-finishes
- **WHEN** the tournament's final round transitions to finished
- **THEN** the freeze lifts: participating teams' roster mutations are accepted again, with no residual tournament hold
