# Module 06: Centaur State

## Requirements

### 6.1 Scope and Ownership

**06-REQ-001**: The Centaur state subsystem shall be the persistent store of all per-Centaur-Team and per-game state that the bot framework ([07]) and the Snek Centaur Server frontend ([08]) require, other than authoritative game state (which lives in SpacetimeDB per [02-REQ-007]) and platform-wide records (which are owned by [05]).

**06-REQ-002**: All Centaur state shall reside in the single Convex deployment mandated by [02-REQ-002]. No Centaur state shall be stored in any SpacetimeDB instance.

**06-REQ-003** *(negative)*: The Centaur state subsystem shall not hold any state that is authoritative for game outcome. Game-authoritative state (board, snake bodies, items, chess timer, turn history) is owned by SpacetimeDB per [02-REQ-013].

**06-REQ-004**: Centaur state shall be partitioned into two lifetime classes:
- **Team-scoped persistent state**: survives across games and is edited between games. Bound to a Centaur Team identity ([02-REQ-005]).
- **Game-scoped state**: bound to a single game's lifetime, initialised at game start and retained thereafter for replay ([06-REQ-040]).

---

### 6.2 Team-Scoped Heuristic Defaults

**06-REQ-005**: The subsystem shall persist, per Centaur Team, a **heuristic default configuration** describing the team's defaults for every Drive type and every Preference registered with that Centaur Team's Snek Centaur Server ([07]). Heuristic defaults are per-CentaurTeam; if a team replaces its Centaur Server, the new server inherits the existing heuristic defaults. The server determines which heuristics are available by string ID registered in source code, but storage is per-team. (See resolved 06-REVIEW-001.)

**06-REQ-006**: For each registered Preference, the heuristic default configuration shall store: (a) whether the Preference is active on new snakes by default, and (b) its default portfolio weight.

**06-REQ-007**: For each registered Drive type, the heuristic default configuration shall store: (a) its default portfolio weight when added to a snake and (b) a human-readable `nickname` for UI display. Drive dropdown ordering is determined by a `pinnedHeuristics` array on `global_centaur_params` (see [06-REQ-011]): pinned heuristics appear first in pinned order; remaining heuristics are ordered lexicographically by `nickname`, with `heuristicId` as tiebreaker.

**06-REQ-008**: The subsystem shall accept authorised mutations that create, update, or delete entries in the heuristic default configuration. Writes shall be permitted only to the Captain of the owning Centaur Team.

**06-REQ-009**: Edits to the heuristic default configuration shall not retroactively affect any game already in progress. Game-scoped per-snake portfolio state ([06-REQ-013]) is independent of the team's current defaults once the game has begun.

**06-REQ-010** *(negative)*: No runtime other than the Captain of the owning Centaur Team shall write to the heuristic default configuration. This is enforced at the data layer by function-contract checks in the subsystem.

---

### 6.3 Team-Scoped Bot Parameters

**06-REQ-011**: The subsystem shall persist, per Centaur Team, a **global centaur parameter record** (`global_centaur_params`) containing at minimum:
- The softmax global temperature used for bot decisioning ([07]).
- The **automatic submission time allocation** (`defaultAutomaticTimeAllocationMs`) — the team-level turn deadline parameter used by the bot framework's submission process per [07-REQ-044] / [07-REQ-045].
- The **scheduled-submission interval** (`defaultScheduledSubmissionIntervalMs`) — the cadence at which the bot framework's scheduled-submission pass fires per [07-REQ-044]; default 100 ms.
- The **imminent-deadline threshold** (`defaultImminentThresholdMs`) — the lead-time margin subtracted from the chess-clock deadline when arming the framework's final-submission timer per [07-REQ-045]; default 50 ms.
- A `pinnedHeuristics` ordered array of heuristic IDs specifying Drive dropdown pinning order ([06-REQ-007]).

These values serve as team-level defaults. At game start, they are copied into the game-scoped state record (`game_centaur_state`) and may be independently adjusted during the game without affecting the team defaults.

**06-REQ-012** *(negative)*: No runtime other than the Captain of the owning Centaur Team shall write to the bot parameter record. This is enforced at the data layer by function-contract checks in the subsystem.

---

### 6.4 Game-Scoped Per-Snake Portfolio State

**06-REQ-013**: For each snake in each active game the subsystem shall persist a **per-snake portfolio state** containing, at minimum:
- The set of currently active Drives on the snake, each with its target, the target's type (Snake or Cell per [01]), and its current portfolio weight.
- Per-snake heuristic weight overrides for any Preference or Drive whose weight deviates from the team default.
- Per-snake activation overrides for Preferences whose active/inactive status deviates from the team default.
- A nullable per-snake temperature override.

**06-REQ-014**: At game start, the per-snake portfolio state for every snake belonging to the team shall be initialised such that:
- Every Preference in the team's heuristic default configuration that is marked active-by-default is present at its default weight.
- No Drives are active.
- No per-snake weight, activation, or temperature overrides are present.

Initialisation shall use the team's heuristic default configuration as captured at the moment of game start ([06-REQ-009]).

**06-REQ-015**: The subsystem shall accept authorised mutations that add a Drive to a snake, remove a Drive from a snake, change the weight of a Drive or Preference on a snake, change the active/inactive state of a Preference on a snake, and set or clear a snake's temperature override.

**06-REQ-016**: Per-snake portfolio state shall persist across turns. Deselecting a snake shall not reset any of its Drives, weight overrides, activation overrides, or temperature override. (See resolved 06-REVIEW-005.)

**06-REQ-017**: The effective heuristic configuration for a snake at any moment is the team default configuration overlaid by that snake's portfolio state. A downstream reader of the subsystem shall be able to compute this effective configuration from the persisted data without additional negotiation with any other runtime.

---

### 6.5 Game-Scoped Selection State

The term **selection** in this module refers exclusively to the exclusive-lock operator-control affordance specified in this section ([06-REQ-018] through [06-REQ-024]): a selection grants a single operator the right to stage moves and toggle manual mode for a snake, is persisted in Convex, and is enforced by the function-contract surface of [06]. The separate non-mutating per-client **inspection** affordance — by which a replay viewer or live-game coach client chooses, in their own UI only, which snake's portfolio / stateMap / worst-case world / decision breakdown / per-direction candidate highlights to display — is owned by [08] (see [08-REQ-074] and [08-REQ-052c]; see resolved 08-REVIEW-008) and adds no state, no mutation, and no schema element to this module.

**06-REQ-018**: For each snake in each active game the subsystem shall persist a **selection record** comprising:
- The user identity currently selecting the snake, or null if the snake is unselected.
- A manual-mode flag indicating whether the snake is in manual mode ([08]).

**06-REQ-019**: At most one user identity may be recorded as the selector of any given snake. (Discharges [02-REQ-018] for the snake side.)

**06-REQ-020**: At most one snake may be recorded as selected by any given user identity within the scope of a single game. (Discharges [02-REQ-018] for the operator side.)

**06-REQ-021**: The subsystem shall reject any mutation that would cause either [06-REQ-019] or [06-REQ-020] to be violated. Enforcement shall be by the subsystem's own function contracts; downstream runtimes shall not be required to check these invariants before calling.

**06-REQ-022**: A selection mutation that names a snake currently selected by another user identity shall be permitted only if the caller's mutation explicitly requests displacement of the prior selector. Absent such a request, the mutation shall be rejected. (Supports the displacement confirmation affordance in [08], informal spec §7.5.)

**06-REQ-023**: When a selection displacement occurs, the displaced user identity's selection record for that game shall be updated atomically with the new selector's record such that at no intermediate point can a reader observe both identities as selectors of the same snake or either identity as selector of more than one snake.

**06-REQ-024**: Selection mutations shall be permitted only to members of the Centaur Team that owns the snake being selected ([03]). A user identity that is not a member of the owning team shall not be able to appear as selector in any selection record for that team's snakes.

**06-REQ-025**: Manual-mode toggling shall be permitted only to the user identity currently holding the selection on the snake, or — per [08], informal spec §7.5 — shall be auto-set to true as a side effect of that identity staging a direction for the snake.

**06-REQ-025a**: At game end, all selection records for the game shall be cleared (all `operatorUserId` fields set to null). The replay viewer reconstructs selection history exclusively from the action log. (See resolved 06-REVIEW-006.)

---

### 6.6 Game-Scoped Per-Snake Computed State

