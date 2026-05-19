# Module 04 — STDB Engine: Decision Log

Resolved REVIEW items from [`specs/04-stdb-engine.md`](../04-stdb-engine.md). See [`SPEC-INSTRUCTIONS.md`](../../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 04-REVIEW-001: Scheduled reducer for clock expiry as an architectural commitment — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec (§10, `resolve_turn` bullet) mentions that turn resolution is "also triggered by clock expiry (scheduled reducer at max turn time as a fallback)". This sounds like an implementation detail — a scheduled reducer is a SpacetimeDB-specific mechanism. 04-REQ-032 abstracts this to "the runtime shall autonomously detect when a CentaurTeam's per-turn clock has reached zero... and treat that event as an implicit turn-over declaration". Whether this is correctly abstract-or-binding depends on whether alternative clock-expiry mechanisms (polling, push-from-Convex, wall-clock events on reducer entry) are acceptable substitutes.
**Question**: Is "scheduled reducer" an architectural commitment that requirements should encode, or an implementation choice left to Phase 2 design?
**Options**:
- A: Keep 04-REQ-032 abstract — runtime detects clock expiry by any suitable mechanism; specifics are Design. (Current draft.)
- B: Strengthen to require an internally scheduled mechanism (no external triggering of clock-expiry fallback), so that Convex cannot be in the loop for clock-expiry detection even as a fallback. This would preserve [04-REQ-068]'s "no external systems during gameplay" invariant more crisply.
**Informal spec reference**: §10, `resolve_turn` bullet.

**Decision**: Option A — keep 04-REQ-032 abstract; clock-expiry detection mechanism is a Phase 2 concern.
**Rationale**: [04-REQ-068]'s "no external systems during gameplay" invariant already binds the runtime to internal-only triggering of clock expiry (Convex cannot be consulted during gameplay), so Option B's stricter wording adds no constraint that isn't already present. If a future change weakens [04-REQ-068], this decision should be revisited.
**Affected requirements/design elements**: None — 04-REQ-032 stands as drafted.

---

### 04-REVIEW-002: `stagedBy` sentinel for fallback-determined moves — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 04-REQ-040 requires movement events to distinguish fallback-determined moves (where no player or Centaur Server staged a move for a snake, and [01-REQ-042]'s fallback rule applied) from staged moves. The informal spec's turn event schema (§14) defines `snake_moved` with a mandatory `stagedBy: Identity` field, which leaves no room for "no staged move was consumed". Possible resolutions: (a) make `stagedBy` nullable in the event schema and use null for fallback; (b) use a distinguished "runtime fallback" sentinel Identity value; (c) split the event into two distinct event kinds. The current draft punts to design ("the distinction shall be explicit in the event record") but the representation affects the closed event set of 04-REQ-043.
**Question**: Which representation should the closed event set use?
**Options**:
- A: `stagedBy` becomes nullable (null = fallback).
- B: A distinguished sentinel value is reserved and documented.
- C: Split `snake_moved` into `snake_moved_staged` and `snake_moved_fallback` as two event kinds in the closed set.
**Informal spec reference**: §14, `snake_moved` event.

**Decision**: Option A — `stagedBy` is nullable and null denotes a fallback-determined move.
**Rationale**: Simplest of the three and does not inflate the closed event set. Option B (sentinel Identity) leaks a magic value into a field whose type semantics are meant to be opaque per [03-REQ-032]. Option C doubles the movement event kind with no information gain. Assumes fallback is the only case in which a movement event has no staging writer; if a future rule change introduces additional null-stagedBy cases (e.g., runtime-initiated forced moves), the decision still holds but the set of null-meanings should be re-surveyed.
**Affected requirements/design elements**: 04-REQ-040 rewritten to make nullable-with-null-for-fallback explicit. 04-REQ-043(a) annotated to note the nullable typing of `stagedBy` in movement events.

---

### 04-REVIEW-003: Completeness of the closed event set — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 04-REQ-043 enumerates the closed event set as (a) movement, (b) death, (c) severing, (d) food consumption, (e) potion collection, (f) food spawning, (g) potion spawning, (h) effect application, (i) effect cancellation. This mirrors informal spec §14 closely but differs in one way: §14 does not include an explicit "severing" event kind — it folds severing into `snake_severed` as a combat event — which the current draft also uses, so that matches. However, §14 also lacks an event for **hazard damage applied to a snake that survives the hazard** (i.e., Phase 5b without Phase 5d death). Under the current draft, a snake that enters a hazard cell, loses health, and survives the turn produces no dedicated event — a replay client would have to diff health between turns to detect hazard application. This is acceptable for pure visualisation (hazard cells are visible terrain; the snake's health change is visible in its state snapshot) but blocks downstream analytics that would want an explicit hazard-damage event. Also missing: an event for the `ateLastTurn`-driven growth retention in Phase 2 (the growth bit is folded into the `snake_moved.grew` flag, which is sufficient if the growth/movement timing is well-understood by clients).
**Question**: Is the closed event set complete for the Team Snek ruleset, or should additional event kinds be added (e.g., `hazard_damage`, explicit `starvation_tick`)?
**Options**:
- A: Keep the event set as drafted (matches informal spec §14); rely on state-snapshot diffing for Phase 5 health changes. (Current draft.)
- B: Add `hazard_damage` as a tenth event kind, emitted for each surviving snake that took hazard damage in Phase 5b. Starvation deaths are already covered by the death event (b).
- C: Add both `hazard_damage` and `health_tick` events for completeness, at the cost of event volume.
**Informal spec reference**: §14.

**Decision**: Option B — add `hazard_damage` as a tenth event kind `(j)` in 04-REQ-043, emitted for each surviving snake that took hazard damage in Phase 5b.
**Rationale**: Option A was in tension with 04-REQ-044 ("event records shall not require the client to diff successive snake-state snapshots to recover information that the event describes"). Hazard damage to a surviving snake is exactly the kind of state change whose signal would otherwise be carried only by a snapshot diff. Option B also unlocks downstream analytics. Option C is rejected as gratuitous event-volume overhead — starvation is already carried by the death event (b) with cause `starvation`, and a per-turn `health_tick` event would be redundant with per-turn snake state.
**Affected requirements/design elements**: 04-REQ-043 extended with entry `(j) Hazard damage`. Informal spec §14's closed set is now superseded by [04-REQ-043] on this point. **Downstream impact**: when [08]'s replay viewer consumes the closed event set, it must include hazard_damage in its renderers.

---

### 04-REVIEW-004: Intra-phase event ordering determinism — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 04-REQ-045 requires events within a turn to be "totally ordered... reflects the phase order and, within a phase, a deterministic intra-phase ordering derivable from the turn seed". The turn seed is well-defined by [01-REQ-060]. But within a phase, multiple snakes may produce events (e.g., three snakes all eat food in Phase 5). The order in which those events are written affects replay bit-exactness for tooling that compares event streams. The informal spec does not specify intra-phase ordering rules. Possibilities include: (a) snake ID order; (b) turn-seed-shuffled order; (c) the order in which the pipeline's internal iteration happens to process snakes (implementation-defined). Committing to a specific rule at the requirements level affects what tests can assert.
**Question**: What intra-phase ordering rule should requirements commit to?
**Options**:
- A: Snake ID ascending — simple, deterministic, debuggable.
- B: Turn-seed-shuffled — avoids a systematic bias where low-ID snakes are always "first" in event streams.
- C: Implementation-defined — only determinism across replays is required, not a specific order. (This is what 04-REQ-045 currently implies.)
**Informal spec reference**: §14, no explicit ordering rule.

**Decision**: Option A — ascending snake identifier for snake-subject events; ascending item identifier for item-spawn events (food/potion spawning), which follow all snake-subject events within the same phase.
**Rationale**: Simplest, most debuggable, and requires no seed-derived ordering logic. Option B's concern about "low-ID snakes always appearing first" is cosmetic — event streams are not a fairness mechanism and clients that care about fairness are reading game state, not event ordering. Option C would leave the ordering unspecified enough that two conforming implementations could produce bit-different event streams for the same game seed, which defeats the purpose of 04-REQ-069's determinism commitment for cross-implementation test comparison. This decision assumes snake identifiers are stable per game (they are, per [01] Phase 2 typing). If a future change introduces multi-subject events or subject-less events beyond item spawns, the ordering rule will need extension.
**Affected requirements/design elements**: 04-REQ-045 rewritten to make the ascending-snake-ID rule explicit and to specify the fallback for events without a snake subject.

---

### 04-REVIEW-005: Replay-export authorisation mechanism — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 04-REQ-062 says the replay-export client is "authenticated as the Convex platform runtime" and defers the mechanism to [03] / [05]. [03]'s current draft (Sections 3.3 and 3.4) covers Centaur Server credentials and SpacetimeDB access tokens for gameplay, but does not specify how Convex authenticates *itself* to the SpacetimeDB instance for privileged operations like initialisation (04-REQ-013) or replay export (04-REQ-061). The informal spec §10 mentions "validates admin token embedded at deploy time" for `initialize_game`. This is a cross-module gap: does the privileged Convex-to-runtime authentication use a separate admin token seeded at deploy time, SpacetimeDB module-owner credentials, or yet another mechanism?
**Question**: Where should the privileged Convex-to-SpacetimeDB authentication mechanism be specified?
**Options**:
- A: In [03] as a new requirement section — privileged Convex-to-runtime auth is an identity/credential concern.
- B: In [04] as a new requirement section — the runtime's privileged operations are its own concern.
- C: In [05] as part of orchestration — Convex is the initiator and owns the mechanism.
**Informal spec reference**: §10 "validates admin token embedded at deploy time"; §9.4 step 4.

**Decision**: Option A — [03] owns the requirement. A single new requirement in [03] is sufficient; beyond-best-practice security detail is out of scope for Phase 1.
**Rationale**: [03] is already the module that owns every other credential in the system, so placing this there keeps credential semantics in one place. Only unusual credential situations (e.g., Centaur Servers without their own Google auth) warrant extensive requirements-level elaboration; Convex-to-SpacetimeDB is a standard platform-to-platform authentication situation that best-practice affordances of each platform can handle, so the requirement just needs to state that the capability exists.
**Affected requirements/design elements**: Added as [03-REQ-048] in a new subsection §3.9 "Convex Access to the SpacetimeDB Runtime". Cross-references to [03-REQ-048] added to [04-REQ-013] (privileged initialisation), [04-REQ-061] (end-of-game historical record retrieval), [04-REQ-061a] (game-end notification subscription), and [04-REQ-062] (replay-export authentication). [05-REQ-032] and [05-REQ-040] may likewise reference [03-REQ-048] when [05] is next touched; not done as part of this resolution because those edits are out of scope for module 04.

---

### 04-REVIEW-006: Game-end detection granularity (turn commit vs Phase 10 completion) — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 04-REQ-060 says game-end treatment applies "after a win condition has been detected in Phase 10". Phase 10 is inside the atomic turn-resolution transaction (04-REQ-037). So in practice, game-end detection happens as part of the same transaction that commits the final turn's state. The runtime then needs to transition into "no more turns" mode *after* the commit. The current wording is not explicit about whether game-end rejection of gameplay operations begins immediately on the commit or whether there is a short tail-end window. This matters for edge cases like a staged move arriving concurrent with the final turn's commit.
**Question**: Should the transition to game-ended state be explicitly tied to the commit point of the win-detecting turn, and should in-flight operations arriving during or after commit be explicitly specified?
**Options**:
- A: Game-end rejection begins at the moment the final turn's transaction commits. In-flight staged moves that arrive after commit are rejected as "game over". (Implied by current draft.)
- B: Make this explicit in the requirements — add a clause to 04-REQ-060 stating the commit boundary.
**Informal spec reference**: §5 Phase 10; §9.4 step 7.

**Decision**: Option A — game-end rejection begins at the moment the final turn's transaction commits. In-flight operations arriving after commit are rejected as "game over."
**Rationale**: The commit of the win-detecting turn is a natural and unambiguous boundary. SpacetimeDB's ACID transaction model means Phase 10's win-condition detection and the state update are part of the same atomic commit. Once that commit is visible, the game is over. There is no meaningful grace window to define — any operation arriving after the commit point is operating on a game that has already ended. This is already implied by the draft but has been made explicit in 04-REQ-060 with commit-boundary language.
**Affected requirements/design elements**: 04-REQ-060 updated with explicit commit-boundary language: "Game-end rejection begins at the moment the final turn's transaction commits. In-flight staged moves or turn-declaration operations arriving after the commit of turn `T_end` shall be rejected as 'game over' — there is no grace window between commit and enforcement."

---

### 04-REVIEW-007: Historical record size and retention semantics during long games — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 04-REQ-004 requires the historical record to support reconstruction of any past turn in the game. For a game with `maxTurns = 1000`, this could imply a large working set held inside a SpacetimeDB instance. The informal spec does not address retention bounds or memory pressure. Two sub-questions: (a) is unbounded historical retention part of the runtime's contract, or is there an implicit cap? (b) if the runtime has a cap, do clients lose the ability to scrub to very early turns?
**Question**: Does the runtime commit to unbounded in-game historical retention, and if so, is this a performance concern that Phase 2 design should address?
**Options**:
- A: Unbounded retention for the full life of the game, regardless of duration. Performance is Phase 2's concern.
- B: Retention bounded by configuration; early turns evicted from live queries but still present in the eventual replay export.
- C: Retention unbounded for replay-export purposes but optionally windowed for live subscription queries.
**Informal spec reference**: §10.

**Decision**: Option A — unbounded retention for the full life of the game instance.
**Rationale**: Resolved after reading [05] Phase 1 draft. Instance lifetime is bounded by [05-REQ-037] (teardown occurs only after [05-REQ-040] has read the complete append-only game record and persisted it to Convex), and replay viewing never consults the runtime after teardown per [05-REQ-044]. [05] commits Convex to reading the full record in one pass at game end; a runtime-side retention cap (Option B) would break that commitment. Option C's subscription-windowing is a Phase 2 optimisation, not a requirements-level concern. Post-teardown retention is Convex's concern, not this module's. If a future change to [05] adopts streaming/incremental replay export rather than a single end-of-game read, this decision should be revisited.
**Affected requirements/design elements**: None — 04-REQ-004 stands as drafted.

---

### 04-REVIEW-008: Initialisation failure surfacing — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 04-REQ-017 requires the runtime to fail initialisation if board generation is infeasible per [01-REQ-061], and to surface the cause in a form Convex can relay to the room owner. The concrete form of that surfacing — error code, structured object, exception kind — is a Phase 2 concern. But requirements should at least say whether the surface is a synchronous error on the initialisation call or an asynchronous state that Convex polls for.
**Question**: Should the initialisation operation signal failure synchronously to its caller or leave the instance in an observable failure state that the caller reads back?
**Options**:
- A: Synchronous failure return — the privileged initialisation operation returns a failure outcome to Convex directly.
- B: Asynchronous — Convex writes an initialisation request, the runtime processes it, and a readback endpoint exposes success/failure.
- C: Hybrid — synchronous for quick-to-detect failures (e.g., obviously invalid config), asynchronous for board-generation retries that may take non-trivial time.
**Informal spec reference**: §9.4 step 4; §10 `initialize_game`.

**Decision**: Option A — synchronous failure return from the STDB init reducer to Convex, with architectural elaboration on scope.
**Rationale**: Under the updated architecture, board generation has moved entirely to Convex (see [02] §2.14 and updated 04-REQ-017). STDB no longer calls `generateBoardAndInitialState()` and does not perform bounded-retry feasibility logic. The `initialize_game` reducer receives a pre-computed initial game state from Convex and writes it to tables. The only failure mode remaining on the STDB side is structural validation of the received payload (correct dimensions, valid cell types, consistent snake count, etc.). A malformed payload indicates a coding error in Convex's board-generation or serialisation logic, not a user-facing configuration problem. This validation is fast and deterministic, making synchronous failure the natural and only reasonable choice. The primary user-facing failure path — board-generation infeasibility for a given configuration — is handled entirely by the Convex mutation that runs `generateBoardAndInitialState()`, which surfaces structured errors reactively to the web client during config mode, before any STDB instance is provisioned.
**Affected requirements/design elements**: 04-REQ-017 rewritten: STDB does not generate boards; the init reducer writes received state and validates structural integrity, rejecting malformed payloads synchronously as a coding-error exception. 04-REQ-013 rewritten: accepts a fully specified initial game state plus dynamic gameplay parameters, not a game seed or full `GameConfig`. Cross-reference: [05-REQ-032] updated to reflect Convex generating the board and passing the result to STDB.

---

### 04-REVIEW-009: Turn event ordering guarantees during subscription delivery — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: 04-REQ-056 says that all new state produced by a turn commit is delivered as a "single logical update". 04-REQ-045 requires events within a turn to be totally ordered. These together imply clients observe events in the specified total order, but the requirement does not explicitly assert that the *delivery order* to clients matches the *emission order*. Subscription systems sometimes deliver rows in storage order, which may not match emission order. For replay and animation correctness, clients need the guarantee that event order as observed matches event order as emitted.
**Question**: Should the module explicitly require subscription delivery to preserve emission order for turn events within a single turn?
**Proposed requirement**: "Subscribed clients shall receive turn events for a given turn in the order specified by 04-REQ-045. Delivery order shall match emission order."
**Informal spec reference**: §10 client query patterns; §14.

**Decision**: No new delivery-order requirement. A turn's events form a *set* — there are no causal or temporal dependencies between events within a turn; they are all produced atomically. The total ordering defined by 04-REQ-045 is a **canonical representation order** for storage and replay consistency, not an expression of causal sequence. The canonical order sorts events by: (1) phase, (2) event-type class within a phase, (3) ascending snake identifier within each event-type class (ascending item identifier for non-snake-subject events). Turn resolution does not depend on the temporal order in which events are received by the server within a turn. Because the canonical order is a property of the stored representation (not of delivery), clients that need deterministic replay ordering shall read from the stored record in canonical order; they shall not rely on subscription delivery order. No guarantee about subscription delivery order is added. 04-REQ-045 has been amended to make the set-based, event-type-class, and canonical-order distinctions explicit.

---

### 04-REVIEW-010: Scope of "data layer" visibility filter (RLS vs view) — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 04-REQ-047 requires visibility filtering "at the data layer" — i.e., not relying on cooperating clients. In SpacetimeDB this maps directly to Row Level Security (RLS) rules. But the requirement is deliberately phrased in abstract terms so it does not name RLS. A concern: if a future deployment uses a different storage substrate that does not support per-row filtering natively, is "data layer" the right abstraction, or should the requirement say "server-side filtering applied before delivery to a client"?
**Question**: Is "data layer" filtering the right abstraction, or should it be restated in terms of "server-side filtering applied to query results before delivery"?
**Options**:
- A: Keep "data layer" — it encompasses RLS and any future equivalent. (Current draft.)
- B: Restate as "server-side, pre-delivery" — decouples from substrate entirely.
**Informal spec reference**: §2 "SpacetimeDB (Game Runtime)"; §10.

**Decision**: Option A — keep "data layer" as the abstraction. It encompasses RLS and any future equivalent mechanism. No requirement text changes needed.

---

### 04-REVIEW-011: Interaction between `centaur_team_permissions` retention and STDB disconnect semantics — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 04-REQ-020 and 04-REQ-021 require the participant attribution record to persist for the full game lifetime, including across reconnections. SpacetimeDB connections have their own lifecycle — an Identity may be reused or may be per-connection. The requirement correctly abstracts away from this by saying "each connection identifier that has successfully registered" gets its own attribution entry, and closing a connection does not delete its entry. But this creates a subtle invariant: the runtime must treat connection identifiers as immutable historical facts even after the connection is gone. If SpacetimeDB's connection-identity semantics differ from this assumption (e.g., Identity is global and persistent across reconnections for the same client), the requirement is overspecified. If it's per-connection-ephemeral, the requirement is correct but Phase 2 needs to be careful.
**Question**: Does SpacetimeDB's Identity semantics match the requirement's assumption (per-connection, potentially reused across reconnects for the same client, but immutable once associated with a historical row)? This is a factual question about SpacetimeDB's platform behaviour that needs verification before Phase 2.
**Options**:
- A: Assume per-connection Identity (current draft); verify in Phase 2 and adjust if wrong.
- B: Verify now and restate if SpacetimeDB semantics are different.
**Informal spec reference**: §10 `register`; [03-REQ-044].

**Decision**: The unresolved question about SpacetimeDB Identity semantics is rendered moot by a higher-level architectural decision. Module 01 defines an `Agent` discriminated union (`{kind: 'centaur_team', centaurTeamId}` | `{kind: 'operator', operatorUserId}`) as the module-local concept for event attribution (per resolved 01-REVIEW-011). The SpacetimeDB connection Identity is now resolved to an `Agent` value **at connection time** (in the `client_connected` lifecycle callback, when JWT `sub` claim contents are available), not deferred to replay-export time. Consequently:
- `stagedBy` fields stored in STDB carry `Agent | null`, not opaque Identity.
- The participant attribution record (04-REQ-020) maps each connection to its resolved `Agent` at connection time via `client_connected`.
- 04-REQ-039's "no-interpretation" constraint has been rewritten: the runtime does perform the Identity→Agent mapping, but solely at connection time from JWT claims; no further interpretation occurs during turn resolution or replay export.
- 04-REQ-061 no longer requires a resolution step at replay-export time; exported records already contain `Agent` values.
- Module 03 requirements (03-REQ-032, 03-REQ-044, 03-REQ-045) and the 03-REVIEW-005 RESOLVED block have been updated accordingly.

**Affected requirements**: 04-REQ-020, 04-REQ-021, 04-REQ-026, 04-REQ-038(c), 04-REQ-039, 04-REQ-040, 04-REQ-061; cascading to 03-REQ-032, 03-REQ-044, 03-REQ-045, 03-REVIEW-005.

---

### 04-REVIEW-012: Visibility of turn-0 initial food placements to opposing CentaurTeams — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: Initial food items are placed during initialisation per [01-REQ-017] and recorded with spawn turn 0 per 04-REQ-007. Visibility filtering (Section 4.9) filters *snake* state, not item state. But an opponent CentaurTeam observing initial food placements could, in principle, infer the approximate locations of enemy starting positions (since initial food is one-per-snake placed among eligible cells). Whether this is a visibility-filter concern depends on whether starting-position information is considered private.
**Question**: Is there any expectation that initial snake positions are hidden from opponents before turn 0 observations begin? If so, initial food placements may need to be filtered too; if not (i.e., all CentaurTeams see all starting positions from turn 0 onward as a matter of game design), no additional requirement is needed.
**Options**:
- A: Starting positions and initial food are fully public from turn 0; no additional filtering. (Current draft assumption.)
- B: Starting positions are private until each CentaurTeam's snakes become visible through their own actions — would require additional filtering.
**Informal spec reference**: §4.4, §4.5; no explicit statement.

**Decision**: Option A — starting positions and initial food are fully public from turn 0; no additional filtering needed.
**Rationale**: Snakes are always visible on turn 0, so there is no pre-game-start window during which enemy positions are hidden. Initial food placement is random among eligible cells, so observing those placements reveals negligible positional information about enemy snakes. The game design treats starting state as public; there is no stated expectation of positional privacy at turn 0.
**Affected requirements/design elements**: None — 04-REQ-047's visibility-filtering scope stands as drafted (snake state only, not item state).

---

### 04-REVIEW-013: Game-seed accessibility and deterministic-replay testability — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 04-REQ-069 requires the runtime to be deterministic with respect to seeded randomness. [01-REQ-059] says the per-game seed "shall not be accessible to any game client". The combination creates tension for deterministic-replay testing: if the seed is inaccessible to clients, how can a test harness verify the game log is reproducible from the seed? One answer: determinism is a property of the runtime that is verified via privileged (non-client) channels; clients don't need the seed. This is consistent with [01-REQ-059] but leaves 04-REQ-069 untestable by ordinary integration tests.
**Question**: Should the per-game seed be accessible to the privileged replay-export client (04-REQ-061) so that a replay export can be verified for determinism downstream? This would be a narrow relaxation of [01-REQ-059] for privileged callers only.
**Options**:
- A: Seed remains inaccessible to all callers including replay export. Determinism is a runtime property verified by internal tests only.
- B: Seed is part of the replay export payload. Downstream systems (replay viewer, test harness) can use it to verify reproducibility and to re-derive any per-turn randomness outputs.
- C: Seed is exposed only to the privileged replay-export call, not to any gameplay client.
**Informal spec reference**: §4.4; §10.

**Decision**: Option B — the game seed is included in the replay-export payload (04-REQ-061) so that downstream systems (Convex replay storage, test harnesses) can verify deterministic reproducibility.
**Rationale**: The seed must be exported to Convex to become part of the persisted replay data. [01-REQ-059]'s constraint that the seed "shall not be accessible to any game client" is about preventing Centaur Servers from accessing the seed *during gameplay* — which would allow them to predict item spawns and gain an unfair advantage — not about preventing the seed from appearing in post-game replay data held by the privileged platform. The replay-export caller is authenticated per [03-REQ-048] and is therefore not a "game client" in the sense of [01-REQ-059]. Including the seed in the export is the only way to make 04-REQ-069's determinism guarantee externally verifiable.
**Affected requirements/design elements**: 04-REQ-061 amended to explicitly include the per-game seed in the enumerated contents of the complete historical record.

---

### 04-REVIEW-014: Final submission pass semantics inside SpacetimeDB — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: Informal spec §6.8 describes a "final submission" by the Centaur Server bot framework "immediately before the turn deadline flushes all dirty automatic-mode snakes." That final submission happens in the Centaur Server, not in SpacetimeDB, and it stages moves via 04-REQ-024. From 04's perspective, the final submission is just a burst of staged moves arriving shortly before `declare_turn_over`. No additional requirement should be needed on the SpacetimeDB side, but I want to flag this to confirm no hidden coordination requirement exists (e.g., a "final submission barrier" reducer) that would need a home in 04.
**Question**: Is the "final submission pass" entirely a Centaur Server concern, with no runtime-side coordination, or does the runtime need an explicit requirement for handling a pre-declaration burst of staged moves?
**Options**:
- A: Entirely a Centaur Server concern; no additional 04 requirement needed. (Current draft assumption.)
- B: Add a requirement that the runtime accepts staged moves up to the instant of `declare_turn_over`, and that turn resolution consumes whatever was staged at that instant (already implied by 04-REQ-038(a)).
**Informal spec reference**: §6.8.

**Decision**: Option A — the "final submission pass" is entirely a Centaur Server concern; no additional 04 requirement is needed.
**Rationale**: From 04's perspective, the final submission is an ordinary burst of staged-move writes arriving via 04-REQ-024 before `declare_turn_over`. 04-REQ-038(a) already requires turn resolution to consume whatever was staged at the instant of declaration, so the runtime's behaviour is already fully specified. No runtime-side coordination barrier or dedicated reducer is required; the ordering is entirely the Centaur Server's responsibility.
**Affected requirements/design elements**: None — 04-REQ-024 and 04-REQ-038(a) stand as drafted.

---

### 04-REVIEW-015: Provenance of the per-instance admission-ticket validation secret — **RESOLVED (obsolete)**

**Type**: Gap (raised 2026-04-10 on reading [05] Phase 1 draft)
**Phase**: Requirements
**Original context**: This review item asked whether 04 should add an explicit requirement for accepting the per-instance HMAC admission-ticket validation secret as an init-time parameter.
**Resolution**: The OIDC auth redesign eliminates per-instance signing secrets entirely. Client authentication is now handled by SpacetimeDB's built-in OIDC JWT validation against the Convex platform's public key (see [03] §3.17). The `initialize_game` reducer receives the game's unique identifier (for `aud` claim validation in `client_connected`) and the participating-CentaurTeam roster, but no signing secret. This review item is therefore obsolete — the question it raised no longer applies.

---

### 04-REVIEW-016: Admission-ticket validation secret confidentiality on the runtime side — **RESOLVED (obsolete)**

**Type**: Proposed Addition (raised 2026-04-10 on reading [05] Phase 1 draft)
**Phase**: Requirements
**Original context**: This review item proposed a negative requirement that the per-instance HMAC secret not be exposed via any subscription, query, or replay export.
**Resolution**: The OIDC auth redesign eliminates per-instance secrets entirely. No signing secret is stored in the runtime — JWT signature validation is performed by SpacetimeDB's built-in OIDC mechanism using the platform's public key fetched via JWKS. The confidentiality concern that motivated this review item no longer exists.

---

### 04-REVIEW-017: Symmetric cross-runtime isolation invariant — **RESOLVED**

**Type**: Proposed Addition (raised 2026-04-10 on reading [06] Phase 1 draft)
**Phase**: Requirements
**Context**: [06-REQ-045] and [06-REQ-046] assert, from the Centaur-state side, that SpacetimeDB does not read from or write to Centaur state and that Centaur state does not expose any affordance for writing to STDB-owned state. These negatives are consistent with [02]'s topology but are currently only stated in [06]. 04 has a broader "no external consultation during gameplay" invariant ([04-REQ-068], which I should double-check), but no explicit symmetric negative about not consulting Convex (platform or Centaur) at all. Adding the symmetric negative on the 04 side would make the boundary belt-and-braces and would prevent a Phase 2 designer from, say, reaching into Convex during turn resolution to read a bot parameter.
**Question**: Is [04-REQ-068] (or whichever 04 requirement most closely covers this) sufficient, or should a dedicated negative requirement name Convex explicitly and cite [06-REQ-045/046]?
**Options**:
- A: Rely on [04-REQ-068]'s general "no external systems during gameplay" invariant; no new requirement needed.
- B: Add an explicit 04 requirement mirroring [06-REQ-045/046]: the runtime shall not read from or write to Convex during gameplay; the sole permitted runtime↔Convex interactions are (i) init-time parameter delivery per [05-REQ-032] and (ii) end-of-game replay export per [05-REQ-040] / 04-REQ-061.
- C: Same as B but also explicitly carve out the Convex-driven teardown signal (if any is needed — depends on how game-end detection lands per 04-REVIEW-006).
**Informal spec reference**: §2 (topology); [06-REQ-045], [06-REQ-046].

**Decision**: Option A — rely on [04-REQ-068]'s existing "no external systems during gameplay" invariant; no dedicated negative requirement naming Convex is needed.
**Rationale**: [04-REQ-068] already prohibits the runtime from consulting "any external system (Convex, Centaur Server, or other) during gameplay" — Convex is explicitly named in the requirement text, so the symmetric isolation concern is already covered on the 04 side. The negatives in [06-REQ-045] and [06-REQ-046] are consistent with and complementary to this invariant; restating them in 04 would be redundant rather than additive. If a future change weakens [04-REQ-068], the isolation concern should be revisited at that point.
**Affected requirements/design elements**: None — [04-REQ-068] stands as drafted.

---

### 04-REVIEW-018: SpacetimeDB TypeScript SDK RLS capabilities — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: Section 2.9 (RLS) describes filtering semantics across multiple tables: `snake_states` rows filtered by the querying connection's CentaurTeam and the snake's visibility, `staged_moves` rows restricted to the owning CentaurTeam, and `centaur_team_permissions` blocked from client access entirely. The `snake_states` and `staged_moves` predicates require cross-referencing the querying connection's CentaurTeam (from `centaur_team_permissions`) against the row's CentaurTeam. SpacetimeDB's TypeScript module SDK may or may not support declarative RLS predicates with this level of expressiveness. If RLS predicates are limited (e.g., no cross-table lookups, no connection-context-aware predicates), the filtering must be implemented via alternative mechanisms such as filtered subscription queries, per-CentaurTeam materialized views, or application-level middleware.
**Question**: Does SpacetimeDB's TypeScript SDK support declarative RLS with cross-table predicate lookup (reading `centaur_team_permissions` to determine the querying connection's CentaurTeam) and per-connection filtering context? If not, what alternative mechanism should be used?
**Options**:
- A: Declarative RLS predicates with cross-table lookups (ideal, if supported).
- B: Filtered subscription queries where each client subscribes with a CentaurTeam-specific WHERE clause, and the server enforces that clients can only subscribe to queries appropriate for their CentaurTeam.
- C: Application-level middleware that intercepts query results and applies the filtering logic before delivery.
**Informal spec reference**: §10 (schema), [02-REQ-010].

