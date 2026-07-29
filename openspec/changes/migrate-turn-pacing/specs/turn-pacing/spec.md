## Purpose

The team decides when its turn resolves. This capability owns the team-side
pacing that arrives at that decision: each operator's durable tempo, the
unanimous-flow precondition under which the team's automated player submits
the turn, the Captain's immediate override, the automated player's
submission passes — the scheduled cadence and the deadline-driven final
flush, timed by the team's live, game-scoped pacing parameters — and the
pacing surface of the live interface. The clock's arithmetic rules belong to
the engine; its realization inside the game's own runtime, the
declare-turn-over operation the team's decision invokes, and the
exactly-once trigger of resolution belong to the game-runtime story; who
holds which snake, how moves are staged, and the Captain's boot belong to
the operator story; how the automated player decides a move belongs to the
framework story; where the timing parameters are stored, edited, and
captured belongs to the configuration story.

Depends on: game-engine, game-runtime, global-invariants, operator-control,
bot-framework, bot-configuration.

## ADDED Requirements

### Requirement: turn-pacing/live-pacing-parameters
Depends on: bot-configuration/team-bot-parameters, bot-configuration/game-start-snapshot, game-engine/chess-timer.

For each game, each team SHALL have game-scoped live values of its submission-timing parameters — the automatic submission time allocation, the scheduled-submission interval, and the imminent-deadline threshold — initialised from the team's captured defaults at game start and independently adjustable during play. This live record SHALL be the operative source that every consumer reads directly; the current values are never derived by scanning recorded activity. Where the team has captured no default for the automatic submission time allocation, that game-scoped value SHALL initialise to exactly the clock time the game accrues to the team each turn — the time it adds to the team's budget per turn, so a team that never tunes the parameter takes as long as the game gives it and no longer, spending its accrual each turn and neither draining nor banking its budget.

#### Scenario: #unset-allocation-defaults-to-the-turns-accrual
- **WHEN** a game starts for a team whose captured defaults set no automatic submission time allocation
- **THEN** its game-scoped allocation is exactly the clock time the game accrues to it each turn — a principled default rather than a platform-chosen constant, and one the team may retune during play like any other pacing value

#### Scenario: #live-record-not-derivation
- **WHEN** any consumer needs a team's current pacing values
- **THEN** it reads the live game-scoped record directly — no consumer reconstructs the current values by replaying a history of edits

#### Scenario: #mid-game-retuning-is-live
- **WHEN** a team adjusts a timing value during play
- **THEN** submission cadence and deadline arming use the new value from their next scheduling decision, without restart — and the team's defaults for future games are untouched

### Requirement: turn-pacing/operator-tempo
Depends on: operator-control/captain-boot.

Each of a team's operators SHALL have a durable per-game **tempo** — `flow` ("comfortable with the automated submission cadence") or `thinking` ("hold the turn while I think") — written only by that operator, toggleable in either direction at any moment of the game, and untouched by turn boundaries. The only automatic write SHALL be that every (re)connect — first join, reconnect after a network drop, or rejoin after a Captain boot — sets the operator's tempo to flow; and a write restating the operator's current tempo SHALL be accepted as a deliberate act of the operator, never rejected as redundant. Tempo SHALL gate nothing but the team's automated declaration path: every operator interaction remains available in either tempo, and the team's clock runs and expires regardless of any operator's tempo.

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
Depends on: operator-control/captain-boot.

A team's **active operators** SHALL be exactly its currently connected member operators — coaches and admins are never active operators, hold no tempo, and never count — and unanimous flow among the active operators SHALL be the necessary precondition for the team's automated player to declare the turn over. The precondition SHALL be passive: its becoming true triggers no flush, submission, or declaration, it merely permits the automated declaration path to proceed on its own schedule. With zero active operators the precondition SHALL be unsatisfied — automated declaration deferred until an operator joins in flow — and the precondition SHALL bind only the automated path: the Captain's submit and clock expiry declare regardless of every operator's tempo.

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
- **WHEN** the Captain boots an operator
- **THEN** the booted operator leaves the active set exactly as a network disconnect would — their tempo no longer counted — and on reconnecting they rejoin the active set in flow like any other joiner

### Requirement: turn-pacing/scheduled-submission
Depends on: bot-framework/score-composition, bot-framework/softmax-decision, game-runtime/staged-move-log, operator-control/manual-mode.

