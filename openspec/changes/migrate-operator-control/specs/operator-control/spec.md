## Purpose

Operating a snake in a live game: selecting it and holding it as the team's
exclusive lock, steering it by hand, staging moves into the game's
append-only staged-move log, entering and leaving manual mode, being
displaced by a teammate, and being booted by the Captain. This capability
owns the within-team coordination of who controls which snake and the path
by which a participant's moves reach the game. The rules of movement and
turn resolution belong to the engine; who may obtain a game connection and
on what terms is the identity story; what an admitted connection may see is
the observation story; when the team's turn resolves — tempo, declaration,
quorum — and how automated play decides its moves belong to the capabilities
that own those workflows.

Depends on: game-engine, identity-and-authorization, live-game-observation.

## ADDED Requirements

### Requirement: operator-control/operator-dual-connection
During play an operator's client SHALL hold two independently authenticated connections: one directly to the game's SpacetimeDB instance — observing the game within its filtered view and staging moves — and one to Convex for the team's coordination state (selection and manual mode). Neither connection SHALL be brokered by any intermediary: the team's nominated hosting server serves the interface, but an operator's gameplay traffic never passes through it.

#### Scenario: #direct-not-proxied
- **WHEN** an operator stages a move or reads game state
- **THEN** the operation travels on the operator's own connection under the operator's own credentials — no server relays, re-stages, or re-attributes it

#### Scenario: #independent-connections
- **WHEN** one of the two connections is lost while the other lives
- **THEN** the surviving connection keeps functioning on its own authentication — neither connection's validity or lifetime depends on the other

#### Scenario: #served-by-the-nominated-host
- **WHEN** a team member opens the operator interface
- **THEN** it is served from the team's nominated hosting server, and the connections the client then opens are still the direct ones above

### Requirement: operator-control/staged-move-log
The game's SpacetimeDB instance SHALL record staged moves in an append-only per-turn log retained for the game's lifetime: every staging appends an entry, no entry is ever edited or cleared — turn resolution included — and no cancel operation exists. The effective move for a snake is the latest entry for that snake in the current turn; entries from prior turns never carry over — a snake with no current-turn entry moves by the engine's fallback (game-engine/movement). This log SHALL be the sole home of staged moves: no other store holds, buffers, or mediates them.

#### Scenario: #supersession-is-not-deletion
- **WHEN** an operator stages Up and then Left for the same snake in one turn
- **THEN** both entries remain in the log permanently and Left is the effective move — last-write-wins is a read rule over the log, never a destructive overwrite

#### Scenario: #nothing-carries-over
- **WHEN** a snake's newest entry was staged in turn T and turn T+1 resolves with nothing staged for it
- **THEN** the snake moves by fallback (`lastDirection`, per game-engine/movement), not by the stale entry — even though that entry is still in the log

#### Scenario: #revocation-is-supersession
- **WHEN** an operator wants to take back a staged move
- **THEN** there is nothing to cancel — they stage a different direction, and the log records the change of mind instead of erasing it

#### Scenario: #accepted-until-declaration
- **WHEN** a burst of staged moves arrives just before the team declares its turn over (game-engine/chess-timer)
- **THEN** each is an ordinary append with no final-submission barrier or freeze window, and resolution consumes exactly what the log holds at the instant of declaration

#### Scenario: #single-home
- **WHEN** any component needs a staged move — to display it, supersede it, or resolve the turn
- **THEN** it reads the game instance's log; no secondary staging store exists anywhere in the platform

### Requirement: operator-control/team-scoped-staging
The game's SpacetimeDB instance SHALL accept a staged move only from an admitted operator or bot connection of the team that owns the named snake (identity-and-authorization/role-bound-privileges), and any such connection MAY stage for any of its team's snakes — staging rights are team-granular, never tied to selection, which the instance neither stores nor checks. The team binding SHALL be the association established at admission, never assertable per call.

#### Scenario: #any-team-snake-regardless-of-selection
- **WHEN** an operator stages for a team snake they have not selected — even one a teammate currently holds
- **THEN** the instance accepts the move; within-team discipline is coordination state held elsewhere, invisible to the game runtime

#### Scenario: #spoofed-parameters-rejected
- **WHEN** a call's parameters imply an association with another team
- **THEN** the instance decides from the connection's admission-time binding alone and rejects staging for the other team's snake

### Requirement: operator-control/staging-is-unvalidated
Move staging SHALL perform no legality evaluation: any direction in the game vocabulary is accepted for any living team snake, including directions that are immediately lethal. Consequences attach only at turn resolution, through the engine's movement and collision rules (game-engine/movement).

#### Scenario: #lethal-direction-accepted
- **WHEN** a direction leading straight into a wall is staged
- **THEN** the entry is appended like any other, and if still effective at resolution the snake moves there and dies by the collision rules — staging never protects a team from its own choice

### Requirement: operator-control/staged-move-privacy
A team's connections SHALL be able to read their own team's complete staged-move history — every entry, superseded ones included, across all turns — and no connection outside the team SHALL ever read any of it, live or historical. Staged-move reads SHALL be delivered only through the server-filtered read surface (live-game-observation/filtered-views-are-the-only-surface).

