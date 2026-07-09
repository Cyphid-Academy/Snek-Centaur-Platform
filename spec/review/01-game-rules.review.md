# Module 01 — Game Rules: Decision Log

Resolved REVIEW items from [`specs/01-game-rules.md`](../01-game-rules.md). See [`SPEC-INSTRUCTIONS.md`](../../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 01-REVIEW-001: Phase 4 invuln-debuff cancellation rule redundancy — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: Phase 4 lists two distinct bullets: (1) "if a snake with frozen invulnerabilityLevel < 0 dies in Phase 3, schedule cancellation of all invuln_buffs on its alive teammates" and (2) "if a potion collector suffers any interaction in Phase 3, schedule cancellation of that potion's effects." Since invuln_debuff is only acquired by collecting an InvulnPotion, any snake with an active invuln_debuff is necessarily an active potion collector. A vulnerable snake dying in Phase 3 satisfies both rules simultaneously — rule (1) schedules ally invuln_buff cancellation, and rule (2) schedules the same plus removal of the collector's own debuff. The requirements originally captured both rules faithfully, but the human resolution confirmed that the collector's own debuff should also be removed. This means rule (1) is fully subsumed by rule (2) for the death case.
**Question**: Is rule (1) intentionally belt-and-suspenders, or does it exist to cover a case where invuln_debuff can exist without the holder being an active collector (e.g., via a future mechanic or edge case in current rules)?
**Options**:
- A: Rule (1) is redundant; requirements collapse both rules to 01-REQ-031 alone.
- B: Rule (1) is intentionally separate and both rules are stated for clarity.
**Informal spec reference**: Section 5, Phase 4.

**Decision**: Option A (collapse).
**Rationale**: In the current rule set, `invuln_debuff` is only acquired by collecting an InvulnPotion, so "vulnerable snake dies in Phase 3" is a strict subset of "active collector suffers an interaction in Phase 3". Rule (1) adds no behavioural content that 01-REQ-031 via 01-REQ-045 doesn't already schedule. Collapsing reduces the number of places the intent is duplicated, which limits drift risk. **Revisit if**: a future rule change introduces a source of `invuln_debuff` not mediated by InvulnPotion collection — at that point the separate buff-cancellation rule would need to be reinstated.
**Affected requirements**: 01-REQ-045 (revised to schedule only via 01-REQ-031).

---

### 01-REVIEW-002: Body segments of Phase-3-dying snakes as collision targets — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: Phase 3 evaluates all collisions simultaneously after Phase 2 movement. A snake dying from a wall collision or self-collision still has body segments at their Phase-2 positions at the moment of evaluation. The spec did not originally state whether another snake's head colliding with those segments in the same Phase 3 pass constitutes a valid body collision (01-REQ-044c).
**Question**: Do body segments of snakes that are simultaneously dying in Phase 3 from wall or self-collision count as valid collision targets for other snakes in the same Phase 3 evaluation?
**Options**:
- A: Yes — all body segments are present during the simultaneous Phase 3 evaluation regardless of what else is killing their owner.
- B: No — wall/self-collision deaths remove the snake from body-collision consideration before other snakes' collisions are checked (implying a sub-ordering within Phase 3).
**Informal spec reference**: Section 5, Phase 3.

**Decision**: Option A.
**Rationale**: "Simultaneously" admits no sub-ordering. Introducing an implicit ordering (wall/self deaths applied first) would contradict the plain reading and create a hidden precedence that needs its own justification. 01-REQ-044 now explicitly states the simultaneity semantics so a future reader can't unintentionally reintroduce the sub-ordering.
**Clarifying example (to carry into Phase 2 design)**: Snake A moves into a Wall cell in Phase 2; Snake A dies (01-REQ-044a). Simultaneously, Snake B's head moves into a non-head body segment of Snake A. Because Phase 3 is evaluated against the single post-Phase-2 board state, Snake B experiences a body collision against Snake A's body per 01-REQ-044c, resolved using `invulnerabilityLevel(B)` and `invulnerabilityLevel(A)` computed from their start-of-turn `activeEffects`. If B's level > A's level, B severs A's tail-ward segments (irrelevant to A since A is already dying) and B survives; otherwise B also dies. A's wall death is not a precondition that prevents B's body-collision outcome.
**Affected requirements**: 01-REQ-044 (added explicit simultaneity clarification).

---

### 01-REVIEW-003: Effect duration semantics (`expiryTurn` interpretation) — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: Effects have a "3 turn duration" and an `expiryTurn` field. Phase 9 removes "all effects whose expiry turn has been reached." If a potion is collected on turn T, its effects start next turn (T+1). "3 turns duration" presumably means the effect is active on turns T+1, T+2, T+3. The requirements use "3-turn duration" without committing to an `expiryTurn` value, deferring to Design.
**Question**: Is `expiryTurn` the last turn on which the effect is active (removed in Phase 9 of turn T+4), the turn on which it is removed (removed in Phase 9 of turn T+3, active for T+1 and T+2 only), or something else?
**Options**:
- A: `expiryTurn = T + 4`; Phase 9 removes when `currentTurn >= expiryTurn`; effect active on T+1, T+2, T+3.
- B: `expiryTurn = T + 3`; Phase 9 removes when `currentTurn >= expiryTurn`; effect active on T+1, T+2 only (2 turns).
- C: `expiryTurn = T + 3`; Phase 9 removes when `currentTurn > expiryTurn`; effect active on T+1, T+2, T+3 (3 turns).
**Informal spec reference**: Sections 4.3, 4.4, Phase 9.

**Decision**: Custom resolution — closest to Option A in effect but with a different sentinel value. `expiryTurn` stores the *last turn on which the effect is active*. For a potion collected on turn T, effects activate at the start of T+1 (via the pendingEffects→activeEffects transition in Phase 9 of T and the frozen-state snapshot at start of T+1), `expiryTurn = T + 3`, and Phase 9 removes the effect on turn T+3 itself with the condition `currentTurn >= expiryTurn`. The effect is active on T+1, T+2, T+3.
**Rationale**: Original Option B's "2 turns active" interpretation was wrong: Phase 9's removal only affects *subsequent* turns' start-of-turn frozen state, because the current turn's frozen state was captured at start-of-turn before Phase 9 runs. So removing at Phase 9 of T+3 leaves T+3 fully in-scope for the effect and correctly excludes T+4 onward. The agent's initial lean toward Option A was an over-complication — the field name "expiryTurn" reads most naturally as "last active turn", and that interpretation composes correctly under the effect-immutability rule (01-REQ-033) without the T+4 sentinel. **Revisit if**: the effect-immutability rule (Phase 9 after frozen-state consumption) is ever changed, in which case the removal condition's interaction with active turns would need re-derivation.
**Affected requirements/design**: None yet in Phase 1 requirements — the sentinel value and removal condition will be encoded in the Phase 2 (Design) section of this module.

---

### 01-REVIEW-004: Dual-collector cancellation scope — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 01-REQ-029 (now retired) explicitly permitted a snake to be an active collector for both potion types simultaneously (one InvulnPotion and one InvisPotion, neither yet cancelled). 01-REQ-031 specified that when an active collector suffers any interaction, "the collector's own `invuln_debuff` and/or `invis_collector` effects shall be removed (for each type held), and all alive teammates' corresponding `invuln_buff` and/or `invis_buff` effects shall be removed." A literal reading is that one interaction burns both potion stacks at once. The informal spec (Section 4.8) uses the singular phrase "that potion's effect", which reads as though the authors were only picturing the single-collector case. The two readings diverge in behaviour when a dual collector suffers one interaction: either both stacks are cancelled, or only the stack causally associated with the triggering interaction is cancelled (and identifying which stack that is, for an interaction like eating food or taking hazard damage, is itself ill-defined).
**Question**: When a dual-collector suffers a single interaction during turn resolution, is it (a) both potion stacks that are cancelled, or (b) only one stack (and if so, which)?
**Options**:
- A: Both stacks are cancelled unconditionally. Simpler; consistent with treating "interaction" as a single atomic event rather than a potion-specific event. Dual-collector states are rare enough that the edge case simplicity wins.
- B: Only the stack of the same potion type as the interaction, where an analysis of the interaction picks a specific type — e.g., eating food cancels nothing potion-specific (but then which stack?); collecting a new InvulnPotion cancels the Invuln stack; collecting a new InvisPotion cancels the Invis stack; death cancels both. This requires defining a mapping from interaction kind to affected stack(s), which adds rule surface.
- C: Only one stack, chosen by a rule like "the most recently collected". Low complexity but arbitrary and likely to produce surprising game states.
**Informal spec reference**: Section 4.8.

**Decision**: Option A — a single disruption cancels every potion-collector stack the snake holds, regardless of type or quantity.
**Rationale**: Simplest rule. Treats a disruption as a single atomic event affecting the snake as a whole rather than trying to causally attribute it to a specific potion stack. Option B would require defining a mapping from disruption kind to affected potion type, which has no natural basis (hazard damage and starvation are potion-agnostic). Option C is arbitrary and would produce surprising game states. Under 01-REVIEW-005's resolution, stacking becomes unbounded, so Option A also has the clean property of "one disruption = lose everything" — strategically this makes disruption-avoidance the dominant consideration for stacked collectors, which is consistent with the thematic "concentration breaks all at once" reading.
**Affected requirements**: 01-REQ-031 (now explicitly states "every stack of every type"). 01-REVIEW-005's resolution renamed "interaction" to "disruption" throughout; that rename is recorded there.

---

### 01-REVIEW-005: Re-collection cross-contamination of unrelated potion stack — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 01-REQ-032 (now retired) specified that collecting potion type P while already holding an active collector status for P cancels the earlier P-stack before scheduling the new P-stack. Independently, per the original 01-REQ-030(g), any potion collection was an interaction, so if the collector also held an active stack of a different type Q, 01-REQ-031 implied Q was also cancelled by the interaction. Whether the Q-stack was cancelled when re-collecting P depended on the resolution of 01-REVIEW-004.
**Question**: If a snake holds active collector stacks for both InvulnPotion and InvisPotion, and collects a *new* InvulnPotion, does the InvisPotion stack get cancelled as a side effect of the collection being an interaction?
**Options**:
- A: Yes — cancelled via 01-REQ-031 because collection is an interaction. Consistent with "both stacks cancelled on any interaction" (01-REVIEW-004 Option A).
- B: No — only the P-stack re-collected is cancelled (per the retired 01-REQ-032), and cross-type cancellation is explicitly suppressed for re-collection interactions. Requires carving out an exception to 01-REQ-031.
**Informal spec reference**: Section 4.8; Phase 6.

**Decision**: Neither A nor B as originally framed. The question is resolved by a deeper change: item collection (both food and potions) is *removed* from the class of events that cancel potion effects, and the class itself is renamed from "interaction" to **disruption**. Re-collecting a potion type the snake already holds simply adds another independent stack of pending effects, with no cancellation of any prior stack, same-type or cross-type.
**Rationale**: The original framing assumed item collection had to remain in the class. Dropping that premise is strictly simpler and opens a design space the original rules didn't support: a snake can accumulate multiple stacks of either potion type, becoming (for example) an extra-vulnerable collector with extra-invulnerable teammates, or a collector of both potion types simultaneously making teammates both invulnerable *and* invisible. Under the new rules, stacked potion effects on a team can only be built up via repeated voluntary collection, because 01-REQ-031 strips the entire collector stack on any disruption. Food consumption also loses its disruption status — eating food now grows and heals the snake with no effect on potion state, which is more intuitive.

The rename from "interaction" to "disruption" reflects the narrower class: violent or damaging events that break the collector's concentration on the potion's magic. "Interaction" was too broad and generic; "disruption" reads naturally across severing, being severed, receiving body collisions, entering hazards, and death from any cause. Item collection is voluntary and non-violent, so it falls outside the disruption class by design.

**Revisit if**: gameplay testing shows stacking produces degenerate strategies (e.g., one team farms potions to stack `invis_buff` indefinitely and becomes uncatchable). A cap on stacks per type, or a diminishing-returns formula, would be natural counter-balances to add without reintroducing cancellation-on-collect.

**Affected requirements**:
- 01-REQ-025: stripped the "eating food is an interaction" clause.
- 01-REQ-026, 01-REQ-027: stripped "collecting a potion is an interaction"; added explicit stacking language.
- 01-REQ-028: rewritten to define "active potion collector" as holding *one or more* stacks of either type; stacking unbounded.
- 01-REQ-029: retired (subsumed by new 01-REQ-028).
- 01-REQ-030: renamed concept from "interaction" to "disruption"; removed (f) eating food and (g) item collection from the closed set; added explicit note that item collection is *not* a disruption.
- 01-REQ-031: renamed; clarified that *all* stacks of *both* types are cancelled on any disruption (per 01-REVIEW-004).
- 01-REQ-032: retired.
- 01-REQ-033: renamed "interaction" → "disruption".
- 01-REQ-044: cross-reference to resolved 01-REVIEW-002 added.
- 01-REQ-045: renamed "interaction" → "disruption".
- 01-REQ-046b: renamed.
- 01-REQ-046c: stripped "eating food is an interaction"; clarified that hazard entry on the same cell remains a disruption.
- 01-REQ-046d: renamed; simplified (the "vulnerable snake dying triggers ally buff cancellation" branch is subsumed by "active collector suffers a disruption", per resolved 01-REVIEW-001).
- 01-REQ-047: simplified — re-collection no longer branches on existing stacks; potion collection is never a disruption.

---

### 01-REVIEW-006: Phase 1 turn-0 fallback direction — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: The informal spec (Section 5, Phase 1) said on turn 0 with no staged move the snake moves "to the first available non-lethal adjacent cell, using deterministic tie-breaking by priority: Up → Right → Down → Left." The informal spec was silent on what happens if *all four* adjacent cells are lethal. 01-REQ-042(c) as originally drafted resolved this by adding a final unconditional "else Up" clause. This was a silent addition during Phase 1 extraction, surfaced here rather than resolved in-place.
**Question**: Should the Phase 1 fallback include a final unconditional direction when all four adjacent cells are lethal, and if so, what?
**Argument for keeping "else Up"**: Phase 1 must produce a direction for every alive snake. Without a final fallback, the rule is incomplete on the edge case. The edge case should be unreachable under normal configurations given wall-border + territory-constrained placement, but a defensive fallback removes an undefined behaviour class from the spec. "Else Up" is the deterministic default consistent with the priority order and causes an immediate wall death in Phase 3, which is a well-defined outcome.
**Argument against**: Adding content not in the informal spec is scope creep; we should instead treat "all four lethal" as an invariant violation and specify that game configuration must guarantee it's unreachable.
**Informal spec reference**: Section 5, Phase 1.

**Decision**: Replace the informal spec's deterministic Up → Right → Down → Left + defensive "else Up" scheme entirely. On turn 0, a snake with no staged move chooses its direction **uniformly at random from {Up, Right, Down, Left}** using the turn seed (01-REQ-060). The random choice is not constrained to non-lethal cells; if it happens to pick a wall or self-collision direction, the snake dies in Phase 3, same as any other fatal move. From turn 1 onward, the fallback remains "continue in `lastDirection`" as already specified.
**Rationale**: The informal spec's statement of intent is treated as a draft under the newly clarified precedence in SPEC-INSTRUCTIONS.md — the formal module is free to diverge with human approval, which this decision is. Random choice is strictly simpler than the deterministic priority scheme, eliminates the "all four lethal" edge case cleanly (randomness is total over the four directions regardless of lethality), and introduces a small element of unpredictability on turn 0 that feels more natural than a priority bias toward Up. Dropping the non-lethality filter removes a special case and keeps Phase 1 purely concerned with *choosing* a direction, leaving death determination to Phase 3 where it belongs. The turn seed is the natural randomness source because Phase 1 is a turn-resolution operation (01-REQ-060 governs turn-resolution randomness).
**Affected requirements**: 01-REQ-042 (rewritten).
**Meta note**: This resolution prompted the clarification in SPEC-INSTRUCTIONS.md that completed formal module content supersedes the informal spec wherever it covers the same ground, while the informal spec remains authoritative for anything not yet formally captured. The informal spec is a draft statement of intent, not a binding rulebook.

---

### 01-REVIEW-007: Parity × territory feasibility (gap) — RESOLVED

**Type**: Gap
**Phase**: Requirements
**Context**: 01-REQ-014 assigns inner cells to team territories by angular-sector overlap. 01-REQ-015 places each snake's starting head on a non-Wall, non-Hazard inner cell within its team's territory. 01-REQ-016 requires all starting heads across all teams to share the same parity (`(x + y) mod 2`), with the parity value chosen randomly. No requirement currently guarantees that every team's territory contains enough eligible cells of the chosen parity to seat `snakesPerTeam` heads. On small boards with many teams, high hazard percentage, and unlucky angular offset, a given team's territory could contain zero eligible cells of a particular parity.
**Question**: How should game setup handle configurations where the parity choice + territory assignment + hazard placement combine to produce insufficient eligible cells for some team?
**Options**:
- A: Deterministic retry: constrain the parity choice to parities for which every team's territory contains ≥ `snakesPerTeam` eligible cells; if no parity satisfies, regenerate the angular offset (and/or hazard layout) using the next random value from the game seed and retry.
- B: Reject the game configuration at provisioning time as infeasible; surface the failure to the room host with guidance to change parameters.
- C: Ordered resolution: generate hazards, assign territories, enumerate parity feasibility, pick parity; if infeasible, fall back to a hazard regeneration step. (Essentially A with explicit ordering spelled out.)
**Informal spec reference**: Section 4.4.

**Decision**: Hybrid of A and B with a bounded retry budget. Board generation (the full sequence from hazard placement through initial food placement) is treated as a single atomic attempt. On failure, the entire generation sequence is retried under a fresh deterministic sub-seed derived from the game seed plus an attempt counter. Up to 3 retries are performed (4 attempts total). If all attempts fail, the game is reported infeasible with a machine-readable error and left in an unplayable state; the room owner must modify game configuration and re-provision. Codified as new requirement **01-REQ-061**.

**Rationale**:
- Rejecting immediately (pure B) is hostile to the common case: a single unlucky angular offset or hazard layout under otherwise-fine settings should self-heal without operator intervention.
- Unbounded retry (pure A) risks silent infinite loops on genuinely infeasible configurations (e.g., hazard percentage so high that no valid layout exists for the given team/snake counts). A bounded budget forces the failure mode to surface promptly.
- Retrying the whole generation sequence (rather than selectively regenerating individual phases) is simpler and avoids having to reason about partial state consistency across failed sub-phases. The cost is a handful of extra random draws per retry, which is negligible at setup time.
- Failing into an unplayable-but-reconfigurable state (rather than destroying the room) preserves the room owner's context and lets them iterate on configuration until a feasible combination is found.
- "Up to 3 retries" was interpreted as 3 retries beyond the initial attempt (4 attempts total). If the intended reading was "3 attempts total", this should be flagged and 01-REQ-061 adjusted.
- The sub-seed derivation mechanism is deferred to the design phase; the requirement only constrains that each attempt's seed be deterministically derivable from the game seed plus attempt index, so the full sequence of attempts is reproducible from the game seed alone.
- The failure conditions enumerated in 01-REQ-061 (hazard connectivity + per-team parity feasibility) are the two currently-known ways board generation can fail. If future requirements introduce additional generation constraints, 01-REQ-061's failure-condition list should be extended accordingly.

**Affected requirements**: 01-REQ-061 (new).

---

### 01-REVIEW-008: Snake growth never explicitly required (proposed addition) — RESOLVED

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: Neither 01-REQ-025 (food consumption) nor 01-REQ-046c (Phase 5 food consumption) states that the snake grows by one segment. Growth is implicit via 01-REQ-043's "if `ateLastTurn` is true, the tail segment is retained", which causes the next Phase 2 movement to preserve the tail. Functionally this is correct, but growth-as-observable-behaviour is not captured as a direct testable requirement. A future editor modifying Phase 2's tail-handling logic could break growth without failing any requirement's literal wording.
**Question**: Should growth be captured as an explicit requirement independent of the `ateLastTurn` mechanism?
**Proposed requirement**: "A snake that consumes food in Phase 5 shall have its body length increase by exactly one segment on its next Phase 2 movement, unless the snake has died in the intervening period."
**Informal spec reference**: Section 4.3.

**Decision**: Add an explicit growth requirement framed in terms of observable length change on the turn *after* consumption. Codified as **01-REQ-062**: if a snake consumes food on turn T and is alive at the start of turn T+1, its length at the end of T+1's Phase 2 shall be exactly one greater than its length at the end of T's Phase 2. The existing `ateLastTurn` / tail-retention mechanism in 01-REQ-043 is explicitly identified as the implementation mechanism satisfying 01-REQ-062, not as a competing requirement.

**Rationale**:
- Observable-behaviour requirements should live alongside the implementation-mechanism requirements that satisfy them, not be inferred from them. This protects against silent regressions where a future edit to 01-REQ-043's tail-handling logic breaks growth without tripping any literal requirement.
- Framing in terms of "turn T+1's Phase 2" rather than "the next Phase 2 movement" is unambiguous under the turn pipeline: it specifies both *when* the growth is observable and that it's tied to exactly one Phase-2 movement after consumption (no double-counting across multiple consumptions of food in close succession — each food event is a distinct obligation on the next turn's movement).
- The "still alive at the start of turn T+1" guard covers the edge case where a snake eats in Phase 5 of turn T but dies before its Phase 2 on turn T+1 (e.g., a collision where it was going to die regardless). Dead snakes don't have a length to grow.
- Phrasing in terms of end-of-Phase-2 length comparison (rather than "grows by one segment") avoids ambiguity about *when* the change is observable and makes the requirement directly testable against turn-end state snapshots.

