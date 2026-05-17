# Module 04: SpacetimeDB Game Engine

## Requirements

This module specifies the per-game runtime that authoritatively executes [01]'s game rules, holds live gameplay state, mediates client admission per [03], and retains the complete historical record of the game in a form sufficient for replay export. Its scope is bounded by [02]: it is the **SpacetimeDB game runtime** referred to throughout [02], and it owns the informal-spec material in Sections 10 (schema) and 14 (turn event schema). Requirements here are concept-level; specific table names, column names, reducer names, and visibility View definitions are Phase 2 (Design) concerns.

### 4.1 Scope and Module Boundaries

**04-REQ-001**: This module shall specify the behaviour of the SpacetimeDB game runtime introduced by [02-REQ-001] and constrained by [02-REQ-003], [02-REQ-007], [02-REQ-008], [02-REQ-009], [02-REQ-010], [02-REQ-013], and [02-REQ-014]. Requirements in this module shall not restate [01]'s game rules or [03]'s authentication and admission mechanics; they shall specify how the runtime realises, stores, and exposes the state produced by those rules.

**04-REQ-002** *(negative)*: The SpacetimeDB game runtime shall not hold, derive, or expose any platform-wide persistent state. All platform-wide persistent state lives in Convex per [02-REQ-015]. The runtime's state shall be scoped to a single game instance and shall be discarded when the instance is torn down per [02-REQ-021], subject to the replay-export obligation in Section 4.12.

**04-REQ-003** *(negative)*: The SpacetimeDB game runtime shall not accept move-staging, turn-declaration, or any other gameplay-mutation operation from connections that have not been admitted per Section 4.4.

---

### 4.2 Game State Retention Model

**04-REQ-004**: The runtime shall maintain a **historical record** of the game's state over time such that, for every turn `T` in `[0, latestCompletedTurn]`, the complete observable state of the game at the boundary between turn `T` and turn `T+1` is directly queryable from the runtime alone, without any auxiliary computation that re-executes prior turns. The observable state comprises: every snake's body, health, invulnerability level, active effects, pending effects, last direction, alive status, visible status, and `ateLastTurn` flag per [01-REQ-004]; every item's position and type; the board layout; and each CentaurTeam's time budget. (Satisfies [02-REQ-013].)

**04-REQ-005**: The historical record shall be **append-only**: once a row, event, or other record representing state at or before turn `T` has been written as part of the atomic transaction that resolves turn `T`, the runtime shall not subsequently mutate or delete that record except as part of replay export teardown ([02-REQ-021]). Historical records shall not be re-written to reflect later corrections. **Exception**: `item_lifetimes.destroyedTurn` may be updated exactly once from `null` to a value as part of a later turn's resolution when the item is consumed or destroyed; this is the single permitted mutation to a previously-written historical row (see §2.1.2).

**04-REQ-006**: The historical record shall include, for each turn `T ≥ 0`, a per-turn snapshot of each snake's full state ([01-REQ-004]) at the boundary between turn `T` and turn `T+1`. "At the boundary" means after Phase 11 of turn `T` has completed and before Phase 1 of turn `T+1` has begun.

**04-REQ-007**: The historical record shall track each item's lifetime by recording the turn on which it was spawned and the turn on which it was consumed or destroyed. For any turn `T`, the set of items present on the board at the boundary between turn `T` and turn `T+1` shall be directly derivable from this record. Items present at game start (Section 4.3) shall have a spawn turn of `0`.

**04-REQ-008**: The historical record shall include the board layout (cell types per [01-REQ-002]) as static data written once during game initialisation (Section 4.3) and never subsequently modified. Board cell types shall not change after game start.

**04-REQ-009**: The historical record shall include, for each completed turn `T`, each CentaurTeam's remaining time budget (Section 4.6) and a marker indicating how the CentaurTeam's turn was declared over — either by explicit declaration (with the timestamp at which the declaration occurred) or by clock expiry.

**04-REQ-010**: The historical record shall include, for each completed turn `T`, the turn's wall-clock start and the wall-clock moment at which turn resolution began. The gap between successive turns' start markers captures time spent in turn resolution itself; the runtime shall not assume resolution is instantaneous.

**04-REQ-011**: The historical record shall include all turn events emitted by turn resolution (Section 4.8), attributed to the turn in which they were produced, in an order that preserves the relative emission sequence within a turn.

**04-REQ-012**: The set of information persisted in the historical record shall be sufficient to reconstruct a complete replay of the game — including every board state, every item lifetime, every turn event, and every `stagedBy` attribution — without consulting any runtime other than this one. (Satisfies [02-REQ-014] and the replay-export contract with [05].)

---

### 4.3 Game Initialisation

**04-REQ-013**: The runtime shall expose a **privileged initialisation operation** that may be called exactly once per instance, before any connection is admitted, by the Convex orchestration path described in [02-REQ-019]. The caller shall be authenticated per [03-REQ-048]. The operation shall accept, at minimum: a fully specified initial game state comprising the board layout (cell terrain as a flat array per [01-REQ-008]–[01-REQ-013]), all snake starting states (positions, health, CentaurTeam assignments per [01-REQ-020]–[01-REQ-021]), and all initial item placements (per [01-REQ-017]); the dynamic gameplay parameters (food spawn rate, potion spawn rates, hazard damage, max health, timer budgets, max turns, and other runtime-behaviour parameters — but not board generation parameters, which are consumed by Convex and never reach STDB); the participating-CentaurTeam roster per [03-REQ-039]; and the game's unique identifier (used to validate the `aud` claim in connecting clients' JWTs per [03-REQ-023]). The operation shall not call `generateBoardAndInitialState()` — board generation is performed by Convex before the STDB instance is provisioned (see [02] §2.14). A per-game root seed ([01-REQ-059]) shall be accepted for turn-resolution randomness (per-turn seed derivation via `subSeed()`) and replay export ([04-REQ-061]), but not for board generation.

**04-REQ-014**: Successful completion of the initialisation operation shall leave the runtime in a state where (a) the static board layout ([01-REQ-008] through [01-REQ-013]) is written, (b) each snake's initial state ([01-REQ-020], [01-REQ-021]) is written as the turn-0 snapshot, (c) initial food placements ([01-REQ-017]) are written as spawn-turn-0 items, (d) each CentaurTeam's initial time budget ([01-REQ-035]) is recorded, (e) the game's unique identifier is stored in `game_config` for `aud` claim validation by the `client_connected` callback (Section 4.4), and (f) the participating-CentaurTeam roster (per [03-REQ-039]) is available for use by the connection admission path.

**04-REQ-015**: Once the initialisation operation has completed successfully, the runtime shall be in the state of **turn 0 before Phase 1** and shall be ready to accept client connections (Section 4.4), staged moves (Section 4.5), and turn-over declarations (Section 4.6).

**04-REQ-016** *(negative)*: The runtime shall reject any attempt to invoke the privileged initialisation operation after it has completed once. The runtime shall also reject any move-staging or turn-declaration operation submitted before the initialisation operation has completed, and the `client_connected` callback shall disconnect any client that connects before initialisation is complete.

**04-REQ-017**: The runtime shall **not** perform board generation. Board generation (`generateBoardAndInitialState()`, [01-REQ-010] through [01-REQ-017], bounded-retry feasibility [01-REQ-061]) is performed by Convex before the STDB instance is provisioned (see [02] §2.14 and [05-REQ-032]). The `initialize_game` reducer receives a pre-computed initial game state (board layout, snake starting states, initial items) and writes it to STDB tables. The reducer shall validate the structural integrity of the received state — correct board dimensions, valid cell types, consistent snake count matching the CentaurTeam roster, valid item positions — and shall reject malformed payloads synchronously as an error return to the caller. This validation is a defensive coding-error check: a structurally invalid payload indicates a bug in Convex's board-generation or serialisation logic, not a user-facing configuration problem. Infeasibility of board generation for a given configuration is surfaced to the room owner by Convex during config mode, before any STDB instance is provisioned.

---

### 4.4 Connection Admission

**04-REQ-018**: The runtime shall implement a **`client_connected` lifecycle callback** that is invoked automatically by the SpacetimeDB runtime when a client establishes a WebSocket connection. The callback shall read the connecting client's JWT claims (previously validated by SpacetimeDB's built-in OIDC verification against the Convex platform's public key per [03] §3.17) and perform application-level validation per [03-REQ-021] and [03-REQ-023].

**04-REQ-019**: The `client_connected` callback shall validate the JWT's `aud` claim against the game's unique identifier stored in `game_config` (Section 4.3), parse the `sub` claim via `parseSubClaim()` per [03] §4.4, validate the CentaurTeam binding against the participating roster, and derive an `agentId` via the JWT `sub` claim. Upon successful validation, the callback shall associate the calling connection's opaque connection identifier with the parsed CentaurTeam (except for spectator connections with `sub` prefix `"spectator:"`, which associate no CentaurTeam per [03-REQ-026]) and derived role (operator, bot, spectator, or coach). Coach connections (`sub` prefix `"coach:"` per [03-REQ-026a]) shall be associated with the team named in the embedded `centaurTeamId` for the purpose of read-side row-level filtering — coach views shall return the same per-team filtered subscription that a member of that team would receive — but shall be rejected by all reducers as ineligible to call any state-mutating reducer per [04-REQ-070]. This association shall persist for the lifetime of the connection, consistent with [03-REQ-021].

**04-REQ-020**: The runtime shall maintain, for the full lifetime of the game instance, a **participant attribution record** (the `centaur_team_permissions` table) that maps each connection that has been successfully admitted via `client_connected` to an `Agent` value (as defined by [01]: `{kind: 'centaur_team', centaurTeamId}` for Centaur Server connections, or `{kind: 'operator', operatorUserId}` for operator connections). This mapping shall be derived from the JWT `sub` claim in the `client_connected` callback. The record shall be retained for the full lifetime of the game instance. (Satisfies [03-REQ-044]. See resolved 04-REVIEW-011.)

**04-REQ-021**: The participant attribution record shall not be mutated or deleted when the underlying connection is closed, whether by network interruption, client shutdown, or reconnection. A client that reconnects shall obtain a fresh connection identifier and a fresh `Agent`-mapped attribution entry; previous entries remain intact so that historical `stagedBy: Agent` references from earlier turns remain resolvable without re-consulting the original connection Identity.

**04-REQ-022**: The `client_connected` callback shall disconnect any client whose JWT claims fail any of the criteria enumerated in [03-REQ-023] — including `aud` mismatch, unparseable `sub`, or CentaurTeam not found in the participating roster. A rejected connection shall not result in any association or attribution record being written.

**04-REQ-023** *(negative)*: Connection admission is governed exclusively by OIDC-validated JWTs issued by Convex per [03], with application-level claim validation in the `client_connected` callback. The runtime shall not accept any alternative admission mechanism.

---

### 4.5 Move Staging

**04-REQ-024**: The runtime shall expose a **move-staging operation** that accepts, from a registered connection, a snake identifier and a direction ([01-REQ-001]). The runtime shall accept the operation only if the calling connection is registered as a human participant or bot participant for the CentaurTeam that owns the named snake; all other callers shall be rejected. (Satisfies [03-REQ-028] within the runtime.)

**04-REQ-025**: The runtime shall record staged moves in an **append-only log**. A new staged move for a snake is appended as a new entry rather than overwriting any previous entry. The effective staged move for a snake at any point in time is the latest entry for that snake by timestamp. There is no separate cancel-move operation; a new staged move for the same snake supersedes the previous one by being the most recent entry. Staged-move entries are part of the historical record and are retained for the full game lifetime, not cleared at turn resolution. (Satisfies [02-REQ-011]. See resolved 06-REVIEW-004.)

**04-REQ-026**: Each accepted staged move shall be recorded together with the `Agent` value (per 04-REQ-020) of the connection that wrote it (`stagedBy: Agent`), the wall-clock time at which the move was accepted, and the turn number in which it was staged. Each entry retains its writer's attribution permanently.

**04-REQ-027**: The staged-move storage shall be **append-only and historical**: it forms part of the permanent game record. Staged-move entries are not cleared by turn resolution; they persist for the full game lifetime as a historical log of all staging actions. This enables downstream systems ([06], [08]) to reconstruct which moves were staged by whom at any point during the game, supporting sub-turn replay fidelity. (See resolved 06-REVIEW-004.)

**04-REQ-028**: The runtime shall not validate move legality (e.g., reject moves that lead into walls) at the moment of staging. Legality is determined only during turn resolution, where a fatal direction kills the snake in Phase 3 per [01-REQ-044]. This preserves the "explore a direction to see its score" affordance described in [08]'s live-operator interface.

**04-REQ-029** *(negative)*: The runtime shall not permit a connection to stage a move for a snake belonging to a CentaurTeam other than the CentaurTeam the connection was admitted for, even if a connection identifier from the opposing CentaurTeam's admission is supplied in a spoofed parameter. CentaurTeam membership is the connection-level association established in Section 4.4 and cannot be asserted per-call.

---

### 4.6 Chess Timer

**04-REQ-030**: The runtime shall implement the chess-timer semantics of [01-REQ-034] through [01-REQ-040] within its own state; no external runtime shall mediate per-turn clock timing. This includes: per-CentaurTeam time budget tracking, per-turn clock derivation from `min(effectiveCap, currentBudget)`, budget crediting on explicit declaration, and automatic declaration on clock expiry.

