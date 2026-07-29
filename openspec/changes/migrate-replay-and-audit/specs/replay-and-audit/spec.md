## Purpose

Reliving and auditing a finished game: the once-at-game-end export of the
record a game's own runtime accumulated and its persistence as a replay, the
team's sub-turn action log and the discipline that every actor writes its
own entries, the reconstruction guarantee that ties the two logs together,
the unified replay viewer with its board-level and team-perspective modes,
and the public readability of finished games. This capability owns what the
platform can prove about a game after it ends — what leaves the instance,
who may read it, and how it is relived. What the record contains and how the
resolving transaction accumulates it belong to the game-runtime story;
watching a game while it runs to the live-observation story; acting in one
to the operator, pacing, and bot stories; the lifecycle bracket that
provisions and tears down the instance to the lifecycle story.

Depends on: game-engine, game-runtime, global-invariants, identity-and-authorization, game-lifecycle, live-game-observation, operator-control, turn-pacing, decision-transparency, application-shell.

## ADDED Requirements

### Requirement: replay-and-audit/append-only-history
Depends on: global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants, global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game.

Every persistent historical record the platform keeps of a game SHALL be append-only: once a team action-log entry is written, and once a game's exported record is persisted, neither is ever mutated or deleted — not for later discoveries, corrections, or any other reason — and previously readable historical state SHALL keep reading identically as new records append. The append-only discipline over the rows a game's own runtime commits is that runtime's own, on the same terms.

#### Scenario: #action-log-entries-never-corrected
- **WHEN** a team action-log entry turns out to be mistaken
- **THEN** it can be neither edited nor deleted — corrections are not supported, and every reader treats the log as append-only fact

#### Scenario: #persisted-replay-is-final
- **WHEN** a defect is discovered in an already-persisted replay
- **THEN** the persisted record stands unchanged — its correctness was the resolving transaction's responsibility at commit time, never a later rewrite's, and the platform has no path to amend it

### Requirement: replay-and-audit/agent-form-persistence
Depends on: identity-and-authorization/roster-snapshot-binding, global-invariants/authenticated-unambiguous-identity#instance-team-ids-resolve-uniquely, game-runtime/connect-time-attribution.

The persisted game record SHALL carry attribution exclusively as agent values — never raw connection identities — and the platform SHALL verify this as a defensive check while persisting. Persisted attribution is append-only historical fact bound to the game's roster snapshot: no later change — roster edits, team archival, account changes — ever erases or rewrites who did what in a finished game.

#### Scenario: #defensive-check-at-persistence
- **WHEN** any attribution in the record being persisted is not in agent form
- **THEN** persistence treats it as a defect to surface, rather than persisting an identity no downstream reader could interpret

#### Scenario: #removed-member-still-attributed
- **WHEN** a human is removed from the team's roster after a game has finished
- **THEN** that game's record still attributes their actions to them — historical attribution derives from the game's snapshot, never from current membership

### Requirement: replay-and-audit/once-at-end-export
Depends on: game-lifecycle/finish-notification, global-invariants/game-instance-hermeticity#no-egress-before-game-end, global-invariants/team-granularity-authorization, game-engine/determinism, game-runtime/turn-keyed-game-record, game-runtime/replay-sufficiency.

The complete game record SHALL leave the game instance exactly once, at game end, bundled into the terminal notification — the instance's one sanctioned egress. The export SHALL be retrievable only under the platform's own authority — a privilege distinct from every gameplay admission — and SHALL be complete: every accumulated part travels, including each completed turn's per-team aggregate rows, the full staged-move log, and the attribution records; and visibility filtering is bypassed for it, so invisible snakes' states are included regardless of any team's perspective. The export SHALL include the per-game seed. A game that ends in an error outcome SHALL export no replay data.

#### Scenario: #nothing-leaves-per-turn
- **WHEN** the accumulated record crosses out of the instance
- **THEN** it crosses in exactly one transmission, at game end — no incremental, per-turn, or partial export path exists for any part of it to travel through

