## Purpose

Multi-round competitive play. A tournament is a distinctly created,
platform-run event: an organiser creates it with a fixed number of
rounds, a fixed inter-round interlude and a scheduled start, and the
tournament then creates and governs the rooms its contests are played in.
Each round comprises one or more matches; each match is contested by a
fixed set of teams in its own room, and is played out as one or more
games. Nothing in the event is manually initiated — the opening round
waits for its scheduled moment, each finished round chains into the next
after the interlude, and the event runs to its final round. Because the
schedule outranks any one team's ability to show up, this capability also
owns what absence means: the forfeit — a seat lost and marked as such —
the walkover a sole present team wins at par, and the no-contest that
resolves a round nobody could enter. It owns what the event adds up to
(the running standing and the winner at the end), the graceful stall that
leaves a tournament indeterminate when the platform itself cannot start a
round, and the competitor's view of where the event stands. The launch
machinery a game rides on — orchestration, launch gates, the
straight-to-finished transition, instance provisioning — is the game
lifecycle's; the invitation and healthcheck contracts a start consults
are team-server management's; the rooms, their enrolment, and the
readiness-gated manual start this format's rooms deliberately do without
are the matchmaking story's; how a game scores its teams is the engine's.
This capability defines the competition format that composes them. It
also owns what a forfeit means everywhere a result is read, and so
imposes a reporting obligation on presentation surfaces other
capabilities build and primarily own — the live scoreboard of a game in
play, the replay of a finished one, and the histories and rankings that
list it — because a forfeit is this capability's concept and no other
capability should have to restate it.

Depends on: game-engine, game-lifecycle, rooms-and-matchmaking,
team-management, team-server-management, live-game-observation,
replay-and-audit, accounts-and-profiles, global-invariants.

## ADDED Requirements

### Requirement: tournaments/tournament-creation
Depends on: rooms-and-matchmaking/room-creation, global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction.

Any authenticated user SHALL be able to create a tournament, and creation SHALL be the only way one comes into being. The act SHALL supply all three of the tournament's meta-parameters, every one of them required with no default standing in for an omission and each rejected outside its range: the number of rounds, a whole number from 1 to 16; the inter-round interlude, a duration from 0 to 120 minutes, where 0 means the next round begins as soon as the previous one finishes; and the scheduled start, a moment strictly later than the creation itself. The same act SHALL create the tournament record together with the room of each match of its opening round, so a tournament never exists without the settings its first contests are played in. Until the tournament begins, teams are enrolled and the games' parameter values are configured through those rooms' ordinary affordances.

#### Scenario: #every-meta-parameter-is-required
- **WHEN** a creation attempt omits the round count, the interlude, or the scheduled start, or supplies one outside its range
- **THEN** the tournament is not created and the offending parameter is named — no default quietly fills an omission, so no event ever runs on a shape nobody chose

#### Scenario: #created-with-its-settings
- **WHEN** a tournament has just been created
- **THEN** the room each of its opening contests will be played in already exists, each with its own not-yet-launched game ready to be configured and its teams ready to be enrolled — no separate room-creation step for anyone to perform or forget

#### Scenario: #a-start-already-past-is-refused
- **WHEN** the scheduled start named at creation is not strictly later than the moment of creation
- **THEN** creation is rejected — an event whose start has already passed would begin the instant it existed, leaving no window in which to enrol its teams or configure its play

### Requirement: tournaments/round-structure
Depends on: game-lifecycle/game-record, game-lifecycle/instance-per-game, global-invariants/single-convex-deployment, rooms-and-matchmaking/room-record, rooms-and-matchmaking/team-enrolment, team-management/archive-not-delete, global-invariants/state-confined-to-owning-runtime#game-instance-holds-only-its-games-state.