**04-REQ-031**: The runtime shall expose a **declare-turn-over operation** that a registered connection may invoke on behalf of the CentaurTeam the connection was admitted for. A declaration shall (a) stop that CentaurTeam's per-turn clock, (b) credit the remaining clock time back to that CentaurTeam's time budget, (c) record the declaration timestamp as part of the per-turn record required by 04-REQ-009, and (d) be idempotent — a second declaration by the same CentaurTeam in the same turn has no effect. Declarations from spectator connections shall be rejected.

**04-REQ-032**: The runtime shall autonomously detect when a CentaurTeam's per-turn clock has reached zero without an explicit declaration, and shall treat that event as an implicit turn-over declaration for that CentaurTeam. The per-turn record required by 04-REQ-009 shall distinguish clock-expiry declarations from explicit declarations.

**04-REQ-033**: The runtime shall trigger turn resolution (Section 4.7) **exactly once per turn**, at the moment all participating CentaurTeams have declared turn over (whether explicitly, by clock expiry, or any combination). Turn resolution shall not be triggered by any other condition, including wall-clock elapsed time alone, administrative action, or connection count changes.

**04-REQ-034**: A CentaurTeam that has no alive snakes shall be treated for turn-resolution-triggering purposes as having declared turn over at the start of every subsequent turn. The runtime shall not wait for such a CentaurTeam's clock to expire before triggering resolution. (This handles the case where one CentaurTeam is eliminated but the game continues with the remaining CentaurTeams per [01-REQ-054].)

**04-REQ-035**: Time-budget bookkeeping across turns shall conform to [01-REQ-035] (initial budget from configuration), [01-REQ-036] (budget increment at the start of each turn), and [01-REQ-037] (per-turn clock cap rule including the turn-0 first-turn-time override). The runtime shall record each CentaurTeam's post-turn budget as part of the historical record (04-REQ-009).

---

### 4.7 Turn Resolution

**04-REQ-036**: Turn resolution shall execute the eleven-phase pipeline of [01-REQ-041] and its sub-requirements ([01-REQ-042] through [01-REQ-052]) using the shared engine codebase of [02-REQ-034] and [02-REQ-035]. The runtime shall not implement a parallel or specialised variant of this pipeline.