#### Scenario: #own-history-complete
- **WHEN** a team connection reads its staged moves
- **THEN** the full multi-turn history is available, including entries that were superseded before ever resolving

#### Scenario: #cross-team-never-even-after-resolution
- **WHEN** a turn has long since resolved
- **THEN** opposing and spectator connections still cannot read the team's staged entries for it — other teams learn only committed movement outcomes, never staging intent, timing, or changes of mind

### Requirement: operator-control/exclusive-selection
Convex SHALL hold, for each snake in an active game, a selection record — the operator currently holding the snake, or none, plus the snake's manual-mode flag — and SHALL enforce at its mutation contract that at most one operator holds any snake and each operator holds at most one snake per game, with no reader ever observing either invariant violated. Only members of the owning team may ever appear as a holder. At game end every selection SHALL be cleared: selection is live coordination state, not a persistent record.

#### Scenario: #server-side-enforcement
- **WHEN** any mutation would leave a snake with two holders or an operator holding two snakes
- **THEN** it is rejected — or resolved by the atomic release semantics of operator-control/selection-transfer — regardless of what any client displayed

#### Scenario: #unheld-rows-are-nobodys
- **WHEN** many of a team's snakes are simultaneously unheld
- **THEN** the one-snake-per-operator guard treats holderless records as belonging to no one — "no holder" is never counted as an operator holding several snakes

#### Scenario: #non-member-never-holds
- **WHEN** anyone who is not a member of the owning team — spectator, coach, opposing operator — attempts a selection mutation
- **THEN** it is rejected, and no selection record ever names a non-member

#### Scenario: #cleared-at-finish
- **WHEN** the game finishes
- **THEN** every selection record for it empties; any later account of who held what is reconstruction from recorded activity, never surviving live selection state

### Requirement: operator-control/selection-transfer
Selecting a snake held by another operator SHALL succeed only when the caller explicitly requests displacement; without that request the mutation is rejected and the holder keeps the snake. Displacement — and the implicit release of the caller's own previously held snake on any selection — SHALL be atomic across every affected record, and every release, implicit or explicit, SHALL be observable as a deselection.

#### Scenario: #confirmation-gates-displacement
- **WHEN** an operator selects a teammate-held snake without the displacement request
- **THEN** the mutation is rejected and the holder is undisturbed; the interface obtains the operator's explicit confirmation before ever issuing the displacing form

#### Scenario: #atomic-handover
- **WHEN** a displacement executes
- **THEN** the displaced operator's release, the caller's previous release (if any), and the new hold commit as one atomic step — at no observable instant do two operators hold one snake or one operator two

#### Scenario: #previous-selection-auto-released
- **WHEN** an operator holding snake A selects snake B
- **THEN** A is released within the same atomic mutation, observably as a deselection of A — never a silent vanish, and never a rejection for already holding a snake

### Requirement: operator-control/selection-is-view-only
Holding a selection SHALL make the snake the subject of the operator's per-snake controls and nothing more: selection never changes the snake's manual/automatic state and never by itself alters play. Per-snake staging and control affordances SHALL be presented only to the snake's current holder, and releasing a snake SHALL change nothing about the snake but the holder.

#### Scenario: #selection-never-flips-manual
- **WHEN** an operator selects a snake in automatic mode
- **THEN** it stays automatic and automated staging continues uninterrupted — entering manual mode is a separate deliberate act (operator-control/manual-mode)

#### Scenario: #no-affordances-without-holding
- **WHEN** the interface shows a snake the operator does not currently hold
- **THEN** no direction candidates, staging controls, or per-snake edit affordances for it are rendered or actionable

#### Scenario: #release-changes-nothing-else
- **WHEN** a holder deselects a snake — explicitly, by selecting another, or by being displaced
- **THEN** the snake's manual-mode flag and its staged move are untouched; release resets nothing but the hold

### Requirement: operator-control/manual-mode
Every snake SHALL begin each game in automatic mode — its moves staged by the team's automated player — and SHALL be in manual mode only between an explicit entry and exit by a current holder: entry by the holder's explicit toggle, or automatically as a side effect of the holder staging a direction; exit only by the holder's explicit return to automatic. While a snake is manual — held or not — the automated player SHALL never stage for it, and automated staging SHALL never supersede a move an operator staged in the current turn: manual-mode entry is ordered before, or atomically with, the operator's staging act, leaving no window in which automation overwrites the operator.

#### Scenario: #fresh-game-all-automatic
- **WHEN** the live interface is entered for a fresh game
- **THEN** every owned snake is in automatic mode and being staged automatically — the team plays with zero operator action

#### Scenario: #staging-enters-manual-without-a-gap
- **WHEN** an operator picks a direction for their held snake
- **THEN** the direction is staged and the snake becomes manual, with the manual transition effective no later than the staged move — at no point can automation overwrite the operator's move because the mode change had not yet landed

