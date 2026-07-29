## Purpose

Operating a snake in a live game: selecting it and holding it as the team's
exclusive lock, steering it by hand, staging moves into the game's
append-only staged-move log, entering and leaving manual mode, being
displaced by a teammate, and being booted by the Captain. This capability
owns the within-team coordination of who controls which snake and the path
by which a participant's moves reach the game. The rules of movement and
turn resolution belong to the engine; the log a staged move lands in, the
terms on which the game's own runtime accepts it, and everything the
resolving transaction does with it belong to the game-runtime story; who may
obtain a game connection and on what terms is the identity story; what an
admitted connection may see — including which of a team's staged moves it
may read — is the observation story; the game's status
machine and the bracket that opens and closes play — which is what decides
when this capability's interface exists and when its coordination state is
cleared — belong to the lifecycle story; when the team's turn resolves —
tempo, declaration, quorum — and how automated play decides its moves belong
to the capabilities that own those workflows.

Depends on: game-engine, game-lifecycle, game-runtime, global-invariants,
identity-and-authorization, live-game-observation.

## ADDED Requirements

### Requirement: operator-control/operator-dual-connection
Depends on: global-invariants/authenticated-unambiguous-identity, global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server, identity-and-authorization/admission-validation, identity-and-authorization/role-bound-privileges.

During play an operator's client SHALL hold two independently authenticated connections: one directly to the game's SpacetimeDB instance — observing the game within its filtered view and staging moves — and one to Convex for the team's coordination state (selection and manual mode). Each SHALL be authenticated as the operator themself, never as the team's Server; the team's nominated hosting server serves the interface only.

#### Scenario: #direct-not-proxied
- **WHEN** an operator stages a move or reads game state
- **THEN** the operation travels on the operator's own connection under the operator's own credentials — no server relays, re-stages, or re-attributes it

#### Scenario: #independent-connections
- **WHEN** one of the two connections is lost while the other lives
- **THEN** the surviving connection keeps functioning on its own authentication — neither connection's validity or lifetime depends on the other

#### Scenario: #served-by-the-nominated-host
- **WHEN** a team member opens the operator interface
- **THEN** it is served from the team's nominated hosting server, and the connections the client then opens are still the direct ones above

### Requirement: operator-control/exclusive-selection
Depends on: game-lifecycle/status-authority#no-backward-motion, global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard, global-invariants/team-granularity-authorization#within-team-discipline-lives-in-convex.

Convex SHALL hold, for each snake in an active game, a selection record — the operator currently holding the snake, or none, plus the snake's manual-mode flag — and SHALL enforce at its mutation contract that at most one operator holds any snake and each operator holds at most one snake per game, with no reader ever observing either invariant violated. Only members of the owning team may ever appear as a holder — the selection lock is within-team coordination, which Convex alone arbitrates. At game end every selection SHALL be cleared: selection is live coordination state, not a persistent record.

#### Scenario: #server-side-enforcement
- **WHEN** any mutation would leave a snake with two holders or an operator holding two snakes
- **THEN** it is rejected — or resolved by the atomic release semantics of selection transfer

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
Depends on: global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction, global-invariants/transactional-invariant-enforcement.

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
- **THEN** it stays automatic and automated staging continues uninterrupted — entering manual mode is a separate deliberate act

#### Scenario: #no-affordances-without-holding
- **WHEN** the interface shows a snake the operator does not currently hold
- **THEN** no direction candidates, staging controls, or per-snake edit affordances for it are rendered or actionable

#### Scenario: #release-changes-nothing-else
- **WHEN** a holder deselects a snake — explicitly, by selecting another, or by being displaced
- **THEN** the snake's manual-mode flag and its staged move are untouched; release resets nothing but the hold

### Requirement: operator-control/manual-mode
Depends on: global-invariants/centaur-state-boundary, game-runtime/staged-move-log.

