## Purpose

The authoritative turn loop of a game in play: the state a game's own runtime
holds and is authoritative for, and the single transaction that advances it.
This capability owns the append-only staged-move log and the terms on which a
move enters it; the in-runtime realization of the chess clock, the measurement
of what each turn cost, and the declare-turn-over operation; the exactly-once
trigger of turn resolution; and the one transaction that assembles the game's
state and its timings, obtains the turn's outcome from the shared engine, and
commits every consequence together — the turn-keyed historical record, the
closed turn-event set and its canonical order, the per-team aggregate rows, the
attribution carried on every recorded act, the clocks the resolution returns to
open the next turn, and the freeze that follows the end-detecting commit. The rules the transaction executes belong to the
engine; the instance's existence — provisioning, the once-only
initialization, teardown — belongs to the lifecycle story; what an admitted
connection may read of any of this belongs to the observation story; who
stages, who holds a snake, when a team decides to declare, how a move is
decided, and what becomes of the record once it leaves at game end belong to
the operator, pacing, framework, and replay stories.

Admission test — a requirement belongs in this capability iff all three
hold: **(a)** it is realised inside one game's own runtime and is
authoritative — it commits game state, or it defines the instance-resident
state that committing reads and writes; **(b)** it is agent-blind — stated
with no reference to a human role, an interface, or coordination held outside
the instance, so it reads identically for a game played entirely by bots with
no operator interface in existence; **(c)** it is pre-egress — about the
instance's own state and transitions, not about what a connection may read of
them and not about what the platform does with the record after it leaves at
game end. Anything failing (a) belongs to the capability owning the runtime
that holds it; anything failing (b) is a user story and belongs to the story
capability; anything failing (c) belongs to the observation story or the
replay story.

Depends on: game-engine, game-lifecycle, global-invariants,
identity-and-authorization, test-sequences.

## ADDED Requirements

### Requirement: game-runtime/resolving-transaction
Depends on: global-invariants/authoritative-turn-resolution, global-invariants/one-shared-engine#no-parallel-implementation, game-engine/turn-resolution-model, global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants.

Turn resolution SHALL be one transaction that assembles the game's current state from the instance's own records together with the timings it measured for the turn, obtains the turn's outcome from the shared engine alone, and commits every consequence of that outcome together: the turn's historical rows and events, the per-team aggregate rows, the item-lifetime stamps, the clock and budget movements the resolution returns, and the end condition it reports. No consequence of a turn SHALL be written by a second transaction, a follow-up operation, or an external caller.

#### Scenario: #assembled-from-instance-state-alone
- **WHEN** the transaction builds the inputs it resolves
- **THEN** every one of them comes from the instance's own records, the parameters seeded into it, or its own measurement of what the turn cost — never from a caller-supplied board, a client's view, or a call to any other system

#### Scenario: #one-commit-carries-everything
- **WHEN** a turn resolves
- **THEN** every consequence lands in that one commit; a consequence noticed afterwards has no second transaction to arrive in, so an incomplete turn is a defect at commit time rather than a gap to backfill

#### Scenario: #no-second-writer
- **WHEN** the instance's mutating surface is enumerated
- **THEN** it admits move staging, turn declaration, and turn resolution — beyond the once-only initialization that precedes play — and nothing else writes committed turn state, so no repair, backfill, or administrative path exists through which a turn's record could be completed or corrected

#### Scenario: #outcome-is-the-engines
- **WHEN** the committed state is compared with what the shared engine produced for the assembled input
- **THEN** they agree in every respect; the transaction transcribes the outcome and originates nothing of its own beyond the measuring, recording, and aggregate obligations stated in this capability

### Requirement: game-runtime/exactly-once-resolution
Depends on: global-invariants/authoritative-turn-resolution, game-engine/turn-resolution-model, global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants.

The game instance — resolution's sole authoritative executor — SHALL trigger turn resolution exactly once per turn, at the moment the last participating team's declaration lands — under any mix of explicit, clock-expiry, and snakeless declarations — and under no other condition: not elapsed wall-clock time alone, not administrative action, not connection changes.

#### Scenario: #any-mix-one-trigger
- **WHEN** one team declares explicitly, another expires, and a third is snakeless
- **THEN** resolution runs exactly once, at the instant the last outstanding declaration lands — two final declarations landing concurrently cannot both fire it

#### Scenario: #nothing-else-resolves
- **WHEN** wall-clock time passes, connections churn, or an administrator intervenes while any team remains undeclared
- **THEN** no resolution occurs — the all-declared condition is the sole trigger

