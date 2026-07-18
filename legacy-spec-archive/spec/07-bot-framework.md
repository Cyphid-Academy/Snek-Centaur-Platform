# Module 07: Bot Framework

## Requirements

### 7.1 Scope and Runtime Placement

**07-REQ-001**: The bot framework shall be a library consumed by the Snek Centaur Server runtime ([02-REQ-004]). It shall execute within the Snek Centaur Server process and share that process's access to its hosted Centaur Teams' Centaur state ([06]) and to each team's game's SpacetimeDB instance ([02-REQ-023]).

**07-REQ-002**: The bot framework shall operate at single-ply (depth-1) lookahead for the MVP: for each candidate self-move, it simulates exactly the next turn's resolution and scores the resulting board. Multi-ply tree search is out of scope for this module.

**07-REQ-003**: The bot framework shall produce, for every snake owned by its team in the current game, a **stateMap** — a function from candidate direction to a worst-case weighted score — updated continuously during the turn in response to changes in its reactive inputs (07-REQ-020).

**07-REQ-004**: The bot framework shall be the sole writer of the per-snake computed display state defined in [06-REQ-026], for the snakes owned by a hosted Centaur Team. This discharges [06-REQ-027] from the bot-framework side.

**07-REQ-005** *(negative)*: The bot framework shall not write authoritative game state to SpacetimeDB. Its only write channel into SpacetimeDB is the staged-move mechanism ([02-REQ-011]), for automatic-mode snakes per 07-REQ-046.

---

### 7.2 Heuristic Type Vocabulary

**07-REQ-006**: The bot framework shall define two heuristic abstractions that Drive/Preference authors program against:
- **Drive\<T\>**: a parameterised, directed motivation toward or away from a future event. The type parameter `T` is constrained to one of two **target types**: a snake (identified per [01-REQ-004]) or a cell (a board position).
- **Preference**: a time-invariant scalar function over a board state.

**07-REQ-007**: A Drive\<T\> shall comprise the following operations, each of which an author must supply:
- A **reward** operation that yields a scalar in [−1, 1] for a given self, target, and board state.
- A **distance** operation that yields a non-negative scalar for a given self, target, and board state.
- A **motivation** operation that combines reward and distance into a scalar in [−1, 1].
- A **satisfaction predicate** that, for a given self, target, and board state, indicates whether the Drive has been achieved in that world.
- A **target-eligibility predicate** that, for a given candidate target, self, and board state, indicates whether the candidate is a valid target.
- A **self-direction nomination** operation that yields the set of self-move directions the Drive considers relevant given its current target and board.
- A **foreign-move nomination** operation that yields, for each foreign snake the Drive cares about, a set of directions that snake might take which the Drive cares about.

**07-REQ-008**: A Preference shall be a function from a self snake and a board state to a scalar in [−1, 1]. Preferences shall have no notion of target and no distance or satisfaction concept.

**07-REQ-009**: All heuristic scalar outputs — Drive reward, Drive motivation, Drive terminal reward on satisfaction, and Preference value — shall lie in [−1, 1]. Calibration of relative importance shall be expressed exclusively through portfolio weights ([06-REQ-013], 07-REQ-014), never by scaling heuristic outputs outside this range.

**07-REQ-009a**: The framework shall **strictly enforce** the range invariants on every author-supplied scalar output before that value is consumed by any downstream framework computation (caching, scoring aggregation, softmax, display state). Heuristic implementations are expected to be authored by inexperienced developers (often with AI assistance) and cannot be relied on to honour the invariants voluntarily; the framework treats an out-of-range or non-finite output as a heuristic bug to be defended against, not as a rare exception. Specifically, on every invocation of any author-supplied scoring function the framework shall:

1. Validate that the returned value is a finite `number` (not `NaN`, not `±Infinity`, not `undefined`, not a non-number type).
2. Validate the declared range for the function: `[−1, 1]` for `reward`, `motivation`, satisfaction terminal reward, and Preference `evaluate`; `≥ 0` and finite for Drive `distance`; strictly boolean for `satisfaction`.
3. **Substitute a safe value** when validation fails — clamp out-of-range numeric outputs to the nearest in-range bound; substitute `0` for non-finite or non-number outputs in `[−1, 1]`-bounded functions; substitute `0` for non-finite/negative `distance`; coerce non-boolean `satisfaction` to `false`. The substituted value is what the rest of the framework consumes — no NaN, ±Infinity, or out-of-range value is ever propagated into caches, scores, softmax, or `snake_bot_state`.
4. **Log a structured error to the Snek Centaur Server's process log** (see 07-REQ-009b) the first time each `(snakeId, heuristicId, violationKind)` triple violates within a turn, so authors can see and fix the bug.

**07-REQ-009b**: The framework shall surface contract violations by **logging a structured error message to the Snek Centaur Server's process log** (e.g., the framework's standard logger writing to stderr) at error level on each violation. Each log entry shall carry at minimum: `gameId`, `snakeId`, `heuristicId`, `violationKind` (`out_of_range` | `non_finite` | `wrong_type`), the offending raw value (rendered as a string for non-finite/non-number cases), the substituted value used by the framework, the function name (`reward` | `distance` | `motivation` | `satisfaction` | `evaluate`), and the current turn number. Logging is deduplicated per-turn per `(snakeId, heuristicId, violationKind)` so a single runaway heuristic emits at most one log line per turn per kind; the dedup state resets when the turn changes (consistent with the per-turn cache lifecycle of 07-REQ-026/027). Violations are **not** persisted to Convex and are **not** surfaced in the operator UI in the MVP — the server log is the sole surface. See resolved 07-REVIEW-014.

**07-REQ-010**: When a Drive's satisfaction predicate evaluates to true in a simulated board state, the Drive's contribution to that world's score shall be the Drive's reward operation applied in that world (the **terminal reward**), bypassing distance dampening and the motivation operation. A Drive whose satisfaction predicate evaluated to true in a given turn's observed state shall be removed from the snake's active portfolio at the turn's close.

**07-REQ-011**: The framework shall distinguish **Goal** and **Fear** variants of a Drive only as author-level semantics: a Goal is a Drive whose reward operation returns positive values in typical configurations; a Fear is a Drive whose reward operation returns negative values. The framework shall treat Goals and Fears identically at runtime. (Restates §6.1 for clarity.)

**07-REQ-012** *(negative)*: The framework shall not assume any algebraic property of author-supplied operations (e.g., monotonicity of motivation in distance, symmetry of distance) beyond the range constraints in 07-REQ-009. Authors are responsible for constructing operations that yield useful behaviour under the framework's scoring rules (§7.8).

---

### 7.3 Portfolio Model and Runtime Portfolio Evolution

**07-REQ-013**: Each snake owned by the team shall have, at every moment within a game, a **portfolio** comprising: a set of active Preferences (each with a current portfolio weight), a set of active Drives (each with a specific target, a target type, and a current portfolio weight), and an effective softmax temperature derived per 07-REQ-056.

**07-REQ-014**: At the start of a game, each of the team's snakes' portfolios shall be initialised from the team's heuristic default configuration ([06-REQ-005]) as captured at game start per [06-REQ-014]: every Preference marked active-by-default is present at its default weight; no Drives are active; no per-snake overrides are present. (Discharges 07's share of [06-REQ-014].)

**07-REQ-015**: The framework shall respond to operator-initiated mutations of a snake's portfolio ([06-REQ-015]) — Drive add, Drive remove, Drive retarget, Preference weight change, Drive weight change, Preference activation toggle, temperature override set/clear — by recomputing the affected snake's stateMap in accordance with the reactive input rules in §7.5 and the scoring rules in §7.8. Such mutations shall never require restarting or clearing the game tree cache (07-REQ-022).

**07-REQ-016**: The **effective heuristic configuration** for a given snake at a given moment is the team default ([06-REQ-005]–[06-REQ-007]) overlaid by that snake's portfolio state ([06-REQ-013]). The framework shall read this effective configuration from the Centaur state subsystem per [06-REQ-017] without further negotiation with any other runtime.

**07-REQ-017**: A Drive's **target** shall be a concrete reference — a specific snake identity or a specific cell coordinate — at every moment the Drive is active on a snake. The framework shall not maintain Drives whose target is unresolved.

**07-REQ-018** *(negative)*: The framework shall not modify the team's heuristic default configuration on its own initiative. All writes to [06]'s team-scoped state are operator-initiated via the Snek Centaur Server frontend ([08]).

---

### 7.4 Candidate Direction Enumeration

**07-REQ-019**: For each owned snake the framework shall enumerate **candidate self-directions** as a subset of {Up, Right, Down, Left} ([01-REQ-001]). Directions that are immediately lethal (wall collision per [01-REQ-044a] or self-collision per [01-REQ-044b] on the observed pre-turn board) may be deprioritised, but shall be retained as last-resort candidates such that at least one candidate direction is always produced for an alive snake. (Supports 07-REQ-003's total-function guarantee on the stateMap.)

---

### 7.5 Reactive Inputs

**07-REQ-020**: For each owned snake, the framework shall treat exactly three reactive inputs as determining the active content of that snake's game tree cache and stateMap:
- **Interest map**: the union, over the snake's active Drives, of each Drive's foreign-move nominations (07-REQ-007). For each foreign snake Y this yields the set of Y-directions at least one of the self snake's Drives cares about. If Y has no nominations from any active Drive, Y is absent from the snake's lattice entirely, regardless of Y's commitment state.
- **Commitment state**: for each foreign snake Y, either a specific committed direction or null, determined per 07-REQ-034's snake-category rules. When null, all of Y's nominated directions are in play.
- **Portfolio weights**: the scalar weights applied to normalised cached outputs during scoring (§7.8).

**07-REQ-021**: A cached branch in which foreign snake Y moves direction D shall be **active** if and only if D is in the snake's interest map for Y **and** Y's commitment is either null or equal to D. All other cached branches shall be **dormant**. Changes to the interest map or to a foreign snake's commitment shall toggle branches between active and dormant without re-simulation.

**07-REQ-022**: Portfolio weight changes ([06-REQ-015]) shall affect scoring (§7.8) but shall not change which branches are active or dormant, shall not invalidate any cached simulation, and shall not trigger new simulations. They shall trigger a rescan and possible dirty-marking of the stateMap per 07-REQ-036.

**07-REQ-023**: The game tree cache for an owned snake shall be cleared when the turn number observed in the framework's SpacetimeDB subscription changes, and rebuilt from scratch under the rules of this section. A SpacetimeDB reconnection that resurfaces the current turn number shall not trigger a clear. Within a turn, the cache shall be append-only: simulations once stored are never evicted, only toggled active/dormant.

---

### 7.6 World Simulation and Game Tree Cache

**07-REQ-024**: For each candidate self-direction of each owned snake the framework shall maintain an append-only **game tree cache**: a set of simulated next-turn worlds, each produced by combining the candidate self-move with some assignment of directions to foreign snakes. The framework shall use the shared engine's turn-resolution logic ([01-REQ-041] through [01-REQ-052], as implemented by [02]'s shared engine codebase) to perform the simulation.

