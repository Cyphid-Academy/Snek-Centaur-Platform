# Module 08 — Centaur Server App: Decision Log

Resolved REVIEW items from [`specs/08-centaur-server-app.md`](08-centaur-server-app.md). See [`SPEC-INSTRUCTIONS.md`](../SPEC-INSTRUCTIONS.md) for the item format and resolution process.

---


### 08-REVIEW-001: Role gating of heuristic configuration and bot parameters — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: Informal spec §7.1 and §7.2 both say the heuristic config and bot parameters are "editable by any team member". §8.2 separately says team identity, server registration, and membership are captain-only — an explicit distinction that implies team-internal competitive configuration is deliberately not captain-only. [06-REQ-008] and [06-REQ-012] echo this by requiring only that the caller be a team member. This is a plausible reading but is surprising: a new operator could, immediately upon being added to the team, change the team's global heuristic defaults in ways that affect subsequent games for everyone. No mechanism in the current draft provides a safeguard.
**Question**: Should the heuristic configuration page and the bot parameters page be gated on a role (captain, timekeeper) rather than general team membership?
**Options**:
- A: Any team member can edit. (Current draft, matches informal spec literally.)
- B: Captain-only for both pages.
- C: Captain-or-timekeeper for both pages.
- D: Page is read-only to general members; an "edit mode" affordance requires the captain to promote.
**Informal spec reference**: §7.1, §7.2, §8.2.

**Decision**: Captain-only for team-scoped defaults; any team member for game-scoped overrides. Only the Captain can edit `global_centaur_params` and team-level heuristic defaults in `heuristic_config`. Any team member can edit game-scoped heuristic weight overrides (per-snake Drive weights, Preference activation, temperature overrides during a live game). There is no longer a timekeeper role (eliminated per 05-REVIEW-014).
**Rationale**: Team-scoped defaults (global temperature, default operator mode, heuristic default weights, dropdown ordering) represent strategic decisions that affect all future games for the entire team. Restricting these to the Captain prevents a newly-added operator from unilaterally changing team strategy. Game-scoped overrides, by contrast, are tactical in-game adjustments that operators need to make in real time during gameplay — requiring Captain approval for every weight tweak during a live game would be operationally unworkable. This split aligns with the existing Captain/member distinction in team management (§8.5b) and is consistent with the elimination of the timekeeper role per 05-REVIEW-014.
**Affected requirements/design elements**: 08-REQ-019 amended (team-scoped heuristic defaults are Captain-only). 08-REQ-008 amended (references updated role list). 08-REQ-017 amended (Captain-only for team-scoped mutations). 08-REQ-021 amended (Captain-only for bot params). 06-REQ-008 amended (Captain-only for team-scoped heuristic config writes). 06-REQ-012 amended (Captain-only for bot param writes). Design §2.2.1 authorization updated.

---

### 08-REVIEW-002: Mid-game effect of default-operator-mode edits — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 08-REQ-022 says the default operator mode affects only future games, since the running game's mode is owned by the session's in-memory state and toggled by the timekeeper. But [06-REQ-011] treats the default operator mode as a team-scoped record and [06-REQ-009] says team-scoped edits do not retroactively affect in-progress games' portfolio state — that rule addresses heuristic config, not the operator mode. A strict reading of [06] leaves the mid-game behaviour of a default-operator-mode edit undefined.
**Question**: Does editing the default operator mode during a game affect the running game's current mode, the next game only, or neither (treated as a no-op until the next game starts)?
**Options**:
- A: Edit takes effect only on the next game's initial mode; running game is unaffected. (Current draft.)
- B: Edit takes effect immediately — the running game's current mode is reset to the new default.
- C: Edit is silently blocked while the team has a game in `playing` status.
**Informal spec reference**: §7.2.

**Decision**: Option A — all global defaults (including default operator mode) take effect only upon creating game-specific state at game launch. Running games are unaffected by edits to team-scoped defaults.
**Rationale**: This is already the semantics expressed by [06-REQ-009] for heuristic config, and the same principle applies uniformly to all team-scoped defaults including `global_centaur_params`. At game start, `initializeGameCentaurState` ([06-REQ-014], [06-REQ-040a]) copies team defaults into game-scoped state as a point-in-time snapshot. Once the game is live, the game-scoped `game_centaur_state` record is the live source of truth; the team defaults are irrelevant until the next game starts. This avoids the confusion of Option B (mid-game mode resets would be disruptive) and the unnecessary restriction of Option C (teams should be free to prepare their defaults for the next game while a current game is in progress).
**Affected requirements/design elements**: 08-REQ-022 amended with explicit language that all `global_centaur_params` edits affect the next game only. 06-REQ-009 confirmed as already correct (applies to all team-scoped defaults). 06-REQ-040a confirmed as already expressing the snapshot semantics correctly.

---

### 08-REVIEW-003: Game history visibility scope — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 08-REQ-024 and 08-REQ-027 currently restrict the game history list to games the authenticated human participated in. Informal spec §7.3 says "completed games the logged-in user participated in", which supports this. But a coach or captain may want to review all of the team's past games regardless of personal participation. The informal spec does not contemplate this and the draft takes the narrow reading.
**Question**: Should the game history list show (a) only games the current human participated in, (b) all of the team's games, or (c) both with a toggle?
**Options**:
- A: Personal participation only. (Current draft.)
- B: All team games.
- C: Personal by default, toggle to show all.
**Informal spec reference**: §7.3.