### Requirement: game-runtime/next-turn-bracket
Depends on: game-engine/chess-timer, global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic.

Once a turn's resolution has committed, the game instance SHALL never attribute a late staged move or declaration to the committed turn — a late-arriving operation is treated as the new turn's or rejected, never silently reordered into committed history — and SHALL open the next turn with the commit: budget increment applied and the new clock carved out, staging and declarations accepted.

#### Scenario: #no-silent-reordering
- **WHEN** a staged move or declaration arrives after the turn it aimed at has committed
- **THEN** it lands in the new turn or is rejected outright — the committed turn's record is exactly what resolution consumed, never retroactively edited

#### Scenario: #next-turn-opens-with-the-commit
- **WHEN** a turn's resolution commits
- **THEN** the next turn is immediately live — incremented budgets, freshly carved clocks already running, and staging and declaration accepted — with no dead interval in which the game is between turns

### Requirement: game-runtime/in-game-clock
Depends on: game-engine/chess-timer, global-invariants/game-instance-hermeticity.

The game's SpacetimeDB instance SHALL realise the engine's chess-timer rules entirely within its own state — holding each team's budget and per-turn clock as the last resolution committed them, draining the running clock against its own wall clock, and detecting expiry — with no external runtime mediating clock timing, a guarantee the instance's hermeticity makes reachable. The budget and clock movements themselves SHALL arrive from a turn's resolution rather than being applied between turns, so the instance holds one copy of a team's time and no second copy it maintains itself. At every observable instant a team's budget and its per-turn clock as then observed — what the last resolution committed, less the time measured since the turn began — SHALL sum exactly to its total remaining time, and the first turn's clocks SHALL start running the moment the game becomes playable.

#### Scenario: #no-external-timekeeper
- **WHEN** every system outside the game instance is slow, disconnected, or down
- **THEN** clocks still tick, expire, and declare on time — per-turn timing waits on nothing outside the instance

#### Scenario: #invariant-at-every-instant
- **WHEN** a team's timing state is read at any moment — mid-turn, at carve-out, at declaration
- **THEN** budget plus clock equals total remaining time exactly — no observable instant double-counts or drops the carved-out clock

#### Scenario: #one-copy-of-a-teams-time
- **WHEN** a team's committed budget is compared with whatever figure the instance keeps for it between turns
- **THEN** there is nothing to compare: the running clock is derived by subtracting measured elapsed time from what the last resolution committed, and a budget is written only by committing a resolution — so no separately maintained copy exists to drift from the time the game's rules were applied to

#### Scenario: #clocks-run-from-playability
- **WHEN** the game becomes playable
- **THEN** the first turn's clocks are already running from that moment — with no grace period, a team whose operators arrive late has genuinely spent that time

### Requirement: game-runtime/turn-declaration
Depends on: global-invariants/team-granularity-authorization, global-invariants/authenticated-unambiguous-identity, game-engine/chess-timer#declaration-banks-the-remainder, global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants, game-engine/chess-timer#expiry-declares-automatically.

The game instance SHALL expose a declare-turn-over operation invocable only by the owning team's admitted operator and bot connections, with no finer check of which member or bot is acting: a declaration stops the team's clock and banks the remainder into its budget, and repeated declarations within a turn are idempotent. The instance SHALL itself detect a clock reaching zero and treat it as an implicit declaration, and SHALL treat a team with no alive snakes as having declared at each turn's start; every declaration SHALL carry its kind — explicit, clock-expiry, or snakeless — distinguishably.

#### Scenario: #second-declaration-is-a-no-op
- **WHEN** a team's connections declare turn over twice in one turn
- **THEN** the second declaration changes nothing — no double credit, no error, no new record of a distinct declaration

#### Scenario: #expiry-detected-autonomously
- **WHEN** a team's clock reaches zero while none of its clients is even connected
- **THEN** the instance itself declares the team's turn over, marked as a clock-expiry declaration distinct from an explicit one

#### Scenario: #snakeless-team-never-blocks
- **WHEN** a team has no alive snakes while the game continues
- **THEN** it counts as having declared at the start of every subsequent turn, marked as such — resolution never waits out an eliminated team's clock

#### Scenario: #only-the-team-declares
- **WHEN** a spectator, coach, or opposing connection invokes the declaration for a team
- **THEN** it is rejected — only the owning team's own admitted operator and bot connections can end its turn

