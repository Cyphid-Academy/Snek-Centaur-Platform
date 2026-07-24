## Purpose

Authoring a team's bot logic, and the observable behaviour of the decision
engine that runs it. This capability owns the vocabulary heuristic authors
program against — Drive and Preference, their operations, the scalar
discipline, and the safety rails that keep an author's mistakes from ever
costing the team its player — and the decision engine's observable
contract: the per-snake stateMap of worst-case weighted scores, the three
reactive inputs that drive it, the turn-scoped evaluation lifecycle,
frozen-snake semantics with per-snake turn timestamps, softmax decision
sampling, and how operator attention steers evaluation effort. The
framework is the team's automated player: it decides moves for
automatic-mode snakes and computes decision state for manual ones. The
rules of the game and its turn resolution belong to the engine; how
portfolios are configured — team defaults, per-snake overrides, and the
derivation of the temperature the framework consumes — belongs to the
configuration story; when decided moves are submitted and turns declared
belongs to the pacing story; how decision state is rendered and explained
belongs to the transparency story; the simulation machinery itself —
caches, lattices, traversal orders — is deliberately unspecified here.

Depends on: game-engine, operator-control.

## ADDED Requirements

### Requirement: bot-framework/embedded-team-player
The bot framework SHALL run as a library inside the team's hosting server process — one player per hosted team per live game, sharing that process's access to the team's Centaur state and to the team's view of its game. Everything the framework persists SHALL live in the team's Centaur state in Convex; its evaluation caches, stateMaps, and dirty flags SHALL be in-memory scratch owned by the running process, never written to any store.

#### Scenario: #restart-rebuilds-from-subscriptions
- **WHEN** the hosting server process restarts mid-game
- **THEN** the framework rebuilds every cache, stateMap, and dirty flag from its subscriptions alone — no framework-private record exists in any store to restore from, or to have gone stale

#### Scenario: #scratch-dies-with-the-game
- **WHEN** a game ends
- **THEN** the framework's in-memory evaluation state is simply discarded — nothing framework-private needs clearing in Convex or anywhere else

### Requirement: bot-framework/observe-and-stage-only
The framework SHALL learn everything it reacts to through live subscriptions — board state, staged moves, turn number, and chess clock state (game-engine/chess-timer) from its team's connection to the game's SpacetimeDB instance; portfolios, selection, and manual-mode state from its Convex subscription — never by polling, and never by copying game-instance state into Convex. Its sole write into the game SHALL be staging moves for the team's automatic-mode snakes (operator-control/staged-move-log); it SHALL never write authoritative game state and never call Centaur state mutations on an operator's behalf.

#### Scenario: #operator-edits-arrive-by-subscription
- **WHEN** an operator edits a snake's portfolio, selection, or manual mode
- **THEN** the mutation travels from the operator's client to Convex directly, and the framework observes the committed effect through its subscription and reacts — it never mediates, re-issues, or supplements the operator's mutation

#### Scenario: #no-shadow-board
- **WHEN** the framework needs game state for evaluation
- **THEN** it reads its live game-instance subscription — no copy of game-instance state is ever written to Convex, so no stale shadow of the board can exist to diverge from the game

#### Scenario: #staging-is-the-only-game-write
- **WHEN** the framework acts on any decision
- **THEN** the only write it ever performs against the game instance is appending a staged move for an automatic-mode snake — it holds no channel through which it could alter authoritative game state

### Requirement: bot-framework/heuristic-vocabulary
The framework SHALL define exactly two abstractions heuristic authors program against. A **Drive** is a parameterised, directed motivation toward or away from a future event, targeting either a snake or a cell, and comprises author-supplied operations: a reward, a distance, a motivation combiner, a satisfaction predicate, a target-eligibility predicate, a self-direction nomination, and a foreign-move nomination. A **Preference** is a targetless, time-invariant scalar function of the evaluated snake and a board state, with no distance or satisfaction concept. Goal versus Fear SHALL exist only as author-level semantics — a Fear is a Drive whose reward is typically negative — with no runtime distinction.

#### Scenario: #two-target-types-only
- **WHEN** an author defines a Drive
- **THEN** its target type is a snake or a cell — the vocabulary admits no other target kind, and anything targetless must be a Preference

#### Scenario: #goal-and-fear-share-one-runtime
- **WHEN** a Fear is evaluated
- **THEN** no code path branches on goal-versus-fear — its deterrent effect emerges purely from negative rewards flowing through the same scoring as every other Drive

#### Scenario: #preferences-have-no-target
- **WHEN** a Preference is evaluated
- **THEN** it receives only the snake and the board — no target, distance, or satisfaction machinery applies to it