**06-REQ-026**: For each snake in each active game the subsystem shall persist a **computed display state** comprising, at minimum:
- A per-direction map of worst-case weighted scores (the "stateMap" in [07] terminology).
- A per-direction representation of the worst-case simulated world used to produce each score, sufficient for the operator interface ([08]) to render the worst-case world preview.
- A per-direction representation of the normalised per-heuristic outputs that produced each score, sufficient to drive the decision breakdown table in [08].

**06-REQ-027**: The Snek Centaur Server hosting the owning Centaur Team shall be the sole writer of a snake's computed display state, authenticated via the per-Centaur-Team game credential ([05-REQ-032b]). No other runtime or identity shall write to it. (Paired with the action log writer rules in [06-REQ-037].)

**06-REQ-028**: Updates to computed display state shall be full snapshots rather than deltas, so that any recorded snapshot is independently interpretable without reference to prior snapshots. (Supports sub-turn replay reconstruction per [06-REQ-035].)

**06-REQ-029**: The subsystem shall not impose any per-turn or per-second rate limit on computed display state updates beyond what is required by Convex operational constraints. The bot framework ([07]) is the authority on update cadence.

---

### 6.7 Convex Function Contract Surface

**06-REQ-030**: All mutations to Centaur state shall pass through a defined function contract surface. The subsystem shall not permit direct row-level writes that bypass this surface. (This is a restatement of standard Convex practice and is made explicit here because the invariants in [06-REQ-019] through [06-REQ-024] depend on it.)

**06-REQ-031**: Every function in the contract surface that mutates Centaur state shall authenticate the caller and shall reject the mutation if the caller's identity does not have a right to perform it under the rules stated in [06-REQ-008], [06-REQ-010], [06-REQ-012], [06-REQ-024], and [06-REQ-025].

**06-REQ-032**: The function contract surface shall expose read queries sufficient for:
- The Snek Centaur Server frontend to render the live operator interface and the replay viewer ([08]).
- The bot framework on the Snek Centaur Server to read the effective heuristic configuration for each of its Centaur Team's snakes ([07]).

Read access shall be scoped as follows. During a live (in-progress) game, a member of one Centaur Team cannot read another team's heuristic default configuration, bot parameters, per-snake portfolio state, selection state, computed display state, or action log, except via the coach affordance of [05-REQ-067] (a designated coach of a team has the same live-game read scope as a member of that team) or the admin affordance of [05-REQ-066] (admins are implicit coaches of every team). For finished games (replay), action log data is accessible to any authenticated user (see `getActionLog` authorization). Team-scoped configuration (heuristic defaults, bot parameters, global centaur params) remains restricted to team members and the team's coaches (and admins) regardless of game state. (See resolved 06-REVIEW-002.)

---

### 6.8 Centaur Action Log

**06-REQ-033**: The subsystem shall persist a **Centaur action log** recording state-changing events in the Centaur subsystem during each game, at clock-time resolution finer than turn granularity.

**06-REQ-034**: Each action log entry shall record at minimum: the game it belongs to, the turn in which it occurred, the identity of the actor (user identity or Snek Centaur Server acting via per-Centaur-Team game credential), the actor's identity type (operator or bot), and a wall-clock timestamp.

**06-REQ-035**: The action log shall be sufficient, in combination with the SpacetimeDB game log imported at game end ([02-REQ-022], [05]) and the append-only staged-moves log maintained in SpacetimeDB ([04-REQ-025], [04-REQ-027]), to reconstruct the team's experience at any timestamp within any turn of the game, including:
- Which snake each operator had selected at that moment.
- Each snake's manual-mode flag at that moment.
- Each snake's active Drives, their targets, and their weights at that moment.
- Each snake's Preference activation states and weight overrides at that moment.
- Each snake's per-direction stateMap, worst-case worlds, and heuristic outputs at that moment, as last written prior to that moment.
- The current operator mode (Centaur or Automatic) at that moment.
- Staged moves for each snake and the identity that staged them, at that moment (reconstructed from the STDB staged-moves append-only log).
- Temperature overrides in effect at that moment.

(See resolved 06-REVIEW-004.)

**06-REQ-036**: At minimum the following event categories shall be recorded in the action log:
- Snake selection and deselection (snake, user identity).
- Manual-mode toggling (snake, new value).
- Drive addition and removal (snake, Drive type, target type, target, weight).
- Heuristic weight and activation changes (snake, heuristic, old weight, new weight, old active state, new active state).
- **Per-operator tempo changes** (`operator_tempo_changed`: operator user identity, new tempo value — `thinking` or `flow`). The action log's standard wall-clock timestamp ([06-REQ-034]) is the per-event time anchor; tempo events are not turn-keyed.
- **Captain boot events** (`operator_booted`: target operator user identity, Captain user identity).
- Team-side turn submission events.
- Computed display state snapshots (snake, stateMap, worst-case worlds, heuristic outputs), written as full snapshots per [06-REQ-028].
- Temperature override changes (snake, new value).

Move staging events are recorded in the SpacetimeDB append-only staged-moves log ([04-REQ-025], [04-REQ-027]), where authoritativeness of the staged move and its log entry are guaranteed to coincide. (See resolved 06-REVIEW-004.)

**06-REQ-037**: The following action log event categories shall be written exclusively by the Snek Centaur Server hosting the owning Centaur Team (authenticated via the per-Centaur-Team game credential), since no other runtime has the information needed to produce them:
- Computed display state snapshots.

All other event categories may be written by either the Snek Centaur Server or an operator on the team, as appropriate to the origin of the action. Every state mutation includes its corresponding log entry in the same Convex transaction, ensuring that a dropped log entry implies the state change also did not occur. (See resolved 06-REVIEW-003 and 06-REVIEW-004.)

**06-REQ-038** *(negative)*: The action log shall not be used to reconstruct authoritative game state (board contents, snake bodies, collisions, item spawns). Authoritative game state is reconstructed from the SpacetimeDB log per [02-REQ-013].

**06-REQ-039**: Action log entries, once written, shall be immutable. Corrections to mistaken entries are not supported; downstream readers of the log (e.g., the team replay viewer in [08]) shall treat the log as append-only.

---

### 6.9 Game-Scoped Team State

**06-REQ-040a**: For each game, the subsystem shall persist a **game-scoped team state record** per CentaurTeam, containing at minimum `globalTemperature`, `automaticTimeAllocationMs`, `scheduledSubmissionIntervalMs`, and `imminentThresholdMs`. All fields are initialised from the team's `global_centaur_params` defaults at game start and are independently mutable during the game. This record is the live source of truth for the effective parameter values during gameplay; downstream readers ([07], [08]) read it directly. (See resolved 06-REVIEW-008.)

**06-REQ-040b**: For each game, the subsystem shall persist a **per-operator tempo record** in a dedicated table `operator_tempo`. Each record is keyed by `(gameId, operatorUserId)` and carries at minimum a `tempo` enum (`thinking` or `flow`) and an `updatedAt` wall-clock timestamp. The `tempo` field is written exclusively by the operator the record describes via the `setOperatorTempo` mutation (§2.2.3).

**Tempo is durable across turns.** The arrival of a new turn does not modify any operator's tempo — only an explicit operator action changes it. `tempo` does *not* carry a `turn` field and is not turn-keyed. The two values name the operator's mental stance toward pacing: `flow` ("I am comfortable with the bot's automatic submission cadence") and `thinking` ("I need the team to slow time so I can think hard about this decision"). `flow` is the value that allows the team's unanimity precondition ([08-REQ-062]) to hold; `thinking` is the explicit pause signal that withdraws an operator's consent from the unanimity until they choose to switch back. An operator may toggle between the two freely at any moment in the game.

**Initial value on row creation, and on every (re)connect.** The operator's client shall call `setOperatorTempo({ tempo: "flow" })` as part of its (re)connect sequence — on first-ever join in a game, on reconnect after a network drop, and on reconnect after a Captain boot. This single rule covers every path by which an operator joins the team's active-operator set ([08-REQ-062]), and is the only automatic write to tempo. A first-join call creates the row; a reconnect call upserts in place.

Coaches and admins acting via implicit-coach permission ([05-REQ-066], [05-REQ-067]) shall not have records in this table — they have no tempo per [08-REQ-064a].