#### Scenario: #team-granular-but-never-anonymous
- **WHEN** a declaration is accepted
- **THEN** the instance has resolved the calling connection to an authenticated agent even though it branches on nothing finer than the team — a team-granular check never produces an unattributed act

### Requirement: game-runtime/staged-move-log
Depends on: game-engine/movement, game-engine/chess-timer, game-lifecycle/instance-per-game, global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game.

The game's SpacetimeDB instance SHALL record staged moves in an append-only per-turn log retained for the game's lifetime: every staging appends an entry, no entry is ever edited or cleared — turn resolution included — and no cancel operation exists. The effective move for a snake is the latest entry for that snake in the current turn; entries from prior turns never carry over — a snake with no current-turn entry moves by the engine's fallback.

#### Scenario: #supersession-is-not-deletion
- **WHEN** two directions are staged for the same snake in one turn
- **THEN** both entries remain in the log permanently and the later is the effective move — last-write-wins is a read rule over the log, never a destructive overwrite

#### Scenario: #nothing-carries-over
- **WHEN** a snake's newest entry was staged in turn T and turn T+1 resolves with nothing staged for it
- **THEN** the snake moves by fallback, not by the stale entry — even though that entry is still in the log

#### Scenario: #revocation-is-supersession
- **WHEN** a staged move is to be taken back
- **THEN** there is nothing to cancel — a different direction is staged, and the log records the change of mind instead of erasing it

#### Scenario: #accepted-until-declaration
- **WHEN** a burst of staged moves arrives just before the team declares its turn over
- **THEN** each is an ordinary append with no final-submission barrier or freeze window, and resolution consumes exactly what the log holds at the instant of declaration

#### Scenario: #single-home
- **WHEN** any component needs a staged move — to display it, supersede it, or resolve the turn
- **THEN** it reads this log in the game's instance, the state's owning runtime

### Requirement: game-runtime/team-scoped-staging
Depends on: identity-and-authorization/role-bound-privileges, global-invariants/team-granularity-authorization#staging-is-team-checked, global-invariants/security-enforced-outside-the-library.

The game's SpacetimeDB instance SHALL accept a staged move only from an admitted operator or bot connection of the team that owns the named snake, and any such connection MAY stage for any of its team's snakes — staging rights are team-granular, never tied to any within-team coordination the instance neither stores nor checks. The team binding SHALL be the association established at admission, never assertable per call, and SHALL be checked by the instance's own reducer.

#### Scenario: #any-team-snake-regardless-of-coordination
- **WHEN** a connection stages for one of its team's snakes that another of the team's connections is currently coordinating over
- **THEN** the instance accepts the move; within-team discipline is coordination state held elsewhere, invisible to the game runtime

#### Scenario: #spoofed-parameters-rejected
- **WHEN** a call's parameters imply an association with another team
- **THEN** the instance decides from the connection's admission-time binding alone and rejects staging for the other team's snake

### Requirement: game-runtime/staging-is-unvalidated
Depends on: game-engine/movement, global-invariants/authoritative-turn-resolution.

Move staging SHALL perform no legality evaluation: any direction in the game vocabulary is accepted for any living team snake, including directions that are immediately lethal. Consequences attach only at turn resolution, through the engine's movement and collision rules as the instance runs them.

#### Scenario: #lethal-direction-accepted
- **WHEN** a direction leading straight into a wall is staged
- **THEN** the entry is appended like any other, and if still effective at resolution the snake moves there and dies by the collision rules — staging never protects a team from its own choice

### Requirement: game-runtime/turn-keyed-game-record
Depends on: global-invariants/game-instance-hermeticity, game-lifecycle/instance-initialization.

A game's instance SHALL accumulate, for the whole life of the game, a turn-keyed historical record from which every completed turn's full observable state is directly queryable — without re-executing any rule and without consulting any other runtime. The record SHALL comprise at minimum: a snapshot of every snake's full state at each turn boundary; every item's lifetime as its spawn turn and its consumed-or-destroyed turn; the board layout, written once at initialization and never after; each team's post-turn time budget together with how its turn was declared over — the declaration kind, with the timestamp for explicit declarations; each turn's wall-clock start and the wall-clock moment its resolution began; the timings supplied to that turn's resolution — its duration and each team's burn; the per-team aggregate rows written for that turn; and every turn event, attributed to the turn that produced it. Retention SHALL be unbounded for the instance's life: no cap, eviction, or windowing ever drops a completed turn from the record.