#### Scenario: #platform-only-retrieval
- **WHEN** any gameplay-admitted connection — operator, bot, spectator, or coach — attempts to retrieve the bulk export
- **THEN** it is refused; only the platform runtime's distinct privilege retrieves the export

#### Scenario: #filter-bypassed-for-export
- **WHEN** the export is produced for a game in which snakes were invisible
- **THEN** it contains their full state at every turn — the export is the whole truth, because downstream replay serves every perspective a viewer later chooses

#### Scenario: #aggregates-travel-with-the-record
- **WHEN** the export is assembled
- **THEN** every completed turn's per-team aggregate rows travel inside it — a game's scoreboard history is part of the exported record, not a live-only channel that ends with the instance and leaves the replay to recompute it

#### Scenario: #seed-secret-live-exported-post
- **WHEN** the game runs
- **THEN** no game client can observe the seed — yet the seed is in the export, so reproducibility is verifiable once the game is over

#### Scenario: #error-outcome-exports-nothing
- **WHEN** the instance reports an error outcome
- **THEN** the notification carries no replay data and no scores — a game that failed is recorded as failed, not as a playable replay

### Requirement: replay-and-audit/replay-persistence
Depends on: game-lifecycle/teardown-after-persistence, global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game, game-lifecycle/game-record.

The platform SHALL persist the exported record as the game's replay, bound to the game's persistent record, before the instance is torn down — and SHALL NOT begin persisting before the instance has signalled its terminal state. Once persisted, the replay — and the game's team-experience records: the action log and the display-state snapshots — SHALL survive teardown for the life of the game record; replay viewing never consults a game instance.

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
Depends on: turn-pacing/operator-tempo, operator-control/captain-boot, operator-control/operator-dual-connection, decision-transparency/computed-display-state, game-runtime/staged-move-log, global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game.