**Decision**: None of the original options. SpacetimeDB 2.0 offers **Views** as the officially recommended replacement for declarative RLS (`clientVisibilityFilter`). Views are server-side functions defined in TypeScript that clients subscribe to like tables. Two `ViewContext` views (`snake_states_view`, `staged_moves_view`) implement per-connection visibility filtering using the **`ctx.from` query-builder path**, while `centaur_team_permissions` is made a private table invisible to all client subscriptions.
**Rationale**: SpacetimeDB's declarative `clientVisibilityFilter` (Option A) exists but is marked experimental/unstable, has a known bug with subscription joins (GitHub #2810), and SpacetimeDB docs explicitly recommend Views over RLS. Option B (filtered subscription queries) would leak the responsibility for correct filtering to the client, violating 04-REQ-047's "data layer" enforcement. Option C (application-level middleware) has no clean integration point in SpacetimeDB's architecture. Views provide full programmatic control in TypeScript with `ctx.sender` for identity-dependent filtering — satisfying all filtering requirements without relying on unstable APIs. The `ctx.from` query-builder path is chosen over the `ctx.db` procedural path because `ctx.from` emits SQL that is structurally compatible with SpacetimeDB's planned incremental view maintenance (IVM) infrastructure, enabling future identity-partitioned materialization. Both paths currently re-execute on dependent-table changes, but `ctx.from` is the forward-compatible choice. With the expected subscriber count (2–6 teams), performance is adequate either way; btree indexes on `centaur_team_permissions.identity`, `snake_states.centaurTeamId`, `snake_states.visible`, and `staged_moves.snakeId` ensure efficient query execution.
**Affected requirements/design elements**: Section 2.9 rewritten from "Visibility Filtering (RLS) Design" to "Visibility Filtering via SpacetimeDB Views." Section 2.11 replay-export bypass updated from "RLS bypass" to "Visibility filtering bypass" referencing module-owner access to private tables and raw tables behind views. Section 2.12 updated to note that clients subscribe to view names for filtered tables. Section 3.5 obligation 6 updated to reference visibility Views. No requirements changed — 04-REQ-047 through 04-REQ-052 and 04-REQ-055 are mechanism-agnostic and satisfied by the View implementation as-is.

