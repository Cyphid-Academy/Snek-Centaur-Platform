## Purpose

Watching a live game: the real-time delivery of committed turns to every
observing connection, the invisibility filter that decides who may observe
which snakes, the reconstruction of any past turn while the game runs, the
server-published scoreboard, spectating by any authenticated user, and the
coach's read-only window into a team's live play. This capability owns the
observation surface of a running game — what each admitted connection may
see and how it arrives. Who may obtain access to a game is owned by its
identity dependency; acting in a game — staging moves, pacing turns,
running a team — belongs to the capabilities that own those workflows, and
reliving a finished game belongs to the replay story.

Depends on: game-engine, identity-and-authorization.

## ADDED Requirements

### Requirement: live-game-observation/real-time-committed-delivery
A game's runtime SHALL deliver committed state to subscribed connections in real time: a subscribed client observes each turn's outcome as it commits, without polling on a timer. Everything a turn's resolution produces (game-engine/turn-resolution-model) SHALL become observable as one atomic logical update — either the whole committed turn is observable or none of it — and no state of a turn SHALL reach any subscriber before that turn's resolution has fully committed.

#### Scenario: #no-polling
- **WHEN** a subscribed client awaits turn progression
- **THEN** the new turn's data is pushed to it on commit — detecting progression requires no timer-driven re-query

#### Scenario: #snapshot-and-events-arrive-together
- **WHEN** a turn commits
- **THEN** no subscriber can observe a torn combination — the turn's snake states without its events, or any other partial subset — because the commit arrives as a single logical update

#### Scenario: #no-partial-resolution-state
- **WHEN** turn resolution is in progress
- **THEN** no intermediate state from within the resolution pipeline is observable to any subscriber; observers see the prior turn's state until the commit lands whole

### Requirement: live-game-observation/observation-use-cases
The observation surface SHALL support, for every admitted connection within its authorized visibility: a live current-turn view that updates automatically as turns commit; point-in-time observation of any completed turn; observation of a turn transition — the new turn's state together with the events that produced it — sufficient to animate it; and mid-game catch-up, where a connection joining mid-game obtains the complete history so far as an initial delivery followed by incremental updates.

#### Scenario: #mid-game-join
- **WHEN** a client connects while turn 40 is being played
- **THEN** it can obtain turns 0–39 as an initial delivery and receives turn 40 onward incrementally, with no gap between the two

#### Scenario: #canonical-order-is-read-not-delivered
- **WHEN** a consumer needs a turn's events in a deterministic order
- **THEN** it orders them by the stored record's canonical representation order — a turn's events are a set, delivery order within the turn's update carries no guarantee, and no consumer may build on it

### Requirement: live-game-observation/filtered-views-are-the-only-surface
Every read a client connection can perform against a running game SHALL go through purpose-built, server-filtered views; no client connection SHALL be able to subscribe to or query raw stored game state. Every visibility rule SHALL be enforced inside those views, server-side, assuming no client cooperation.

#### Scenario: #raw-protocol-client-gets-filtered-data
- **WHEN** a client bypasses every provided library and interface and speaks the runtime's wire protocol directly
- **THEN** all it can reach is the same filtered views — data it must not see was never delivered, rather than hidden by a cooperating client

#### Scenario: #new-read-surfaces-are-views
- **WHEN** a new observable datum is added to the running game
- **THEN** it is exposed through a filtered view like everything else — no raw-table read path is ever introduced

### Requirement: live-game-observation/invisibility-filtering
The observation surface SHALL enforce game-engine/invisibility at the data layer: an invisible snake's own state — existence, position, body, health, effects — is elided from the deliveries and query results of every connection not bound to its owning team, with team-unbound spectator connections treated as opponents of every team. Connections bound to the owning team SHALL observe the snake normally, with its visibility state exposed. Only the snake's own state record is hidden: the effects it has on the board — items it consumes, events it causes — remain observable to all.

#### Scenario: #spectators-are-opponents-of-every-team
- **WHEN** a spectator observes a game in which any team has an invisible snake
- **THEN** the spectator observes no invisible snake of any team — intersection semantics, never the union of team views

#### Scenario: #ally-sees-visible-false
- **WHEN** a snake is invisible
- **THEN** its owning team's connections — members and coaches alike — receive the snake with its visibility state false, so their interface can mark it as invisible to opponents

#### Scenario: #board-effects-stay-observable
- **WHEN** an invisible snake consumes an item
- **THEN** every observer sees the item leave the board and the turn's events — event streams and item state are not visibility-filtered; only snake state records are

#### Scenario: #turn-zero-is-public
- **WHEN** a game starts
- **THEN** every starting snake position and initial item placement is observable to every connection — snakes are visible at turn 0, and the filter encodes invisibility only, never pre-game positional privacy