A tournament SHALL be an ordered sequence of rounds; each round SHALL comprise one or more matches; each match SHALL be contested by a fixed set of teams in its own room, which the tournament created; and each match SHALL be played out as one or more games in that room, every game a full game record served by its own freshly provisioned instance. The records SHALL carry that structure explicitly — a round naming its matches, a match naming its room, its teams and its games — so that several matches of one round can be contested in parallel without any record changing shape; the format as specified here produces exactly one match per round and one game per match. The tournament SHALL govern every room it creates for the whole of its own lifetime, releasing them only once the event concludes or halts, so no room of a running event is ever left unclaimed. The tournament's meta-parameters SHALL be properties of the tournament as a whole and of no round, match, or game: the tournament is the one record spanning them, and so lives where state outliving a single game lives. The tournament's participant set SHALL be fixed when the tournament begins — the teams then enrolled in its opening round's rooms and not archived at that moment — and every later round SHALL be contested by that same set.

#### Scenario: #every-round-a-real-game
- **WHEN** any game of any match of a tournament is examined
- **THEN** it is a complete game — its own record, its own instance, its own outcome — indistinguishable in kind from a standalone game, its per-game state included: nothing of one game reaches the next except what the tournament and match records carry

#### Scenario: #forfeit-does-not-unseat
- **WHEN** a team forfeits a round of a tournament
- **THEN** it remains a participant of the tournament — the next round's start invites its server again, and only that round's outcome carries the forfeit

#### Scenario: #archived-teams-are-not-participants
- **WHEN** a team enrolled in an opening room has been archived by the moment the tournament begins
- **THEN** it is left out of the participant set entirely rather than seated and marked absent — an archived team enters no new game, and a team that is not a participant is never invited to a later round either

#### Scenario: #a-second-match-reshapes-nothing
- **WHEN** a round holding the single match this format produces is examined
- **THEN** it holds that match as one member of a set — adding a second, concurrently contested match to a round changes no record's shape, because no round, match, or room record was built around there being exactly one

### Requirement: tournaments/round-config-inheritance
Depends on: game-lifecycle/game-record, global-invariants/game-instance-hermeticity#seeded-once-never-refreshed.

Every game of a tournament SHALL be played under the same gameplay configuration: the configuration captured, at the moment the tournament begins, from the opening round's first game, and copied into each later game's own record. The captured set SHALL exclude the tournament's meta-parameters — round count, interlude, scheduled start — which describe the event and not any game's play. That captured base configuration, never a live read of any game record, SHALL be what each later game's instance is seeded with at initialisation.

#### Scenario: #identical-play-round-to-round
- **WHEN** a later round's game is created
- **THEN** its gameplay configuration equals the tournament's captured base configuration — the same board-shaping and play parameters in every game of the event

#### Scenario: #no-nested-tournament
- **WHEN** an auto-created round's game configuration is examined
- **THEN** no tournament meta-parameter has been inherited into it — the game's finish chains within the enclosing tournament rather than spawning a tournament of its own

#### Scenario: #the-capture-closes-the-editing-window
- **WHEN** a configuration edit is made in any of the tournament's rooms after the event has begun
- **THEN** it changes no later round: every later game is built from the copy taken at the start, so a mid-event edit can never make round three a different game from round one

### Requirement: tournaments/round-scheduling
Depends on: rooms-and-matchmaking/game-start-gate, global-invariants/runtime-ownership, game-lifecycle/successor-auto-creation.

Every game of a tournament SHALL be started by the platform alone, with Convex the sole authority for scheduling them: no user initiates any of them and no readiness declaration gates any of them. The opening round SHALL begin at the tournament's scheduled start and at no earlier moment, however early its teams were enrolled or declared ready; each later round SHALL be created — its matches, their rooms and their games together — and started once the previous round has finished and the configured interlude has elapsed. A game finishing in a tournament's room SHALL never be followed by an auto-created successor: the tournament alone decides what comes next and creates it in the room of the contest it belongs to. Once the final round finishes the tournament SHALL conclude and create nothing further — the format-governed arm of successor auto-creation, made concrete.

#### Scenario: #never-before-the-scheduled-moment
- **WHEN** the tournament's teams are all enrolled and ready long before the scheduled start time
- **THEN** the opening round still begins no earlier than that moment — readiness accelerates nothing

#### Scenario: #the-bell-does-not-wait
- **WHEN** the scheduled moment arrives with a participant unready, absent, or silent
- **THEN** the round begins regardless — the scheduled start is a commitment competitors plan their people and servers around, and only the platform's own inability to start a round ever defers it