### Requirement: bot-framework/scalar-discipline
Every author-facing heuristic scalar — Drive reward, motivation, terminal reward, and Preference value — SHALL lie in [−1, 1], and Drive distance SHALL be non-negative and finite. Relative importance between heuristics SHALL be expressed exclusively through portfolio weights, never by scaling outputs beyond the range, and the framework SHALL assume no algebraic property of author-supplied operations beyond these range constraints.

#### Scenario: #importance-lives-in-weights
- **WHEN** an author wants one heuristic to dominate another
- **THEN** the only legitimate lever is the portfolio weight — the vocabulary offers no way for a heuristic to shout louder than 1

#### Scenario: #no-shape-assumptions
- **WHEN** an author supplies a motivation non-monotonic in distance, or an asymmetric distance
- **THEN** the framework consumes it unchanged — no framework computation relies on monotonicity, symmetry, or any other shape property of author operations

### Requirement: bot-framework/author-fault-containment
The framework SHALL validate every author-supplied output at the boundary, before any downstream computation consumes it: out-of-range numbers are clamped to the nearest bound; non-finite, wrong-typed, or missing values are replaced by a safe default (zero for scalar outputs and for invalid distance, false for a non-boolean satisfaction result); and an exception thrown by author code is contained and treated as an invalid output of the operation that threw. No raw invalid value and no author exception SHALL ever reach scoring, sampling, staging, or written decision state — a broken heuristic degrades only its own contribution, never the team's player. Each violation SHALL be reported as a structured entry in the hosting server's process log, deduplicated per turn per (snake, heuristic, violation kind), and surfaced nowhere else.

#### Scenario: #nan-never-propagates
- **WHEN** a Drive's reward returns NaN, Infinity, or a non-number
- **THEN** zero is consumed in its place, evaluation proceeds normally, and a structured log entry records the offending heuristic, the raw value, and the substitution

#### Scenario: #thrown-exception-is-contained
- **WHEN** author code throws mid-evaluation
- **THEN** the framework substitutes the safe default for that operation and continues — no worker, player, or sibling snake's evaluation is disrupted, and the team keeps playing

#### Scenario: #log-noise-is-bounded
- **WHEN** a runaway heuristic violates its contract on every invocation
- **THEN** at most one log entry per (snake, heuristic, violation kind) is emitted per turn, and the deduplication window resets when the turn changes

### Requirement: bot-framework/drive-satisfaction
When a Drive's satisfaction predicate holds in a simulated world, its contribution to that world's score SHALL be its terminal reward — the reward operation applied in that world — bypassing distance and the motivation combiner. A Drive whose satisfaction predicate holds on a turn's observed authoritative board SHALL be retired from the snake's portfolio at that turn's close; satisfaction in merely simulated worlds SHALL never retire a Drive.

#### Scenario: #terminal-reward-bypasses-motivation
- **WHEN** a Drive is satisfied in a simulated world
- **THEN** its contribution there is its weight times its reward in that world — the distance and motivation path is not consulted for that world

#### Scenario: #simulated-satisfaction-does-not-retire
- **WHEN** many simulated worlds satisfy a Drive but the turn resolves to a board where its predicate does not hold
- **THEN** the Drive stays active into the next turn — retirement is anchored to the authoritative board alone, so a hypothetical success never deletes a live motivation

### Requirement: bot-framework/per-snake-portfolio
Each snake owned by the team SHALL have, at every moment of a game, a **portfolio**: its active Preferences each with a current weight, its active Drives each with a concrete target and a current weight, and one effective softmax temperature. The framework SHALL consume the effective temperature as a single opaque scalar that reaches it already derived — it neither derives, stores, nor interprets the sources behind it.

#### Scenario: #portfolio-is-total
- **WHEN** a snake momentarily has no active Drives
- **THEN** it still has a portfolio — its Preferences and its temperature — and remains fully playable; there is no instant in a game at which an owned snake lacks one

#### Scenario: #temperature-is-opaque
- **WHEN** the effective temperature changes for any reason
- **THEN** the framework simply uses the new scalar at its next sampling decision, with no cache invalidation and no knowledge of why it changed

### Requirement: bot-framework/candidate-directions
For each owned alive snake the framework SHALL enumerate candidate self-directions from the game's direction vocabulary. Directions immediately lethal on the observed pre-turn board — by the engine's movement and collision rules (game-engine/movement) — MAY be deprioritised, but SHALL be retained as last-resort candidates so that an alive snake always has at least one candidate direction.

#### Scenario: #all-lethal-still-decides
- **WHEN** every direction is immediately lethal for a snake
- **THEN** the candidate set is still non-empty — the doomed snake gets a scored decision and a staged move rather than silent paralysis