---

### 04-REVIEW-019: SpacetimeDB TypeScript module HTTP and JWT capabilities — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Resolution**: Option A confirmed viable via SpacetimeDB **Procedures** (beta), which support outgoing HTTP via `ctx.http.fetch()`. However, in-module JWT signing is replaced with a Convex-pre-signed callback token to keep Convex as the sole credential issuer (03-REQ-037) and avoid crypto operations in the WASM runtime. The `notify_game_end` scheduled procedure uses `ctx.http.fetch()` for the POST and presents the Convex-signed game-outcome callback token as a Bearer header. The procedure also reads all replay tables and bundles the complete historical record into the notification payload (see §2.11), enabling Convex to tear down the instance immediately upon receipt. No crypto operations in the WASM runtime. See rewritten §2.10 and §2.11.
**Decision summary**: Reducers cannot make HTTP calls, but Procedures can. The game-end notification is implemented as a scheduled procedure (`notify_game_end`) triggered via the `game_end_notification_schedule` schedule table. Authentication uses a Convex-signed JWT (game-outcome callback token) provisioned at init time, not an in-module-constructed JWT. The procedure bundles the complete replay data into the notification payload. *(Amended per 05-REVIEW-015 resolution.)*

---

### 04-REVIEW-020: Spectator/operator scoreboard view — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: 08-REVIEW-018 (resolved) pins the principle that client UIs render team-level aggregate quantities (team score, alive-snake count, aggregate length) as delivered by purpose-built SpacetimeDB views and never reconstruct them client-side from raw per-snake subscription data. This is necessary so that invisibility (per [04-REQ-047]) cannot leak through omitted client-side contributions and so that score authority is single-sourced server-side. [08-REQ-084] (amended) now requires that the spectator scoreboard be sourced from a dedicated SpacetimeDB scoreboard view; [08-REQ-084b] (added, negative) forbids client-side aggregation. [04] Phase 2 §2.9 (visibility filtering / RLS) and §2.12 (subscription patterns) currently do not specify a `scoreboard_view`. This item exists so the gap is not lost.
**Question**: Add a per-game `scoreboard_view` (or equivalent) to the [04] design that publishes per-team aggregates `(teamId, teamScore, aliveSnakeCount, aggregateLength)` computed server-side over the true alive-snake set (including invisible snakes), subscribable by spectator and operator clients alike, and exposing only the aggregates — never per-snake state for invisible snakes.
**Informal spec reference**: N/A (downstream impact from 08-REVIEW-018).