**Captain boot affordance.** The Captain of a Centaur Team may, as a nuclear option for an operator who is unresponsive (asleep at the keyboard, AFK, etc.), evict that operator from the team's game session via the `bootOperator` mutation (§2.2.3). Boot is a **manual forced disconnect**: the mutation severs the booted operator's game-session connection on the server side identically to a network disconnect. The booted operator therefore leaves the active-operator set of [08-REQ-062] by the same mechanism a disconnected operator does. **Boot writes no persistent "is booted" state** on the operator — there is no sticky lockout, no `bootedByCaptain` field, no revoke mutation. A booted operator who becomes available may reconnect at any time and rejoins the active set in `flow` like any other (re)connecting operator. Boot emits an `operator_booted` action-log entry per [06-REQ-036], carrying the action-log's standard wall-clock timestamp ([06-REQ-034]) so replay reconstruction is time-precise.

The `setOperatorTempo` mutation transactionally writes an `operator_tempo_changed` action-log entry per [06-REQ-036]. The action log's wall-clock timestamp is the per-event time anchor; tempo and boot events are recorded as time-based events (not turn-based), so the team-perspective replay viewer can reconstruct the active-operator set and per-operator tempo at any scrubbed position `t` regardless of turn boundaries by reading the time-stamped tempo events together with the team's connection events (boot events appear in this stream as the manual analogue of a connection-loss event).

*(See resolved 08-REVIEW-024.)*

---

### 6.10 Lifetime and Retention

**06-REQ-040**: Game-scoped Centaur state (per-snake portfolio state, selection state, computed display state, action log, game-scoped team state) shall be retained after the game ends for the lifetime of the game record in Convex ([05]). It shall not be deleted at the time SpacetimeDB teardown occurs per [02-REQ-021].

**06-REQ-041**: Team-scoped Centaur state (heuristic default configuration, bot parameters) shall persist for the lifetime of the Centaur Team. Because Centaur Teams cannot be deleted (archive-only semantics per [05-REQ-015a]), no cascade mechanics are required; archiving a team preserves all team-scoped Centaur state.

**06-REQ-042**: The subsystem shall not reuse game-scoped state across distinct games. A freshly provisioned game ([02-REQ-020]) shall have no pre-existing per-snake portfolio state, selection state, computed display state, or action log entries.

---

### 6.11 Interaction Boundaries

**06-REQ-043**: A Snek Centaur Server shall be able to subscribe to its hosted Centaur Teams' team-scoped state and to their active games' game-scoped state such that changes are observed in real time by the bot framework and the served operator interface. (Discharges [02-REQ-024] at the data-contract level.)

**06-REQ-044**: Operators shall be able to read and mutate Centaur state directly through the function contract surface without routing through their Snek Centaur Server runtime, subject to the authorisation rules in [06-REQ-031]. (Discharges [02-REQ-039] at the data-contract level. See resolved 06-REVIEW-003.)

**06-REQ-045** *(negative)*: The SpacetimeDB game runtime shall not read from or write to Centaur state. All communication between the Snek Centaur Server's bot framework and the game runtime flows through the staged-moves mechanism ([02-REQ-011]) and the real-time subscription ([02-REQ-023]), never through Convex.

**06-REQ-046** *(negative)*: The Centaur state subsystem shall not expose any mutation that lets a Snek Centaur Server or operator write directly to SpacetimeDB-owned state. Cross-runtime state flows only in the direction defined by [02]'s topology.

---

## Design

### 2.1 Convex Table Schema Design

The Centaur state subsystem defines eight Convex tables within the single Convex deployment ([06-REQ-002]). Tables are split by writer to avoid Convex OCC (Optimistic Concurrency Control) conflicts between the bot's high-frequency computed-state updates and operator selection/control mutations.

**Uniqueness enforcement model**: Convex indexes do not provide a uniqueness constraint — all indexes are non-unique. Where this spec identifies a uniqueness invariant (e.g., "at most one document per snake per game"), that invariant is enforced *application-side* within mutations using a query-then-guard pattern: the mutation queries the index, checks whether a matching document already exists, and throws if the invariant would be violated. This is safe under concurrency because Convex mutations execute with serializable isolation via OCC — if two mutations race, one commits and the other is automatically retried against the updated read set, at which point the guard fires. The pattern provides the same transactional safety as a SQL `UNIQUE` constraint.

#### 2.1.1 Team-Scoped Persistent Tables

**`heuristic_config`** — Per-CentaurTeam heuristic default configuration [06-REQ-005, 06-REQ-006, 06-REQ-007]. One document per heuristic per team.

```typescript
heuristic_config: defineTable({
  centaurTeamId: v.id("centaur_teams"),
  heuristicId: v.string(),
  heuristicType: v.union(v.literal("drive"), v.literal("preference")),
  defaultWeight: v.number(),
  activeByDefault: v.union(v.boolean(), v.null()),
  nickname: v.union(v.string(), v.null()),
}).index("by_team", ["centaurTeamId"])
```

- `heuristicId` is a stable string identifier matching the source-code registration pattern used by each Centaur Server's Drive and Preference implementations. When a team replaces its Centaur Server, the new server's registered heuristic IDs link to the team's existing configuration entries; unrecognised IDs are ignored at runtime and may be cleaned up by the team. (See resolved 06-REVIEW-001.)
- `activeByDefault` is non-null for Preferences (whether the Preference is active on new snakes by default) and null for Drives (Drives are never active by default).
- `nickname` is a human-readable short name for UI display. Non-null for Drives (used in dropdown ordering); may be null for Preferences.

**`global_centaur_params`** — Per-CentaurTeam bot parameter record [06-REQ-011]. One document per team.

```typescript
global_centaur_params: defineTable({
  centaurTeamId: v.id("centaur_teams"),
  defaultGlobalTemperature: v.number(),
  defaultAutomaticTimeAllocationMs: v.number(),
  defaultScheduledSubmissionIntervalMs: v.number(),
  defaultImminentThresholdMs: v.number(),
  pinnedHeuristics: v.array(v.string()),
}).index("by_team", ["centaurTeamId"])
```

#### 2.1.2 Game-Scoped Per-Snake Operator State

**`snake_operator_state`** — Operator-authored per-snake game state [06-REQ-018, 06-REQ-019, 06-REQ-020, 06-REQ-025]. One document per snake per game. Written by operators via their own Convex client (Google OAuth identity).

```typescript
snake_operator_state: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  snakeId: v.number(),
  operatorUserId: v.union(v.id("users"), v.null()),
  manualMode: v.boolean(),
  temperatureOverride: v.union(v.number(), v.null()),
})
  .index("by_game", ["gameId"])
  .index("by_game_snake", ["gameId", "snakeId"])
  .index("by_game_operator", ["gameId", "operatorUserId"])
```

- `operatorUserId` is null when the snake is unselected, or the Convex `users._id` of the selecting operator.
- `manualMode` defaults to false; set to true when the operator explicitly toggles manual mode or stages a direction.
- `temperatureOverride` is nullable; null means the team's global temperature applies.
- **Uniqueness invariant**: at most one document per `(gameId, snakeId)` pair; enforced by `initializeGameCentaurState` (which creates exactly one per snake) and all subsequent mutations (which query `by_game_snake` and update in place, never insert).
- **Conditional uniqueness invariant**: at most one document per `(gameId, operatorUserId)` where `operatorUserId` is non-null; enforced by `selectSnake` via query-then-guard on `by_game_operator`. Multiple documents with `operatorUserId = null` (unselected snakes) are expected and permitted — the guard only fires for non-null operator IDs. This is analogous to a SQL partial unique index (`WHERE operatorUserId IS NOT NULL`).

#### 2.1.3 Game-Scoped Per-Snake Bot State

**`snake_bot_state`** — Bot-authored per-snake game state [06-REQ-026, 06-REQ-027, 06-REQ-028]. One document per snake per game. Written exclusively by the Centaur Server via per-CentaurTeam game credential.

```typescript
snake_bot_state: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  snakeId: v.number(),
  stateMap: v.any(),
  worstCaseWorlds: v.any(),
  heuristicOutputs: v.any(),
})
  .index("by_game", ["gameId"])
  .index("by_game_snake", ["gameId", "snakeId"])
```

- `stateMap`, `worstCaseWorlds`, and `heuristicOutputs` use `v.any()`, storing arbitrary JSON-serializable objects as native Convex values (not serialized strings). This allows downstream consumers to read them without deserialization and permits future narrowing to a static `v.object(...)` schema without migration. Full snapshots on every write ([06-REQ-028]).
- **Uniqueness invariant**: at most one document per `(gameId, snakeId)` pair; enforced by `initializeGameCentaurState` (creates exactly one per snake) and `updateSnakeBotState` (queries `by_game_snake` and patches in place).

#### 2.1.4 Game-Scoped Per-Snake Drive and Override Tables

**`snake_drives`** — Game-scoped per-snake active Drives [06-REQ-013]. Written by operators.