#### Scenario: #contingent-death-is-not-filtered
- **WHEN** a direction is lethal only contingent on what a foreign snake chooses
- **THEN** it is not deprioritised as immediately lethal — only certain death on the observed pre-turn board qualifies; contingent outcomes are what worst-case scoring exists to weigh

### Requirement: bot-framework/reactive-inputs
Exactly three reactive inputs SHALL determine the live content of an owned snake's evaluation: its **interest map** (per foreign snake, the union of the snake's active Drives' foreign-move nominations), each foreign snake's **commitment**, and the **portfolio weights**. A simulated world SHALL count as active for the snake's scoring if and only if every foreign move it assumes is in the snake's interest map and consistent with that foreign snake's commitment; all other evaluated worlds are dormant, and input changes move worlds between active and dormant.

#### Scenario: #nothing-else-is-reactive
- **WHEN** anything other than the three inputs changes — wall-clock time, connection churn, unrelated team activity
- **THEN** the snake's active-world set and stateMap are unaffected

#### Scenario: #dormant-worlds-reactivate
- **WHEN** a foreign snake's commitment moves away from a direction and later returns to it
- **THEN** the worlds that went dormant count as active again — activation is a predicate over the current inputs, never a destructive discard of evaluated work

### Requirement: bot-framework/turn-scoped-evaluation
Evaluation work accumulated for a snake within a turn SHALL only ever grow, and SHALL be discarded exactly when the turn number observed on the game subscription changes, restarting evaluation against the new board. A reconnection to the game instance that resurfaces the same turn number SHALL NOT discard anything.

#### Scenario: #reconnect-same-turn-keeps-work
- **WHEN** the game connection drops and re-establishes within one turn
- **THEN** accumulated evaluations, stateMaps, and dirty flags survive intact — a mid-turn network blip costs the team no computed progress

#### Scenario: #turn-change-is-the-only-reset
- **WHEN** the observed turn number advances
- **THEN** all prior-turn evaluation is discarded wholesale — no world simulated against the previous board ever contributes to the new turn's scores

### Requirement: bot-framework/foreign-snake-treatment
Every snake other than the one being evaluated SHALL be foreign — alive teammates included. The foreign moves explored for a foreign snake SHALL be its interest-map directions narrowed by its commitment: a manual-mode teammate (operator-control/manual-mode) whose effective staged move (operator-control/staged-move-log) is in the evaluated snake's interest map is committed to exactly that move; automatic-mode teammates and opponents are always uncommitted, an automatic teammate's own framework-staged move never being treated as its commitment. A foreign snake with no directions in play SHALL be held frozen in place in every simulated world.

#### Scenario: #teammate-is-not-self
- **WHEN** snake A is evaluated while teammate B is alive
- **THEN** B enters A's evaluation exactly as an opponent would — through nominations and commitment — never as a jointly optimised extension of A

#### Scenario: #automatic-teammate-stays-uncommitted
- **WHEN** the framework has itself staged a move for an automatic-mode teammate
- **THEN** sibling evaluations still explore all of that teammate's nominated directions — the bot's own rolling best-guess never narrows what its siblings prepare for

#### Scenario: #uninteresting-staged-move-freezes
- **WHEN** a manual teammate's staged move is a direction no active Drive of the evaluated snake nominates
- **THEN** that teammate has no directions in play for this evaluation and is frozen in place — a staged move outside the interest map adds no explored alternative

### Requirement: bot-framework/frozen-snake-timestamps
Every simulated board the framework produces SHALL carry a per-snake turn timestamp: snakes whose moves the simulation advanced carry the simulated turn; frozen snakes carry the prior turn. Board analysis over simulated boards — whether the framework's own or written by heuristic authors — SHALL compensate for the frozen-in-place fiction by granting each snake a temporal head start proportional to its staleness.

#### Scenario: #staleness-is-readable
- **WHEN** any consumer receives a simulated board
- **THEN** it can distinguish freshly advanced snakes from frozen ones purely from the timestamps — never by inferring from positions

#### Scenario: #head-start-compensation
- **WHEN** territory-style analysis (for example a multi-source breadth-first search) runs over a simulated board
- **THEN** each frozen snake's starting distance is advanced by its staleness — the simulated turn minus its timestamp — so a frozen snake competes as if it had moved, instead of being penalised for the simulation's own fiction

### Requirement: bot-framework/worst-case-statemap
For every owned snake the framework SHALL maintain a **stateMap** — a mapping from candidate direction to a worst-case weighted score — updated continuously through the turn as the reactive inputs change. Simulation SHALL look exactly one turn ahead: each scored world is the engine's resolution of the immediately next turn (game-engine/turn-resolution-model) for one candidate self-move combined with one assignment of foreign moves. A direction's entry SHALL be the minimum weighted score over its currently active worlds, SHALL remain undefined until at least one active world has been evaluated for it, and higher entries SHALL be better.

