# Module 06 — Centaur State: Decision Log

Resolved REVIEW items from [`specs/06-centaur-state.md`](06-centaur-state.md). See [`SPEC-INSTRUCTIONS.md`](../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 06-REVIEW-001: Heuristic defaults scoped to team vs Centaur Server — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: Informal spec §6.4 says "Each Centaur Server maintains a global heuristic configuration". §7.1 and §7.2 say these tables are "stored in Convex per team". The current draft treats the scoping as per-team on the basis that [02-REQ-005] mandates a 1:1 relationship between Centaur Teams and Centaur Servers, so the two framings are extensionally equivalent.
**Question**: Is the extensional equivalence sufficient, or is there a case (e.g., server re-registration, server replacement, server rename) where "per server" and "per team" would produce different outcomes that should be resolved explicitly?
**Options**:
- A: Per-team is authoritative; if a team replaces its Centaur Server, the new server inherits the existing heuristic defaults. (Assumed by current draft.)
- B: Per-server is authoritative; replacing a team's Centaur Server starts its heuristic defaults from scratch. Requires additional lifecycle requirements around server replacement.
**Informal spec reference**: §6.4, §7.1, §7.2, §11 (informal spec's "bot_params" renamed to `global_centaur_params`; "heuristic_config").

**Decision**: Option A — per-team is authoritative. Heuristic defaults are per-CentaurTeam. The server determines which heuristics are available by string ID registered in source code, but storage is per-team. If a team replaces its Centaur Server, the new server inherits the existing heuristic defaults. JWT delegation at game start scopes write access per-CentaurTeam.
**Rationale**: [02-REQ-005] mandates a 1:1 relationship between Centaur Teams and Centaur Servers. The per-team scoping is simpler and avoids the need for server-lifecycle-dependent state management. If a team replaces its server, preserving heuristic configuration is the desired behavior — the team's strategic preferences transcend any particular server deployment. Unrecognised heuristic IDs (from a previous server's registrations) are harmlessly ignored at runtime and can be cleaned up by the team.
**Affected requirements/design elements**: 06-REQ-005 updated with per-team scoping language and server-replacement inheritance semantics.

---

### 06-REVIEW-002: Cross-team read visibility of heuristic defaults and bot parameters — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: The informal spec does not explicitly state whether one team's heuristic defaults or bot parameters are visible to members of other teams. [06-REQ-032] defaults to strict team-scoping (no cross-team reads) on the basis that these values are competitive information and that no use case motivating cross-team visibility is identified in the informal spec.
**Question**: Confirm strict team-scoping, or identify cross-team read affordances (e.g., for a platform administrator, for post-game analysis by opponents, for leaderboard purposes) that should be added.
**Options**:
- A: Strict team-scoping, no cross-team reads. (Current draft.)
- B: Allow cross-team reads in specific roles or lifecycle phases — specify which.
**Informal spec reference**: N/A (gap).

**Decision**: Option A — strict team-scoping, no cross-team reads except for admin users and designated coaches. Admin users ([05-REQ-065]) may read all Centaur Teams' state for administrative purposes per [05-REQ-066], and any user designated as a coach of a team per [05-REQ-067] may read that team's state on the same terms as a member.
**Rationale**: Heuristic defaults and bot parameters are competitive information — a team's strategy configuration should not be visible to opponents. No use case in the informal spec motivates cross-team visibility for non-admin users. Admin users require cross-team reads for platform administration and unified replay viewing.
**Affected requirements/design elements**: 06-REQ-032 updated with explicit admin exception and no-cross-team-reads language.

---

### 06-REVIEW-003: Who writes non-compute action log entries — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec lists action log entries including `move_staged`, `snake_selected`, `manual_toggled`, `drive_added`, etc., but does not explicitly distinguish which events are written by the Centaur Server runtime and which are written by the operator client that originates them. [06-REQ-037] reserves the two event categories whose payloads cannot plausibly be produced by an operator client (computed display state snapshots and bot-originated move staging) to the Centaur Server, and leaves the rest open. In practice this likely means the client that initiated the action is the writer, but this is not the only plausible design — an alternative is that all action log writes are brokered through the Centaur Server so that the bot framework and UI share a single write path.
**Question**: Which entity writes user-originated action log entries (selection changes, Drive edits, manual-mode toggles, temperature changes, operator-mode changes)? The operator's browser against Convex directly, or the Centaur Server on behalf of the operator?
**Options**:
- A: Operator browsers write their own action log entries directly to Convex. (Permitted by the current draft.)
- B: All action log writes are brokered through the Centaur Server, regardless of originator. Requires changes to [06-REQ-037] and possibly to [06-REQ-044] as well as additional trust assumptions about the Centaur Server.
- C: Each event category is explicitly assigned to one writer.
**Informal spec reference**: §11 ("centaur_action_log"), §13.3.

**Decision**: Option A — all agents write directly to Convex with own credentials. No direct operator-to-server communication for state mutations. Operators write their own action log entries via their Convex client (Google OAuth identity). The Centaur Server writes its own entries via per-CentaurTeam game credential. Every state mutation includes its corresponding log entry in the same Convex transaction, so a dropped log entry implies the state change also did not occur.
**Rationale**: Option A is the simplest architecture — it avoids routing all operator state mutations through the Centaur Server, which would add latency, create a single point of failure for operator interactions, and require the Centaur Server to broker mutations it has no role in. Direct writes to Convex are already mandated by [06-REQ-044] and [02-REQ-039] for operator state mutations. Transactional pairing of state change + log entry eliminates the delivery-guarantee gap that would exist if log entries were written as a separate step.
**Affected requirements/design elements**: 06-REQ-037 updated to note transactional pairing. 06-REQ-044 updated to reference direct writes.

---

### 06-REVIEW-004: Action log delivery guarantees for sub-turn replay fidelity — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [06-REQ-035] promises that the action log is sufficient to reconstruct the team's experience at any timestamp. Sub-turn replay fidelity depends on the log being a faithful record of what actually happened — missing entries would produce ghosting in the replay where a snake's state jumps without explanation. The informal spec does not specify delivery guarantees for action log writes, nor what should happen if a write fails (e.g., network partition between an operator's browser and Convex during a turn).
**Question**: What delivery guarantees does the subsystem promise for action log writes, and what is the observable behaviour when a write fails?
**Options**:
- A: Best-effort. Dropped entries produce gaps in the replay; this is accepted. No requirements added.
- B: At-least-once with client-side retry and idempotency keys. Requires adding an idempotency key to action log entries and a requirement for the writers to retry.
- C: Convex transactional writes for authoritative mutations (selection, drive add/remove, etc.) that pair the state change with the log entry atomically, so a dropped log entry implies the state change also did not occur. Most of the listed event categories already correspond to a state mutation; only `statemap_updated` is a log-only event.
**Informal spec reference**: §11 ("centaur_action_log"), §13.3.

**Decision**: Option C — transactional pairing of state mutations with log entries. Every mutation that changes Centaur state writes its corresponding action log entry within the same Convex transaction. A dropped log entry implies the state change also did not occur; the log is therefore a faithful record of successful state mutations. `move_staged` is removed from the Centaur action log entirely — move staging is recorded in the SpacetimeDB append-only staged-moves log ([04-REQ-025], [04-REQ-027]), where the staged move and its record are inherently transactionally paired. The principle is that log entries always track with authoritative success: a Centaur action log entry is written if and only if the corresponding state mutation succeeded in Convex, and a staged-move log entry exists in STDB if and only if the staged move was successfully recorded in STDB.
**Rationale**: Option C provides the strongest replay fidelity guarantee with the least additional complexity. Since most action log event types already correspond to a state mutation, transactional pairing is natural — the log entry is simply an additional insert within the same Convex mutation. For `move_staged`, the authoritative act of staging is a SpacetimeDB reducer call, not a Convex mutation; writing a log entry to Convex after the STDB call could fail independently, creating a mismatch between what actually happened (move staged in STDB) and what the log says. Moving move staging to the STDB append-only log eliminates this mismatch.
**Affected requirements/design elements**: 06-REQ-035 updated to reference STDB staged-moves log for move staging reconstruction. 06-REQ-036 updated to remove `move_staged`. 06-REQ-037 updated to remove bot-originated move staging and to note transactional pairing.

---

### 06-REVIEW-005: Temperature override persistence across turns and deselection — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: Informal spec §6.4 explicitly states "Drive assignments and weight overrides persist across turns (they are not reset when the operator deselects the snake)", and the draft's [06-REQ-016] preserves this. The informal spec is silent on whether the per-snake temperature override has the same persistence semantics. The draft treats it as symmetric with weight overrides (persistent).
**Question**: Is per-snake temperature override intended to persist across turns and across deselection, matching Drive/weight override semantics?
**Options**:
- A: Temperature override persists across turns and across deselection, symmetric with Drives and weight overrides. (Current draft.)
- B: Temperature override resets on deselection or at some other event.
**Informal spec reference**: §6.4, §11 ("snake_config.temperatureOverride").

**Decision**: Option A — temperature override persists across turns and across deselection, symmetric with Drives and weight overrides.
**Rationale**: The informal spec's §6.4 states persistence semantics for "Drive assignments and weight overrides" but is silent on temperature. Symmetric treatment is the simplest and most consistent choice. Temperature overrides are a per-snake strategic decision that operators would expect to survive turn boundaries and deselection, just like Drive weights. If temperature resets were desired, the operator would have to re-set it every time they reselect the snake, which is a poor UX for a setting that is typically adjusted once per snake per game.
**Affected requirements/design elements**: 06-REQ-016 updated to explicitly include temperature override in the persistence guarantee.

---

### 06-REVIEW-006: Selection-state lifetime at game end — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [06-REQ-040] retains all game-scoped state, including selection state, for the lifetime of the game record. This means a finished game's last selection state is visible forever. The team replay viewer ([08]) almost certainly wants this to render historical selection shadows. But it is worth confirming that permanently retaining "which operator had which snake selected at game end" is intended, as opposed to clearing selection state on game finalisation while retaining the action log.
**Question**: Is retaining the terminal selection record intentional, or should selection state be cleared at game end with historical selection visible only through the action log?
**Options**:
- A: Retain terminal selection record. (Current draft.) Simpler; makes the action log strictly supplementary for this particular piece of state.
- B: Clear selection record at game end; the replay viewer reconstructs selection history from the action log only.
**Informal spec reference**: §11 ("snake_config"), §13.3.

**Decision**: Option B — clear selection records at game end. The replay viewer reconstructs selection history from the action log only.
**Rationale**: Terminal selection state (who had which snake selected at the exact moment the game ended) has no meaningful use outside of replay, and the action log already provides a complete history of all selection/deselection events throughout the game. Clearing selection records at game end avoids leaving stale operator-to-snake mappings in the database that could confuse downstream systems or display logic. The replay viewer is already designed to reconstruct all within-turn state from the action log; selection is no exception.
**Affected requirements/design elements**: 06-REQ-025a added — at game end, all selection records for the game are cleared. Design §2.2.7 defines `cleanupGameCentaurState` mutation.

---

### 06-REVIEW-007: Informal spec filename drift — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: At the time this module was authored, `SPEC-INSTRUCTIONS.md` and the informal-spec file on disk used different version suffixes in their filenames — the same issue flagged in 02-REVIEW-001 — and requirements in this module were extracted from the on-disk content under the same assumption applied there. The informal spec has since been renamed to drop its version suffix entirely (`informal-spec/team-snek-centaur-platform-spec.md`) and `SPEC-INSTRUCTIONS.md` has been updated to match, so the version-mismatch concern no longer applies. Flagged here for consistency with 02-REVIEW-001.
**Informal spec reference**: N/A (meta).

**Decision**: The current (unversioned) informal spec is canonical, consistent with the 02-REVIEW-001 resolution. All requirements in this module were correctly extracted from that content.
**Rationale**: See 02-REVIEW-001 resolution. The rename to an unversioned canonical filename eliminates the prior drift between `SPEC-INSTRUCTIONS.md` and the file on disk.
**Affected requirements/design elements**: None — requirements already reflect the current informal spec.

---

### 06-REVIEW-008: Game-scoped operator mode state — **RESOLVED**

**Type**: Gap
**Phase**: Design
**Context**: The live operator interface ([08]) displays the current operator mode (Centaur or Automatic) and the Captain can toggle it (timekeeper capability merged into captain per 05-REVIEW-014). The mode affects the Centaur Server's turn-submission behaviour ([07]). Two approaches for storing the current mode: (A) persist it as a game-scoped record that is updated on toggle, or (B) derive it from the action log by replaying `mode_toggled` events. Approach B adds complexity to every reader and introduces latency for mode-dependent decisions in the bot framework.
**Question**: Should the current operator mode be stored as a live game-scoped record, or derived from the action log?
**Options**:
- A: Add a game-scoped record for current operator mode (and potentially other game-scoped team-level state), updated on toggle. Readers consult the record directly.
- B: Derive from action log. No additional table. Readers scan the log for the latest `mode_toggled` entry.
**Informal spec reference**: §7.5 (operator mode toggle), §7.2 (default operator mode in bot params).

**Decision**: Option A — add a game-scoped record (`game_centaur_state`) for current operator mode and any other game-scoped team-level state. The record is updated on toggle, and readers consult it directly rather than scanning the action log.
**Rationale**: Option B requires every reader (bot framework, operator interface) to scan the action log for the latest `mode_toggled` entry every time it needs the current mode. This adds unnecessary latency and complexity, especially for the bot framework which needs the current mode to determine turn-submission timing. A dedicated record is cheap to maintain (one document per team per game, updated only on mode toggle) and provides efficient direct reads via Convex's reactive query system.
**Affected requirements/design elements**: 06-REQ-040a added. Design §2.1.5 defines `game_centaur_state` table (including `globalTemperature`, `automaticTimeAllocationMs`, `turn0AutomaticTimeAllocationMs` initialised from team defaults). §2.2.3 defines `toggleOperatorMode` and `setGameParamOverrides` mutations. §2.2.6 initializes the record at game start from `global_centaur_params` defaults. *(Amended per 08-REVIEW-011 resolution: `turn0AutomaticTimeAllocationMs` and `toggleOperatorMode` are removed from this Affected list — operator-mode is replaced by per-operator ready-state per [06-REQ-040b], and turn-0 timing is governed by the chess-clock's existing turn-0 budget without a separate auto-submission allocation. Further amended per 08-REVIEW-024 resolution: per-operator ready-state itself is replaced by per-operator **tempo** (`setOperatorTempo` mutation, `operator_tempo` table, `tempo: 'thinking' | 'flow'`), with a Captain-only `bootOperator` mutation added alongside (a manual forced disconnect with no persistent state). The current `game_centaur_state` schema and §2.2.3 mutation surface are the live source of truth; this snapshot is retained only for review-history fidelity.)*