**Decision**: Add a materialised per-turn `scoreboard` table written transactionally inside `resolve_turn` (and at `initialize_game` for turn 0), exposed to all connections via a trivial unfiltered `scoreboard_view` (`SELECT * FROM scoreboard`, no `ctx.sender` predicate). Row shape `(turn, centaurTeamId, teamScore, aliveSnakeCount, aggregateLength)`, primary key `(turn, centaurTeamId)`, btree index on `(turn)`. One row is written per CentaurTeam in the game's roster per turn — including zero-filled rows for teams with no alive snakes — and the aggregate is computed over the *true* alive-snake set including invisible snakes per [04-REQ-047]. The previously-implicit `previousTurnScores` denormalisation is retired: [01-REQ-055]'s simultaneous-elimination tiebreak reads prior-turn scores from `scoreboard WHERE turn = T - 1`. Replay export (§2.10, §2.11, §3.3 `ReplayData`) bundles the `scoreboard` table alongside the other historical tables. The visibility-bypass posture is pinned by a new invariant 04-REQ-071 in §4.13.

**Rationale**: The View capability surface §2.9 commits to is filter / projection only on the IVM-compatible `ctx.from` query-builder path; `GROUP BY` and aggregate functions over `snake_states` cannot be expressed there. The alternative `ctx.db` procedural path supports arbitrary aggregation but forfeits the IVM-compatibility posture §2.9 has explicitly chosen against, since it re-executes the full view body on every dependent-table change. Materialising the per-team aggregate inside `resolve_turn` costs `O(snakes)` once per turn — the alive-snake set is already in hand at the end of Phase 10 — and reduces the subscription channel to the kind of filtered projection the chosen `ctx.from` view surface handles natively. Single-sourcing the row at write time also keeps score authority unambiguous: the row a spectator subscribes to is exactly the row the resolving transaction wrote, with no derivation step downstream. Publishing `teamScore` and `aggregateLength` as separate columns (despite their being equal under [01-REQ-053] today) is a wire-shape concession to a possible future score-modifying bonus in [01]; this REVIEW item does not introduce one.