#### Scenario: #no-ready-check-between-rounds
- **WHEN** a later round's start moment arrives and no team has declared anything about it
- **THEN** the round starts anyway — the readiness gate governs the starts a user initiates in an ordinary room, and no game of a tournament consults it

#### Scenario: #interlude-then-the-platform-acts
- **WHEN** a round finishes with rounds remaining
- **THEN** the next round begins only after the interlude has elapsed, and beginning it is the platform's act alone — no captain, room owner, or admin initiates a scheduled round

#### Scenario: #nothing-after-the-final-round
- **WHEN** the final round transitions to finished
- **THEN** no successor game is auto-created in any of the event's rooms — the succession that follows ordinary games ends with the tournament, and the rooms are released rather than left holding a game nobody will play

### Requirement: tournaments/scheduled-start-override
Depends on: game-lifecycle/launch-gates, team-server-management/server-healthcheck, team-server-management/game-invitations, team-server-management/invitation-acceptance.

Tournament games SHALL be schedule-bound starts, exercising the launch gates' override concretely: a game SHALL start at its scheduled moment regardless of any participating team's recorded server health, and a team whose home server declines the game's invitation or fails to answer within the invitation window SHALL forfeit its seat in that game rather than delaying or aborting the start. Whatever each participating team's server answers, or fails to answer, the game's own start orchestration SHALL carry it to a resolution — play among the seated teams, a walkover, or a no-contest — and SHALL never wait for a server to recover. That bound is over what the participating servers do; what the platform itself does when it cannot start a round at all is a separate matter.

#### Scenario: #unhealthy-is-ignored-at-the-bell
- **WHEN** the scheduled moment arrives while a participating team's server reports unhealthy
- **THEN** the start proceeds — the manual start's health block never applies to a scheduled game; if the server nevertheless accepts its invitation within the window the team plays, and otherwise the team forfeits

#### Scenario: #refusal-costs-the-seat-not-the-round
- **WHEN** a team's server declines the invitation or times out while two or more other teams' servers accept
- **THEN** the game proceeds with the seated teams and the absent team forfeits — the abort that would answer a manual start's refusal never fires for a scheduled game

#### Scenario: #bounded-resolution
- **WHEN** a game starts and one or more servers decline their invitation or let the window expire
- **THEN** that same orchestration resolves the game on the servers that did answer — no retry-until-healthy loop defers it, and one team's server never holds up the schedule for everybody else

### Requirement: tournaments/round-launch-failure
Depends on: game-lifecycle/no-orphans, game-lifecycle/launch-orchestration, global-invariants/client-truthfulness#rejections-reach-the-user.

When a round cannot be launched for a platform reason rather than a team's absence — board generation, instance provisioning, initialization, or the orchestration itself failing — the tournament SHALL stall rather than skip the round or press on: the round stays not-started with whatever was provisioned for it cleaned up, no further round is created or started, and the tournament enters a halted state recording what failed. The halt SHALL be surfaced rather than left to be inferred from a schedule that stopped firing. A halted tournament SHALL NOT resume, by itself or on request: recovery is an operator repairing the infrastructure and creating a fresh tournament, and the halted event stays halted as the record of what happened.

#### Scenario: #the-stall-is-graceful-and-named
- **WHEN** a round's launch fails for a platform reason
- **THEN** the tournament halts with the failure recorded and shown, and the round it stalled on is left not-started with nothing orphaned behind it — competitors and the organiser learn that the event has stopped and why, instead of waiting on a schedule that will never fire

#### Scenario: #a-halted-event-was-never-won
- **WHEN** a halted tournament's outcome is consulted, then or ever afterwards
- **THEN** it is indeterminate — no winner is recorded for an event that did not complete — while the games that did finish keep their own records and results unchanged

#### Scenario: #no-self-resumption
- **WHEN** the infrastructure that failed recovers
- **THEN** the halted tournament does not pick its schedule back up and offers no resume path — a rerun is a new tournament with its own scheduled start, so nobody is dropped into a round against a schedule everyone stopped watching

### Requirement: tournaments/forfeit-scoring
Depends on: game-lifecycle/game-record, game-engine/scoring#forfeit-exclusion, live-game-observation/scoreboard-sole-aggregate-authority, replay-and-audit/board-level-replay, replay-and-audit/team-game-history, accounts-and-profiles/leaderboard, accounts-and-profiles/player-profile, accounts-and-profiles/team-profile.

