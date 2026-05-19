# Module 05 — Convex Platform: Decision Log

Resolved REVIEW items from [`specs/05-convex-platform.md`](../05-convex-platform.md). See [`SPEC-INSTRUCTIONS.md`](../../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 05-REVIEW-001: Convex retention of admission-ticket validation secret — **RESOLVED (obsolete)**

**Type**: Ambiguity
**Phase**: Requirements
**Original context**: This review item asked how Convex should store and manage the per-instance HMAC admission-ticket validation secret — whether in the `games` row, a separate secrets table, or retained indefinitely for audit.
**Resolution**: The OIDC auth redesign eliminates per-instance signing secrets entirely. Convex now maintains a single platform-wide RSA key pair (private key in `SPACETIMEDB_SIGNING_KEY` env var, public key served via OIDC JWKS endpoint) for signing all SpacetimeDB access tokens. No per-game secret is generated, stored, or cleaned up. 05-REQ-034 has been rewritten to reflect this. The storage, lifecycle, and cleanup questions that motivated this review item no longer apply.

---

### 05-REVIEW-002: Room deletion and game history preservation — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 05-REQ-021 asserts that a room's lifetime is independent of its games and persists until explicit deletion, but neither the informal spec nor the draft specifies what happens to historical games, replays, and action logs when a room is deleted.
**Decision**: Option A — Rooms cannot be deleted; they can only be archived/hidden from listings while preserving all historical games, replays, and action logs.
**Rationale**: Deletion of a room would cascade to or orphan historical game records, violating [03-REQ-047]'s requirement for stable historical attribution. Archiving achieves the user's intent (hide unused rooms) without data loss. Archived rooms can be unarchived if needed.
**Affected requirements/design elements**: 05-REQ-021 amended to state rooms persist indefinitely with archive-only semantics. 05-REQ-021a added for the archive mechanism.

---

### 05-REVIEW-003: Roster freeze across tournament rounds — **RESOLVED**

**Type**: Gap (inherited)
**Phase**: Requirements
**Decision**: Option B — Tournament-wide freeze from first-round start to final-round end; inter-round interludes remain frozen.
**Rationale**: Allowing roster mutations during inter-round interludes would create a confusing competitive environment where teams can swap members between rounds of a single tournament. The tournament is a coherent competitive unit; its roster should be stable throughout. This is operationally simpler than per-round freezing, and prevents strategic roster manipulation between rounds.
**Affected requirements/design elements**: 05-REQ-064 amended to state tournament-wide roster freeze. Design §2.15 implements the freeze check against the `tournaments` table status.

---

### 05-REVIEW-004: Captain authorization scope bounding of API keys — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Decision**: Admin-only simplification. API keys are an admin-only affordance with global access. Only admin users can create API keys; the per-user scope-bounding mechanism is eliminated.
**Rationale**: The original design required live scope resolution on every request — re-resolving the creator's current permissions, which is complex and has surprising behaviour (scope shrinks if the creator is demoted). Since the HTTP API is intended for programmatic platform management rather than per-user automation, restricting API keys to admin users eliminates this complexity. Admin scope is inherently global, so no scope resolution is needed. This matches the most common deployment pattern where API keys are created by platform operators, not individual team members.
**Affected requirements/design elements**: 05-REQ-045 amended (admin-only authorization). 05-REQ-046 amended (creator must be admin). 05-REQ-047 amended (global admin scope replaces live scope resolution). 05-REQ-051 amended (admin-only creation). 03-REQ-033 and 03-REQ-035 in Module 03 amended to reflect admin-only creation and global scope.

---

### 05-REVIEW-005: Who sees game_start — timing vs who knows the config — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Decision**: Option A — Keep only `game_start` firing at the `not-started → playing` transition. No `game_created` or `game_will_start` event.
**Rationale**: Adding a `game_created` event would fire when the not-started game is created (which happens automatically on room creation and after every game end). This would be noisy and of limited value — the config is still editable at that point. The `game_start` event fires when config is frozen and the game is actually playable, which is the moment subscribers care about. Subscribers who want to pre-stage spectator clients can subscribe to the Convex reactive query on the game record and watch for `status === "playing"`.
**Affected requirements/design elements**: None — 05-REQ-054 stands as drafted.

---

### 05-REVIEW-006: Final scores shape and domain meaning — **RESOLVED (moot)**

**Type**: Gap
**Phase**: Requirements
**Decision**: Already defined upstream. Scoring is defined by Module 01 §1.9 (see resolved 01-REVIEW-018 for the current normalised formula). The `GameEndNotification` payload from Module 04 (§3.3) delivers `GameOutcome` with `scores: Record<string, number>` carrying the normalised real-valued scores. Convex consumes these scores directly from the notification — no separate computation needed.
**Rationale**: Module 01 Phase 2 is now complete and defines scores explicitly. Module 04's exported `GameEndNotification` delivers the scores in a JSON-serializable format. Convex stores the outcome directly from the notification payload. *(Note: the original decision text referenced the integer body-length score; the current scoring formula is the normalised body-share formula defined by 01-REVIEW-018, which supersedes the prior integer-sum rule.)*
**Affected requirements/design elements**: None — 05-REQ-038 consumes scores from the notification payload as originally intended.

---

### 05-REVIEW-007: "Ready check" semantics and where readiness lives — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Decision**: Option B — Readiness is a field on the game record from game creation onward; the not-started game is created eagerly to hold it. Only the Captain of a Centaur Team is allowed to declare their team ready — no other team member can mark ready. Ready state is cleared whenever a new game is auto-created.
**Rationale**: Storing readiness on the game record (via `readyTeamIds` array) is natural because readiness is inherently per-game — a team ready for game N is not automatically ready for game N+1. The Captain-only restriction aligns with the Captain's role as the team's authorized representative for game-start decisions. Clearing ready flags on auto-create prevents stale readiness from a previous game from triggering an unintended start.
**Affected requirements/design elements**: 05-REQ-031 amended to specify readiness on game record, Captain-only, and clearing on auto-create.

---

### 05-REVIEW-008: Non-tournament auto-create — who owns the room's "current game" invariant — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Decision**: Clarified architecture. The room holds no config state — it is a dumb container for a succession of games with exactly one game being live and editable at a time. All config values live on the game object. When a game finishes, Convex atomically copies its config section into a fresh game object that becomes the new singular live editable not-started game for the room. Tournament-scheduled games follow the same mechanic (game object holds config, room points to it); the only difference is tournament games are auto-started on the tournament schedule without waiting for captain ready declarations. Convex's built-in mutation atomicity prevents race conditions.
**Rationale**: Placing config on the game object rather than the room eliminates the race condition between auto-create and concurrent room parameter edits — there is no room-level config to race against. The room's `currentGameId` pointer provides a single source of truth for which game is currently active. Auto-create atomically creates the new game and updates `currentGameId` in one mutation.
**Affected requirements/design elements**: 05-REQ-016 amended (rooms have no config state). 05-REQ-019 amended (room creation also creates initial game). 05-REQ-022 amended (config on game only). 05-REQ-024 amended (config editable while not-started, frozen at start). 05-REQ-032b amended (board preview on game record). 05-REQ-039 amended (auto-create copies from finished game).

---

### 05-REVIEW-009: Healthcheck failure during game-start orchestration — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Decision**: Differentiated by game type. For manually-started games: if a participating CentaurTeam fails healthcheck during game-start, the game returns to `not-started` status with a healthcheck failure message and visual indicator of which CentaurTeams' servers are failing. The game cannot be manually started until all teams pass healthcheck. For tournament games that are forcefully started on schedule: failing healthcheck is ignored. If the CentaurTeam can get their server running in time to participate, they may; otherwise they lose by default.
**Rationale**: Manual games should not start if a participating server is down — the room admin needs to resolve the issue first, and starting a game with a dead server wastes a SpacetimeDB instance. Tournament games, however, must start on schedule regardless of server health — the tournament timeline cannot be delayed by one team's server issues. This mirrors competitive esports where a team that fails to connect by match time forfeits.
**Affected requirements/design elements**: 05-REQ-036 amended with differentiated healthcheck behaviour.

---

### 05-REVIEW-010: Transitive dependency on Module 01 exported interfaces — **RESOLVED (moot)**

**Type**: Gap
**Phase**: Requirements
**Decision**: Module 01 Phase 2 is complete; its Exported Interfaces section is available. No action needed beyond recording the resolution.
**Rationale**: The concern that prompted this review item (that Module 01's exported types might not align with the informal references used in Module 05) has been resolved by Module 01's Phase 2 completion. All domain types referenced by Module 05 (`BoardSize`, `GameConfig`, `GameOutcome`, `BoardGenerationFailure`, `generateBoardAndInitialState`) are now formally exported by Module 01.
**Affected requirements/design elements**: None.

---

### 05-REVIEW-011: Centaur Team deletion — whether historical references should soft-delete or be allowed at all — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Decision**: Option B — Disallow deletion; provide an archive flag that hides the team from listings and new game enrolments but preserves all live and historical state.
**Rationale**: Deletion of a team, even with cascade to live state and preservation of historical snapshots, creates a degraded experience: the team would no longer appear in leaderboards, profile pages, or team browsers, even though its historical games remain. Archiving achieves the same user intent (hide an inactive team) without losing the team's platform presence. Archived teams can be unarchived if the team becomes active again. This parallels the room archiving decision in 05-REVIEW-002. Note: [06-REQ-041]'s cascade reference to team deletion no longer applies — since teams are never deleted, no cascade is needed.
**Affected requirements/design elements**: 05-REQ-015a amended to replace deletion-with-cascade with archive-only semantics.

---

### 05-REVIEW-012: Per-Centaur-Team game credential scope and lifetime — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Decision**: The per-CentaurTeam game credential JWT has a 2-hour `exp` claim. The credential is strictly scoped to a game instance and becomes useless once that STDB instance is torn down, so there is no need for precise revocation at game-end time. The 2h expiry is well beyond the longest realistic game duration.
**Rationale**: Module 03's design (§3.15) already specifies the game credential as an Ed25519-signed JWT. The `exp` claim provides a hard upper bound on credential validity. The effective lifetime is further bounded by Convex's enforcement that game credentials are only accepted for games with `status === "playing"` — once the game transitions to `finished`, the credential is functionally useless regardless of its `exp`. The 2h expiry provides a comfortable margin for long games while ensuring leaked credentials cannot be used indefinitely. No mid-game refresh mechanism is needed. Module 03's design (§3.15) has been updated to reflect the 2h expiry value per this resolution.
**Affected requirements/design elements**: No requirement amendments needed — the expiry value is a Design concern. The 2h value is reflected in the game-start orchestration design (Section 2.3.1 step 6).

---

### 05-REVIEW-013: Game invitation timeout value — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Decision**: Option A — Fixed timeout of 10 seconds.
**Rationale**: 10 seconds is generous enough for a healthy server to accept an invitation (the accept/reject decision is trivial — just store the credential and return) but short enough to avoid delaying game start for an unresponsive server. The timeout is hardcoded rather than configurable because there is no user-facing need to adjust it — servers are expected to respond promptly to invitations.
**Affected requirements/design elements**: 05-REQ-032 step 5 amended to specify the 10-second timeout.

---

### 05-REVIEW-014: Timekeeper role elimination and role model simplification — **RESOLVED**

**Type**: Simplification
**Phase**: Requirements / Design
**Context**: The informal spec §7.5 designates a "timekeeper" role responsible for operator-mode toggling and turn submission. The original formal spec modeled this as a per-member role in a `roles` array alongside `captain`. During MVP specification, the timekeeper role was identified as unnecessary complexity: (a) no UI affordance for assigning the timekeeper role had been specified, (b) the capabilities assigned to the timekeeper (mode toggling, turn submission) are naturally captain-level actions, and (c) a separate role introduces edge cases around role assignment, freeze semantics, and authorization checking that add no value for the initial platform.
**Decision**: Eliminate the timekeeper role entirely. Merge all timekeeper capabilities into the Captain. Captain designation is enforced structurally via `centaur_teams.captainUserId` (a reference to the captain's `users._id`), not via a per-member role field. The `centaur_team_members` table carries no role information — every member is an Operator. The `game_teams.rosterSnapshot` records each member's `isCaptain` boolean for historical attribution.
**Rationale**: The Captain is already the team's designated authority for game-start readiness, roster management, and server domain nomination. Adding turn-submission and mode-toggling to the Captain's responsibilities is natural and avoids introducing a second privileged role that has no independent lifecycle management. If a future version needs a distinct timekeeper, it can be added as a new field on the team record (analogous to `captainUserId`) without schema migration of the membership table.
**Affected requirements/design elements**: 05-REQ-011 amended (roles array removed; captain is structural property of team). 05-REQ-012 amended (timekeeper assignment removed; captain transfer via `captainUserId` update). 05-REQ-065 amended (simplified role language). Schema: `centaur_team_members.roles` field removed; `game_teams.rosterSnapshot` simplified to `{ operatorUserId, isCaptain }` *(per the 08-REVIEW-016 / 08-REQ-091a sweep: `email` removed from both the stored shape and the exported `GameTeamDoc.rosterSnapshot` — the snapshot is a logical membership record and does not duplicate user metadata; display names are resolved through the (email-free) `users` query path. Note that `users.email` is retained in storage for OAuth identity matching and admin operations, with exposure restricted to admin-only and caller-self surfaces.)*. Module 06 amended: `toggleOperatorMode` authorization changed from timekeeper to captain; `turn_submitted` event attributed to captain; 06-REVIEW-008 context updated. *(Amended per 08-REVIEW-011 resolution: `toggleOperatorMode` no longer exists — operator-mode is replaced by per-operator ready-state per [06-REQ-040b]; per-operator ready-state toggling via `setOperatorReady` is *not* a Captain-only authority (every operator owns their own ready-state). The Captain retains the turn-submit override per [08-REQ-065], which is the live successor to the captain-only authority noted here. Further amended per 08-REVIEW-024 resolution: per-operator ready-state itself is replaced by per-operator **tempo** (`setOperatorTempo` mutation), and the Captain gains an additional in-game `bootOperator` mutation per [08-REQ-068a] (a manual forced disconnect with no persistent state). The current [05-REQ-012] text is the live source of truth.)*

---

### 05-REVIEW-016: Tournament forfeit-on-invitation-refusal — orchestration reordering — **RESOLVED**

**Type**: Behavioural correction / orchestration reordering
**Phase**: Requirements / Design
**Context**: Resolving 03-REVIEW-012 (forfeit-on-invitation-refusal for tournament games) required the game-start orchestration in [05-REQ-032] and §2.3.1 to be reordered. Previously, `initialize_game` was called (step 4 / §2.3.1 step 5) before invitations were sent (step 5 / §2.3.1 step 6). With forfeit semantics, the snake roster passed to `initialize_game` must be restricted to accepting teams, so `initialize_game` must be called *after* invitations resolve. Additionally, the state machine must permit a new `not-started → finished` transition for tournament walkover (1 acceptance) and no-contest (0 acceptances) cases, and the game record must carry a forfeited-team list.

**Decision**: (a) Reorder `initialize_game` to follow the invitation step; the orchestration prepares the payload before invitations but defers the reducer call until after the accepted/forfeited partition is known. (b) Add a structured branching step ([05-REQ-032] step 5a, §2.3.1 step 6 branching) that handles tournament-game outcomes by `|acceptedTeamIds|`. (c) Add `forfeitedTeamIds` to the `games` row (05-REQ-027, 05-REQ-027a). (d) Permit `not-started → finished` as an additional state transition for tournament walkover/no-contest (05-REQ-028). (e) Non-tournament games retain all-or-nothing semantics.

**Rationale**: Reordering `initialize_game` is unavoidable once forfeits are possible — the STDB instance must not be initialised with snakes for teams that will not participate. The structured branching makes the tournament partitioning testable and explicit rather than buried in error-handling prose. The new direct `not-started → finished` transition is the cleanest way to represent walkovers and no-contests: the existing tournament round-chaining handler (Section 2.10) already fires off the `finished` transition, so chaining works unchanged.

**Affected requirements/design elements**: 05-REQ-027 amended (game record carries `forfeitedTeamIds` for tournament games). 05-REQ-027a added (field shape, scoring/ranking semantics). 05-REQ-028 amended (additional `not-started → finished` transition for tournament walkover/no-contest). 05-REQ-032 rewritten: step 4 prepares payload but defers call; step 5 sends invitations with 10s timeout and partitions teams; step 5a branches by tournament mode and `|acceptedTeamIds|`; step 6 calls `initialize_game` with restricted roster; step 7 calls `initializeGameCentaurState`. §2.3.1 game-start orchestration rewritten with matching step structure. See also 03-REVIEW-012 for the upstream behavioural rationale and 03-REQ-056 for the cross-module contract.

---

### 05-REVIEW-015: Callback token storage elimination and replay data bundling — **RESOLVED**

**Type**: Simplification / Architecture
**Phase**: Design
**Context**: The original design stored the game-outcome callback token in the Convex `games` table (`gameEndCallbackToken` field) and compared incoming callback tokens against the stored value. Separately, replay persistence used a Convex-pull pattern: after receiving the game-end notification, Convex scheduled a separate action to retrieve the complete historical record from the STDB instance via HTTP API calls, then tore down the instance in a further scheduled step. This introduced a multi-step asynchronous pipeline (notification → replay pull → teardown) requiring the STDB instance to remain alive throughout.

Two corrections were identified:

1. **Callback token storage is unnecessary.** The callback token is a JWT signed by Convex's own private key. Convex can validate it by verifying the RS256 signature and checking the claims (`iss`, `sub`, `aud`, `exp`) — exactly how any JWT issuer validates its own tokens. Storing the token and comparing against it adds a database field and a read operation for zero security benefit. The JWT's `sub` claim (`stdb-instance:{gameId}`) already binds it to a specific game.

2. **Replay data should be bundled in the game-end notification.** Since the STDB procedure (SpacetimeDB Procedures beta) already has `ctx.http.fetch()` and full read access to all tables, it can read the complete historical record and include it in the notification payload. This eliminates the need for a separate Convex-pull action, allows Convex to tear down the instance immediately upon confirming receipt, and reduces the total number of HTTP round-trips from 2+ (notification + multiple SQL queries + teardown) to 1+1 (notification-with-replay + teardown).

**Decision**: (a) Remove `gameEndCallbackToken` from the Convex `games` table schema. Convex validates incoming callback tokens purely by JWT signature verification and claims checking. (b) The STDB `notify_game_end` procedure bundles the complete `ReplayData` into the `GameEndNotification` payload. Convex processes the replay data inline within the game-end HTTP action and tears down the STDB instance immediately after successful storage. No separate scheduled replay-pull or teardown steps.

**Rationale**: Both changes follow the principle that JWTs are self-contained proofs of authority and should not require server-side storage for validation. Bundling replay data exploits the fact that the procedure already runs post-commit with full table access, and the expected payload size (≤ 300 turns × ≤ 6 teams) is well within HTTP request size limits. The simplified pipeline (single notification → inline processing → immediate teardown) is easier to reason about and reduces STDB instance lifetime.

**Affected requirements/design elements**: 05-REQ-032 step 4 amended (token not stored in Convex). 05-REQ-032a amended (no stored-token comparison). 05-REQ-037 amended (teardown integrated into game-end HTTP action). 05-REQ-038 amended (replay data bundled in notification; teardown integrated). Schema: `gameEndCallbackToken` field removed from `games` table. Section 2.3.2 game-end HTTP action rewritten (no stored-token check; inline replay processing and teardown). Section 2.13 replay persistence rewritten (inline processing of bundled data, not Convex-pull). Module 04 amended: `GameEndNotification` interface gains `replayData` field; §2.10 procedure updated to read and bundle replay tables; §2.11 rewritten from "Replay Export Mechanism" to "Replay Data Bundling"; 04-REVIEW-019 updated.

---

### 05-REVIEW-017: `boardSize` field type — pointer to 01-REVIEW-018 — **RESOLVED (pointer)**

**Type**: Pointer
**Phase**: Design

**Decision**: See resolved **01-REVIEW-018** in Module 01's decision log. That item is the source of truth for the cross-module decision to collapse `BoardSize` to a raw integer `number`. Module 05's Convex schema and parameter table have been updated accordingly: `boardSizeV` validator removed; `boardSize: v.number()` used directly in `gameOrchestrationConfigV`; the `config.orchestration.boardSize` row in the §5.5 parameter table updated to Integer type with default 13 and range 7–32; 05-REQ-032b updated to also reject `boardSize` values outside `[7, 32]` at the preview mutation boundary.

**Affected requirements/design elements**: 05-REQ-023 (`boardSize` row), 05-REQ-032b (board-size bound added to preview mutation), [05] §2.1 Convex schema (`gameOrchestrationConfigV`).

---

### 05-REVIEW-018: Walkover score value for sole-acceptor tournament branch — **RESOLVED**

**Type**: Amendment (cascade from 01-REVIEW-018)
**Phase**: Design

**Prior text**: The `= 1 accepted` branch of the tournament invitation-resolution logic ([05-REQ-032] step 5a; §2.3.1 step 6) recorded the sole accepting team as "winner-by-default" without specifying a numeric score, and recorded forfeiters with score `0`. Under the original integer body-length score, the sole acceptor had no alive-snake aggregates from a completed game, so a numeric score was ill-defined in the walkover case and the "winner-by-default" sentinel was used to paper over it. [03-REQ-056] carried the same "winner by default" phrasing.

**Amendment**: The sole acceptor receives score `1.0`; forfeiters receive score `0` per [01-REQ-053a]. The "winner-by-default" sentinel is removed everywhere it appeared. The numeric value is derived directly from the normalised formula resolved by 01-REVIEW-018: with `competing_teams = 1` (the only non-forfeited team), the last-team-standing branch of [01-REQ-054] yields `1.0 × 1 = 1.0` analytically, with no body-length ratio needed.

**Rationale**: Treating a walkover as a par outcome is consistent with the design principle that par represents holding a proportional share — a team that accepted while all opponents forfeited "held the field" and should score exactly par, not more (they faced zero opponents) and not zero (they were willing to play). Anchoring the value to the formula rather than introducing a walkover-specific constant keeps the scoring rule single-sourced in [01] and lets the same `GameOutcome.scores` shape be reused across the played-game, walkover, and no-contest branches.

**Informal spec reference**: N/A (orchestration-layer wiring of [01]'s amended scoring rule).

**Affected requirements/design elements**: [05-REQ-032] step 5a bullet `= 1 accepted` (score `1.0` for acceptor, `0` for forfeiters, replacing the "winner-by-default" formulation); §2.3.1 step 6 design prose (same update); §3.2 `GameOutcome` prose (scores described as real-valued normalised numbers; forfeited teams carry `0`). Cascade to [03]: 03-REQ-056 and the §3.17 design prose lose the "winner by default" phrasing and cite the score values directly.

---