#### Scenario: #explicit-entry-locks-the-current-move
- **WHEN** the holder enters manual mode by the toggle alone, without picking a direction
- **THEN** no new move is staged and the currently effective staged move — whoever authored it — is locked in place against automated supersession

#### Scenario: #exit-resumes-automation
- **WHEN** the holder returns the snake to automatic
- **THEN** the automated player resumes staging for it from its next pass, and nothing else about the snake is reset

#### Scenario: #manual-survives-losing-the-holder
- **WHEN** a manual snake's holder deselects, is displaced, disconnects, or is booted
- **THEN** the snake remains manual and untouched by automation — moving by the engine fallback if nobody stages — until an operator holding it returns it to automatic

#### Scenario: #interface-adds-no-automation
- **WHEN** the operator interface runs
- **THEN** it stages only what an operator explicitly picks, implementing no scheduling or automated staging logic of its own — automated staging originates solely in the team's automated player

### Requirement: operator-control/live-interface-availability
The application SHALL offer a team's live operator interface exactly while that team has a game being played: available from the moment the game is playing, surfaced prominently to the team's members so an arriving operator finds the active game without searching, and refused with an explanatory empty state when no game is playing. When the game finishes, the interface SHALL be replaced by a terminal view — the final outcome and a path to the game's replay — offering no mutating affordances.

#### Scenario: #arriving-operator-lands-in-the-game
- **WHEN** a member opens the application while their team's game is playing
- **THEN** the live interface is prominent in the navigation — reaching the active game requires no searching

#### Scenario: #no-game-no-live-page
- **WHEN** someone navigates to the live interface while the team has no playing game
- **THEN** they get an explanatory empty state — never a broken page or a stale board

#### Scenario: #finish-is-terminal
- **WHEN** the game transitions to finished while operators are connected
- **THEN** their interface transitions to the terminal view — final scores and the replay link, zero mutating affordances — rather than freezing on the last turn

### Requirement: operator-control/board-and-move-interface
The live interface SHALL render the current board from the connection's filtered observation surface (live-game-observation/ui-honours-the-filter) — terrain, items, and observable snakes — marking each owned snake's currently staged move and updating the marker live whatever the staging origin. For the operator's held snake it SHALL present a four-direction staging affordance that reflects the currently effective staged direction, keeps immediately lethal directions visibly discouraged yet selectable, and stages immediately on every pick: no separate commit act exists, and staged moves remain changeable until the team's turn is over (game-engine/chess-timer).

#### Scenario: #marker-follows-any-origin
- **WHEN** a snake's staged move changes — by the automated player, this operator, or a teammate on another client
- **THEN** the staged-move marker updates on every team client without reload

#### Scenario: #lethal-discouraged-not-blocked
- **WHEN** a candidate direction is immediately lethal
- **THEN** its affordance is visibly marked as such but remains selectable and stages normally (operator-control/staging-is-unvalidated)

#### Scenario: #exploration-is-staging
- **WHEN** an operator tries a direction to examine its consequences
- **THEN** that direction is genuinely staged, and the interface makes clear that exploring and committing are indistinguishable to the game until the turn ends

### Requirement: operator-control/operator-presence-and-identity
Each operator SHALL be identified throughout the team's live interface by a colour that is a deterministic function of the game and the operator — identical across clients, reloads, and reconnects for the game's whole lifetime — used consistently wherever the operator appears: the presence display of currently connected teammates and the selection indication on held snakes. The interface SHALL also show a connection-quality indicator measured entirely by the client itself.

#### Scenario: #same-colour-on-every-client
- **WHEN** two teammates each view the live interface
- **THEN** a given operator's presence entry and selection indication carry the identical colour on both clients, and the colour survives reload and reconnect — it is a pure function of (game, operator), never a per-session assignment

#### Scenario: #latency-is-client-measured
- **WHEN** connection quality is displayed
- **THEN** it comes from the client's own round-trip measurement against its game connection — no server-held state backs the indicator

### Requirement: operator-control/captain-boot
The team's Captain SHALL be able to boot a connected operator from the team's game session: the boot severs the operator's session connection exactly as a network disconnect would and writes no persistent operator state — no lockout, no flag, nothing requiring undo. The booted operator's interface SHALL tell them they were removed, and they MAY reconnect at any time, rejoining exactly as after a network drop. Boot SHALL be rejected server-side for any non-Captain caller, and non-Captains see no boot affordance.

#### Scenario: #no-sticky-lockout
- **WHEN** a booted operator reconnects immediately
- **THEN** they are admitted and rejoin normally — nothing persisted marks them as booted, and the Captain simply boots again if needed

#### Scenario: #boot-clears-nothing
- **WHEN** the booted operator held a snake in manual mode
- **THEN** the boot itself changes neither the selection record nor the manual flag — a teammate takes the snake by displacement (operator-control/selection-transfer), exactly as for any absent holder

#### Scenario: #captain-only
- **WHEN** a non-Captain invokes the boot operation by any means, interface or direct call
- **THEN** it is rejected server-side, independent of what the interface exposed
