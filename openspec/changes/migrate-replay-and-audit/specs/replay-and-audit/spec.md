## Purpose

Reliving and auditing a finished game: the turn-keyed record a game's
instance accumulates while the game runs, the once-at-game-end export and
its persistence as a replay, the permanent attribution of every recorded
action to the agent that performed it, the team's sub-turn action log, the
reconstruction guarantee that ties the two logs together, the unified
replay viewer with its board-level and team-perspective modes, and the
public readability of finished games. This capability owns what the
platform can prove about a game after it ends — what is recorded, who may
read it, and how it is relived. Watching a game while it runs belongs to
the live-observation story; acting in one to the operator, pacing, and
bot stories; the lifecycle bracket that provisions and tears down the
instance to the lifecycle story.

Depends on: game-engine, identity-and-authorization, game-lifecycle, live-game-observation, operator-control, turn-pacing, decision-transparency.

## ADDED Requirements

### Requirement: replay-and-audit/turn-keyed-game-record
A game's instance SHALL accumulate, for the whole life of the game, a turn-keyed historical record from which every completed turn's full observable state is directly queryable — without re-executing any rule and without consulting any other runtime. The record SHALL comprise at minimum: a snapshot of every snake's full state at each turn boundary; every item's lifetime as its spawn turn and its consumed-or-destroyed turn; the board layout, written once at initialization and never after; each team's post-turn time budget together with how its turn was declared over — the declaration kind, with the timestamp for explicit declarations (turn-pacing/turn-declaration); each turn's wall-clock start and the wall-clock moment its resolution began; and every turn event, attributed to the turn that produced it. Retention SHALL be unbounded for the instance's life: no cap, eviction, or windowing ever drops a completed turn from the record.

#### Scenario: #items-derivable-at-any-turn
- **WHEN** the set of items on the board at some past turn is needed
- **THEN** it is directly derivable from the spawn/destroyed turn pairs alone — items present from the start carry spawn turn 0, and nothing requires replaying spawns

#### Scenario: #resolution-takes-time
- **WHEN** per-turn timing is read from the record
- **THEN** both the turn's start and its resolution's start are present, so the time resolution itself took is measurable — nothing in the record assumes resolution is instantaneous

#### Scenario: #unbounded-retention
- **WHEN** a game runs to a very high turn count
- **THEN** every early turn remains directly queryable in-instance for the instance's whole life — memory pressure is an implementation concern, never a licence to evict history

### Requirement: replay-and-audit/append-only-history
Every historical record of a game SHALL be append-only: once the instance's resolving transaction commits a game-record row or event, and once a team action-log entry is written, no committed record is ever mutated or deleted — not for later discoveries, corrections, or any other reason — and previously readable historical state SHALL keep reading identically as new records append. Sole exception: an item's destroyed-turn field is stamped exactly once, from empty, by the later turn that consumes or destroys the item.

#### Scenario: #no-retroactive-correction
- **WHEN** a defect is discovered in an already-committed turn's records
- **THEN** the committed records stand unchanged — historical correctness is the resolving transaction's responsibility at commit time, never a later rewrite's

#### Scenario: #past-reads-stable
- **WHEN** the same past turn is read before and after further turns commit
- **THEN** the results are identical — appending new history never perturbs what was already readable

#### Scenario: #the-single-stamp
- **WHEN** an item is consumed or destroyed
- **THEN** its lifetime record's destroyed-turn is written once, from empty — the one permitted touch of a previously written row, and it is never re-stamped

#### Scenario: #action-log-entries-never-corrected
- **WHEN** a team action-log entry turns out to be mistaken
- **THEN** it can be neither edited nor deleted — corrections are not supported, and every reader treats the log as append-only fact

### Requirement: replay-and-audit/replay-sufficiency
The game record SHALL be sufficient to reconstruct a complete replay of the game — every board state, every item lifetime, every turn event, and every staged-move attribution — without consulting any runtime other than the instance that produced it. Given identical seeds, configuration, and staged-move sequence with identical timing, the accumulated record SHALL be identical (game-engine/determinism).

#### Scenario: #nothing-else-consulted
- **WHEN** a complete replay is reconstructed from the record
- **THEN** no other runtime, live subscription, or side channel is needed — the record alone carries everything a replay requires

#### Scenario: #bit-identical-reproduction
- **WHEN** a game is re-run from the same seeds, configuration, and staged-move sequence
- **THEN** the resulting record is identical to the original — determinism is a property of the record, externally verifiable record-to-record