A team that does not take its seat in a tournament game SHALL be recorded among that game's unseated teams on the game record, and that marking — not the score value — SHALL be what distinguishes a forfeit from a played loss; what a forfeiter scores is the engine's scoring rule, which this capability neither restates, redefines, nor recomputes. The marking SHALL be part of the finished game's persisted record, alongside the score, so a forfeit is read from the record rather than inferred. A forfeit SHALL be reported semantically as a forfeit, never merely as the score it carries, everywhere a round's result is shown — the event's own standings, the presentation of a finished game's result and the histories and rankings that list it, the running scoreboard while the game is in play, and a replay of the round — presentation surfaces this capability does not own, and requires this of nonetheless, because a forfeit is its concept to define and no other capability should have to know what one is in order to show one.

#### Scenario: #zero-scored-and-marked
- **WHEN** a game proceeds with two or more seated teams while others forfeited
- **THEN** each forfeiting team's outcome entry bears the forfeit marking and carries the score the engine's scoring rule gives a forfeiter, and the seated teams' entries carry whatever their play produced

#### Scenario: #marking-not-value-distinguishes
- **WHEN** a team plays a game to the end and finishes with a score of zero
- **THEN** its entry is a played loss carrying no forfeit marking — a consumer of the outcome tells forfeits apart by the marking alone, never by inference from the score value

#### Scenario: #forfeit-visible-downstream
- **WHEN** a finished round's result is presented — on the event's own standings, as the game's own result, in a team's or a player's game history, or on a ranking that counts it
- **THEN** every forfeiting team is shown as having forfeited, and not merely as having scored what a forfeiter scores: each of those surfaces reports the marking it reads from the record, so nobody reading a result is left inferring an absence from a number

#### Scenario: #live-scoreboard-names-the-absence
- **WHEN** a tournament game is in play with fewer than all of its participants seated, and the running scoreboard of that game is watched
- **THEN** each unseated participant is presented on it as having forfeited the round — neither dropped from the field nor shown as a competitor merely scoring nothing, so an observer can tell "never turned up" from "turned up and is losing" while the round is still running

#### Scenario: #the-replay-shows-the-forfeit
- **WHEN** a finished round that was played out with one or more participants forfeited is replayed
- **THEN** the replay presents those teams as forfeiters of the round, from its first moment and throughout — a viewer of a round no snake of theirs ever entered is told why, rather than left to read the empty field as a gap in the recording

### Requirement: tournaments/walkover-and-no-contest
Depends on: game-lifecycle/status-authority, game-engine/scoring, global-invariants/one-shared-engine.

When a tournament game's invitation resolution seats exactly one team, the game SHALL resolve as a walkover through the direct not-started-to-finished transition: the sole seated team SHALL be recorded as the winner with the score the platform's one shared scoring implementation yields for a field of one — par, exactly 1.0 — and every other participating team recorded as a forfeiter. When zero teams are seated, the game SHALL resolve as a no-contest through the same transition: every participating team a forfeiter, and no winner recorded. No sentinel outcome value — "winner by default" or otherwise — SHALL exist: walkover and no-contest outcomes use the same numeric score shape as played games. Chaining SHALL proceed from a walkover or no-contest round exactly as from a played one.

#### Scenario: #walkover-scores-par
- **WHEN** exactly one team's server accepts the game's invitation
- **THEN** the game finishes without ever playing, the sole seated team's outcome entry is a win with the plain numeric score 1.0, and every forfeiter's is a marked loss at the forfeiter's score — no sentinel, no walkover-specific value

#### Scenario: #no-contest-no-winner
- **WHEN** no team's server accepts the game's invitation
- **THEN** the game finishes without ever playing, every participating team is a marked forfeiter, and the outcome records no winner

#### Scenario: #chaining-indifferent-to-branch
- **WHEN** a round resolves as a walkover or no-contest
- **THEN** the interlude runs and the next round is scheduled exactly as after a played round — and a final round concluded on any branch still ends the tournament

### Requirement: tournaments/event-outcome
Depends on: game-engine/scoring, game-lifecycle/game-record.