```typescript
snake_drives: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  snakeId: v.number(),
  driveType: v.string(),
  targetType: v.union(v.literal("snake"), v.literal("cell")),
  targetId: v.string(),
  portfolioWeight: v.number(),
}).index("by_game_snake", ["gameId", "snakeId"])
```

- `driveType` is the string heuristic ID matching `heuristic_config.heuristicId`.
- `targetId` is a snake ID (as string) for Snake targets or serialised cell coordinates (e.g., `"3,7"`) for Cell targets.

**`snake_heuristic_overrides`** — Game-scoped per-snake weight and activation overrides [06-REQ-013]. Written by operators.

```typescript
snake_heuristic_overrides: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  snakeId: v.number(),
  heuristicId: v.string(),
  weight: v.union(v.number(), v.null()),
  active: v.boolean(),
}).index("by_game_snake", ["gameId", "snakeId"])
```

- `weight` is nullable; null means no weight override (use team default).
- `active` indicates whether the heuristic is active on this snake (for Preferences).

#### 2.1.5 Game-Scoped Team State

**`game_centaur_state`** — Game-scoped per-CentaurTeam state [06-REQ-040a]. One document per CentaurTeam per game.

```typescript
game_centaur_state: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  globalTemperature: v.number(),
  automaticTimeAllocationMs: v.number(),
  scheduledSubmissionIntervalMs: v.number(),
  imminentThresholdMs: v.number(),
}).index("by_game_team", ["gameId", "centaurTeamId"])
```

- All fields are initialised from `global_centaur_params` at game start: `globalTemperature` from `defaultGlobalTemperature`, `automaticTimeAllocationMs` from `defaultAutomaticTimeAllocationMs`, `scheduledSubmissionIntervalMs` from `defaultScheduledSubmissionIntervalMs`, `imminentThresholdMs` from `defaultImminentThresholdMs`. Once initialised, each field is independently mutable during the game without affecting the team defaults.
- **Uniqueness invariant**: at most one document per `(gameId, centaurTeamId)` pair; enforced by `initializeGameCentaurState` (creates exactly one) and game-scoped mutations (query `by_game_team` and patch in place).

**`operator_tempo`** — Game-scoped per-operator tempo record [06-REQ-040b]. One document per `(gameId, operatorUserId)`.

```typescript
operator_tempo: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  operatorUserId: v.id("users"),
  tempo: v.union(v.literal("thinking"), v.literal("flow")),
  updatedAt: v.number(),
})
  .index("by_game", ["gameId"])
  .index("by_game_operator", ["gameId", "operatorUserId"])
  .index("by_game_team", ["gameId", "centaurTeamId"])
```

- The `tempo` field is written exclusively by the operator the record describes via `setOperatorTempo` (§2.2.3).
- **Tempo is durable across turns** per [06-REQ-040b]; the row has no `turn` column and no per-turn reset semantics. The arrival of a new turn does not touch any row in this table.
- A row is created lazily on the first `setOperatorTempo` call from a given operator in a given game. The initial value written by that first call is `flow` per [06-REQ-040b] — every (re)connect issues `setOperatorTempo({ tempo: "flow" })` as its automatic call.
- Coaches and admins acting via implicit-coach permission have no records in this table per [08-REQ-064a].
- Captain-issued boots (§2.2.3, `bootOperator`) do *not* write to this table — boot is a forced disconnect with no persistent state. The booted operator's row (if any) is left untouched.
- **Uniqueness invariant**: at most one document per `(gameId, operatorUserId)` pair; enforced by `setOperatorTempo` (queries `by_game_operator` and upserts in place).

#### 2.1.6 Centaur Action Log

**`centaur_action_log`** — Game-scoped append-only action log [06-REQ-033, 06-REQ-034, 06-REQ-039]. One document per event.

```typescript
centaur_action_log: defineTable({
  gameId: v.id("games"),
  centaurTeamId: v.id("centaur_teams"),
  turn: v.number(),
  identity: v.union(v.id("users"), v.id("centaur_teams")),
  identityType: v.union(v.literal("operator"), v.literal("bot")),
  timestamp: v.number(),
  action: centaurActionEvent,   // see §2.4 for full validator definition
})
  .index("by_game_type_snake", ["gameId", "action.type", "action.snakeId"])
  .index("by_game_turn_timestamp", ["gameId", "turn", "timestamp"])
  .index("by_game", ["gameId"])
```

- `identity` is `Id<"users">` when `identityType === "operator"` (the operator who performed the action) or `Id<"centaur_teams">` when `identityType === "bot"` (the Centaur Server acting via game credential). The `identityType` discriminant determines the interpretation.
- `timestamp` is a wall-clock millisecond timestamp.
- `action` is a discriminated union (see §2.4 for the full validator definition).

---

### 2.2 Function Contract Surface

Satisfies 06-REQ-030, 06-REQ-031, 06-REQ-032, 06-REQ-044.

All mutations authenticate the caller and reject unauthorised access. Operators authenticate via Google OAuth identity (Convex `ctx.auth`). The Centaur Server authenticates via per-CentaurTeam game credential ([05-REQ-032b]), validated by checking the credential's `centaurTeamId` and `gameId` claims against the target documents. Admin users ([05-REQ-065]) may read all teams' state.

#### 2.2.1 Team-Scoped Mutations

**Heuristic config CRUD** — `upsertHeuristicConfig`, `deleteHeuristicConfig` [06-REQ-008, 06-REQ-010].

```
mutation upsertHeuristicConfig(args: {
  centaurTeamId: Id<"centaur_teams">,
  heuristicId: string,
  heuristicType: "drive" | "preference",
  defaultWeight: number,
  activeByDefault: boolean | null,
  nickname: string | null,
}): void

mutation deleteHeuristicConfig(args: {
  centaurTeamId: Id<"centaur_teams">,
  heuristicId: string,
}): void

mutation insertMissingHeuristicConfig(args: {
  centaurTeamId: Id<"centaur_teams">,
  registrations: ReadonlyArray<{
    heuristicId: string,
    heuristicType: "drive" | "preference",
    defaultWeight: number,
    activeByDefault: boolean | null,
    nickname: string | null,
  }>,
}): { inserted: ReadonlyArray<string> }
```

Authorization: caller must be the Captain of the specified CentaurTeam (Google OAuth identity → team membership + captain check via `centaur_teams.captainUserId`).

`insertMissingHeuristicConfig` has insert-only-never-overwrites semantics: for each entry in `registrations` whose `heuristicId` is not already present in the team's `heuristic_config`, a new row is inserted using the supplied `defaultWeight`, `activeByDefault`, and `nickname` as initial values; entries whose `heuristicId` is already present produce no write (existing Captain-edited values are preserved). Returns the list of newly inserted IDs. This mutation discharges the lazy-insert contract in [07] §2.18 — it is invoked from [08]'s global centaur params page on Captain visits, not by the bot framework runtime, which is read-only with respect to `heuristic_config` per [07-REQ-018].

**Global centaur params CRUD** — `upsertGlobalCentaurParams` [06-REQ-011, 06-REQ-012].

```
mutation upsertGlobalCentaurParams(args: {
  centaurTeamId: Id<"centaur_teams">,
  defaultGlobalTemperature: number,
  defaultAutomaticTimeAllocationMs: number,
  defaultScheduledSubmissionIntervalMs: number,
  defaultImminentThresholdMs: number,
  pinnedHeuristics: string[],
}): void
```

Authorization: caller must be the Captain of the specified CentaurTeam.

#### 2.2.2 Game-Scoped Operator Mutations

All operator mutations write their corresponding action log entry transactionally (within the same Convex mutation). (See resolved 06-REVIEW-003 and 06-REVIEW-004.)

**Selection mutations** — `selectSnake`, `deselectSnake` [06-REQ-018 through 06-REQ-024].

```
mutation selectSnake(args: {
  gameId: Id<"games">,
  snakeId: number,
  displace: boolean,
}): { displaced: Id<"users"> | null }

mutation deselectSnake(args: {
  gameId: Id<"games">,
}): void
```

Authorization: caller must be a member of the CentaurTeam that owns the snake. See §2.3 for invariant enforcement details. Each mutation writes a `snake_selected` or `snake_deselected` action log entry transactionally.

**Manual mode toggle** — `toggleManualMode` [06-REQ-025].

```
mutation toggleManualMode(args: {
  gameId: Id<"games">,
  snakeId: number,
  manual: boolean,
}): void
```

Authorization: caller must be the current selector of the snake. Writes a `manual_toggled` action log entry transactionally.