### Requirement: live-game-observation/visibility-transitions-and-history
A snake's observability SHALL be evaluated against its visibility state at the observed turn, transitioning exactly at turn boundaries: when an invisibility effect is applied, cancelled, or expires at a turn's commit, non-allied observers lose or regain the snake precisely at that boundary. Historical reads SHALL be filtered on the same terms as live ones — reconstructing a past turn can never reveal a snake that was invisible to that connection at that turn.

#### Scenario: #vanishes-and-reappears-at-boundaries
- **WHEN** a snake's invisibility takes effect or ends at a turn's commit
- **THEN** an opponent's or spectator's view drops or regains the snake exactly at that turn boundary — never mid-turn, never a turn late

#### Scenario: #history-scrub-cannot-reveal
- **WHEN** a snake's invisibility has since ended — by expiry, cancellation, or death — and a non-allied observer scrubs back to a turn in which it was invisible
- **THEN** the snake is still absent from that turn's reconstruction; later visibility never unlocks past hidden state

### Requirement: live-game-observation/historical-reconstruction
For any completed turn of a running game, an admitted connection SHALL be able to reconstruct from the observation surface alone, within its authorized visibility: every observable snake's full state at that turn's boundary, the items then on the board, each team's remaining time budget (game-engine/chess-timer), and the turn's full event list. Reconstruction SHALL require no re-execution of game rules — per-turn state is directly readable as committed.

#### Scenario: #no-rules-re-execution
- **WHEN** a client renders turn 17 of a game that has reached turn 200
- **THEN** it reads turn 17's committed records directly; it never replays earlier turns or embeds rule logic to derive the state

#### Scenario: #reconstruction-respects-visibility
- **WHEN** a spectator reconstructs a past turn
- **THEN** snakes invisible to them at that turn are absent, while the turn's events and per-team budgets are complete

### Requirement: live-game-observation/scoreboard-sole-aggregate-authority
For every completed turn the runtime SHALL publish exactly one scoreboard row per rostered team — zero-filled, never omitted, for teams with no living snakes — carrying that team's aggregates at the turn boundary: the normalised score the game would have if it ended at that turn (game-engine/scoring), the alive-snake count, and the aggregate body length, computed server-side over the true alive set including invisible snakes and written in the same transaction as the turn's committed state. Scoreboard rows SHALL be identical for every connection — they expose per-team aggregates only, never per-snake state — and clients SHALL obtain every team-level aggregate exclusively from this channel.

#### Scenario: #invisible-snakes-counted-not-revealed
- **WHEN** a team has an invisible snake
- **THEN** the scoreboard's aggregates include it while the snake's own state stays filtered — the aggregate totals are the deliberate, bounded disclosure of invisible contributions

#### Scenario: #eliminated-teams-zero-filled
- **WHEN** a team has no living snakes at a turn
- **THEN** its scoreboard row is present with zeroed aggregates, never omitted — every rostered team appears every turn

#### Scenario: #live-score-reads-as-if-ended
- **WHEN** the scoreboard shows a team's score mid-game
- **THEN** it is the normalised score the game would produce if it ended at that boundary — par 1.0 for a proportional share — not a raw segment count

#### Scenario: #never-lags-the-snapshot
- **WHEN** a turn's snake states are observable
- **THEN** that turn's scoreboard rows are too — both were written by the one committing transaction, so no observer can catch a turn whose scoreboard is missing or stale

#### Scenario: #client-aggregation-is-a-defect
- **WHEN** a client needs any team-level aggregate — score, total length, alive count, win-condition state
- **THEN** it renders the delivered aggregate; computing it by aggregating per-snake subscription data is a violation even when the values happen to match, because it silently under-counts whenever an opponent snake is invisible

### Requirement: live-game-observation/ui-honours-the-filter
The application UI SHALL render exactly what the filtered observation surface delivers: it SHALL never attempt to infer, reconstruct, or approximate hidden snake state from any channel — events, aggregates, or gaps in deliveries — and it SHALL render invisibility indication only for own-team snakes, from the delivered visibility state, never revealing or guessing at other teams' invisibility.

#### Scenario: #never-infers-hidden-state
- **WHEN** delivered data implies a hidden snake exists — a consumption event with no visible eater, an aggregate length exceeding the visible bodies
- **THEN** the UI draws no inferred snake and marks no guessed position; the implication is left un-rendered

#### Scenario: #own-team-indication-only
- **WHEN** a snake is rendered with an invisibility indicator (for example a translucent shimmer)
- **THEN** it is an own-team snake whose delivered visibility is false; snakes of other teams never carry invisibility rendering, since their invisible members were never delivered

### Requirement: live-game-observation/spectator-access
Any authenticated user SHALL be able to spectate any game being played, without membership in any participating team: entering the spectating view obtains a spectator access token (identity-and-authorization/spectator-tokens) and connects read-only under it, and every surface presenting a playing game — such as its room's lobby — SHALL link to spectating it. Leaving the view, or the game finishing, SHALL end the spectating session: the subscription is released and the held token discarded.

#### Scenario: #entry-obtains-a-token
- **WHEN** a user enters the spectating view for a playing game
- **THEN** the view obtains a spectator access token through the platform's issuance path and presents it when connecting; the connection observes under that token's read-only terms