The platform SHALL keep, per game, a team action log recording state-changing team-experience events at wall-clock resolution finer than turn granularity. Each entry SHALL carry at minimum: the game, the turn, the acting identity and its kind (operator, or the team's server acting as its bot), and a wall-clock timestamp. The recorded categories SHALL include at minimum: each operator's arrival in and departure from the team's game session, the departure carrying its cause — a deliberate leave, a lost connection, or a Captain's boot; snake selection and deselection; manual-mode toggles; Drive addition and removal; heuristic weight and activation changes, carrying both old and new values; temperature-override changes; per-operator tempo changes and Captain boots; team-side turn submissions; and computed-display-state snapshots. Move staging is not among them — staged moves live solely in the game instance's staged-move log.

#### Scenario: #sub-turn-resolution
- **WHEN** several team actions occur within one turn
- **THEN** each is a distinct entry with its own wall-clock timestamp — the log resolves the order of events inside a turn, not just across turns

#### Scenario: #tempo-and-boot-are-clock-anchored
- **WHEN** tempo changes, boots, and turn submissions are recorded
- **THEN** their entries are anchored to wall-clock time, not turn keys — so the active-operator set and each operator's tempo are reconstructible at any moment, regardless of turn boundaries

#### Scenario: #every-departure-is-logged-however-it-happened
- **WHEN** an operator leaves the team's game session — closing the interface, dropping off the network, or being booted
- **THEN** a departure entry is recorded either way, carrying which of those it was — an unannounced drop leaves as durable a mark as a deliberate exit, so no reader has to tell "left" from "went quiet"

#### Scenario: #weight-change-carries-before-and-after
- **WHEN** a heuristic's weight or activation changes
- **THEN** the entry carries the full old and new values — each entry is self-sufficient evidence of its transition, never a delta that needs neighbours to interpret

#### Scenario: #move-staging-excluded
- **WHEN** a team's staging history is audited alongside its action log — moves staged by an operator or by the bot alike
- **THEN** every staged move is read from the instance's staged-move log, the single home where the authoritative act and its record cannot diverge — no consumer must reconcile two accounts of the same act

### Requirement: replay-and-audit/actors-write-own-entries
Depends on: global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server, decision-transparency/hosting-server-sole-writer, global-invariants/transactional-invariant-enforcement.

Every action-log entry SHALL be written by the actor it describes, under that actor's own credential: operators write their own entries, and the team's hosting server writes its own — computed-display-state snapshots exclusively so, with every published snapshot producing its snapshot-category entry. Every mutation of the team's recorded state SHALL write its action-log entry in the same transaction as the mutation itself, so the log is a faithful record of exactly the mutations that succeeded. Exactly one category SHALL be exempt: an operator's departure, which no departing client can be relied on to write for itself, is written by the runtime that holds the log at the moment it observes that operator's coordination connection end.

#### Scenario: #dropped-entry-means-no-mutation
- **WHEN** an action's log write fails
- **THEN** the paired state change also did not commit — there is no state change without its entry and no entry without its state change, so the replay can never ghost or skip

#### Scenario: #server-never-ghost-writes
- **WHEN** an operator selects a snake, toggles a mode, or edits a Drive
- **THEN** the entry is written by that operator's own credentialed client, and no later back-fill by the team's server supplies an entry the operator's own write did not

#### Scenario: #every-snapshot-logged
- **WHEN** the team's server publishes a computed-display-state snapshot
- **THEN** a corresponding snapshot-category entry exists — the display record and the log never disagree about what was published when

#### Scenario: #the-one-entry-its-actor-cannot-write
- **WHEN** an operator's connection ends without warning
- **THEN** the departure entry is written by the log's own runtime as it observes the connection end — never back-filled afterwards by the team's server, and never inferred later from a gap in that operator's activity

### Requirement: replay-and-audit/experience-reconstruction
Depends on: global-invariants/centaur-state-boundary#centaur-state-cannot-decide-a-game, operator-control/exclusive-selection#cleared-at-finish, game-runtime/staged-move-attribution.

The persisted replay and the team action log together SHALL suffice to reconstruct a participating team's full experience at any wall-clock moment of the game: which snake each operator had selected, each snake's manual-mode flag, its active Drives with targets and weights, its heuristic activations and weight overrides, its temperature override, its display state as last written before that moment, the staged moves and who staged them, and the active-operator set — who was then connected to the team's game session — with each operator's tempo, folded from the log's recorded arrivals and departures. The action log SHALL never be a source of authoritative game state: board contents, snake bodies, and outcomes reconstruct from the game record alone.

#### Scenario: #any-moment-not-just-boundaries
- **WHEN** a moment strictly inside a turn is reconstructed
- **THEN** the team's state at that instant — mid-deliberation, between actions — is recoverable, because every input is either turn-keyed record or clock-stamped log entry

#### Scenario: #selection-history-from-the-log-alone
- **WHEN** a finished game's selection history is reconstructed
- **THEN** it comes entirely from the log's selection events — live selection state was cleared at game end, and nothing depends on it having survived

#### Scenario: #presence-is-read-not-guessed
- **WHEN** the active-operator set at some past instant is needed
- **THEN** it is the fold of the recorded arrivals and departures up to that instant — never inferred from a lull in an operator's activity, and never taken from live presence, which the platform holds no durable record of

#### Scenario: #board-truth-from-the-game-record-only
- **WHEN** any consumer needs board contents, snake bodies, collisions, or spawns
- **THEN** it reads the game record — deriving authoritative game state from the action log is a defect even where the log would happen to suffice

### Requirement: replay-and-audit/finished-games-public
Depends on: live-game-observation/team-private-live-state, global-invariants/team-private-centaur-state, global-invariants/access-follows-identity.

Once a game is finished, its full record — the board-level replay and every participating team's within-turn data: action-log entries, display-state snapshots, and staged-move history — SHALL be readable by every authenticated user. The replay viewer SHALL expose a direct-link affordance producing a URL that takes any authenticated user straight to that game's replay. A game still being played SHALL NOT be reachable through the replay surface at all: pre-finish access is the live-observation boundary's business, and finishing is the moment competitive secrecy ends.

#### Scenario: #finished-means-open
- **WHEN** a game finishes
- **THEN** both teams' full within-turn operational data becomes readable by any authenticated user — post-game auditability outranks secrecy, deliberately and completely

#### Scenario: #direct-link-grants-any-finished-replay
- **WHEN** any authenticated user opens a direct link to any finished game
- **THEN** the replay opens for them, whatever teams played and whichever Snek Centaur Server served the link — history listings scope discovery, never access

#### Scenario: #live-games-not-on-the-replay-surface
- **WHEN** a game is still in play
- **THEN** the replay surface refuses it entirely — no partial replay, no early peek at another team's working data through the replay path

### Requirement: replay-and-audit/team-game-history
Depends on: game-engine/scoring.

The application SHALL provide, per hosted team, a game-history listing of the team's completed games in reverse chronological order, listing a game for a user exactly when they were a member of the team at the time of the game (per the game's roster snapshot) or are a current member — games of unrelated teams are not listed. Each listing SHALL show at minimum the room, date, opposing teams, the team's result, and the final scores — the normalised score as the headline value with par 1.0 as the visual reference and real-valued display, and the team's aggregate body length as a secondary stat. Selecting a listing SHALL open that game's replay viewer, defaulting to the team perspective.

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
Depends on: global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant.