**07-REQ-025**: Each cached world shall store, in addition to the simulated board state, **normalised heuristic outputs** for that world: each Drive's reward/motivation/terminal-reward value and each Preference's value, computed against the simulated world and stored independently of portfolio weights.

**07-REQ-026**: Portfolio weights shall not be folded into cached normalised outputs. They shall be applied as a final scalar multiplication during scoring (§7.8). This separation is load-bearing for 07-REQ-022.

**07-REQ-027**: The lattice of foreign-move combinations for an owned snake's candidate self-direction shall be structured as follows:
- Each **dimension** of the lattice corresponds to one foreign snake that is present in the snake's interest map (07-REQ-020) and has at least one active direction.
- Each **rank** along a dimension is a position in that foreign snake's active directions ordered by descending per-(snake, direction) priority weight (07-REQ-028).
- A **point** in the lattice is a tuple that selects one active direction per dimension, and corresponds to exactly one simulated world per candidate self-direction of the owned snake.
- Foreign snakes that drop out of the interest map (because no Drive nominates any of their moves) contribute no dimension; their positions in the simulated world are held at their current cell. (A restatement of 07-REQ-020's exclusion rule for clarity.)

**07-REQ-028**: For each (foreign snake Y, direction D) pair present in the interest map, the framework shall compute a **priority weight** equal to the sum, over Drives that nominate D for Y, of the product of that Drive's portfolio weight and a rank-decay factor applied to the Drive's rank within the configured Drive ordering ([06-REQ-007] — pinned-heuristics-then-lexicographic scheme). Priority weights shall be reactively recomputed on any change that would affect them — Drive addition, Drive removal, Drive weight change, portfolio reordering. The concrete rank-decay formula is a design-phase decision subject to 07-REVIEW-004. See resolved 08-REVIEW-005.

**07-REQ-029**: The framework shall traverse uncomputed but active lattice points in descending combined priority, where a point's combined priority is the product of the per-(foreign snake, direction) priority weights at the point's chosen ranks. Traversal shall be anytime: partial progress is usable immediately and continues until the cache is full for the snake or the compute budget is exhausted ([07]'s compute scheduling in §7.9).

**07-REQ-030**: The traversal shall begin from the lattice point in which every foreign snake is at its highest-priority active direction (rank 0 in every dimension). Each point visited shall make its axis-neighbours (obtained by incrementing a single dimension's rank by 1, provided the new rank remains within that dimension's active-direction count) candidates for subsequent visiting. This produces a Dijkstra-like traversal that visits points in descending combined priority without re-visiting.

**07-REQ-031** *(negative)*: Already-computed cached worlds shall not be re-simulated in response to priority weight changes. A priority weight change only affects the *order* in which still-uncomputed active points are visited next.

**07-REQ-032**: Foreign snake position when a dimension is not present in the lattice: for any alive foreign snake that does not contribute a dimension (because the owned snake has no Drive nominating any of that foreign snake's moves), the simulated world shall place that foreign snake as frozen in place for the turn, but the simulated partial board state shall additionally carry a **per-snake turn timestamp** (07-REQ-065) so that downstream board-analysis algorithms can compensate for the frozen-in-place fiction by giving frozen snakes a temporal head start proportional to their staleness (07-REQ-066). See resolved 07-REVIEW-014.

---

### 7.7 Teammate and Opponent Foreign Snakes

**07-REQ-033**: "Foreign snake", as used in §7.5 and §7.6, means any snake other than the owned snake being scored — including alive teammates. The bot framework shall treat teammate snakes as foreign for the purpose of the lattice and commitment state.

**07-REQ-034**: Commitment state semantics vary by snake category:
- **Teammate snake in manual mode**: its staged move (if any) is treated as a committed direction for simulation purposes, but **only when that staged direction intersects with the evaluating snake's interest map** (07-REQ-020). If the staged direction does not intersect the interest map, the manual teammate has no active directions in the lattice and contributes no dimension — it is held in place per 07-REQ-032, consistent with the standard lattice-membership rules of 07-REQ-020 and 07-REQ-021. The framework reads teammate staged moves from its SpacetimeDB subscription ([02-REQ-023]), where operator browsers stage moves directly via their game-participant access token ([03]'s operator identity).
- **Teammate snake in automatic mode**: its staged moves are **ignored entirely** by simulation in the MVP. Its commitment state is null (same as opponents), meaning all its nominated directions are active dimensions in the lattice. The fact that the bot framework may have staged a move for that automatic teammate via the submission pipeline (07-REQ-044) does NOT collapse it to a committed direction for other snakes' simulations.
- **Opponent snake**: commitment state is always null, because no mechanism exists for the framework to observe another team's staging. All nominated directions for the opponent are active dimensions in the lattice.

*Rationale*: Automatic-mode teammates are treated as uncommitted because their staged move is a bot-internal rolling best-guess that changes frequently and should not be used as a constraint by sibling evaluations. Only explicit human staging (manual mode) represents deliberate intent worth treating as committed.

---

### 7.8 Scoring

**07-REQ-035**: For each candidate self-direction of each owned snake, the **stateMap entry** at any moment shall be the **worst-case weighted score** over all cached worlds whose branch is currently active (per 07-REQ-021) for that self-direction. If no active worlds exist for a self-direction, the stateMap entry shall be undefined until at least one active world is cached for it.

**07-REQ-036**: The weighted score of a cached world shall be the sum of each Drive's contribution and each Preference's contribution, where:
- A Drive contributes `portfolioWeight × cachedMotivation` in that world, or, if the Drive's satisfaction predicate was true in that world, `portfolioWeight × cachedTerminalReward`.
- A Preference contributes `portfolioWeight × cachedPreferenceValue` in that world.

The stateMap's worst-case aggregation is the minimum weighted score across active cached worlds. On any rescoring that changes a stateMap entry's value, the snake's stateMap dirty flag shall be set.

**07-REQ-037**: The scoring operation on its own shall not invoke any world simulation. It shall read normalised outputs from the cache, multiply by current portfolio weights, sum, and take a min. This is the cheap-rescan property that makes weight editing live-editable.

**07-REQ-038**: Conservative minimax: the framework shall treat higher stateMap entries as better. At decision time (§7.9), softmax sampling shall favour candidate self-directions whose stateMap entry is higher.

**07-REQ-039**: Per-snake computed display state (as defined in [06-REQ-026]) shall be written by the framework as a **full snapshot** ([06-REQ-028]) whenever the snake's stateMap dirty flag is set. The snapshot shall comprise: the current stateMap, the worst-case simulated world for each candidate direction (the specific cached world selected by the minimum, including its per-snake turn timestamp per 07-REQ-065), and the per-heuristic normalised outputs from those worst-case worlds broken out per heuristic for decision-table rendering. The write shall use the Centaur state function contract surface ([06-REQ-030]). See resolved 07-REVIEW-014.

---

### 7.9 Compute Scheduling and Anytime Submission

**07-REQ-040**: Compute shall be distributed across owned snakes in three priority tiers, in descending order:
1. **Automatic-mode snakes** — any owned snake whose operator mode ([06-REQ-018]) is not manual. These receive continuous scheduled compute.
2. **Currently-selected manual-mode snakes** — snakes in manual mode that are currently selected by some user identity ([06-REQ-018]). These receive compute promoted to high priority on selection (§7.10).
3. **Unselected manual-mode snakes** — snakes in manual mode that no user is currently selecting. These receive compute only after tiers 1 and 2 have been served.

Within each tier, compute shall be allocated round-robin across snakes.

**07-REQ-041**: Within each snake, compute shall be allocated round-robin across candidate self-directions — that is, every snake and every candidate direction shall receive its highest-priority foreign world cached before any receives its second. This is the "breadth-first on rank 0" property of the Dijkstra traversal in 07-REQ-029.

**07-REQ-042**: On any change to a reactive input for an owned snake ([07-REQ-020]), the framework shall rescore the affected stateMap entries from the existing game tree cache without simulating new worlds. Any resulting change to a stateMap entry sets the dirty flag (07-REQ-036).

**07-REQ-043**: Any change to a reactive input that causes a previously dormant active-but-uncomputed lattice point to become active shall enqueue that point for simulation in the snake's current compute tier. Reversion to a prior commitment (for which the relevant branches were already computed) shall not enqueue any work; those branches reactivate without simulation.

**07-REQ-044**: The framework shall run a **scheduled submission pass** on a fixed interval during the turn. The interval shall be the team's `defaultScheduledSubmissionIntervalMs` per [06-REQ-011] (mirrored at game start into the game-scoped `game_centaur_state.scheduledSubmissionIntervalMs` per [06-REQ-040a]); informal spec §6.8's 100 ms is the default value of that team-tunable parameter. See resolved 07-REVIEW-012. On each pass, for each automatic-mode snake whose stateMap dirty flag is set, the framework shall:
- Sample a direction from the current stateMap via the softmax decision rule (§7.10).
- Stage that direction in SpacetimeDB via [02-REQ-011]'s staged-move mechanism.
- Clear the snake's dirty flag.

**07-REQ-045**: The framework shall execute a **final submission** pass when the dynamically computed turn deadline is imminent, flushing all automatic-mode snakes whose dirty flag is still set. The turn deadline shall be calculated dynamically each turn as: `min(automaticTimeAllocationMs, remainingTimeBudget) − imminentThresholdMs` where `automaticTimeAllocationMs` and `imminentThresholdMs` are the game-scoped centaur parameters from [06-REQ-040a] (always shorter than the max turn duration from the engine), and `remainingTimeBudget` is the team's current chess clock budget observable from SpacetimeDB. The smaller of the first two takes precedence. The scheduled submission pipeline (07-REQ-044) continues to operate normally right up until the turn is declared over. See resolved 08-REVIEW-011, 07-REVIEW-012.

**07-REQ-045a**: When the Captain's manual turn-submit ([08-REQ-065]) fires, the framework shall **not** execute a final flush of dirty automatic-mode snake states. The Captain's manual declaration reflects a deliberate human decision that the current total set of staged moves is acceptable for immediate submission; flushing dirty states would cause new softmax rolls after the human decision with no opportunity for humans to respond, which contradicts the purpose of manual override. Only automatic deadline expiry triggers the final flush described in 07-REQ-045. The all-operators-ready quorum precondition of [08-REQ-062] does not affect this requirement: it is a passive necessary precondition on the framework's automatic submission process, which then proceeds (and decides whether to flush) according to 07-REQ-044 / 07-REQ-045.

**07-REQ-046**: Manual-mode snakes — whether currently selected or not — shall never be staged by the scheduled or final submission passes. Their staged moves shall originate exclusively from operator action routed through [08]'s live operator interface. This discharges 07's share of the manual/auto staging split in [06-REQ-018].

**07-REQ-047**: Each staged move produced by the framework shall be attributable to the bot participant identity (via the per-Centaur-Team game credential issued by the game invitation flow of [05-REQ-032b]), not to any individual human operator, so that turn-event emission ([01-REQ-052]) can distinguish bot-originated moves from operator-originated moves in the `stagedBy` field.

---

### 7.10 Softmax Decision and Temperature

**07-REQ-048**: At decision time the framework shall sample a direction for an automatic-mode snake by applying the softmax distribution to that snake's current stateMap entries. Specifically, each candidate direction's sampling probability shall be proportional to `exp(stateMap[direction] / T)` where `T` is the snake's effective temperature per 07-REQ-056. Sampling shall use a source of randomness scoped to the Snek Centaur Server process; no requirement is placed on which source.

**07-REQ-049**: The softmax distribution shall be evaluated over the current set of candidate directions for the snake (07-REQ-019). Directions for which the stateMap entry is undefined at decision time shall be excluded from the distribution. If no candidate directions have a defined stateMap entry at decision time, the framework shall fall back to staging the snake's `lastDirection` (per [01-REQ-042(b)]) or, on turn 0 with no lastDirection, shall stage nothing — letting [01-REQ-042(c)]'s random-choice fallback handle the move in turn resolution.

**07-REQ-050**: A lower softmax temperature shall bias the decision toward the highest-scoring direction (more deterministic); a higher temperature shall bias toward more uniform sampling (more exploratory). The direction of this effect is part of the contract with operators calibrating temperature in [08].

---

### 7.11 Human-Selection Promotion

**07-REQ-051**: When a user identity transitions into selecting an owned snake ([06-REQ-018]) that is in manual mode, the framework shall promote that snake to the "currently-selected manual-mode" compute tier (tier 2 per 07-REQ-040) effective immediately. Any subsequent deselection of that snake shall demote it back to tier 3.

**07-REQ-052**: On selection promotion, the framework shall:
- Re-evaluate active/dormant status of the snake's cached branches against the current reactive inputs (07-REQ-020). Any commitment or interest-map changes that occurred during the snake's time in tier 3 shall cause branches to toggle and uncomputed-but-now-active branches to be enqueued for high-priority simulation.
- Rescore the stateMap from active cached branches (07-REQ-042). If the stateMap changes, the dirty flag is set and the computed display state snapshot is written per 07-REQ-039.

**07-REQ-053** *(negative)*: Selection promotion of a manual-mode snake shall not cause the framework to stage a move for that snake. Even after a full high-priority recompute, the stateMap is displayed but not acted upon. Staging remains the operator's responsibility (07-REQ-046).

**07-REQ-054**: If a manual-mode snake already has an operator-staged move at the moment of selection promotion, the staged move shall remain staged. Promotion affects display and compute scheduling only, not the staged move.

---

### 7.12 Temperature Sources

**07-REQ-055**: The framework shall read softmax temperature from two sources:
- **Team-wide default**: the softmax global temperature in the team's bot parameter record ([06-REQ-011]).
- **Per-snake override**: the optional per-snake temperature override in that snake's portfolio state ([06-REQ-013]).

**07-REQ-056**: A snake's **effective temperature** at a given moment shall be its per-snake temperature override if one is set, otherwise the team-wide default. Effective temperature shall be read reactively: changes to either source shall take effect on the next softmax decision without requiring cache invalidation or restart.

---

### 7.13 Boundary with Centaur State and SpacetimeDB

**07-REQ-057**: All persistent state the framework reads or writes — heuristic defaults, bot parameters, per-snake portfolio state, selection state, computed display state, and the action log — shall live in the Centaur state subsystem ([06]). The framework shall hold no persistent state of its own across game lifetimes. (Its game tree cache, stateMaps, and dirty flags are in-memory per-game scratch state.)

**07-REQ-058**: The framework shall subscribe to its team's game-scoped Centaur state for real-time change notifications per [06-REQ-043], so that operator edits to any snake's portfolio, selection, or temperature override propagate into the framework's reactive inputs without polling.

**07-REQ-059** *(negative)*: The framework shall not call Centaur state mutations on behalf of operators. Operator-initiated mutations ([06-REQ-015], [06-REQ-018]) are routed directly from [08] to [06]'s function contract surface per [06-REQ-044]; the framework observes their effects through its subscription and reacts accordingly.

**07-REQ-060**: The framework shall read board state, staged-move state, turn number, and chess timer state from its subscription to the game's SpacetimeDB instance per [02-REQ-023]. It shall not cache SpacetimeDB state in Convex.

**07-REQ-061** *(negative)*: The framework shall not attempt to read, subscribe to, or otherwise access the SpacetimeDB state of games belonging to other teams, nor any portion of the current game's SpacetimeDB state masked by the RLS rules in [04] for its own team's view.

---

### 7.14 Per-Snake Turn Timestamp on Simulated Board State

**07-REQ-065**: Each simulated partial board state produced by the framework shall carry a **per-snake turn timestamp** field, `perSnakeTurnTimestamp: Record<SnakeId, number>`, recording for every snake present in the simulated `GameState` the turn number at which that snake's position was last freshly advanced. Snakes whose explicit moves are simulated (the self snake and every foreign snake present in the simulation's `foreignTuple` as an active lattice dimension) carry the simulated turn (`currentTurn + 1`). Frozen snakes (alive foreign snakes absent from the lattice, held in place per 07-REQ-032) carry the prior turn (`currentTurn`) — one turn behind the lattice snakes — reflecting that their positions are stale by exactly one turn relative to the simulated frame. See resolved 07-REVIEW-014.

**07-REQ-066**: Board-analysis algorithms operating on simulated partial board states — whether shipped by the framework, supplied by `@team-snek/heuristics`, or implemented by heuristic authors inside their own Drive/Preference code — shall use the per-snake turn timestamp (07-REQ-065) to compensate for the frozen-in-place fiction by giving each snake a temporal head start proportional to its staleness. The canonical pattern, applicable to graph algorithms such as multi-headed BFS for Voronoi territory inference, is to seed each snake-head's starting graph distance with `(simulatedTurn − perSnakeTurnTimestamp[snakeId])` extra steps so that frozen snakes effectively start one BFS step ahead — compensating for the fact that they "should" have moved this turn but the simulation kept them frozen. The framework neither ships nor mandates any specific board-analysis algorithm in the MVP; 07-REQ-066 is a normative obligation on whichever consumer chooses to perform such analysis. See resolved 07-REVIEW-014.

---

### 7.15 Action Log Obligations

**07-REQ-062**: Every move the framework stages per 07-REQ-044 and 07-REQ-045 is recorded in the SpacetimeDB append-only staged-moves log ([04-REQ-025], [04-REQ-027]) as a side effect of the `stage_move` reducer call. The framework shall not write move-staging entries to the Centaur action log in Convex; move staging events are excluded from the Centaur action log per [06-REQ-036] and resolved 06-REVIEW-004. The staged-move log entry in SpacetimeDB inherently records the actor identity (the bot participant identity via the per-Centaur-Team game credential per [05-REQ-032b]) and is attributable as bot-originated per 07-REQ-047.

**07-REQ-063**: Every computed display state snapshot the framework writes per 07-REQ-039 shall correspond to an action log entry of category "computed display state snapshot" per [06-REQ-036] and [06-REQ-037].

**07-REQ-064** *(negative)*: The framework shall not write action log entries for operator-originated events (selection, manual-mode toggles, operator-initiated Drive edits, etc.). Those entries are written by the originating operator per [06-REQ-037]'s non-reserved categories (see resolved 06-REVIEW-003).

---

## Design

### 2.1 Runtime Architecture: Coordinating Worker per CentaurTeam

Satisfies 07-REQ-001, 07-REQ-005, 07-REQ-040, 07-REQ-041, 07-REQ-057, 07-REQ-058, 07-REQ-060, 07-REQ-061.

The bot framework runs inside the Snek Centaur Server process ([02-REQ-004]) as a library that the server boots once per active game per hosted CentaurTeam. The architecture is **one coordinating worker per CentaurTeam game session, plus a process-wide pool of simulation workers**:

- **Coordinator (one per `(centaurTeamId, gameId)` pair)**: a single-threaded Node.js Worker thread that owns all reactive state for the team's game — the game tree caches, stateMaps, dirty flags, portfolio mirrors, lattice traversal queues, the per-snake compute scheduling round-robin, and the SpacetimeDB and Convex subscriptions for that game. The coordinator never blocks on simulation; it only orchestrates.
- **Simulation worker pool (process-wide, sized to CPU cores − 1)**: stateless Node.js Worker threads that receive `SimulateRequest` messages (a candidate self-direction + a foreign-move tuple + the current pre-turn `GameState`) and return `SimulateResponse` messages (the resulting `GameState` and the per-heuristic normalised outputs computed against it via the team's registered heuristic implementations). Workers import the shared engine ([02]'s shared codebase) and the team's heuristic registry (§2.3) at boot time. **Worker message protocol** (see resolved 07-REVIEW-011): both `SimulateRequest` and `SimulateResponse` are exchanged as native JavaScript objects via `Worker.postMessage` using the structured-clone algorithm. Structured-clone handles the deeply nested `GameState` (`ReadonlyArray` and `Map` sub-structures) without an author-supplied serialiser, eliminating a class of schema-drift bugs between request shape and worker decoder.
- **Process-level simulation dispatcher (one per process, distinct from the per-team coordinators)**: a thin scheduler component in the framework process that owns the pool's idle-worker registry and a single fair queue of `SimulateRequest`s drawn from all coordinators. Each coordinator submits its own team's requests (with the per-team three-tier priority tag from §2.12) into this dispatcher; the dispatcher round-robins across coordinators when picking the next request to assign to an idle worker so that one team's heavy turn cannot starve another team's compute. The dispatcher carries no per-team game state — it knows only `(coordinatorId, priorityTag, payload)`. Cross-team isolation is preserved at two levels: (a) each coordinator only ever submits and receives requests for its own team, so its in-memory state is never touched by another team's coordinator; (b) the dispatcher's payload is the team-specific snapshot the worker operates on, so a worker handling team A's request never observes team B's state. No coordinator reads, subscribes to, or otherwise touches another CentaurTeam's Convex documents or SpacetimeDB instance (07-REQ-061). **Back-pressure** (see resolved 07-REVIEW-011): each coordinator maintains a **per-(snake, candidate-direction) bounded queue** of pending `SimulateRequest`s before submission to the dispatcher. The bound is small (implementation-tunable, expected to be a single-digit value); when the queue is full and the lattice traversal (§2.9) attempts to enqueue another request, the **oldest** request is dropped to make room. Drop-oldest matches the framework's anytime principle: newer simulations reflect more recent reactive inputs (§2.7) and are more relevant than older ones whose commitments or interest map may have changed in between.

Rationale for one-coordinator-per-team rather than one process-wide coordinator: the reactive inputs (07-REQ-020) are per-team and per-game, the SpacetimeDB subscription is per-game, and the Convex subscription is per-team-per-game. Co-locating that state inside one thread eliminates cross-team locking. The simulation worker pool is shared because simulations are stateless and CPU-bound — pooling amortises thread startup cost and lets a single team's compute-heavy turn use all cores when other teams are idle.

The coordinator subscribes to two reactive sources for its `(centaurTeamId, gameId)`:

- The Centaur state subsystem ([06-REQ-043]) via Convex's reactive query interface, watching the joined `GameCentaurStateView` (heuristic config, overrides, drives, operator state, bot params) and `getEffectiveHeuristicConfig` per snake (§3.4 of [06]).
- The team's game's SpacetimeDB instance ([02-REQ-023]) via the SpacetimeDB SDK, with subscriptions covering: pre-turn board state, staged moves, turn number, and the team's chess clock state.

The coordinator owns and is the **sole writer** of `snake_bot_state` for snakes owned by its team (07-REQ-004), via `updateSnakeBotState` in [06]'s function contract surface using the per-CentaurTeam game credential ([05-REQ-032b]). It writes nothing else to Convex on operator behalf (07-REQ-018, 07-REQ-059, 07-REQ-064). It writes nothing to SpacetimeDB except staged moves via `stage_move` ([04-REQ-024]) for automatic-mode snakes (07-REQ-005, 07-REQ-046).

---

### 2.2 Heuristic Type Vocabulary

Satisfies 07-REQ-006, 07-REQ-007, 07-REQ-008, 07-REQ-009, 07-REQ-010, 07-REQ-011, 07-REQ-012.

Drives and Preferences are TypeScript classes/objects implementing the interfaces in §3.2. The framework treats them as opaque pure functions over a `(self, target, simulatedBoard)` triple, with the framework-supplied normalised-output cache (§2.8) memoising their results per cached world.

Drive operations are split into three categories by purity contract:

1. **Pure scoring functions** (`reward`, `distance`, `motivation`, `satisfaction`): invoked by the simulation worker against a simulated `GameState` to populate the per-world normalised output record. Outputs in [−1, 1] for reward/motivation/terminal-reward, non-negative for distance, boolean for satisfaction. The framework **strictly validates and substitutes** every author-supplied scalar at the simulation-worker boundary before it is written into the cache (07-REQ-009a): each invocation is wrapped by a thin guard that (a) checks the value is a finite `number` of the expected type, (b) clamps numeric outputs to the declared range (`[−1, 1]` for reward/motivation/terminal-reward and Preference value, `≥ 0` and finite for distance) or coerces booleans, (c) substitutes a safe in-range value (clamp endpoint, `0` for non-finite numerics, `false` for non-boolean satisfaction) when the raw value is invalid, and (d) **logs a structured error** to the Snek Centaur Server's process log (07-REQ-009b) the first time each `(snakeId, heuristicId, violationKind)` violates within the current turn. Author exceptions thrown synchronously from a scoring function are caught by the same guard, treated as `wrong_type` violations, logged the same way, and substituted with the safe default for that function — a thrown heuristic must not crash the worker or the coordinator. The framework still makes no assumption about the algebraic *shape* of valid in-range outputs (07-REQ-012 — no monotonicity, symmetry, etc.); the guard rails enforce only the boundary contract, not author intent.
2. **Pure structural predicates** (`targetEligibility`): invoked by [08]'s operator UI (and by the framework on portfolio mutation) to filter the operator's target picker. Pure over `(candidateTarget, self, board)`. The framework caches eligibility results keyed by `(driveId, candidateTargetRef, boardHash)` only opportunistically; recomputation on every poll is acceptable.
3. **Pure structural enumerators** (`selfDirectionNomination`, `foreignMoveNomination`): invoked by the coordinator on every reactive-input change that could alter their output (Drive add/remove/retarget on this snake, Drive add/remove on any of *this snake's nominated foreign targets*, fresh pre-turn board). Outputs are sets of `Direction` values. They feed the interest map (§2.7).

Drive `motivation(reward, distance) => number` is a **pure combiner** taking the two scalars produced by `reward` and `distance` and returning a value in [−1, 1]. The framework computes `reward` and `distance` first against the simulated world, then calls `motivation(reward, distance)`. The framework imposes no canonical formula (e.g., `reward / (1 + distance)`) — authors choose. This separation is design-load-bearing for two reasons: (a) it enables the satisfaction terminal-reward path (07-REQ-010), which bypasses `motivation` and uses `reward` directly; (b) it enables Drive authors to write `motivation` as a simple closed-form combiner rather than re-deriving the world from scratch.

Goal vs Fear (07-REQ-011) is purely an authoring convention; the framework's runtime has no `kind: "goal" | "fear"` enum. Authors signal Fears by returning negative values from `reward` in typical configurations. Conservative-minimax aggregation (§2.11) then naturally penalises directions that incur Fear-magnitude rewards in the worst-case world.

---

### 2.3 Heuristic Registry: Build-Time-Shared TypeScript Module

Satisfies 07-REQ-001, 07-REQ-014, 07-REQ-016, 07-REQ-018; resolves [08]'s 08-REVIEW-021 and 07-REVIEW-015.

The Snek Centaur Server's Drive and Preference implementations and the SvelteKit frontend's heuristic-driven UI affordances (Drive dropdown, target picker, decision-table heuristic columns) must agree on the set of heuristic IDs the server recognises. They share one TypeScript module hosted in a **dedicated workspace package `@team-snek/heuristics`** (see resolved 07-REVIEW-015) imported by both the Snek Centaur Server runtime ([02-REQ-004]) and the [08] SvelteKit frontend. The package depends only on `@team-snek/bot-framework`'s `Drive` / `Preference` / `HeuristicRegistration` types; the framework runtime, the server, and the frontend each depend on `@team-snek/heuristics` rather than on each other for heuristic content. This dependency direction (heuristics ← server, heuristics ← frontend) gives the cleanest monorepo package graph (one rebuild target on heuristic edits) and keeps the frontend's dependency closure free of server-internal modules. See [02] §2.16a for the package-graph cascade.

```typescript
// packages/heuristics/src/registry.ts
import type { Drive, Preference, HeuristicRegistration } from "@team-snek/bot-framework"

export const HEURISTIC_REGISTRY: ReadonlyArray<HeuristicRegistration> = [
  {
    heuristicId: "FoodDrive",
    heuristicType: "drive",
    nickname: "Food",
    defaultWeight: 1.0,
    activeByDefault: null,             // Drives are never active by default
    targetType: "cell",
    implementation: () => new FoodDrive(),
  },
  {
    heuristicId: "AvoidWallsPreference",
    heuristicType: "preference",
    nickname: "Avoid Walls",
    defaultWeight: 0.7,
    activeByDefault: true,
    targetType: null,
    implementation: () => new AvoidWallsPreference(),
  },
  // ... more
]
```

The bot framework's runtime imports `HEURISTIC_REGISTRY` directly. The SvelteKit frontend imports the same module via the monorepo workspace ([02]'s shared codebase). Because both consumers compile against the same source file at build time, drift between "what the server can simulate" and "what the UI can render" is **structurally impossible within one build artifact** — a fresh server deployment ships with a single registry that both runtime and UI agree on.

Build-time-shared import gives **TypeScript end-to-end**: the registry's element type carries the `heuristicId` literal types into the UI's component props, enabling exhaustive case analysis when the UI renders heuristic-specific affordances. It is statically available, so the UI never needs to handle "registry not yet loaded" states. Hot-reloading the registry requires a server rebuild and restart — acceptable because heuristic implementations are framework code, not user data, and the team's deployment cadence already requires a rebuild for any heuristic logic change. See resolved 07-REVIEW-015.

The registry is the source of truth for which heuristic IDs the **running server** recognises. It is layered against the team's persisted `heuristic_config` in Convex ([06] §2.1.1) as follows:

- **Drift direction (a) — registered but unconfigured** (heuristic IDs in `HEURISTIC_REGISTRY` with no matching `heuristic_config` row for the team): handled by the lazy-insert contract in §2.18.
- **Drift direction (b) — configured but unregistered** (heuristic IDs in `heuristic_config` with no matching `HEURISTIC_REGISTRY` entry): retained in the table, ignored by the framework runtime (07-REQ-016 reads only the intersection), surfaced only on [08]'s global centaur params page where the Captain can delete stale entries (see resolved 08-REVIEW-021).
- **Precedence**: `heuristic_config.defaultWeight`, `.activeByDefault`, and `.nickname` override the registry's `defaultWeight`/`activeByDefault`/`nickname` for any heuristic ID present in both — once written, Convex is authoritative for those fields. The registry's `defaultWeight`/`activeByDefault`/`nickname` are seed values used by the lazy-insert (§2.18) when creating a new `heuristic_config` row, and as fallbacks for in-memory portfolio initialisation if the row is somehow absent at simulation time (defence in depth).
- **In-game Drive dropdown source**: the **intersection** `heuristic_config ∩ HEURISTIC_REGISTRY` filtered to `heuristicType = "drive"` and ordered per [06-REQ-007]'s pinned-then-lexicographic scheme. This intersection is computed in the SvelteKit UI by joining the Convex subscription on `heuristic_config` against the build-time-imported registry's IDs. It is not exposed by the framework as a separate Convex query — joining client-side is cheaper than a per-render Convex query and avoids adding a runtime endpoint.

---

### 2.4 Portfolio State and Reactive Subscription

Satisfies 07-REQ-013, 07-REQ-014, 07-REQ-015, 07-REQ-016, 07-REQ-017, 07-REQ-018, 07-REQ-058.

The coordinator holds an in-memory **portfolio mirror** per owned snake derived from the latest Convex reactive snapshot:

```typescript
interface PortfolioMirror {
  readonly snakeId: SnakeId
  readonly preferences: ReadonlyArray<{
    readonly heuristicId: string
    readonly weight: number              // effective: override ?? team default
    readonly active: boolean             // effective: override ?? team default
    readonly impl: Preference            // resolved via HEURISTIC_REGISTRY
  }>
  readonly drives: ReadonlyArray<{
    readonly driveType: string
    readonly target: Target              // discriminated union (SnakeTarget | CellTarget); see §3.2
    readonly weight: number              // portfolioWeight from snake_drives
    readonly impl: Drive<SnakeTarget> | Drive<CellTarget>  // resolved via HEURISTIC_REGISTRY
  }>
  readonly effectiveTemperature: number  // override ?? team default
}
```

The mirror is rebuilt from scratch on every snapshot the coordinator's `GameCentaurStateView` subscription delivers. Because the snapshot is delivered transactionally per Convex's OCC semantics, the mirror is always internally consistent — there is no moment in which weight changes appear without their accompanying activation changes, etc. Portfolio mirror rebuilds are O(per-snake-portfolio-size) and run on the coordinator thread; there is no need to diff against the previous mirror because §2.7's reactive-input recomputation is cheap.

Portfolio initialisation at game start (07-REQ-014) requires no special framework logic: `initializeGameCentaurState` ([06] §2.2.6) seeds `snake_heuristic_overrides` from the team's `heuristic_config` `activeByDefault` Preferences before the coordinator subscribes, so the first snapshot the coordinator sees already reflects the seeded portfolio. The coordinator does not need to re-read `heuristic_config` at game start — the per-snake `EffectiveHeuristicConfig` query ([06] §3.3) folds team defaults into the snake's effective view.

Drives whose `target` cannot be resolved against the current pre-turn board (e.g., a Snake target referring to a snake that died last turn) are omitted from the active portfolio mirror for the next turn (07-REQ-017). The framework does not delete the underlying `snake_drives` row — that is operator-initiated cleanup. The omission causes the Drive to contribute nothing to the next turn's lattice or scoring; if the target later becomes resolvable again (rare but possible for cell targets after board mutations), the Drive re-enters the mirror automatically on the next snapshot.

---

### 2.5 Candidate Direction Enumeration

Satisfies 07-REQ-019.

For each owned snake on each fresh pre-turn board, the coordinator enumerates candidates from `{Up, Right, Down, Left}` as follows:

1. Filter directions that would be immediately lethal on the **observed pre-turn board** (not on a simulated future board): wall collision per [01-REQ-044a] and self-collision per [01-REQ-044b]. Lethal-direction detection runs the shared engine's collision predicates against the pre-turn snake body and the static board geometry.
2. If at least one non-lethal direction remains, the candidate set is the non-lethal subset.
3. If all four directions are lethal, the candidate set is the full `{Up, Right, Down, Left}` set (last-resort fallback ensuring the stateMap is a total function on at least one direction per 07-REQ-003).

Foreign-snake collision and food/potion outcomes are *not* considered in candidate filtering — those depend on the foreign snake's choice and on the simulated world. The candidate filter is the cheapest possible up-front pruning so that the lattice (§2.9) doesn't waste compute on directions that walk into walls.

---

### 2.6 Game Tree Cache Data Structure

Satisfies 07-REQ-021, 07-REQ-022, 07-REQ-023, 07-REQ-024, 07-REQ-025, 07-REQ-026, 07-REQ-031.

Per owned snake, per candidate direction, the coordinator maintains:

```typescript
interface SnakeCacheEntry {
  readonly snakeId: SnakeId
  readonly direction: Direction
  // Map from a foreign-move tuple (canonicalised as a string of (foreignSnakeId,direction)
  // pairs sorted by foreignSnakeId) to the cached simulated world's normalised outputs.
  readonly worlds: Map<ForeignTupleKey, CachedWorld>
}

interface CachedWorld {
  readonly foreignTuple: ReadonlyMap<SnakeId, Direction>
  readonly simulatedState: GameState                // post-turn-resolution
  readonly perDriveOutputs: ReadonlyMap<DriveInstanceKey, {
    readonly reward: number
    readonly distance: number
    readonly motivation: number
    readonly satisfied: boolean
  }>
  readonly perPreferenceOutputs: ReadonlyMap<string, number>
}
```

`DriveInstanceKey` is `(driveType, targetType, targetId)` — the same tuple that uniquely identifies a `snake_drives` row. Multiple Drive instances of the same `driveType` with different targets are distinct cache keys.

Cache append-only-within-a-turn property: once a `CachedWorld` is stored for a given `(snakeId, direction, foreignTuple)`, it is never overwritten or evicted within the turn. Active/dormant toggling (07-REQ-021) is done by querying the snake's interest map and commitment state at scoring time (§2.11) rather than mutating the cache. This keeps re-activation O(1) per cached world, satisfying 07-REQ-021's requirement that branch toggling not require re-simulation.

Cache clearing (07-REQ-023) is keyed on a turn-number transition observed in the SpacetimeDB subscription. The coordinator holds a `lastObservedTurnNumber` field; on each subscription update, if the observed turn number differs, the coordinator wipes all `SnakeCacheEntry` instances and rebuilds from scratch. Reconnect-induced snapshots that resurface the same turn number do nothing.

Portfolio weights are *not* stored in `CachedWorld` (07-REQ-026). Weights are read from the portfolio mirror (§2.4) at scoring time and applied as a final multiplication. This makes weight changes a pure rescore (no simulation), satisfying 07-REQ-022, 07-REQ-031, and 07-REQ-037.

---

### 2.7 Reactive Inputs and Interest Map Recomputation

Satisfies 07-REQ-020, 07-REQ-022, 07-REQ-031, 07-REQ-042, 07-REQ-043.

The coordinator computes three reactive-input artefacts per owned snake on every change:

1. **Interest map**: `Map<SnakeId (foreign), Set<Direction>>` produced by unioning every active Drive's `foreignMoveNomination(self, target, board)` output. Recomputed on: portfolio mirror rebuild (§2.4) that adds/removes/retargets a Drive on this snake, or whenever a fresh pre-turn board arrives (turn transition).
2. **Commitment map**: `Map<SnakeId (foreign), Direction | null>` built from the SpacetimeDB staged-moves subscription according to 07-REQ-034's per-category rules: opponent → null; automatic-mode teammate → null; manual-mode teammate → staged direction iff that direction intersects this snake's interest map for that teammate, else null. Recomputed on: any change to the staged-moves subscription, any change to a teammate's `manualMode` field, or any interest-map recomputation that could change the manual-teammate intersection result.
3. **Weight vector**: a flat array of effective portfolio weights aligned with the portfolio mirror's preference and drive arrays. Recomputed on: portfolio mirror rebuild.

After any of these three recomputes, the coordinator does the following per snake:

- If interest map or commitment map changed: re-evaluate active/dormant status of cached worlds (a cached world is active iff every foreign snake in its `foreignTuple` is in the interest map and the foreign snake's commitment is null or matches the tuple's direction for it). Enqueue uncomputed-but-now-active lattice points for simulation in the snake's current compute tier (07-REQ-043). Rescore the stateMap from active worlds.
- If only the weight vector changed: skip activation re-evaluation. Rescore the stateMap from already-active worlds (07-REQ-022, 07-REQ-042).
- After rescoring: if the stateMap changed for any candidate direction, set the snake's dirty flag (07-REQ-036).

A reverted commitment (a foreign snake's commitment changes from D back to a previously-committed D′) does not enqueue work because the cached worlds for D′ were never evicted — they re-activate immediately (07-REQ-031, 07-REQ-043 second sentence).

---

### 2.8 World Simulation via Shared Engine

Satisfies 07-REQ-024, 07-REQ-025, 07-REQ-032.

A simulation request consists of a pre-turn `GameState`, a `(self snakeId, self direction)` pair, and a `foreignTuple: Map<SnakeId, Direction>`. The simulation worker:

1. Builds a `stagedMoves: Map<SnakeId, StagedMove>` from the inputs:
   - `self snakeId → { direction: self direction, stagedBy: <bot agent>}`.
   - For each `(foreignSnakeId, direction)` in `foreignTuple`: `foreignSnakeId → { direction, stagedBy: <bot agent>}`.
   - For each alive foreign snake **not** in `foreignTuple` (frozen per 07-REQ-032): omit from the staged-moves map. The shared engine's `resolveTurn` ([01] §3.8) treats absence per [01-REQ-042], which uses `lastDirection` or random fallback. **The framework intercepts this**: rather than letting the engine pick a fallback direction for frozen snakes (which would cause the snake to actually move in simulation), the framework uses a `resolveTurnFrozenForeign` wrapper (a thin per-call composition over `resolveTurn`) that injects "stay in place" semantics for frozen snakes by short-circuiting their movement phase. This wrapper is part of the framework's simulation kit, not a modification to the shared engine, preserving [02]'s shared codebase invariants.
2. Calls `resolveTurnFrozenForeign(state, stagedMoves, turnNumber + 1, simulationTurnSeed)` to produce the next-turn `GameState`. The `simulationTurnSeed` is derived deterministically from `(gameSeed, currentTurn, snakeId, direction, foreignTupleKey)` so the same simulation request always yields the same world (useful for debugging; not relied upon for correctness).
3. Runs each Drive in the snake's portfolio against the simulated world: computes `reward`, `distance`, `motivation`, `satisfied`. Runs each Preference: computes its scalar value. Returns the per-heuristic outputs to the coordinator, which stores them in the corresponding `CachedWorld`.

The per-snake turn timestamp on `CachedWorld.simulatedState` (07-REQ-065) is carried as a field on the simulated state itself; it is the data substrate that 07-REQ-066's board-analysis algorithms compensate against. See resolved 07-REVIEW-014.

---

### 2.9 Lattice Construction and Dijkstra Traversal

Satisfies 07-REQ-027, 07-REQ-028, 07-REQ-029, 07-REQ-030, 07-REQ-031.

For an owned snake's candidate self-direction, the lattice is constructed lazily as follows:

- **Dimensions**: enumerated from the snake's interest map. For each foreign snake Y with non-empty interest-map directions, Y contributes one dimension. Dimensions are ordered by foreign snake ID for canonical traversal.
- **Active directions per dimension**: for foreign snake Y with commitment `c_Y`, the active directions are `{c_Y}` if `c_Y ≠ null`, else the full interest-map set for Y.
- **Per-direction priority weight** (07-REQ-028): for each `(Y, D)` in the interest map,
  ```
  priority(Y, D) = Σ over Drives ∇ that nominate D for Y of:
                   driveWeight(∇) × RANK_DECAY ^ rank(∇)
  ```
  where `rank(∇)` is the Drive's position in the snake's pinned-then-lexicographic ordering ([06-REQ-007]) starting at 0 for the highest-ranked Drive. **`RANK_DECAY = 0.9`.** Rank-decay ensures higher-priority Drives dominate the lattice traversal order without entirely silencing lower-priority Drives' nominations. Recomputed on any Drive add/remove/weight-change/retarget for this snake (07-REQ-028 reactivity clause).
- **Active directions per dimension are sorted by descending `priority(Y, D)`**, breaking ties by direction enum order (Up, Right, Down, Left).
- **Combined point priority**: for a lattice point `(rank_Y0, rank_Y1, ..., rank_Yn)`,
  ```
  combined = Π over i of priority(Y_i, sortedActiveDirections(Y_i)[rank_Yi])
  ```
- **Traversal queue** (07-REQ-029, 07-REQ-030): a max-heap keyed on `combined`. Initialised with the all-zeros point (rank 0 in every dimension). On dequeue, the point's `(self direction, foreignTuple)` is dispatched to the simulation worker pool, and the point's axis-neighbours (each obtained by incrementing exactly one dimension's rank by 1, provided the new rank is within that dimension's active-direction count) are enqueued *if not already enqueued or completed*. A `visited` set on the queue prevents duplicate enqueues (07-REQ-030 "without re-visiting").
- **Reactivity to priority changes** (07-REQ-031): a priority weight change recomputes `combined` for *enqueued* points (cheap heap rebuild) but does *not* invalidate already-completed cached worlds. The "still-uncomputed" portion of the lattice re-orders; the "completed" portion is left alone.

The traversal is anytime: the coordinator may interrupt and resume by stashing the queue, and the snake's stateMap is meaningful (worst-case over completed active worlds) at any moment.

---

### 2.10 Foreign Snake Categorization

Satisfies 07-REQ-033, 07-REQ-034.

The coordinator categorises each alive foreign snake on every commitment-map recomputation (§2.7) using the SpacetimeDB subscription:

- Snakes whose `centaurTeamId` matches the team owning the evaluating snake → **teammate**.
- Snakes whose `centaurTeamId` differs → **opponent**.

Then for teammates, the coordinator joins against its Convex subscription on `snake_operator_state` to read `manualMode`. A teammate is **manual-mode** iff `manualMode = true` in the latest snapshot. This join is local (both sources are subscribed reactively in the same coordinator thread) and consistent at the snapshot level — there is no cross-runtime transactionality, but a transient inconsistency only affects which lattice branches are active for one tick of the reactive recompute loop (next snapshot resolves it).

---

### 2.11 Scoring, Worst-Case Aggregation, and Display State Snapshot

Satisfies 07-REQ-035, 07-REQ-036, 07-REQ-037, 07-REQ-038, 07-REQ-039, 07-REQ-063.

For each owned snake on every reactive-input change (§2.7) and every cache append (a simulation worker returns a new `CachedWorld`):

1. For each candidate self-direction, iterate over `worlds` filtered to the active subset:
   ```
   weightedScore(world) =
     Σ over portfolio.preferences (p) of: p.weight × world.perPreferenceOutputs[p.heuristicId]
   + Σ over portfolio.drives (d) of:
       d.weight × (world.perDriveOutputs[d.key].satisfied
                     ? world.perDriveOutputs[d.key].reward         // terminal reward (07-REQ-010)
                     : world.perDriveOutputs[d.key].motivation)
   ```
2. The stateMap entry for that direction is `min` over active worlds' `weightedScore` (07-REQ-035 worst-case). The "worst-case world" for the direction is the specific world that achieved the minimum, with ties broken by foreign-tuple lexicographic order (per 07-REVIEW-013 resolution).
3. If the stateMap entry's value differs from the previous value (numerical comparison; threshold = exact equality), or if the worst-case world changed identity, the snake's dirty flag is set.

On dirty-flag set, a **full snapshot** is written to `snake_bot_state` via [06]'s `updateSnakeBotState` mutation (07-REQ-039, 07-REQ-063):

```typescript
updateSnakeBotState({
  gameId,
  snakeId,
  stateMap: { [direction]: number | undefined },
  worstCaseWorlds: { [direction]: SimulatedWorldSnapshot | undefined },
  heuristicOutputs: { [direction]: { [heuristicId]: number } },  // from worst-case world
})
```

The snapshot write itself does not clear the dirty flag — only successful submission to SpacetimeDB does (§2.13), because the dirty flag's contract (07-REQ-044) is "this snake's softmax should be re-rolled and re-staged on the next submission pass". Display-state snapshot writes are best-effort frequent updates separate from staging discipline.

`SimulatedWorldSnapshot` is the post-turn-resolution `GameState` plus the per-snake turn timestamp field of 07-REQ-065 (07-REQ-039 "the worst-case simulated world"). See resolved 07-REVIEW-014.

---

### 2.12 Compute Scheduling

Satisfies 07-REQ-040, 07-REQ-041, 07-REQ-051, 07-REQ-052, 07-REQ-053, 07-REQ-054.

The coordinator maintains three priority tiers of "wantsCompute" snakes (07-REQ-040):

- **Tier 1 — Automatic-mode snakes**: any owned snake whose `snake_operator_state.manualMode = false`.
- **Tier 2 — Selected manual-mode snakes**: `manualMode = true` and `operatorUserId ≠ null`.
- **Tier 3 — Unselected manual-mode snakes**: `manualMode = true` and `operatorUserId = null`.

A scheduling tick (driven by simulation worker availability) selects the next request to dispatch as follows:

1. Choose the highest non-empty tier.
2. Within that tier, round-robin across snakes (a per-tier cursor).
3. For the chosen snake, round-robin across candidate directions (a per-snake cursor) — 07-REQ-041's "breadth-first on rank 0" property ensures every candidate direction gets its highest-priority foreign world before any gets its second.
4. For the chosen `(snake, direction)`, dequeue the highest-`combined`-priority point from the lattice traversal queue (§2.9). If the queue is empty (lattice exhausted for that direction), advance the per-snake cursor.

Selection promotion (07-REQ-051): on a Convex snapshot showing a manual-mode snake transitioning to `operatorUserId ≠ null`, the coordinator moves the snake from tier 3 to tier 2 effective on the next scheduling tick. On the same transition, the coordinator re-evaluates active/dormant status of the snake's cached branches against the current reactive inputs (§2.7) and rescores the stateMap (07-REQ-052). Selection promotion does not stage a move (07-REQ-053). Existing operator-staged moves on the snake remain staged (07-REQ-054 — the framework never touches operator-staged moves regardless).

---

### 2.13 Scheduled Submission Pipeline

Satisfies 07-REQ-044, 07-REQ-045, 07-REQ-045a, 07-REQ-046, 07-REQ-047, 07-REQ-049.

The coordinator runs a scheduled submission pass on the team's `game_centaur_state.scheduledSubmissionIntervalMs` interval (default 100 ms; per [06-REQ-040a] and 07-REVIEW-012 resolution) using `setInterval` in the coordinator thread. The interval is read reactively from the same Convex subscription that delivers other game-scoped state; on a parameter change the coordinator clears the existing `setInterval` handle and re-arms with the new interval on the next subscription tick. Each pass iterates over automatic-mode snakes (tier 1 of §2.12) whose dirty flag is set, and for each:

1. Reads the snake's current stateMap.
2. Filters candidate directions to those with defined stateMap entries (07-REQ-049 — undefined entries excluded from softmax).
3. If at least one defined entry exists: samples a direction via softmax (§2.14) using the snake's effective temperature.
4. If no defined entries exist: skips staging if turn 0 with no `lastDirection`, else stages `lastDirection` (07-REQ-049 fallback).
5. Calls `stage_move(snakeId, direction)` on SpacetimeDB via the per-CentaurTeam game credential. The credential's bot participant identity is captured in the `staged_moves` log entry's `stagedBy` field automatically by [04]'s `stage_move` reducer ([04-REQ-026]) — the framework does not pass `stagedBy` explicitly. This satisfies 07-REQ-047.
6. On successful staging acknowledgement from SpacetimeDB, clears the snake's dirty flag.

**Final submission pass** (07-REQ-045): the coordinator additionally arms a per-turn `setTimeout` whose deadline is the dynamically computed:

```
deadlineMs = now + min(automaticTimeAllocationMs, remainingTimeBudgetMs) - imminentThresholdMs
```

where `automaticTimeAllocationMs` and `imminentThresholdMs` are read from `game_centaur_state` (per [06-REQ-040a]), and `remainingTimeBudgetMs` is read from the SpacetimeDB chess-clock subscription. `imminentThresholdMs` is the per-team game-scoped parameter mirrored from `global_centaur_params.defaultImminentThresholdMs`; its **default value is 50 ms** — chosen as half of the default `scheduledSubmissionIntervalMs` (100 ms) to ensure the final pass fires after the most recent scheduled pass had a chance to update stateMaps but with enough lead time to complete a softmax sample, the `stage_move` round-trip, and SpacetimeDB ACID resolution before the chess clock expires. The 50 ms default is generous on a same-region SpacetimeDB connection; teams whose hosting topology (e.g., cross-region) requires more should raise their team-scoped `defaultImminentThresholdMs` rather than reducing `defaultAutomaticTimeAllocationMs`. See resolved 08-REVIEW-011, 07-REVIEW-012.

The timer fires the final pass which behaves identically to a scheduled pass (steps 1–6 above) but iterates over **all** automatic-mode snakes with dirty flags, regardless of how recently they were staged. Both timers are re-armed on every fresh pre-turn board (turn transition).

If `remainingTimeBudgetMs` decreases below the originally computed deadline (e.g., another team's actions consumed time the framework hadn't accounted for), the coordinator re-arms the `setTimeout` to the new earlier deadline on every chess-clock subscription update.

**Captain-manual flush suppression** (07-REQ-045a): the coordinator subscribes to the SpacetimeDB `chess_clock` table for the team's `declaredTurnOver` field. When `declaredTurnOver` transitions from false to true, the coordinator cancels the pending `setTimeout` for the final pass without firing it. The scheduled 100ms pipeline is not cancelled; it continues until the actual turn resolution (which arrives shortly thereafter with a new turn number, triggering cache clear per §2.6). The all-operators-ready quorum precondition of [08-REQ-062] does not by itself trigger `declare_turn_over`; it merely permits the framework's automatic submission process described above to do so on its normal schedule, so the cancellation behaviour above is meaningful only on the Captain-manual override path of [08-REQ-065].

**Manual-mode snakes are excluded from all submission passes** (07-REQ-046). Steps 1–6 iterate only over tier 1.

---

### 2.14 Softmax Decision and Temperature

Satisfies 07-REQ-048, 07-REQ-049, 07-REQ-050, 07-REQ-055, 07-REQ-056.

The softmax sample is implemented as:

```typescript
function softmaxSample(stateMap, temperature, rng): Direction {
  const defined = entries(stateMap).filter(([_, score]) => score !== undefined)
  const T = Math.max(temperature, 1e-9)  // avoid div-by-zero
  const expScores = defined.map(([d, s]) => [d, Math.exp(s / T)])
  const total = sum(expScores.map(([_, e]) => e))
  let r = rng() * total
  for (const [d, e] of expScores) {
    r -= e
    if (r <= 0) return d
  }
  return defined[defined.length - 1][0]  // numerical-error fallback
}
```

`rng` is the Snek Centaur Server process's default randomness source (Node's `Math.random` is acceptable; cryptographic randomness is unnecessary). Lower `T` concentrates probability on the highest-scoring direction (07-REQ-050).

`temperature` is read via `portfolioMirror.effectiveTemperature` (§2.4), which is the Convex-snapshot-current value of `snake_operator_state.temperatureOverride ?? game_centaur_state.globalTemperature`. Because the mirror is rebuilt on every snapshot, temperature changes take effect on the next softmax decision without cache invalidation (07-REQ-056). Temperature changes do not set the dirty flag — they affect the next sample but not the underlying stateMap (07-REQ-022 covers weights, not temperature, but the same cheap-rescan principle applies trivially to temperature).

---

### 2.15 Per-Snake Turn Timestamp on Simulated Boards

Satisfies 07-REQ-032, 07-REQ-065, 07-REQ-066.

Each `CachedWorld.simulatedState` carries a `perSnakeTurnTimestamp: Record<SnakeId, number>` field alongside the standard `GameState` fields. Lattice snakes (the self snake and every foreign snake in the simulation's `foreignTuple`) are recorded at `currentTurn + 1` (the simulated turn). Frozen snakes (alive foreigns absent from the lattice, held in place per 07-REQ-032) are recorded at `currentTurn` (one turn behind the lattice snakes — 07-REQ-065).

This field is the data substrate that 07-REQ-066's board-analysis algorithms compensate against. The canonical pattern for a multi-headed BFS Voronoi territory inference, for example, is to seed each snake-head's starting BFS distance with `(simulatedTurn − perSnakeTurnTimestamp[snakeId])` extra steps so frozen snakes effectively start one BFS step ahead — compensating for the fact that they "should" have moved this turn but the simulation kept them frozen. This makes territory inferences against simulated worlds approximately correct despite the frozen-in-place fiction.

The framework neither ships nor mandates any specific board-analysis algorithm in the MVP. Authors who want territory-style derived data implement it inside their own Drive/Preference code (or supply it via `@team-snek/heuristics`); the framework's only obligation here is to publish the per-snake turn timestamps on every simulated state so those author-implemented algorithms have the data they need to be correct. See resolved 07-REVIEW-014.

---

### 2.16 Subscription Boundaries and Negative Surface

Satisfies 07-REQ-005, 07-REQ-018, 07-REQ-057, 07-REQ-058, 07-REQ-059, 07-REQ-060, 07-REQ-061, 07-REQ-062, 07-REQ-064.

The coordinator opens exactly two reactive sources for its `(centaurTeamId, gameId)`:

1. Convex reactive subscription via `getGameCentaurState({ gameId, centaurTeamId })` and `getEffectiveHeuristicConfig({ gameId, snakeId })` per owned snake. Authentication via the per-CentaurTeam game credential.
2. SpacetimeDB subscription scoped by [04]'s RLS to this team's view of the game. Authentication via the bot participant access token derived from the game credential per [03] §3.18.

The coordinator opens **no other** Convex queries or mutations on operator-owned tables; it does not write to `snake_drives`, `snake_heuristic_overrides`, `snake_operator_state`, `heuristic_config`, `global_centaur_params`, or `centaur_action_log` (07-REQ-018, 07-REQ-059, 07-REQ-064). Its only Convex write is `updateSnakeBotState` for owned snakes (07-REQ-004). Its only SpacetimeDB write is `stage_move` for automatic-mode owned snakes (07-REQ-005, 07-REQ-046). Move-staging entries are recorded by the SpacetimeDB log inherently (07-REQ-062); the framework writes nothing to the Centaur action log.

The coordinator never opens subscriptions to other CentaurTeams' Convex documents or SpacetimeDB instances (07-REQ-061). Cross-team isolation is enforced by Convex's authorisation checks ([06] §2.6) and SpacetimeDB's RLS ([04] §2.9), but the framework's design also avoids constructing such subscriptions in the first place.

Coach reads of `snake_bot_state` and the Centaur action log are served entirely through Module 06's read-side auth surface (e.g., `getGameCentaurState`, action-log queries) under the Coach's own Convex auth identity ([06] §2.6); the bot framework exposes no coach-aware code path, holds no coach identity, and performs no read or write on the Coach's behalf.

---

### 2.17 Bot Framework Lifecycle

Satisfies 07-REQ-001, 07-REQ-002, 07-REQ-003.

The Snek Centaur Server invokes the framework via three lifecycle entry points (§3.3):

- `startGameSession({ centaurTeamId, gameId, gameCredential, stdbConnection, convexClient })`: spawns the coordinator worker for the team's game, opens subscriptions, returns a session handle.
- `endGameSession(handle)`: terminates the coordinator, releases simulation worker capacity, closes subscriptions. Called when the game's record transitions to a terminal status or the framework receives a SpacetimeDB game-end event.
- `getRegisteredHeuristics()`: returns the build-time registry (§2.3) for use by [08]'s UI. Pure synchronous getter; does not depend on any session.

Multiple game sessions may be active concurrently for different teams hosted by the same Snek Centaur Server. Sessions are independent — terminating one does not affect others.

---

### 2.18 Lazy-Insert Contract for Missing `heuristic_config` Rows

Satisfies 07-REQ-016, 07-REQ-018; resolves [08]'s 08-REVIEW-021.

When the Captain visits the global centaur params page in the SvelteKit frontend ([08]), the page initiates a "registry sync" that calls a new `insertMissingHeuristicConfig` mutation on Module 06 (§2.19) under the **visitor's** Convex auth credential (the Captain's Google OAuth identity, per [06] §2.6 — the Captain has heuristic config write authority). The mutation:

- Reads the page-supplied list of `HeuristicRegistration` entries (sent as a request payload — the registry's own elements minus the implementation function references, which are not serialisable).
- For each entry whose `heuristicId` does not exist in the team's `heuristic_config`, **inserts** a new row using the registry's `defaultWeight`, `activeByDefault`, and `nickname` as initial values.
- For entries whose `heuristicId` already exists, does **nothing** (insert-only contract — never overwrites Captain-edited values).

The framework itself never invokes this mutation. The framework is read-only with respect to `heuristic_config` (07-REQ-018). The mutation is invoked from [08] under the Captain's credential because the Captain is the trust anchor for changes to team configuration (per [06] §2.6 and 08-REVIEW-001's Captain-only authorisation), and the lazy-insert is conceptually "the Captain accepting the registry's defaults for newly registered heuristics". The Captain may then edit defaults via `upsertHeuristicConfig` or delete unwanted entries via `deleteHeuristicConfig`.

Stale entries (heuristic IDs in `heuristic_config` whose IDs are not in the current registry) are surfaced on the global centaur params page with a visual "stale" marker and a delete affordance (see resolved 08-REVIEW-021).

---

### 2.19 Module 06 Mutation: `insertMissingHeuristicConfig`

Module 06's exported function contract surface ([06] §2.2.1, §3.2) includes:

```typescript
mutation insertMissingHeuristicConfig(args: {
  centaurTeamId: Id<"centaur_teams">,
  registrations: ReadonlyArray<{
    heuristicId: string,
    heuristicType: "drive" | "preference",
    defaultWeight: number,
    activeByDefault: boolean | null,
    nickname: string | null,
  }>,
}): { inserted: ReadonlyArray<string> }   // heuristic IDs newly inserted
```

Authorization: Captain of the specified CentaurTeam (consistent with `upsertHeuristicConfig`'s authorisation per 08-REVIEW-001).

Semantics: insert-only. For each registration whose `heuristicId` is not already present in `heuristic_config` for the team, inserts a row with the registration's values. For IDs already present, no-op (does **not** patch existing rows). Returns the list of newly inserted IDs for UI confirmation. This is the only mutation in [06] with insert-only-never-overwrite semantics; it exists to discharge 07's lazy-insert contract (§2.18) without giving the framework or the page any path to silently overwrite Captain-authored values.

---

## Exported Interfaces

### 3.1 Heuristic Registry Types

Motivated by 07-REQ-006, 07-REQ-007, 07-REQ-008, 07-REQ-014; consumed by Snek Centaur Server build (§2.3) and by [08]'s UI.

```typescript
export type HeuristicType = "drive" | "preference"

export type DriveTargetType = "snake" | "cell"

export interface HeuristicRegistration {
  readonly heuristicId: string                       // stable ID, matches heuristic_config.heuristicId
  readonly heuristicType: HeuristicType
  readonly nickname: string                          // human-readable; UI default
  readonly defaultWeight: number                     // seed for insertMissingHeuristicConfig
  readonly activeByDefault: boolean | null           // non-null for preferences, null for drives
  readonly targetType: DriveTargetType | null        // non-null for drives, null for preferences;
                                                     // matches Target.kind for the Drive variant produced
  readonly implementation: () => Drive<SnakeTarget> | Drive<CellTarget> | Preference
}

export type HeuristicRegistry = ReadonlyArray<HeuristicRegistration>

// ──────────────────────────────────────────────────────────────────────────
// Author-facing registration API
// ──────────────────────────────────────────────────────────────────────────
//
// Heuristic authors register Drives and Preferences via two minimal helpers.
// Each call returns a `HeuristicRegistration` literal whose `heuristicId`,
// `heuristicType`, `defaultWeight`, and `implementation` fields are pinned
// from the call arguments; `nickname`, `activeByDefault`, and `targetType`
// are filled from the optional `meta` argument (with sensible defaults from
// the implementation factory's emitted instance — `targetType` for drives
// is read from the constructed Drive's declared target kind; `nickname`
// defaults to a humanised `heuristicId`; `activeByDefault` defaults to true
// for preferences and is null for drives).
//
// `HEURISTIC_REGISTRY` (§2.3) is the build-time-shared array literal whose
// entries are the values returned by these helpers. Authors never construct
// `HeuristicRegistration` records by hand — `registerDrive` /
// `registerPreference` are the sole supported registration entry points.

export interface DriveRegistrationMeta {
  readonly nickname?: string                         // defaults to humanised heuristicId
  readonly targetType?: DriveTargetType              // defaults to impl().target kind
}

export interface PreferenceRegistrationMeta {
  readonly nickname?: string                         // defaults to humanised heuristicId
  readonly activeByDefault?: boolean                 // defaults to true
}

export function registerDrive<T extends DriveTarget>(
  heuristicId: string,
  impl: () => Drive<T>,
  defaultWeight: number,
  meta?: DriveRegistrationMeta,
): HeuristicRegistration

export function registerPreference(
  heuristicId: string,
  impl: () => Preference,
  defaultWeight: number,
  meta?: PreferenceRegistrationMeta,
): HeuristicRegistration

// ──────────────────────────────────────────────────────────────────────────
// Read-only registered-set accessor
// ──────────────────────────────────────────────────────────────────────────
//
// Returns a frozen, deduplicated view of the currently-registered heuristic
// IDs paired with their type and default weight. This is the minimum shape
// downstream consumers ([08]'s frontend, [06]'s lazy-insert payload) need to
// reconcile the registry against `heuristic_config`. Returning the full
// `HeuristicRegistration` is intentionally avoided here so consumers cannot
// accidentally invoke `implementation()` outside the framework process.

export interface RegisteredHeuristicSummary {
  readonly heuristicId: string
  readonly heuristicType: HeuristicType
  readonly defaultWeight: number
  readonly nickname: string
  readonly activeByDefault: boolean | null
  readonly targetType: DriveTargetType | null
}

export function getRegisteredHeuristics(
  registry: HeuristicRegistry,
): ReadonlyArray<RegisteredHeuristicSummary>
```

### 3.2 Drive and Preference Interfaces

Motivated by 07-REQ-006, 07-REQ-007, 07-REQ-008, 07-REQ-009, 07-REQ-010, 07-REQ-012.

```typescript
import type { SnakeState, GameState, Direction, Cell, SnakeId } from "@team-snek/game-rules"

export type Snake = SnakeState              // re-export for Drive author convenience

// Discriminated union over Drive target shape. The `kind` discriminator lets
// framework code, the operator UI, and Drive authors narrow on a single
// runtime tag rather than relying on structural inspection of `value`.
// Per 07-REQ-006 (Drive<T> target type is constrained to one of two target
// types: a snake or a cell).
export interface SnakeTarget {
  readonly kind: "snake"
  readonly value: Snake          // resolved against the current pre-turn board
}

export interface CellTarget {
  readonly kind: "cell"
  readonly value: Cell
}

export type Target = SnakeTarget | CellTarget

// `DriveTarget` is the type-parameter constraint for Drive<T> — author code
// instantiates Drive<SnakeTarget> or Drive<CellTarget>. The framework
// resolves the persisted `(targetType, targetId)` pair from `snake_drives`
// ([06] §2.1.4) into the appropriate Target variant before invoking the
// Drive's pure scoring functions.
export type DriveTarget = SnakeTarget | CellTarget

export interface Drive<T extends DriveTarget> {
  readonly heuristicId: string                                   // matches HeuristicRegistration

  reward(self: Snake, target: T, board: GameState): number       // [-1, 1]
  distance(self: Snake, target: T, board: GameState): number     // ≥ 0
  motivation(reward: number, distance: number): number           // pure combiner; [-1, 1]
  satisfaction(self: Snake, target: T, board: GameState): boolean

  targetEligibility(candidate: T, self: Snake, board: GameState): boolean
  selfDirectionNomination(self: Snake, target: T, board: GameState): ReadonlySet<Direction>
  foreignMoveNomination(
    self: Snake,
    target: T,
    board: GameState,
  ): ReadonlyMap<SnakeId, ReadonlySet<Direction>>
}

export interface Preference {
  readonly heuristicId: string
  evaluate(self: Snake, board: GameState): number                // [-1, 1]
}
```

The `motivation(reward, distance) => number` shape is a pure combiner over two scalars — the framework computes `reward` and `distance` via `Drive<T>`'s methods first against each simulated world, then calls `motivation(reward, distance)`. This shape decouples authoring of the value-of-the-target (`reward`), the spatial proximity of the target (`distance`), and the combined motivation (`motivation`), and makes the satisfaction terminal-reward path (07-REQ-010, which bypasses `motivation` and uses `reward`) coherent.

### 3.3 Bot Framework Lifecycle

Motivated by 07-REQ-001, 07-REQ-003, 07-REQ-004, 07-REQ-040.

```typescript
import type { ConvexClient } from "convex/browser"
import type { DBConnection } from "@spacetimedb/sdk"

export interface StartGameSessionArgs {
  readonly centaurTeamId: string
  readonly gameId: string
  readonly gameCredential: string         // per-CentaurTeam game credential JWT [05-REQ-032b]
  readonly stdbConnection: DBConnection   // pre-authenticated via [03]'s OIDC flow
  readonly convexClient: ConvexClient     // authenticated with the game credential
  readonly registry: HeuristicRegistry
}

export interface BotFrameworkSession {
  readonly centaurTeamId: string
  readonly gameId: string
  end(): Promise<void>
}

export function startGameSession(args: StartGameSessionArgs): Promise<BotFrameworkSession>

export function endGameSession(session: BotFrameworkSession): Promise<void>

export function getRegisteredHeuristics(registry: HeuristicRegistry):
  ReadonlyArray<Pick<HeuristicRegistration,
    "heuristicId" | "heuristicType" | "nickname" | "defaultWeight" | "activeByDefault" | "targetType">>
```

The `getRegisteredHeuristics` helper returns a serialisable projection of the registry (omitting the `implementation` function reference) for use by [08]'s lazy-insert mutation payload (§2.18) and by [08]'s UI when it needs to enumerate registered IDs at render time without importing the implementations.

### 3.4 Per-Snake Display State Snapshot Shape

Motivated by 07-REQ-039, 07-REQ-063; consumed by [06]'s `snake_bot_state.stateMap`/`worstCaseWorlds`/`heuristicOutputs` `v.any()` columns and by [08]'s decision-table UI. See resolved 07-REVIEW-014.

```typescript
export interface StateMap {
  readonly Up?: number
  readonly Right?: number
  readonly Down?: number
  readonly Left?: number
}

export interface WorstCaseWorldRecord {
  readonly Up?: SimulatedWorldSnapshot
  readonly Right?: SimulatedWorldSnapshot
  readonly Down?: SimulatedWorldSnapshot
  readonly Left?: SimulatedWorldSnapshot
}

export interface SimulatedWorldSnapshot {
  readonly simulatedTurn: number
  readonly state: GameState                              // [01]'s GameState
  readonly foreignTuple: Record<string /* SnakeId */, Direction>
  // Per 07-REQ-065: turn at which each snake's position was last freshly advanced.
  // Lattice snakes (the self snake and every snake in `foreignTuple`) carry
  // `simulatedTurn`; frozen foreign snakes (alive foreigns absent from the
  // lattice, held in place per 07-REQ-032) carry `simulatedTurn - 1`. Consumed
  // by 07-REQ-066's board-analysis algorithms (e.g., multi-headed BFS for
  // Voronoi territory) to compensate for the frozen-in-place fiction.
  readonly perSnakeTurnTimestamp: Record<string /* SnakeId */, number>
}

export interface PerHeuristicOutputs {
  readonly [heuristicId: string]: number
}

export interface SnakeBotStateSnapshot {
  readonly stateMap: StateMap
  readonly worstCaseWorlds: WorstCaseWorldRecord
  readonly heuristicOutputs: Record<Direction, PerHeuristicOutputs>
}
```

Contract violations by author-supplied scoring functions are surfaced exclusively via the Snek Centaur Server's process log (see 07-REQ-009b); no Convex column or exported-interface type carries them.

### 3.5 Constants

Motivated by resolved 07-REVIEW-004 (concrete values pinned in Phase 2 Design per design discretion).

```typescript
export const RANK_DECAY: number = 0.9                          // §2.9
```

This constant is part of the framework's exported surface (rather than internal) because [08]'s operator UI surfaces it in operator help text. It is not operator-tunable; teams that need a different value modify the framework source and rebuild.

Submission timing values (`scheduledSubmissionIntervalMs`, `imminentThresholdMs`) are per-team bot parameters on `global_centaur_params` mirrored to `game_centaur_state` — see [06] §2.1.1, §2.1.5, and 07-REQ-044/045. See resolved 07-REVIEW-012.

### 3.6 Board-Analysis Utilities for Heuristic Authors

*(Retired. Section number not reused. See resolved 07-REVIEW-014.)*

### 3.7 DOWNSTREAM IMPACT Notes

- **[08] heuristic registry consumption**: [08]'s SvelteKit frontend imports `HeuristicRegistry` from the same Centaur Server package that boots the framework, satisfying 08-REVIEW-021's drift-elimination requirement. The Drive dropdown (08-REQ-052) sources its options from the intersection `heuristic_config ∩ HEURISTIC_REGISTRY` filtered to `heuristicType = "drive"`. The decision-table column set (08's heuristic columns) sources from the same intersection.
- **[08] global centaur params page lazy-insert call**: on Captain visits to the global centaur params page, the page calls `insertMissingHeuristicConfig({ centaurTeamId, registrations: getRegisteredHeuristics(registry) })`. The mutation runs under the Captain's Convex auth credential. [08]'s implementation must wire this call into the page's load lifecycle and surface the returned `inserted` list to the Captain so the new registrations are visible immediately.
- **[06] mutation**: `insertMissingHeuristicConfig` is part of [06]'s function contract surface and exported interfaces, with insert-only semantics (§2.19). Captain authorisation.
- **[06] `snake_bot_state` column shape narrowing**: while [06]'s schema declares `stateMap`, `worstCaseWorlds`, and `heuristicOutputs` as `v.any()` ([06] §2.1.3), this module's §3.4 fixes their concrete TypeScript shape. [06]'s eventual narrowing of these `v.any()` columns to a `v.object(...)` schema (noted as future-permissible in [06] §2.1.3) shall use these shapes. See resolved 07-REVIEW-014.
- **[08] operator UI surfacing of submission parameters and constants**: [08]'s operator help text and bot-parameter calibration page surface `RANK_DECAY` as advisory framework-constant information, and `defaultScheduledSubmissionIntervalMs` / `defaultImminentThresholdMs` (per-team) plus their per-game mirrors `scheduledSubmissionIntervalMs` / `imminentThresholdMs` as operator-tunable bot parameters (see [06] §2.1.1 / §2.1.5; see resolved 07-REVIEW-012).
- **[08] heuristics package consumption**: [08]'s SvelteKit frontend depends on `@team-snek/heuristics` (the dedicated workspace package; see [02] §2.16a) rather than depending transitively on the Snek Centaur Server. [08]'s Drive dropdown and decision-table column set source from `@team-snek/heuristics`'s exported registry projection; the Snek Centaur Server independently imports the same package for its Drive/Preference implementations. See resolved 07-REVIEW-015.
- **[08] worst-case world rendering**: [08]'s "worst-case world preview" UI ([08]'s operator interface) consumes `WorstCaseWorldRecord` from `snake_bot_state.worstCaseWorlds`. Each entry is a `SimulatedWorldSnapshot` carrying the post-turn `GameState` plus the per-snake turn timestamp (07-REQ-065). [08] **should** respect this when rendering simulated worlds — e.g., visually marking frozen foreign snakes (those whose `perSnakeTurnTimestamp[snakeId] < simulatedTurn`) as "held in place / temporally one turn behind" so operators can see which snake positions are fresh simulations versus frozen-in-place fictions. The exact visual treatment is an [08] design decision; the framework's obligation is only to publish the data.
- **[08] decision-table no-recompute rule**: [08]'s in-game decision-table view ([08]'s heuristic-output table per direction × heuristic) is rendered **purely** from the framework's published `snake_bot_state.heuristicOutputs` snapshot. [08] **must not** re-evaluate any Drive's `reward`/`distance`/`motivation` or any Preference's `score` in the frontend, must not re-run any simulation, and must not interpolate or extrapolate values for cells/heuristics absent from `heuristicOutputs`. Missing entries render as "—" (or equivalent absent indicator), never as zeros or stale prior-turn values. The framework is the sole source of truth for every cell in the decision table.
- **[08] Captain `declareTurnOver` flush-suppression coordination**: [08]'s Captain UI ([08]'s "declare turn over" affordance) calls SpacetimeDB's `declare_turn_over` reducer ([04] §2.5) and **nothing else** with respect to the framework. The framework observes the resulting state transition through its existing SpacetimeDB subscription (§2.13 / §2.16) — turn-over manifests either as the `turnEndTime` collapsing and the resolver advancing the turn number, or as the equivalent observable signal exposed by [04]'s `declare_turn_over` reducer — and applies 07-REQ-045a's flush suppression on its own (cancels any in-flight scheduled-submission pass, cancels any imminent-deadline final pass, and emits no further `stage_move` writes for the team's snakes for the remainder of the turn). [08] **must not** open any out-of-band notification channel to the framework (no direct HTTP, no shared in-process call, no Convex side-channel) for `declareTurnOver`; the SpacetimeDB observation is the sole coordination mechanism. This keeps the framework's reactive-input boundary identical to every other run-time signal it consumes and matches §2.13's suppression mechanism exactly.
- **[08] selection observation via Module 06 only**: [08]'s in-game UI persists the operator's currently-selected `(snakeId, direction)` to Module 06 ([06] §2.1.2 `snake_selected_direction` or equivalent — [06] §2.2's mutation surface). The framework observes that selection **only** through its existing Convex subscription on `GameCentaurStateView` (§2.16 — same subscription set already used for portfolio mirror reactivity); [08] **must not** push selection changes to the framework over any other channel (no direct HTTP, no shared in-process call, no SpacetimeDB write). This preserves the framework's single source-of-truth for reactive inputs and ensures selection promotions through the three-tier scheduler (§2.12) are driven by the same Convex transaction boundary as everything else the framework reads.
- **[08] full-replacement snapshot rendering (no diff merge)**: each `updateSnakeBotState` write from the framework ([06] §2.2's framework-write mutation) replaces the **full** `stateMap`, `worstCaseWorlds`, and `heuristicOutputs` fields for the affected `snake_bot_state` row (§3.4 — the framework writes whole-snapshot values). [08]'s consuming components **must** treat each Convex subscription update as a complete replacement of the rendered state for that snake; [08] **must not** merge incoming snapshots into prior snapshots or attempt to diff-patch missing keys from earlier values. Stale entries from prior compute passes are intentionally absent from a new snapshot — preserving them would surface wrong cells in the decision table and wrong markers on the world preview. Diagnostic scoring violations are surfaced via the Snek Centaur Server's process log per 07-REQ-009b, not via Convex. See resolved 07-REVIEW-014.

---


## REVIEW Items

All REVIEW items for this module (all resolved) have been migrated to [`07-bot-framework.review.md`](review/07-bot-framework.review.md).