#### Scenario: #eligibility-deliberately-open
- **WHEN** spectating entry is gated
- **THEN** the only conditions are authentication and the game being in play — narrower eligibility (private games, room-level visibility, issuance rate limits) is deliberately unspecified policy, adopted only by revising this requirement, never by silent drift

#### Scenario: #reachable-from-the-lobby
- **WHEN** a room's current game is being played
- **THEN** the room's lobby links directly to that game's spectating view

#### Scenario: #session-ends-cleanly
- **WHEN** the spectator navigates away, or the game finishes
- **THEN** the subscription is released and the held token discarded — nothing retained continues to observe or authenticate

### Requirement: live-game-observation/spectator-live-experience
The spectating view SHALL render the live game in real time from its filtered subscription — board terrain, items, observable snakes, and turn events — together with the current turn number and, per participating team, the remaining time budget and whether the team has declared its turn over (game-engine/chess-timer). Spectating SHALL expose zero mutating affordances: nothing in the view stages moves, selects snakes, paces turns, or otherwise writes game or team state — and the spectator connection could perform no such write regardless (identity-and-authorization/role-bound-privileges).

#### Scenario: #pacing-legible-without-private-state
- **WHEN** teams play at their own pace
- **THEN** the spectator sees each team's remaining budget and declared-turn-over status update live, so the game's tempo is legible without exposing any team-private state

#### Scenario: #zero-mutating-affordances
- **WHEN** the spectating view is examined in any state of the game
- **THEN** no affordance exists that would mutate game or team state — read-only is a structural property of the view, not a set of disabled controls

### Requirement: live-game-observation/spectator-timeline
The spectating view SHALL provide a timeline scrubber over every completed turn of the current game, reconstructing board, snakes, items, scoreboard, and events at the scrubbed turn. On entry the view SHALL subscribe to the game's full history up-front, accepting entry latency bounded by game length. Scrubbing SHALL NOT interrupt the live subscription, and while scrubbed the view SHALL visibly communicate that the display is not live and offer a one-action return to the live head.

#### Scenario: #upfront-history-no-lazy-fetch
- **WHEN** a spectator enters a long-running game
- **THEN** the full history arrives as the entry subscription's initial delivery, so scrubbing to any turn is immediate — no on-demand fetching, no stutter at a prefetch border

#### Scenario: #scrub-while-live-continues
- **WHEN** the spectator is scrubbed to an early turn and a new turn commits
- **THEN** the live feed keeps arriving in the background, the not-live indication is shown, and a single action returns the view to the live head at the newest turn

### Requirement: live-game-observation/team-private-live-state
While a game is being played, a team's private observation context — its filtered view of the game and the team-scoped working state the platform holds around its play (its configuration, per-snake working state, and activity records) — SHALL be readable only by that team's members, its designated coaches (identity-and-authorization/coach-tokens), and platform admins as implicit coaches (identity-and-authorization/platform-admin-role); never by other teams or by spectators. A coach SHALL read on exactly the same filtered terms as a member, and coach standing SHALL confer nothing for a finished game beyond what every authenticated user already has.

#### Scenario: #cross-team-reads-denied
- **WHEN** a member or coach of one team attempts to read another team's team-private live state during a game
- **THEN** the read is refused — competitive working state is never visible across teams while the game runs

#### Scenario: #coach-parity-with-members
- **WHEN** a coach reads their bound team's live game
- **THEN** they see exactly what a member sees — the same filtered game view and the same team-private state — nothing more and nothing less

#### Scenario: #finished-games-owe-coaches-nothing
- **WHEN** a game finishes
- **THEN** coach standing adds no read access beyond what every authenticated user has for finished games — the role is meaningful only at the live-game boundary

### Requirement: live-game-observation/coach-mode-interface
The application SHALL offer a coach mode into a team's live interface for that team's designated coaches (and admins as implicit coaches), reachable from wherever the team's live game is surfaced, including its spectating view: the full interface a member would see, with every mutating affordance disabled or absent and the mode visibly read-only. Coach inspection of a snake SHALL be client-local — it writes nothing, produces no selection shadow, and never displaces any operator's selection — and SHALL be visually distinct from operator selection.

#### Scenario: #every-mutating-affordance-inert
- **WHEN** a coach opens the live interface
- **THEN** the board, the team's private panels, and the team controls all render as they would for a member, and every control that would write — selection, staging, configuration edits, pacing, team controls — is disabled or absent, visibly marking the mode read-only

#### Scenario: #inspection-is-client-local
- **WHEN** a coach inspects a snake while the team's operators hold selections
- **THEN** the coach sees the operators' real selection shadows alongside their own inspection, which appears in no other client and touches no shared state

#### Scenario: #inspection-never-reads-as-selection
- **WHEN** a coach inspects a snake
- **THEN** the gesture and the on-board indication differ visibly from operator selection, so neither the coach nor any other observer can mistake the inspection for an operator holding the snake