Every snake SHALL begin each game in automatic mode — its moves staged by the team's automated player — and SHALL be in manual mode only between an explicit entry and exit by a current holder: entry by the holder's explicit toggle, or automatically as a side effect of the holder staging a direction; exit only by the holder's explicit return to automatic. While a snake is manual — held or not — the automated player SHALL never stage for it, and automated staging SHALL never supersede a move an operator staged in the current turn: manual-mode entry is ordered before, or atomically with, the operator's staging act, leaving no window in which automation overwrites the operator — an ordering guarantee rather than one transaction, because no transaction spans the runtimes holding the flag and the log.

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
Depends on: game-lifecycle/status-authority.

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
Depends on: live-game-observation/ui-honours-the-filter, global-invariants/one-shared-engine#no-parallel-implementation, game-engine/chess-timer, game-runtime/staging-is-unvalidated, game-runtime/staged-move-log.

The live interface SHALL render the current board from the connection's filtered observation surface — terrain, items, and observable snakes — marking each owned snake's currently staged move and updating the marker live whatever the staging origin. For the operator's held snake it SHALL present a four-direction staging affordance that reflects the currently effective staged direction, keeps immediately lethal directions visibly discouraged yet selectable — the client judging lethality with the same engine build the instance resolves with — and stages immediately on every pick: **every pick on this affordance is a staging act**, it offers no inert, preview-only, or otherwise non-committal way to nominate a direction, no separate commit act exists, and staged moves remain changeable until the team's turn is over.

#### Scenario: #marker-follows-any-origin
- **WHEN** a snake's staged move changes — by the automated player, this operator, or a teammate on another client
- **THEN** the staged-move marker updates on every team client without reload

#### Scenario: #lethal-discouraged-not-blocked
- **WHEN** a candidate direction is immediately lethal
- **THEN** its affordance is visibly marked as such but remains selectable and stages normally

#### Scenario: #exploration-is-staging
- **WHEN** an operator picks a direction on this affordance to see where it would lead
- **THEN** that direction is genuinely staged, and the interface makes clear that exploring and committing are indistinguishable to the game until the turn ends — nothing on this affordance is a look-without-touching gesture

#### Scenario: #no-second-direction-selector
- **WHEN** some other surface offers a way to single out a direction without staging it
- **THEN** it is not this affordance and carries none of its authority — this affordance's picks are the only direction nominations that reach the game, so a read-only lens over a direction can never become a move

### Requirement: operator-control/operator-presence-and-identity
Each operator SHALL be identified throughout the team's live interface by a colour that is a deterministic function of the game and the operator — identical across clients, reloads, and reconnects for the game's whole lifetime — used consistently wherever the operator appears: the presence display of currently connected teammates and the selection indication on held snakes. The interface SHALL also show a connection-quality indicator measured entirely by the client itself.

#### Scenario: #same-colour-on-every-client
- **WHEN** two teammates each view the live interface
- **THEN** a given operator's presence entry and selection indication carry the identical colour on both clients, and the colour survives reload and reconnect — it is a pure function of (game, operator), never a per-session assignment

#### Scenario: #latency-is-client-measured
- **WHEN** connection quality is displayed
- **THEN** it comes from the client's own round-trip measurement against its game connection — no server-held state backs the indicator

### Requirement: operator-control/captain-boot
Depends on: global-invariants/team-granularity-authorization#within-team-discipline-lives-in-convex.

The team's Captain SHALL be able to boot a connected operator from the team's game session: the boot severs the operator's session connection exactly as a network disconnect would and writes no persistent operator state — no lockout, no flag, nothing requiring undo. The booted operator's interface SHALL tell them they were removed, and they MAY reconnect at any time, rejoining exactly as after a network drop. Boot SHALL be refused for any non-Captain caller — a within-team privilege Convex arbitrates — and non-Captains see no boot affordance.

#### Scenario: #no-sticky-lockout
- **WHEN** a booted operator reconnects immediately
- **THEN** they are admitted and rejoin normally — nothing persisted marks them as booted, and the Captain simply boots again if needed

#### Scenario: #boot-clears-nothing
- **WHEN** the booted operator held a snake in manual mode
- **THEN** the boot itself changes neither the selection record nor the manual flag — a teammate takes the snake by displacement, exactly as for any absent holder

#### Scenario: #captain-only
- **WHEN** a non-Captain invokes the boot operation by any means, interface or direct call
- **THEN** it is rejected, and no connected operator's session is severed