**Affected requirements**: 01-REQ-062 (new).

---

### 01-REVIEW-009: Initial food under-supply (gap) — RESOLVED

**Type**: Gap
**Phase**: Requirements
**Context**: 01-REQ-017 mandates spawning one food item per snake on eligible cells at game start (inner, non-Wall, non-Hazard, not occupied by snake body; additionally Fertile if fertile ground enabled). No requirement states the behaviour when eligible cells are fewer than the snake count. This is plausible on small boards with high hazard percentages and fertile-only mode enabled at low density. An implementation that naively samples without replacement would fail or loop indefinitely.
**Question**: How should initial food placement handle the case where eligible cells < snake count?
**Options**:
- A: Graceful degradation: spawn as many food items as possible (one per eligible cell), accepting that some snakes begin the game without a dedicated food item.
- B: Reject the configuration at provisioning time as infeasible.
- C: Relax eligibility: if Fertile-only eligibility is insufficient, fall back to non-Fertile eligible cells for initial placement only (with a note that Phase 7 spawning remains Fertile-only).
**Informal spec reference**: Section 4.5.

**Decision**: Fold into the existing bounded-retry mechanism codified in **01-REQ-061**. Insufficient initial-food eligibility is added as a third failure condition in 01-REQ-061's failure list. A shortfall triggers a full board-generation retry under a fresh sub-seed; after the configured retry budget is exhausted, the game is reported infeasible and the room owner reconfigures — identical failure-surfacing path as the other two failure conditions.