**Affected requirements/design elements**: New requirement 04-REQ-071 (§4.13). Design additions: `scoreboard` table (§2.1.2); turn-0 scoreboard write in `initialize_game` step 4 (§2.2); per-turn scoreboard write as Step 6b of `resolve_turn` (§2.7); prior-turn-score read narrative in §2.7; `scoreboard_view` definition and aggregation-at-write-time rationale in §2.9.1; index entries in §2.9.2; subscription bullets in §2.12.1, §2.12.2, §2.12.4, plus the §2.12.4 closing negative on client-side aggregation; replay-bundling additions in §2.10 and §2.11; `ReplayData.scoreboard` in §3.3. Cross-module: Module 08 §2.14's spectator-subscription bullet updated to align row-shape spelling (`centaurTeamId`) with this module; 08-REQ-084 / 08-REQ-084b remain unchanged in substance — the row shape and the channel name they reference now exist.

---

### 04-REVIEW-021: Decouple `teamScore` from `aggregateLength` in `ScoreboardRow` — **RESOLVED**

**Type**: Amendment (cascade from 01-REVIEW-018)
**Phase**: Design

**Prior text**: 04-REVIEW-020 introduced the materialised per-turn `scoreboard` table with `teamScore` and `aggregateLength` as separate columns, even though they were equal under the then-current [01-REQ-053] (integer body-length sum). 04-REVIEW-020's rationale framed the separation as "a wire-shape concession to a possible future score-modifying bonus in [01]" and explicitly noted "this REVIEW item does not introduce one." The §2.7 prior-turn read for the simultaneous-elimination branch was originally described as a score-based tiebreak reading from the prior `scoreboard` row.

