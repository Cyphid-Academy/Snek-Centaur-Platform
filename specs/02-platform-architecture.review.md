# Module 02 — Platform Architecture: Decision Log

Resolved REVIEW items from [`specs/02-platform-architecture.md`](02-platform-architecture.md). See [`SPEC-INSTRUCTIONS.md`](../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 02-REVIEW-001: Informal spec version drift — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: At the time this module was authored, `SPEC-INSTRUCTIONS.md` and the informal-spec file on disk used different version suffixes in their filenames, raising a question about whether requirements in this module had been extracted from the correct source. The informal spec has since been renamed to drop its version suffix entirely (`informal-spec/team-snek-centaur-platform-spec.md`), and `SPEC-INSTRUCTIONS.md` has been updated to match, so the version-mismatch concern no longer applies. Requirements in this module were extracted from the content that is now the canonical (unversioned) informal spec.
**Question**: Confirm the current informal spec is the source of truth and that no requirements need to be carried forward from any earlier draft.
**Options**:
- A: Current informal spec is canonical; no carry-forward.
- B: Earlier drafts matter; needs reconciliation pass before module 02 is considered complete.
**Informal spec reference**: N/A (meta-question).

**Decision**: A — the current informal spec is canonical; no carry-forward from earlier drafts.
**Rationale**: The renamed file is the current informal spec. The earlier filename-version mismatch was a documentation drift issue and is resolved by the rename; it does not invalidate any module authoring done against the same content.
**Affected requirements/design elements**: None. This is a meta-question about source material; all of module 02's requirements were extracted from the current informal spec and remain as drafted.

---

### 02-REVIEW-002: "Single Convex deployment" — hard constraint or current implementation? — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec (§2, "Convex (Unified Platform)") states "A single Convex instance manages all persistent state." 02-REQ-002 elevates this to a testable architectural requirement. It is unclear whether this is a binding architectural constraint (e.g., precludes future sharding of Convex by region) or a description of the current single-instance deployment.
**Question**: Should the requirement remain "exactly one" or be relaxed to "all persistent state lives within the Convex platform" without quantifying the deployment count?
**Options**:
- A: Hard "exactly one" constraint, as currently written.
- B: Relax to "Convex is the persistent platform substrate" with no deployment-count claim.
**Informal spec reference**: §2, "Convex (Unified Platform)".

**Decision**: A — hard "exactly one Convex deployment" constraint.
**Rationale**: Single-deployment is a load-bearing architectural commitment, not merely a description of current state. Downstream modules (especially [05] for platform-wide tables and [06] for Centaur state) will rely on a single Convex schema namespace and transactional boundary. If the platform ever needs to shard Convex, that is a breaking architectural change that should go through explicit revision of this requirement, not silent relaxation.
**Affected requirements/design elements**: 02-REQ-002 (unchanged; wording already asserts "exactly one").

---

### 02-REVIEW-003: Auto-created next-game-in-room implicit STDB provisioning — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: §9.4 step 7 says "A new game is auto-created in the room inheriting config" after a game ends. 02-REQ-020 asserts STDB instances are not reused across games and each game gets its own freshly provisioned instance. This implies the auto-created next game also gets a new STDB, but the informal spec does not explicitly state this for the non-tournament case. The same principle is stated only for tournament rounds in §9.4 step 4.
**Question**: Does the "fresh STDB per game" rule apply uniformly to (a) tournament rounds, (b) non-tournament auto-created next games in a persistent room, and (c) any other game-creation path? 02-REQ-020 currently asserts (a) and (b) on the assumption that uniformity is intended.
**Options**:
- A: Uniform — every game-creation path provisions a fresh STDB. (Assumed by current draft.)
- B: Non-uniform — some game-creation paths reuse instances. Identify which.
**Informal spec reference**: §9.4 steps 4 and 7.

**Decision**: A — uniform, with an important clarification that reshapes how game lifecycle is expressed in this module. A SpacetimeDB instance is not provisioned until a game is *started* (launched). Auto-creation of a successor game on Convex produces a new **unstarted, mutable** game record whose configuration is inherited from the predecessor and may be edited further. When that successor is subsequently launched, the Convex config is frozen and passed to a freshly provisioned STDB instance. This entire pattern — pre-launch mutable Convex record, config freeze at launch, fresh STDB per launch — is uniform across tournament and non-tournament paths, and is independent of tournament dynamics.
**Rationale**: Chris clarified that STDB provisioning is tied to *game start*, not to *game record creation*. This invalidates the original draft's implicit conflation of "game" with "STDB instance" at creation time. The corrected model cleanly separates two lifecycles: a Convex game record (mutable while unstarted, frozen on launch, terminal on end) and an STDB instance (provisioned at launch, torn down after end and replay persist). Making this uniform across all game-creation paths removes special cases for tournament vs non-tournament.
**Affected requirements/design elements**: 02-REQ-003 (updated to distinguish started/unstarted games and forbid STDB for unstarted), 02-REQ-019 (updated to say "at the moment a game is launched"), 02-REQ-020 (updated to assert uniformity across all game-creation paths explicitly), 02-REQ-050 (new — pre-launch mutable Convex config, frozen at launch), 02-REQ-051 (new — successor auto-creation is Convex-only and uniform across tournament/non-tournament).

---

### 02-REVIEW-004: STDB instance isolation as proposed addition — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: 02-REQ-004 asserts that SpacetimeDB instances are mutually isolated. This is implicit in the "one per active game" topology but is not stated explicitly anywhere in the informal spec. It is being added as a foundational architectural invariant on the basis that any contrary design would have major security and correctness implications.
**Question**: Confirm this addition is intended.
**Options**:
- A: Add as a hard requirement (current draft).
- B: Drop as redundant with "one per active game" — instance isolation is presumed but not asserted.
**Informal spec reference**: N/A (proposed addition).

**Decision**: A — keep as a hard requirement.
**Rationale**: Instance isolation is load-bearing for security reasoning (a compromised Centaur Server for game X must not be able to affect game Y's state) and is too important to leave implicit. Making it explicit at the architectural level anchors downstream [04] design choices about authentication scope and subscription boundaries.
**Affected requirements/design elements**: 02-REQ-004 (unchanged from initial draft).

---

### 02-REVIEW-005: "Real-time bidirectional channel" vs naming the transport — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: §2 of the informal spec explicitly names WebSocket as the transport between SpacetimeDB and its clients (Centaur Servers, web clients). The spec instructions forbid requirements from referencing implementation artifacts. The current draft uses neutral phrasing ("real-time bidirectional channel") rather than naming WebSocket, on the basis that the choice of transport is an implementation concern of the SpacetimeDB platform itself, not a domain requirement.
**Question**: Is the neutral phrasing correct, or does the platform deliberately constrain itself to WebSocket as a binding architectural choice that should appear in requirements?
**Options**:
- A: Neutral phrasing — transport is implementation detail. (Current draft.)
- B: Name WebSocket as a binding constraint at the requirements level.
**Informal spec reference**: §2, "Infrastructure Topology" diagram and "SpacetimeDB (Game Runtime)".

**Decision**: B — name WebSocket explicitly in client-connection requirements.
**Rationale**: SpacetimeDB itself is a hard architectural choice for the game runtime (not an implementation detail), and the WebSocket client protocol is imposed by SpacetimeDB. Since the platform commits to SpacetimeDB, it inherits the WebSocket constraint, and that constraint should be visible in requirements so that downstream modules ([04], [08]) plan around it rather than presuming transport flexibility that does not exist. The "no implementation artifacts" rule applies to internal implementation choices (libraries, table names), not to the external contract surface of a chosen runtime.
**Affected requirements/design elements**: 02-REQ-023 (Snek Centaur Server → STDB, now "WebSocket subscription"), 02-REQ-038 (operator → STDB, now "via WebSocket"), 02-REQ-041 (spectator → STDB, now "via WebSocket"). 02-REQ-009 was left behavioral ("real-time state synchronization without per-turn polling") because it describes what the runtime delivers, not how a specific client connects.

---

### 02-REVIEW-006: Replay data retrieval pattern — **RESOLVED**

**Type**: Ambiguity
**Phase**: Design
**Context**: 02-REQ-022 allows any retrieval pattern for obtaining the game log from SpacetimeDB at game end — Convex-pull, runtime-push, or bundled in the game-end notification. The design section (2.14) describes the flow abstractly without committing to a specific pattern, because the choice is owned by [04] and [05].
**Question**: Should module 02's design commit to a specific retrieval pattern, or leave it to downstream modules as currently drafted?
**Options**:
- A: Leave to [04]/[05] — module 02 specifies only that retrieval and persistence must complete before teardown.
- B: Commit to Convex-pull (Convex calls a SpacetimeDB HTTP endpoint to fetch the log).
- C: Commit to runtime-push (SpacetimeDB pushes the log to a Convex HTTP action in the game-end notification).
**Informal spec reference**: §9.4 step 8, §13.1.

**Decision**: A — leave the retrieval pattern to [04]/[05]; module 02 specifies only that retrieval and persistence must complete before teardown.
**Rationale**: The existing design text (§2.14) and 02-REQ-022 already defer the retrieval pattern to downstream modules, stating the choice is "at [04]/[05]'s discretion per the requirement." Committing to a specific pattern at the architectural level would over-constrain [04] and [05] without adding value — the correctness invariant that matters to module 02 is that the complete game log is persisted before instance teardown (02-REQ-021), not the mechanism by which it is obtained. Both Convex-pull and runtime-push are viable, and the choice depends on [04]'s notification design and [05]'s action topology, which are not yet finalised. This resolution confirms the current draft stance.
**Affected requirements/design elements**: None — 02-REQ-022 and the §2.14 design text already align with this decision and require no changes.

---

### 02-REVIEW-008: Tournament forfeit-on-invitation-refusal — lifecycle diagram update — **RESOLVED**

**Type**: Behavioural correction (downstream)
**Phase**: Design
**Context**: Resolution of 03-REVIEW-012 introduced forfeit semantics for tournament games when Centaur Servers refuse or time out on a game invitation. This module's §2.14 game-start step list and the lifecycle diagram in the same section described the `not-started → playing` transition as gated on "invitations accepted", and listed no alternative paths out of `not-started`. The diagram and prose needed to be updated to reflect (a) that for tournament games, invitations may resolve with some teams forfeiting rather than aborting the launch, (b) that `initialize_game` is now called with a snake roster restricted to accepting teams (forfeiters' snakes never spawn), and (c) that a tournament game whose invitations resolve with 0 or 1 acceptances transitions directly from `not-started` to `finished` as a walkover or no-contest without entering `playing`.

**Decision**: Update §2.14 step 5/6 prose to describe invitations being "resolved" rather than "accepted by all servers", reference [03-REQ-056] for the differentiated semantics, and note the restricted-roster `initialize_game` call. Update the lifecycle diagram to add a second arrow out of `not-started` representing the tournament walkover/no-contest transition. Update the prose immediately following the diagram to add a `not-started → finished` bullet alongside the existing `not-started → playing` bullet.

**Rationale**: §2.14 is the architectural overview of the game lifecycle; downstream modules (especially [05]) rely on its diagram and step list being aligned with the binding semantics in [03] and [05]. Leaving the diagram showing only "invitations accepted" would mislead a reader into thinking the all-or-nothing model still applies universally. The amendments are descriptive — all the binding requirements live in [03] and [05]; this module just mirrors them.

**Affected requirements/design elements**: §2.14 step 5/6 prose updated; lifecycle diagram in §2.14 amended to add the tournament walkover transition; the `not-started → playing` and new `not-started → finished` bullet list following the diagram updated. No requirement-level changes in module 02. See 03-REVIEW-012 and 05-REVIEW-016 for the upstream changes.

---

### 02-REVIEW-007: Spectator visibility — no-team vs. opponent-equivalent — **RESOLVED**

**Type**: Ambiguity
**Phase**: Design
**Context**: 02-REQ-041 states spectators are subject to invisibility filtering "on the same terms as opponent team connections." Spectators belong to no team. The RLS rule must determine what a no-team connection sees. Two interpretations: (a) spectators see the union of what all teams see (i.e., all snakes including invisible ones), or (b) spectators see the intersection (i.e., invisible snakes of *every* team are hidden). The requirement text ("on the same terms as opponent team connections") implies (b) — spectators are treated as opponents of all teams.
**Question**: Confirm that spectators cannot see any team's invisible snakes (option B), consistent with the requirement text.
**Options**:
- A: Spectators see all snakes (union). Invisible snakes are hidden only from opponent *team* connections, not from unaffiliated spectators.
- B: Spectators see no invisible snakes (intersection). They are treated as opponents of every team for RLS purposes.
**Informal spec reference**: §8.5 ("Spectators connect with a read-only admission ticket").

**Decision**: B — spectators see no invisible snakes (intersection semantics). Spectators are treated as opponents of every team for RLS purposes.
**Rationale**: Spectators belong to no team. The RLS invisibility rule hides a team's invisible snakes from all connections that are not affiliated with that team. Since a spectator is not affiliated with any team, they are opponents of every team, and every team's invisible snakes are hidden from them. This is the natural reading of 02-REQ-041's "on the same terms as opponent team connections" and produces the most conservative, leak-free visibility policy. The union interpretation (Option A) would grant spectators strictly *more* visibility than any team player — a counterintuitive privilege that would undermine the strategic value of invisibility. The intersection interpretation preserves the competitive integrity of the invisibility mechanic for all observers.
**Affected requirements/design elements**: 02-REQ-041 tightened to explicitly state that spectators see no invisible snakes of any team, removing the ambiguity of the "same terms as opponent team connections" phrasing. §2.18 spectator connection model description already contains explicit language ("spectators cannot see invisible snakes of any team") and requires no changes.