### Requirement: replay-and-audit/turn-event-record
The record's turn events SHALL form a closed enumeration — the engine's event vocabulary (game-engine/turn-events) plus a hazard-damage event for each snake that took hazard damage and survived the turn — with no extensibility mechanism: a new event kind exists only by deliberate revision of this requirement. Each stored event SHALL carry enough information for a replay or animation client to visualise its outcome without re-executing resolution and without diffing successive snapshots.

#### Scenario: #death-carries-its-cause
- **WHEN** a snake dies
- **THEN** its death event states the cause explicitly — with contributing damage sources and the responsible snake where applicable — so no client infers the cause from an alive-to-dead transition between snapshots

#### Scenario: #hazard-damage-never-double-counted
- **WHEN** a snake dies with hazard damage contributing
- **THEN** only the death event is recorded, carrying hazard among its sources — hazard-damage events exist for survivors only, so no consumer counts the same damage twice

#### Scenario: #no-new-kinds-by-extension
- **WHEN** a new observable outcome is proposed for the record
- **THEN** it enters only by revising the closed set — never through a generic, custom, or extensible event kind

### Requirement: replay-and-audit/canonical-event-order
A turn's events SHALL be a set carrying a canonical representation order that is derived entirely from the events' own data — event-type class, then the subject's identifier — never stored as a separate ordering datum, and stable across independent replays of the same game. The order is representational only: it asserts no causal or temporal relation within the turn, and it imposes no delivery-order obligation on any live channel (live-game-observation/observation-use-cases).

#### Scenario: #derived-not-stored
- **WHEN** a consumer needs a turn's events in canonical order
- **THEN** it derives the order from the event data alone — no stored sequence column exists, so nothing can drift out of step with the derivation rule

#### Scenario: #stable-across-replays
- **WHEN** the same game is reproduced independently
- **THEN** every turn's canonical order is identical, so two records of the same game compare bit-exactly

#### Scenario: #order-implies-no-causality
- **WHEN** one event precedes another in canonical order
- **THEN** nothing about within-turn timing or causation follows — the turn's outcomes were committed atomically as one set

### Requirement: replay-and-audit/connect-time-attribution
The game instance SHALL resolve every admitted connection to an agent value — the team identity for a bot connection, the operator's identity for an operator connection — at the moment of admission, and SHALL retain an attribution entry per admitted connection for the instance's whole life. That agent value SHALL be carried untouched wherever the connection's actions are recorded: the runtime never interprets, maps, or substitutes it — during play or during export. Attribution entries SHALL never be mutated or deleted: disconnection writes nothing, and a reconnecting client is admitted as a fresh entry, so every historical attribution remains resolvable forever.

#### Scenario: #resolved-at-connect-never-later
- **WHEN** any recorded action must be attributed
- **THEN** the agent value resolved at that connection's admission is used as-is — no later step re-derives, translates, or reinterprets attribution, and no raw connection identifier ever stands in for it

#### Scenario: #disconnect-erases-nothing
- **WHEN** a connection ends mid-game — network cut, client shutdown, or boot
- **THEN** its attribution entry and every action already attributed through it remain intact and resolvable

#### Scenario: #reconnect-appends-fresh
- **WHEN** a client reconnects
- **THEN** it is admitted under a fresh attribution entry while prior entries persist — actions from before and after the drop each resolve through their own admission

### Requirement: replay-and-audit/staged-move-attribution
Every entry in the staged-move log (operator-control/staged-move-log) SHALL permanently record the agent that wrote it, the wall-clock time it was accepted, and the turn it was staged in — so who staged what, and when, is reconstructible at any sub-turn moment of the game. A movement event SHALL carry the agent whose staged move was consumed — distinguishing bot-originated from operator-originated moves — and SHALL carry no agent when the move was determined by the engine's fallback (game-engine/movement); a missing agent has exactly that one meaning.

#### Scenario: #sub-turn-staging-history
- **WHEN** a team's within-turn deliberation is audited
- **THEN** the log yields the full sequence of staged moves with writer and time — including superseded entries — not merely the moves that resolution consumed

#### Scenario: #bot-and-operator-distinguishable
- **WHEN** the team's automated player staged the consumed move
- **THEN** the attribution is the team's identity — never any individual human — while an operator-staged move names that operator, so bot and human play are distinguishable everywhere the record is read

#### Scenario: #fallback-moves-attributed-to-no-one
- **WHEN** a snake moves by fallback because nothing was staged for it that turn
- **THEN** the movement event's attribution is empty — fallback is the sole case with no staging writer