**Amendment**: The two columns are now load-bearing distinct, per the resolution of 01-REVIEW-018. `teamScore` in every `scoreboard` row carries the normalised score computed as if the game ended at that turn boundary: `(aggregateLength(t) / totalAliveSegments) × competingTeams.length`, where `totalAliveSegments` sums `aggregateLength` across all competing (non-forfeited) teams at that turn. The live `scoreboard_view` subscription therefore publishes the live normalised score every turn. `aggregateLength` continues to be written from the raw alive-snake body-length aggregate computed inside `resolve_turn` and is unchanged structurally; it now functions as a secondary display statistic rather than as `teamScore`'s twin. The §2.7 prior-turn read for the simultaneous-elimination branch now reads `aliveSnakeCount` (not `teamScore`) from the prior `scoreboard` row — to determine which teams were alive at the start of the final turn — because the sim-elim outcome is a flat `1.0` per alive team and not a proportional tiebreak.

**Rationale**: Publishing the live normalised `teamScore` every turn is strictly more informative than publishing the raw body-length sum and lets clients and the live UI display "current score if game ended now" without any client-side computation. Keeping `aggregateLength` as a separate column preserves the observable body-length stat that operators and spectators use to assess board position. Reading `aliveSnakeCount` rather than `teamScore` for the sim-elim branch is correct because the sim-elim rule bypasses the proportional formula entirely.

