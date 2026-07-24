## Purpose

The team decides when its turn resolves. This capability owns the runtime
realization of the game's chess clock inside the live game instance and the
declaration workflow built on it — explicit declaration, implicit
declaration by clock expiry, automatic declaration for snakeless teams, and
the exactly-once trigger of turn resolution — plus the team-side pacing
above it: each operator's durable tempo, the unanimous-flow precondition
under which the team's automated player submits the turn, the Captain's
immediate override, the automated player's submission passes — the
scheduled cadence and the deadline-driven final flush, timed by the team's
live pacing parameters — and the pacing surface of the live interface. The
clock's arithmetic rules belong to the engine; who holds which snake, how
moves are staged, and the Captain's boot belong to the operator story; how
the automated player decides a move belongs to the framework story; where
the timing parameters are stored, edited, and captured belongs to the
configuration story.

Depends on: game-engine, operator-control, bot-framework, bot-configuration.

## ADDED Requirements

### Requirement: turn-pacing/in-game-clock
The game's SpacetimeDB instance SHALL realise the engine's chess-timer rules (game-engine/chess-timer) entirely within its own state — tracking each team's time budget, carving each turn's clock out of the budget, banking declared remainders, and detecting expiry — with no external runtime mediating clock timing. At every observable instant a team's budget and per-turn clock SHALL sum exactly to its total remaining time, and the first turn's clocks SHALL start running the moment the game becomes playable.

#### Scenario: #no-external-timekeeper
- **WHEN** every system outside the game instance is slow, disconnected, or down
- **THEN** clocks still tick, expire, and declare on time — per-turn timing never waits on, or takes input from, any other runtime