### Requirement: replay-and-audit/agent-form-persistence
The persisted game record SHALL carry attribution exclusively as agent values — never raw connection identities — and the platform SHALL verify this as a defensive check while persisting. Persisted attribution is append-only historical fact bound to the game's roster snapshot (identity-and-authorization/roster-snapshot-binding): no later change — roster edits, team archival, account changes — ever erases or rewrites who did what in a finished game.

#### Scenario: #defensive-check-at-persistence
- **WHEN** any attribution in the record being persisted is not in agent form
- **THEN** persistence treats it as a defect to surface, rather than persisting an identity no downstream reader could interpret

#### Scenario: #removed-member-still-attributed
- **WHEN** a human is removed from the team's roster after a game has finished
- **THEN** that game's record still attributes their actions to them — historical attribution derives from the game's snapshot, never from current membership

### Requirement: replay-and-audit/once-at-end-export
The complete game record SHALL leave the game instance exactly once, at game end, bundled into the terminal notification (game-lifecycle/finish-notification); during play, no game or replay state is posted to any external system, per-turn or otherwise. The export SHALL be retrievable only under the platform's own authority — a privilege distinct from every gameplay admission — and SHALL be complete: visibility filtering is bypassed for it, so invisible snakes' states, the full staged-move log, and the attribution records are all included regardless of any team's perspective. The export SHALL include the per-game seed. A game that ends in an error outcome SHALL export no replay data (game-lifecycle/finish-notification#error-outcome-still-finishes).

#### Scenario: #nothing-leaves-per-turn
- **WHEN** a game is being played
- **THEN** the instance transmits no gameplay or replay state to any external system — the record accumulates in-instance and crosses the boundary once, at the end

#### Scenario: #platform-only-retrieval
- **WHEN** any gameplay-admitted connection — operator, bot, spectator, or coach — attempts to retrieve the bulk export
- **THEN** it is refused; only the platform runtime's distinct privilege retrieves the export

#### Scenario: #filter-bypassed-for-export
- **WHEN** the export is produced for a game in which snakes were invisible
- **THEN** it contains their full state at every turn — the export is the whole truth, because downstream replay serves every perspective a viewer later chooses

#### Scenario: #seed-secret-live-exported-post
- **WHEN** the game runs
- **THEN** no game client can observe the seed (game-engine/determinism) — yet the seed is in the export, so reproducibility is verifiable once the game is over

#### Scenario: #error-outcome-exports-nothing
- **WHEN** the instance reports an error outcome
- **THEN** the notification carries no replay data and no scores — a game that failed is recorded as failed, not as a playable replay

### Requirement: replay-and-audit/replay-persistence
The platform SHALL persist the exported record as the game's replay, bound to the game's persistent record, before the instance is torn down (game-lifecycle/teardown-after-persistence) — and SHALL NOT begin persisting before the instance has signalled its terminal state. Once persisted, the replay — and the game's team-experience records: the action log and the display-state snapshots — SHALL survive teardown for the life of the game record (game-lifecycle/game-record); replay viewing never consults a game instance.

#### Scenario: #not-before-terminal-signal
- **WHEN** a game is still in play
- **THEN** no replay persistence begins — persistence starts only after the instance's record is final, so no half-game is ever persisted as a replay

#### Scenario: #viewing-never-consults-an-instance
- **WHEN** a replay is viewed after the game's instance is long gone
- **THEN** everything works from persisted data — no code path from viewing reaches for a live instance, torn down or otherwise

#### Scenario: #team-experience-outlives-teardown
- **WHEN** the instance is torn down after the game finishes
- **THEN** the game's action log, display-state snapshots, and other game-scoped team records are untouched — teardown removes the instance, never the audit trail