**Rationale**:
- Options A and C were both considered and rejected:
  - **A (graceful degradation)** silently weakens the one-food-per-snake invariant established by 01-REQ-017. Some snakes would start food-disadvantaged through no fault of their own, introducing asymmetry at setup that isn't part of the intended game design. Players would have no signal that this happened.
  - **C (relax fertile-only eligibility at setup)** creates a special-case divergence between initial food placement and Phase 7 food spawning (01-REQ-048). The fertile-ground rule exists to shape where food appears; bypassing it at setup partially defeats the point, and introduces a bifurcation that design-phase code and tests would have to track forever.
- Treating the shortfall as a feasibility failure (rather than degrading or specially relaxing) keeps 01-REQ-017 strict and unifies all board-generation feasibility failures under one mechanism. The room owner is presented with a clear signal that their combination of board size, hazard percentage, fertile density, and snake count is infeasible, and can adjust any of those dimensions to fix it.
- Reusing 01-REQ-061's retry-with-new-sub-seed covers the case where the shortfall was caused by unlucky hazard placement or unlucky starting-position assignment (both consume eligible cells) rather than by structurally infeasible configuration. If the next attempt's randomness produces enough eligible cells, the game proceeds normally.
- The failure condition is evaluated *after* starting-position assignment within the same attempt, because occupied starting cells reduce the eligible-cell pool. This ordering matches the order in 01-REQ-010 through 01-REQ-017.
- No additional machinery is introduced: the same "machine-readable error identifying which constraint failed on the final attempt" contract from 01-REQ-061 now covers this case as well.

**Affected requirements**: 01-REQ-061 (failure-condition list extended).

---