#### Scenario: #items-derivable-at-any-turn
- **WHEN** the set of items on the board at some past turn is needed
- **THEN** it is directly derivable from the spawn/destroyed turn pairs alone — items present from the start carry spawn turn 0, and nothing requires replaying spawns

#### Scenario: #resolution-takes-time
- **WHEN** per-turn timing is read from the record
- **THEN** both the turn's start and its resolution's start are present, so the time resolution itself took is measurable — nothing in the record assumes resolution is instantaneous

#### Scenario: #the-timings-are-recorded-because-they-were-inputs
- **WHEN** a completed turn is reproduced from the record
- **THEN** the duration and the per-team burns that turn's resolution was given are read from the record and supplied again — they were inputs of the resolution on the same footing as the staged moves, so a record holding only their effects would reproduce the turn by inventing them

#### Scenario: #unbounded-retention
- **WHEN** a game runs to a very high turn count
- **THEN** every early turn remains directly queryable in-instance for the instance's whole life — memory pressure is an implementation concern, never a licence to evict history

#### Scenario: #aggregates-are-recorded-not-recomputed
- **WHEN** a completed turn's per-team aggregates — score, alive count, aggregate length — are read from the record
- **THEN** the rows written at that turn are there to be read, so nothing recomputes them from the snapshots and a historical figure can never disagree with the figure published while the game ran

### Requirement: game-runtime/append-only-record
Depends on: global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic, global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants.

Every row the instance commits — game-record row, turn event, aggregate row, attribution entry, staged-move entry — SHALL be append-only: once committed it is never mutated or deleted, not for later discoveries, corrections, or any other reason, and previously readable historical state SHALL keep reading identically as new records append. Sole exception: an item's destroyed-turn field is stamped exactly once, from empty, by the later turn that consumes or destroys the item.

#### Scenario: #no-retroactive-correction
- **WHEN** a defect is discovered in an already-committed turn's records
- **THEN** the committed records stand unchanged — historical correctness is the resolving transaction's responsibility at commit time, never a later rewrite's

#### Scenario: #past-reads-stable
- **WHEN** the same past turn is read before and after further turns commit
- **THEN** the results are identical — appending new history never perturbs what was already readable

#### Scenario: #the-single-stamp
- **WHEN** an item is consumed or destroyed
- **THEN** its lifetime record's destroyed-turn is written once, from empty — the one permitted touch of a previously written row, and it is never re-stamped

### Requirement: game-runtime/turn-event-record
Depends on: game-engine/turn-events, global-invariants/one-shared-engine.

The record's turn events SHALL form a closed enumeration — the engine's event vocabulary plus a hazard-damage event for each snake that took hazard damage and survived the turn — with no extensibility mechanism: a new event kind exists only by deliberate revision of this requirement, and of the one shared engine's vocabulary it closes over. Each stored event SHALL carry enough information for a replay or animation client to visualise its outcome without re-executing resolution and without diffing successive snapshots.

#### Scenario: #death-carries-its-cause
- **WHEN** a snake dies
- **THEN** its death event states the cause explicitly — with contributing damage sources and the responsible snake where applicable — so no client infers the cause from an alive-to-dead transition between snapshots

#### Scenario: #hazard-damage-never-double-counted
- **WHEN** a snake dies with hazard damage contributing
- **THEN** only the death event is recorded, carrying hazard among its sources — hazard-damage events exist for survivors only, so no consumer counts the same damage twice

#### Scenario: #no-new-kinds-by-extension
- **WHEN** a new observable outcome is proposed for the record
- **THEN** it enters only by revising the closed set — never through a generic, custom, or extensible event kind

### Requirement: game-runtime/canonical-event-order
Depends on: global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic.

A turn's events SHALL be a set carrying a canonical representation order that is derived entirely from the events' own data — event-type class, then the subject's identifier — never stored as a separate ordering datum, and stable across independent replays of the same game. The order is representational only: it asserts no causal or temporal relation within the turn, and it imposes no delivery-order obligation on any live channel.

#### Scenario: #derived-not-stored
- **WHEN** a consumer needs a turn's events in canonical order
- **THEN** it derives the order from the event data alone — no stored sequence column exists, so nothing can drift out of step with the derivation rule

#### Scenario: #stable-across-replays
- **WHEN** the same game is reproduced independently
- **THEN** every turn's canonical order is identical, so two records of the same game compare bit-exactly