**Informal spec reference**: N/A (cascade from [01]'s amended scoring rule).

**Affected requirements/design elements**: `ScoreboardRow` interface in §2.1.2 (comment updated); turn-0 scoreboard write in §2.2 (normalised `teamScore` formula added); Step 6b in §2.7 (two-pass: compute `aggregateLength`, then compute `teamScore` from the cross-team sum); prior-turn read narrative in §2.7 (now reads `aliveSnakeCount`, not `teamScore`); `GameEndNotification` `GameOutcome` prose in §3.3 (scores described as real-valued).


### 04-REVIEW-022: Self-hosted STDB on Fly.io with scale-to-zero and pre-provisioning warm-up — **RESOLVED**

**Type**: Amendment
**Phase**: Design

**Prior text**: Module 04 referred to a "self-hosted SpacetimeDB management API" in the [04-REQ-061a] design context and in §3.4 step 4 ("Submitted to the self-hosted SpacetimeDB management API ... to create a new database instance with the module already deployed") without naming the hosting target, the scale-to-zero hosting model, or any pre-provisioning warm-up signal. The implicit prior assumption was that the host was continuously available, so the only documented Convex-to-host interaction was the per-game `POST /v1/database` provisioning call authenticated under [03-REQ-048].

**Amendment**: The self-hosted SpacetimeDB host is deployed on Fly.io under a scale-to-zero hosting model that suspends the host between Battle Bunker sessions to bound idle cost. To hide the cold-start cost that scale-to-zero introduces on the per-game `POST /v1/database` call, the host exposes a dedicated warm-up endpoint (new [04-REQ-072], §2.13, §3.6) that Convex calls ahead of provisioning on the schedule of the matching [05-REQ-074]. The warm-up endpoint uses a static shared-secret token (`STDB_WARMUP_TOKEN`) rather than the per-instance management JWT, because its only effect is to resume the host process and the bounded blast radius does not justify the heavier auth surface.

**Rationale**: SpacetimeDB Maincloud does not support authorising Convex to provision new databases on demand against a third-party-managed host, so the platform must run its own SpacetimeDB host. Fly.io's scale-to-zero behaviour keeps idle cost bounded between sessions but moves the cold-start cost onto the synchronous game-launch path; the warm-up signal is the cheapest way to amortise that cost ahead of game launch without committing the host to always-on operation. Naming Fly.io in design text only (not in the requirement) keeps requirements implementation-neutral while letting operations docs ground the hosting target concretely. See cross-module counterpart [05-REVIEW-019].

**Informal spec reference**: N/A (operational hosting decision; not in the informal spec).

**Affected requirements/design elements**: [04-REQ-072] (new), §2.13 (new warm-up endpoint design), §3.6 (new exported warm-up endpoint contract). The §3.4 step 4 / §2.10 references to the self-hosted management API consumed by Convex now read against the Fly.io-hosted scale-to-zero host without requirement-text changes (the prose was already implementation-neutral).