**04-REQ-037**: Turn resolution shall execute as a **single atomic transaction**, such that either every state mutation produced by the eleven-phase pipeline is observable to subscribed clients simultaneously, or none of them are. No intermediate state from within the resolution pipeline shall be observable to any subscribed client. (Restates [02-REQ-008] at this module's level of specificity.)

**04-REQ-038**: Within the atomic transaction of turn resolution, the runtime shall, in order: (a) read the effective staged moves for the current turn (the latest entry per snake by timestamp from the append-only staged-moves log, each carrying its `stagedBy: Agent` per 04-REQ-026); (b) run the eleven-phase pipeline of [01-REQ-041]; (c) for each snake that moved, emit a movement event recording the direction moved, whether growth occurred, and the `Agent` value of the connection that staged the move that was consumed (or `null` if the move was determined by the fallback rule of [01-REQ-042] because no move was staged); (d) emit all other turn events required by [01-REQ-052] (Section 4.8); (e) append the new turn-`T+1` snake-state snapshots, updated item-lifetime records, and post-turn time-budget entries to the historical record; (f) add the budget increment to each CentaurTeam's budget per [01-REQ-036].

**04-REQ-039**: The `stagedBy` value captured in movement events shall be the `Agent` resolved from the staging connection's Identity at registration time per 04-REQ-020 and carried through from the staged-move record per 04-REQ-026. No further interpretation, mapping, or substitution of the `Agent` value is performed during turn resolution or replay export. (Satisfies [03-REQ-032]. Resolves 04-REVIEW-011.)

**04-REQ-040**: If a snake had no staged move at the moment of turn resolution and its direction was determined by the Phase 1 fallback rule of [01-REQ-042], the movement event for that snake shall distinguish the fallback case from the staged-move case. The `stagedBy` field of the movement event shall be **nullable** (`Agent | null`); it shall be populated with the `Agent` of the writer whose staged move was consumed when the move was staged, and shall be **null** when the move was determined by fallback. The fallback case covers both (a) subsequent-turn fallback to `lastDirection` per [01-REQ-042(b)] and (b) turn-0 random fallback per [01-REQ-042(c)] when no move was staged. (Resolves 04-REVIEW-002.)

**04-REQ-041** *(negative)*: Once turn resolution for turn `T` has committed, the runtime shall not accept further staged moves or turn-over declarations attributable to turn `T`. Any such operations received after commitment shall either be treated as pertaining to turn `T+1` (if they arrive after the new turn has begun) or rejected, at the runtime's discretion; the runtime shall not silently reorder them into turn `T`'s committed state.

**04-REQ-042**: After a turn-resolution commit, the runtime shall begin turn `T+1` by applying the budget-increment rule ([01-REQ-036]), computing each CentaurTeam's new per-turn clock per [01-REQ-037], and accepting staged moves and turn-over declarations for the new turn.

---

### 4.8 Turn Event Emission

**04-REQ-043**: The runtime shall emit, as part of each turn's atomic resolution transaction, a set of **turn events** covering every observable outcome of that turn. The set of event kinds shall be a **closed enumeration** — no extensibility mechanism shall permit new event kinds to be added without a deliberate revision of this requirement. The closed set shall comprise at minimum:

- (a) **Snake movement**: for each snake that executed a move in Phase 2, a record capturing the snake identifier, the originating cell, the destination cell, the direction, whether the tail was retained (growth), and `stagedBy` per 04-REQ-039 and 04-REQ-040 (nullable; null indicates a fallback-determined move).
- (b) **Snake death**: for each snake that died in Phase 3, Phase 5, or other phase of the pipeline, a record capturing the snake identifier, the cause of death (wall, hazard, self-collision, body-collision, head-to-head, starvation), the location, and — where applicable — the identifier of the snake responsible (e.g., the attacker in a body-collision kill).
- (c) **Severing**: for each severing outcome per [01-REQ-044c], a record capturing the attacker identifier, the victim identifier, the contact cell, and the number of segments removed.
- (d) **Food consumption**: for each snake that consumed food in Phase 5, a record capturing the snake identifier, the cell, and the resulting health value.
- (e) **Potion collection**: for each snake that consumed a potion in Phase 6, a record capturing the collector identifier, the cell, the potion type, and the set of teammates affected by the resulting pending effects.
- (f) **Food spawning**: for each food item spawned in Phase 7, a record capturing the new item's identifier and cell.
- (g) **Potion spawning**: for each potion item spawned in Phase 8, a record capturing the new item's identifier, cell, and potion type.
- (h) **Effect application**: for each effect that was moved from `pendingEffects` to `activeEffects` in Phase 9, a record capturing the affected snake, effect type, and expiry turn.
- (i) **Effect cancellation**: for each effect that was removed in Phase 9 — whether by disruption-triggered cancellation per [01-REQ-031] or by natural expiry per [01-REQ-050] — a record capturing the affected snake, effect type, and the reason (`disruption` or `expiry`).
- (j) **Hazard damage**: for each surviving snake that took hazard damage in Phase 5b without dying that turn, a record capturing the snake identifier, the hazard cell, the damage amount applied, and the resulting health value. Snakes that die *from* hazard damage in Phase 5 are covered by the death event (b) with cause `hazard` and shall not additionally emit a hazard_damage event. (See resolved 04-REVIEW-003.)

**04-REQ-044**: Each turn-event record shall include enough information for a replay or animation client to visualise the associated outcome without re-executing turn resolution. In particular, event records shall not require the client to diff successive snake-state snapshots to recover information that the event describes (e.g., a death event shall carry the cause explicitly rather than requiring the client to infer it from a snake's alive-to-dead transition).

**04-REQ-045**: A turn's events form a **set** — they are not causally or temporally ordered with respect to each other within the turn; they are all produced atomically by a single turn-resolution transaction. For storage, replay consistency, and deterministic bit-exact comparison across independent runs, this set is given a **canonical representation order**. The ordering keys, applied in priority order, are: (1) **phase** — Phase 1 events before Phase 2 events, and so on through the eleven-phase pipeline; (2) **event-type class** within a phase — event types are grouped into an implementation-defined but fixed class order (e.g., movement events before death events before collection events within phases that produce multiple types); (3) **ascending snake identifier** of the primary subject within each event-type class (the moving snake for movement, the dying snake for death, the collector for potion collection, the eater for food consumption, the affected snake for effect application/cancellation/hazard damage, and so on); phase-internal events that have no snake subject (food spawning, potion spawning) shall follow all snake-subject events of the same phase in ascending item-identifier order. The resulting total order is a canonical representation order for storage and replay — it does not express causal or temporal dependencies between events within the turn and imposes no delivery-order obligation on subscription infrastructure. The canonical order shall be stable across independent replays of the same game seed. (Resolves 04-REVIEW-004; see also 04-REVIEW-009.)

**04-REQ-046** *(negative)*: The runtime shall not emit turn events that imply the existence of game mechanics not specified in [01]. The closed enumeration of 04-REQ-043 is exhaustive for the Team Snek ruleset as specified in this spec version.

---

### 4.9 Visibility Filtering

**04-REQ-047**: The runtime shall enforce [01-REQ-024]'s invisibility-as-information-asymmetry semantics at the **data layer** by filtering `snake_states` rows. Subscribed clients shall not observe the existence, position, body, health, effects, or any other attribute of a snake whose `visible` field is `false` ([01-REQ-023]) unless the client's admitted CentaurTeam matches the invisible snake's owning CentaurTeam. Spectator connections ([03-REQ-026]) and opponent-CentaurTeam connections shall be filtered equally per [02-REQ-010] and [03-REQ-031]. Invisibility of a snake does not imply that the effects the snake has on the game board (items consumed, turn events emitted) are invisible to observers — only the snake's own state record is filtered.

**04-REQ-048**: Visibility filtering shall apply to **all** queries against the historical record that refer to turns in which the snake's frozen visible state (per [01-REQ-033]) was `false`. In particular, a client scrubbing backward in history shall not be able to recover the position or existence of an invisible-at-that-turn snake belonging to an opponent CentaurTeam.

**04-REQ-049**: Visibility filtering shall apply to `snake_states` rows for invisible opponent snakes. The snake's own state record (body, health, position, effects) is the sole datum hidden from opponent and spectator connections. Game-board effects caused by an invisible snake — items being consumed, turn events describing what happened — remain visible to all observers. The runtime does not track or filter based on whether the snake that caused a game-board effect was visible at the time.

**04-REQ-050**: Allied connections (i.e., connections admitted for the same CentaurTeam as the invisible snake) shall observe the invisible snake normally, including any dedicated visual indicator the client chooses to render on the basis of the snake's `visible` field. The runtime shall expose `visible = false` to allied queries so the client can distinguish ally-invisible from ally-visible.

**04-REQ-051**: When a snake becomes visible or invisible at a turn boundary (because an `invis_buff` or `invis_collector` effect is applied, cancelled, or expires in Phase 9), the visibility filter shall transition at the boundary between turns. An opposing-CentaurTeam client observing turn `T+1` after the snake becomes invisible shall no longer observe the snake; a client that previously saw the snake shall have the observation vanish at that boundary. The reverse transition (invisible → visible) shall cause the snake to appear at the boundary.

**04-REQ-052** *(negative)*: The runtime shall not rely on client-side filtering for invisibility. A client that issues unfiltered queries directly against the runtime's data layer shall receive `snake_states` data that has already had invisible-opponent snakes elided; the runtime shall not assume a cooperating client. Additionally, the runtime shall block access to data that clients have no legitimate need to read (staged moves, connection attribution metadata) regardless of snake visibility.

---

### 4.10 Subscription and Real-Time Delivery

**04-REQ-053**: Registered connections shall be able to subscribe to the historical record and receive updates incrementally as turn resolution commits each new turn. A subscribed client shall not need to poll the runtime on a timer to detect turn progression. (Satisfies [02-REQ-009].)

**04-REQ-054**: The runtime shall support subscription patterns sufficient for each of the following client use cases:
- (a) **Live current-turn view**: observing the state of the current turn, updating automatically when a new turn begins.
- (b) **Historical scrubbing**: observing the state at an arbitrary past turn `T` by issuing a point-in-time query against the historical record (04-REQ-004).
- (c) **Animation between turns**: observing the transition from turn `T` to turn `T+1` by subscribing to the turn-`T+1` snake-state snapshot together with the turn-`T+1` turn events (Section 4.8).
- (d) **Full-game subscription**: a client that connects mid-game and wants the complete history shall be able to subscribe to all historical records and receive them as an initial delivery followed by incremental updates.

**04-REQ-055**: Subscription deliveries shall be subject to the visibility filter of Section 4.9 on the same terms as direct queries.

**04-REQ-056**: When turn resolution commits turn `T`'s state, all new rows, events, and record updates produced by that commit shall be delivered to subscribed clients as a single logical update corresponding to the atomic turn-resolution transaction. Clients shall not observe a state in which, e.g., the new snake-state snapshot has arrived but the corresponding turn events have not.

---

### 4.11 Historical Reconstruction

**04-REQ-057**: For any completed turn `T` in `[0, latestCompletedTurn]`, a subscribed client with an appropriate CentaurTeam admission shall, using only the runtime's query interface, be able to reconstruct:
- (a) the positions, bodies, health, effects, and visibility states of every snake belonging to CentaurTeams the client is authorised to observe at the boundary between turns `T` and `T+1`;
- (b) the positions of every item present on the board at the boundary between turns `T` and `T+1`;
- (c) each CentaurTeam's remaining time budget at the end of turn `T`;
- (d) the full list of turn events emitted during turn `T`'s resolution (visible to all connections per the invisibility principle — see 04-REQ-049).

**04-REQ-058**: Historical reconstruction shall not require the client to replay turn resolution or re-execute any game-rule logic. The per-turn state is directly queryable from the historical record as written by the resolving transaction.

**04-REQ-059**: Historical reconstruction shall remain valid across turn progression: as the runtime appends new turn records, previously queryable historical states shall remain queryable with identical results. No append-only record shall be retroactively altered.

---

### 4.12 Replay Export

**04-REQ-060**: After a win condition has been detected in Phase 10 of some turn `T_end` ([01-REQ-051], [01-REQ-054] through [01-REQ-057]), the runtime shall treat the game as **ended** for gameplay purposes: further move-staging and turn-declaration operations shall be rejected, and no further turns shall be resolved. Game-end rejection begins at the moment the final turn's transaction commits. In-flight staged moves or turn-declaration operations arriving after the commit of turn `T_end` shall be rejected as "game over" — there is no grace window between commit and enforcement.

**04-REQ-061**: After game-end detection, the runtime shall make the complete historical record available to Convex for replay persistence ([05-REQ-040]). The complete record comprises the static board layout (as received from Convex at init time), the dynamic gameplay parameters seeded at initialisation, the per-game seed ([01-REQ-059], [01-REQ-060]) so that downstream systems can verify deterministic reproducibility per 04-REQ-069 (see resolved 04-REVIEW-013), the full per-turn historical record of snake states (04-REQ-006), the full item-lifetime record (04-REQ-007), the full per-turn time-budget record (04-REQ-009), the full turn-timing record (04-REQ-010), the full turn-event record (04-REQ-011), and the participant attribution record of Section 4.4. The complete record shall be bundled into the `GameEndNotification` payload of [04-REQ-061a] by the `notify_game_end` scheduled procedure (see §2.10, §2.11). The callback token authenticating the notification is a Convex-signed JWT; Convex validates it by signature verification and claims checking — no stored-token comparison is required. (See also [03-REQ-045].)

**04-REQ-061a**: The runtime shall notify Convex when a game has ended, consistent with [05-REQ-038]'s obligation that Convex learns of game end in order to orchestrate score display, replay persistence, teardown, and next-game preparation. Convex registers its interest in receiving such notifications for a given instance by providing a `gameEndCallbackUrl` and a `gameOutcomeCallbackToken` at init time (stored in `game_config`). The notification is sent by the `notify_game_end` scheduled procedure (§2.10) via `ctx.http.fetch()`, and carries the complete historical record bundled as `replayData` (§2.11) alongside the `GameOutcome`.

**04-REQ-062**: The replay-export client shall be authenticated as the Convex platform runtime per [03-REQ-048]. The runtime shall not permit any other caller to retrieve the bulk replay export. 04 requires only that the privilege be distinct from ordinary gameplay admission; detailed credential mechanics are owned by [03].

**04-REQ-063**: The runtime shall not be torn down until the replay-export client has confirmed successful retrieval of the replay data. Teardown is a Convex-orchestrated operation per [02-REQ-021]; 04's obligation is to remain available until export completes and to not silently discard data that has not yet been read.

**04-REQ-064**: During the post-game-end window in which replay export is in progress, all RLS (Section 4.9) shall be bypassed for the replay-export client's queries. The replay export is the complete game record — including all invisible snakes' `snake_states` rows, `staged_moves`, and `centaur_team_permissions` — because downstream replay systems need the full game log regardless of which CentaurTeam's perspective an end viewer later chooses.

**04-REQ-065** *(negative)*: The runtime shall not spontaneously transmit gameplay or replay data to any external system during gameplay. Game-end notification ([04-REQ-061a]) and any bundled or runtime-initiated delivery of the historical record to Convex at game end ([04-REQ-061]) are explicitly permitted and do not constitute violations of this requirement.

---

### 4.13 Invariants and Cross-Cutting Negative Requirements

**04-REQ-066** *(negative)*: The runtime shall not modify any historical record after the turn-resolution transaction that produced it has committed. In particular, it shall not rewrite prior-turn snake states, event records, or time-budget entries in response to later discoveries or corrections. Historical correctness is the responsibility of the resolving transaction at the time of commit.

**04-REQ-067** *(negative)*: The runtime shall not deliver events, snake states, or any other state referring to a turn `T` to subscribed clients until the atomic turn-resolution transaction for turn `T` has fully committed. Clients shall not observe partial turn-resolution state.

**04-REQ-068** *(negative)*: The runtime shall not consult any external system (Convex, Centaur Server, or other) during gameplay. All data required for gameplay — rules, dynamic gameplay parameters, pre-computed initial game state, game identifier, participating-CentaurTeam roster, participant attribution record — is seeded at initialisation and never refreshed during the game's life. JWT signature validation is performed by SpacetimeDB's built-in OIDC mechanism (which fetches the JWKS at startup), not by application-level code during gameplay.

**04-REQ-069**: The runtime shall be deterministic with respect to its seeded randomness ([01-REQ-059], [01-REQ-060]): given identical initial seeds, configuration, and sequences of staged-move writes with identical timing, the resulting historical record shall be identical. (This enables test reproducibility and deterministic replay verification.)

**04-REQ-070** *(negative)*: The runtime shall not treat any connection as having elevated privileges beyond those derived from its JWT `sub` claim role and CentaurTeam association. Captain status and other Convex-side operator role distinctions ([03], [08]) shall not be visible to or enforceable by the runtime. Spectator and coach connections (`sub` prefixes `"spectator:"` and `"coach:"`) shall be rejected by every state-mutating reducer; only `operator:` and `centaur:` connections may stage moves or otherwise mutate game state, and only on behalf of their bound team.

**04-REQ-071**: For every turn `T` in `[0, latestCompletedTurn]`, the historical record shall contain exactly one scoreboard row per CentaurTeam in the game's roster — including teams whose alive-snake count for that turn is zero (zero-filled rather than omitted). Each row's aggregates (team score, alive-snake count, aggregate body length) shall be computed over the *true* alive-snake set for that team at the boundary between turn `T` and turn `T+1`, including snakes whose `visible` field per [04-REQ-047] is `false`. The visibility filter of [04-REQ-047] shall not apply to scoreboard rows: every connection (operator, Centaur Server, spectator, coach) shall observe the same scoreboard rows, since the rows expose only per-team aggregates and never per-snake state. Subscribed clients shall obtain these aggregates exclusively through the runtime's scoreboard subscription channel and shall not reconstruct them by aggregating per-snake subscription data, which would systematically under-count whenever an opponent snake is invisible. (Resolves 04-REVIEW-020; downstream of [08-REQ-084] / [08-REQ-084b].)

---

## Design

This section specifies how the SpacetimeDB game engine module satisfies the requirements of Section 1. The module is authored as TypeScript source code using SpacetimeDB's TypeScript module SDK, importing the shared engine codebase (`@snek-centaur/engine` per [02] §2.17). It is compiled to a WebAssembly binary using SpacetimeDB's build toolchain; the resulting WASM artifact is the deployment unit (Section 3.4).

All table definitions are expressed as TypeScript interfaces representing SpacetimeDB table column schemas. SpacetimeDB's TypeScript SDK maps decorated class properties to relational table columns. All timestamps are wall-clock milliseconds (Unix epoch) unless otherwise noted.

### 2.1 SpacetimeDB Table Schema Design

Satisfies 04-REQ-004 through 04-REQ-012, 04-REQ-014, 04-REQ-020, 04-REQ-025, 04-REQ-027.

The runtime's persistent state is partitioned into five categories by mutation semantics: static tables (written once at init, never modified), append-only historical tables (turn-keyed, new rows per turn, never modified or deleted), a participant attribution table (append-only, connection-keyed), mutable runtime state (lifecycle flags and current turn counter), and mutable per-turn working tables (reset each turn).

#### 2.1.1 Static Tables

Written once during `initialize_game` (Section 2.2), never subsequently modified.

**`game_config`** — Single-row table storing the game identifier, game seed, game-end callback URL, and the engine-runtime config. The row mirrors [01]'s `GameRuntimeConfig` nested structure 1:1 via an STDB `@type` struct column, so the row's runtime-config subtree is byte-equivalent to Convex's `config.runtime` subtree (see resolved [01-REVIEW-017]).

```typescript
interface GameConfigRow {
  readonly gameId: string                 // unique game identifier for aud claim validation [04-REQ-014e]
  readonly gameSeed: Uint8Array           // per-game root seed [01-REQ-059]; needed for turn-seed
                                          // derivation in resolve_turn and for replay export [04-REQ-061]
  readonly gameEndCallbackUrl: string     // Convex HTTP action URL for game-end notification [04-REQ-061a]
  readonly gameOutcomeCallbackToken: string // Convex-signed JWT for authenticating the game-end POST [03-REQ-037]
  readonly runtime: GameRuntimeConfig     // 1:1 mirror of [01] §3.3
}
```

`runtime` is the entire `GameRuntimeConfig` exported by [01] §3.3 (re-exported through [02]): `maxHealth`, `maxTurns`, `hazardDamage`, `foodSpawnRate`, `invulnPotionSpawnRate`, `invisPotionSpawnRate`, and the `clock` subtree. `gameId` satisfies 04-REQ-014e. `gameSeed` is required by `resolve_turn` to derive per-turn seeds via `subSeed(gameSeed, \`turn-${T}\`)` per [01-REQ-060] and is included in the replay export per 04-REQ-061. `gameEndCallbackUrl` is registered by Convex at init time per 04-REQ-061a. Board-generation parameters (`boardSize`, `snakesPerTeam`, `hazardPercentage`, `fertileGround.*`) belong to `GameOrchestrationConfig` and are not stored in STDB — they are consumed entirely by Convex during board generation ([04-REQ-017]).

The seed is generated by Convex alongside the initial game state during `generateBoardAndInitialState()` and passed to `initialize_game`. **DOWNSTREAM IMPACT**: [05] must include the game seed in the `initialize_game` call payload.

**`board_state`** — Single-row table storing the static board layout. Uses the flat `ReadonlyArray<CellType>` encoding with `y * width + x` indexing per [01] DOWNSTREAM IMPACT note 3.

```typescript
interface BoardStateRow {
  readonly boardSize: number              // BoardSize enum value
  readonly width: number
  readonly height: number
  readonly cells: number[]                // flat array of CellType values, y * width + x indexing
}
```

Written once by `initialize_game` [04-REQ-008, 04-REQ-014a].

**`centaur_team_roster`** — One row per participating CentaurTeam. Stores the CentaurTeam identity mapping used by `client_connected` for admission validation.

```typescript
interface CentaurTeamRosterRow {
  readonly centaurTeamId: string              // CentaurTeamId — Convex centaur_teams._id
  readonly operatorUserIds: string            // JSON-serialized array of UserId strings for this CentaurTeam
}
```

Written by `initialize_game` from the participating-CentaurTeam roster [04-REQ-013, 04-REQ-014f, 03-REQ-039]. The `operatorUserIds` field enables `client_connected` to validate operator connections' CentaurTeam binding. The `centaurTeamId` is the Convex `centaur_teams._id`, passed through from the platform.

#### 2.1.2 Append-Only Historical Tables

New rows are inserted by `resolve_turn` (and by `initialize_game` for turn-0 records). Once committed, rows are never modified or deleted [04-REQ-005], with the single exception of `item_lifetimes.destroyedTurn` (see below).

**`turns`** — One row per completed turn.

```typescript
interface TurnRow {
  readonly turn: number                   // TurnNumber — primary key
  readonly turnStartTimeMs: number        // wall-clock turn start [04-REQ-010]
  readonly resolutionStartTimeMs: number  // wall-clock moment resolution began [04-REQ-010]
}
```

**`snake_states`** — One row per snake per turn boundary. Records each snake's full observable state at the boundary between turn T and turn T+1 [04-REQ-006].

```typescript
interface SnakeStateRow {
  readonly turn: number                   // TurnNumber
  readonly snakeId: number                // SnakeId
  readonly letter: string
  readonly centaurTeamId: string                // CentaurTeamId — Convex centaur_teams._id
  readonly bodyJson: string               // JSON-serialized ReadonlyArray<Cell>
  readonly health: number
  readonly activeEffectsJson: string      // JSON-serialized ReadonlyArray<PotionEffect>
  readonly pendingEffectsJson: string     // JSON-serialized ReadonlyArray<PotionEffect>
  readonly lastDirection: number | null   // Direction enum value, null on turn 0 if no move staged
  readonly alive: boolean
  readonly ateLastTurn: boolean
  readonly invulnerabilityLevel: number   // denormalized: -1 | 0 | 1
  readonly visible: boolean               // denormalized: derived via isVisible()
}
```

Primary key: `(turn, snakeId)`. The `invulnerabilityLevel` and `visible` fields are denormalized from module 01's derived functions ([01] Section 3.1) at write time to enable (a) visibility View predicates to filter without deserializing `activeEffectsJson`, and (b) client queries to read visibility directly. This denormalization is safe because these values are frozen at the turn boundary and never change after write.

**`item_lifetimes`** — One row per item. Tracks each item's existence span [04-REQ-007].

```typescript
interface ItemLifetimeRow {
  readonly itemId: number                 // ItemId — primary key
  readonly cellX: number
  readonly cellY: number
  readonly itemType: number               // ItemType enum value
  readonly spawnTurn: number              // TurnNumber when spawned
  readonly destroyedTurn: number | null   // TurnNumber when consumed/destroyed, null = still present
}
```

Item presence at turn T: `spawnTurn <= T AND (destroyedTurn IS NULL OR destroyedTurn > T)`. Items present at game start have `spawnTurn = 0`.

**Append-only exception**: The `destroyedTurn` field is updated from `null` to a value when an item is consumed during a later turn's resolution. This is the single permitted mutation to a previously-written row in the historical tables, consistent with the informal spec's design (§10: "Updates `destroyedTurn` on consumed `item_lifetimes`"). The update only adds information (null → value), never overwrites existing data, and occurs exactly once per row.

**`time_budget_states`** — One row per CentaurTeam per turn [04-REQ-009].

```typescript
interface TimeBudgetStateRow {
  readonly turn: number                   // TurnNumber
  readonly centaurTeamId: string                // CentaurTeamId — Convex centaur_teams._id
  readonly remainingBudgetMs: number      // post-turn budget
  readonly perTurnClockMs: number         // per-turn clock that was allocated for this turn
  readonly declaredAtMs: number | null    // wall-clock timestamp of explicit declaration, null = clock expiry
  readonly declarationKind: string        // 'explicit' | 'clock_expiry' | 'no_alive_snakes'
}
```

Primary key: `(turn, centaurTeamId)`. The `declarationKind` field satisfies 04-REQ-009's requirement to distinguish clock-expiry declarations from explicit declarations; `no_alive_snakes` covers CentaurTeams auto-declared per 04-REQ-034.

**`turn_events`** — One row per turn event, in canonical order [04-REQ-011, 04-REQ-043 through 04-REQ-045].

```typescript
interface TurnEventRow {
  readonly turn: number                   // TurnNumber
  readonly eventType: string              // discriminant from the closed 10-kind set
  readonly payloadJson: string            // JSON-serialized event-specific payload (Section 2.8)
}
```

Grouped by `turn` (non-unique key; multiple rows per turn). Visible to all connections — turn events are not subject to visibility filtering (see §2.9 principle). Canonical ordering within a turn is not stored as a column — it is derived from the deterministic rules in Section 2.8 (phase ascending → event-type class → ascending snake/item ID).

**`scoreboard`** — One row per CentaurTeam in the game's roster per turn. Materialised per-turn aggregate of team score, alive-snake count, and aggregate body length, computed over the *true* alive-snake set (including snakes whose `visible = false`). Resolves 04-REVIEW-020.

```typescript
interface ScoreboardRow {
  readonly turn: number                   // TurnNumber
  readonly centaurTeamId: string          // CentaurTeamId — Convex centaur_teams._id
  readonly teamScore: number              // Σ body length of alive snakes for this team at turn boundary [01-REQ-053]
  readonly aliveSnakeCount: number        // count of snakes with alive = true for this team at turn boundary
  readonly aggregateLength: number        // Σ body length of alive snakes for this team at turn boundary
}
```

Primary key: `(turn, centaurTeamId)`. Btree index on `(turn)` for live / historical / catch-up queries (§2.12). One row is written per CentaurTeam in the game's roster per turn — *including* CentaurTeams with `aliveSnakeCount = 0` (zero-filled rather than omitted, so subscribers always see a complete per-team view at every turn). The aggregate is computed over the true alive-snake set including invisible snakes; the visibility filter of [04-REQ-047] does not apply to `scoreboard` rows. `teamScore` and `aggregateLength` are published as separate columns even though they are equal under [01-REQ-053] today, so the wire shape remains stable if a future revision of [01] introduces a score-modifying bonus that decouples score from body length.

The materialised per-turn `scoreboard` row is also the storage location for the prior-turn scores referenced by [01-REQ-055]'s simultaneous-elimination tiebreak: when Phase 10 of turn `T` needs the immediately preceding turn's per-team scores, it reads `scoreboard WHERE turn = T - 1` rather than maintaining a separate denormalised `previousTurnScores` field. (For the turn-0 simultaneous-elimination case of [01-REQ-056], scores are computed from initial snake lengths in `initialize_game`'s turn-0 `scoreboard` write — see §2.2.)

#### 2.1.3 Participant Attribution Table

**`centaur_team_permissions`** — One row per successfully admitted connection. Append-only (never deleted), retained for the full game lifetime [04-REQ-020, 04-REQ-021].

```typescript
interface CentaurTeamPermissionsRow {
  readonly connectionIdentity: Identity   // SpacetimeDB connection Identity — primary key
  readonly centaurTeamId: string | null          // CentaurTeamId (Convex centaur_teams._id), null for spectators [03-REQ-026]
  readonly agentId: string | null         // Convex record ID (CentaurTeam or Operator), null for spectators
  readonly role: string                   // 'centaur_team' | 'operator' | 'spectator'
  readonly connectedAtMs: number          // wall-clock connection timestamp
}
```

`Identity` is SpacetimeDB's opaque connection identifier type. The `agentId` field stores the Convex record ID of either the CentaurTeam (`centaur_teams._id`) or the Operator (`users._id`), derived from the JWT `sub` claim at connection time in `client_connected`. Spectator connections have `centaurTeamId = null` and `agentId = null`. Per 04-REQ-021, rows are never deleted — even when the underlying connection closes — so that historical `stagedBy` references remain resolvable.

#### 2.1.4 Mutable Runtime State

**`game_runtime`** — Single-row mutable table tracking the game's lifecycle state.

```typescript
interface GameRuntimeRow {
  readonly initialized: boolean           // true after init completes [04-REQ-016]
  readonly gameEnded: boolean             // true after terminal GameOutcome [04-REQ-060]
  readonly currentTurn: number            // current turn number, starting at 0
  readonly turnStartTimeMs: number        // wall-clock start of the current turn [04-REQ-010]
  readonly terminalOutcomeJson: string | null  // serialized GameOutcome, set on game end
}
```

**Rationale**: Separating mutable runtime state from immutable `game_config` prevents lifecycle flags from contaminating a static table. The `game_config` table's immutability enables efficient caching by SpacetimeDB's subscription system.

#### 2.1.5 Append-Only Staged-Move Log

**`staged_moves`** — Append-only log of all move-staging actions [04-REQ-025, 04-REQ-026, 04-REQ-027]. Multiple rows per snake per turn are permitted; the effective staged move for a snake is the latest entry by timestamp.

```typescript
interface StagedMoveRow {
  readonly snakeId: number                // SnakeId
  readonly direction: number              // Direction enum value
  readonly agentId: string                // Convex record ID (CentaurTeam or Operator) of the staging connection
  readonly turn: number                   // TurnNumber — the turn in which this move was staged
  readonly stagedAtMs: number             // wall-clock timestamp — monotonic within the instance
}
```

The `agentId` field carries the Convex record ID from the connection's `centaur_team_permissions` entry. Each staging action appends a new row; no rows are ever overwritten or deleted. The effective staged move for a snake at turn resolution time is determined by selecting the latest entry per snake by `stagedAtMs` for the current turn (see §2.7, Step 1). Historical entries across all turns are retained for the full game lifetime, enabling downstream systems ([06], [08]) to reconstruct the complete staged-move history for sub-turn replay. (See resolved 06-REVIEW-004.)

**Index**: Primary query pattern is `WHERE turn = T` for turn resolution, and full-table scan for replay export.

#### 2.1.6 Mutable Per-Turn Working Tables

**`centaur_team_turn_state`** — One row per CentaurTeam, tracks per-turn declaration and clock state.

```typescript
interface CentaurTeamTurnStateRow {
  readonly centaurTeamId: string                // CentaurTeamId (Convex centaur_teams._id) — primary key
  readonly declaredTurnOver: boolean
  readonly remainingClockMs: number       // remaining per-turn clock time
  readonly declaredAtMs: number | null    // wall-clock declaration timestamp, null if not yet declared
}
```

Reset at each turn start with the computed per-turn clock. Updated when CentaurTeams declare turn over (Section 2.5). When all CentaurTeams have `declaredTurnOver = true`, turn resolution triggers [04-REQ-033].

---

### 2.2 `initialize_game` Reducer Design

Satisfies 04-REQ-013 through 04-REQ-017.

The `initialize_game` reducer is a privileged operation called exactly once per instance by Convex via SpacetimeDB's HTTP API (`POST /v1/database/{name}/call/initialize_game` with JSON body and bearer token auth per [03] §3.22). Authentication uses a management JWT signed by Convex, validated by SpacetimeDB's OIDC mechanism.

**Parameters**:

```typescript
interface InitializeGameParams {
  readonly gameId: string
  readonly gameSeed: Uint8Array
  readonly gameEndCallbackUrl: string
  readonly gameOutcomeCallbackToken: string
  readonly board: {
    readonly boardSize: number
    readonly width: number
    readonly height: number
    readonly cells: number[]
  }
  readonly snakes: ReadonlyArray<{
    readonly snakeId: number
    readonly letter: string
    readonly centaurTeamId: string
    readonly body: ReadonlyArray<{ readonly x: number; readonly y: number }>
    readonly health: number
    readonly activeEffects: ReadonlyArray<PotionEffect>
    readonly pendingEffects: ReadonlyArray<PotionEffect>
    readonly lastDirection: number | null
    readonly alive: boolean
    readonly ateLastTurn: boolean
  }>
  readonly items: ReadonlyArray<{
    readonly itemId: number
    readonly itemType: number
    readonly cell: { readonly x: number; readonly y: number }
  }>
  readonly gameRuntimeConfig: GameRuntimeConfig   // mirrors [01] §3.3 1:1
  readonly teams: ReadonlyArray<{
    readonly centaurTeamId: string
    readonly operatorUserIds: ReadonlyArray<string>
  }>
}
```

**Reducer behaviour**:

1. **Re-invocation guard** [04-REQ-016]: Read `game_runtime.initialized`. If true, reject with error.
2. **Structural validation** [04-REQ-017]: Validate the received state — correct board dimensions (`width * height === cells.length`), all cell values are valid `CellType` values, every CentaurTeam has at least one snake and all teams have the same snake count, all item positions are within board bounds with valid `ItemType` values, at least two CentaurTeams, each snake has body length ≥ 1. `snakesPerTeam` is a platform-side parameter (see [01-REVIEW-017]) and is not forwarded to STDB; the equal-count invariant is verified directly from the initial snakes. On validation failure, return a synchronous error to the caller (see resolved 04-REVIEW-008).
3. **Write static tables**: Insert `game_config` row (gameId, gameSeed, gameEndCallbackUrl, gameOutcomeCallbackToken, and the `runtime` struct carrying the full `GameRuntimeConfig`), `board_state` row (boardSize, width, height, cells), and one `centaur_team_roster` row per CentaurTeam (centaurTeamId, serialized operatorUserIds).
4. **Write turn-0 historical records** [04-REQ-014b, 04-REQ-014c, 04-REQ-014d]:
   - Insert one `snake_states` row per snake for turn 0, with denormalized `invulnerabilityLevel` and `visible` computed via the shared engine's `invulnerabilityLevel()` and `isVisible()` functions.
   - Insert one `item_lifetimes` row per initial item with `spawnTurn = 0` and `destroyedTurn = null`.
   - Insert one `time_budget_states` row per CentaurTeam for turn 0 with `remainingBudgetMs = runtime.clock.initialBudgetMs` [01-REQ-035].
   - Insert a `turns` row for turn 0 with `turnStartTimeMs` and `resolutionStartTimeMs` both set to the current wall-clock time (turn 0 has no distinct resolution phase — it represents the initial state).
   - Insert one `scoreboard` row per CentaurTeam in the roster for turn 0, with `teamScore`, `aliveSnakeCount`, and `aggregateLength` computed by grouping the just-written turn-0 `snake_states` rows by `centaurTeamId` restricted to `alive = true`. Teams with no alive snakes at turn 0 are zero-filled (`aliveSnakeCount = 0`, `teamScore = 0`, `aggregateLength = 0`). The aggregate covers all snakes the team owns regardless of their `visible` field. (Resolves 04-REVIEW-020 for the turn-0 path; see also §2.7 for the per-turn-resolution path.)
5. **Initialize runtime state**: Insert `game_runtime` row with `initialized = true`, `gameEnded = false`, `currentTurn = 0`, `turnStartTimeMs` = current wall-clock time.
6. **Initialize per-turn working state**: Insert one `centaur_team_turn_state` row per CentaurTeam with `declaredTurnOver = false` and `remainingClockMs = min(runtime.clock.firstTurnTimeMs, runtime.clock.initialBudgetMs + runtime.clock.budgetIncrementMs)` per [01-REQ-037].
7. **Schedule turn-0 clock expiry** (Section 2.6): Schedule the `check_clock_expiry` reducer to fire at `turnStartTimeMs + remainingClockMs` for the CentaurTeam with the maximum remaining clock (or the common first-turn clock if all CentaurTeams have the same budget).

**Design decision — turn-0 clock starts at init completion**: The turn-0 per-turn clock begins ticking when `initialize_game` completes. Convex calls `initialize_game` only after game invitations have resolved ([05-REQ-032], per the forfeit-on-refusal semantics of [03-REQ-056]), so the snake roster passed to `initialize_game` is restricted to the teams whose servers accepted the invitation. The `runtime.clock.firstTurnTimeMs` parameter (default 60000ms per [01-REQ-037]) provides ample time for client connection following `initialize_game` completion. This avoids the complexity of a separate "start game" trigger and is consistent with chess conventions where the clock starts regardless of player readiness.

---

### 2.3 Connection Lifecycle Callbacks

Satisfies 04-REQ-018 through 04-REQ-023.

#### 2.3.1 `client_connected` Callback

Invoked automatically by SpacetimeDB when a client establishes a WebSocket connection. The client's JWT has already been cryptographically validated by SpacetimeDB's built-in OIDC verification against the Convex platform's public key ([03] §3.17).

**Behaviour**:

1. **Pre-init guard** [04-REQ-016]: Read `game_runtime.initialized`. If false, disconnect the client immediately.
2. **Read JWT claims**: Access the connecting client's validated JWT claims via SpacetimeDB's identity API (`ctx.sender`). Extract `aud` and `sub` claims.
3. **Validate `aud`** [04-REQ-019]: Compare `aud` against `game_config.gameId`. If mismatch, disconnect [04-REQ-022].
4. **Parse `sub` claim** [04-REQ-019]: Call `parseSubClaim(sub)` from the shared codebase ([03] §4.3). If unparseable, disconnect [04-REQ-022].
5. **Validate CentaurTeam binding and derive agentId** [04-REQ-019]:
   - For `kind === 'centaur_team'`: Look up `parsed.centaurTeamId` in `centaur_team_roster`. If not found, disconnect [04-REQ-022]. The `agentId` is `parsed.centaurTeamId` (the Convex `centaur_teams._id`).
   - For `kind === 'operator'`: Scan `centaur_team_roster` rows for a row whose `operatorUserIds` JSON array contains `parsed.operatorUserId`. If not found, disconnect [04-REQ-022]. The `agentId` is `parsed.operatorUserId` (the Convex `users._id`). Determine `centaurTeamId` from the matching `centaur_team_roster` row.
   - For `kind === 'spectator'`: No roster validation required [03-REQ-026]. `agentId` is null, `centaurTeamId` is null, role is `'spectator'`.
6. **Write attribution record** [04-REQ-020]: Insert a `centaur_team_permissions` row with the connection's `Identity`, resolved `centaurTeamId`, `agentId`, `role`, and current timestamp.

On any validation failure at steps 3–5, the client is disconnected immediately and no `centaur_team_permissions` row is written [04-REQ-022].

**SpacetimeDB Identity semantics**: SpacetimeDB connection `Identity` values are opaque and may be reused across reconnections for the same client. Per 04-REQ-021, a reconnecting client obtains a fresh `centaur_team_permissions` entry if its Identity is new, or the existing entry is sufficient if the Identity is reused. Previous entries are never deleted.

#### 2.3.2 `client_disconnected` Callback

Invoked automatically by SpacetimeDB when a client's WebSocket connection closes.

**Behaviour**: No-op. Per 04-REQ-021, the `centaur_team_permissions` entry is never deleted. The connection's Identity and its associated `agentId` remain in the attribution record for historical `stagedBy` resolution.

---

### 2.4 `stage_move` Reducer Design

Satisfies 04-REQ-024 through 04-REQ-029.

```
reducer stage_move(snakeId: number, direction: number):
  1. Guard: if game_runtime.gameEnded, reject ("game over") [04-REQ-060].
  2. Guard: if not game_runtime.initialized, reject [04-REQ-016].
  3. Look up ctx.sender in centaur_team_permissions. If not found, reject [04-REQ-003].
  4. If role === 'spectator', reject [04-REQ-024, 03-REQ-026].
  5. Look up snakeId in the latest snake_states for currentTurn. Determine the snake's centaurTeamId.
  6. If the connection's centaurTeamId !== snake's centaurTeamId, reject [04-REQ-029].
  7. Append into staged_moves: insert new row with snakeId, direction,
     agentId = connection's agentId from centaur_team_permissions,
     turn = game_runtime.currentTurn, stagedAtMs = now [04-REQ-025, 04-REQ-026].
  8. No legality validation of the direction [04-REQ-028].
```

The append (insert new row) implements the append-only semantics of 04-REQ-025. The effective staged move for a snake is the latest entry by timestamp; last-write-wins is determined at read time during turn resolution (§2.7, Step 1).

---

### 2.5 `declare_turn_over` Reducer Design

Satisfies 04-REQ-031 through 04-REQ-033.

```
reducer declare_turn_over():
  1. Guard: if game_runtime.gameEnded, reject [04-REQ-060].
  2. Guard: if not game_runtime.initialized, reject [04-REQ-016].
  3. Look up ctx.sender in centaur_team_permissions. If not found, reject [04-REQ-003].
  4. If role === 'spectator', reject [04-REQ-031].
  5. Read the connection's centaurTeamId.
  6. Read centaur_team_turn_state for centaurTeamId. If declaredTurnOver is already true, return
     (idempotent no-op) [04-REQ-031d].
  7. Compute elapsed time since turnStartTimeMs. Credit remaining clock time:
     remainingClock = max(0, centaur_team_turn_state.remainingClockMs - elapsedMs).
  8. Update centaur_team_turn_state: declaredTurnOver = true, remainingClockMs = remainingClock,
     declaredAtMs = now.
  9. Credit unspent clock to the CentaurTeam's budget (Section 2.6) [04-REQ-031b].
  10. Check if all CentaurTeams have declaredTurnOver = true (including CentaurTeams with no alive
      snakes per 04-REQ-034). If so, invoke resolve_turn (Section 2.7) [04-REQ-033].
```

---

### 2.6 Chess Timer Implementation

Satisfies 04-REQ-030 through 04-REQ-035, implementing [01-REQ-034] through [01-REQ-040].

**Budget arithmetic** (per [01] §2.9):

At turn start for each CentaurTeam:
```
budgetMs  += config.clock.budgetIncrementMs         // [01-REQ-036]
cap        = (T === 0) ? config.clock.firstTurnTimeMs
                       : config.clock.maxTurnTimeMs  // [01-REQ-037]
perTurnMs  = min(cap, budgetMs)
```

On explicit declare-turn-over:
```
elapsedMs    = now - turnStartTimeMs
unspentMs    = max(0, perTurnMs - elapsedMs)
budgetMs    += unspentMs                             // credit back [01-REQ-038]
perTurnMs    = 0
declaredTurnOver = true
```

On clock expiry (perTurnMs reaches zero via wall-clock elapsed time):
```
budgetMs    += 0                                     // no credit; clock fully consumed
perTurnMs    = 0
declaredTurnOver = true
```

**Scheduled reducer for clock-expiry detection** [04-REQ-032]:

At the start of each turn (in `initialize_game` for turn 0, and in `resolve_turn` for subsequent turns), the runtime schedules a `check_clock_expiry` reducer to fire at the moment the last undeclared CentaurTeam's clock would expire:

```
maxExpiryTimeMs = turnStartTimeMs + max(perTurnMs for all CentaurTeams with alive snakes)
schedule check_clock_expiry at maxExpiryTimeMs
```

When `check_clock_expiry` fires:
1. For each CentaurTeam with `declaredTurnOver = false` and `remainingClockMs - (now - turnStartTimeMs) <= 0`: auto-declare turn over with `declarationKind = 'clock_expiry'`, credit-back of 0.
2. After processing all expired CentaurTeams, check if all CentaurTeams have declared. If so, invoke `resolve_turn`.

CentaurTeams with no alive snakes are treated as having declared at turn start [04-REQ-034]:
```
for each CentaurTeam:
  if no alive snakes at turn boundary:
    set centaur_team_turn_state.declaredTurnOver = true
    set declarationKind = 'no_alive_snakes'
```

This is applied when initializing `centaur_team_turn_state` at the start of each turn.

**Rationale for scheduled reducer**: A scheduled reducer is the natural SpacetimeDB mechanism for real-time clock expiry detection. It satisfies 04-REQ-068's "no external systems during gameplay" invariant because the scheduling is internal to SpacetimeDB — no external trigger from Convex or any other system is involved. (See resolved 04-REVIEW-001.)

---

### 2.7 `resolve_turn` Reducer Design

Satisfies 04-REQ-036 through 04-REQ-042, 04-REQ-066, 04-REQ-067, 04-REQ-069.

The `resolve_turn` reducer executes as a single ACID transaction [04-REQ-037]. It is invoked internally (not by any client) when all CentaurTeams have declared turn over — triggered by either `declare_turn_over` or `check_clock_expiry`.

**Procedure**:

```
reducer resolve_turn():
  // — Pre-conditions —
  T = game_runtime.currentTurn
  resolutionStartTimeMs = now

  // — Step 1: Read effective staged moves [04-REQ-038a] —
  // For each snake, the effective staged move is the latest entry by stagedAtMs
  // for the current turn T in the append-only staged_moves log [04-REQ-025].
  stagedMoves: Map<SnakeId, StagedMove> = new Map()
  for each row in staged_moves WHERE turn = T, ordered by stagedAtMs DESC:
    if not stagedMoves.has(row.snakeId):             // take only the latest per snake
      stagedMoves.set(row.snakeId, {
        direction: row.direction as Direction,
        stagedBy: row.agentId                        // Convex record ID (CentaurTeam or Operator)
      })

  // — Step 2: Assemble GameState from tables —
  board = readBoardState()                                // from board_state
  snakes = readSnakeStatesForTurn(T)                      // from snake_states WHERE turn = T
  items = readActiveItems(T)                              // from item_lifetimes WHERE active at turn T
  clocks = readCentaurTeamClockStates()                          // from centaur_team_turn_state + time_budget_states
  gameState = { board, snakes, items, clocks }

  // — Step 3: Derive turn seed [01-REQ-060] —
  gameSeed = game_config.gameSeed
  turnSeed = subSeed(gameSeed, `turn-${T}`)

  // — Step 4: Execute eleven-phase pipeline [04-REQ-036] —
  result = resolveTurn(gameState, stagedMoves, T as TurnNumber, turnSeed)
  // result = { nextState, events, outcome }

  // — Step 5: Emit turn events [04-REQ-038d] —
  // Add hazard_damage events (04-REQ-043j, 04-REVIEW-003) to the event stream
  // if not already emitted by the shared engine. The hazard_damage event kind is
  // a module 04 addition; if the shared engine does not emit it, the reducer
  // derives it by comparing pre- and post-resolution health for snakes on hazard cells.
  allEvents = result.events  // plus any hazard_damage events derived as needed
  writeCanonicallyOrderedEvents(T, allEvents)             // Section 2.8

  // — Step 6: Append historical records [04-REQ-038e] —
  for each snake in result.nextState.snakes:
    insert snake_states row for turn T+1 (with denormalized visible, invulnerabilityLevel)
  for each item change (consumed items, newly spawned items):
    update item_lifetimes.destroyedTurn for consumed items
    insert item_lifetimes rows for newly spawned items
  for each CentaurTeam:
    insert time_budget_states row for turn T
  insert turns row for turn T (turnStartTimeMs, resolutionStartTimeMs)

  // — Step 6b: Materialise per-team scoreboard for turn T+1 [04-REQ-071] —
  // Group the just-written turn-(T+1) snake_states rows by centaurTeamId restricted
  // to alive = true. Insert one scoreboard row per CentaurTeam in the game's roster
  // for turn T+1; zero-fill (teamScore = aliveSnakeCount = aggregateLength = 0) for
  // teams with no alive snakes. The aggregate covers all of a team's snakes regardless
  // of their visible field — the scoreboard is exempt from the visibility filter of
  // [04-REQ-047]. This costs O(snakes) per turn and is performed inside the same
  // resolve_turn ACID transaction so subscribers observe the new snake_states and the
  // matching scoreboard row atomically. (Resolves 04-REVIEW-020.)
  for each centaurTeamId in centaur_team_roster:
    aliveForTeam = result.nextState.snakes
                     .filter(s => s.centaurTeamId === centaurTeamId && s.alive)
    aggregateLength = aliveForTeam.reduce((sum, s) => sum + s.body.length, 0)
    insert scoreboard row for turn T+1:
      teamScore       = aggregateLength    // [01-REQ-053] — currently equal
      aliveSnakeCount = aliveForTeam.length
      aggregateLength = aggregateLength

  // — Step 7: Advance turn [04-REQ-042] —
  T_next = T + 1

  // — Step 8: Apply budget increment for next turn [04-REQ-038f, 01-REQ-036] —
  for each CentaurTeam:
    budgetMs += config.clock.budgetIncrementMs
    cap = config.clock.maxTurnTimeMs
    perTurnMs = min(cap, budgetMs)
    reset centaur_team_turn_state for T_next:
      declaredTurnOver = (CentaurTeam has no alive snakes) [04-REQ-034]
      remainingClockMs = perTurnMs

  // — Step 9: Update game_runtime —
  game_runtime.currentTurn = T_next
  game_runtime.turnStartTimeMs = now

  // — Step 10: Check game-end [04-REQ-060] —
  if result.outcome.kind !== 'in_progress':
    game_runtime.gameEnded = true
    game_runtime.terminalOutcomeJson = JSON.stringify(result.outcome)
    // Trigger game-end notification procedure (Section 2.10)
    insert into game_end_notification_schedule  // triggers notify_game_end procedure post-commit
  else:
    // Schedule clock expiry for next turn (Section 2.6)
    schedule check_clock_expiry at (turnStartTimeMs + maxPerTurnMs)
```

**Atomicity**: All reads (steps 1–2), the shared engine call (step 4), and all writes (steps 5–10) execute within a single SpacetimeDB reducer invocation, which is a single ACID transaction. No intermediate state is observable to any subscribed client [04-REQ-037, 04-REQ-067].

**`stagedBy` capture** [04-REQ-038c, 04-REQ-039]: The `agentId` stored in the latest `staged_moves` entry per snake (written at staging time per Section 2.4) is read in step 1 and passed to `resolveTurn()` as `StagedMove.stagedBy`. For snakes where no move was staged for the current turn (no entries with `turn = T`), `resolveTurn()` returns `stagedBy: null` in the movement event per 04-REQ-040.

**GameState assembly**: Module 01's `GameState` aggregate shape is exported as `interface GameState { board, snakes, items, clocks }` ([01] DOWNSTREAM IMPACT note 8; see resolved 01-REVIEW-013). This module assembles the exported `GameState` from table rows: `board: Board` from `board_state`; `snakes: ReadonlyArray<SnakeState>` from the latest `snake_states` rows (turn T); `items: ReadonlyArray<ItemState>` from active `item_lifetimes` rows (spawnTurn ≤ T AND destroyedTurn IS NULL or > T); `clocks: ReadonlyArray<CentaurTeamClockState>` from `centaur_team_turn_state` combined with `time_budget_states`. The field names and types align exactly with Module 01's exported interface.

**Determinism** [04-REQ-069]: Given identical game seeds, configurations, and staged-move sequences, `resolveTurn()` produces identical results because (a) the shared engine's turn resolution is a pure function of its inputs, (b) all randomness is seed-derived via `subSeed()` and `rngFromSeed()`, and (c) the staged-move map is assembled deterministically from the table.

**Prior-turn scores for simultaneous-elimination tiebreak**: When the eleven-phase pipeline's Phase 10 needs the immediately preceding turn's per-team scores to evaluate the simultaneous-elimination branch of [01-REQ-055], the reducer reads them directly from `scoreboard WHERE turn = T - 1` and passes them in to the shared engine call (Step 4). No separate `previousTurnScores` field is denormalised onto another row; the materialised `scoreboard` table is the single storage location for prior-turn aggregates, consistent with §2.1.2. For the turn-0 simultaneous-elimination case ([01-REQ-056]), the prior-turn scores fall back to the turn-0 `scoreboard` row written by `initialize_game` (§2.2), which records initial snake-length aggregates.

---

### 2.8 Turn Event Storage Schema

Satisfies 04-REQ-043 through 04-REQ-046.

The `turn_events` table stores each event as a row with `eventType` discriminant and `payloadJson` containing the event-specific fields. The closed 10-kind event set:

| eventType | Phase | Payload fields | Req |
|-----------|-------|---------------|-----|
| `snake_moved` | 2 | `snakeId`, `from: {x,y}`, `to: {x,y}`, `direction`, `grew: bool`, `stagedBy: AgentId \| null` | 04-REQ-043a |
| `snake_died` | 3/5 | `snakeId`, `cause: DeathCause`, `killerSnakeId: number \| null`, `location: {x,y}` | 04-REQ-043b |
| `snake_severed` | 3 | `attackerSnakeId`, `victimSnakeId`, `contactCell: {x,y}`, `segmentsLost: number` | 04-REQ-043c |
| `food_eaten` | 5 | `snakeId`, `cell: {x,y}`, `healthRestored: number` | 04-REQ-043d |
| `potion_collected` | 6 | `snakeId`, `cell: {x,y}`, `potionType: number`, `affectedTeammateIds: number[]` | 04-REQ-043e |
| `food_spawned` | 7 | `itemId`, `cell: {x,y}` | 04-REQ-043f |
| `potion_spawned` | 8 | `itemId`, `cell: {x,y}`, `potionType: number` | 04-REQ-043g |
| `effect_applied` | 9 | `snakeId`, `family: string`, `state: string`, `expiryTurn: number` | 04-REQ-043h |
| `effect_cancelled` | 9 | `snakeId`, `family: string`, `reason: string` | 04-REQ-043i |
| `hazard_damage` | 5 | `snakeId`, `cell: {x,y}`, `damageApplied: number`, `resultingHealth: number` | 04-REQ-043j |

`DeathCause` values: `'wall'`, `'self_collision'`, `'body_collision'`, `'head_to_head'`, `'starvation'`, `'hazard'` — matching [01] §2.11.

**Canonical ordering** [04-REQ-045]: Events within a turn are ordered by applying the following deterministic sort key, derived from each event's data rather than stored as a separate column:

1. **Phase ascending**: Phase 2 events before Phase 3, Phase 3 before Phase 5, etc. The phase is derivable from `eventType` (each event kind maps to exactly one phase).
2. **Event-type class within a phase**: Within a phase that produces multiple event types (e.g., Phase 5 produces `food_eaten`, `snake_died`/starvation, and `hazard_damage`), event types are ordered by a fixed class order: movement → death → severing → food consumption → hazard damage → potion collection → food spawning → potion spawning → effect application → effect cancellation.
3. **Ascending snake/item identifier**: Within each event-type class, events are sorted by the primary subject's identifier — `snakeId` for snake-subject events, `itemId` for item-spawn events.
4. **Payload tie-breaker**: Within events sharing the same event-type class and primary subject identifier (e.g., multiple `effect_applied` events for the same snake), sort by the first distinguishing payload field: `family` for effect events, `cell.x` then `cell.y` for positional events.

This total order is deterministic, derivable from the event data alone, and stable across independent replays of the same game seed [04-REQ-069]. No stored index is needed.

**`hazard_damage` event** (see resolved 04-REVIEW-003): Emitted for each surviving snake that took hazard damage in Phase 5b without dying that turn. Snakes that die from hazard damage emit only a `snake_died` event with `cause: 'hazard'` — no additional `hazard_damage` event. This prevents double-counting while satisfying 04-REQ-044's requirement that event records carry enough information to avoid snapshot diffing.

---

### 2.9 Visibility Filtering via SpacetimeDB Views

Satisfies 04-REQ-047 through 04-REQ-052. Resolves 04-REVIEW-018 (see REVIEW Items section).

Visibility filtering is implemented using **SpacetimeDB Views** — server-side view functions that clients subscribe to in place of the underlying tables. Views are the officially recommended SpacetimeDB mechanism for per-connection visibility control. Each view receives a `ViewContext` providing `ctx.sender` (the connecting client's Identity), enabling identity-dependent filtering without exposing unfiltered data through any query path.

**Implementation mechanism — query-builder Views via `ctx.from`**: SpacetimeDB Views support two internal evaluation paths:

1. **`ctx.from` (query-builder)**: The view returns a `RowTypedQuery` built via `ctx.from.tableName.where(row => ...)`. At call time, `ctx.sender` and other parameters are captured as SQL literals in the emitted query string (e.g., `SELECT * FROM "snake_states" WHERE ...`). The runtime receives the result as `ViewResult::RawSql`. Currently, the runtime re-runs the full SQL query whenever dependent tables change. However, `ctx.from` queries are structurally compatible with SpacetimeDB's planned incremental view maintenance (IVM) infrastructure — the same IVM that already supports user-defined SQL subscriptions. Future optimizations are expected to enable true IVM for `ctx.from` views, including identity-partitioned materialization.

2. **`ctx.db` (procedural)**: The view uses imperative TypeScript with `ctx.db.tableName.columnName.find()` / `.filter()`. The runtime tracks a **read set** of rows accessed via indexed lookups; when any row in the read set changes, the view function is re-executed and the output is diffed. This path is opaque to the query engine and cannot benefit from future IVM optimizations.

Both paths support `ctx.sender` for per-connection filtering. **The visibility views defined below use `ctx.from` for forward compatibility with planned IVM optimizations.** With the expected subscriber count (2–6 teams), either path would perform adequately today, but `ctx.from` is the better long-term choice.

**Invisibility principle**: Invisibility of a snake does not imply that the effects the snake has on the game board are invisible to observers. Only the `snake_states` rows for invisible opponent snakes are hidden by visibility filtering. Items consumed by an invisible snake still disappear normally for all observers. Turn events are visible to all connections regardless of the acting snake's visibility. The invisible snake's own state record is the sole datum filtered — nothing more.

#### 2.9.1 View Definitions

**`snake_states_view`** (`ViewContext` query-builder view over `snake_states`):

The view uses `ctx.from` to build a SQL query that filters `snake_states` based on the caller's CentaurTeam. Semantically, the emitted query is equivalent to:

```sql
SELECT * FROM snake_states
WHERE centaurTeamId = (
    SELECT centaurTeamId FROM centaur_team_permissions
    WHERE identity = :ctx_sender
  )
  OR visible = true
```

Filtering semantics:
- Allied snakes (`centaurTeamId` matches the caller's CentaurTeam) are always visible, including rows with `visible = false` so the client can render the invisibility indicator [04-REQ-050].
- Opponent snakes with `visible = true` are visible to all CentaurTeams.
- Spectator connections (no `centaur_team_permissions` row for `ctx.sender`) see only rows with `visible === true` — the subquery yields no match, so only the `OR visible = true` branch returns rows.

Clients subscribe to `snake_states_view` instead of the raw `snake_states` table for all subscription patterns in Section 2.12.

**`staged_moves_view`** (`ViewContext` query-builder view over `staged_moves`):

The view uses `ctx.from` to build a SQL query that restricts `staged_moves` to the caller's CentaurTeam. Semantically, the emitted query is equivalent to:

```sql
SELECT sm.* FROM staged_moves sm
WHERE EXISTS (
    SELECT 1 FROM snake_states ss
    WHERE ss.snakeId = sm.snakeId
      AND ss.centaurTeamId = (
          SELECT centaurTeamId FROM centaur_team_permissions
          WHERE identity = :ctx_sender
      )
)
```

(`centaurTeamId` is turn-invariant for any given snake — it is assigned at game initialization and never changes — so matching any `snake_states` row for the snake yields the correct team.)

Filtering semantics:
- A `staged_moves` row is visible only if the snake belongs to the caller's CentaurTeam.
- Spectator connections (no `centaur_team_permissions` row for `ctx.sender`) see no `staged_moves` rows — the inner subquery yields no match.

Staged moves are the most sensitive data in the STDB instance — they reveal what competitors are planning before the turn resolves. No connection may read another CentaurTeam's staged moves. Because the `staged_moves` table is now append-only and contains multi-turn history, visibility filtering applies across all historical entries — a connection can see its own team's complete staging history but never another team's, regardless of turn.

Clients subscribe to `staged_moves_view` instead of the raw `staged_moves` table.

**`centaur_team_permissions` — private table (no view)**:

The `centaur_team_permissions` table is declared as **private** (omitting `public: true` in the table decorator). Private tables are invisible to all client subscriptions — no client can subscribe to or query this table. Connection-to-CentaurTeam mappings are internal attribution data with no legitimate client use case. The module owner (Convex, authenticated with a management JWT) bypasses private-table restrictions and reads this table at game end for replay export; no other caller requires access.

**`scoreboard_view`** (`ViewContext` query-builder view over `scoreboard`):

The view is a trivial unfiltered projection — semantically equivalent to:

```sql
SELECT * FROM scoreboard
```

There is no `ctx.sender` predicate: every connection (operator, Centaur Server, spectator, coach) sees the same `scoreboard` rows for every turn. The view exists as a thin `ctx.from` wrapper purely to keep the client-facing subscription surface uniform with `snake_states_view` / `staged_moves_view` and to remain forward-compatible with planned IVM optimisations on the `ctx.from` path (§2.9 introduction).

**Why aggregation is materialised at write time rather than expressed inside the view**: The View capability surface available to this module is filter / projection only. The `ctx.from` query-builder path supports `WHERE` predicates over a single table (with simple `EXISTS` subqueries against indexed columns) but does not support `GROUP BY` or aggregate functions, so a `SELECT centaurTeamId, SUM(body_length), COUNT(*) FROM snake_states_view WHERE alive AND turn = T GROUP BY centaurTeamId` shape cannot be expressed as a `ctx.from` view. The alternative path — `ctx.db` procedural views — does support arbitrary TypeScript aggregation, but it forfeits IVM compatibility entirely (the runtime tracks an indexed-read set and re-executes the whole view body on every dependent-table change), which §2.9 has explicitly chosen against for visibility-critical channels. Materialising the per-team aggregates inside `resolve_turn` (§2.7, Step 6b) costs `O(snakes)` once per turn — the alive-snake set is already in hand at the end of Phase 10 — and turns the subscription channel into the kind of filtered projection that the chosen `ctx.from` view surface handles natively. It also keeps the score-authority story single-sourced: the row a spectator subscribes to is exactly the row the resolving transaction wrote, with no derivation step downstream.

Clients subscribe to `scoreboard_view` rather than the raw `scoreboard` table for all subscription patterns in §2.12. The aggregates published by this view are computed over the *true* alive-snake set including invisible snakes per [04-REQ-047]; the visibility-bypass posture is pinned by [04-REQ-071] (§4.13).

**Unfiltered public tables** (no view needed):

`turn_events`, `item_lifetimes`, `game_config`, `board_state`, `centaur_team_roster`, `game_runtime`, `turns`, `time_budget_states` — remain public tables. Clients subscribe directly to these tables. Turn events describe game-board effects and are not filtered based on snake visibility. Item consumption is a game-board effect visible to all observers. Per the invisibility principle, only the snake's own state record is hidden — not the observable consequences of its actions. The `scoreboard` table is also conceptually unfiltered (every connection sees every row), but is exposed via the trivial `scoreboard_view` wrapper above for surface-uniformity with the other view-mediated tables.

#### 2.9.2 Required Indexes for View Query Performance

The `ctx.from` query-builder views emit SQL queries with WHERE clauses and subqueries. The following btree indexes are required for efficient query execution and to support future IVM optimization:

| Index | Table | Column(s) | Purpose |
|-------|-------|-----------|---------|
| `centaur_team_permissions.identity` | `centaur_team_permissions` | `identity` | Subquery: resolve caller's CentaurTeam from `ctx.sender` |
| `snake_states.centaurTeamId` | `snake_states` | `centaurTeamId` | `snake_states_view` WHERE clause: filter by CentaurTeam |
| `snake_states.visible` | `snake_states` | `visible` | `snake_states_view` WHERE clause: filter visible opponent snakes |
| `staged_moves.snakeId` | `staged_moves` | `snakeId` | `staged_moves_view` EXISTS subquery: join to `snake_states` |
| `scoreboard.turn` | `scoreboard` | `turn` | `scoreboard_view` subscription queries: live (`WHERE turn = currentTurn`), historical scrub (`WHERE turn = T`), and bulk catch-up (§2.12). |

The `scoreboard` table additionally has a primary-key index on `(turn, centaurTeamId)` (§2.1.2) which serves point lookups used by §2.7's prior-turn-score read for the simultaneous-elimination tiebreak.

Without these indexes, the emitted SQL queries would require full table scans on every dependent-table change, degrading performance proportionally to table size.

#### 2.9.3 Historical Query Filtering

Visibility filtering applies to historical queries with the same predicates [04-REQ-048]. A client scrubbing backward to turn T observes the snake's visibility state as it was at turn T's boundary. The denormalized `visible` column on `snake_states` makes this a direct predicate check without replaying game logic. Because clients subscribe to `snake_states_view`, historical queries are automatically filtered by the view's logic.

#### 2.9.4 Visibility Transitions

When a snake's visibility changes at a turn boundary (effect applied, cancelled, or expired in Phase 9), the filtering transition is immediate at that boundary [04-REQ-051]:
- Invisible → visible: the snake appears in the opponent's next subscription update (the view's SQL query is re-run against the updated `snake_states` table, and the newly visible row appears in the diff).
- Visible → invisible: the snake vanishes from the opponent's next subscription update (the re-run query omits the now-invisible row, producing a deletion diff).

#### 2.9.5 Replay-Export Exemption

The replay-export client (Convex, authenticated per [03-REQ-048]) bypasses all visibility filtering [04-REQ-064]. The module owner, authenticated via management JWT, has unrestricted access to all tables — including private tables (such as `centaur_team_permissions`) and the raw underlying tables behind views (such as unfiltered `snake_states` and the complete append-only `staged_moves` history). This is a built-in SpacetimeDB capability requiring no additional design. The complete unfiltered historical record is returned for downstream replay systems that render per-CentaurTeam perspectives.

---

### 2.10 Game-End Notification Mechanism

Satisfies 04-REQ-060, 04-REQ-061a, 04-REQ-065.

When `resolve_turn` detects a terminal `GameOutcome` (victory, draw, or max-turns-reached) in step 10, it:
1. Sets `game_runtime.gameEnded = true` and stores the terminal outcome.
2. Inserts a row into the `game_end_notification_schedule` schedule table, which triggers the `notify_game_end` **procedure** to fire immediately (post-commit).

The `game_end_notification_schedule` schedule table drives the `notify_game_end` procedure invocation. SpacetimeDB's schedule table mechanism ensures the procedure runs after the triggering reducer's transaction commits.

The `notify_game_end` **scheduled procedure**:
1. Reads `game_config.gameEndCallbackUrl` (the Convex HTTP action URL registered at init time).
2. Reads `game_config.gameOutcomeCallbackToken` (the Convex-signed JWT provided at init time).
3. For normal outcomes (victory, draw): reads all replay tables (Section 2.11) — `game_config`, `board_state`, `centaur_team_roster`, `centaur_team_permissions`, `turns`, `snake_states`, `item_lifetimes`, `staged_moves`, `time_budget_states`, `turn_events`, `scoreboard` — and bundles them into a `replayData` object. For error outcomes: sets `replayData` to `null`.
4. Constructs the `GameEndNotification` payload (Section 3.3) including `replayData`.
5. Sends an HTTP POST to `gameEndCallbackUrl` via `ctx.http.fetch()` with the notification payload as a JSON request body and the `gameOutcomeCallbackToken` as a Bearer token in the Authorization header.
6. On HTTP failure (non-2xx response or network error): retries with exponential backoff (initial delay 1s, max 3 retries). If all retries fail, the notification is lost but the game state remains correct — Convex can detect stale games via polling as a fallback.

Once Convex responds with a 2xx status, the procedure's work is complete. Convex will tear down the STDB instance using its platform-level management authority — the instance has no self-teardown capability.

**Design decision — scheduled procedure for HTTP delivery**: The notification is sent from a scheduled **procedure**. SpacetimeDB Procedures (beta) support outgoing HTTP via `ctx.http.fetch()`, which reducers do not. The HTTP call is a side effect that does not participate in the triggering reducer's ACID transaction, so a failed HTTP call leaves the game state correct.

**Design decision — Convex-signed callback token**: Convex pre-signs a scoped callback token at game provisioning time and passes it via `initialize_game`. This keeps Convex as the sole credential issuer (03-REQ-037) and avoids embedding any cryptographic signing material or operations in the WASM runtime. The token has a 2-hour lifetime (`exp: now + 2h` at provisioning time), which is well in excess of the maximum expected game duration.

**JWT claims contract for the game-outcome callback token** (issued by Convex at provisioning time):
- `iss`: `CONVEX_SITE_URL` (Convex as issuer).
- `sub`: `"stdb-instance:{gameId}"` (scoped to the specific game instance).
- `aud`: `gameEndCallbackUrl` (the callback endpoint URL).
- `exp`: `now + 2h` (2-hour lifetime from provisioning time).

The Convex callback endpoint validates the token by verifying the RS256 signature against its own public key (or the dedicated callback-token key pair), checking `iss`, `aud`, and `exp`, and extracting `gameId` from the `sub` claim to correlate the notification with the correct game record.

**Convex callback registration**: The `gameEndCallbackUrl` is passed as a parameter to `initialize_game` and stored in `game_config`. This URL points to a Convex HTTP action endpoint that handles game-end orchestration (score recording, replay persistence from bundled data, and immediate STDB instance teardown per [05-REQ-037], [05-REQ-038]). Convex registers this URL at game-init time as part of the [05-REQ-032] orchestration per [05-REQ-032a].

---

### 2.11 Replay Data Bundling

Satisfies 04-REQ-061 through 04-REQ-065.

The complete historical record is bundled into the `GameEndNotification` payload by the `notify_game_end` scheduled procedure (Section 2.10). The STDB procedure reads all replay tables and includes them in the same HTTP POST that notifies Convex of the game outcome.

**Bundled tables**: The procedure reads all data from:

1. `game_config` — game identifier, game seed, dynamic gameplay parameters.
2. `board_state` — static board layout.
3. `centaur_team_roster` — participating CentaurTeam identity mappings.
4. `centaur_team_permissions` — complete participant attribution record (all connections that were ever admitted) [04-REQ-061].
5. `turns` — all turn timing records.
6. `snake_states` — all per-turn per-snake state snapshots.
7. `item_lifetimes` — all item lifetime records (complete with spawn and destroy turns).
8. `staged_moves` — complete append-only staged-move history across all turns, including per-entry agent attribution and timestamps [04-REQ-025, 04-REQ-027]. Entries enable downstream systems ([06], [08]) to reconstruct which moves were staged by whom at any sub-turn timestamp.
9. `time_budget_states` — all per-turn per-CentaurTeam budget records.
10. `turn_events` — all turn events across all turns.
11. `scoreboard` — all per-turn per-CentaurTeam materialised aggregate rows (one row per CentaurTeam in the roster per turn `T ∈ [0, latestCompletedTurn]`, including zero-filled rows for teams with no alive snakes), so the materialised aggregates ship with the replay payload and downstream replay viewers can render scoreboards without recomputing them.

**Visibility filtering bypass**: The procedure executes within the STDB module and reads tables directly — no visibility filtering applies. The procedure has unrestricted access to all tables including private tables (such as `centaur_team_permissions`) and the raw underlying tables behind views (bypassing `snake_states_view`, `staged_moves_view`, and `scoreboard_view`). The complete unfiltered record — including all invisible snakes' `snake_states` rows, `centaur_team_permissions`, the complete append-only `staged_moves` history, and the full per-turn `scoreboard` rows — is included.

**Data completeness**: The exported record is sufficient to reconstruct a complete replay of the game [04-REQ-012]. Because `stagedBy` fields already carry `agentId` values (resolved at connection time per 04-REQ-020), no Identity→agent resolution step is required during export [04-REQ-061].

**Instance availability** [04-REQ-063]: The STDB instance remains available (not torn down) until Convex has successfully received the bundled notification (2xx response). After Convex confirms receipt, it tears down the instance using its platform-level management authority per [02-REQ-021]; the instance has no self-teardown capability.

**Design decision — bundled in notification**: SpacetimeDB's Procedures (beta) support reading all tables within the module and serializing them as JSON, allowing the replay payload to be bundled into the same HTTP POST. The procedure runs post-commit, so the data reflects the final game state. Convex can tear down the instance immediately upon confirming receipt. The payload size is bounded by the game's turn count and player count — for the expected game sizes (≤ 300 turns, ≤ 6 teams), the JSON payload is well within HTTP request size limits. (See resolved 05-REVIEW-015.)

---

### 2.12 Subscription Query Patterns

Satisfies 04-REQ-053 through 04-REQ-058.

SpacetimeDB's subscription system delivers incremental updates to subscribed clients as table rows change. All subscriptions are subject to visibility filtering (Section 2.9) [04-REQ-055]: for tables with visibility Views (`snake_states`, `staged_moves`), clients subscribe to the corresponding view (`snake_states_view`, `staged_moves_view`) rather than the raw table. For unfiltered public tables, clients subscribe directly. Turn-resolution commits are delivered as a single logical update corresponding to the atomic transaction [04-REQ-056].

#### 2.12.1 Live Current-Turn View

Subscribe to:
- `snake_states_view WHERE turn = game_runtime.currentTurn` — latest snake positions, health, effects (visibility-filtered per Section 2.9).
- `item_lifetimes WHERE spawnTurn <= game_runtime.currentTurn AND (destroyedTurn IS NULL OR destroyedTurn > game_runtime.currentTurn)` — currently active items.
- `board_state` — static board (initial delivery only).
- `game_runtime` — current turn number (triggers re-evaluation of the above queries when currentTurn changes).
- `centaur_team_turn_state` — per-CentaurTeam declaration status for clock display.
- `scoreboard_view WHERE turn = game_runtime.currentTurn` — per-team aggregate scoreboard for the current turn (one row per CentaurTeam in the roster, computed over the true alive-snake set including invisible snakes per [04-REQ-071]).

When a new turn commits, the client receives updated `snake_states_view`, `item_lifetimes`, and `scoreboard_view` rows for the new turn, plus the updated `game_runtime.currentTurn`.

#### 2.12.2 Historical Scrubbing

Point-in-time query by turn number T:
- `snake_states_view WHERE turn = T` — snake states at turn T boundary (visibility-filtered per Section 2.9).
- `item_lifetimes WHERE spawnTurn <= T AND (destroyedTurn IS NULL OR destroyedTurn > T)` — items present at turn T.
- `time_budget_states WHERE turn = T` — CentaurTeam budgets at turn T.
- `turn_events WHERE turn = T` — events from turn T's resolution.
- `scoreboard_view WHERE turn = T` — per-team aggregate scoreboard at turn T's boundary.

All subject to visibility filtering via Views (Section 2.9) [04-REQ-048]. No game logic re-execution required [04-REQ-058].

#### 2.12.3 Turn-Transition Animation

To animate the transition from turn T to turn T+1:
- Subscribe to `snake_states_view WHERE turn = T+1` — post-resolution snake positions (visibility-filtered).
- Subscribe to `turn_events WHERE turn = T+1` — events that describe the transition.
- Client uses the events to animate intermediate states (movement paths, deaths, item pickups) before settling on the T+1 snapshot.

#### 2.12.4 Full-Game Catch-Up

A client connecting mid-game subscribes to all historical tables:
- `snake_states_view` (all turns) — initial bulk delivery of all historical snapshots (visibility-filtered per Section 2.9).
- `item_lifetimes` (all rows) — complete item history.
- `turns` (all rows) — turn timing.
- `time_budget_states` (all turns) — budget history.
- `turn_events` (all turns) — complete event history.
- `scoreboard_view` (all turns) — complete per-team aggregate scoreboard history.

Clients must never subscribe directly to raw `snake_states`, `staged_moves`, or `scoreboard` tables — only the corresponding views (`snake_states_view`, `staged_moves_view`, `scoreboard_view`) are permitted for client subscriptions. Clients must additionally never reconstruct team-level aggregate quantities (team score, alive-snake count, aggregate body length, win-condition state, or any analogous aggregate) by aggregating `snake_states_view` rows on the client side; `scoreboard_view` is the sole sanctioned channel for those aggregates and is the only channel that publishes contributions from invisible snakes (which `snake_states_view` filters out for non-allied subscribers per [04-REQ-047]). Client-side aggregation of `snake_states_view` would systematically under-count whenever an opponent snake is invisible.

SpacetimeDB delivers the initial snapshot as a bulk delivery, then switches to incremental updates as new turns commit. The client can render from turn 0 forward or jump to the current turn.

---

## Exported Interfaces

This section defines the minimal contract downstream modules consume. Any type not listed here is a module-internal detail.

### 3.1 `initialize_game` Parameter Types

Motivated by 04-REQ-013, 04-REQ-014, 04-REQ-017. Consumed by [05]'s provisioning orchestration.

```typescript
interface InitializeGameParams {
  readonly gameId: string
  readonly gameSeed: Uint8Array
  readonly gameEndCallbackUrl: string
  readonly gameOutcomeCallbackToken: string
  readonly board: {
    readonly boardSize: number            // BoardSize enum value
    readonly width: number
    readonly height: number
    readonly cells: ReadonlyArray<number>  // CellType values, y * width + x
  }
  readonly snakes: ReadonlyArray<{
    readonly snakeId: number
    readonly letter: string
    readonly centaurTeamId: string
    readonly body: ReadonlyArray<{ readonly x: number; readonly y: number }>
    readonly health: number
    readonly activeEffects: ReadonlyArray<{
      readonly family: string             // EffectFamily
      readonly state: string              // EffectState
      readonly expiryTurn: number
    }>
    readonly pendingEffects: ReadonlyArray<{
      readonly family: string
      readonly state: string
      readonly expiryTurn: number
    }>
    readonly lastDirection: number | null  // Direction enum value
    readonly alive: boolean
    readonly ateLastTurn: boolean
  }>
  readonly items: ReadonlyArray<{
    readonly itemId: number
    readonly itemType: number             // ItemType enum value
    readonly cell: { readonly x: number; readonly y: number }
  }>
  readonly gameRuntimeConfig: GameRuntimeConfig  // mirrors [01] §3.3 1:1
  readonly teams: ReadonlyArray<{
    readonly centaurTeamId: string              // CentaurTeamId — Convex centaur_teams._id
    readonly operatorUserIds: ReadonlyArray<string>  // UserId values for CentaurTeam members
  }>
}
```

`gameRuntimeConfig` is the canonical `GameRuntimeConfig` exported by [01] §3.3 (re-exported through [02]). The `foodSpawnRate`, `invulnPotionSpawnRate`, and `invisPotionSpawnRate` fields carry the "disabled when 0" sentinel semantics defined in [01-REQ-071] / [01-REQ-072] / [01-REQ-073]. Board-generation parameters (`boardSize`, `snakesPerTeam`, `hazardPercentage`, `fertileGround.*`) live on `GameOrchestrationConfig` and are consumed entirely by Convex. All enum values use the numeric encoding from [01] §3.1. The `gameSeed` is the root seed generated by Convex during `generateBoardAndInitialState()` — it must be passed through to STDB for turn-seed derivation.

**DOWNSTREAM IMPACT**: [05] must construct `InitializeGameParams` during game-start orchestration and pass it to the STDB instance via `POST /v1/database/{name}/call/initialize_game`. The `gameSeed`, `gameEndCallbackUrl`, and `gameRuntimeConfig` fields are included in [02] §3.4's `SpacetimeDbInstanceLifecycle.provision.inputFromConvex`.

### 3.2 Turn Event Storage Types

Motivated by 04-REQ-043, 04-REQ-044, 04-REQ-045. Consumed by [08]'s replay viewer and animation layer.

```typescript
type StoredTurnEvent = {
  readonly turn: number
  readonly eventType: TurnEventType
  readonly payload: TurnEventPayload
}

type TurnEventType =
  | 'snake_moved' | 'snake_died' | 'snake_severed'
  | 'food_eaten' | 'potion_collected'
  | 'food_spawned' | 'potion_spawned'
  | 'effect_applied' | 'effect_cancelled'
  | 'hazard_damage'

type TurnEventPayload =
  | { readonly kind: 'snake_moved'; readonly snakeId: number; readonly from: Cell;
      readonly to: Cell; readonly direction: number; readonly grew: boolean;
      readonly stagedBy: AgentId | null }
  | { readonly kind: 'snake_died'; readonly snakeId: number;
      readonly cause: DeathCause; readonly killerSnakeId: number | null;
      readonly location: Cell }
  | { readonly kind: 'snake_severed'; readonly attackerSnakeId: number;
      readonly victimSnakeId: number; readonly contactCell: Cell;
      readonly segmentsLost: number }
  | { readonly kind: 'food_eaten'; readonly snakeId: number;
      readonly cell: Cell; readonly healthRestored: number }
  | { readonly kind: 'potion_collected'; readonly snakeId: number;
      readonly cell: Cell; readonly potionType: number;
      readonly affectedTeammateIds: ReadonlyArray<number> }
  | { readonly kind: 'food_spawned'; readonly itemId: number; readonly cell: Cell }
  | { readonly kind: 'potion_spawned'; readonly itemId: number;
      readonly cell: Cell; readonly potionType: number }
  | { readonly kind: 'effect_applied'; readonly snakeId: number;
      readonly family: string; readonly state: string;
      readonly expiryTurn: number }
  | { readonly kind: 'effect_cancelled'; readonly snakeId: number;
      readonly family: string; readonly reason: string }
  | { readonly kind: 'hazard_damage'; readonly snakeId: number;
      readonly cell: Cell; readonly damageApplied: number;
      readonly resultingHealth: number }

interface Cell { readonly x: number; readonly y: number }

type DeathCause =
  | 'wall' | 'self_collision' | 'body_collision'
  | 'head_to_head' | 'starvation' | 'hazard'

type AgentId = string
```

The stored event payload shapes match [01] §2.11's `TurnEvent` union plus the module 04 addition of `hazard_damage` (see resolved 04-REVIEW-003). `Cell` and `DeathCause` are re-exported from [01] §3.1–3.2. `AgentId` is a plain string — the Convex record ID of either a CentaurTeam (`centaur_teams._id`) or an Operator (`users._id`). The `payloadJson` column in the `turn_events` table stores the `TurnEventPayload` variant serialized as JSON.

**DOWNSTREAM IMPACT**: [08]'s replay viewer and animation layer must handle all 10 event kinds, including `hazard_damage`. The canonical ordering (phase → event-type class → ascending snake/item ID) is derivable from the event data per the deterministic rules in §2.8 [04-REQ-045].

### 3.3 Game-End Notification Payload

Motivated by 04-REQ-061a. Consumed by [05]'s game-end orchestration.

```typescript
interface GameEndNotification {
  readonly gameId: string
  readonly outcome: GameOutcome
  readonly finalTurn: number
  readonly replayData: ReplayData | null
}

interface ReplayData {
  readonly game_config: GameConfigRow
  readonly board_state: ReadonlyArray<BoardStateRow>
  readonly centaur_team_roster: ReadonlyArray<CentaurTeamRosterRow>
  readonly centaur_team_permissions: ReadonlyArray<CentaurTeamPermissionsRow>
  readonly turns: ReadonlyArray<TurnRow>
  readonly snake_states: ReadonlyArray<SnakeStateRow>
  readonly item_lifetimes: ReadonlyArray<ItemLifetimeRow>
  readonly staged_moves: ReadonlyArray<StagedMoveRow>
  readonly time_budget_states: ReadonlyArray<TimeBudgetStateRow>
  readonly turn_events: ReadonlyArray<TurnEventRow>
  readonly scoreboard: ReadonlyArray<ScoreboardRow>
}

type GameOutcome =
  | { readonly kind: 'victory'; readonly winnerCentaurTeamId: string;
      readonly scores: Record<string, number> }
  | { readonly kind: 'draw'; readonly tiedCentaurTeamIds: ReadonlyArray<string>;
      readonly scores: Record<string, number> }
  | { readonly kind: 'error'; readonly reason: string }
```

`GameOutcome` matches [01] §3.4 but uses `Record<string, number>` for scores (JSON-serializable form of `ReadonlyMap<CentaurTeamId, number>`). The `error` variant has no `scores` field (scores are meaningless for interrupted games); its `reason` field is a human-readable string describing the interruption cause. `finalTurn` is the turn number at which the terminal outcome was detected; for error cases, this is the last successfully resolved turn (may be 0 if the error occurred before any turn was resolved).

`ReplayData` bundles the complete historical record from all STDB tables (Section 2.11). For normal outcomes, `replayData` is non-null and contains the full game history. For error outcomes, `replayData` is `null` (replay is not meaningful for interrupted games). The row types (`GameConfigRow`, `BoardStateRow`, etc.) are the table schemas defined in Section 2.

**DOWNSTREAM IMPACT**: [05] must implement an HTTP action endpoint that receives this payload at the `gameEndCallbackUrl` registered during `initialize_game`. The endpoint authenticates the caller by verifying the Convex-signed callback token's RS256 signature and claims (no stored-token comparison) and triggers game-end orchestration (score recording, replay persistence from the bundled `replayData`, and immediate STDB instance teardown). The endpoint must handle both normal outcomes (victory, draw) and error outcomes appropriately.

### 3.4 WASM Module Deployment Artifact Contract

Motivated by 04-REQ-001, [02-REQ-035].

The SpacetimeDB game module is compiled to a WebAssembly binary using SpacetimeDB's build toolchain (`spacetimedb build` or equivalent). The WASM binary is the deployment artifact that is:

1. **Compiled** from TypeScript source that imports the shared engine codebase (`@snek-centaur/engine`) and SpacetimeDB's TypeScript module SDK.
2. **Uploaded** to Convex file storage by the platform build pipeline at build/deploy time.
3. **Retrieved** by Convex from file storage at game-creation time.
4. **Submitted** to the self-hosted SpacetimeDB management API (`POST /v1/database` with the WASM binary in the request body) to create a new database instance with the module already deployed.

The WASM binary encapsulates the complete game engine module: all table schemas, all reducers (`initialize_game`, `stage_move`, `declare_turn_over`, `resolve_turn`, `check_clock_expiry`), all procedures (`notify_game_end`), all lifecycle callbacks (`client_connected`, `client_disconnected`), and the embedded shared engine codebase.

**DOWNSTREAM IMPACT**: [02] must describe the WASM compilation target and build pipeline in its design (§2.16b). [05] must store the WASM binary in Convex file storage and retrieve it during game provisioning.

### 3.5 DOWNSTREAM IMPACT Notes

1. **[05] must construct `InitializeGameParams` and call `initialize_game` via HTTP API.** The parameter format (Section 3.1) includes the game seed, game-end callback URL, game-outcome callback token, pre-computed initial state, dynamic gameplay params, and CentaurTeam roster. [05] must include all fields; omission of the game seed would break turn resolution determinism.

2. **[05] must implement a game-end notification HTTP action endpoint.** The endpoint receives `GameEndNotification` (Section 3.3) and triggers game-end orchestration. It must authenticate the caller by validating the Convex-signed callback token presented as a Bearer token.

3. **[05] must retrieve the complete historical record at game end.** Convex calls the STDB instance's HTTP API to read all tables (Section 2.11). The module owner bypasses all visibility filtering (including private tables and raw tables behind Views) and returns the complete unfiltered record including invisible snakes.

4. **[05] must store the WASM binary in Convex file storage and use it for provisioning.** The binary is uploaded by the build pipeline and retrieved at game-creation time for the single-step `POST /v1/database` provisioning (Section 3.4).

5. **[08] must handle all 10 turn event kinds in its renderers.** The closed event set (Section 3.2) includes `hazard_damage` as a module 04 addition. The canonical ordering is derivable from event data per the deterministic rules in §2.8.

6. **[08] must design subscription queries per Section 2.12.** The four subscription patterns (live view, historical scrubbing, turn-transition animation, full-game catch-up) define the client-side data access contract. All subscriptions are subject to visibility filtering: for `snake_states` and `staged_moves`, clients must subscribe to the corresponding visibility Views (`snake_states_view`, `staged_moves_view`) rather than the raw tables. Other tables are subscribed to directly.

7. **[05] must pass the game seed to `initialize_game`.** The game seed is generated by Convex during `generateBoardAndInitialState()` and must be forwarded to STDB for per-turn seed derivation. This extends the parameter set of [02] §3.4's `SpacetimeDbInstanceLifecycle.provision.inputFromConvex`.

---


## REVIEW Items

All REVIEW items for this module (all resolved) have been migrated to [`04-stdb-engine.review.md`](04-stdb-engine.review.md).