#### Scenario: #order-implies-no-causality
- **WHEN** one event precedes another in canonical order
- **THEN** nothing about within-turn timing or causation follows — the turn's outcomes were committed atomically as one set

### Requirement: game-runtime/per-turn-scoreboard
Depends on: game-engine/scoring, global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants.

For every completed turn the instance SHALL write exactly one aggregate row per rostered team — zero-filled, never omitted, for teams with no living snakes — carrying that team's aggregates at the turn boundary: the normalised score the game would have if it ended at that turn, the alive-snake count, and the aggregate body length, computed over the true alive set including invisible snakes, in the same transaction as the turn it summarises. A written row SHALL be a durable per-turn fact of the game's own historical record, not a projection assembled for a live subscription, and it SHALL be the sole computation of any team-level aggregate for that turn.

#### Scenario: #invisible-snakes-counted
- **WHEN** a team has an invisible snake at the turn boundary
- **THEN** the row's aggregates include it — the aggregates are computed over the true alive set, whatever any connection may later be permitted to see

#### Scenario: #eliminated-teams-zero-filled
- **WHEN** a team has no living snakes at a turn
- **THEN** its row is present with zeroed aggregates, never omitted — every rostered team gets a row every turn

#### Scenario: #live-score-reads-as-if-ended
- **WHEN** a mid-game turn's score is written
- **THEN** it is the normalised score the game would produce if it ended at that boundary — par 1.0 for a proportional share — not a raw segment count

#### Scenario: #written-with-the-turn
- **WHEN** a turn's snake states are committed
- **THEN** that turn's aggregate rows are committed with them, in the one transaction — no interval exists in which a committed turn has no rows or stale ones

#### Scenario: #rows-outlive-the-live-audience
- **WHEN** a completed turn's aggregates are wanted after every subscription to the game has ended
- **THEN** the row written for that turn is still the answer, because it went into the game's record rather than being computed for whoever was watching — so nothing downstream has to re-derive a score, an alive count, or an aggregate length and risk a different figure

### Requirement: game-runtime/replay-sufficiency
Depends on: global-invariants/authoritative-turn-resolution, game-engine/determinism, test-sequences/canonical-encoding, test-sequences/replay-check, test-sequences/determinism#production-seed-derivation.

The game record SHALL be sufficient to reconstruct a complete replay of the game — every board state, every item lifetime, every turn event, and every staged-move attribution — without consulting any runtime other than the instance that produced it. Its engine-valued content SHALL carry the platform's one canonical encoding of recorded resolver runs, and comparison of two records SHALL be defined over that encoding: no second encoding of the same engine values exists to compare under. Given identical seeds, configuration, and staged-move sequence with identical timing, the accumulated record SHALL be identical.

#### Scenario: #nothing-else-consulted
- **WHEN** a complete replay is reconstructed from the record
- **THEN** no other runtime, live subscription, or side channel is needed — the record alone carries everything a replay requires

#### Scenario: #one-canonical-encoding
- **WHEN** the record's engine values are encoded — for comparison, for the game-end export, or for persistence
- **THEN** they take the same canonical form recorded resolver runs already use, so two equal engine values always encode identically; a second, record-local shape for the same values is a defect rather than an alternative

#### Scenario: #bit-identical-reproduction
- **WHEN** a game is re-run from the same seeds, configuration, and staged-move sequence
- **THEN** the two records compare equal turn by turn under that one encoding, evaluated by the platform's existing recorded-run replay-check with its halt-at-first-divergence reporting rather than by a comparison harness written for replays alone — determinism is a property of the record, externally verifiable record-to-record

### Requirement: game-runtime/connect-time-attribution
Depends on: global-invariants/authenticated-unambiguous-identity, global-invariants/team-granularity-authorization.

The game instance SHALL resolve every admitted connection to an agent value — the team identity for a bot connection, the operator's identity for an operator connection — at the moment of admission, and SHALL retain an attribution entry per admitted connection for the instance's whole life. That agent value SHALL be carried untouched wherever the connection's actions are recorded: the runtime never interprets, maps, or substitutes it — during play or during export. Attribution entries SHALL never be mutated or deleted: disconnection writes nothing, and a reconnecting client is admitted as a fresh entry, so every historical attribution remains resolvable forever.

#### Scenario: #resolved-at-connect-never-later
- **WHEN** any recorded action must be attributed
- **THEN** the agent value resolved at that connection's admission is used as-is — no later step re-derives, translates, or reinterprets attribution, and no raw connection identifier ever stands in for it