### Requirement: replay-and-audit/team-action-log
The platform SHALL keep, per game, a team action log recording state-changing team-experience events at wall-clock resolution finer than turn granularity. Each entry SHALL carry at minimum: the game, the turn, the acting identity and its kind (operator, or the team's server acting as its bot), and a wall-clock timestamp. The recorded categories SHALL include at minimum: snake selection and deselection; manual-mode toggles; Drive addition and removal; heuristic weight and activation changes, carrying both old and new values; temperature-override changes; per-operator tempo changes (turn-pacing/operator-tempo) and Captain boots (operator-control/captain-boot); team-side turn submissions; and computed-display-state snapshots (decision-transparency/computed-display-state). Move staging SHALL NOT be an action-log category: staged moves are recorded solely in the game instance's staged-move log (operator-control/staged-move-log).

#### Scenario: #sub-turn-resolution
- **WHEN** several team actions occur within one turn
- **THEN** each is a distinct entry with its own wall-clock timestamp — the log resolves the order of events inside a turn, not just across turns

#### Scenario: #tempo-and-boot-are-clock-anchored
- **WHEN** tempo changes, boots, and turn submissions are recorded
- **THEN** their entries are anchored to wall-clock time, not turn keys — so the active-operator set and each operator's tempo are reconstructible at any moment, regardless of turn boundaries

#### Scenario: #weight-change-carries-before-and-after
- **WHEN** a heuristic's weight or activation changes
- **THEN** the entry carries the full old and new values — each entry is self-sufficient evidence of its transition, never a delta that needs neighbours to interpret

#### Scenario: #move-staging-excluded
- **WHEN** a move is staged — by an operator or by the bot
- **THEN** no action-log entry is written for it; the instance's staged-move log is the single home, where the authoritative act and its record cannot diverge

### Requirement: replay-and-audit/actors-write-own-entries
Every action-log entry SHALL be written by the actor it describes, under that actor's own credential: operators write their own entries, and the team's hosting server writes its own — computed-display-state snapshots exclusively so (decision-transparency/hosting-server-sole-writer), with every published snapshot producing its snapshot-category entry, and the server never writing entries for operator-originated events. Every mutation of the team's recorded state SHALL write its action-log entry in the same transaction as the mutation itself, so the log is a faithful record of exactly the mutations that succeeded.

#### Scenario: #dropped-entry-means-no-mutation
- **WHEN** an action's log write fails
- **THEN** the paired state change also did not commit — there is no state change without its entry and no entry without its state change, so the replay can never ghost or skip

#### Scenario: #server-never-ghost-writes
- **WHEN** an operator selects a snake, toggles a mode, or edits a Drive
- **THEN** the entry is written by that operator's own credentialed client — never brokered through, or back-filled by, the team's server

#### Scenario: #every-snapshot-logged
- **WHEN** the team's server publishes a computed-display-state snapshot
- **THEN** a corresponding snapshot-category entry exists — the display record and the log never disagree about what was published when

### Requirement: replay-and-audit/experience-reconstruction
The persisted replay and the team action log together SHALL suffice to reconstruct a participating team's full experience at any wall-clock moment of the game: which snake each operator had selected, each snake's manual-mode flag, its active Drives with targets and weights, its heuristic activations and weight overrides, its temperature override, its display state as last written before that moment, the staged moves and who staged them, and the active-operator set with each operator's tempo. The action log SHALL never be a source of authoritative game state: board contents, snake bodies, and outcomes reconstruct from the game record alone.

#### Scenario: #any-moment-not-just-boundaries
- **WHEN** a moment strictly inside a turn is reconstructed
- **THEN** the team's state at that instant — mid-deliberation, between actions — is recoverable, because every input is either turn-keyed record or clock-stamped log entry

#### Scenario: #selection-history-from-the-log-alone
- **WHEN** a finished game's selection history is reconstructed
- **THEN** it comes entirely from the log's selection events — live selection state was cleared at game end (operator-control/exclusive-selection#cleared-at-finish), and nothing depends on it having survived

#### Scenario: #board-truth-from-the-game-record-only
- **WHEN** any consumer needs board contents, snake bodies, collisions, or spawns
- **THEN** it reads the game record — deriving authoritative game state from the action log is a defect even where the log would happen to suffice

### Requirement: replay-and-audit/finished-games-public
Once a game is finished, its full record — the board-level replay and every participating team's within-turn data: action-log entries, display-state snapshots, and staged-move history — SHALL be readable by every authenticated user. The replay viewer SHALL expose a direct-link affordance producing a URL that takes any authenticated user straight to that game's replay. A game still being played SHALL NOT be reachable through the replay surface at all: pre-finish access is the live-observation boundary's business (live-game-observation/team-private-live-state), and finishing is the moment competitive secrecy ends.

#### Scenario: #finished-means-open
- **WHEN** a game finishes
- **THEN** both teams' full within-turn operational data becomes readable by any authenticated user — post-game auditability outranks secrecy, deliberately and completely

#### Scenario: #direct-link-grants-any-finished-replay
- **WHEN** any authenticated user opens a direct link to any finished game
- **THEN** the replay opens for them, whatever teams played — history listings scope discovery, never access

#### Scenario: #live-games-not-on-the-replay-surface
- **WHEN** a game is still in play
- **THEN** the replay surface refuses it entirely — no partial replay, no early peek at another team's working data through the replay path

### Requirement: replay-and-audit/team-game-history
The application SHALL provide, per hosted team, a game-history listing of the team's completed games in reverse chronological order, listing a game for a user exactly when they were a member of the team at the time of the game (per the game's roster snapshot) or are a current member — games of unrelated teams are not listed. Each listing SHALL show at minimum the room, date, opposing teams, the team's result, and the final scores — the normalised score as the headline value with par 1.0 as the visual reference and real-valued display (game-engine/scoring), and the team's aggregate body length as a secondary stat. Selecting a listing SHALL open that game's replay viewer, defaulting to the team perspective.