**Drive management** — `addDrive`, `removeDrive` [06-REQ-015].

```
mutation addDrive(args: {
  gameId: Id<"games">,
  snakeId: number,
  driveType: string,
  targetType: "snake" | "cell",
  targetId: string,
  portfolioWeight: number,
}): void

mutation removeDrive(args: {
  gameId: Id<"games">,
  snakeId: number,
  driveType: string,
  targetId: string,
}): void
```

Authorization: caller must be a member of the CentaurTeam that owns the snake. Writes `drive_added` or `drive_removed` action log entry transactionally.

**Heuristic weight/activation override** — `setHeuristicOverride` [06-REQ-015].

```
mutation setHeuristicOverride(args: {
  gameId: Id<"games">,
  snakeId: number,
  heuristicId: string,
  weight: number | null,
  active: boolean,
}): void
```

Authorization: caller must be a member of the CentaurTeam that owns the snake. Writes a `weight_changed` action log entry transactionally, capturing both weight and activation state changes (old and new values for both fields). A single `weight_changed` entry records the complete before/after state of the heuristic override, covering weight changes, activation changes, or both simultaneously.

**Temperature override** — `setTemperatureOverride` [06-REQ-015].

```
mutation setTemperatureOverride(args: {
  gameId: Id<"games">,
  snakeId: number,
  temperature: number | null,
}): void
```

Authorization: caller must be a member of the CentaurTeam that owns the snake. Writes a `temperature_changed` action log entry transactionally.

#### 2.2.3 Game-Scoped Team Mutations

**Per-operator tempo toggle** — `setOperatorTempo` [06-REQ-040b].

```
mutation setOperatorTempo(args: {
  gameId: Id<"games">,
  tempo: "thinking" | "flow",
}): void
```

Authorization: caller must be a member of one of the CentaurTeams participating in the game (looked up against the game's participating-teams snapshot per [05-REQ-029]); the caller writes only their own `(gameId, operatorUserId = callerId)` record. The mutation looks up the caller's CentaurTeam in the game and stamps `centaurTeamId` on the row. Coaches and admins acting via implicit-coach permission ([05-REQ-066], [05-REQ-067]) shall be rejected per [08-REQ-064a]. Upserts the `(gameId, operatorUserId)` row in `operator_tempo` and writes an `operator_tempo_changed` action-log entry transactionally per [06-REQ-036]. The mutation is idempotent: writing the operator's existing `tempo` is a harmless no-op (the action-log entry is still emitted so replay reconstruction sees the intent).

**Captain operator-boot** — `bootOperator` [06-REQ-040b].

```
mutation bootOperator(args: {
  gameId: Id<"games">,
  operatorUserId: Id<"users">,
}): void
```

Authorization: caller must be the Captain ([05-REQ-011]) of the CentaurTeam that owns the target operator's membership in the game (looked up against the game's participating-teams snapshot per [05-REQ-029] and against `centaur_team_members`); non-Captain callers are rejected per [06-REQ-031]. The target operator must be a member of the same CentaurTeam as the Captain; a Captain cannot boot operators from other teams in the game. The mutation writes an `operator_booted` action-log entry transactionally per [06-REQ-036]. The mutation writes nothing to `operator_tempo` — boot has no persistent state. [08] is responsible for terminating the target operator's game-session connection on the next reactive update (the manual analogue of a network-detected disconnect, per [08-REQ-068a]); the booted operator's UI shall transition to a read-only "you have been removed from this game session by your Captain" state. The booted operator may reconnect at any time and rejoins the team's active-operator set in `flow` per [08-REQ-064].

**Game-level parameter overrides** — `setGameParamOverrides`.

```
mutation setGameParamOverrides(args: {
  gameId: Id<"games">,
  centaurTeamId: Id<"centaur_teams">,
  globalTemperature: number,
  automaticTimeAllocationMs: number,
  scheduledSubmissionIntervalMs: number,
  imminentThresholdMs: number,
}): void
```

Patches the `game_centaur_state` document for the specified game and team. Authorization: caller must be a member of the CentaurTeam.

#### 2.2.4 Computed Display State Mutations

**Bot state update** — `updateSnakeBotState` [06-REQ-026, 06-REQ-027, 06-REQ-028].

```
mutation updateSnakeBotState(args: {
  gameId: Id<"games">,
  snakeId: number,
  stateMap: any,
  worstCaseWorlds: any,
  heuristicOutputs: any,
}): void
```

Authorization: caller must be authenticated via per-CentaurTeam game credential. The credential's `centaurTeamId` must match the snake's owning CentaurTeam. No operator or other Centaur Server may call this mutation. Writes a `statemap_updated` action log entry transactionally.

#### 2.2.5 Read Queries

**Effective heuristic config for a snake** — `getEffectiveHeuristicConfig` [06-REQ-017].

```
query getEffectiveHeuristicConfig(args: {
  gameId: Id<"games">,
  snakeId: number,
}): EffectiveHeuristicConfig
```

Returns the team default configuration overlaid with per-snake overrides from `snake_heuristic_overrides`. Authorization: caller must be a member of the owning CentaurTeam, or authenticated via that team's game credential, or an admin user.

**All game-scoped state for operator interface** — `getGameCentaurState` [06-REQ-032].

```
query getGameCentaurState(args: {
  gameId: Id<"games">,
  centaurTeamId: Id<"centaur_teams">,
}): GameCentaurStateView
```

Returns a joined view of `snake_operator_state`, `snake_bot_state`, `snake_drives`, `snake_heuristic_overrides`, and `game_centaur_state` for all snakes belonging to the team in the specified game. Authorization: caller must be a member of the CentaurTeam, or authenticated via game credential, or an admin user.

**Action log queries** — `getActionLog` [06-REQ-032, 06-REQ-035].

```
query getActionLog(args: {
  gameId: Id<"games">,
  centaurTeamId: Id<"centaur_teams">,
  fromTurn?: number,
  toTurn?: number,
}): ReadonlyArray<CentaurActionLogDoc>
```

Returns action log entries for the specified game and team, optionally filtered by turn range. Authorization: during a live (in-progress) game, caller must be a member of the CentaurTeam, a designated coach of the CentaurTeam per [05-REQ-067] (admins are implicit coaches of every team), authenticated via game credential, or an admin user; for a finished game (replay), any authenticated user may query.

**Team-scoped config queries** — `getHeuristicConfig`, `getGlobalCentaurParams`.

```
query getHeuristicConfig(args: {
  centaurTeamId: Id<"centaur_teams">,
}): ReadonlyArray<HeuristicConfigDoc>

query getGlobalCentaurParams(args: {
  centaurTeamId: Id<"centaur_teams">,
}): GlobalCentaurParamsDoc | null
```

Authorization: caller must be a member of the CentaurTeam, or an admin user. No cross-team reads for non-admin users. (See resolved 06-REVIEW-002.)

#### 2.2.6 Game-Start Initialization Mutation

**`initializeGameCentaurState`** [06-REQ-014, 06-REQ-040a, 06-REQ-042].

```
mutation initializeGameCentaurState(args: {
  gameId: Id<"games">,
  centaurTeamId: Id<"centaur_teams">,
  snakeIds: ReadonlyArray<number>,
}): void
```

Called by [05]'s game-start orchestration. This mutation:

1. Reads the team's `heuristic_config` and `global_centaur_params` at this moment (snapshot; [06-REQ-009]).
2. For each snake in `snakeIds`, creates a `snake_operator_state` document with `operatorUserId = null`, `manualMode = false`, `temperatureOverride = null`.
3. For each snake, creates a `snake_bot_state` document with empty/default serialised fields.
4. For each snake, creates `snake_heuristic_overrides` entries for all Preferences marked `activeByDefault = true` in the team's heuristic config, each with the default weight and `active = true`. No Drives are initialised ([06-REQ-014]).
5. Creates a `game_centaur_state` document with all fields initialised from `global_centaur_params`: `globalTemperature` from `defaultGlobalTemperature`, `automaticTimeAllocationMs` from `defaultAutomaticTimeAllocationMs`, `scheduledSubmissionIntervalMs` from `defaultScheduledSubmissionIntervalMs`, `imminentThresholdMs` from `defaultImminentThresholdMs`.
6. No `operator_tempo` rows are created at game-start — they are upserted lazily on the first `setOperatorTempo` call from each operator per [06-REQ-040b]. The first call from each operator is the `setOperatorTempo({ tempo: "flow" })` call issued by [08] as part of the operator's (re)connect sequence.

Authorization: platform-level (called by Convex internal action during game-start orchestration).