The application SHALL present replays through one unified viewer — never separate platform-side and team-side viewers — available for any finished game with a persisted replay, combining two modes in a single interface: board-level replay at turn granularity, open to every authenticated user for every finished game; and team-perspective replay at sub-turn granularity, offered only for games in which the viewing human participated as a team member, scoped to that team's experience.

#### Scenario: #one-viewer-not-two
- **WHEN** any replay is opened — from a team's history, a profile, or a direct link
- **THEN** it is the same unified viewer; board-level and team-perspective are modes within it, not separate applications to maintain in parallel

#### Scenario: #team-perspective-participants-only
- **WHEN** a user who was on no participating team opens a finished game
- **THEN** they get board-level replay; the team-perspective mode is not offered to them — an interface-scoping rule that narrows no data readability, and therefore no invariant's enforcement

#### Scenario: #finished-with-replay-only
- **WHEN** a game is unfinished, or finished with no persisted replay — an error outcome
- **THEN** the viewer does not open it; the replay surface serves exactly the games that have a replay to serve

### Requirement: replay-and-audit/board-level-replay
Depends on: live-game-observation/scoreboard-sole-aggregate-authority, live-game-observation/spectator-live-experience, game-runtime/per-turn-scoreboard.

Board-level mode SHALL source everything it displays from the persisted replay alone — never a game instance — rendering, at the selected turn: the board terrain, snakes, items, hazards, and fertile tiles; the per-team scoreboard with the normalised score as headline at par 1.0 and aggregate length secondary (the rows recorded from the game's sole aggregate authority); and a per-turn event log listing the turn's events from the closed set, visually consistent with live spectating. Board-level mode SHALL NOT display anything derived from the team action log: no operator selections or shadows, and no display-state, worst-case, or heuristic data — for any team, the viewer's own included.

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
Depends on: decision-transparency/worst-case-preview, decision-transparency/decision-breakdown, operator-control/operator-presence-and-identity#same-colour-on-every-client, application-shell/surface-mounting-contract.

Team-perspective mode SHALL present the live operator interface, read-only, over reconstructed state at the scrubbed moment: every mutating affordance — staging, Drive edits, manual-mode and tempo toggles, boots, submission — disabled or absent, while the state-inspection affordances — direction preview, worst-case world preview, decision breakdown — remain fully functional. Historical operator selections SHALL render as coloured shadows in the same per-operator colours used in live play; an operator not connected at the scrubbed moment produces no shadow.

#### Scenario: #live-ui-read-only
- **WHEN** a participant replays their game
- **THEN** they navigate the interface they played in — same components, same layout — with every write inert and every inspection alive, so live-play familiarity carries over whole

#### Scenario: #shadows-in-original-colours
- **WHEN** the scrubbed moment is rendered
- **THEN** each snake selected at that moment carries its holder's shadow in that operator's live-play colour, and operators who were not connected then cast no shadow

### Requirement: replay-and-audit/replay-visibility-bound
Depends on: live-game-observation/invisibility-filtering.

Team-perspective replay SHALL reveal nothing about opposing teams beyond what the viewed team's filtered live view showed at that original moment: an opposing snake invisible to the team at a historical moment stays invisible at that moment in the team-perspective replay, even though the persisted replay behind the viewer holds the full record.

#### Scenario: #invisible-then-invisible-now
- **WHEN** a participant scrubs to a moment at which an opponent's snake was invisible to their team
- **THEN** the team-perspective replay elides it at that moment — the mode replays the experience as lived, and the full record never leaks through the perspective

#### Scenario: #board-mode-tells-the-whole-truth
- **WHEN** the same viewer switches to board-level mode at that moment
- **THEN** the snake is shown — a finished game's full record is open; the team-perspective bound is fidelity to the lived view, not continued secrecy

### Requirement: replay-and-audit/unified-timeline
Depends on: game-runtime/turn-declaration.

One timeline control SHALL govern scrubbing for both viewer modes, providing play, pause, a scrubber, a playback-speed control labelled with the active mode's unit, and a toggle between two scrub modes, defaulting to Per-Turn; the chosen mode and speed SHALL be client-local viewer state, never persisted to the platform. In **Per-Turn** mode, turns are equidistant ticks, scrubbing snaps to end-of-turn states — the state of the world the team saw while declaring — and playback advances in turns per second. In **Timeline** mode, the axis is the game's real wall-clock span, scrubbing is continuous in clock time, and playback runs at multiples of real time; every turn SHALL carry a boundary marker, placed at the latest declaration timestamp the record holds for that turn when every team's declaration for it was stamped, and otherwise at the turn's recorded resolution start. Keyboard scrubbing SHALL match the active mode's granularity: whole turns in Per-Turn mode; fine time steps and turn-marker jumps in Timeline mode.

#### Scenario: #snap-to-what-the-team-saw
- **WHEN** the scrubber moves in Per-Turn mode
- **THEN** it lands only on end-of-turn states — no intra-turn position is addressable in this mode, and each stop is a state the team actually deliberated over

#### Scenario: #unequal-turns-render-unequal
- **WHEN** turns took very different real durations under the clock
- **THEN** Timeline mode spaces their markers proportionally to real time — the game's actual rhythm is visible, never flattened to equidistant turns

#### Scenario: #a-turn-nobody-declared-is-still-placed
- **WHEN** a turn ended because a team's clock ran out, or because a team had no snakes left to play — declarations that carry no timestamp
- **THEN** that turn's marker sits at the moment its resolution began, which the record holds for every turn; no turn is left unplaceable, dropped from the axis, or collapsed onto its neighbour

#### Scenario: #mode-and-speed-are-local
- **WHEN** a viewer picks a scrub mode and speed
- **THEN** the choice lives in their client alone — restored within their session, invisible to other viewers, and never written to the platform

### Requirement: replay-and-audit/replay-inspection
Depends on: decision-transparency/examined-subject.

The replay viewer SHALL let the viewer inspect any snake on the viewed team at any scrubbed moment, regardless of which operator, if any, held it at that moment. Inspection SHALL be purely additive over the reconstructed view: it never displaces, clears, or otherwise alters the selections the record holds for that moment.

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
Depends on: application-shell/one-state-binding.

The data path by which replayed state reaches the interface SHALL offer no mutation surface at all: mutation is structurally absent from the replay binding — not present but refused — so nothing invocable exists for a replay client to write through, and no runtime guard is ever what stands between a replay viewer and a write.

#### Scenario: #absence-not-guard
- **WHEN** the replay binding is examined
- **THEN** mutation operations are not merely rejected at call time — they cannot be expressed against it at all, so there is no guard to forget, bypass, or get wrong

#### Scenario: #read-only-is-not-per-component
- **WHEN** interface components render replayed state
- **THEN** their read-only behaviour comes from the binding offering no writes — not from each component keeping its own replay-aware branch — so a component that never heard of replay still cannot mutate anything