#### Scenario: #one-turn-horizon
- **WHEN** any world is scored
- **THEN** it is the resolution of the immediately next turn — no deeper tree is built, simulated, or scored

#### Scenario: #undefined-is-not-zero
- **WHEN** a direction has no evaluated active world yet
- **THEN** its entry is undefined — never zero, never a guess — and consumers treat it as absent rather than as a legitimately terrible score

#### Scenario: #worst-case-tracks-activation
- **WHEN** an input change deactivates the world that was a direction's minimum
- **THEN** the entry becomes the minimum over the worlds now active — possibly improving — because the worst case is always relative to what is currently in play

### Requirement: bot-framework/score-composition
The weighted score of a simulated world SHALL be the sum, over the snake's portfolio, of each heuristic's weight times its value in that world — a Drive contributing its motivation, or its terminal reward where satisfied (bot-framework/drive-satisfaction); a Preference contributing its value. Whenever rescoring changes any of a snake's stateMap entries, that snake's **dirty flag** SHALL be set — the framework's signal that the snake's decision state has news.

#### Scenario: #zero-weight-silences
- **WHEN** a heuristic's portfolio weight is zero
- **THEN** it contributes nothing to any world's score — weights enter linearly, so silencing a heuristic is exactly weight zero, with no residual influence

#### Scenario: #unchanged-scores-set-no-flag
- **WHEN** a rescoring pass leaves every stateMap entry equal
- **THEN** the dirty flag is untouched — consumers of the flag see news only when there is news

### Requirement: bot-framework/softmax-decision
When the framework decides a move for an automatic-mode snake it SHALL sample from the softmax distribution over the snake's currently defined stateMap entries — each direction's probability proportional to exp(entry ÷ effective temperature) — so that higher entries are favoured. Undefined entries SHALL be excluded, and sampling over a partial stateMap is legitimate. If no entry is defined at decision time the framework SHALL stage the snake's `lastDirection`, or stage nothing when none exists yet, leaving the engine's fallback to resolve the move (game-engine/movement).

#### Scenario: #partial-statemap-is-decidable
- **WHEN** decision time arrives with only some directions evaluated
- **THEN** sampling runs over exactly the defined entries — an anytime decision from partial knowledge beats no decision, and undefined directions are simply not options

#### Scenario: #zero-knowledge-fallback
- **WHEN** no direction has a defined entry at decision time
- **THEN** the snake's `lastDirection` is staged; on the first turn, with no `lastDirection`, nothing is staged and the engine's random fallback decides at resolution (game-engine/movement)

### Requirement: bot-framework/attention-tiers
The framework SHALL order its evaluation attention by operator relevance: automatic-mode snakes are served continuously and first; manual-mode snakes currently selected by an operator (operator-control/exclusive-selection) next; unselected manual-mode snakes last — and within a tier no owned snake SHALL be starved indefinitely. An operator selecting a manual-mode snake SHALL promote it to the selected tier immediately, and deselection SHALL demote it.

#### Scenario: #manual-snakes-still-served
- **WHEN** a snake sits in manual mode unselected for many turns
- **THEN** it still receives evaluation after higher tiers are served — its stateMap is stale-tolerant, not abandoned

#### Scenario: #selection-shifts-attention-immediately
- **WHEN** an operator selects a manual-mode snake
- **THEN** its evaluation priority rises at once — ahead of every unselected manual snake — without waiting for a turn boundary or a scheduling epoch

### Requirement: bot-framework/selection-promotion
On selection promotion of a manual-mode snake the framework SHALL re-evaluate which of its evaluated worlds are active against the current reactive inputs — applying any interest-map or commitment drift that accrued while it was unselected — rescore its stateMap, and prioritise its outstanding evaluation. Promotion SHALL affect attention and decision state only: it never stages a move for the snake, staging for a manual-mode snake being solely the operator's act (operator-control/manual-mode), and an operator-staged move present at promotion SHALL survive untouched (operator-control/selection-is-view-only).

#### Scenario: #drift-reconciled-on-promotion
- **WHEN** an operator selects a manual snake whose foreign commitments and interest map drifted while it was unselected
- **THEN** the drift is applied, the stateMap rescored, and fresh decision state produced at high priority — the operator sees current analysis, not stale leftovers from the unselected tier

#### Scenario: #promotion-never-stages
- **WHEN** promotion completes a full recompute for the snake
- **THEN** no move is staged — the recomputed stateMap informs the operator and nothing else

#### Scenario: #staged-move-survives-promotion
- **WHEN** a manual snake already has an operator-staged move at the moment of selection
- **THEN** that move remains the snake's effective staged move throughout promotion and rescoring — promotion changes what is displayed and computed, never what is staged