#### Scenario: #invariant-at-every-instant
- **WHEN** a team's timing state is read at any moment — mid-turn, at carve-out, at declaration
- **THEN** budget plus clock equals total remaining time exactly (game-engine/chess-timer#carve-out-arithmetic) — no observable instant double-counts or drops the carved-out clock

#### Scenario: #clocks-run-from-playability
- **WHEN** the game becomes playable
- **THEN** the first turn's clocks are already running from that moment — with no grace period, a team whose operators arrive late has genuinely spent that time

### Requirement: turn-pacing/turn-declaration
The game instance SHALL expose a declare-turn-over operation invocable only by the owning team's admitted operator and bot connections: a declaration stops the team's clock and banks the remainder into its budget (game-engine/chess-timer#declaration-banks-the-remainder), and repeated declarations within a turn are idempotent. The instance SHALL itself detect a clock reaching zero and treat it as an implicit declaration, and SHALL treat a team with no alive snakes as having declared at each turn's start; every declaration SHALL carry its kind — explicit, clock-expiry, or snakeless — distinguishably.

#### Scenario: #second-declaration-is-a-no-op
- **WHEN** a team's connections declare turn over twice in one turn
- **THEN** the second declaration changes nothing — no double credit, no error, no new record of a distinct declaration

#### Scenario: #expiry-detected-autonomously
- **WHEN** a team's clock reaches zero while none of its clients is even connected
- **THEN** the instance itself declares the team's turn over (game-engine/chess-timer#expiry-declares-automatically), marked as a clock-expiry declaration distinct from an explicit one

#### Scenario: #snakeless-team-never-blocks
- **WHEN** a team has no alive snakes while the game continues
- **THEN** it counts as having declared at the start of every subsequent turn, marked as such — resolution never waits out an eliminated team's clock

#### Scenario: #only-the-team-declares
- **WHEN** a spectator, coach, or opposing connection invokes the declaration for a team
- **THEN** it is rejected — only the owning team's own admitted operator and bot connections can end its turn

### Requirement: turn-pacing/exactly-once-resolution
The game instance SHALL trigger turn resolution (game-engine/turn-resolution-model) exactly once per turn, at the moment the last participating team's declaration lands — under any mix of explicit, clock-expiry, and snakeless declarations — and under no other condition: not elapsed wall-clock time alone, not administrative action, not connection changes.

#### Scenario: #any-mix-one-trigger
- **WHEN** one team declares explicitly, another expires, and a third is snakeless
- **THEN** resolution runs exactly once, at the instant the last outstanding declaration lands

#### Scenario: #nothing-else-resolves
- **WHEN** wall-clock time passes, connections churn, or an administrator intervenes while any team remains undeclared
- **THEN** no resolution occurs — the all-declared condition is the sole trigger

### Requirement: turn-pacing/next-turn-bracket
Once a turn's resolution has committed, the game instance SHALL never attribute a late staged move or declaration to the committed turn — a late-arriving operation is treated as the new turn's or rejected, never silently reordered into committed history — and SHALL open the next turn with the commit: budget increment applied and the new clock carved out (game-engine/chess-timer), staging (operator-control/staged-move-log) and declarations accepted.

#### Scenario: #no-silent-reordering
- **WHEN** a staged move or declaration arrives after the turn it aimed at has committed
- **THEN** it lands in the new turn or is rejected outright — the committed turn's record is exactly what resolution consumed, never retroactively edited

#### Scenario: #next-turn-opens-with-the-commit
- **WHEN** a turn's resolution commits
- **THEN** the next turn is immediately live — incremented budgets, freshly carved clocks already running, and staging and declaration accepted — with no dead interval in which the game is between turns

### Requirement: turn-pacing/live-pacing-parameters
For each game, each team SHALL have game-scoped live values of its submission-timing parameters (bot-configuration/team-bot-parameters) — the automatic submission time allocation, the scheduled-submission interval, and the imminent-deadline threshold — initialised from the team's captured defaults at game start (bot-configuration/game-start-snapshot) and independently adjustable during play. This live record SHALL be the operative source that every consumer reads directly; the current values are never derived by scanning recorded activity.

#### Scenario: #live-record-not-derivation
- **WHEN** any consumer needs a team's current pacing values
- **THEN** it reads the live game-scoped record directly — no consumer reconstructs the current values by replaying a history of edits

#### Scenario: #mid-game-retuning-is-live
- **WHEN** a team adjusts a timing value during play
- **THEN** submission cadence and deadline arming use the new value from their next scheduling decision, without restart — and the team's defaults for future games are untouched

### Requirement: turn-pacing/operator-tempo
Each of a team's operators SHALL have a durable per-game **tempo** — `flow` ("comfortable with the automated submission cadence") or `thinking` ("hold the turn while I think") — written only by that operator, toggleable in either direction at any moment of the game, and untouched by turn boundaries. The only automatic write SHALL be that every (re)connect — first join, reconnect after a network drop, or rejoin after a Captain boot (operator-control/captain-boot) — sets the operator's tempo to flow; and a write restating the operator's current tempo SHALL be accepted as a deliberate act of the operator, never rejected as redundant. Tempo SHALL gate nothing but the team's automated declaration path (turn-pacing/flow-quorum): every operator interaction remains available in either tempo, and the team's clock runs and expires regardless of any operator's tempo.

#### Scenario: #durable-across-turns
- **WHEN** turns come and go while an operator makes no tempo change
- **THEN** their tempo carries over unchanged — an operator in flow stays in flow with zero per-turn action, and an operator thinking stays thinking until they themselves switch back

#### Scenario: #flow-on-every-rejoin
- **WHEN** an operator joins the team's game session by any path — first join, post-drop reconnect, or reconnect after being booted
- **THEN** their tempo is set to flow as part of (re)connecting — the single automatic tempo write, applied uniformly to every joining path

#### Scenario: #thinking-stops-only-the-automated-declaration
- **WHEN** an operator switches to thinking
- **THEN** they can still select, stage, edit, and toggle freely, teammates are unaffected, and the team's clock keeps running toward expiry — thinking withholds consent from automated declaration and does nothing else

#### Scenario: #restating-tempo-is-still-an-act
- **WHEN** an operator sets the tempo value they already hold
- **THEN** the write is accepted as that operator's deliberate pacing act — a no-op on the record's value is not an error and is not silently discarded

### Requirement: turn-pacing/flow-quorum
A team's **active operators** SHALL be exactly its currently connected member operators — coaches and admins are never active operators, hold no tempo, and never count — and unanimous flow among the active operators SHALL be the necessary precondition for the team's automated player to declare the turn over. The precondition SHALL be passive: its becoming true triggers no flush, submission, or declaration, it merely permits the automated declaration path (turn-pacing/final-flush) to proceed on its own schedule. With zero active operators the precondition SHALL be unsatisfied — automated declaration deferred until an operator joins in flow — and the precondition SHALL bind only the automated path: the Captain's submit (turn-pacing/captain-submit) and clock expiry declare regardless of every operator's tempo.

#### Scenario: #passive-never-a-trigger
- **WHEN** the last thinking operator returns to flow
- **THEN** nothing fires on that transition — the automated player is merely permitted, from that moment, to declare per its own submission timing

#### Scenario: #zero-operators-defers
- **WHEN** a team's last active operator disconnects or is booted mid-turn
- **THEN** automated declaration is deferred — but the clock keeps running and expiry still declares, so an unattended team can never stall the game

#### Scenario: #observers-never-count
- **WHEN** a coach or admin observes the team's session while an active operator is thinking
- **THEN** the observer neither blocks nor satisfies the quorum — unanimity ranges over member operators' tempos only, and observers have none

#### Scenario: #boot-leaves-rejoin-restores
- **WHEN** the Captain boots an operator (operator-control/captain-boot)
- **THEN** the booted operator leaves the active set exactly as a network disconnect would — their tempo no longer counted — and on reconnecting they rejoin the active set in flow like any other joiner

### Requirement: turn-pacing/scheduled-submission
During each turn the team's automated player SHALL run a scheduled submission pass at the team's scheduled-submission interval (turn-pacing/live-pacing-parameters): for each automatic-mode snake whose decision state has news (bot-framework/score-composition), it samples a direction (bot-framework/softmax-decision) and stages it (operator-control/staged-move-log), and SHALL mark the news consumed only upon the staging acknowledgement — never at sampling or send. A snake without news since it was last staged SHALL not be re-rolled, and manual-mode snakes are never swept (operator-control/manual-mode).

#### Scenario: #no-news-no-reroll
- **WHEN** a pass reaches a snake whose decision state is unchanged since its move was last staged
- **THEN** no new sample is drawn and nothing is re-staged — the standing staged move rides until there is news or the turn ends

#### Scenario: #ack-gates-the-clear
- **WHEN** a staging call fails or its acknowledgement never arrives
- **THEN** the snake still counts as having news and the next pass retries — a decision can be lost by the network, never forgotten by the player

### Requirement: turn-pacing/final-flush
Each turn the automated player SHALL arm a final-submission deadline from live state — the smaller of the team's automatic submission time allocation and its observed remaining time, brought forward by the imminent-deadline threshold (turn-pacing/live-pacing-parameters) — re-arming it earlier whenever the observed remaining time falls below what the armed deadline assumed. At the deadline it SHALL flush every automatic-mode snake with pending news, however recently staged; it SHALL then declare the team's turn over (turn-pacing/turn-declaration) once the flow quorum permits (turn-pacing/flow-quorum) — immediately when the quorum holds at the deadline, otherwise on its own schedule if the quorum is satisfied later in the turn. The scheduled cadence (turn-pacing/scheduled-submission) SHALL continue until the turn is actually declared over.

#### Scenario: #deadline-tracks-the-clock
- **WHEN** the team's observed remaining time shrinks below what the armed deadline assumed
- **THEN** the deadline is re-armed earlier, so the flush always lands with the threshold's lead time before the clock could expire — never after

#### Scenario: #expiry-never-wastes-decisions
- **WHEN** a team is heading for clock expiry
- **THEN** the deadline fires first and stages every pending decision, so the expiry declaration submits the player's full current intent — expiry cuts time short, never work already done

#### Scenario: #quorum-withheld-flushes-but-defers
- **WHEN** the deadline passes while an operator is thinking
- **THEN** the flush still stages everything pending but no declaration is issued — the team spends its remaining time thinking, and the turn ends by a later flow unanimity, the Captain's submit, or expiry

### Requirement: turn-pacing/captain-submit
The live interface SHALL expose the Captain's controls — an immediate **turn-submit**, additionally bindable to a keyboard shortcut, alongside the operator boot (operator-control/captain-boot) — to the team's current Captain alone: invoking turn-submit declares the team's turn over at once (turn-pacing/turn-declaration) with exactly the moves currently staged, regardless of every operator's tempo. A Captain submission SHALL suppress the automated final flush — no fresh decision is sampled or staged after the human judgement that the current staged set stands — and the automated player SHALL learn of any declaration solely by observing the game instance's declared state on its subscription: no interface-to-player channel mediates pacing, and the submission act itself is intent, distinct from the game's declared state. Any invocation of a Captain control by a non-Captain — keyboard shortcut included — SHALL be rejected server-side; the tempo toggle is expressly not Captain-gated.

#### Scenario: #immediate-and-tempo-blind
- **WHEN** the Captain fires turn-submit while operators are thinking
- **THEN** the turn is declared immediately with exactly what is staged — the quorum binds the automated path only, never the Captain's judgement

#### Scenario: #no-flush-after-the-human-decision
- **WHEN** the Captain submits while automatic-mode snakes still have pending news
- **THEN** the pending final flush is cancelled and no new sample lands after the submission — what the Captain saw staged is what resolves; only the deadline path flushes

#### Scenario: #declaration-observed-never-signalled
- **WHEN** the automated player must stand down its pending flush after a Captain submission
- **THEN** it reacts to the declared state observed on its own game subscription — no message from the interface to the player exists, so the two can never disagree about whether the turn is over

#### Scenario: #keyboard-under-pressure
- **WHEN** the Captain operates without pointer input
- **THEN** turn-submit is available on a keyboard binding — the override is usable at the speed the pacing story exists to serve

#### Scenario: #non-captain-rejected-server-side
- **WHEN** a non-Captain invokes a Captain control by any means, interface or direct call
- **THEN** it is rejected server-side regardless of what any client displayed — while every member operator still owns their own tempo toggle

### Requirement: turn-pacing/pacing-header
The live interface header SHALL present the team's pacing state: the current turn number, the team's clock countdown and remaining budget, and each active operator's current tempo on the presence display (operator-control/operator-presence-and-identity) — the tempo read from the durable tempo record, never inferred from presence, which proves connectedness only. The countdown SHALL run at sub-second precision with a distinct warning state as expiry nears, and once the team has declared it SHALL be replaced by a stable turn-submitted indicator that never flickers back to a countdown while the remaining teams finish declaring.

#### Scenario: #sub-second-countdown-with-warning
- **WHEN** a team's clock runs low
- **THEN** the countdown's precision makes the imminent deadline legible and the warning state is unmistakable — an operator never loses a turn to a display that hid how little time remained

#### Scenario: #submitted-indicator-holds
- **WHEN** the team's turn has been declared over while other teams are still deciding
- **THEN** the header shows a steady turn-submitted indicator — never flickering back to a countdown before the next turn begins

#### Scenario: #tempo-from-the-record
- **WHEN** the header renders a teammate's tempo
- **THEN** the value comes from the durable tempo record, with presence proving only that the operator is connected — connectedness and pacing stance are never conflated