#### 2.2.7 Game-End Cleanup Mutation

**`cleanupGameCentaurState`** [06-REQ-025a].

```
mutation cleanupGameCentaurState(args: {
  gameId: Id<"games">,
}): void
```

Called by [05]'s game-end orchestration. Sets all `snake_operator_state.operatorUserId` to `null` for the specified game. Historical selection state is reconstructed from the action log during replay.

Authorization: platform-level (called by Convex internal action during game-end orchestration).

---

### 2.3 Selection Invariant Enforcement

Satisfies 06-REQ-019, 06-REQ-020, 06-REQ-021, 06-REQ-022, 06-REQ-023.

The `selectSnake` mutation enforces two invariants atomically within a single Convex mutation:

1. **At-most-one-operator-per-snake** ([06-REQ-019]): Before writing the new selector, the mutation queries `snake_operator_state` for the target snake's document. If `operatorUserId` is non-null and differs from the caller:
   - If `displace = false`, reject the mutation (another operator holds the snake).
   - If `displace = true`, proceed with displacement ([06-REQ-022]).

2. **At-most-one-snake-per-operator** ([06-REQ-020]): The mutation queries `snake_operator_state` by `[gameId, operatorUserId]` using the `by_game_operator` index (filtering for the caller's non-null user ID; null entries are excluded from this check since many snakes may be unselected simultaneously). If the caller already selects a different snake, that snake's `operatorUserId` is set to null (auto-deselection), and a `snake_deselected` action log entry is written for the old snake.

Both invariants are safe under concurrency: Convex's serializable OCC guarantees that if two `selectSnake` mutations race on overlapping reads, one commits and the other is retried against the updated state (see §2.1 uniqueness enforcement model).

**Displacement protocol** ([06-REQ-022], [06-REQ-023]):

When displacement is requested (`displace = true`) and the target snake has a different selector:

1. The displaced operator's `snake_operator_state` document has its `operatorUserId` set to null.
2. A `snake_deselected` action log entry is written for the displaced operator.
3. The caller's previous snake (if any) has its `operatorUserId` set to null, with a corresponding `snake_deselected` log entry.
4. The target snake's `operatorUserId` is set to the caller's identity.
5. A `snake_selected` action log entry is written for the new selection.

All five writes (up to three `snake_operator_state` updates plus corresponding action log entries) execute atomically within a single Convex mutation. At no intermediate point can a reader observe either invariant violated ([06-REQ-023]).

**Manual-mode auto-set** ([06-REQ-025]): When an operator stages a direction for a snake (via [08]'s live interface), manual mode must be set to true. Because staging occurs in SpacetimeDB ([04-REQ-024]) while manual-mode state lives in Convex, these are inherently separate transactions across different runtimes. The operator client ([08]) is responsible for calling `toggleManualMode(manual: true)` in Convex *before* or concurrently with the SpacetimeDB `stage_move` call. If the Convex mutation succeeds but the STDB staging fails, manual mode is true with no staged move — which is safe (the operator can re-stage). If the STDB staging succeeds but the Convex mutation fails, the move is staged while manual mode may still be false — the bot framework would then overwrite the operator-staged move with its own staging. To prevent this race, [08] must ensure the `toggleManualMode` mutation completes before (or atomically alongside) the `stage_move` call to STDB. The `manual_toggled` action log entry is written transactionally with the Convex mutation, maintaining the log fidelity guarantee.

---

### 2.4 Action Log Schema (Discriminated Union)

Satisfies 06-REQ-033, 06-REQ-034, 06-REQ-036.

The `action` field of `centaur_action_log` is a discriminated union with 12 event types. Staged moves are recorded in the SpacetimeDB append-only log, where authoritativeness is guaranteed. (See resolved 06-REVIEW-004.)

```typescript
const centaurActionEvent = v.union(
  v.object({ type: v.literal("snake_selected"), snakeId: v.number() }),
  v.object({ type: v.literal("snake_deselected"), snakeId: v.number() }),
  v.object({ type: v.literal("manual_toggled"), snakeId: v.number(), manual: v.boolean() }),
  v.object({
    type: v.literal("drive_added"), snakeId: v.number(), driveType: v.string(),
    targetType: v.union(v.literal("snake"), v.literal("cell")),
    targetId: v.string(), weight: v.number(),
  }),
  v.object({
    type: v.literal("drive_removed"), snakeId: v.number(),
    driveType: v.string(), targetId: v.string(),
  }),
  v.object({
    type: v.literal("weight_changed"), snakeId: v.number(), heuristicId: v.string(),
    oldWeight: v.union(v.number(), v.null()), newWeight: v.union(v.number(), v.null()),
    oldActive: v.boolean(), newActive: v.boolean(),
  }),
  v.object({
    type: v.literal("operator_tempo_changed"),
    operatorUserId: v.id("users"),
    tempo: v.union(v.literal("thinking"), v.literal("flow")),
  }),
  v.object({
    type: v.literal("operator_booted"),
    operatorUserId: v.id("users"),
    byCaptainUserId: v.id("users"),
  }),
  v.object({ type: v.literal("turn_submitted") }),
  v.object({
    type: v.literal("statemap_updated"), snakeId: v.number(),
    stateMap: v.any(), worstCaseWorlds: v.any(),
    heuristicOutputs: v.any(),
  }),
  v.object({
    type: v.literal("temperature_changed"), snakeId: v.number(),
    temperature: v.union(v.number(), v.null()),
  }),
)
```

Each variant's `snakeId` field (where present) enables the `by_game_type_snake` index to efficiently answer queries like "latest `statemap_updated` for snake 3 in game X."

The `statemap_updated` event stores full snapshots (not deltas) per [06-REQ-028], so any recorded snapshot is independently interpretable.

The `turn_submitted` event records when the team's Captain submits the turn, which is distinct from SpacetimeDB's `declare_turn_over` — the Centaur action log records the operator-interface-level intent, not the STDB confirmation.

The `operator_tempo_changed` event records each per-operator tempo transition (between `thinking` and `flow`) per [06-REQ-040b]. The `operator_booted` event records Captain boot actions targeting individual operators per [06-REQ-040b]; boot is a forced disconnect that produces the same departure-from-active-set effect as a connection-loss event, so it appears in the action log as the manual analogue of the team's connection-event stream rather than as a state-mutation event. Because tempo is durable across turns (no per-turn reset), both events are recorded as time-based events anchored to the action-log's wall-clock `timestamp` rather than turn-keyed. Replaying these event streams alongside the team's connection events allows the team-perspective replay viewer to reconstruct, at any scrubbed `t`, the active-operator set and each active operator's tempo at that exact moment — and therefore why the turn-over declaration of [08-REQ-062] either did or did not fire.

---

### 2.5 Game-Start Initialization

Satisfies 06-REQ-014, 06-REQ-042.

The `initializeGameCentaurState` mutation (§2.2.6) is called by [05]'s game-start orchestration after the game record transitions to `playing` status. The mutation is idempotent — if called twice for the same `(gameId, centaurTeamId)`, the second call is a no-op (documents already exist).

**Initialization sequence**:

1. **Read team defaults**: Load `heuristic_config` and `global_centaur_params` for the CentaurTeam. These values are captured as a point-in-time snapshot; subsequent edits to team defaults do not affect the initialised game state ([06-REQ-009]).

2. **Seed per-snake operator state**: For each snake, create a `snake_operator_state` document: unselected (`operatorUserId = null`), automatic mode (`manualMode = false`), no temperature override.

3. **Seed per-snake bot state**: For each snake, create a `snake_bot_state` document with empty serialised fields (the Centaur Server will overwrite these once computation begins).

4. **Seed per-snake heuristic overrides**: For each snake, for each Preference in the team's heuristic config that has `activeByDefault = true`, create a `snake_heuristic_overrides` document with `weight = defaultWeight` and `active = true`. No Drive overrides are created (Drives start inactive; [06-REQ-014]).

5. **Seed game-scoped team state**: Create a `game_centaur_state` document with all fields copied from `global_centaur_params`: `globalTemperature` from `defaultGlobalTemperature`, `automaticTimeAllocationMs` from `defaultAutomaticTimeAllocationMs`, `scheduledSubmissionIntervalMs` from `defaultScheduledSubmissionIntervalMs`, `imminentThresholdMs` from `defaultImminentThresholdMs`.

6. **Operator tempo**: No `operator_tempo` rows are seeded; they are upserted lazily on the first `setOperatorTempo` call from each operator per [06-REQ-040b]. The first call is always `setOperatorTempo({ tempo: "flow" })`, issued by [08] as part of the operator's (re)connect sequence.

---

### 2.6 Authorization Model

Satisfies 06-REQ-031, 06-REQ-024, 06-REQ-032.

Two authentication paths are supported:

1. **Google OAuth (operators)**: Convex `ctx.auth.getUserIdentity()` returns the user's Google OAuth identity. The mutation resolves this to a `users._id` and checks membership in the relevant CentaurTeam via `centaur_team_members`. Team-scoped state reads and writes require team membership. Game-scoped state reads and writes require membership in the CentaurTeam that owns the snake or game.

2. **Per-CentaurTeam game credential (Centaur Server)**: The Centaur Server authenticates via a per-CentaurTeam, per-game JWT credential issued during game-start invitation ([05-REQ-032b], [03]). The credential's claims include `centaurTeamId` and `gameId`. Mutations validate these claims against the target documents. Only `updateSnakeBotState` and `statemap_updated` log entries use this authentication path.

**Admin override**: Admin users ([05-REQ-065]) may read all teams' state for administrative and replay purposes. Admin status is checked via the admin role mechanism defined in [03].

**Read scoping** ([06-REQ-032]; see resolved 06-REVIEW-002): No cross-team reads for non-admin users. A member of CentaurTeam A cannot read CentaurTeam B's heuristic defaults, bot parameters, per-snake state, selection state, or action log.

---

## Exported Interfaces

This section defines the minimal contract downstream modules ([07] and [08]) consume. Any type not listed here is a module-internal detail.

### 3.1 Convex Schema

Motivated by 06-REQ-002, 06-REQ-004. Expressed in Convex's native schema DSL (`defineSchema`, `defineTable`, `v.*` validators). Fields using `v.any()` store arbitrary JSON-serializable objects as native Convex values; this permits future narrowing to a static `v.object(...)` schema without data migration. All indexes are non-unique; uniqueness invariants are enforced application-side in mutations via query-then-guard (see Design §2.1 for the enforcement model).

```typescript
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const centaurActionEvent = v.union(
  v.object({ type: v.literal("snake_selected"), snakeId: v.number() }),
  v.object({ type: v.literal("snake_deselected"), snakeId: v.number() }),
  v.object({ type: v.literal("manual_toggled"), snakeId: v.number(), manual: v.boolean() }),
  v.object({
    type: v.literal("drive_added"), snakeId: v.number(), driveType: v.string(),
    targetType: v.union(v.literal("snake"), v.literal("cell")),
    targetId: v.string(), weight: v.number(),
  }),
  v.object({
    type: v.literal("drive_removed"), snakeId: v.number(),
    driveType: v.string(), targetId: v.string(),
  }),
  v.object({
    type: v.literal("weight_changed"), snakeId: v.number(), heuristicId: v.string(),
    oldWeight: v.union(v.number(), v.null()), newWeight: v.union(v.number(), v.null()),
    oldActive: v.boolean(), newActive: v.boolean(),
  }),
  v.object({
    type: v.literal("operator_tempo_changed"),
    operatorUserId: v.id("users"),
    tempo: v.union(v.literal("thinking"), v.literal("flow")),
  }),
  v.object({
    type: v.literal("operator_booted"),
    operatorUserId: v.id("users"),
    byCaptainUserId: v.id("users"),
  }),
  v.object({ type: v.literal("turn_submitted") }),
  v.object({
    type: v.literal("statemap_updated"), snakeId: v.number(),
    stateMap: v.any(), worstCaseWorlds: v.any(),
    heuristicOutputs: v.any(),
  }),
  v.object({
    type: v.literal("temperature_changed"), snakeId: v.number(),
    temperature: v.union(v.number(), v.null()),
  }),
)

export default defineSchema({
  heuristic_config: defineTable({
    centaurTeamId: v.id("centaur_teams"),
    heuristicId: v.string(),
    heuristicType: v.union(v.literal("drive"), v.literal("preference")),
    defaultWeight: v.number(),
    activeByDefault: v.union(v.boolean(), v.null()),
    nickname: v.union(v.string(), v.null()),
  }).index("by_team", ["centaurTeamId"]),

  global_centaur_params: defineTable({
    centaurTeamId: v.id("centaur_teams"),
    defaultGlobalTemperature: v.number(),
    defaultAutomaticTimeAllocationMs: v.number(),
    defaultScheduledSubmissionIntervalMs: v.number(),
    defaultImminentThresholdMs: v.number(),
    pinnedHeuristics: v.array(v.string()),
  }).index("by_team", ["centaurTeamId"]),

  snake_operator_state: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    snakeId: v.number(),
    operatorUserId: v.union(v.id("users"), v.null()),
    manualMode: v.boolean(),
    temperatureOverride: v.union(v.number(), v.null()),
  })
    .index("by_game", ["gameId"])
    .index("by_game_snake", ["gameId", "snakeId"])
    .index("by_game_operator", ["gameId", "operatorUserId"]),

  snake_bot_state: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    snakeId: v.number(),
    stateMap: v.any(),
    worstCaseWorlds: v.any(),
    heuristicOutputs: v.any(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_snake", ["gameId", "snakeId"]),

  snake_drives: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    snakeId: v.number(),
    driveType: v.string(),
    targetType: v.union(v.literal("snake"), v.literal("cell")),
    targetId: v.string(),
    portfolioWeight: v.number(),
  }).index("by_game_snake", ["gameId", "snakeId"]),

  snake_heuristic_overrides: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    snakeId: v.number(),
    heuristicId: v.string(),
    weight: v.union(v.number(), v.null()),
    active: v.boolean(),
  }).index("by_game_snake", ["gameId", "snakeId"]),

  game_centaur_state: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    globalTemperature: v.number(),
    automaticTimeAllocationMs: v.number(),
    scheduledSubmissionIntervalMs: v.number(),
    imminentThresholdMs: v.number(),
  }).index("by_game_team", ["gameId", "centaurTeamId"]),

  operator_tempo: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    operatorUserId: v.id("users"),
    tempo: v.union(v.literal("thinking"), v.literal("flow")),
    updatedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_operator", ["gameId", "operatorUserId"])
    .index("by_game_team", ["gameId", "centaurTeamId"]),

  centaur_action_log: defineTable({
    gameId: v.id("games"),
    centaurTeamId: v.id("centaur_teams"),
    turn: v.number(),
    identity: v.union(v.id("users"), v.id("centaur_teams")),
    identityType: v.union(v.literal("operator"), v.literal("bot")),
    timestamp: v.number(),
    action: centaurActionEvent,
  })
    .index("by_game_type_snake", ["gameId", "action.type", "action.snakeId"])
    .index("by_game_turn_timestamp", ["gameId", "turn", "timestamp"])
    .index("by_game", ["gameId"]),
})
```

### 3.2 Mutation Signatures

Motivated by 06-REQ-030, 06-REQ-031.

```typescript
interface CentaurStateMutations {
  upsertHeuristicConfig(args: {
    centaurTeamId: Id<"centaur_teams">
    heuristicId: string
    heuristicType: "drive" | "preference"
    defaultWeight: number
    activeByDefault: boolean | null
    nickname: string | null
  }): void

  deleteHeuristicConfig(args: {
    centaurTeamId: Id<"centaur_teams">
    heuristicId: string
  }): void

  insertMissingHeuristicConfig(args: {
    centaurTeamId: Id<"centaur_teams">
    registrations: ReadonlyArray<{
      heuristicId: string
      heuristicType: "drive" | "preference"
      defaultWeight: number
      activeByDefault: boolean | null
      nickname: string | null
    }>
  }): { inserted: ReadonlyArray<string> }   // Captain-only; insert-only-never-overwrites; per [07] §2.19

  upsertGlobalCentaurParams(args: {
    centaurTeamId: Id<"centaur_teams">
    defaultGlobalTemperature: number
    defaultAutomaticTimeAllocationMs: number
    defaultScheduledSubmissionIntervalMs: number
    defaultImminentThresholdMs: number
    pinnedHeuristics: string[]
  }): void

  selectSnake(args: {
    gameId: Id<"games">
    snakeId: number
    displace: boolean
  }): { displaced: Id<"users"> | null }

  deselectSnake(args: {
    gameId: Id<"games">
  }): void

  toggleManualMode(args: {
    gameId: Id<"games">
    snakeId: number
    manual: boolean
  }): void

  addDrive(args: {
    gameId: Id<"games">
    snakeId: number
    driveType: string
    targetType: "snake" | "cell"
    targetId: string
    portfolioWeight: number
  }): void

  removeDrive(args: {
    gameId: Id<"games">
    snakeId: number
    driveType: string
    targetId: string
  }): void

  setHeuristicOverride(args: {
    gameId: Id<"games">
    snakeId: number
    heuristicId: string
    weight: number | null
    active: boolean
  }): void

  setTemperatureOverride(args: {
    gameId: Id<"games">
    snakeId: number
    temperature: number | null
  }): void

  setOperatorTempo(args: {
    gameId: Id<"games">
    tempo: "thinking" | "flow"
  }): void   // Per [06-REQ-040b].

  bootOperator(args: {
    gameId: Id<"games">
    operatorUserId: Id<"users">
  }): void   // Captain-only; forced disconnect with no persistent state. Per [06-REQ-040b] / [08-REQ-068a].

  setGameParamOverrides(args: {
    gameId: Id<"games">
    centaurTeamId: Id<"centaur_teams">
    globalTemperature: number
    automaticTimeAllocationMs: number
    scheduledSubmissionIntervalMs: number
    imminentThresholdMs: number
  }): void

  updateSnakeBotState(args: {
    gameId: Id<"games">
    snakeId: number
    stateMap: any
    worstCaseWorlds: any
    heuristicOutputs: any
  }): void

  initializeGameCentaurState(args: {
    gameId: Id<"games">
    centaurTeamId: Id<"centaur_teams">
    snakeIds: ReadonlyArray<number>
  }): void

  cleanupGameCentaurState(args: {
    gameId: Id<"games">
  }): void
}
```

### 3.3 Query Signatures

Motivated by 06-REQ-032.

```typescript
interface CentaurStateQueries {
  getHeuristicConfig(args: {
    centaurTeamId: Id<"centaur_teams">
  }): ReadonlyArray<HeuristicConfigDoc>

  getGlobalCentaurParams(args: {
    centaurTeamId: Id<"centaur_teams">
  }): GlobalCentaurParamsDoc | null

  getEffectiveHeuristicConfig(args: {
    gameId: Id<"games">
    snakeId: number
  }): EffectiveHeuristicConfig

  getGameCentaurState(args: {
    gameId: Id<"games">
    centaurTeamId: Id<"centaur_teams">
  }): GameCentaurStateView

  getActionLog(args: {
    gameId: Id<"games">
    centaurTeamId: Id<"centaur_teams">
    fromTurn?: number
    toTurn?: number
  }): ReadonlyArray<CentaurActionLogDoc>

  getOperatorTempo(args: {
    gameId: Id<"games">
    centaurTeamId: Id<"centaur_teams">
  }): ReadonlyArray<{
    readonly operatorUserId: Id<"users">
    readonly tempo: "thinking" | "flow"
    readonly updatedAt: number
  }>   // Per [06-REQ-040b].
}
```

**`EffectiveHeuristicConfig`** — the computed overlay of team defaults and per-snake overrides:

```typescript
interface EffectiveHeuristicEntry {
  readonly heuristicId: string
  readonly heuristicType: "drive" | "preference"
  readonly weight: number
  readonly active: boolean
  readonly isOverridden: boolean
}

type EffectiveHeuristicConfig = ReadonlyArray<EffectiveHeuristicEntry>
```

**`GameCentaurStateView`** — the joined view of all game-scoped state for the operator interface.

```typescript
interface GameCentaurStateView {
  readonly globalTemperature: number
  readonly automaticTimeAllocationMs: number
  readonly scheduledSubmissionIntervalMs: number
  readonly imminentThresholdMs: number
  readonly operatorTempo: ReadonlyArray<{
    readonly operatorUserId: Id<"users">
    readonly tempo: "thinking" | "flow"
    readonly updatedAt: number
  }>
  readonly snakes: ReadonlyArray<{
    readonly snakeId: number
    readonly operatorUserId: Id<"users"> | null
    readonly manualMode: boolean
    readonly temperatureOverride: number | null
    readonly stateMap: any
    readonly worstCaseWorlds: any
    readonly heuristicOutputs: any
    readonly drives: ReadonlyArray<{
      readonly driveType: string
      readonly targetType: "snake" | "cell"
      readonly targetId: string
      readonly portfolioWeight: number
    }>
    readonly heuristicOverrides: ReadonlyArray<{
      readonly heuristicId: string
      readonly weight: number | null
      readonly active: boolean
    }>
  }>
}
```

### 3.4 Game-Start Initialization Contract

Motivated by 06-REQ-014, 06-REQ-042.

```typescript
interface GameCentaurStateInitContract {
  readonly trigger: "game-start orchestration in [05]"
  readonly mutation: "initializeGameCentaurState"
  readonly precondition: "game record status === 'playing'"
  readonly idempotent: true
  readonly inputs: {
    readonly gameId: Id<"games">
    readonly centaurTeamId: Id<"centaur_teams">
    readonly snakeIds: ReadonlyArray<number>
  }
  readonly sideEffects: {
    readonly snakeOperatorState: "one document per snake, all unselected"
    readonly snakeBotState: "one document per snake, empty state"
    readonly snakeHeuristicOverrides: "seeded from team heuristic_config activeByDefault entries"
    readonly gameCentaurState: "one document per team, all fields initialised from global_centaur_params defaults"
    readonly operatorTempo: "no rows seeded; upserted lazily on first setOperatorTempo call from each operator per [06-REQ-040b]"
  }
}
```

**DOWNSTREAM IMPACT**: [05] must call `initializeGameCentaurState` for each CentaurTeam during game-start orchestration, after the game record transitions to `playing` status and after the SpacetimeDB instance is provisioned. The `snakeIds` parameter must match the snake IDs assigned during `generateBoardAndInitialState()`. [05] must also call `cleanupGameCentaurState` during game-end orchestration to clear selection records.

### 3.5 DOWNSTREAM IMPACT Notes

1. **[07] must read effective heuristic config via `getEffectiveHeuristicConfig`.** The bot framework reads the effective configuration (team defaults overlaid with per-snake overrides) to determine which heuristics to evaluate and at what weights for each snake. The bot framework must subscribe to changes in `snake_heuristic_overrides` and `snake_drives` to reactively update its computation.

2. **[07] must write computed display state via `updateSnakeBotState`.** The bot framework is the sole writer of `snake_bot_state` documents, authenticated via the per-CentaurTeam game credential. Each write is a full snapshot (not a delta) per [06-REQ-028]. The mutation transactionally writes a `statemap_updated` action log entry.

3. **[08] must implement the operator mutation interface.** The live operator interface calls `selectSnake`, `deselectSnake`, `toggleManualMode`, `addDrive`, `removeDrive`, `setHeuristicOverride`, `setTemperatureOverride`, `setOperatorTempo`, and (for Captains only) `bootOperator` via the Convex client, authenticated via Google OAuth. Each mutation transactionally writes its corresponding action log entry — the client does not need to write log entries separately. As part of every (re)connect sequence (first-ever join, reconnect after network drop, reconnect after Captain boot), [08] shall call `setOperatorTempo({ tempo: "flow" })` per [06-REQ-040b].

4. **[08] must subscribe to `getGameCentaurState` for live updates.** The Convex reactive query system delivers updates when any underlying document changes (operator state, bot state, drives, overrides, or game-level state).

5. **[08]'s replay viewer reconstructs within-turn history from the action log.** Selection history is not available from live state after game end (selection records are cleared per [06-REQ-025a]); the replay viewer must use `getActionLog` to reconstruct the team's experience at any point in time. Staged-move history is reconstructed from the SpacetimeDB game log ([04-REQ-025], [04-REQ-027]).

6. **[05] must coordinate game-start initialization.** [05] calls `initializeGameCentaurState` for each CentaurTeam participating in a game, passing the team's snake IDs. [05] also calls `cleanupGameCentaurState` at game end.

7. **Single Convex namespace coordination.** Module 06's table names (`heuristic_config`, `global_centaur_params`, `snake_operator_state`, `snake_bot_state`, `snake_drives`, `snake_heuristic_overrides`, `game_centaur_state`, `operator_tempo`, `centaur_action_log`) must not collide with Module 05's table names. `global_centaur_params` stores team-level defaults; `game_centaur_state` is initialised from those defaults at game start and holds the effective values for each game. Per [02] §3.11 DOWNSTREAM IMPACT note 1, [05] should load [06]'s exported interfaces when authoring its schema.

---


## REVIEW Items

All REVIEW items for this module (all resolved) have been migrated to [`06-centaur-state.review.md`](review/06-centaur-state.review.md).