#### Scenario: #disconnect-erases-nothing
- **WHEN** a connection ends mid-game — network cut, client shutdown, or forced removal
- **THEN** its attribution entry and every action already attributed through it remain intact and resolvable

#### Scenario: #reconnect-appends-fresh
- **WHEN** a client reconnects
- **THEN** it is admitted under a fresh attribution entry while prior entries persist — actions from before and after the drop each resolve through their own admission

### Requirement: game-runtime/staged-move-attribution
Depends on: game-engine/movement.

Every entry in the staged-move log SHALL permanently record the agent that wrote it, the wall-clock time it was accepted, and the turn it was staged in — so who staged what, and when, is reconstructible at any sub-turn moment of the game. A movement event SHALL carry the agent whose staged move was consumed — distinguishing bot-originated from operator-originated moves — and SHALL carry no agent when the move was determined by the engine's fallback; a missing agent has exactly that one meaning.

#### Scenario: #sub-turn-staging-history
- **WHEN** a team's within-turn deliberation is audited
- **THEN** the log yields the full sequence of staged moves with writer and time — including superseded entries — not merely the moves that resolution consumed

#### Scenario: #bot-and-operator-distinguishable
- **WHEN** the team's automated player staged the consumed move
- **THEN** the attribution is the team's identity — never any individual human — while an operator-staged move names that operator, so bot and human play are distinguishable everywhere the record is read

#### Scenario: #fallback-moves-attributed-to-no-one
- **WHEN** a snake moves by fallback because nothing was staged for it that turn
- **THEN** the movement event's attribution is empty — fallback is the sole case with no staging writer

### Requirement: game-runtime/turn-timing-measurement
Depends on: game-engine/chess-timer, game-engine/turn-resolution-model, game-engine/game-end-conditions, game-engine/configuration-parameters, global-invariants/authoritative-turn-resolution, global-invariants/game-instance-hermeticity.

The instance SHALL measure, on its own clock, how long each turn lasted and how much of its own clock each team burned on it, and SHALL supply both to that turn's resolution as declared inputs. Each measurement SHALL be the elapsed time it names — a team's burn is that team's own deliberation, the turn's duration is the turn's own length, and neither is a nominal, configured, or substituted value. The instance SHALL decide no ending from them: whether a team has run out of time and whether the game has consumed its configured duration are determined by the shared engine from what it was given, and the transaction commits that determination like any other. Reaching a configured duration limit SHALL never itself trigger a resolution.

#### Scenario: #measured-here-decided-there
- **WHEN** a turn's resolution is invoked
- **THEN** the instance supplies the turn's duration and each team's burn and reads any ending back out of the outcome — it never compares a measurement against the configured limit itself, because two things entitled to decide that a game is over is one thing too many, and only one of them holds the rules

#### Scenario: #two-quantities-not-one
- **WHEN** one team declares early in a turn and another lets its clock expire
- **THEN** each team's supplied burn is its own elapsed deliberation while the supplied duration is the turn's own length — the instance measures two quantities because the resolution charges them to two different totals, and supplying one for the other would rewrite the game's economy with nothing to catch it

#### Scenario: #the-deadline-resolves-no-turn
- **WHEN** the limit falls due mid-turn, while some team has yet to declare
- **THEN** nothing resolves on that account — the turn runs on until every team has declared or its clock has expired, and the ending lands at that resolution; a limit able to fire resolution itself would resolve a turn whose moves were still being decided, and would be a second trigger racing the first

#### Scenario: #no-external-deadline-keeper
- **WHEN** every system outside the game instance is slow, disconnected, or down as the limit falls due
- **THEN** the ending still lands, because every measurement and the moment the game became playable are instance-resident — nothing asks another runtime what time it is or whether the game should stop

### Requirement: game-runtime/game-over-freeze
Depends on: game-lifecycle/game-end-boundary, global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic.

From the commit of the turn whose resolution detects an end condition, the instance SHALL reject every gameplay operation — move staging, turn declaration, turn resolution — as game-over, with zero grace window: an in-flight operation arriving after that commit is rejected, and no further turn is ever resolved.

#### Scenario: #zero-grace-window
- **WHEN** a staged move races the final turn's commit and arrives after it
- **THEN** it is rejected as game-over — there is no window between the commit and enforcement in which late operations land

#### Scenario: #no-turns-after-end
- **WHEN** the end-detecting turn has committed
- **THEN** no subsequent turn resolves under any circumstances; the committed final turn is the last