A tournament's standing at any moment SHALL be each participant's total of the scores its games in the event have recorded so far, taken as recorded with no round weighted differently from another. The event's winner SHALL be the participant holding the highest total once the final round has finished; participants tied at the top SHALL share the result, this format running no tiebreak of its own. Before the final round finishes there SHALL be a standing but no winner, and a tournament that never finishes its final round SHALL never acquire one.

#### Scenario: #standing-is-the-running-total
- **WHEN** a tournament's standing is taken between two rounds
- **THEN** it is the sum of what each participant's completed games scored — the same numbers those games recorded, added up, with nothing recomputed and no round counted twice or discounted

#### Scenario: #winner-only-at-the-end
- **WHEN** the event's outcome is consulted while rounds remain
- **THEN** there is a standing but no winner: only the final round's finish turns the leading total into the event's result, so a mid-event leader is never presented as having won

#### Scenario: #a-tie-at-the-top-is-a-tie
- **WHEN** two participants finish the event on the same highest total
- **THEN** both are recorded as sharing the result — no tiebreak round is invented, which would run the event past the round count its organiser fixed

### Requirement: tournaments/tournament-roster-freeze
Depends on: global-invariants/transactional-invariant-enforcement.

A tournament SHALL be an enclosing competitive engagement holding each participating team's competitive composition frozen for the tournament's entire lifetime: from the moment the tournament begins until the moment it concludes or halts — spanning inter-round interludes as well as active rounds — the platform SHALL reject every mutation of a participating team's membership, captaincy, and server nomination. The freeze SHALL be anchored to the tournament's own state, never derived from whether some round is currently being played.

#### Scenario: #frozen-through-the-interlude
- **WHEN** a roster mutation is attempted for a participating team between two rounds — the previous round finished, the next not yet begun
- **THEN** it is rejected exactly as it would be mid-round: the interlude is inside the tournament, not between freezes

#### Scenario: #anchored-to-the-tournament-not-to-a-round
- **WHEN** the freeze is evaluated during an interlude, at a moment no game of the team's is in play
- **THEN** the check consults the tournament's own state directly — an implementation deriving the freeze from "some game of this team is playing" would silently unfreeze between rounds and violates this requirement

#### Scenario: #lifts-when-the-final-round-finishes
- **WHEN** the tournament's final round transitions to finished
- **THEN** the freeze lifts: participating teams' roster mutations are accepted again, with no residual tournament hold

#### Scenario: #a-halt-lifts-it-too
- **WHEN** a tournament halts on a platform failure and stays halted
- **THEN** the freeze lifts there as well — a stalled event holds nobody's roster hostage, and a freeze that could outlive every event it was taken for would be unliftable by anything but a repair

### Requirement: tournaments/tournament-view
Depends on: rooms-and-matchmaking/room-lobby, global-invariants/client-truthfulness.

Every room a tournament governs SHALL present, within that room's own interface and to everyone who can see the room, where the event stands: which tournament the room belongs to and which round of how many and which match of that round it is contesting, the teams contesting it, the results of the event's completed rounds with each round's resolution presented as what it was — played out, a walkover, or a contest nobody entered — the current standing of every participant, and what comes next — the moment the next round begins, or that the event has concluded and who won, or that it has halted and on what failure. A competitor SHALL be able to orient themselves from the room they are playing in, without assembling the event's state out of separate game records.

#### Scenario: #orient-without-leaving-the-room
- **WHEN** a competitor opens the room of a tournament match
- **THEN** they can see which round of how many they are in, whom they are playing, what has already happened in the event, and how it stands — the room is the orienting surface, not a bare game with a schedule hidden behind it

#### Scenario: #the-wait-is-explained
- **WHEN** the room is viewed before the scheduled start, or during an interlude, when its current game is merely waiting
- **THEN** the view names the moment play begins, so a quiet room is never mistaken for a finished, forgotten, or stalled one

#### Scenario: #the-endings-are-distinguishable
- **WHEN** the tournament has concluded, or has halted on a platform failure
- **THEN** the view says which of the two it is — a concluded event names its winner, and a halted one is presented as indeterminate rather than as an event somebody won