During each turn the team's automated player SHALL run a scheduled submission pass at the team's scheduled-submission interval: for each automatic-mode snake whose decision state has news, it samples a direction and stages it. A snake without news since it was last staged SHALL not be re-rolled, and manual-mode snakes are never swept. Staging the decided move SHALL be the act that consumes the snake's news, and it SHALL consume it only once the staging is acknowledged — never at sampling, never at send, and never as a side effect of publishing the snake's decision state to its observers, which the same pass may also do.

#### Scenario: #no-news-no-reroll
- **WHEN** a pass reaches a snake whose decision state is unchanged since its move was last staged
- **THEN** no new sample is drawn and nothing is re-staged — the standing staged move rides until there is news or the turn ends

#### Scenario: #ack-gates-the-clear
- **WHEN** a staging call fails or its acknowledgement never arrives
- **THEN** the snake still counts as having news and the next pass retries — a decision can be lost by the network, never forgotten by the player

#### Scenario: #publishing-is-not-staging
- **WHEN** a pass publishes a snake's decision state to its observers but its staging is still outstanding
- **THEN** the snake still counts as having news — only the acknowledged staging consumes it, so telling the team what the snake is thinking never stands in for telling the game what it decided

### Requirement: turn-pacing/final-flush
Depends on: game-engine/chess-timer, game-runtime/turn-declaration.
Each turn the automated player SHALL arm a final-submission deadline from live state — the smaller of the team's automatic submission time allocation and its observed remaining time, brought forward by the imminent-deadline threshold — re-arming it earlier whenever the observed remaining time falls below what the armed deadline assumed. At the deadline it SHALL flush every automatic-mode snake with pending news, however recently staged; it SHALL then declare the team's turn over once the flow quorum permits — immediately when the quorum holds at the deadline, otherwise on its own schedule if the quorum is satisfied later in the turn. The scheduled cadence SHALL continue until the turn is actually declared over.

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
Depends on: operator-control/captain-boot, global-invariants/centaur-state-boundary#bot-to-game-flow-never-routes-through-convex, game-runtime/turn-declaration.

The reference application SHALL offer the Captain's controls — an immediate **turn-submit**, additionally bindable to a keyboard shortcut, alongside the operator boot — to the team's current Captain alone: invoking turn-submit declares the team's turn over at once with exactly the moves currently staged, regardless of every operator's tempo. Offering turn-submit to the Captain alone is how the reference application allocates the control and is expressly **not** an access control: nothing rejects a turn-over declaration because the human behind it is not the Captain, and a Centaur Server is free to decide for itself which of its own operators are offered the affordance. A Captain submission SHALL suppress the automated final flush — no fresh decision is sampled or staged after the human judgement that the current staged set stands — and the automated player SHALL learn of any declaration solely by observing the game instance's declared state on its subscription: no interface-to-player channel mediates pacing, and the submission act itself is intent, distinct from the game's declared state.

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

#### Scenario: #captain-only-is-allocation-not-enforcement
- **WHEN** a team runs a Centaur Server that offers turn-submit to every member operator, or a non-Captain member reaches the submission path directly
- **THEN** the resulting declaration stands — no rule anywhere rejects it for coming from a non-Captain, because who is offered the control is a choice each application makes, not a constraint on who may end the turn

### Requirement: turn-pacing/pacing-header
Depends on: operator-control/operator-presence-and-identity, game-runtime/in-game-clock.

The live interface header SHALL present the team's pacing state: the current turn number, the team's clock countdown and remaining budget, and each active operator's current tempo on the presence display — the tempo read from the durable tempo record, never inferred from presence, which proves connectedness only. The countdown SHALL run at sub-second precision with a distinct warning state as expiry nears, and once the team has declared it SHALL be replaced by a stable turn-submitted indicator that never flickers back to a countdown while the remaining teams finish declaring.

#### Scenario: #sub-second-countdown-with-warning
- **WHEN** a team's clock runs low
- **THEN** the countdown's precision makes the imminent deadline legible and the warning state is unmistakable — an operator never loses a turn to a display that hid how little time remained

#### Scenario: #submitted-indicator-holds
- **WHEN** the team's turn has been declared over while other teams are still deciding
- **THEN** the header shows a steady turn-submitted indicator — never flickering back to a countdown before the next turn begins

#### Scenario: #tempo-from-the-record
- **WHEN** the header renders a teammate's tempo
- **THEN** the value comes from the durable tempo record, with presence proving only that the operator is connected — connectedness and pacing stance are never conflated
