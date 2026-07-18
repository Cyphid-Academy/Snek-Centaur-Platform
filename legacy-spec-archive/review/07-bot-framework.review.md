# Module 07 — Bot Framework: Decision Log

Resolved REVIEW items from [`specs/07-bot-framework.md`](../07-bot-framework.md). See [`SPEC-INSTRUCTIONS.md`](../../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 07-REVIEW-001: Depth-1 scope as requirement vs design note — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec (§6 preamble) states "The MVP bot framework operates at depth-1 (single-ply lookahead). Multi-ply tree search is a future enhancement." 07-REQ-002 promotes this to a requirement, on the grounds that multi-ply would pervasively change the cache structure, reactive-input model, and compute scheduling, and a spec reader should be able to rely on "depth-1" as a binding contract. The alternative framing is that depth-1 is a current *design choice* that satisfies a more abstract requirement like "the framework shall produce per-direction worst-case scores that update continuously during the turn", and the depth statement belongs in Phase 2 Design.
**Question**: Should "depth-1" be a binding requirement that a future multi-ply implementation would have to supersede via an explicit spec revision, or is it a design-phase choice recorded only in Module 07's eventual Design section?
**Options**:
- A: Binding requirement (current draft, 07-REQ-002). Forces any multi-ply change to be a spec revision and documents the MVP scope clearly.
- B: Move to Design phase as a rationale note attached to the cache/traversal design. Requirements stay silent on depth.
**Informal spec reference**: §6 preamble.

**Decision**: Option A. 07-REQ-002 stays as-is. Depth-1 is a binding requirement. Any future multi-ply extension would require an explicit spec revision.
**Rationale**: Multi-ply would pervasively change the cache structure, reactive-input model, and compute scheduling, so a spec reader should be able to rely on "depth-1" as a binding contract rather than a mutable design choice.
**Affected requirements/design elements**: 07-REQ-002 — "Flagged" tag removed.

---

### 07-REVIEW-002: Teammates as foreign snakes — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: The informal spec's §6.6 talks about "foreign snakes" without specifying whether teammates are included. Physically, teammates are part of the world and affect turn resolution (body collisions, severings, food competition); excluding them from the lattice would make simulations systematically wrong whenever a Drive's outcome depends on teammate behaviour. 07-REQ-033 includes teammates, and 07-REQ-034 distinguishes observable teammate commitments (staged moves within the team) from unobservable opponent commitments (null). This is a plausible reading but is not explicitly stated in the informal spec.

An alternative reading is that "foreign" means "opposing team" exclusively, and teammate interactions are handled by some other mechanism (e.g., cooperative scheduling so each team-snake simulates with teammates held at already-committed moves). The current draft does not adopt this reading because no such mechanism is described anywhere in the informal spec.

A subtle consequence of the current draft: a teammate snake that has been staged via the scheduled submission pipeline (07-REQ-044) will appear "committed" to that direction from the perspective of other owned snakes simulating against it. Changes to that teammate's own portfolio that later re-stage it would be observed as a commitment change in the other snakes' reactive inputs, and would toggle branches accordingly. This is internally consistent but worth confirming.
**Question**: Is "foreign" snake the set of all-other-snakes-including-teammates, or only opposing-team snakes?
**Options**:
- A: All non-self snakes, teammates included. Teammate commitments are observable as their staged moves. (Current draft.)
- B: Only opposing-team snakes. Teammates are handled by a separate (to-be-specified) mechanism.
- C: All non-self snakes, but teammates are always treated as committed to their currently-staged move if any, and never contribute interest-map dimensions beyond that committed direction. (A restricted variant of A.)
**Informal spec reference**: §6.6 (uses "foreign" without defining membership).

**Decision**: Allied (teammate) snakes are indeed foreign snakes. 07-REQ-034 is amended to clarify the commitment semantics precisely by snake category: (1) manual-mode teammates have their staged move treated as committed only when the staged direction intersects the evaluating snake's interest map; (2) automatic-mode teammates have their staged moves ignored entirely — commitment state is null, same as opponents; (3) opponents are always null.
**Rationale**: Excluding teammates from the lattice would make simulations systematically wrong whenever a Drive's outcome depends on teammate behaviour, and no separate teammate-handling mechanism is described in the informal spec. Automatic-mode teammates are treated as uncommitted because their staged move is a bot-internal rolling best-guess that changes frequently and should not constrain sibling evaluations.
**Affected requirements/design elements**: 07-REQ-033 confirmed as-is; "Flagged" tag removed. 07-REQ-034 amended with the per-category commitment semantics and rationale note.

---

### 07-REVIEW-003: Foreign snakes absent from the interest map — hold in place — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 07-REQ-020 and 07-REQ-032 together specify that a foreign snake with no interest-map entry contributes no dimension to the lattice and is "held at its current position" in simulation. This is what the informal spec §6.6 implies ("Y drops out of the lattice — it contributes no dimension and is held at its current position"), but "held at its current position" is only physically plausible on turn 0 or for a dying/stuck snake. On any later turn, a live foreign snake will certainly move somewhere; simulating it as stationary is a deliberate fiction. The informal spec accepts this because a Drive that doesn't care about Y's moves by definition doesn't care where Y ends up; scoring of those heuristics that *don't* mention Y is unaffected by Y's fictitious stasis. But heuristics that *do* care about Y and don't nominate any of Y's moves (plausible if a Drive only nominates the specific moves it considers interesting and treats others as "don't care") will implicitly score Y's stationary ghost.
**Question**: Is "hold Y stationary" the right fill-in for dimensions absent from the interest map, or should there be a convention that a heuristic which cares about Y at all must nominate all of Y's plausible moves, even ones it treats as don't-care, so that Y is never absent from the lattice when the self snake scores anything that could depend on Y?
**Options**:
- A: Hold Y stationary (current draft). Simpler; places the "don't care" contract on heuristic authors implicitly.
- B: Add a requirement that a Drive nominating *any* move for Y must nominate all of Y's non-trivially-lethal moves. Shifts the contract to be explicit.
- C: When Y is absent from the interest map, simulate Y as taking a "typical" move (e.g., Y's last direction, or a staged move if observable per 07-REVIEW-002). Most realistic but most complex and introduces a new notion of "typical".
**Informal spec reference**: §6.6 ("held at its current position"); general centaur engine spec v6 §World Simulation (lines 309–311).

**Decision**: None of the three listed options in isolation. Foreign snakes absent from the interest map are held at their current position (as 07-REQ-032 already said), but the simulated partial board state additionally tracks a per-snake turn timestamp so that board analysis algorithms can compensate for the frozen-in-place fiction by giving frozen snakes a temporal head start proportional to their staleness.
**Rationale**: The correct reading from the general centaur engine spec v6 (World Simulation section) specifies a temporal annotation mechanism that compensates for the frozen-in-place fiction. Snakes in the lattice are annotated with the current turn; frozen snakes are annotated as one turn behind. This preserves the simplicity of holding absent snakes stationary while letting downstream analysis (e.g., multi-headed BFS for Voronoi territory maps) account for the staleness rather than treating frozen ghosts as physically equivalent to up-to-date positions.
**Affected requirements/design elements**: 07-REQ-032 updated to reference the temporal annotation mechanism, replacing the "deliberately diverges from physically realistic play" apology with the framing "frozen in place but temporally annotated as stale, enabling downstream analysis algorithms to compensate." 07-REQ-065 added — simulated partial board states must track a per-snake turn timestamp (current turn for lattice snakes, one turn behind for frozen snakes). 07-REQ-066 added — board analysis algorithms must use these timestamps to give frozen snakes a temporal head start proportional to their staleness.

*Post-mortem*: The formal spec extracted the "held at current position" rule from the team-snek spec v2.2 §6.6 but missed the temporal annotation mechanism documented in the general centaur engine spec v6 (World Simulation section, lines 309–311): "The partial board state tracks per-object turn timestamps. This allows graph algorithms such as multi-headed BFS for Voronoi territory to give objects that have moved an appropriate temporal head start." The team-snek v2.2 doesn't repeat this because it inherits it from v6 — the gap occurred because formal extraction focused on v2.2 without cross-referencing v6's simulation semantics.

---

### 07-REVIEW-004: Concrete numeric constants (RANK_DECAY, submission interval) — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: The informal spec's §6.6 specifies `RANK_DECAY = 0.9` and §6.8 specifies a 100 ms scheduled submission interval. Both look like design choices rather than user-facing contracts: a different decay constant or interval would not invalidate the framework's contract to operators or downstream modules. The current draft leaves these concrete values to Phase 2 Design (07-REQ-028, 07-REQ-044) and treats the requirement as "there exists a rank-decay mechanism" and "there exists a scheduled submission interval", respectively.
**Question**: Should these concrete numbers be pinned in Phase 1 Requirements (in case operators or testers need to assume specific values) or left flexible as Phase 2 design choices (the current draft's position)?
**Options**:
- A: Leave flexible in Phase 1; pin in Phase 2 Design. (Current draft.)
- B: Pin 0.9 and 100 ms as requirements on the grounds that the informal spec treats them as concrete.
- C: Expose both as bot parameters in [06-REQ-011], making them operator-tunable rather than hardcoded.
**Informal spec reference**: §6.6 (`RANK_DECAY = 0.9`); §6.8 ("100ms interval").

**Decision**: Option A. Current draft position stands. Concrete numeric values are left to Phase 2 Design.
**Rationale**: Concrete numeric values are design choices rather than user-facing contracts; pinning them at the requirements level would over-constrain Phase 2 Design without serving any contract.
**Affected requirements/design elements**: None.

---

### 07-REVIEW-005: Final submission deadline awareness — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 07-REQ-045 requires the framework to execute a final submission pass immediately before the turn deadline, so that all dirty automatic-mode snakes are staged before the turn resolves. The chess timer ([01-REQ-034] through [01-REQ-040]) lives in SpacetimeDB, and the turn is declared over by explicit team declaration or per-turn clock expiry — neither of which is a clean "imminent deadline" signal the framework can precisely predict. Two complications:
1. If the team's own declaration of turn over is what ends the turn, the framework needs to cooperate with whatever component issues that declaration (operator UI in [08]? a bot-framework component itself?) so that the final submission runs before declaration, not after.
2. If the turn ends by clock expiry, the framework needs a near-zero-latency read on the per-turn clock to fire the final pass at the right moment.

The informal spec §6.8 just says "immediately before the turn deadline" without specifying how the framework obtains that signal.
**Question**: How does the framework learn that the turn is about to end, with enough lead time to execute a final submission pass?
**Options**:
- A: The team's turn-over declaration is issued by a component that first notifies the framework, waits for the framework's final pass to complete, then declares turn-over to SpacetimeDB. Requires a framework-side "flush" hook invoked from whatever triggers declaration.
- B: The framework polls the per-turn clock in SpacetimeDB at high frequency and fires the final pass when remaining time crosses a configurable threshold. Requires picking a threshold and accepting that either clock-expiry or explicit declaration can pre-empt the final pass.
- C: There is no distinct "final pass" — the framework's submission-pipeline cadence is fast enough that the scheduled pass immediately prior to any declaration is "good enough". Weakens 07-REQ-045 to a best-effort guarantee.
**Informal spec reference**: §6.8 ("final submission"); §5.3 (operator mode / time allocation).

**Decision**: The deadline is not a single fixed signal — it is calculated dynamically each turn as `min(automaticTimeAllocationMs, remainingTimeBudget)` where `automaticTimeAllocationMs` is the game-scoped centaur parameter from [06-REQ-040a] and `remainingTimeBudget` is the team's chess clock budget from SpacetimeDB. On turn 0, `turn0AutomaticTimeAllocationMs` replaces `automaticTimeAllocationMs`. The final submission pass fires when the dynamically computed deadline is imminent (threshold is a design-phase decision). Manual operator turn submission (`declareTurnOver`) shall NOT trigger a final flush of dirty automatic-mode snake states; the scheduled submission pipeline (07-REQ-044) continues to operate normally until the turn is declared over — only the final flush differs between automatic deadline expiry (flush happens) and manual submission (flush suppressed). *(Amended per 08-REVIEW-011 resolution: the `turn0AutomaticTimeAllocationMs` carve-out is removed — turn 0 uses the same `automaticTimeAllocationMs`, naturally bounded by `remainingTimeBudget` which already encompasses the chess-clock's turn-0 budget. See the current text of 07-REQ-045 / 07-REQ-045a for the live flush-suppression model.)*
**Rationale**: A dynamically computed deadline reflects the actual chess-clock budget the team has spent, rather than a fixed wall-clock signal that can't be precisely predicted. Suppressing flush on manual submission is essential because the manual submission reflects human discretion that the current staged moves are acceptable; flushing dirty states would cause new softmax rolls after the human decision with no opportunity for humans to respond, contradicting the purpose of manual override.
**Affected requirements/design elements**: 07-REQ-045 substantially amended with the dynamic deadline formula and turn-0 carve-out; "Flagged" tag removed. 07-REQ-045a added — manual `declareTurnOver` shall not trigger a final flush of dirty automatic-mode snake states.

---

### 07-REVIEW-006: Undefined stateMap entries at decision time — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 07-REQ-049 covers the edge case where no candidate direction has a defined stateMap entry at decision time (no cached world has yet been computed for the snake). It falls back to SpacetimeDB's own turn-0 random choice ([01-REQ-042(c)]) or continuation per `lastDirection`. A subtler case: some candidate directions have defined stateMap entries and others don't. The current draft excludes undefined directions from the softmax distribution, implicitly biasing decision toward directions the framework has had time to evaluate. This is reasonable in the general case but could under-explore: a direction that *would* have scored highest but got no compute time because priority pushed it to the back of the queue would be silently skipped.
**Question**: When some candidate directions have defined stateMap entries and others don't, should the framework (a) sample only from defined ones (current draft), (b) treat undefined entries as neutral (score 0) and include them in the softmax, or (c) block decision until all candidates have at least one cached world?
**Options**:
- A: Sample only from defined entries. (Current draft.) Simplest; matches "anytime" principle.
- B: Treat undefined as score 0 and include in softmax. Gives unevaluated directions a shot at selection proportional to temperature.
- C: Block the scheduled submission pass for a snake until all its candidate directions have ≥ 1 cached world. Slower but fairest.
**Informal spec reference**: §6.8, §6.9 (neither explicit on this case).

**Decision**: Option A. 07-REQ-049 stays as-is.
**Rationale**: The round-robin processing rule (07-REQ-041) guarantees that the highest-priority world simulation for each snake populates every not-certain-death direction's stateMap entry before any second-priority worlds are simulated, and those first simulations occur in priority order of cheap heuristics about worthwhile moves. Centaur Server authors are responsible for writing performant Drive/Preference code that fits many world simulations within the available time. If a team's heuristic code is too slow and some directions remain unevaluated at decision time, that is the CentaurTeam's failure to write performant code and it is appropriate that they suffer a less intelligent decision policy as a consequence.
**Affected requirements/design elements**: None.

---

### 07-REVIEW-007: Retirement of a satisfied Drive — timing — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 07-REQ-010 says a Drive whose satisfaction predicate evaluated to true "in a given turn's observed state shall be removed from the snake's active portfolio at the turn's close." The informal spec §6.1 says "In the bot's live portfolio, a satisfied Drive is removed after the turn in which satisfaction is detected." The current draft treats "observed state" as meaning the authoritative post-turn-resolution board published by SpacetimeDB, not merely any simulated world where the predicate happened to fire. Removing on simulated satisfaction would be wrong, because a simulated world is a hypothesis, not reality — and multiple simulated worlds could disagree on whether satisfaction holds for the same Drive.

Consequence of the draft: a Drive whose terminal reward contributes to scoring in a simulated world (via 07-REQ-010) still remains on the portfolio through that turn and is only retired once the next fresh board state arrives and the satisfaction predicate evaluates to true against it.
**Question**: Is "observed state" the correct anchor, and does retirement happen at the moment the fresh post-resolution board arrives from SpacetimeDB, or at some other moment?
**Options**:
- A: Retire on fresh post-resolution board when satisfaction predicate is true against it. (Current draft.)
- B: Retire on simulated satisfaction in the direction that ends up being selected. More optimistic (acts before confirmation).
- C: Retire on fresh post-resolution board, but only if satisfaction predicate is still true there — otherwise leave the Drive active even if a simulated world predicted satisfaction. (This is the contrapositive of A and is probably what A already says; listed for completeness.)
**Informal spec reference**: §6.1 ("satisfied Drive is removed after the turn in which satisfaction is detected").

**Decision**: Option A. 07-REQ-010 stays as-is.
**Rationale**: A simulated world is a hypothesis, not reality — multiple simulated worlds could disagree on whether satisfaction holds for the same Drive — so retirement must anchor on the authoritative post-turn-resolution board published by SpacetimeDB.
**Affected requirements/design elements**: None.

*Forward-looking note*: the planned extension to multi-ply (multi-turn-ahead) simulation will need to "shadow satisfy" Drives as part of simulating the Centaur's psychological state through multi-turn imagining of possible futures. A Drive satisfied in a hypothetical future turn would need to be removed from the simulated portfolio for deeper plies while remaining active in the authoritative portfolio that tracks real-world outcomes revealed by SpacetimeDB. This is beyond MVP scope and moot at single-ply depth, where satisfaction in a simulated world only affects the terminal reward contribution to that world's score and does not remove the Drive from the active portfolio.

---

### 07-REVIEW-008: Game-tree-cache clearing and mid-turn fresh boards — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 07-REQ-023 clears the game tree cache at the start of each fresh turn. "Start of turn" here is interpreted as the moment a new authoritative pre-turn board is published to SpacetimeDB subscribers. But between turns the cache is cleared and rebuilt from scratch, which is expensive relative to incremental update. The informal spec §6.6 acknowledges this is a deliberate simplification for the single-ply MVP and notes that multi-ply would retain deeper valid speculation. The question is whether there's a scenario in which the framework receives what it interprets as a "new turn" spuriously — e.g., because of a SpacetimeDB reconnection producing a state snapshot that looks like a new turn but is actually the current turn — and would unnecessarily clear the cache.
**Question**: What is the exact trigger for clearing the cache, framed in terms of observable SpacetimeDB state?
**Options**:
- A: Clear when the turn number observed in SpacetimeDB changes. Robust to reconnects that resurface the current turn, as long as turn number is stable.
- B: Clear when any pre-turn state field changes (board, items, snake lengths). More aggressive; may clear on spurious updates.
- C: Clear on the SpacetimeDB `resolve_turn` reducer emitting its "new turn ready" event ([04]'s exported interfaces). Tightly coupled to [04]'s emission contract but most precise.
**Informal spec reference**: §6.6 (does not specify trigger).

**Decision**: Option A. 07-REQ-023 is amended to explicitly pin the cache clear trigger to a turn-number transition observed in the framework's SpacetimeDB subscription, with explicit reconnect-safety wording ("A SpacetimeDB reconnection that resurfaces the current turn number shall not trigger a clear.").
**Rationale**: At 1-ply depth, at most one of the many simulated worlds remains consistent with the actual turn outcome received from SpacetimeDB. The compute investment lost by clearing the cache each turn is therefore negligible — nearly all cached worlds are invalidated by the real outcome regardless. A future multi-ply extension would retain deeper speculation consistent with the observed outcome, but for single-ply the full reset is the right tradeoff of simplicity over marginal compute savings. Pinning the trigger to turn-number transition (rather than any pre-turn state change or a [04]-internal event) avoids spurious clears on reconnect snapshots while keeping the framework decoupled from [04]'s internal emission contract.
**Affected requirements/design elements**: 07-REQ-023 amended with the turn-number-transition trigger and reconnect-safety wording.

---

### 07-REVIEW-009: Operator-staged moves for manual snakes and the framework's view of them — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 07-REQ-046 says manual-mode snakes are never staged by the framework. But for simulating teammates (07-REVIEW-002 Option A), the framework may need to read teammate staged moves from Convex/Centaur state or from SpacetimeDB. It's unclear in the informal spec where operator-staged moves for manual snakes physically live before SpacetimeDB receives them — is the operator's browser writing to SpacetimeDB directly via its access token (per [03]'s operator game-participant identity) or is the staging brokered through the Snek Centaur Server?

If it's direct-to-SpacetimeDB, the framework reads it from its SpacetimeDB subscription like any other staged move. If it's brokered through the Snek Centaur Server, the framework might have earlier visibility but there's a new API surface to specify. The current draft (07-REQ-034) assumes the framework can observe staged moves for its own team's snakes via some means, without pinning the mechanism.
**Question**: Where are manual-mode operator-staged moves written, and how does the framework observe them?
**Options**:
- A: Operator browsers stage directly to SpacetimeDB via their game-participant access token. The framework observes via SpacetimeDB subscription.
- B: Operator browsers stage via the Snek Centaur Server runtime, which re-stages to SpacetimeDB. The framework observes via its own runtime state and action log.
- C: Dual writes: operator browsers stage directly to SpacetimeDB and also record the action in the Centaur action log ([06-REQ-036]); the framework observes via either path.
**Informal spec reference**: §7.5, §10 ("stage_move" reducer).

**Decision**: Option A. Staged moves are always mediated exclusively by SpacetimeDB — there is no other state storage mechanism for staged moves besides SpacetimeDB. Operator browsers stage moves directly to SpacetimeDB via their game-participant access token ([03]'s operator identity); the bot framework observes these staged moves via its SpacetimeDB subscription ([02-REQ-023]). No new API surface needed.
**Rationale**: Convex never learns of move staging events until it receives the full download of game replay logs from SpacetimeDB for long-term persistence ([02-REQ-022]), so a single-source-of-truth design rooted in SpacetimeDB avoids any cross-store consistency hazard. This is consistent with the staged-move data flow established by [04-REQ-025]/[04-REQ-027] and the exclusion of `move_staged` from the Centaur action log per resolved 06-REVIEW-004.
**Affected requirements/design elements**: 07-REQ-034 updated to make explicit that the framework reads teammate staged moves from its SpacetimeDB subscription.

---

### 07-REVIEW-010: Informal spec filename drift — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: Consistent with 02-REVIEW-001 and 06-REVIEW-007. Requirements in this module were extracted from the informal spec now canonicalised at `informal-spec/team-snek-centaur-platform-spec.md` (previously a versioned filename that did not match the version referenced in `SPEC-INSTRUCTIONS.md`). Resolution is shared with the prior reviews.
**Question**: Confirm the current informal spec is canonical. See 02-REVIEW-001.
**Informal spec reference**: N/A (meta).

**Decision**: Confirmed. The current (unversioned) informal spec is canonical, consistent with 02-REVIEW-001 and 06-REVIEW-007.
**Rationale**: See 02-REVIEW-001 resolution.
**Affected requirements/design elements**: None.

---

### 07-REVIEW-011: Worker message protocol — concrete schema — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Design
**Context**: §2.1 establishes the coordinator-and-simulation-pool architecture and §2.8 describes the `SimulateRequest`/`SimulateResponse` message exchange between them, but the concrete TypeScript message-type definitions, the serialisation strategy (structured-clone vs JSON vs SharedArrayBuffer), and the back-pressure mechanism when the coordinator outpaces the pool are not pinned by this Phase 2 design. These are implementation choices that do not affect the framework's external contract (Drive/Preference authors and downstream consumers see no difference) but they do affect the framework's internal stability and operability.
**Question**: What concrete message protocol and back-pressure strategy should the coordinator–simulation-worker pool use?
**Options**:
- A: Structured-clone via `Worker.postMessage` for both directions; coordinator-side bounded queue per snake; drop oldest on overflow.
- B: SharedArrayBuffer ring-buffer for `GameState` payloads; structured-clone for control messages.
- C: JSON over `MessagePort`; simplest, slowest.

**Informal spec reference**: N/A (implementation detail).
**Resolution direction**: Defer to implementation; pick A as the default starting point because structured-clone handles `GameState` (a deeply nested ReadonlyArray-and-Map structure) without an explicit codec, and a per-snake bounded queue with drop-oldest semantics matches the anytime principle (newer simulations are more relevant than older ones because reactive inputs may have changed in between).

**Decision**: Option A. Structured-clone via `Worker.postMessage` for both directions; per-`(snakeId, direction)` bounded queue on the coordinator side; drop-oldest on overflow.
**Rationale**: Structured-clone handles the framework's `GameState` (a deeply nested ReadonlyArray-and-Map structure) without authoring an explicit codec, eliminating an entire class of serialisation drift. A per-`(snakeId, direction)` bounded queue with drop-oldest semantics aligns with the anytime principle: when reactive inputs (interest map, foreign commitments, weights) change, in-flight simulations against the prior inputs are stale, and the freshest pending simulation is more relevant than older queued ones. Keying the queue at `(snakeId, direction)` rather than per-snake preserves parallel progress across that snake's candidate directions. Options B and C are deferred — SharedArrayBuffer is a measurable optimisation but adds complexity not justified by MVP scope, and JSON is strictly slower with no offsetting benefit.
**Affected requirements/design elements**: §2.1 amended with the structured-clone postMessage protocol and the per-`(snakeId, direction)` bounded queue with drop-oldest back-pressure semantics. No requirement renumbering.

---

### 07-REVIEW-012: Submission-timing parameters — promotion to bot params — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Design
**Context**: §2.13 pins `IMMINENT_THRESHOLD_MS = 50` (half of `SCHEDULED_SUBMISSION_INTERVAL_MS`). The choice is justified analytically (the final pass needs lead time for softmax sample + `stage_move` round-trip + SpacetimeDB ACID resolution), but the actual round-trip latency from a Snek Centaur Server to its team's SpacetimeDB instance has not been measured and may vary by hosting topology (same-region vs cross-region). 50ms is generous for same-region and may be tight for cross-region.
**Question**: Should `IMMINENT_THRESHOLD_MS` remain a fixed framework constant at 50ms, or should it be a per-team configurable bot parameter, or should it be empirically tuned post-MVP?
**Options**:
- A: Keep at 50ms; teams whose hosting topology requires more reduce `automaticTimeAllocationMs` instead (effectively shifting the same lead-time budget into a smaller per-turn compute window). (Current draft.)
- B: Promote to a bot parameter on `global_centaur_params`, similar to `defaultAutomaticTimeAllocationMs`.
- C: Defer to a post-MVP empirical-tuning pass.

**Informal spec reference**: §6.8 (does not specify).
**Resolution direction**: Option A for MVP — chosen because it minimises configurability surface while still allowing teams a coarse-grained workaround. Promotion to a bot parameter (Option B) is a clean follow-up if real-world deployments show 50ms is the wrong default for common hosting topologies.

**Decision**: Option B, **extended to both timing constants**. Both `SCHEDULED_SUBMISSION_INTERVAL_MS` and `IMMINENT_THRESHOLD_MS` are promoted from framework constants to per-team bot parameters on `global_centaur_params` (`defaultScheduledSubmissionIntervalMs`, `defaultImminentThresholdMs`), each mirrored to per-game `game_centaur_state` columns (`scheduledSubmissionIntervalMs`, `imminentThresholdMs`) so per-game overrides flow through the same mechanism as `automaticTimeAllocationMs` (per [06-REQ-040a]). Defaults remain 100 ms and 50 ms respectively to preserve current behaviour.
**Rationale**: Cross-region hosting topologies plausibly need both a tighter scheduled cadence (to amortise serialised round-trip cost) and a wider imminent threshold (to absorb tail latency on the final-pass write). Promoting only one would leave teams without a coherent way to retune the pipeline as a whole; promoting both keeps the two intervals jointly tunable while preserving the analytical relationship documented in §2.13. The mirroring pattern is identical to `automaticTimeAllocationMs`, so [06]'s schema, mutation surface, and `GameCentaurStateView` cascade is mechanical with no new patterns.
**Affected requirements/design elements**: 07-REQ-044 amended (interval read from `game_centaur_state.scheduledSubmissionIntervalMs`), 07-REQ-045 amended (deadline computation reads `game_centaur_state.imminentThresholdMs`), §2.13 amended, §3.5 constants pruned (only `RANK_DECAY` remains). [06] cascade: new `defaultScheduledSubmissionIntervalMs` and `defaultImminentThresholdMs` columns on `global_centaur_params`; new mirrored `scheduledSubmissionIntervalMs` and `imminentThresholdMs` columns on `game_centaur_state`; mutation signatures (`upsertGlobalCentaurParams`, `setGameParamOverrides`, `initializeGameCentaurState`) and `GameCentaurStateView` updated; 06-REQ-040a updated to enumerate the new fields. [02]: no impact.

---

### 07-REVIEW-013: Worst-case world tie-breaking — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: §2.11 specifies that the "worst-case world" for a candidate self-direction is the cached world that achieved the minimum weighted score, and that ties are broken by foreign-tuple lexicographic order. The choice of tie-breaker affects which world is shown in the operator's "worst-case world preview" UI ([08]'s operator interface), which in turn affects the operator's ability to reason about the bot's pessimism. Lexicographic order on the foreign tuple is deterministic but arbitrary — it does not, e.g., prefer the world with the most foreign-snake activity or the world most-recently simulated. An alternative tie-breaker (e.g., "most foreign snakes participating non-trivially in the tie") might be more informative for operators.
**Question**: Should worst-case world tie-breaking be on lexicographic foreign-tuple order, on simulation-arrival order, on most-foreign-snake-activity, or on operator-configurable criteria?
**Options**:
- A: Foreign-tuple lexicographic order (current draft). Deterministic, simple, ignores semantic informativeness.
- B: Most-recently-simulated world. Surfaces the freshest pessimistic world.
- C: Most-foreign-snake-activity. Most informative for operators investigating Drive interactions.
- D: Operator-configurable.

**Informal spec reference**: §6.7 (silent on tie-breaking).
**Resolution direction**: Defer; A is the safe default for MVP.

**Decision**: Option A. Worst-case-world ties are broken by foreign-tuple lexicographic order.
**Rationale**: Determinism is the primary requirement: the operator's "worst-case world preview" must be reproducible across reloads of the same `snake_bot_state` snapshot, which rules out arrival-order tie-breaking (Option B — depends on simulator-pool scheduling and is not reconstructable from the snapshot alone). "Most-foreign-snake-activity" (Option C) requires defining "activity" precisely (head distance moved? body cells overlapping the lattice? something else?) and embeds an operator-UX assumption into core scoring; that assumption is best validated empirically in [08] Phase 2 once the worst-case-world preview is in real operator hands. Operator configurability (Option D) is unjustified MVP surface area for a tie-breaker the operator never directly sees as a tunable. Lex order on the foreign tuple is the simplest deterministic rule that makes the snapshot fully reconstructable.
**Affected requirements/design elements**: §2.11 amended to remove the forward-reference to this REVIEW item and state lex tie-break as the established rule. No requirement renumbering.

---

### 07-REVIEW-014: `WorldAnnotations` shape — extensibility vs commitment — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: §3.4's `WorldAnnotations` interface declares an optional `voronoi` field and an open `otherFrameworkComputed: Record<string, unknown>` escape hatch. The current draft chooses an open shape because the set of useful per-world annotations (Voronoi, food proximity, threat proximity, eligibility-to-collect-potion, etc.) is likely to grow during operator UX iteration in [08], and pinning a closed shape now would force [06]'s `snake_bot_state.annotations` column to a tight schema that requires migration on every new annotation kind. The open escape hatch defers that commitment but sacrifices type-safety end-to-end and complicates [08]'s rendering logic (which must defensively check for keys' existence).
**Question**: Should `WorldAnnotations` be pinned to a closed discriminated union now, kept open as in the current draft, or pinned per-annotation-kind via per-key feature flags?
**Options**:
- A: Keep open (current draft). Defers schema commitment.
- B: Closed discriminated union pinned now. Forces enumeration of all useful annotations upfront.
- C: Per-annotation feature-flag fields with explicit absence vs presence semantics.

**Informal spec reference**: §6.7 (does not enumerate annotations).
**Resolution direction**: Keep A for MVP; revisit during [08] Phase 2 once the operator UI's annotation needs are concrete.

**Decision**: Full excision. The entire annotations system — `WorldAnnotations` interface (§3.4), the per-direction `annotations` field on `SnakeBotStateSnapshot` (§3.4), the `snake_bot_state.annotations` column on [06]'s schema, the per-snake turn-timestamp annotation on `CachedWorld.simulatedState` (§2.15), and the framework's `multiHeadedBfsVoronoi` author utility (§3.6) — is removed from the MVP. 07-REQ-039 no longer references annotations; 07-REQ-065 and 07-REQ-066 are marked removed; 07-REQ-009b's diagnostic violations list moves into a dedicated `snake_bot_state.heuristicViolations` column to preserve the operator-visible scoring-violation surface. A replacement annotations design is deferred to [08] Phase 2 once the operator UI's annotation needs are concrete.
**Rationale**: Keeping the open `WorldAnnotations` shape for MVP (the prior resolution direction) preserves a partially-specified subsystem — Voronoi territory inference depending on a temporal-head-start mechanism in `multiHeadedBfsVoronoi` whose correctness depends on a per-snake turn-timestamp annotation that itself only makes sense for the framework's frozen-foreign-snake fiction — across three modules ([07], [06], [08]) without any operator-driven feedback to validate the design. The `Record<string, unknown>` escape hatch defers schema commitment but, in practice, pushes type-safety failures into [08]'s rendering logic and into `snake_bot_state` consumers that have no way to know which keys are populated. Excising the entire system removes a speculative subsystem with no committed downstream consumer, simplifies [06]'s schema, eliminates a class of cross-module drift, and preserves the only operator-visible signal that materially depends on per-snake structured data (the violations list) by moving it to its own column. Replacement can be designed cleanly once [08]'s operator UI is in real use and the actual annotation needs are observable rather than speculative.
**Affected requirements/design elements**: 07-REQ-009b updated (annotations → heuristicViolations + reference fixed to 06-REQ-026); 07-REQ-032 amended to drop temporal-annotation language; 07-REQ-039 amended to drop the annotations clause and add heuristicViolations; 07-REQ-065 and 07-REQ-066 marked removed. §2.8, §2.11, §2.15, §3.4, §3.6 amended/excised; §3.7 DOWNSTREAM IMPACT notes updated. [06] cascade: `snake_bot_state.annotations` column dropped; new `snake_bot_state.heuristicViolations` column added; `updateSnakeBotState` mutation signature updated; `statemap_updated` action-log variant updated; `GameCentaurStateView` updated; 06-REQ-011 and 06-REQ-026 text updated. [02]: no impact. [08]: replacement annotations design deferred to Phase 2.

**Second follow-up amendment** (per user direction, applied during the same task pass): the original Decision's excision of "the per-snake turn-timestamp annotation on `CachedWorld.simulatedState`" was an overreach. The user's directive that motivated 07-REVIEW-014 was to remove the poorly-specified `WorldAnnotations` open-shape record (and its `multiHeadedBfsVoronoi` consumer); it did **not** authorise removing the per-snake turn timestamp itself, which is independently load-bearing for the partial-board-state concept — the entire justification for partially advancing board states in the framework's depth-1 simulation depends on consumers being able to compensate for which snakes have and have not been freshly advanced. 07-REQ-065 and 07-REQ-066 are restored, renamed away from "annotation" terminology to avoid confusion with the still-excised `WorldAnnotations` concept (`perSnakeTurnTimestamp` field on `SimulatedWorldSnapshot`). 07-REQ-066 is restated as a normative obligation on whichever consumer chooses to perform board-analysis (whether the framework, `@team-snek/heuristics`, or author-supplied Drive/Preference code) — the framework still does not ship the `multiHeadedBfsVoronoi` utility itself, only the data substrate. Cascading further amendments: [07] §2.15 restored (renamed "Per-Snake Turn Timestamp on Simulated Boards"); [07] §7.14 restored (renamed accordingly); [07] §3.4 `SimulatedWorldSnapshot` interface gains `perSnakeTurnTimestamp: Record<SnakeId, number>` field; [07] §2.8 / §2.11 prose notes updated; [07] 07-REQ-032 / 07-REQ-039 amendment notes extended; [07] §3.7 [08] worst-case world rendering DOWNSTREAM IMPACT note restored (frozen-foreign visual treatment guidance reinstated). [06] cascade: **none** — the per-snake turn timestamp travels through `snake_bot_state.worstCaseWorlds`'s `v.any()` payload to Convex without any schema change. [02]: no impact. [08]: the worst-case world preview should respect the per-snake turn timestamp when rendering frozen foreign snakes; exact visual treatment is an [08] design decision.

**Follow-up amendment** (per user direction, applied during the same task pass): the operator-visible scoring-violation surface is **not** a Convex column. The `snake_bot_state.heuristicViolations` column introduced above is excised, the `HeuristicViolation` exported type and the `heuristicViolations` field on `SnakeBotStateSnapshot` (§3.4) are excised, and 07-REQ-009b is rewritten so that contract violations from author-supplied scoring functions are surfaced exclusively by **logging a structured error to the Snek Centaur Server's process log** (still deduplicated per-turn per `(snakeId, heuristicId, violationKind)` to avoid log flooding). Rationale: the violations surface is purely diagnostic — heuristic authors are server operators who already consume their own server logs, and there is no operator-UI feature in the MVP that consumes the violations list, so persisting it through Convex (with all the schema-evolution and replay-fidelity costs that entails) buys no operator value. The framework substitution behaviour (07-REQ-009a steps 1–3) is unchanged; only step 4 changes from "record event" to "log error". Cascading further amendments: [07] §2.8 (the wrapping guard's step (d) reads "logs a structured error" rather than "records a `HeuristicViolation` annotation"); [07] §2.11 (`updateSnakeBotState` call site no longer carries `heuristicViolations`); [07] §3.4 prose and types updated; [07] §3.7 DOWNSTREAM IMPACT note for [06] schema narrowing updated. [06] cascade: `snake_bot_state.heuristicViolations` column dropped from §2.1.3 schema and §2.1.3 narrative; `updateSnakeBotState` signature drops `heuristicViolations` (§2.2.4 and §3.3); `statemap_updated` action-log variant in §2.4 and §3.1 drops `heuristicViolations`; `GameCentaurStateView` (§3.4) drops `heuristicViolations`; 06-REQ-026's "snake-level deduplicated per-turn list of contract violations …" bullet is removed; 06-REQ-035 / 06-REQ-036 narrative references to "heuristic-violations list" / "heuristic violations" are removed. [08]: no operator-UI surface needs to consume violations — they are server-log-only.

---

### 07-REVIEW-015: Workspace-package boundary for the shared `HEURISTIC_REGISTRY` module — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Design
**Context**: 08-REVIEW-021's user-directed resolution pins the registry-sharing **mechanism** as build-time-shared (a TypeScript module imported by both the framework runtime and the SvelteKit frontend); §2.3, §2.18, §3.7's [08] notes, and [08]'s 08-REVIEW-021 resolution all assume that mechanism and are not revisited here. What 08-REVIEW-021 does not pin is the **packaging boundary** of that shared module within the monorepo — specifically whether `HEURISTIC_REGISTRY` and the heuristic implementations live in (a) a dedicated workspace package (e.g., `@team-snek/heuristics`) imported by both the Snek Centaur Server ([02-REQ-004]) and [08]'s SvelteKit app, (b) a sub-path export of the existing Snek Centaur Server package, or (c) a SvelteKit-app-internal module re-exported into the framework via a relative path. All three options realise the build-time-shared mechanism and discharge 08-REVIEW-021 identically; they differ only in repository layout and dependency direction. The choice affects [02]'s package graph and [09]'s monorepo-layout requirements.
**Question**: Which packaging boundary should host the shared `HEURISTIC_REGISTRY` module?
**Options**:
- A: Dedicated workspace package `@team-snek/heuristics` depended on by both the Snek Centaur Server package and the [08] SvelteKit app. Cleanest dependency direction; one rebuild target.
- B: Sub-path export of the Snek Centaur Server package (`@team-snek/centaur-server/heuristics`) consumed by [08]. Avoids a new package, but couples [08]'s frontend dependency graph to the server package.
- C: Module owned by [08]'s SvelteKit app and re-exported into the framework. Inverts the natural dependency direction and is recorded for completeness only.

**Informal spec reference**: §6.4 (does not specify mechanism); 08-REVIEW-021 resolution (pins build-time-shared but not packaging boundary).
**Status**: Open. Does **not** reopen 08-REVIEW-021's mechanism choice. To be resolved during [09] platform-UI Phase 2 when the monorepo layout is finalised. None of the three options change Phase 2's design contracts in [07] or [08].

**Decision**: Option A. The shared `HEURISTIC_REGISTRY` module lives in a dedicated workspace package `@team-snek/heuristics`, depended on by both the Snek Centaur Server package and [08]'s SvelteKit app.
**Rationale**: Option B (sub-path export of the Snek Centaur Server package) would couple [08]'s frontend dependency closure to server-internal modules — a transitive coupling that subverts the framework/server/frontend module boundary [02] is at pains to keep clean and that would surface in [08]'s bundler graph. Option C inverts the natural dependency direction (frontend owning a module the server imports) and is structurally awkward. Option A produces the cleanest dependency direction (`@team-snek/heuristics` ← server, `@team-snek/heuristics` ← frontend; no edge between server and frontend induced by heuristics), gives a single rebuild target on heuristic edits, and matches the package-graph pattern already implied by `@team-snek/bot-framework` (a base package depended on by both runtimes). Resolving this now rather than waiting for [09] removes a cross-module ambiguity that already affects [07] §2.3 and [08]'s registry-consumption notes; [09]'s monorepo-layout work then inherits a fixed package boundary instead of a TBD.
**Affected requirements/design elements**: §2.3 amended to host the registry in `@team-snek/heuristics`; §3.7 DOWNSTREAM IMPACT notes updated to reflect [08] depending on `@team-snek/heuristics` rather than transitively on the Snek Centaur Server. [02] §2.16 / §2.16a cascade: `@team-snek/heuristics` added to the monorepo topology with the package-graph note. No requirement renumbering.