#### Scenario: #historical-or-current-membership
- **WHEN** a user joined the team after a game was played, or played in it and has since left
- **THEN** the game is listed for them either way — current members see the team's past, and past participants keep their own

#### Scenario: #listing-is-discovery-not-access
- **WHEN** a game involves no team the user has any relationship with
- **THEN** it simply is not listed for them — while the finished game itself stays reachable by direct link, because the listing rule scopes discovery only

#### Scenario: #normalised-score-headline
- **WHEN** a listing renders its scores
- **THEN** the normalised score leads, displayed as the real number it is against par 1.0, with aggregate length as the secondary stat — never a raw segment count presented as the score

### Requirement: replay-and-audit/unified-replay-viewer
The application SHALL present replays through one unified viewer — never separate platform-side and team-side viewers — available for any finished game with a persisted replay, combining two modes in a single interface: board-level replay at turn granularity, open to every authenticated user for every finished game; and team-perspective replay at sub-turn granularity, offered only for games in which the viewing human participated as a team member, scoped to that team's experience.

#### Scenario: #one-viewer-not-two
- **WHEN** any replay is opened — from a team's history, a profile, or a direct link
- **THEN** it is the same unified viewer; board-level and team-perspective are modes within it, not separate applications to maintain in parallel

#### Scenario: #team-perspective-participants-only
- **WHEN** a user who was on no participating team opens a finished game
- **THEN** they get board-level replay; the team-perspective mode is not offered to them — an interface-scoping rule that narrows no data readability

#### Scenario: #finished-with-replay-only
- **WHEN** a game is unfinished, or finished with no persisted replay — an error outcome
- **THEN** the viewer does not open it; the replay surface serves exactly the games that have a replay to serve

### Requirement: replay-and-audit/board-level-replay
Board-level mode SHALL source everything it displays from the persisted replay alone — never a game instance — rendering, at the selected turn: the board terrain, snakes, items, hazards, and fertile tiles; the per-team scoreboard with the normalised score as headline at par 1.0 and aggregate length secondary (the recorded rows of live-game-observation/scoreboard-sole-aggregate-authority); and a per-turn event log listing the turn's events from the closed set, visually consistent with live spectating (live-game-observation/spectator-live-experience). Board-level mode SHALL NOT display anything derived from the team action log: no operator selections or shadows, and no display-state, worst-case, or heuristic data — for any team, the viewer's own included.

#### Scenario: #functional-after-teardown
- **WHEN** the source game's instance was torn down long ago
- **THEN** board-level replay works in full — every displayed datum came from the persisted replay

#### Scenario: #per-turn-event-log
- **WHEN** a turn is selected
- **THEN** its events — deaths with causes, food and potion consumption, severings, spawns, effect changes, hazard damage — are listed from the record's closed enumeration, with no kind unrepresentable

#### Scenario: #no-team-data-in-board-mode
- **WHEN** board-level mode renders any moment of the game
- **THEN** nothing sourced from the action log appears — a viewer wanting the team experience must be in team-perspective mode, where its participant scoping applies

### Requirement: replay-and-audit/team-perspective-replay
Team-perspective mode SHALL present the live operator interface, read-only, over reconstructed state at the scrubbed moment (replay-and-audit/experience-reconstruction): every mutating affordance — staging, Drive edits, manual-mode and tempo toggles, boots, submission — disabled or absent, while the state-inspection affordances — direction preview, worst-case world preview, decision breakdown (decision-transparency/worst-case-preview, decision-transparency/decision-breakdown) — remain fully functional. Historical operator selections SHALL render as coloured shadows in the same per-operator colours used in live play; an operator not connected at the scrubbed moment produces no shadow.

#### Scenario: #live-ui-read-only
- **WHEN** a participant replays their game
- **THEN** they navigate the interface they played in — same components, same layout — with every write inert and every inspection alive, so live-play familiarity carries over whole