**Decision**: A user sees a game in their history if they were either (a) a member of a participating team at the time of the game (per the game's participating-team snapshot of [05-REQ-029]) or (b) a current member of one of the participating teams now. Additionally, replay access for MVP is fully public: all replay data (including within-turn operational data of both teams) is publicly accessible to all authenticated users once a game has finished. The game history visibility rule only determines which games are proactively listed in a user's interface; if someone has a direct link to a game, any registered user can view the full replay. Private games are eliminated entirely for MVP.
**Rationale**: The expanded visibility rule (historical OR current membership) gives captains and coaches visibility into team games that occurred before they joined, which is important for team strategy review. Making replays fully public for MVP simplifies the access model dramatically — there is no privacy-gating complexity — and aligns with the open competitive spirit of the platform. The private-games concept added significant cross-module complexity for a feature that is not essential to MVP. It can be reintroduced in a future version if needed.
**Affected requirements/design elements**: 08-REQ-024 amended (historical or current team membership). 08-REQ-027 amended (removed negative restriction). 08-REQ-091 amended (Player Profile game history uses historical-or-current rule). 08-REQ-095 amended (Team Profile game history). 08-REQ-075d, 08-REQ-075e, 08-REQ-075f removed (private games eliminated). §8.15a removed. Private games removed across all modules: 02-REQ-066, 02-REQ-067 removed; 05-REQ-069, 05-REQ-070, 05-REQ-071, 05-REQ-072 removed; the original privacy-bypass 05-REQ-067 was removed (the 05-REQ-067 number slot has since been reused for the unrelated Coach Role); §5.12 removed (the §5.12 section number has since been reused for the unrelated Coach Role section); 05-REQ-023 game privacy row removed; 06 getCentaurActionLog privacy clause removed; 03-REQ-063 amended (privacy reference removed). GameConfig.gamePrivacy field removed.

---

### 08-REVIEW-004: Presence state store — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 08-REQ-032 and 08-REQ-035 require a presence display of other connected team operators in the header. Neither [05] nor [06] defines a presence state field, and [06-REQ-018]'s selection record encodes only the current selector of a snake, not the set of connected operators who are unselected. A plausible implementation is that the Snek Centaur Server runtime itself holds presence state and serves it over its own subscription (outside Convex), but no module currently defines this contract. See 08-REQ-003 which already acknowledges the Snek Centaur Server as a source for in-memory bot-framework state the browser reads directly; presence likely rides the same channel. Requires explicit specification somewhere.
**Question**: Where does operator presence state live, and which module owns its specification?
**Options**:
- A: Snek Centaur Server in-memory state exposed to the browser via a server-hosted subscription. Requires [02] to acknowledge this subscription exists, and [08] to specify its shape.
- B: Convex ephemeral presence table owned by [06], with TTL-based cleanup.
- C: Derived from selection state only — "connected" means "has ever held a selection this session". Loses unselected-operator visibility.
**Informal spec reference**: §7.5 ("Connected operators shown as coloured dots with nicknames").

**Decision**: Roughly Option B — Convex-hosted presence solution. Operator presence state shall be managed through a Convex-hosted presence mechanism. The design phase should use the `@convex-dev/presence` library, which provides ephemeral presence state with heartbeat-based TTL cleanup natively within the Convex reactive query system.
**Rationale**: A Convex-hosted presence solution keeps operator presence within the same reactive data layer that the operator interface already subscribes to for all other state, avoiding the need for a separate subscription channel between the browser and the Snek Centaur Server. The `@convex-dev/presence` library provides exactly the semantics needed: ephemeral per-user presence with automatic cleanup when a client disconnects, delivered via Convex's reactive query system. This is simpler than Option A (which would require a separate real-time channel and server-side presence management) and richer than Option C (which loses visibility of unselected but connected operators).
**Affected requirements/design elements**: 08-REQ-032 amended to reference Convex-hosted presence. 08-REQ-035 amended to reference Convex-hosted presence. Design-phase note added: the implementation should use the `@convex-dev/presence` library for operator presence state.

---

### 08-REVIEW-005: Drive dropdown ordinal collisions — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [06-REQ-007] says each Drive type has an ordinal dropdown position, and 08-REQ-052 orders the dropdown by that ordinal. Nothing in either module prevents two Drive types from having the same ordinal. In that case the ordering is underspecified; tiebreak behaviour could be alphabetic, insertion order, or stable-by-id. This matters because operators rely on the dropdown position as muscle-memory shorthand.
**Question**: What is the tiebreak when two Drive types have the same ordinal?
**Options**:
- A: Secondary sort by Drive type name (alphabetical). Stable and predictable.
- B: Secondary sort by Drive type registration order.
- C: Enforce uniqueness of ordinals in the heuristic config contract ([06-REQ-007]).
**Informal spec reference**: §7.6.

**Decision**: Replace the `dropdownOrder` ordinal system entirely with a pinned-heuristics list and lexicographic fallback. A `pinnedHeuristics` field (ordered array of heuristic IDs) is added to `global_centaur_params`. A `nickname` field is added to `heuristic_config`. The `dropdownOrder` field is removed from `heuristic_config`. Drive dropdown ordering is: pinned heuristics appear first in the order specified by the `pinnedHeuristics` array; remaining heuristics are ordered lexicographically by `nickname`, then by `heuristicId` as tiebreaker.
**Rationale**: The ordinal system was fragile — it required manual coordination of ordinal values across all Drive types, had no collision prevention, and was difficult to reorder (changing one Drive's position required updating others). The pinned-heuristics approach is more intuitive: the Captain pins the most-used Drives to the top in a specific order, and everything else falls into a stable alphabetic order by its human-readable nickname. The `nickname` field gives teams a way to assign meaningful short names to heuristics (which have machine-readable `heuristicId` values defined in source code). This eliminates the collision problem entirely and makes reordering a simple array manipulation on a single field.
**Affected requirements/design elements**: 06-REQ-007 amended (dropdownOrder replaced with nickname; ordering rule specified). 06-REQ-011 amended (pinnedHeuristics added to global_centaur_params). `heuristic_config` schema updated (dropdownOrder removed, nickname added). `global_centaur_params` schema updated (pinnedHeuristics added). 08-REQ-052 amended (new ordering scheme). 07-REQ-027, 07-REQ-028 updated (references to configured Drive ordering updated). Exported interface types updated.

---

### 08-REVIEW-006: Tab cycle deterministic tie-break in targeting — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: 08-REQ-054 orders Tab-cycled targeting candidates by A*-distance from the selected snake's head. Two candidate targets may be equidistant; the order they are visited by Tab is then undefined. As with the dropdown, this matters because operators come to rely on specific sequences during rapid play.
**Question**: What is the tiebreak when two candidate targets have equal A* distance?
**Options**:
- A: Secondary sort by target identity (snake id or cell coordinates in row-major order).
- B: Secondary sort by angle from the snake's head in a fixed rotation direction.
- C: Leave undefined; the operator must click directly if Tab produces ambiguity.
**Informal spec reference**: §7.6 ("in order of A* distance from the snake's head").

**Decision**: Option B with Option A as a tertiary fallback. The Tab cycle order shall be fully deterministic with three sort keys, in priority: (1) A*-distance from the selected snake's head, ascending; (2) clockwise angle in board coordinates from the snake's current head direction, starting at 0° (straight ahead) and increasing through 360°; (3) target identity — snake id ascending for snake targets, cell coordinates in row-major order (row then column ascending) for cell targets. The third key exists only to fully discharge the determinism obligation in pathological cases (e.g., two distinct candidates that share the same A*-distance and the same clockwise angle from the head — practically impossible for cell targets and only possible for snake targets if two candidate snakes' bodies somehow project onto exactly the same head-relative angle, which the head-A* distance key has already disambiguated whenever the candidate snakes occupy distinct cells).
**Rationale**: Clockwise-from-head is rotationally meaningful to the operator: the snake has an orientation, and "next clockwise" maps onto the operator's head-relative mental model of the board. A pure global identity sort (Option A) produces orientationally meaningless cycle orders that vary unpredictably as targets move around the board relative to the snake. Option C (leaving the tiebreak undefined) fails the determinism property that operator muscle memory depends on. The identity-based tertiary key keeps Option B fully deterministic without sacrificing its head-relative semantics in any realistic case.
**Affected requirements/design elements**: 08-REQ-054 amended to specify the three-key deterministic Tab cycle order.

---

### 08-REVIEW-007: Timekeeper affordance availability when no timekeeper is assigned — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [05-REQ-011] says a team has at most one timekeeper at any time, implying the role may be absent. 08-REQ-065 and 08-REQ-067 say only the current timekeeper sees and can invoke the affordances. If no timekeeper is assigned, no member of the team can submit the turn in Centaur mode, and the game can only end by clock expiry. This is possibly intentional (a team that fails to assign a timekeeper is accepting that consequence) but is worth confirming.
**Question**: When a team has no timekeeper, who — if anyone — can invoke the mode toggle and turn-submit affordances?
**Options**:
- A: No-one. Centaur-mode games proceed only until clock expiry. (Current draft.)
- B: The captain acquires the affordances as a fallback.
- C: Any team member acquires the affordances as a fallback.
- D: The team is blocked from entering Centaur mode at all if no timekeeper is assigned.
**Informal spec reference**: §7.5 ("Timekeeper controls (visible only to the designated timekeeper)"); §8.2.

**Decision**: Moot — the timekeeper role has been eliminated per 05-REVIEW-014 resolution. All former timekeeper affordances (operator-mode toggle and turn-submit) are now Captain-only. The Captain is a structural role (`centaur_teams.captainUserId`) that always exists on every team, so the "no timekeeper assigned" edge case cannot arise. See amended §8.14 (now titled "Captain Controls") and 08-REQ-065 through 08-REQ-068.
**Rationale**: The timekeeper was eliminated as unnecessary MVP complexity. The Captain, being structurally required on every team, inherits the capabilities without any gap in coverage.
**Affected requirements/design elements**: 08-REQ-065, 08-REQ-066, 08-REQ-067, 08-REQ-068 amended (timekeeper → Captain). §8.14 retitled "Captain Controls". 02-REQ-043 amended (timekeeper assignment removed).

---

### 08-REVIEW-008: Replay-mode selection and Centaur state — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 08-REQ-074 asserts that replay-mode selection is a local UI concept that does not issue any Centaur state mutation. [06-REQ-018] defines the selection record as a per-(game, snake) Convex row. The replay viewer reads, but does not write, Centaur state. This is straightforward for the "invisible observer" reading but leaves one ambiguity: if two humans open replays of the same game simultaneously and each inspects a different snake, both can be inspecting different snakes without conflict (since neither writes). But if the team replay viewer in the future is extended to support shared replay sessions where multiple people see each other's positions, that extension would require either a new replay-selection record or a reuse of the selection record with a "replay selector" flag. The current draft does not contemplate shared replay sessions; this is a forward-compatibility concern.
**Question**: Confirm that replay-mode selection is purely client-local and does not require any additional Convex state.
**Options**:
- A: Purely client-local; no Convex state. (Current draft.)
- B: Add a replay-scoped selection record to [06] for future shared replay sessions.
**Informal spec reference**: §13.3 ("The replay viewer acts as an invisible additional observer").

**Decision**: Option A — non-mutating snake viewing (replay viewer per [08-REQ-074] and live-game coach mode per [08-REQ-052a]) is purely client-local; no Convex state is added and no SpacetimeDB write is issued. Even if shared replay sessions are added in the future, the exclusive-lock semantics of the existing selection mechanic ([06-REQ-018] through [06-REQ-024]) are inappropriate for shared replay gaze-tracking, because two replay viewers inspecting different snakes must not displace each other's view; that future extension would require a different (non-exclusive) state model and is out of scope here. Live-game coach inspection ([05-REQ-067], [08-REQ-052a]) needs the same affordance and the same semantics as replay inspection, since both are "invisible additional observer" use cases.

The decision additionally adopts the following terminology distinction across Module 08, applied uniformly to prose, requirement wording, identifier-style names, mutation names, Convex field names, and UI affordance labels:

- **selection** / **selector** / **selected snake** / `selectSnake` / `deselectSnake` / `operatorUserId` — retained for the existing exclusive-lock control affordance owned by [06]. A selection grants the holding operator the right to stage moves and toggle manual mode for the snake; only one operator at a time may hold a selection on any given snake; selections are persisted in Convex (`snake_operator_state.operatorUserId`) and produce per-operator coloured **selection shadows** on the board ([08-REQ-039]). All [06] identifiers and the existing [08] selection-acquisition prose ([08-REQ-039], [08-REQ-042], [08-REQ-043]) keep the "selection" name unchanged.
- **inspection** / **inspector** / **inspected snake** / `inspectSnake` / `clearInspection` / `inspectedSnakeId` — the new, non-mutating, purely client-local affordance by which a single viewer client (a replay viewer per [08-REQ-074] or a coach in live-game coach mode per [08-REQ-052a] / [08-REQ-052c]) chooses which snake's portfolio, stateMap, decision breakdown, worst-case world, and per-direction candidate highlights are displayed in their own UI. Inspection state is held in client-local UI state only; `inspectedSnakeId` is a client-local field, **never** a Convex field. Inspection never produces a selection shadow on the board, never issues any Convex or SpacetimeDB mutation, never displaces or interacts with any operator's selection, and is invisible to every other client.

Each viewer client may have at most one inspected snake at a time. Replay inspection and coach inspection share identical semantics; the only difference is the data source on which the inspection view is rendered (persisted replay + reconstructed action log for replay inspection; live SpacetimeDB and Convex subscriptions for coach inspection).

**Alternative names considered and rejected** (for traceability of the naming choice):
- **focus** / `focusedSnakeId` — overloaded with the established UI meaning of "input focus" (the focused element receiving keyboard events); also lacks a clean noun form for the holder ("focuser" reads awkwardly).
- **spotlight** / `spotlightedSnakeId` — connotes a presentational/broadcast metaphor (the snake is highlighted to others) rather than a private viewing decision; misleading for a per-client affordance.
- **gaze** / `gazedSnakeId` — matches the "gaze-tracking" framing in the original review prompt but is awkward as a verb in identifier names (`gazeSnake`, `gazeAtSnake`) and has no commonly understood adjective form.
- **preview** / `previewedSnakeId` — already used in this module to mean the worst-case world preview ([08-REQ-048]) and the board preview ([08-REQ-027i]); reusing it for snake viewing would collide with both.
- **view-selection** / `viewSelectedSnakeId` — preserves "selection" in the name and would defeat the entire purpose of the terminology distinction.

**Recommended term: "inspection"**, because (a) [08-REQ-074] already uses the phrase "select a snake for inspection", so the verb is already in this module's vocabulary; (b) "inspection" is semantically distinct from "selection" in everyday English (one inspects without taking ownership); (c) the noun/verb/adjective forms (inspect / inspector / inspected / inspection) are uniformly available and read naturally in identifier names, prose, and UI labels.

**Rationale**: Option A keeps [06]'s existing exclusive-lock selection semantics — and its Convex schema, mutations, and invariants — entirely unchanged for the existing operator-control affordance. The non-mutating viewing affordance for replay viewers and coaches is introduced without any Convex schema change or any new mutation; it is realised purely as client-local UI state in this module's web application. The "selection vs inspection" terminology distinction makes it lexically obvious at every use site which of the two affordances is intended, eliminating the structural ambiguity that motivated the original review.

**Affected requirements/design elements**: 08-REQ-074 reworded to use "inspection" terminology and to make explicit per-client / no-shadow / no-mutation semantics. 08-REQ-075 reworded to "inspection of any snake". 08-REQ-052c added (coach mode inspection affordance with semantics identical to replay inspection). 08-REQ-052d added *(negative)* (coach inspection must not use a gesture grammar confusable with operator selection). 08-REQ-071 reworded to refer to "snake inspection" within team-perspective replay rather than "snake selection". Module 06 §6.5 receives a single-sentence clarifying note that "selection" in that module refers exclusively to the exclusive-lock control affordance and that the separate non-mutating per-client **inspection** affordance is owned by [08] and adds no state to [06]; no [06] schema, mutation, identifier, or interface changes. [05-REQ-067] read scope is unchanged and is cross-referenced from the new coach-inspection requirement.

---

### 08-REVIEW-009: Scope of application customisation — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [02-REQ-032(c)] (now removed) permitted "optional customization of the operator web application" as one of three extension points. Neither [02] nor [08]'s draft specified what "customisation" meant concretely: can a team replace entire pages? Inject arbitrary UI? Swap out the move interface? Override the board renderer? The boundary mattered because aggressive customisation could present the operator with affordances inconsistent with [06]'s invariants even though those invariants remained enforced server-side.
**Question**: What is the intended scope of customisation — theming only, component swapping, or full page replacement?
**Options**:
- A: Theming and layout tweaks only. Functional components are fixed.
- B: Component-level swapping with a stable component contract; functional boundaries preserved.
- C: Full page replacement; only the data-source abstraction (§8.12) and [06]'s function contracts are load-bearing.
**Informal spec reference**: §7 ("The Centaur Server library provides a reference implementation of the full web application; teams may customise the UI.").

**Decision**: Full source ownership via fork (supersedes options A/B/C). The operator web application is no longer an extension point of the Centaur Server library. Per [02-REQ-032a], teams obtain the operator app by forking the reference implementation repository and have complete freedom to modify any aspect of the UI — theming, component replacement, page restructuring, or full rewrites. The customisation scope is unbounded at the UI layer. Correctness is enforced externally by Convex function contracts ([06]) per [02-REQ-033], not by constraining what the UI may present. The data-source abstraction ([08-REQ-076]) exported by centaur-lib is the stable interface between the library and the operator app; teams' forks depend on this API surface for data access.
**Rationale**: Defining a bounded customisation interface within the library is unnecessary because the operator app is a separate forkable artifact, not a library extension point — the question of where to draw the customisation boundary dissolves once UI ownership transfers to the team's fork.
**Affected requirements/design elements**: [02-REQ-032(c)] removed; [02-REQ-032a] added; [08-REQ-076] data-source abstraction designated as the stable centaur-lib API surface.

---

### 08-REVIEW-010: Speed-control set in replay viewer — **RESOLVED**

**Type**: Proposed Addition
**Phase**: Requirements
**Context**: The informal spec §13.3 mentions that the team replay viewer has "play/pause, and speed controls", without enumerating a speed set. Informal spec §8.6 enumerates `{0.5×, 1×, 2×, 4×}` for the platform replay viewer. The draft pins `{0.5×, 1×, 2×, 4×}` for the board-level replay mode. If the team-perspective mode needs a different speed set (sub-turn scrubbing operates at finer granularity), it should be pinned now.
**Question**: Should the team-perspective replay mode use the same speed set as the board-level mode, and if not, what set?
**Options**:
- A: Leave to Phase 2 design; do not pin. (Current draft for team-perspective.)
- B: Pin `{0.5×, 1×, 2×, 4×}` for consistency.
- C: Team-perspective replay requires finer-grained control — different set.
**Informal spec reference**: §8.6; §13.3.

**Decision**: Supersede the single-speed-set framing entirely. The unified Replay Viewer's timeline control shall expose a **mode toggle** with two settings — **Per-Turn mode** and **Timeline mode** — each with its own scrubbing semantics, keyboard navigation, turn-marker rendering, and playback-speed set. The toggle is persistent across the viewer's lifetime within a single session and applies to both the board-level and team-perspective replay modes (08-REQ-069), so a single timeline control governs scrubbing for either replay mode.

- **Per-Turn mode**: scrubber shows turns as equidistant tick marks (one tick per turn); scrubbing snaps to the **end of each turn** (the centaur-state state-of-the-world that operators saw at the moment they were declaring submissions). No intra-turn positions are addressable in this mode. Playback advances one turn per tick at the configured rate. Speed-control set: **{0.25, 0.5, 1, 2, 4, 8} turns/second**.
- **Timeline mode**: scrubber's horizontal axis represents wall-clock time of the original game from game start (left) to game end (right). Turn boundaries are rendered along the timeline as **turn-marker glyphs** at the actual clock-time at which each turn was declared over (not equidistant — separation reflects the variable real wall-clock duration of each turn under the chess-clock mechanism). Scrubbing is continuous along clock time. Playback advances at a scalar multiple of real time. Speed-control set: **{0.25×, 0.5×, 1×, 2×, 4×, 8×}**.
- **Keyboard navigation in Timeline mode**: `Left`/`Right` (no modifier) seek ±1 second of clock time; `Shift+Left`/`Shift+Right` seek ±200 ms; `Ctrl+Left`/`Ctrl+Right` (use `Cmd` on macOS) snap to the previous/next turn-marker keyframe (the timeline-mode analogue of per-turn scrubbing without leaving timeline mode).
- **Keyboard navigation in Per-Turn mode**: `Left`/`Right` advance one turn backward/forward. Whether modifier keys are unbound or bound to a coarser/finer step (e.g., ±5 turns and ±1 turn respectively) is left as an explicit Phase-2 design decision.
- **Speed-control rendering**: the speed-control widget renders the current mode's unit in the label (e.g., "2 turns/s" vs "2× speed") so the operator is never ambiguous about what the multiplier means.
- **Mode toggle persistence**: the chosen mode and the chosen speed-within-mode are persisted in the viewer's client-local UI state and restored across navigation within the session. They are *not* persisted to Convex; this is purely a client preference.

**Rationale**: The prior draft pinned a single speed set without contemplating that the user's mental model differs between turn-level review (where "1×" means "one turn") and clock-time review (where "1×" means "real time"). Forcing both modes to share a single set conflates these. The toggle gives operators direct control over whether they are exploring strategic structure (per-turn) or timing dynamics (timeline). The variable inter-turn spacing in Timeline mode preserves the chess-clock signal that some turns burned more clock budget than others.

**Affected requirements/design elements**: 08-REQ-072 amended to incorporate the per-mode semantics and remove the prior `{0.5×, 1×, 2×, 4×}` pin; 08-REQ-072a added (mode toggle and persistence); 08-REQ-072b added (Per-Turn mode semantics and speeds); 08-REQ-072c added (Timeline mode semantics, turn-marker glyphs, and speeds); 08-REQ-072d added (keyboard navigation in both modes); 08-REQ-070a and 08-REQ-071 cross-link the unified control so both replay modes pick it up.

---

### 08-REVIEW-011: Interaction between automatic-mode timer and manual overrides mid-turn — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: 08-REQ-062 (prior version) said the Automatic-mode timer proceeds independently of operator UI interactions. But [07-REQ-046] says manual-mode snakes are never auto-staged. If during an Automatic-mode turn an operator flips several snakes to manual mode and stages human moves for them, and then the Automatic timer fires, is the team's turn declared over with those human moves in place and the remaining automatic snakes' latest bot-staged moves? Informal spec §7.5 implies yes ("submitting all currently staged moves"). The requirements as drafted omitted this detail.
**Question**: On Automatic-mode timer expiry, does the turn-over declaration submit exactly the current staged moves for all owned snakes (mix of bot and human staging), or does it require all automatic-mode snakes to have a bot-staged move before firing?
**Options**:
- A: Declare turn over with whatever is currently staged. (Informal spec §7.5 reading.)
- B: Wait for [07]'s final-submission pass to flush all automatic-mode dirty flags before declaring.
- C: Combine: the timer expiry triggers [07]'s final pass synchronously, then declares.
**Informal spec reference**: §7.5 (header "Timekeeper controls — Submit shortcut key: immediately declares the team's turn over, submitting all currently staged moves").

**Decision**: Supersede the team-level operator-mode (Centaur / Automatic) model entirely with a **per-operator ready-state** model. The original ambiguity is dissolved at the source: there is no longer a team-level "Automatic-mode timer" whose expiry has to be reconciled with operator manual overrides. Instead:

- Each operator currently connected to the team's game session independently signals **ready / not-ready** for the current turn (per [08-REQ-061], persisted in [06]'s new `operator_ready_state` table per [06-REQ-040b]).
- The framework's automatic turn submission process is **gated** on **all currently-connected operators being simultaneously `ready`** (per [08-REQ-062]). The all-ready quorum is a *passive necessary precondition*, not a positive declaration — it simply permits the framework to finalise via `declare_turn_over` according to its own existing automatic submission rules ([07-REQ-044] / [07-REQ-045]), which are not restated here. The Captain's explicit turn-submit affordance ([08-REQ-065]) is an *independent override* path that bypasses this precondition entirely, immediately submitting whatever is currently staged and suppressing the framework's final flush per [07-REQ-045a]. Otherwise, the team's existing per-turn clock and time budget ([01-REQ-037], [01-REQ-038]) continue to govern the upper bound on turn duration.
- The framework's submission process — the team-level scheduled-pass cadence of [07-REQ-044] iterating over all dirty automatic-mode snakes, and the team-level final-flush deadline of [07-REQ-045] (`min(automaticTimeAllocationMs, remainingTimeBudget)`) — is unchanged in shape; manual-mode snakes remain excluded per [07-REQ-046]. The only substantive change to [07] is that the separate `turn0AutomaticTimeAllocationMs` carve-out is removed: turn 0 now uses the same `automaticTimeAllocationMs`, naturally bounded by the chess-clock's turn-0 budget via `remainingTimeBudget`.
- The `defaultOperatorMode` and `turn0AutomaticTimeAllocationMs` fields are removed from `global_centaur_params` and `game_centaur_state` (per [06-REQ-011] and [06-REQ-040a]). The remaining `automaticTimeAllocationMs` field is retained with its existing team-level turn-deadline semantics. The action-log event `mode_toggled` is removed and replaced by `operator_ready_toggled` (per [06-REQ-040b]).

**Rationale**: A single team-level mode forced an awkward question about whether a timer expiry should cooperate with mid-turn manual overrides. Per-operator ready-state matches the actual coordination problem teams face — every connected operator signals when they're done thinking — and elegantly accommodates mixed bot/manual staging because every operator simply waits to mark themselves `ready` until they're satisfied with the current state of *all* the snakes they care about. The Captain's turn-submit override remains as a tie-breaker for stuck or absent teammates. Coaches and admins, being read-only observers (per [08-REQ-052a]), have no ready-state and are never counted in the unanimity condition.

**Affected requirements/design elements**:
- **Module 08**: §8.12 retitled and rewritten ([08-REQ-061]–[08-REQ-064] rewritten; [08-REQ-064a] added for coach/admin no-ready-state); [08-REQ-020] / [08-REQ-022] amended (bot-parameters page no longer exposes operator-mode default or turn-0 time allocation); [08-REQ-032] amended (header presence display now shows per-operator ready-state instead of team-level operator-mode indicator); [08-REQ-034] removed; [08-REQ-052a] disabled-affordances list updated; [08-REQ-065] amended (Captain controls reduced to turn-submit only); [08-REQ-067] / [08-REQ-068] amended (per-operator ready-state is not Captain-only; `operator_ready_toggled` replaces `mode_toggled`); [08-REQ-071] amended (replay's read-only disabled-affordance list); [08-REQ-072] amended (replay reconstructs per-operator ready-state at scrubbed `t`); [08-REQ-086] / [08-REQ-096b] amended (mutating-affordance prohibitions reworded for ready-state).
- **Module 06**: [06-REQ-011] amended to drop `defaultOperatorMode` and `defaultTurn0AutomaticTimeAllocationMs` from `global_centaur_params`; [06-REQ-040a] amended to drop the corresponding game-scoped fields from `game_centaur_state`; [06-REQ-040b] added introducing the `operator_ready_state` table and the `setOperatorReady` mutation; [06-REQ-036] action-log event union amended (`mode_toggled` removed; `operator_ready_toggled` added); §2.1.1, §2.1.5, §2.2.6, §2.4 schemas/contracts updated; `toggleOperatorMode` (§2.2.3) removed and replaced by `setOperatorReady`; exported interfaces (§3.x) amended.
- **Module 07**: 07-REQ-045 amended (separate `turn0AutomaticTimeAllocationMs` carve-out removed; turn 0 uses the same `automaticTimeAllocationMs`, naturally bounded by `remainingTimeBudget` which already encompasses the chess-clock's turn-0 budget); 07-REQ-045a amended re: flush-suppression trigger; §2.13 deadline computation updated for the same turn-0 carve-out removal. 07-REQ-044 (team-level scheduled submission pass), 07-REQ-046 (manual-mode exclusion), and the team-level semantics of `automaticTimeAllocationMs` are unchanged. *(Subsequent corrections: (i) the original Affected entry incorrectly described 07-REQ-044 / 07-REQ-046 as amended and recharacterised `automaticTimeAllocationMs` as a "per-snake auto-submission timer that is no longer team-level" — none of that ever happened in [07]; corrected above. (ii) An interim draft of 07-REQ-045a generalised the flush-suppression trigger to "any turn-over declaration," covering both the Captain's manual button and the all-operators-ready quorum path; that generalisation was an overreach and has been reverted — flush suppression remains Captain-only. 08-REQ-062 and the §8.12 commentary above were also reframed to remove a related false claim that the bot framework's compute queue must be empty as part of the gating precondition.)*
- **Module 05**: [05-REQ-012] (operator-mode toggling) reworded to refer to per-operator ready-state toggling. The `defaultOperatorMode` and `defaultTurn0AutomaticTimeAllocationMs` rows mentioned by the cascade plan never existed in §5.5 / 05-REQ-023 (those fields live exclusively on Module 06's `global_centaur_params`); no parameter-table edits to §5.5 are required.
- **AGENTS.md**: Module 08 status line updated to record the resolution; cascade notes added for Modules 05, 06, 07.

---

### 08-REVIEW-012: Informal spec filename drift — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: Consistent with 02-REVIEW-001, 06-REVIEW-007, 07-REVIEW-010. Requirements in this module were extracted from the informal spec now canonicalised at `informal-spec/team-snek-centaur-platform-spec.md`. Resolution is shared with the prior reviews.
**Question**: Confirm the current informal spec is canonical. See 02-REVIEW-001.
**Informal spec reference**: N/A (meta).

**Decision**: A — the current (unversioned) informal spec is canonical, consistent with the prior resolution of 02-REVIEW-001 (and the parallel resolutions of 06-REVIEW-007 and 07-REVIEW-010).
**Rationale**: Shared with 02-REVIEW-001. The earlier `SPEC-INSTRUCTIONS.md` filename drift has been resolved by renaming the informal spec to drop its version suffix; this module's requirements were extracted from that same content.
**Affected requirements/design elements**: None (meta-question).

---

### 08-REVIEW-013: Who marks a team ready — **RESOLVED**

**Type**: Gap (inherited from 05-REVIEW-007)
**Phase**: Requirements
**Context**: [08-REQ-027f] defers to [05] on which role within a team is permitted to mark the team ready. The informal spec §9.4 says "Captain or any operator", but 05-REVIEW-007 leaves the persistence and scope of readiness unresolved. Until 05-REVIEW-007 is resolved, the UI cannot fully specify its enablement logic.
**Question**: Which roles within an enrolled team may mark the team ready and unmark it?
**Options**:
- A: Captain only.
- B: Captain or any member with the Operator role.
- C: Any current team member regardless of role.
**Informal spec reference**: §9.4 step 3.

**Decision**: A — Captain only.
**Rationale**: This aligns the operator UI's enablement logic with the upstream Captain-only ready-check authorization that [05] already pins via [05-REQ-031] (after the 05-REVIEW-007 resolution). It also preserves the principle that team-level commitments (like declaring readiness for a game) are the Captain's prerogative, consistent with the broader Captain-only scoping established by 08-REVIEW-001 for team-scoped configuration.
**Affected requirements/design elements**: 08-REQ-027f amended (deferral text removed; Captain-only enablement made explicit; non-Captain members see a read-only readiness indicator).

---

### 08-REVIEW-014: Board preview generation locality — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: [08-REQ-027i] describes a miniature board preview that regenerates as the administrative actor edits room configuration parameters. Two questions are underspecified: (a) is the preview generated client-side by running a JavaScript port of the board-construction algorithm owned by [01], or server-side by Convex calling into a shared engine codebase per [02-REQ-035]; (b) does the preview need to be deterministic with a seed such that locking one in ([08-REQ-027j]) reliably reproduces the same layout at game start?
**Question**: Where is the preview generated, and is determinism via seed required for lock-in to work?
**Options**:
- A: Client-side generation using a shared algorithm port; lock-in persists the seed only; [04] honours the seed at game init.
- B: Server-side generation via a Convex action; lock-in persists the server-generated layout directly; [04] honours the layout as a supplied parameter rather than regenerating from a seed.
- C: Client-side generation without lock-in guarantee (the preview is decorative only); lock-in is removed as a feature.
**Informal spec reference**: §8.4 (Room Lobby, Board preview).

**Decision**: Custom — the Convex preview mutation defined by [05-REQ-032b] is the sole authority for generating a board from input parameters. The preview runs `generateBoardAndInitialState()` from the shared engine codebase ([02-REQ-035]) inside a Convex mutation on each parameter edit and is delivered to the web client reactively via Convex's reactive query model. SpacetimeDB never generates a starting board — its `initialize_game` payload always carries the complete pre-computed initial game state plus dynamic gameplay parameters; board-generation parameters are consumed entirely within Convex. The application performs no client-side board generation. This simply ratifies the already-pinned upstream architecture of [05-REQ-022] and [05-REQ-032b] (the "config-on-game" architecture established by 05-REVIEW-008 and the board-generation locality established by Task #8).
**Rationale**: A single source of truth for board generation eliminates client/server determinism concerns, eliminates any need for a JavaScript port of the construction algorithm, and matches the upstream architecture already pinned by [05]. Determinism via persisted seed is therefore moot — the preview is itself the persisted starting state, regenerated on demand by Convex.
**Affected requirements/design elements**: 08-REQ-027i amended (Convex preview mutation is the generator; no client-side board generation; preview delivered reactively). Module-08 sweep performed: only 08-REQ-027i / 027j / 027k mention board preview generation, and they are corrected together with 08-REVIEW-015. Cross-reference: [05-REQ-022] and [05-REQ-032b] are unchanged by this resolution — it ratifies them.

---

### 08-REVIEW-015: Where a locked-in board preview is persisted — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [08-REQ-027j] says lock-in of a board preview must cause the subsequent game-start orchestration of [05-REQ-032] to seed the game with the locked-in layout. But [05] does not currently have a requirement acknowledging this — [05-REQ-024] talks about parameter snapshots, not generated-content snapshots. A locked-in preview is neither a parameter value nor a derived-from-parameters quantity; it is a concrete board layout that needs to live somewhere in the Convex schema and be plumbed through to [04]'s `initialize_game` reducer.
**Question**: Does the locked-in preview belong in the room record, the next-game's record, or in a separate preview table? And does it extend [05-REQ-032]'s required init payload?
**Options**:
- A: Add a field on the room record holding the currently-locked preview, consumed and cleared at next game-start.
- B: Create the game record eagerly at lock-in time and attach the preview to it.
- C: The locked preview is not persisted at all; it is re-rendered at game-start from a persisted seed and the current parameters.
**Informal spec reference**: §8.4 (Room Lobby, Board preview lock-in); §9.4 (Game Lifecycle).

**Decision**: Custom (essentially Option A scoped to the not-yet-started game record, not the room record). The starting game state always lives on the not-yet-started game record's configuration document, alongside its other configuration parameters. A separate `boardPreviewLocked: boolean` flag on the same game record indicates whether locking is in effect. Every preview generation by [05-REQ-032b] writes the resulting starting state onto the game record, regardless of lock-in status; the flag governs only whether [05-REQ-032] step 2 reuses the persisted state (true) or regenerates from a fresh seed at game-launch initiation (false). When unlocked, the regenerated starting state is not displayed to any participant via the configuration UI — it is only seen by operators after it reaches their Centaur interface via the SpacetimeDB subscription. This extends to the starting game state itself the principle (already pinned by 05-REVIEW-008 and materialised by [05-REQ-022] / [05-REQ-032b]) that all configuration parameters are configured on a not-yet-started game record, never on the room record.
**Rationale**: Keeps configuration on a single document (the game), eliminates a separate preview table, and reduces "lock in" to a single boolean affecting one well-defined behaviour at game-launch initiation. Persisting on every regeneration (rather than only on lock-in) keeps the data shape uniform and makes the unlocked-but-not-yet-started case trivially reactive in the UI.
**Affected requirements/design elements**: 08-REQ-027j amended (explicit semantics of `boardPreviewLocked`; persistence on every regeneration; unlocked regeneration is not surfaced to configuration-mode UI). Cascade to [05]: [05-REQ-032b] amended (every preview generation persists onto the game record; `boardPreviewLocked` flag governs reuse). [05-REQ-032] step 2 amended (conditional on `boardPreviewLocked`, not on "if a preview was locked in").

---

### 08-REVIEW-016: Public vs authenticated-only visibility of profiles and leaderboard — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: The informal spec §8.7 and §8.8 describe Player Profile and Team Profile pages as "public" in one place and as accessible to "any authenticated user" in others. The current draft assumes authentication is required for all platform views ([08-REQ-006]) but this is in tension with the "public" framing. A related question is whether email addresses on Player Profiles should be visible to all authenticated users or only to the profile owner and their team-mates.
**Question**: Are team and player profiles public (accessible without authentication) or authenticated-only? And what is the visibility scope of email addresses on Player Profiles?
**Options**:
- A: Authentication required for all views (current draft of 08-REQ-006). Emails visible to all authenticated users.
- B: Team and player profile pages are public and indexable. Emails hidden except on the user's own profile.
- C: Team profile public, player profile authenticated-only. Emails hidden everywhere except self-view.
**Informal spec reference**: §8.7, §8.8.

**Decision**: A, with one clarification — emails are never exposed to any user query. Authentication is required for all platform views per [08-REQ-006]. User identity surfaced to other authenticated users is the OAuth-provided display name only (per [03] §3.14). Email addresses are stored in Convex (necessary for OAuth identity matching and admin recovery flows) but are not exposed in any user-facing query: not on Player Profile (including the user's own self-view), not on Team Profile, not on team-member listings, not on game-history attributions, and not on leaderboards.
**Rationale**: Minimises PII surface area while preserving the platform's auth-required posture. The user's email is owned by the OAuth provider; the application has no authoritative reason to display it back to the user, and exposing it to other authenticated users (even within a team) is an unnecessary leak. The "public" framing in the informal spec conflates "accessible to any user of the platform" with "accessible to anyone on the internet"; this resolution pins the former.
**Affected requirements/design elements**: 08-REQ-090 amended (deferral removed; explicit auth-only). 08-REQ-091 amended (email removed from Player Profile display). 08-REQ-094 amended (deferral removed; explicit auth-only). 08-REQ-094f amended (deferral removed). 08-REQ-091a added as a new module-08-owned negative requirement: "No application view shall expose any user's email address to any other user, nor to the user themselves" — this constrains [05]'s query surface (no [05] user-scoped query may include email in its returned shape). Downstream impact (recorded as a constraint, not a [05] requirement amendment in this task): [05]'s query layer must enforce 08-REQ-091a; this constraint should be honoured by [05] Phase 2 design and any future [05] query additions.

---

### 08-REVIEW-017: Deleted teams in leaderboards — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [05-REQ-015a] permits Centaur Team deletion while preserving historical participating-team snapshots. [08-REQ-094e] currently says the leaderboard continues to resolve historical teams via snapshots, implying a deleted team could still appear in leaderboards under its historical identity. This may be undesirable — a team might be deleted because it was created in error, was used for spam, or belonged to a departed user — and the leaderboard may want to hide it. On the other hand, hiding it rewrites historical outcomes.
**Question**: Should deleted Centaur Teams continue to appear in the global leaderboard?
**Options**:
- A: Yes — deleted teams continue to appear under their historical identity; deletion is purely a live-state operation. (Current draft.)
- B: No — deleted teams are excluded from leaderboard listings but remain in per-game history where they participated.
- C: Configurable per leaderboard view with a "include deleted teams" toggle.
**Informal spec reference**: N/A (gap). See also 05-REVIEW-011.

**Decision**: The question is moot — Centaur Teams cannot be deleted. Per [05-REQ-015a] (resolved by 05-REVIEW-011), Centaur Teams are archive-only: archiving hides the team from default listings and prevents new-game enrolment but preserves all live and historical state, and historical game records continue to resolve the team's historical identity for attribution. The leaderboard, which already uses participating-team snapshots per [08-REQ-094e], therefore continues to display the team under its archived identity. Archived teams shall continue to appear in the default leaderboard view, consistent with the principle that archiving is a live-state hide-from-listings action and not a historical-state rewrite (the same pattern as room archiving per [05-REQ-021a]). A future enhancement may add an opt-out filter for archived teams, but it is not required.
**Rationale**: Deletion is not a thing in this platform; the original premise of the question is invalidated by the upstream resolution (05-REVIEW-011). Hiding archived teams from the leaderboard would rewrite historical outcomes; preserving them costs nothing and keeps competitive history intact.
**Affected requirements/design elements**: 08-REQ-094e amended ("deleted" → "archived"; deferral removed; positive statement that archived teams remain in default leaderboard view). 08-REQ-093, 08-REQ-097, 08-REQ-103 incidentally amended in the same sweep ("deleted" → "archived") to enforce platform-wide archive-only terminology. References [05-REQ-015a] / 05-REVIEW-011 as the upstream resolution.

---

### 08-REVIEW-018: Live spectating when invisibility is active — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: [08-REQ-083] says the spectator view honours invisibility filtering per [04-REQ-047] — i.e., invisible snakes simply are not delivered to spectator subscriptions. But the spectator is nonetheless a third-party observer whose scoreboard ([08-REQ-084]) aggregates alive-snake lengths per team. If a team has an invisible snake, the spectator's scoreboard either (a) reflects the reduced visible length (misleading — the snake is still alive), (b) reflects the true aggregate (requires server-side calculation with team privilege, violating the spectator-view data model), or (c) omits the invisible snake from the count while marking the score as "partial." This tension is not addressed by the informal spec.
**Question**: How does the spectator scoreboard handle invisible snakes?
**Options**:
- A: The scoreboard shows only what the spectator subscription delivers; invisible snakes are simply not counted. The spectator experience is intentionally lossy.
- B: The scoreboard shows true aggregates computed server-side using a privileged aggregate query that bypasses per-snake visibility; only aggregates are disclosed, not per-snake state.
- C: The scoreboard distinguishes "visible length" from "total length, some hidden," alerting the spectator that hidden snakes exist on that team.
**Informal spec reference**: §8.5 (Live Spectating); §4.3 (Invisibility potion semantics).

**Decision**: Custom (Option B generalised). Clients are dumb readers of state shared by SpacetimeDB views; they do not compute scores from raw snake data. The spectator scoreboard shall be backed by a dedicated SpacetimeDB scoreboard view that publishes per-team aggregate scores (computed server-side over the true alive-snake set, including invisible snakes) and exposes only the aggregates — never per-snake state for invisible snakes. This is generalised beyond the scoreboard: the broader principle is that client UIs render state delivered by SpacetimeDB views and do not reconstruct game-mechanics quantities (score, length aggregates, win conditions) from raw subscription data they may have an incomplete view of.
**Rationale**: A single server-side authority over score eliminates client/server divergence, eliminates the invisibility leak that would arise from clients aggregating only visible snakes, and aligns with [04-REQ-047]'s server-side filter posture. The per-snake invisibility filter ([08-REQ-083]) remains in force; the scoreboard view is the only server-side aggregate channel and per-snake state is still filtered by visibility.
**Affected requirements/design elements**: 08-REQ-084 amended (scoreboard sourced from a dedicated SpacetimeDB scoreboard view, not client-aggregated; "proxy for team score pending 05-REVIEW-006" parenthetical dropped — score semantics are owned upstream and the client just renders them). 08-REQ-084b added as a negative requirement: the application shall not compute team-level aggregate quantities by aggregating raw per-snake subscription data on the client. 08-REQ-083 unchanged. Downstream impact (recorded as a constraint, not a [04] requirement amendment in this task): [04] Phase 2 design (already drafted, §2.9 / §2.12) must add a scoreboard view to its visibility-filtering / view design; concretely, a `scoreboard_view` per game is needed exposing `(teamId, teamScore, aliveSnakeCount, aggregateLength)` computed over the true snake set, subscribable by spectator and operator clients alike. This is recorded here as a downstream impact for [04] Phase 2 design to address; an accompanying open `04-REVIEW-020` item is filed (see [04]'s REVIEW Items section) so the work is not lost.

---

### 08-REVIEW-019: Timeline scrubber data delivery for long games — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [08-REQ-087] asserts the spectator timeline scrubber leverages [04-REQ-057] historical reconstruction. [04-REQ-054]'s subscription patterns mention that a client joining mid-game can subscribe to full history. For short games this is fine, but for long games (tournament rounds, extended max-turn games) the initial delivery could be sizable. The question is whether the UI must demand full history up-front on entry to the spectator view or can lazily fetch historical slices as the user scrubs.
**Question**: Does live spectating entry require an up-front full-history subscription, or does the UI fetch historical slices on demand?
**Options**:
- A: Up-front full subscription — simplest client code, possibly slow entry on long games.
- B: Live-only subscription on entry; lazy-fetch historical slices via query only when the user scrubs backward.
- C: Hybrid — subscribe to current turn + a configurable window (e.g., last 20 turns) on entry; lazy-fetch beyond that.
**Informal spec reference**: §8.5 (Live Spectating timeline scrubber); §10 (Client Query Patterns).

**Decision**: A — up-front full-history subscription on entry to the spectator view. Games are bounded to at most a few hundred turns and a few seconds of loading is acceptable for the spectator entry experience (worst case).
**Rationale**: Simplest client implementation, no lazy-fetch state machine, no fallback paths to maintain; the worst-case latency is acceptable per the explicit user tolerance. Lazy fetching would add a moving-window state machine and visibly stutter when the user scrubs to a turn outside the prefetched window — a worse UX in exchange for a small entry-time saving on a small population of unusually long games.
**Affected requirements/design elements**: 08-REQ-087 amended (positive statement that the UI subscribes to the game's full historical state up-front on entry, per [04-REQ-054]'s mid-game-join subscription pattern, accepting bounded entry latency proportional to game length).

---

### 08-REVIEW-020: Game-in-progress discoverability on the home view — **RESOLVED**

**Type**: Ambiguity
**Phase**: Requirements
**Context**: [08-REQ-010a] says the home view lists "games currently in progress in which any of the user's Centaur Teams are participating." But the spectator affordance is available to *any* authenticated user — users may want to discover interesting games in progress even in rooms they have no team affiliation with. The informal spec §8.1 describes the home view narrowly around memberships and recents, leaving general discovery to the Room Browser. Whether a dedicated "live games" discovery surface is needed is not answered.
**Question**: Should the home view or the Room Browser expose a dedicated listing of all games currently in progress regardless of team affiliation?
**Options**:
- A: Only games involving the user's teams on the home view; no platform-wide live-games listing. (Current draft.)
- B: Add a "live games" section to the home view showing all platform-wide games in progress.
- C: Add a filter to the Room Browser for "rooms with a game in progress."
**Informal spec reference**: §8.1, §8.3.

**Decision**: A — only games involving the user's teams are listed on the home view; no platform-wide live-games discovery surface is added in this revision.
**Rationale**: Matches the current draft and the informal spec §8.1's narrow framing of the home view around memberships and recents; general discovery remains the Room Browser's responsibility (already accessible from the global navigation per [08-REQ-010]). A platform-wide live-games surface can be added later if user behaviour warrants it.
**Affected requirements/design elements**: None — [08-REQ-010a] is left as-is in substance. No "see 08-REVIEW-020" deferral text exists in any requirement (the deferral was confined to the REVIEW item itself), so no body-text amendment is required.

---

### 08-REVIEW-021: Heuristic registry drift between server and team configuration — **RESOLVED**

**Type**: Gap
**Phase**: Requirements
**Context**: [06-REQ-005] states that heuristic defaults are per-CentaurTeam and that when a team replaces its Centaur Server, the new server inherits the existing heuristic defaults. [08-REQ-058] says the application shall not expose Drives whose types are not registered in the team's heuristic default configuration. However, there is no specification for what happens when the set of heuristic IDs registered in a team's Centaur Server source code diverges from the set of heuristic IDs in the team's `heuristic_config` table. This drift can occur in two directions: (a) the new server introduces heuristic IDs that have no `heuristic_config` entry (new Drives/Preferences added in code), and (b) the team's `heuristic_config` contains entries for heuristic IDs that the new server does not register (stale entries from a previous server). The original draft said stale entries are "ignored at runtime and may be cleaned up by the team" (06-REVIEW-001 resolution) but did not specify how the UI handles this — in particular, whether stale Drives appear in the dropdown, whether new (unconfigured) Drives are accessible, and whether the heuristic configuration page surfaces the mismatch.
**Question**: How should the UI handle heuristic ID mismatches between the running server's registered heuristic set and the team's persisted `heuristic_config`?

**Decision**: The Snek Centaur Server's bot framework ([07] §2.3) defines a build-time-shared TypeScript module `HEURISTIC_REGISTRY: ReadonlyArray<HeuristicRegistration>` that is imported by both the framework runtime and the SvelteKit frontend (this module — they share a workspace package and compile against the same source file at build time). Drift between "what the server can simulate" and "what the UI can render" is therefore structurally impossible within one build artifact.

The frontend's behaviour:

1. **In-game Drive dropdown** ([08-REQ-052]): sources its options from the **intersection** `heuristic_config ∩ HEURISTIC_REGISTRY` filtered to `heuristicType = "drive"`, ordered per [06-REQ-007]'s pinned-then-lexicographic scheme. Drives present in `heuristic_config` but absent from the registry are hidden from the dropdown (stale). Drives present in the registry but absent from `heuristic_config` are also hidden from the dropdown (the lazy-insert below ensures this state does not persist past a Captain visit to the global params page).

2. **Lazy-insert on global centaur params page visit** ([08-REQ-014]): when the Captain visits the global centaur params page, the page calls a new `insertMissingHeuristicConfig({ centaurTeamId, registrations })` mutation on Module 06 (added per [07] §2.19) under the Captain's Convex auth credential. The mutation is **insert-only and never overwrites**: for each registration whose `heuristicId` is not already in the team's `heuristic_config`, it inserts a row using the registry's `defaultWeight`, `activeByDefault`, and `nickname` as initial values; for IDs already present, it does nothing. Once written, `heuristic_config.weight`/`activeByDefault`/`nickname` override the source-code `defaultWeight`/`activeByDefault`/`nickname` (Convex is authoritative).

3. **Stale-entry display on global centaur params page** ([08-REQ-014]): heuristic IDs present in `heuristic_config` but absent from the current registry are visually distinguished as "stale" (e.g., greyed out with a "no longer registered by this server" annotation) and offered a delete affordance that calls `deleteHeuristicConfig`. They are **not** surfaced in the in-game Drive dropdown, only on the global centaur params page where the Captain can see and clean them up.

4. **No framework writes to `heuristic_config`**: the bot framework itself never invokes `insertMissingHeuristicConfig` or any other `heuristic_config` mutation ([07-REQ-018]). The lazy-insert is invoked from this module's frontend under the Captain's credential because the Captain is the trust anchor for changes to team configuration ([06] §2.6; 08-REVIEW-001).

**Rationale**: A build-time-shared TypeScript module eliminates runtime drift at the build-artifact level, requires no new wire protocol, and propagates literal heuristic-ID types end-to-end into the frontend's component props. The lazy-insert pattern (rather than automatic background sync) keeps the Captain in control of when registry defaults become persisted configuration: the Captain's act of visiting the global centaur params page constitutes the consent. Insert-only-never-overwrites preserves Captain-edited values on subsequent registry expansions.

**Affected requirements/design elements**: [07] §2.3, §2.18, §2.19, §3.1, §3.7 added in [07] Phase 2. [06] amended to add the `insertMissingHeuristicConfig` mutation per [07] §2.19. This module's frontend (Phase 2) imports `HEURISTIC_REGISTRY` from the workspace package and wires the lazy-insert call into the global centaur params page load lifecycle.

**Informal spec reference**: §7.1 (heuristic configuration); §7.6 (Drive dropdown).

---

### 08-REVIEW-022: Centaur-lib package name inconsistency between [02] and [08] — **RESOLVED**
**Type**: Ambiguity
**Phase**: Design
**Context**: 08-REQ-076 names the published library package `@team-snek/centaur-lib`. [02] §2.13 / §2.16a (and [02-REQ-030] / [02-REQ-032a]) name the same artifact `@snek-centaur/server-lib`. Both names refer to the same artifact — the Snek Centaur Server library that exports the data-source abstraction (§3.2), the per-operator stable-colour function (§3.3), the presence channel shape (§3.4), the invitation endpoint contract (§3.1), and re-exports `startGameSession` from [07]. Module 08's Phase 2 design canonicalises on [02]'s name (`@snek-centaur/server-lib`) for consistency with the existing Phase-2-completed architectural module that pinned the package graph; the per-task instructions explicitly prohibit editing [02] from this module's Phase 2 task and direct that any cross-module cascade be filed as a REVIEW item rather than silently resolved.
**Question**: Which of the two names is canonical going forward?
**Options**:
- A: Canonicalise on `@snek-centaur/server-lib` (matches [02], the platform-architecture module that owns package-graph decisions). Amend 08-REQ-076 to use this name.
- B: Canonicalise on `@team-snek/centaur-lib` (matches 08-REQ-076 as currently written, plus aligns the prefix with `@team-snek/heuristics` per [02] §2.16a / [07-REVIEW-015]). Amend [02] §2.13 / §2.16a / [02-REQ-030] / [02-REQ-032a] to use this name.
- C: Adopt a third name (e.g., `@team-snek/server-lib`) that aligns the namespace with `@team-snek/heuristics` and `@team-snek/bot-framework` while dropping the `centaur-lib` ambiguity. Amend both [02] and 08-REQ-076.
**Informal spec reference**: §2 (architectural overview, package-graph language was not formalised in the informal spec).

**Decision**: Option A — canonicalise on `@snek-centaur/server-lib`. 08-REQ-076 is amended to use this name; the §2.4 Library-dependency disclaimer and the §3.6 "(canonicalisation pending 08-REVIEW-022)" parenthetical are removed.
**Rationale**: [02] is the platform-architecture module that owns the package-graph decisions, and its Phase 2 already pinned `@snek-centaur/server-lib` across §2.13, §2.16a, [02-REQ-030], and [02-REQ-032a]. Module 08's design body had already pre-emptively used this name throughout §2.4 / §2.7 / §3.2; 08-REQ-076 was the lone exception. Aligning [08] to [02] minimises cross-module churn (no [02] edit) and respects the module-ownership boundary the per-task instructions explicitly preserved by routing this through a REVIEW item rather than a silent resolution. Option B would require editing [02] from this module's task pass; Option C would force a third-name renaming cascade across both modules with no offsetting benefit. The `centaur-lib` colloquial nickname remains available as a narrative shorthand (e.g., §3.6's "Centaur-Lib Library Surface Summary" heading) without conflict, since it is not used as a package identifier.
**Affected requirements/design elements**: 08-REQ-076 amended to use `@snek-centaur/server-lib`. §2.4 Library-dependency bullet's three-sentence parenthetical about the inconsistency removed. §3.6 introductory paragraph's "(canonicalisation pending 08-REVIEW-022)" parenthetical removed. No [02] amendments. No other workspace package renamed (`@team-snek/heuristics`, `@team-snek/bot-framework` keep their existing prefixes).

---

### 08-REVIEW-023: Worst-case world annotations data substrate excised upstream — **RESOLVED**
**Type**: Gap
**Phase**: Design
**Context**: 08-REQ-049 specifies that annotations computed against the worst-case world (Voronoi-style territory overlay and any other team-configured annotations) shall be rendered against the worst-case world rather than the current board, sourced from the `annotations` field of the computed display state per [06-REQ-026]. However, the [07] Phase 2 resolution of 07-REVIEW-014 (and its two follow-up resolutions) excised the `WorldAnnotations` per-direction record from `SnakeBotStateSnapshot.worstCaseWorlds` and dropped the corresponding `snake_bot_state.annotations` column from [06]'s schema; the [07] §3.4 exported snapshot shape carries no annotations payload. The 07-REVIEW-014 resolution explicitly defers a replacement annotations design to "[08] Phase 2 once the operator UI's annotation needs are concrete" ([07] §2.11 narrative; [07] §3.6 removal note). This Phase 2 design pass for [08] does not have enough concrete annotation requirements (beyond the single Voronoi-style example named in 08-REQ-049) to design a replacement substrate without speculation, so layer 6 of the board renderer (§2.7) and the worst-case world preview (§2.9) currently render the simulated `state` only and surface no per-direction annotations.
**Question**: How should the worst-case-world annotations substrate be reintroduced to satisfy 08-REQ-049, given that [07] §3.4 no longer publishes one and the open-shape `WorldAnnotations` design was rejected?
**Options**:
- A: Reintroduce a closed-set typed annotations payload on `SnakeBotStateSnapshot.worstCaseWorlds` enumerating exactly the operator-UI-visible annotations (e.g., `{ voronoiTerritory?: TerritoryMap }`); cascade into [07] §3.4, [06] §2.1.3, and [04] (no impact). Closed set keeps the wire shape stable and forces additions to be explicit cross-module amendments.
- B: Compute annotations client-side in [08] from the published `SimulatedWorldSnapshot.state` using a small set of [08]-owned analysers (e.g., a Voronoi BFS over the simulated `GameState`). No upstream cascade, but [08] does work the framework previously did.
- C: Drop annotations entirely from the MVP UI (treat 08-REQ-049 as a documented deferral with no design surface); revisit when concrete annotation needs are surfaced by users.
**Informal spec reference**: §7.5 (worst-case world annotations); §7.6 (Voronoi territory display).

**Decision**: Option C — drop annotations entirely from the MVP UI. 08-REQ-049 is amended to a documented MVP deferral; no replacement annotations substrate is designed in this pass.
**Rationale**: (a) The user's actual MVP requirement — *display the worst-case simulated world for each candidate move per snake, alongside a table of heuristic outputs for that worst-case world* — is fully satisfied by the surviving substrate published by [07] §3.4: the per-direction `worstCaseWorlds` record (with the `state` field carrying the simulated `GameState` and the `perSnakeTurnTimestamp` field carrying the per-snake freshness timestamp), and the per-direction `heuristicOutputs` record. 08-REQ-048 (worst-case world preview), 08-REQ-050 (reactive update), 08-REQ-051 (no-direction hide), and 08-REQ-059 (decision breakdown table) all consume only this surviving substrate and stand without modification. (b) The only thing being deferred is the *separate annotations overlay* — the Voronoi-territory-style layer that would have been drawn on top of the worst-case world and was previously sourced from a `06-REQ-026.annotations` field that no longer exists upstream. The user has confirmed they do not want an annotations plugin system in the MVP, so designing a replacement substrate now would be speculative work with no concrete consumer. (c) The per-snake turn timestamp restored by the second follow-up amendment to 07-REVIEW-014 carries forward via `worstCaseWorlds[direction].perSnakeTurnTimestamp` and powers the frozen-foreign visual treatment in §2.7 layer 6 and §2.9, satisfying [07] §3.7's DOWNSTREAM IMPACT recommendation. Options A and B were both rejected: A would force a closed-set enumeration of annotations the user has explicitly said they do not want as an MVP feature, with cross-module cascade into [07] §3.4 and [06] §2.1.3; B would push framework-class board analysis into the operator UI without a concrete consumer. Any future annotations design will be filed as a new REVIEW item against [08]'s post-MVP work.
**Affected requirements/design elements**: 08-REQ-049 amended to a documented MVP deferral (no longer references `06-REQ-026.annotations`; explicitly names worst-case-world annotations as out of scope for the MVP UI; cross-references 08-REQ-048 and 08-REQ-059 as unaffected). 08-REQ-072 amended to drop the standalone "annotations" item from the replay reconstruction enumeration (the surviving "stateMap and worst-case world and heuristic outputs" is what gets reconstructed). §2.7 layer 6 and §2.9 worst-case-world-preview prose lose the "until 08-REVIEW-023 is resolved" hedging and add the explicit `perSnakeTurnTimestamp`-driven frozen-foreign visual treatment per [07] §3.7. No [07], [06], [04], or [02] amendments — the surviving substrate already exists upstream and the deferred annotations layer never re-enters those modules in this pass.

---

### 08-REVIEW-024: Per-operator coordination is durable per-operator tempo with Captain boot affordance — **RESOLVED**

**Type**: Correction
**Phase**: Requirements / Design

**Prior text**: Per the resolution of 08-REVIEW-011, per-operator coordination was a per-turn boolean `ready` / `not-ready` state that reset at every turn boundary, with the team's automatic-submission precondition expressed as "every currently-connected member operator is `ready`." The spec writer additionally proposed a default-polarity inversion (so `ready` became the idle state and `not-ready` the opt-in slow-time signal) as a fix for the routine-turn cost model.

**Correction**: Per-operator coordination is modelled as durable per-operator **tempo** (`flow` / `thinking`), persisted in table `operator_tempo` with mutation `setOperatorTempo({ gameId, tempo })`. Tempo is durable across turns: the arrival of a new turn does not modify any operator's tempo. The automatic-submission precondition is defined in terms of a single "**active operators**" concept (the team's currently-connected member operators) and is stated simply as "all active operators are in flow." Network-detected disconnection removes an operator from the active set; the Captain's `bootOperator({ gameId, operatorUserId })` mutation is defined as a **manual forced disconnect** that severs the target operator's game-session connection identically to a network disconnect (no persistent "is booted" state on the operator, no revoke mutation, no sticky lockout). On (re)connect — first-ever join, after a network drop, or after a Captain boot — the operator's client calls `setOperatorTempo({ tempo: "flow" })` as its automatic (re)connect call, the only automatic write to tempo and the uniform initial value for every join path. The action-log event union carries `operator_tempo_changed` and `operator_booted`; both carry the action log's standard wall-clock `timestamp` and are recorded as time-based events so the team-perspective replay viewer can reconstruct the active-operator set and per-operator tempo at any scrubbed `t` regardless of turn boundaries (boot events appear in this stream as the manual analogue of a connection-loss event). UI labels are `In Flow` / `Thinking…` for the operator-facing toggle, and `●` / `⧖` for the presence-display indicators; the Captain sees a single "Boot" button per active operator.

**Rationale**: The polarity-flip fix addressed only the routine-turn cost model; it left intact three further problems the prior text had absorbed without flagging. (1) The *name* "ready / not-ready" described a per-turn vote rather than a stance toward pacing, and the per-turn reset semantics it implied churned every operator's signal at every turn boundary, observable in the action log and in any UI animating the indicator, with the team silently reconfirming the unanimity precondition each turn — "tempo" with values `flow` / `thinking`, durable across turns, names what is actually being expressed and eliminates the churn entirely. (2) Disconnected operators occupied an awkward middle ground in the prior phrasing — they were trivially absent from the "currently-connected" set so they didn't break the precondition, but the prose phrasing made the exclusion sound conditional and the schema didn't really say what a disconnected operator's `ready` bit meant; defining the precondition once around the "active operators" set removes the silent-assumption hazard and avoids the temptation to add further qualifying adjectives every time a new exclusion mechanism is considered. (3) There was no nuclear option when an operator went `thinking` (under the new name) and then dropped off the network, fell asleep, or otherwise vanished — the team's only escape was the chess-clock expiry path, which is not what that path is for; a Captain-only boot affordance closes that gap. Making boot a one-shot forced disconnect (rather than a sticky lockout with a revoke counterpart) lets it share the active-set-membership mechanism with network disconnects, so the rest of the spec can describe the precondition once and need not mention boot as a separate qualifier; if the booted operator does come back, they rejoin in `flow` like any other reconnecting operator, and the Captain may boot again if necessary. The client-side `flow` write on (re)connect is necessary precisely because tempo is durable: without it, an operator who toggled to `thinking` and then dropped off the network could silently leave the team paused indefinitely once they returned; the (re)connect write upgrades the silent failure into a recoverable one. Time-stamping the tempo and boot events lets the replay viewer's Timeline-mode scrubber show the exact wall-clock moment any operator toggled or was booted, which is the natural representation for events that do not respect turn boundaries.

**Informal spec reference**: §7.5 (per-operator coordination), §7.6 (turn submission), §6.6 (action-log event union).

**Downstream impact (DOWNSTREAM IMPACT note)**:
- **Module 06**: §2.1.5 defines the `operator_tempo` table (`tempo: "thinking" | "flow"`). §2.2.3 defines mutations `setOperatorTempo` and `bootOperator` (Captain-only). §2.4 action-log event union carries `operator_tempo_changed` and `operator_booted`. §2.5 init prose initialises tempo lazily on first (re)connect. 06-REQ-040b defines the table, mutations, semantics (durable across turns), and Captain-boot affordance. §3.1 schema export, §3.2 / §3.3 signatures, §3.4 init contract sideEffects, §3.5 DOWNSTREAM IMPACT all reflect this. §2.4 replay reconstruction prose notes time-stamped tempo/boot events as the reconstruction substrate.
- **Module 08**: §8.12 "Per-Operator Tempo and Turn Submission" defines the tempo toggle (08-REQ-061), the active-operators precondition (08-REQ-062), tempo editability and durability (08-REQ-063), the uniform `flow`-on-(re)connect default (08-REQ-064), and the no-tempo treatment of coach/admin observers (08-REQ-064a). §8.14 Captain Controls covers turn-submit (08-REQ-065) and operator-boot (08-REQ-068a). 08-REQ-032 / 08-REQ-052a / 08-REQ-067 / 08-REQ-068 / 08-REQ-071 / 08-REQ-072 / 08-REQ-086 / 08-REQ-096b use tempo terminology and reference the boot affordance where relevant. Library Presence bullet, §2.4 replay reconstruction, §2.7 connection lifecycle, §2.8 presence display (Boot affordance), §2.10, §2.16 spectator negative surface, §3.2 mutation signatures, §3.4 presence shape all reflect this model.
- **Module 05**: 05-REQ-012 references the Captain's in-game operator-boot affordance per [06-REQ-040b] / [08-REQ-068a] alongside turn submission, while clarifying that tempo toggling itself is not a Captain-only authority.
- **Informal spec**: §5 Centaur Server library bullet, §7.2 Bot Parameters, §7.5 Live Operator Interface (presence display, tempo toggle, Captain controls), §7.6 Turn Submission, §11 action log event union, §13.2 replay rebuild all consistent with the tempo model.
- **README**: Operator Interface "turn submission is coordinated through" paragraph, Presence Display paragraph, Replay Viewer paragraph, and Module 08 row in the spec table all consistent with the tempo model.
- **06-REVIEW-008**: historical-note footer records the tempo model on top of the prior 08-REVIEW-011 ready-state design, preserving the chain of decisions.
- **05-REVIEW-014**: historical-note footer extended for the same reason as 06-REVIEW-008.
- **No [07] amendments**: the bot framework's [07-REQ-044] / [07-REQ-045] reference the precondition's shape and not its underlying schema or naming; they remain correct verbatim under the tempo model. [07] §3.7's flush-suppression coordination note continues to describe the Captain turn-submit override path; the Captain boot affordance does not interact with flush suppression because boot affects the unanimity precondition's *participant set*, not the precondition's truth value at any given instant.
- **No [04] amendments**: SpacetimeDB's `declare_turn_over` reducer is unaffected; the precondition lives entirely above it.