### 01-REVIEW-010: Effect-source tracking via `sourceCollectorSnakeId` — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Design
**Context**: Writing the Phase 9 cancellation design (Section 2.7 / 2.8) revealed that 01-REQ-031's "cancel this collector's contribution to teammates" can only be implemented if each `EffectInstance` on a teammate records which collector produced it. Consider a team with two active collectors X and Y, each having collected an InvulnPotion on different turns. Their teammate Z holds two `invuln_buff` stacks, one from X and one from Y. If X suffers a disruption, 01-REQ-031 says X's contributions to Z should be cancelled but Y's should persist. Without an origin field on `EffectInstance`, Z's two buffs are indistinguishable and the rule is unimplementable.
**Question**: Is adding a `sourceCollectorSnakeId: SnakeId` field to `EffectInstance` the right way to support 01-REQ-031, or is there a semantic preference for a different approach?
**Options**:
- A: Add `sourceCollectorSnakeId` to `EffectInstance`. Minimal change, directly encodes the provenance needed.
- B: Store collector→effect backlinks in a separate auxiliary structure keyed by `(collectorId, effectType) → Set<(affectedSnakeId, effectInstanceRef)>`. Decouples `EffectInstance` from provenance but adds a second data structure to maintain in lock-step with the main one.
- C: Revise 01-REQ-031 to cancel *every* matching effect on teammates regardless of source (a simpler but strictly stronger rule — disruption to collector X would also strip Y's contributions to teammates, which feels wrong thematically and strategically).

**Decision**: None of A/B/C as originally posed. The question is resolved by a deeper change introduced in 01-REVIEW-015: **stacking is removed entirely** in favour of a symmetric per-family buff/debuff state model. Under the new model a team holds at most one coherent invulnerability-family rebuild and at most one coherent invisibility-family rebuild at any time, so multi-collector attribution is moot — there is only ever one "owner" of a family's active state, namely whichever snake currently holds the family's `debuff`. Disruption of that debuff-holder cancels the family team-wide without needing to discriminate among contributions. Option C was originally rejected as thematically wrong under stacking; under the non-stacking model it becomes structurally trivial (there is only ever one "contribution" per family), not a dilution.

**Rationale**: The original framing assumed stacking was a fixed premise and asked how cancellation attribution should be plumbed through it. Dropping the stacking premise — the deeper change 01-REVIEW-015 resolves — eliminates the attribution question instead of answering it. Removing `sourceCollectorSnakeId` from `PotionEffect` simplifies the schema and removes a load-bearing coupling between Module 01 and Module 04's storage layer.

**Scope of change**: `EffectInstance` renamed to `PotionEffect` with shape `{family, state, expiryTurn}`; no source field. `EffectInstance` type removed from exports. `DOWNSTREAM IMPACT` note 2 rewritten accordingly. 01-REQ-031 now specifies team-wide, family-scoped cancellation triggered by the disruption of a debuff-holder.

**Revisit if**: a future rule reintroduces stacking within a family (e.g. multiple invulnerability buffs of different durations on the same snake). At that point per-contribution attribution becomes necessary again.

**Affected requirements**: 01-REQ-031 (rewritten under 01-REVIEW-015).

---

### 01-REVIEW-011: `snake_moved` stager attribution — module-01-local `Agent` type — **RESOLVED**

**Type**: Contradiction
**Phase**: Design
**Context**: Informal spec §14 defines `snake_moved: {snakeId, from, to, direction, grew: bool, stagedBy: Identity}` where `Identity` is the cross-module identity type (module-03 concept covering human users, Centaur Servers, and game participants). Module 01 must not reference module-03 types (Rule 2: 01 has no dependencies). This design uses `stagedByCentaurTeamId: CentaurTeamId | null` instead, on the reasoning that (a) module 01 can't reference `Identity`, and (b) what downstream animation/replay actually needs is team attribution (to display "Red.C moved by Red team's bot"), not the full human-or-server identity chain.
**Question**: Is team-level attribution sufficient for `snake_moved`, or does a downstream consumer (likely module 08's team replay viewer, per informal spec §13.3) need the full `Identity` for features like "show which operator staged this move"?
**Options**:
- A: Keep `stagedByCentaurTeamId: CentaurTeamId | null` in module 01. If module 08 needs operator-level attribution, it reconstructs it from the Centaur action log (module 06) joined on turn/snake — which is the mechanism the informal spec already describes for sub-turn replay.
- B: Define a second event schema layer in module 04 that wraps module 01's `TurnEvent` and enriches `snake_moved` with a module-03 `Identity`. Module 01's schema stays identity-free.
- C: Move `TurnEvent` ownership out of module 01 entirely and into module 04. Module 01 would only enumerate the *names* of event types in 01-REQ-052; the schemas would live where `Identity` is reachable.
**Informal spec reference**: §14, §13.3.

**Decision**: None of A/B/C as originally posed — a new option (D) was introduced and chosen. Module 01 defines a local `Agent` concept that abstracts over the two kinds of actor that can stage a move in this project: a **Centaur Team** (a Centaur Team's bot acting on the team's collective behalf, incorporating human and AI heuristics) and an **Operator** (an individual human member of a Centaur Team, identified via Google OAuth). These represent different granularities of agency attribution: a Centaur Team-level move is the product of the team's collective intelligence pipeline, while an operator-level move is uniquely attributed to that individual sub-agent of the team. `Agent` is a discriminated union over `{kind: 'centaur_team', centaurTeamId: CentaurTeamId}` and `{kind: 'operator', operatorUserId: UserId}`, with `CentaurTeamId` and `UserId` as opaque branded types owned by module 01. Both are string-based: `CentaurTeamId = string & { readonly __brand: 'CentaurTeamId' }` and `UserId = string & { readonly __brand: 'UserId' }`, reflecting that the concrete values are Convex record `_id`s (see resolved 03-REVIEW-011). The `snake_moved` event carries `stagedBy: Agent | null` (null only when Phase 1 fell through to `lastDirection` or the turn-0 random pick). `resolveTurn`'s `stagedMoves` input is correspondingly retyped from `ReadonlyMap<SnakeId, Direction>` to `ReadonlyMap<SnakeId, StagedMove>` where `StagedMove = {direction, stagedBy}`. Downstream modules that see a concrete identity type (module 04's SpacetimeDB `Identity`, in particular) are responsible for mapping that identity onto an `Agent` variant before calling `resolveTurn` — module 01 never interprets the ids, it just threads them through into the event.

**Rationale for rejecting the originally-posed options**:

- Option A (keep `stagedByCentaurTeamId`) was doubly wrong. First, it is *redundant*: `SnakeState.centaurTeamId` already maps `snakeId → centaurTeamId`, so given any `snake_moved.snakeId` the team is derivable by lookup and needn't be carried on the event. The only non-redundant bit in the original encoding was "was any move staged at all vs. engine fallback", which the `null` sentinel bundled in as a side effect rather than as a deliberate design choice. Second, it does not satisfy 01-REQ-052, which was written post-hoc and explicitly lists "identity of who staged the move" as part of the closed event set. Team identity is not the same concept as operator/centaur identity.

- Options B and C both treat module 01 as if it cannot speak about staged-move attribution at all, and offload the concept to module 04. This is an over-reading of the "module 01 has no dependencies" rule. The rule prohibits module 01 from *depending on* module 03's `Identity`; it does not prohibit module 01 from defining its own local concept of "who staged this move" with its own id types that other modules later map into. Keeping `TurnEvent` schema ownership in module 01 (per the existing design stance) while introducing a module-01-local `Agent` type is strictly cleaner than either wrapper layer (B) or schema-ownership relocation (C).

The framing of the original question ("is team-level attribution sufficient?") was also wrong — it sidestepped the fact that 01-REQ-052's "identity of who staged the move" clause already answered it. A better framing would have been "module 01 needs to emit operator-or-centaur attribution on `snake_moved`, but cannot reference module 03's `Identity`; what is the minimum module-01-local vocabulary that lets it do so?" Option D is the answer to that question.

**Scope of change**:

- **Section 3.1 (Enums and Branded Types)**: `CentaurTeamId` is now a string-branded type (the Convex `centaur_teams._id`); `UserId` is a string-branded type (values are Convex record `_id`s per resolved 03-REVIEW-011); the `Agent` discriminated union uses `centaurTeamId: CentaurTeamId`.
- **Section 2.11 (Turn Event Schema)**: `snake_moved.stagedBy: Agent | null` carries the full agent attribution; inline comment explains that team attribution is derivable from `snakeId` and so is not duplicated on the event.
- **Section 2.11 scoping note**: rewritten to describe the Agent-based resolution instead of the original CentaurTeamId fallback.
- **Section 3.8 (Entry Points)**: `resolveTurn`'s `stagedMoves` parameter retyped from `ReadonlyMap<SnakeId, Direction>` to `ReadonlyMap<SnakeId, StagedMove>`, with `StagedMove = {direction, stagedBy: Agent}` added as an exported interface.
- **Section 2.8 (Turn Resolution Pipeline) — Phase 1 pseudocode**: each `moves[snakeId]` entry now carries `{direction, stagedBy}` where `stagedBy` is `null` in the lastDirection and turn-0 random fallback branches. Phase 2 reads `moves[snakeId].direction`; Phase 11's emission of `snake_moved` reads `moves[snakeId].stagedBy`.

**Downstream impact**: Module 04's deployment-time mapping `Identity → Agent` is now a hard dependency. Its implementation must cover both kinds: Google-authenticated users map to `{kind: 'operator', operatorUserId}`, and Centaur Team bot connections map to `{kind: 'centaur_team', centaurTeamId}`. The id-space discipline (disjoint `CentaurTeamId` and `UserId` spaces) is owned by whichever module populates the mapping — module 01 does not enforce it.

**Revisit if**: the platform introduces a third class of staging actor (e.g. an external API bot that is neither a Centaur Server nor an authenticated human). The `Agent` union would then need a third variant, which is a module-01 version bump.

**Affected requirements**: 01-REQ-052 (now satisfied: "identity of who staged the move" maps to the `stagedBy: Agent | null` field on `snake_moved`). No requirement text change required.

---

### 01-REVIEW-012: Game configuration parameter ranges — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: Several parameters in `GameConfig` (Section 3.3) have ranges stated in the informal spec's §9.3 table and also in individual requirements (e.g., `snakesPerTeam` 1–10 in 01-REQ-019, `hazardPercentage` 0–30 in §9.3). Others are implied but not stated in requirements: `maxHealth` default 100 appears in §9.3 but no requirement pins the range (the draft uses ≥1); `budgetIncrementMs` range 100–5000 appears in §9.3 but no requirement states it. `initialBudgetMs` is listed as "≥0 seconds" in §9.3 but no requirement commits to a range.
**Question**: Should module 01's requirements section be extended with explicit range-setting requirements for every configuration parameter, so that the ranges are part of the requirements contract rather than exclusively derived from the informal spec's table?
**Options**:
- A: Add requirements 01-REQ-063+ pinning the canonical ranges. Strictest interpretation of "requirements state the contract", and protects against informal spec drift.
- B: Leave the ranges as design-phase specification (already captured in Section 3.3 as comments). Accept that the informal spec's §9.3 table is the source of truth for parameter ranges and that module 01's requirements only constrain ranges where they materially affect game rules (e.g., 01-REQ-019's 1–10 for snakesPerTeam is a game rule, but 100–5000 for budgetIncrementMs is an input-validation concern that legitimately belongs elsewhere).
- C: Extract a separate "Configuration" sub-module whose requirements are the ranges. Too heavyweight for what is really a parameter table.
**Informal spec reference**: §9.3.

**Decision**: Option A. New requirements 01-REQ-063 through 01-REQ-077 pin canonical ranges and defaults for every `GameConfig` parameter, grouped in Section 1.11. Ranges are drawn from the informal spec §9.3 table where present; where §9.3 is open-ended (e.g., `maxHealth ≥ 1`, `initialBudgetMs ≥ 0`), upper bounds are proposed to prevent degenerate configurations (500 for `maxHealth`, 600000 for `initialBudgetMs`, 1000 for `maxTurns`). The `maxTurnTimeMs` lower bound is set to 100ms (below §9.3's 1s) to support blitz-style play. The `snakesPerTeam` default is set to 5 (the task-specified default; informal spec §9.3 shows 3).
**Rationale**: Making ranges part of the requirements contract rather than leaving them as design-phase comments protects against informal spec drift and ensures downstream modules (especially Module 04's `DynamicGameplayParams` validation and Module 05's game configuration UI) have a single authoritative source for validation rules. Option B was rejected because dispersed range comments in Section 3.3 are easy to miss and hard to enforce across modules. Option C was rejected as too heavyweight for a parameter table.
**Affected requirements/design elements**: 01-REQ-063–077 (new, Section 1.11), GameConfig interface comments (Section 3.3 updated to reference new requirement IDs).

---

### 01-REVIEW-013: `GameState` aggregate shape not exported — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Design
**Context**: The `resolveTurn` entry point in Section 3.8 takes and returns a `GameState` type, but `GameState`'s aggregate shape is not exported — the design notes that consumers interact with its components (`Board`, `SnakeState[]`, `ItemState[]`, `CentaurTeamClockState[]`) individually. Module 04 (stdb-engine) is the most likely consumer of the aggregate since it needs to serialise state to SpacetimeDB tables. If module 04 defines its own aggregate independently, there is a risk of drift between "module 01's notion of game state" and "module 04's notion of game state" especially as new fields are added.
**Question**: Should `GameState` be an exported aggregate type (either as a plain interface or as a constructor function), or should the "components only" approach persist with module 04 building its own aggregate?
**Options**:
- A: Export `GameState` as a concrete `interface GameState` with readonly fields for each component. Binds module 04 to a specific aggregate shape but eliminates drift risk.
- B: Keep the current "components only" stance. Module 04 builds its own aggregate as it sees fit, possibly different across different deployment contexts. Requires discipline.
- C: Export `GameState` as an opaque type alias with constructor/accessor functions only. Hides the shape but prevents module 04 from adding its own fields without an explicit module-01 change.
**Informal spec reference**: None directly. This is an engineering-scope decision that surfaced during Phase 2 design.

**Decision**: Option A. A concrete `interface GameState` with four readonly fields (`board: Board`, `snakes: ReadonlyArray<SnakeState>`, `items: ReadonlyArray<ItemState>`, `clocks: ReadonlyArray<CentaurTeamClockState>`) is now exported in Section 3.8. DOWNSTREAM IMPACT note 8 is updated to reflect the exported shape.
**Rationale**: Module 04 already assembles `{ board, snakes, items, clocks }` in its `resolve_turn` reducer (§2.7, line ~678) with exactly these four field names and compatible types. Exporting the shape eliminates drift risk — if Module 01 adds a fifth component (e.g., `config`), Module 04 gets a compile-time error rather than a silent divergence. Option B was rejected because it places the burden of alignment on discipline rather than the type system, and Module 04's current assembly already matches the proposed shape so binding it costs nothing. Option C was rejected because the shape is simple (four readonly fields) and opaqueness adds indirection without benefit.
**Affected requirements/design elements**: Section 3.8 (GameState interface added), DOWNSTREAM IMPACT note 8 (updated from "not exported" to "now exported").

---

### 01-REVIEW-014: "Frozen effect state" wording implied an unneeded data structure — **RESOLVED**

**Type**: Ambiguity / Wording
**Phase**: Design
**Context**: Phase 1 requirements 01-REQ-033, 01-REQ-044, 01-REQ-044c, 01-REQ-044d, and 01-REQ-045 were originally written using "frozen" language — "all effect states shall be frozen at the start of each turn's resolution", "resolved using frozen invulnerabilityLevels", etc. This phrasing naturally suggested a concrete snapshot data structure, and Phase 2's first draft followed that lead by introducing a `FrozenEffectState` interface and a `snapshotFrozenEffects()` entry point, threading `frozen[snakeId]` reads through the collision and cancellation pseudocode. On audit during Phase 2 review, no phase between start-of-turn and Phase 9 actually writes `activeEffects`, `invulnerabilityLevel`, or `visible` — Phase 6 writes only `pendingEffects`, which is a separate list that no read consults. That meant the snapshot held a copy of data that equalled the live fields at every read site, making `FrozenEffectState` a structure whose only job was to duplicate unchanged data.
**Question**: Can the semantic intent of 01-REQ-033 (start-of-turn values determine the turn's collision and disruption outcomes) be preserved while removing the implication that a snapshot data structure is required?
**Options**:
- A: Keep the "frozen" wording and the snapshot structure. Cleanest one-to-one mapping from requirement language to design artifact, at the cost of an unused-in-practice type and a pseudocode idiom (`frozen[id].field`) that obscures the fact that the live field would read the same value.
- B: Rewrite the requirement wording to speak of "start-of-turn values" and explicitly permit either a snapshot or an ordering-discipline implementation. Remove `FrozenEffectState` / `snapshotFrozenEffects` from the exported interface and satisfy 01-REQ-033 structurally, via an invariant that no Phase 1–8 code writes the fields. Add a `DOWNSTREAM IMPACT` note warning that any future mid-turn mutation of these fields requires either placing the mutation at/after Phase 9 or reintroducing an explicit snapshot.
- C: Keep the requirement wording as-is ("frozen") and satisfy it structurally in the design, leaving a vocabulary mismatch between requirements and design.

**Decision**: Option B.
**Rationale**: The snapshot is mechanism, not semantics. What 01-REQ-033 actually cares about is the *observable behaviour* — that within-turn effect mutations can't influence the same turn's collision and disruption outcomes — and that behaviour can be guaranteed either by taking a snapshot or by ordering the pipeline so no Phase 1–8 code writes the fields. The ordering discipline is cheaper at runtime (no allocation, no copy) and, arguably, easier to audit: a reviewer can confirm the invariant by grepping for writes to the three fields across Phases 1–8, whereas a snapshot-based design requires trusting that every read site goes through the snapshot. Option C was rejected because keeping "frozen" language in the requirements while the design no longer has a frozen-anything artifact creates exactly the kind of vocabulary drift that later readers stumble on. Option A was rejected because the snapshot adds no behavioural content — it would be dead weight preserved only for symmetry with the original wording.

The rewritten 01-REQ-033 explicitly allows either implementation approach ("This requirement is satisfied whether by an explicit start-of-turn snapshot or by an ordering discipline that defers all in-turn mutation of these fields until Phase 9; Module 01's design may choose either."). This keeps the requirement future-proof against a scenario where some later phase legitimately needs to mutate effect state mid-turn and the snapshot approach becomes the right implementation.

**Scope of change**:
- **Requirement wording** (Phase 1, edited in place): 01-REQ-033, 01-REQ-044, 01-REQ-044c, 01-REQ-044d, 01-REQ-045 now use "start-of-turn value" language and cross-reference 01-REQ-033 as the shared semantic anchor. No behavioural change — the rewording is equivalent in observable outcomes.
- **Design** (Phase 2): Section 2.7 reframed as a structural invariant with a "correctness-critical invariant" block; Section 2.8 pseudocode reads `snake.invulnerabilityLevel` / `snake.activeEffects` directly instead of `frozen[snakeId].*`; Phase 9 ordering rationale updated to justify cancel-before-promote in terms of preserving the invariant rather than a snapshot.
- **Exported interfaces** (Phase 2): `FrozenEffectState` interface and `snapshotFrozenEffects` function export removed from Section 3.2 and Section 3.8 respectively.
- **Downstream impact**: New `DOWNSTREAM IMPACT` note 9 in Section 3.10 documents the invariant and the two allowed escape hatches for future code that wants to mutate effect state mid-turn.

**Revisit if**: a future requirement introduces a phase between Phase 1 and Phase 9 that legitimately needs to mutate `activeEffects`, `invulnerabilityLevel`, or `visible` mid-turn. At that point the ordering-discipline implementation breaks and an explicit start-of-turn snapshot must be reintroduced at Phase 1, with all pre-mutation reads rerouted through it. 01-REQ-033's wording already permits this without a requirement amendment.

**Affected requirements**: 01-REQ-033, 01-REQ-044, 01-REQ-044c, 01-REQ-044d, 01-REQ-045 (wording only; no behavioural change).

### 01-REVIEW-015: Potion-effect stacking removed; symmetric buff/debuff state model adopted — **RESOLVED**

**Type**: Design / Semantics
**Phase**: Design
**Context**: Earlier drafts (Phase 1 through most of Phase 2) modelled potion effects as an unbounded per-snake collection that could stack within a family: a snake could simultaneously carry multiple invulnerability or invisibility effect instances, each with its own expiry and provenance, and each collection of the same potion by a teammate layered additional instances onto the whole team. This created three follow-on problems: (1) cancellation semantics under 01-REQ-031 needed per-instance attribution (the `sourceCollectorSnakeId` field that 01-REVIEW-010 was originally framed around), (2) the invulnerability level and visibility predicates needed reducer semantics over the collection (max? any? sum clamped?) that were never cleanly specified, and (3) the debuff "collector" role was encoded asymmetrically across the two families — invulnerability had a full buff/debuff pair (the collector received `invuln_debuff`, teammates received `invuln_buff`), but invisibility used a distinct `invis_collector` marker type separate from the `invis_buff` teammates received. The asymmetry meant that a single unified effect state machine couldn't be written over both families, and every rule touching effects had to case-split on family. The user flagged all three problems in one directive and asked for a redesign that removes stacking entirely, unifies the two families behind a symmetric buff/debuff state model, and replaces per-family flat slot fields with a single collection-of-effects schema whose members carry `{family, state, expiryTurn}`.
**Question**: What effect model best satisfies the combined constraints of (a) no stacking within a family, (b) symmetric treatment of invulnerability and invisibility, (c) clean cancellation semantics, (d) minimal schema footprint, and (e) preservation of the intended team-wide debuff-holder role where disrupting the collector cancels the team's buff?
**Options**:
- A: Keep the collection-of-effects schema but retain stacking, disambiguate the reducer semantics, and add `sourceCollectorSnakeId` for per-instance cancellation. Preserves the most flexibility for future rules but retains the asymmetry problem and the reducer ambiguity.
- B: Replace the collection with per-family flat slot fields on `SnakeState` (e.g. `invulnState: 'buff' | 'debuff' | null`, `invulnExpiry: TurnNumber | null`, same for invisibility). Maximally explicit at the field level, but pollutes `SnakeState` with family-specific fields and makes adding a third family a schema-breaking change.
- C: Keep a single `activeEffects` collection but enforce a ≤1-per-family structural invariant, where each member is `PotionEffect { family: EffectFamily, state: EffectState, expiryTurn: TurnNumber }` with `EffectFamily = 'invulnerability' | 'invisibility'` and `EffectState = 'buff' | 'debuff'`. Derive `invulnerabilityLevel(snake) ∈ {-1, 0, +1}` and `isVisible(snake)` as pure functions over the collection. Re-collection of a potion by a team whose effect of that family is still active *replaces* the existing effect (refreshing expiry, possibly flipping state). Cancellation under 01-REQ-031 is team-wide and family-scoped — disrupting the debuff-holder cancels the entire team's effect in that family.

**Decision**: Option C.
**Rationale**: Option C satisfies every requirement from the directive simultaneously. The ≤1-per-family invariant eliminates stacking without having to enumerate special cases for each rule that reads an effect. The symmetric `(family, state)` pair lets a single state machine cover both families — the rules for "what disrupts a buff" and "what it means to be a debuff-holder" no longer case-split on family, and adding a future family (e.g. a hypothetical speed potion) becomes a matter of extending the `EffectFamily` union without changing any pseudocode that operates on the collection generically. Deriving `invulnerabilityLevel` and `isVisible` as pure functions instead of storing them as fields on `SnakeState` removes the ≤1-per-family reducer ambiguity and enforces consistency automatically: the derived value can never drift from the collection state. This change also resolves 01-REVIEW-014's concern structurally — since the derived values are recomputed on every read from the activeEffects collection, and since Phases 1–8 don't write activeEffects (only `pendingEffects`, a separate list), the start-of-turn invariant falls out of the schema without any explicit snapshot or ordering audit beyond the one already enforced. Team-wide family-scoped cancellation is the natural semantics for a model where the debuff-holder is the team's "anchor" for the buff: the collector carries the debuff, teammates carry the buff, and if the anchor is disrupted the whole structure collapses atomically. Per-instance attribution (the `sourceCollectorSnakeId` that 01-REVIEW-010 was originally about) disappears because there's at most one effect per family per team — the "source" is implicit in the debuff-holder's identity at cancel-time.

Option A was rejected because it retains the exact asymmetry and reducer problems the user asked to eliminate. Option B was rejected because it bloats `SnakeState` with family-specific fields, making the schema harder to extend and forcing every rule that reads effects to case-split on family (the same pathology as the `invis_collector` marker but pushed into the schema). The collection-with-invariant approach of Option C gives the field-level explicitness of Option B via the derived-value functions while keeping the schema uniform and extensible.

**Scope of change**:
- **Requirements** (Phase 1, edited in place):
  - 01-REQ-004: `SnakeState` field list updated — `invulnerabilityLevel` and `visible` removed as stored fields; `activeEffects`/`pendingEffects` described as collections of `{family, state, expiryTurn}` members with the ≤1-per-family invariant called out.
  - 01-REQ-006: `EffectType` enum replaced with `EffectFamily × EffectState`.
  - 01-REQ-021: Snake-init wording updated to reference the derived-value functions rather than stored fields.
  - 01-REQ-022: Rewritten as a derived function: `invulnerabilityLevel(snake) = +1` if holding `(invulnerability, buff)`, `-1` if holding `(invulnerability, debuff)`, `0` otherwise.
  - 01-REQ-023: Rewritten as a derived predicate: `isVisible(snake) = false` iff the snake holds `(invisibility, buff)`. The invisibility-family debuff-holder (collector) remains visible. See 01-REVIEW-016 for the mistake this corrects.
  - 01-REQ-026, 01-REQ-027: Team rebuild of the relevant family scheduled via `pendingEffects` with replace-on-apply semantics; 01-REQ-027 explicitly notes the collector remains visible.
  - 01-REQ-028: Per-family ≤1 invariant; collector defined as the active debuff-holder for the family.
  - 01-REQ-031: Team-wide family-scoped cancellation; if a snake holds both debuffs and is disrupted, both families cancel independently.
  - 01-REQ-045: Terminology updated to speak of "debuff-holder" rather than "collector marker".
  - 01-REQ-047: Collect-and-aggregate team rebuild; simultaneous multi-collection within a family collapses to a single rebuild via replace-on-apply.
  - 01-REQ-050: Phase 9 ordering restated as cancel (9a) → apply with replace-semantics (9b) → expire (9c); no recompute step is needed because the observable values are derived on read.
- **Design** (Phase 2):
  - Section 2.1: `EffectInstance` interface replaced with `PotionEffect`; `SnakeState` drops `invulnerabilityLevel` and `visible` fields; post-code paragraphs rewritten to describe derived-value semantics and the ≤1-per-family invariant.
  - Section 2.6: Snake init no longer initialises the removed fields.
  - Section 2.7: Full rewrite covering the symmetric buff/debuff model, the ≤1-per-family invariant, derived-value functions, duration encoding, re-collection refresh semantics, team-wide family-scoped cancellation, and disruption buffer behaviour.
  - Section 2.8 pseudocode: Phase 3b/3c read `invulnerabilityLevel(attacker)` / `invulnerabilityLevel(victim)` via the derived function; Phase 6 rewritten as a collect-and-aggregate team rebuild keyed by `(centaurTeamId, family)` with replace-on-pending; Phase 9 restructured into 9a (cancel by team/family for disrupted debuff-holders), 9b (apply pending with replace-semantics against `activeEffects`), 9c (expire), no 9d.
  - Phase 9 ordering rationale and Phase 3 simultaneity clarifying example updated to reference the derived-value functions.
  - Section 2.11: `effect_applied` event carries `{family, state, expiryTurn}`; `effect_cancelled` carries `{family, reason}` with `reason` gaining `'replaced'` alongside the existing disruption cases.
- **Exported interfaces** (Phase 2):
  - Section 3.1: `EffectType` enum replaced with `EffectFamily` / `EffectState` type aliases; `invulnerabilityLevel()` and `isVisible()` functions added to the exported surface.
  - Section 3.2: `EffectInstance` → `PotionEffect`; `SnakeState` drops the two removed fields.
  - Section 3.9: Invariants updated to reference `PotionEffect`, the ≤1-per-family rule, derived-value functions, team-wide family-scoped cancellation, and the "debuff-holders remain visible" clarification.
  - Section 3.10 note 2: Rewritten — the schema no longer carries `sourceCollectorSnakeId`; attribution is unnecessary under the non-stacking model.
  - Section 3.10 note 9: Updated to reference only `activeEffects` (the two removed fields are no longer part of the invariant).
- **REVIEW items**:
  - 01-REVIEW-010 marked RESOLVED with decision "none of A/B/C; question dissolved by 01-REVIEW-015".

**Revisit if**: a future rule reintroduces within-family stacking (e.g. allowing a snake to accumulate multiple concurrent invulnerability buffs whose durations stack additively, or allowing an invulnerability buff and debuff to coexist on the same snake with some interaction rule). At that point the ≤1-per-family invariant breaks and the effect model must either reintroduce reducer semantics over the collection or partition the collection by provenance with `sourceCollectorSnakeId` reinstated. Also revisit if a future family is added that doesn't fit the buff/debuff dichotomy cleanly (e.g. a status effect with three or more mutually exclusive states) — the `EffectState` union would need to become family-parameterised.

**Affected requirements**: 01-REQ-004, 01-REQ-006, 01-REQ-021, 01-REQ-022, 01-REQ-023, 01-REQ-026, 01-REQ-027, 01-REQ-028, 01-REQ-031, 01-REQ-045, 01-REQ-047, 01-REQ-050.

### 01-REVIEW-016: Invisibility-collector visibility — formal-spec-only mistake, informal spec was correct — **RESOLVED**

**Type**: Mistake / Behavioural correction
**Phase**: Design
**Context**: An earlier draft of 01-REQ-023 specified that a snake is invisible iff it holds `invis_buff` *or* `invis_collector` — i.e. the invisibility potion collector itself was invisible along with its teammates. The user flagged this as always-intended-otherwise: the collector has always been meant to *remain visible* as the targetable weak link for the opposing team to disrupt the buff. On closer reading, the informal spec (v2.2) actually states the correct behaviour — the formal-spec error is *not* inherited from an ambiguous source. The decisive sentence is line 169, which describes MVP bot behaviour for invisibility as "Bot code naively simulates next board states with only the invisibility potion collector as the opponent." That phrasing only makes sense if the collector is still on the board as a visible target during the buff window. Consistent with this, line 157 defines `Visible` as "False when under invisibility buff effect" (not under `invis_collector`), and line 167 describes the buff as making "**all alive teammates** become invisible" — wording that separates the collector from "teammates". Line 305's scheduling rule similarly grants `invis_buff` only to teammates, while the collector receives the distinct `invis_collector` marker. What the informal spec lacks is a single sentence in plain language stating "the collector remains visible"; the correct behaviour is derivable from the definitions but never stated outright. The formal spec's first draft added a spurious `or invis_collector` disjunct to the invisibility predicate, which was a misread, not a faithful inheritance. Discovery happened during the 01-REVIEW-015 redesign audit, when unifying the two families under a symmetric buff/debuff model made the asymmetry stark: under the new model the invulnerability-family debuff-holder clearly remains vulnerable-to-body-collision (debuff = `-1` invuln level, strictly worse than teammates), and by symmetry the invisibility-family debuff-holder should remain visible (debuff = targetable, strictly worse than teammates).
**Question**: Should the invisibility-potion collector be visible or invisible during the 3-turn duration of its team's invisibility buff?
**Options**:
- A: Collector is invisible along with teammates. Matches the prior formal-spec draft. Makes the invisibility buff harder for opponents to disrupt (no targetable anchor).
- B: Collector remains visible while teammates are invisible. Matches user's always-intended behaviour. Makes the invisibility buff symmetric with the invulnerability buff — both have a targetable weak link (the debuff-holder) that opponents can disrupt to cancel the whole team effect.

**Decision**: Option B.
**Rationale**: The user confirmed this was the always-intended behaviour and that the informal spec's ambiguity is the root of the error, not a reflection of a different intended design. The symmetric buff/debuff model from 01-REVIEW-015 also makes Option B the only coherent choice — under that model every family's debuff-holder is strictly worse off than its teammates (invulnerability debuff = vulnerable, invisibility debuff = visible), and the team-wide family-scoped cancellation semantics depend on the debuff-holder being a meaningful disruption target. If the invisibility collector were invisible, opponents couldn't target it directly, and the cancellation-on-disruption rule would apply only to incidental collisions — a significant reduction in opposing counterplay that was never part of the design intent. Option A is rejected because it both contradicts the user's intent and breaks the structural symmetry that the redesigned effect model relies on.

**Scope of change**:
- **Requirement 01-REQ-023** rewritten to specify `isVisible(snake) = false` iff the snake holds `(invisibility, buff)` only. The debuff state does not affect visibility.
- **Section 2.1** post-code explanatory paragraphs and **Section 2.7** effect state machine explicitly call out that the invisibility-family debuff-holder remains visible, cross-referencing this REVIEW item.
- **Section 3.9 invariant list** includes "Both debuff-holders (invulnerability and invisibility) remain visible — the invisibility-family debuff-holder is explicitly visible to opponents as the targetable weak link for their team's invisibility buff."
- **Informal spec**: No behavioural change needed — v2.2 already implies the correct behaviour (decisively via line 169's MVP bot-behaviour description, and by definition via lines 157/167/305). A low-priority clarity improvement would add an explicit one-liner in Section 4 stating "the invisibility potion collector remains visible to opponents for the duration of the team's invisibility buff" so the rule doesn't require chaining two separate passages to derive. This is a documentation-hygiene item, not a correction.

**Revisit if**: user intent changes and the invisibility buff should be harder to disrupt by making the collector invisible too. At that point the buff/debuff symmetry breaks and the family needs a distinct "concealed anchor" state, or the cancellation rule needs to apply only to incidental collisions with the hidden collector. Neither is currently planned.

**Affected requirements**: 01-REQ-023 (behavioural correction), 01-REQ-027, 01-REQ-031 (knock-on consistency with corrected visibility).

### 01-REVIEW-017: `GameConfig` realignment to platform boundaries — **RESOLVED**

**Type**: Contradiction / Proposed Addition
**Phase**: Design
**Context**: Module 01's exported `GameConfig` and Module 05's exported `GameConfig` had diverged into two incompatible types with the same name: different nesting (nested vs flat), different field names (`hazardPercentage` vs `hazardPercent`), different units (ms vs seconds), and different encodings of "disabled" (sentinel vs nullable). Compounding this, the type mingled fields consumed only by Convex during board generation (board size, snakes-per-team, hazard %, fertile parameters) with fields that flow to SpacetimeDB at `initialize_game` and govern per-turn behaviour (max health, hazard damage, spawn rates, clock). That mingling forced every consumer to thread an `Omit<>` projection (or its equivalent) at the runtime boundary and produced parallel schemas that drifted independently. Three additional pain points appeared in the same audit: (1) each "optional feature" group (`fertileGround`, `invulnPotions`, `invisPotions`) carried a redundant `enabled` boolean that duplicated the information available from its dependent numeric field being zero; (2) the same shape had to be declarable in three runtimes (SpacetimeDB TypeScript with `@type` decorators, Convex TypeScript with `v.*` validators, shared engine TS) and there was no stated LCD constraint to prevent one runtime's idioms from leaking into the canonical type; (3) the `initialScores` computation in the turn-0 simultaneous-elimination branch referenced `snakesPerTeam`, which on the new boundary is a platform-only parameter not retained at STDB runtime.
**Question**: What is the minimal set of types, boundaries, and sentinel conventions that aligns `GameConfig` with the runtimes that actually consume each field, mirrors cleanly between SpacetimeDB record types and Convex nested `v.object` validators, and eliminates the competing type definition in Module 05?
**Options**:
- A: Keep one flat `GameConfig` owned by Module 01 and have consumers `Omit<>` the subset they don't need. Minimises type count but leaves every downstream reader responsible for knowing which fields are platform-only.
- B: Split by runtime boundary into `GameOrchestrationConfig` (Convex-side, never sent to STDB) and `GameRuntimeConfig` (flows to STDB and governs per-turn behaviour), with a `GameConfig = { orchestration, runtime }` parent. Drop the `enabled` flags in favour of sentinel values (`spawnRate: 0`, `density: 0`) that are structurally indistinguishable from an "off" feature. Module 05 stops redeclaring `GameConfig` and mirrors the canonical type through a Convex `v.object` validator proven equivalent by `Infer<>`/`AssertEqual<>`.
- C: Move to a schema DSL that emits both STDB and Convex definitions from a single declaration. Heaviest option; requires custom tooling.

**Decision**: Option B.
**Rationale**: The split traces the actual runtime boundary — STDB receives the pre-computed initial game state and only the `runtime` subtree, never any board-generation parameters. This makes the "handcrafted initial state" testing/puzzle workflow first-class: a test harness can construct an `InitialGameState` directly and feed STDB `(runtime, initialState)` without inventing board-gen parameters. Moving `snakesPerTeam` to orchestration is safe because the one runtime reference (`initialScores = 3 * snakesPerTeam` in Phase 10's simultaneous-elimination branch) is replaced by `initialScores = 3 * initialSnakeCount(t)`, derived from the initial snakes that STDB already holds — the spec never needed `snakesPerTeam` at runtime, it needed the count of each team's starting snakes, which is a property of the initial state itself. Dropping `enabled` is justified by the sentinel semantics of the adjacent numeric field: `spawnRate: 0` produces zero expected spawns per turn (the Phase 8 pseudocode degrades naturally to a no-op), and `density: 0` produces zero fertile cells at generation time (the Fertile restriction at runtime then conditions on the board rather than the config). The redundant flag added branching in both the schema and the pseudocode without adding expressive power. Once `enabled` left, the single-field nested wrappers `food: {spawnRate}`, `invulnPotions: {spawnRate}`, `invisPotions: {spawnRate}` each held only their rate, so they were flattened to `foodSpawnRate`, `invulnPotionSpawnRate`, `invisPotionSpawnRate` — single-field wrappers add syntactic noise without semantic grouping value. Nesting is retained where the group carries more than one field (`fertileGround: {density, clustering}` and `clock: {initialBudgetMs, budgetIncrementMs, firstTurnTimeMs, maxTurnTimeMs}`). For the tri-runtime mirror, the canonical TypeScript interfaces in Module 01 are the source of truth and must obey these constraints so that `@type` classes in STDB and `v.*` validators in Convex are 1:1 transcriptions: every numeric field is `number` (no `bigint`/`Int64`); no field is `null` or absent in value position — sentinels (`maxTurns: 0`, `fertileGround.density: 0`, `foodSpawnRate: 0`, `invulnPotionSpawnRate: 0`, `invisPotionSpawnRate: 0`) carry "disabled"; enums are string-literal unions (`BoardSize`); all time values are milliseconds; nested object grouping carries semantic meaning rather than syntactic optionality. An `AssertEqual<Infer<typeof gameConfigV>, GameConfig>` check in each adapter module turns any drift between Module 01's interfaces and Module 05's validators (or any future STDB/Convex schema declarations) into a compile-time error.
**Affected requirements/design elements**:
- Section 3.3 (`GameOrchestrationConfig`, `GameRuntimeConfig`, `GameConfig`); Section 3.8 (`generateBoardAndInitialState` takes `GameOrchestrationConfig`); Section 3.2 (new `fertileGroundEnabled(board)` helper).
- 01-REQ-048 (food eligibility keys on `fertileGroundEnabled(board)`); 01-REQ-049 (potion spawning unconditional; zero-rate sentinel).
- 01-REQ-069 (`fertileGround.density` range widened to include `0` as disabled sentinel); 01-REQ-070 (clustering inert when density is `0`).
- 01-REQ-071, 01-REQ-072, 01-REQ-073 (flat `foodSpawnRate` / `invulnPotionSpawnRate` / `invisPotionSpawnRate`; potion range widened to include `0` as disabled sentinel).
- Section 2.4 board-gen pseudocode; Section 2.8 Phase 7 and Phase 8 pseudocode; Section 2.10 turn-0 simultaneous-elimination branch (reads `initialSnakeCount(t)` from state); Section 3.9 invariant list (adds `fertileGroundEnabled` entry).
- Downstream: [02] re-export list and `SpacetimeDbInstanceLifecycle` lifecycle inputs; [04] `GameConfigRow` and `InitializeGameParams`; [05] `gameConfigValidator`, 05-REQ-022, 05-REQ-023 parameter table, 05-REQ-025, 05-REQ-032 step 4, 05-REQ-032d, and §3.3 `GameConfig` re-export; [03] `GameInvitationPayload.gameConfig` commentary.

**Revisit if**: a future rule change decouples "feature exists on this board" from "spawn rate is positive" — for instance, if a fertile-ground variant were introduced that places Fertile cells but suppresses their food-eligibility effect, the `density > 0` sentinel would no longer be a faithful proxy and an explicit feature flag would return.

**Note (post-authorship)**: The schema-mirror constraint in [01] §3.3's trailing paragraph originally cited `BoardSize` as the canonical string-literal-union example. That example is now stale — `BoardSize` has been collapsed to a raw integer `number` per **01-REVIEW-018**, and the §3.3 example has been updated to cite `EffectFamily` / `EffectState` instead. This review item's body is otherwise unchanged; the boundary-split decision it records is unaffected.

---

### 01-REVIEW-018: Normalised team scoring formula — **RESOLVED**

**Type**: Amendment
**Phase**: Requirements

**Prior text**: 01-REQ-053 defined a team's score as the integer sum of alive snake body lengths at game end. 01-REQ-054 (last-team-standing), 01-REQ-055 (simultaneous elimination), and 01-REQ-056 (turn-0 edge case) all compared integer body-length totals to determine winner/draw. The informal spec (Section 12 / Phase 10) likewise framed win conditions in terms of "combined snake length" totals — specifically: "Simultaneous elimination: If all remaining snakes die the same turn, winner determined from the *previous turn's* state: team with highest combined snake length wins. Turn-0 edge case: if simultaneous elimination occurs on turn 0, there is no preceding turn; scores are computed from initial snake lengths at game start (length 3 per snake)." and "Turn limit: If max turns reached, team with highest combined alive snake length wins. Tied teams draw." Under this rule, score values were proportional to board population and game length, making scores from games of different sizes or durations incomparable. The `aggregateLength` intermediate in the [04] `scoreboard` table and its `teamScore` column were equal under the original rule; Module 04's wire shape published both columns as separate fields as a forward-compatibility concession (noted in resolved 04-REVIEW-020 as "even though they are equal under [01-REQ-053] today").

**Amendment**: The final team score is redefined as `score(team) = (alive_segments_owned / total_alive_segments) × competing_teams`, where `alive_segments_owned` is that team's `aggregateLength` at the game-end moment, `total_alive_segments` is the sum across all *competing* (non-forfeited) teams, and `competing_teams` is the count of non-forfeited teams. Par is `1.0` (a team holding a strictly proportional share scores exactly par); the score range is `[0, competing_teams]`. Forfeited teams are excluded from numerator, denominator, and `competing_teams`, and record score `0`; the all-forfeit degenerate case (`competing_teams = 0`) records score `0` for every team. Last-team-standing scores `1.0 × competing_teams`. Simultaneous-elimination (final-turn-alive) teams each score a flat `1.0` regardless of relative body length; earlier-eliminated teams score `0`. Turn-0 simultaneous elimination scores every competing team `1.0`. Turn-limit outcomes apply the formula directly to the alive-segment aggregates at the final turn. The `aggregateLength` intermediate is retained on the [04] `scoreboard` row as a secondary display statistic but is no longer the score and is not the basis of win / draw decisions.

**Rationale**: Normalised scoring makes scores comparable across different game configurations — a score of `1.2` always means "20 % above par" regardless of board size, snake count, or turn limit, which is essential for tournament-wide ranking and for the live scoreboard UI (Module 08) to render a meaningful headline number. Par `1.0` is a stable reference point and the natural walkover value (`competing_teams = 1` yields `1.0` analytically per [05-REVIEW-018]), so a sole-acceptor walkover no longer needs a special "winner-by-default with no numeric score" sentinel. Flat `1.0` for simultaneous-elimination survivors reflects the design intent that mutual annihilation is a shared par outcome rather than a partially-proportional one. Decoupling `teamScore` from `aggregateLength` on the wire turns the previously-speculative `04-REVIEW-020` forward-compatibility concession into load-bearing shape and lets the live `scoreboard_view` publish "current score if game ended now" every turn without any client-side computation. The formal module diverges from the informal spec here per the precedence rule in SPEC-INSTRUCTIONS.md; if the human's intent later shifts back to integer body-length scoring, that prior formulation is once again on the table.

**Informal spec reference**: Section 12 (win conditions) — superseded; the quoted prior-text passages above are the specific statements that this amendment displaces.

**Affected requirements/design elements**: 01-REQ-053 (rewritten to normalised formula; added `aggregateLength` as intermediate display stat); 01-REQ-053a (new — forfeited-team exclusion and all-forfeit degenerate case); 01-REQ-054 (survivor scores `1.0 × competing_teams`); 01-REQ-055 (sim-elim final-turn teams score flat `1.0`); 01-REQ-056 (turn-0 all score `1.0`); 01-REQ-057 (formula applied to alive-segment aggregates at final turn). Section 2.10 pseudocode rewritten. Section 3.4 `GameOutcome` prose updated. Downstream: [04] `ScoreboardRow.teamScore` now carries normalised score, `aggregateLength` decoupled (see 04-REVIEW-021); §2.2 turn-0 scoreboard write and §2.7 Step 6b updated; prior-turn read in §2.7 updated to read `aliveSnakeCount` rather than `teamScore` for sim-elim branch; `GameEndNotification` `GameOutcome.scores` prose updated. [05] walkover branch records sole acceptor with score `1.0` (see 05-REVIEW-018); `GameOutcome` prose updated. [08] 08-REQ-025 and 08-REQ-070a updated to display normalised score as headline with `aggregateLength` as secondary.


---

### 01-REVIEW-019: Chess timer — per-turn clock is carved out of the budget — **RESOLVED**

**Type**: Correction
**Phase**: Requirements

**Prior text**: 01-REQ-037 read "At the start of each turn, each team's per-turn clock shall be set to `min(effectiveCap, currentBudget)`" with no deduction from the budget, and §2.9's turn-start pseudocode was `budgetMs += budgetIncrementMs; perTurnMs = min(cap, budgetMs); declaredTurnOver = false` — again with no deduction. The declare-turn-over sequence (`budgetMs += perTurnMs`) then credited the full unspent clock back to a budget it had never been debited from.

**Correction**: The per-turn clock is deducted from the budget at the moment it is set: turn start is `budget += increment; perTurn = min(cap, budget); budget -= perTurn`. The budget holds only time not currently on the clock, and the invariant `totalRemainingTime = budget + perTurn` holds at every instant. 01-REQ-037 now states the deduction; §2.9's pseudocode carries the `budgetMs -= perTurnMs` line; DOWNSTREAM IMPACT note 5 flags the carve-out alongside the credit-back as the two easy-to-miss steps module 04 must reproduce exactly.

**Rationale**: Without the deduction the budget is monotonically non-decreasing — every turn adds `increment`, declares add back clock time that was never subtracted, and expiry subtracts nothing — so the documented depletion behaviour ("when a team's budget depletes, their per-turn clock drops to the increment alone", informal spec chess-timer section and the platform README) is unreachable, and 01-REQ-038's phrase "added *back* to its budget" refers to a withdrawal that never happened. The prior text was therefore internally inconsistent, not merely under-specified: 01-REQ-038's wording and the depletion behaviour both presuppose carve-out accounting. Under the prior formulas, a team declaring instantly every turn accumulates `initial + turns × (increment + cap)` rather than `initial + turns × increment`; a budget-accumulation test (`packages/engine/src/clock.test.ts`) pins the corrected arithmetic.

**Informal spec reference**: §chess timer ("A team can declare turn over early, returning unused clock time to its budget… When a team's budget depletes, their per-turn clock drops to the increment alone").

**Affected requirements/design elements**: 01-REQ-037 (deduction and `budget + perTurnClock` invariant added); §2.9 turn-start pseudocode (`budgetMs -= perTurnMs` line and invariant paragraph added); §3.10 DOWNSTREAM IMPACT note 5 (carve-out flagged). Downstream cascade: [04] 04-REQ-030/035 and §2.6/§2.7-Step-8 pseudocode (see 04-REVIEW-023). Implementation: `packages/engine/src/clock.ts` (`applyTurnStart`).

---

### 01-REVIEW-020: Phase 9a cancellation removes active effects only — design pseudocode discarded pending entries — **RESOLVED**

**Type**: Correction
**Phase**: Design

**Prior text**: 01-REQ-031 has always been explicit: "Cancellation removes active effects only; pending effects scheduled by a Phase 6 rebuild in the same turn (01-REQ-047) are not discarded and proceed to application in Phase 9 step (b) normally. A same-turn re-collection therefore supersedes a disruption-triggered cancellation of the same family." The Design section contradicted it in two places: §2.7's cancellation-semantics bullet said "every active family-F effect is removed from every alive member of the team, **and every pending family-F entry scheduled this turn for that team is discarded**", and §2.8's Phase 9a pseudocode called `removePendingOfFamily(mate, family)` inside the cancellation loop. §2.8's 9b comment ("Any pending entry that survived 9a is applied") presupposed the same discard.

**Correction**: The requirement is right; the design text was wrong. The design agrees with 01-REQ-031 throughout: §2.7's cancellation semantics state that team rebuild claims recorded in the same turn are unaffected by cancellation claims and apply normally at the commit, and 01-REQ-050(b) fixes the commit's effect order as cancel → rebuild (replace-semantics) → expire. (The claim/commit vocabulary these statements use is defined by 01-REVIEW-022.)

**Rationale**: Requirements bind over design (SPEC-INSTRUCTIONS Rule 5), and the requirement's behaviour is also the better game rule: the Phase 6 team rebuild represents a *fresh* potion collection this turn, and killing the old collector should not void the new collection — the new rebuild carries its own fresh weak-link debuff-holder for opponents to target. Discarding pending entries in 9a would make a same-turn "collector dies + teammate re-collects" sequence produce an effect-less team, punishing exactly the play (re-securing the buff under pressure) the potion mechanic is designed to reward. A test pins the supersede behaviour (`packages/engine/src/resolve-effects.test.ts`, "lets a same-turn re-collection supersede the cancellation").

**Affected requirements/design elements**: §2.7 cancellation semantics; 01-REQ-050(b)'s commit-order statement. 01-REQ-031 unchanged (already correct). Implementation: `packages/engine/src/resolve/commit.ts`.

---

### 01-REVIEW-021: Reference-state resolution principle — **RESOLVED**

**Type**: Correction
**Phase**: Requirements

**Prior text**: 01-REQ-044d compared "body segments after Phase 2", and 01-REQ-044's preamble established the post-Phase-2 board as Phase 3's "single reference state" — but §2.8's pseudocode undermined both: sub-step 3b truncated `victim.body` inline the moment a sever was found, and sub-step 3c then read live `s.body.length` for the head-to-head length comparison. A snake severed in 3b would therefore fight a same-turn head-to-head at its already-truncated length, making the outcome depend on the 3b-before-3c sub-ordering that 01-REQ-044's "no sub-ordering within Phase 3" language forbids. The reference-state discipline existed piecemeal (01-REQ-033 for effects, 01-REVIEW-002's snapshot doctrine for collision *targets*) but was never stated as a general principle covering every read class, so each new read had to get the discipline right independently — and the length read didn't.

**Correction** (direction from human): interaction outcomes — head-to-head resolution included — are determined entirely by state from the end of the previous turn, never by partially-resolved within-turn state. The general rule is stated in §2.8 as the **reference-state resolution principle**: interaction outcomes within a turn are pure functions of the snapshot, the staged moves, and the turn seed; mutations produced by outcomes (deaths, severed segments, effect changes) are applied only at the commit and are never read by outcome logic. Concretely: 01-REQ-044 enumerates the reference-state reads and keeps every snake's moved body on the logical board for the whole turn regardless of same-turn outcomes; 01-REQ-044d pins head-to-head length to the snapshot, explicitly unaffected by same-turn severing; §3.9 carries the principle as an invariant. The staged rule/claim/commit structure that operationalises the principle is specified by 01-REVIEW-022.

**Rationale**: Order-of-operations fragility is the failure mode: when outcome logic can observe another outcome's mutation, correctness rests on hidden sub-step precedence, and any future re-ordering (or parallel evaluation) silently changes game results. Making interaction evaluation order-free eliminates that class of defect structurally rather than case-by-case. Move projection is admissible as a reference input because it is a deterministic mechanical projection of the snapshot plus staged moves — it carries no interaction outcomes.

**Complexity reductions the principle yields**:
- *Interaction resolution is declarative.* With all reads reference-state-sourced and all mutations deferred to the commit, the collision, health, and collection rules are order-independent predicates over one board configuration — reordering, merging, or parallelising them cannot change outcomes.
- *Effect immutability needs no snapshot structure.* 01-REQ-033's discipline (only the commit writes `activeEffects`) is this same principle applied to effect state; 01-REVIEW-014's removal of the `FrozenEffectState` structure is an instance of the pattern. Naming the principle lets future state additions reuse it instead of reinventing per-field freeze rules.
- *Simultaneous multi-sever collapses to arithmetic.* Several attackers severing one victim need no pairwise ordering: each pair resolves against the reference state, and the commit truncates once at the minimum contact index.
- *Replay/event determinism.* Because outcomes are functions of (snapshot, moves, seed), the event stream is derivable without recording any evaluation order, which is what lets 01-REQ-052's canonical ordering be purely presentational.

**Boundaries of the principle** (deliberate, not latent defects):
1. *Move projection is within-turn data but admissible.* The principle is scoped to *interaction outcomes*; moved heads and bodies are mechanical projections of the snapshot plus staged moves and therefore belong to the reference state.
2. *Derived rules read claims.* Effect cancellation is triggered by this-turn disruption claims crossed with snapshot debuff identity (01-REQ-045) — a two-tier structure (claims about state, then claims about claims), not a violation: derived rules still never read committed state.
3. *Accepted corollaries.* An attacker entering a segment that another attacker severs in the same turn still resolves against it (the segment exists in the reference state though it is gone by turn end), and a severed snake fights any same-turn head-to-head at its snapshot length. These match player expectations: the effect of one's move is determined by the state visible when the move was chosen, plus only the parallel movements of other snakes.

**Affected requirements/design elements**: 01-REQ-044 (reference-state read enumeration; severed bodies remain on the logical board for the whole turn); 01-REQ-044d (length pinned to the snapshot); §2.8 (reference-state resolution principle stated); §3.9 invariants (order independence). Implementation: `packages/engine/src/resolve/` (rules read only `TurnContext` + claims; the commit is the sole writer).

---

### 01-REVIEW-022: Staged parallel-rule turn resolution — snapshot + claims + commit — **RESOLVED**

**Type**: Amendment
**Phase**: Requirements

**Prior text**: 01-REQ-041 defined turn resolution as eleven sequential phases (Move Collection, Snake Movement, Collision Detection, Pending Effect Recording, Health/Hazards/Food, Potion Collection, Food Spawning, Potion Spawning, Effect Application and Expiry, Win Condition Check, Event Emission). Semantics were attached to phase positions: a snake that died in Phase 3 did not eat in Phase 5 or collect in Phase 6 ("surviving snake" gates); Phase 5 applied tick → hazard → food-heal → starvation as an explicit sequence; growth used an `ateLastTurn` flag set in Phase 5 and consumed by the next turn's Phase 2 tail-retention branch, so head-to-head length required the post-Phase-2 (not snapshot) count; team rebuilds were staged in a `pendingEffects` field on `SnakeState`, written in Phase 6 and drained in Phase 9; contested-cell item collection was implicitly resolved by the Phase 3 → Phase 5/6 ordering (the head-to-head survivor was the only "surviving snake" left to collect); death causes distinguished `starvation` from `hazard` by an attribution rule; `snake_moved` events carried a `grew` flag. The reference-state discipline existed (01-REQ-033, 01-REVIEW-021) but cross-phase gating still made a new mechanic's behaviour depend on which phase it was assigned to.

**Amendment** (direction from human): turn resolution is restructured as **snapshot → parallel rules → deterministic commit**, with these decisions:

1. **Stage model** (01-REQ-041): Move Projection → Head-to-Head Precedence → Interaction Rules → Derived Rules → Commit → Item Spawning → Win Check → Event Derivation. Interaction rules are pure functions of `(snapshot, surviving moved-head set H*, turn seed)` emitting claims; derived rules read claims + snapshot; the commit is the sole writer. Rule evaluation within a stage is order-free.
2. **Growth as a doubled tail cell** (01-REQ-062): eating on turn T duplicates the final tail segment at turn T's commit (after severing). Movement becomes unconditionally `[newHead] ⧺ body[0..len−2]` (01-REQ-043), the `ateLastTurn` field is removed from `SnakeState` (01-REQ-004), and head-to-head length is read directly from the snapshot — the grown length is "already waiting" there.
3. **Head-to-head precedence** (01-REQ-044d): head-to-head resolution runs first and withdraws losing heads from the moved-head set consumed by every other rule. Losers collect nothing, enter no hazard, and trigger no body collisions; their bodies remain on the logical board and their deaths commit at end of turn. This guarantees at most one surviving head per cell — items are collected by exactly one winning entrant or nobody.
4. **Death does not gate collection** (01-REQ-046c, 01-REQ-047): any snake whose surviving moved head reaches a cell claims what is on it, even if it also dies this turn by a non-head-to-head cause (body collision, health depletion, or future mechanics). A collector killed in its collection turn still triggers the team rebuild; its debuff rests on a corpse that can never be disrupted, so the team's buffs run their full course — the accepted reward for a sacrificial collection play.
5. **Parallel health resolution** (01-REQ-046): damage claims (tick, hazard, future sources) sum; a heal claim resolves health to `MaxHealth`; `alive` requires resolved health > 0 alongside the independent certain-death channel. The `starvation`/`hazard` cause split is replaced by a single `health_depletion` cause carrying its contributing `DamageSource` set.
6. **`pendingEffects` removed from `SnakeState`** (01-REQ-004, 01-REQ-028): team rebuilds are intra-turn claims resolved at commit; nothing pends across turns (the field was provably always empty at turn boundaries).
7. **Collector disruptability unchanged** (01-REQ-045): cancellation triggers read snapshot debuff holdings only — a collector becomes disruptable from the turn after its debuff commits, never in the collection turn.
8. **Events** (01-REQ-052, §2.11): `snake_moved` loses `grew` (growth observable via `food_eaten` + committed body); `snake_died` gains optional `sources` for `health_depletion`; canonical ordering becomes event-class-major (movement → death → severing → food → potion → spawns → effect application → effect cancellation) with a fixed death-cause precedence (`head_to_head > wall > self_collision > body_collision > health_depletion`).
9. **Commit order fixed and centralised**: health resolution; death union; body mutation move → sever (min contact index) → grow; effect resolution cancel → rebuild → expire; item consumption. Sever-then-grow per human direction.

**Rationale**: The eleven-phase pipeline distributed ordering semantics across the whole specification: every new mechanic required choosing a phase, and cross-phase gates ("surviving snake") coupled rules together. Under the staged model a new mechanic is one rule emitting claims (plus, for a new claim type, one commit clause) — no pipeline position, no ordering audit. The player-intuition framing: the effect of one's move is determined by the state visible when the move was chosen plus only the parallel movements of other snakes; all other state remains known and static for interaction resolution. Behavioural deltas accepted with the amendment: growth is visible in state one turn earlier (same board occupancy and identical collision outcomes); a snake dying by body collision or health depletion now collects items its head reached (previously impossible for potions, and food was forfeited); the head-to-head length comparison now differs for a snake that ate last turn versus the pre-amendment post-movement count in no case (the doubled tail preserves the same number).

**Informal spec reference**: Section 5 (turn phases) — superseded as the structural model; the informal spec's phase numbering survives only as the canonical event-class presentation order.

**Affected requirements/design elements**: 01-REQ-004 (fields removed), 01-REQ-021, 01-REQ-025, 01-REQ-026/027 (rebuild claims), 01-REQ-028, 01-REQ-031 (claim language), 01-REQ-033 (snapshot/commit wording), 01-REQ-041 (stage model), 01-REQ-042/043 (move projection), 01-REQ-044/a/b/c/d (parallel collision rules, head-to-head precedence), 01-REQ-045 (derived cancellation rule), 01-REQ-046/a–d (parallel health), 01-REQ-047 (potion rule, dead-collector semantics), 01-REQ-048/049 (post-commit spawning), 01-REQ-050 (commit effect order), 01-REQ-051, 01-REQ-052 (event set), 01-REQ-062 (tail duplication); §2.1, §2.6, §2.7 (claims), §2.8 (rewritten), §2.10 (wording), §2.11 (events, cause precedence, class ordering), §3.2, §3.9, §3.10 (notes 1, 6, 7, 9). Downstream cascades: [02] 02-REQ-034 and §2.13 wording (see 02-REVIEW-009); [04] 04-REQ-004/006/015/028/036/037/038/040/043/045/051/060, `SnakeStateRow` schema, initial-state payload, event table and TS payload types (see 04-REVIEW-024). Implementation: `packages/engine/src` (`types.ts`, `resolve/`, `validate.ts`, tests).