#### Scenario: #shadows-in-original-colours
- **WHEN** the scrubbed moment is rendered
- **THEN** each snake selected at that moment carries its holder's shadow in that operator's live-play colour, and operators who were not connected then cast no shadow

### Requirement: replay-and-audit/replay-visibility-bound
Team-perspective replay SHALL reveal nothing about opposing teams beyond what the viewed team's filtered live view showed at that original moment (live-game-observation/invisibility-filtering): an opposing snake invisible to the team at a historical moment stays invisible at that moment in the team-perspective replay, even though the persisted replay behind the viewer holds the full record.

#### Scenario: #invisible-then-invisible-now
- **WHEN** a participant scrubs to a moment at which an opponent's snake was invisible to their team
- **THEN** the team-perspective replay elides it at that moment — the mode replays the experience as lived, and the full record never leaks through the perspective

#### Scenario: #board-mode-tells-the-whole-truth
- **WHEN** the same viewer switches to board-level mode at that moment
- **THEN** the snake is shown — a finished game's full record is open (replay-and-audit/finished-games-public); the team-perspective bound is fidelity to the lived view, not continued secrecy

### Requirement: replay-and-audit/unified-timeline
One timeline control SHALL govern scrubbing for both viewer modes, providing play, pause, a scrubber, a playback-speed control labelled with the active mode's unit, and a toggle between two scrub modes, defaulting to Per-Turn; the chosen mode and speed SHALL be client-local viewer state, never persisted to the platform. In **Per-Turn** mode, turns are equidistant ticks, scrubbing snaps to end-of-turn states — the state of the world the team saw while declaring — and playback advances in turns per second. In **Timeline** mode, the axis is the game's real wall-clock span with turn boundaries marked at their actual declaration times, scrubbing is continuous in clock time, and playback runs at multiples of real time. Keyboard scrubbing SHALL match the active mode's granularity: whole turns in Per-Turn mode; fine time steps and turn-marker jumps in Timeline mode.

#### Scenario: #snap-to-what-the-team-saw
- **WHEN** the scrubber moves in Per-Turn mode
- **THEN** it lands only on end-of-turn states — no intra-turn position is addressable in this mode, and each stop is a state the team actually deliberated over

#### Scenario: #unequal-turns-render-unequal
- **WHEN** turns took very different real durations under the clock
- **THEN** Timeline mode spaces their markers proportionally to real time — the game's actual rhythm is visible, never flattened to equidistant turns

#### Scenario: #mode-and-speed-are-local
- **WHEN** a viewer picks a scrub mode and speed
- **THEN** the choice lives in their client alone — restored within their session, invisible to other viewers, and never written to the platform

### Requirement: replay-and-audit/replay-inspection
Inspection in the replay viewer SHALL be purely client-local: the viewer may inspect any snake on the viewed team at any scrubbed moment — regardless of which operator, if any, held it then — with at most one inspected snake per client. Inspection SHALL write nothing to any store, produce no selection shadow, never displace or alter any reconstructed selection, and be invisible to every other client.

#### Scenario: #concurrent-inspectors-never-conflict
- **WHEN** several users replay the same game simultaneously, each inspecting different snakes
- **THEN** none affects any other — no shared state exists for their inspections to conflict over

#### Scenario: #inspect-regardless-of-history
- **WHEN** the scrubbed moment shows a snake held by some operator
- **THEN** the viewer can still inspect it — historical exclusivity constrained the game's operators, not today's auditor

#### Scenario: #shadows-unaffected
- **WHEN** a snake is inspected
- **THEN** the reconstructed selection shadows keep rendering exactly as recorded, alongside the inspection — inspection adds a local lens and removes nothing

### Requirement: replay-and-audit/replay-binding-mutation-free
The data path by which replayed state reaches the interface SHALL offer no mutation surface at all: mutation is structurally absent from the replay binding — not present but refused — so nothing invocable exists for a replay client to write through, and no runtime guard is ever what stands between a replay viewer and a write.

#### Scenario: #absence-not-guard
- **WHEN** the replay binding is examined
- **THEN** mutation operations are not merely rejected at call time — they cannot be expressed against it at all, so there is no guard to forget, bypass, or get wrong

#### Scenario: #read-only-is-not-per-component
- **WHEN** interface components render replayed state
- **THEN** their read-only behaviour comes from the binding offering no writes — not from each component keeping its own replay-aware branch — so a component that never heard of replay still cannot mutate anything
