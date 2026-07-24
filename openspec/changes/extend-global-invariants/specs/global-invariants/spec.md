## ADDED Requirements

### Requirement: global-invariants/state-confined-to-owning-runtime
Every piece of platform state SHALL exist only in its owning runtime: a game's SpacetimeDB instance holds, derives, and exposes nothing beyond that one game's state; Convex holds no copy of live game-runtime state — the one-time import of a finished game's complete record is the sole exception — and no web client persists authoritative state of its own across sessions. What a client shows is derived afresh from the owning runtimes.

#### Scenario: #convex-never-mirrors-a-live-game
- **WHEN** a game is in progress
- **THEN** Convex holds no mirror of its turn log, staged moves, per-turn snake states, or any other game-runtime state; the complete record arrives exactly once, when the game ends

#### Scenario: #game-instance-holds-only-its-games-state
- **WHEN** anything platform-wide — accounts, team records, other games, configuration beyond this game's own — is needed by any behaviour
- **THEN** it is not found in a game's SpacetimeDB instance; the instance's entire state is scoped to its one game and dies with it

#### Scenario: #clients-restart-clean
- **WHEN** a web client's session ends and a new session begins
- **THEN** no authoritative state survived in the client; everything the new session shows is re-derived from the owning runtimes

### Requirement: global-invariants/centaur-state-boundary
The Centaur subsystem within Convex SHALL be the sole persistent home of bot-side state — per-team configuration and per-game bot and operator coordination state — and SHALL hold nothing authoritative for game outcome. The game's SpacetimeDB instance SHALL never read or write Centaur state, and no Centaur-subsystem mutation SHALL write game-instance-owned state: a Server's bot compute meets the game only through the instance's own contract — staged moves inward, filtered subscriptions outward — never through Convex.

#### Scenario: #centaur-state-cannot-decide-a-game
- **WHEN** any Centaur-subsystem state is lost, altered, or unavailable
- **THEN** no committed game state or outcome changes — board, snakes, items, clocks, and turn history live solely in the game's instance and resolve without consulting the subsystem

#### Scenario: #bot-to-game-flow-never-routes-through-convex
- **WHEN** bot compute acts on a game or observes it
- **THEN** the only acting channel is staging moves in the game's instance and the only observing channel is the instance's filtered subscriptions; Convex is party to neither direction

### Requirement: global-invariants/transactional-invariant-enforcement
Every stated invariant over Convex-held records — uniqueness, exclusivity, and freeze rules alike — SHALL be enforced by a guard that runs inside the same serializable mutation as the write it protects, so that no interleaving of concurrent mutations can commit a violating state.

#### Scenario: #concurrent-mutations-cannot-race-past-a-guard
- **WHEN** two concurrently submitted mutations would jointly violate an exclusivity rule that either alone satisfies — such as two claims on something that admits one holder
- **THEN** at most one commits; the guard is evaluated within each mutation's own transaction, never as a separate earlier check whose result a concurrent commit can invalidate

### Requirement: global-invariants/game-instance-hermeticity
From initialisation to game end, a game's SpacetimeDB instance SHALL be hermetic: everything gameplay needs — rules, parameters, initial state, the team roster, seeds — is seeded at initialisation and never refreshed; the instance consults no external system during gameplay, and transmits nothing outward of its own accord until the game ends, when the game-end notification and delivery of the finished record are the sole sanctioned egress. Serving its own connected, authorized subscribers is the instance's contract, not egress; connection-token validation uses verification key material obtained at instance startup, not a per-connection external call.

#### Scenario: #seeded-once-never-refreshed
- **WHEN** the instance needs any datum during gameplay — a rule, a parameter, the roster, a seed
- **THEN** the datum is already present from initialisation; the instance issues no call to Convex, to any Server, or to any other system to obtain or refresh it, so nothing that changes elsewhere mid-game can reach a running game

#### Scenario: #no-egress-before-game-end
- **WHEN** a game is in progress
- **THEN** the instance transmits no gameplay or replay data to any external system on its own initiative; the first outward transmission is the game-end notification with the finished record

### Requirement: global-invariants/bot-compute-view-confinement
Bot compute acting for a team SHALL consume only that team's authorized, filtered view of that team's game — never another team's view and never another game's state — even when the Server running it legitimately holds other teams' credentials and views; and it SHALL NOT recover, through any side channel, state that the team's own view masks. Within a Server this confinement is bounded by global-invariants/server-trust-boundary: it binds the platform's compute implementations, not the operator.

#### Scenario: #co-hosted-teams-compute-apart
- **WHEN** one Server hosts two teams drawn into the same game
- **THEN** the compute acting for each team consumes only that team's filtered view; the Server's possession of the other team's credentials and view for its own hosting duties grants the compute no informational shortcut

#### Scenario: #masked-state-stays-masked
- **WHEN** part of the game state is masked from the team's authorized view
- **THEN** the compute does not read, subscribe to, or otherwise obtain the masked portion; its simulations and scores proceed from the filtered view alone

### Requirement: global-invariants/authenticated-unambiguous-identity
Every action that stages moves or mutates game, platform, or Centaur state SHALL be performed under an authenticated identity, and the kind of any identity platform code observes — human, Centaur Team, or derived game participant — SHALL be unambiguous. A team identifier seeded into a game instance SHALL denote exactly one persistent Convex team record for that game's entire lifetime.

#### Scenario: #no-anonymous-mutation-path
- **WHEN** a connection or call without an authenticated identity attempts any state-mutating action on any runtime
- **THEN** it is refused; no anonymous staging, game-state, platform-state, or Centaur-state mutation path exists

#### Scenario: #identity-kind-is-decidable
- **WHEN** platform code on any runtime receives an identity
- **THEN** the identity's kind is decidable without guesswork; no code path is obligated to handle an identity that could be more than one kind

#### Scenario: #instance-team-ids-resolve-uniquely
- **WHEN** any runtime resolves a team identifier found in a game's records, live or historical
- **THEN** it reaches exactly one persistent team record, the same one for the game's whole lifetime — the mapping never dangles, changes, or becomes ambiguous mid-game

### Requirement: global-invariants/credential-confinement
Credential and key material SHALL be transmitted only to its intended holder, over authenticated channels: the private keys that sign platform-issued tokens never leave the Convex deployment — every other runtime validates using only the published public verification keys — and a team's per-game credential is delivered on exactly one channel, the game invitation to that team's nominated Server.

#### Scenario: #signing-keys-never-leave-convex
- **WHEN** any other runtime must validate a platform-issued token
- **THEN** it does so with the published public verification keys; the private signing material is never transmitted outside Convex, on any channel, for any purpose

#### Scenario: #game-credential-has-one-delivery-path
- **WHEN** a per-team game credential is issued
- **THEN** the only channel that ever carries it is the invitation to the team's nominated Server; it appears in no other response, page, or transmission

### Requirement: global-invariants/one-contract-many-surfaces
Every mutation of platform or Centaur state, from any surface — the web application, any programmatic surface, or a Server acting under its game credentials — SHALL be dispatched against the owning runtime's server-side function contract and be subject to identical invariants; no surface has a private bypass. Operators SHALL act against that contract directly, under their own identity and connection — never routed through, or impersonated by, their team's Server.

#### Scenario: #every-surface-hits-the-same-invariants
- **WHEN** the same invariant-violating mutation is attempted from the web application and from a programmatic surface
- **THEN** both are rejected by the same server-side contract; parity is a property of the contract, not of each client's restraint

#### Scenario: #operators-never-proxy-through-the-server
- **WHEN** an operator reads or mutates Centaur state
- **THEN** they do so through their own Convex connection under their own identity; the team's Server is not an intermediary and cannot act as the operator

### Requirement: global-invariants/client-truthfulness
A client SHALL present only what the owning runtimes assert. Rejections by a server-side invariant are surfaced to the user as explicit feedback at the point of the action, never silently swallowed; an affordance gated by a server-side invariant derives its enabled state from server-held state, not client-side optimism; a lost subscription is surfaced rather than papered over with fabricated or stale state, and rendering resumes from fresh state on recovery; views over historical or archived entities render from persisted snapshots, presenting archived status explicitly rather than breaking.

#### Scenario: #rejections-reach-the-user
- **WHEN** a dispatched mutation is rejected by a server-side invariant
- **THEN** the user sees explicit, legible feedback at the point of the rejected action; the rejection is never swallowed

#### Scenario: #enablement-derives-from-server-state
- **WHEN** the client cannot yet derive an invariant-gated affordance's enablement from server-held state
- **THEN** it still dispatches the action and surfaces the authoritative result — it never simulates the invariant from client-held optimism, in either direction

#### Scenario: #subscription-loss-is-visible
- **WHEN** the client loses its subscription to any runtime
- **THEN** the loss is surfaced to the user and stale caches are not passed off as live state; on recovery the client resubscribes and renders from fresh state

#### Scenario: #archived-teams-still-render
- **WHEN** a view references a team that has since been archived
- **THEN** it renders from the persisted participating-team snapshot and presents the archived state explicitly — never a broken reference, and never a silent pretense that the team is live

## MODIFIED Requirements

### Requirement: global-invariants/team-granularity-authorization
SpacetimeDB SHALL authorise every game action at Centaur-Team granularity and no finer — a connection may act for a snake only if it is authorised for that snake's team, and SpacetimeDB holds no notion of individual operators — while Convex SHALL be the sole authority for all within-team coordination: which member may act, in what role, on which snake.

#### Scenario: #staging-is-team-checked
- **WHEN** the SpacetimeDB instance accepts a staged move
- **THEN** it checks only that the connection is authorised for the snake's Centaur Team — never which human or bot within the team is acting

#### Scenario: #within-team-discipline-lives-in-convex
- **WHEN** a team constrains which of its members may drive a snake
- **THEN** that rule is defined and enforced in Convex; SpacetimeDB neither knows nor checks it

### Requirement: global-invariants/security-enforced-outside-the-library
Every invariant that bounds what a Snek Centaur Server may do SHALL be enforced by SpacetimeDB (row-level security, reducer-level team checks, and OIDC validation of the access token) and by Convex function contracts — never by the Server library — and SHALL hold against a Server that speaks the raw SpacetimeDB and Convex protocols directly.

#### Scenario: #library-bypass-is-still-bound
- **WHEN** a team builds a Server from scratch, bypassing the provided library, and speaks the raw protocols
- **THEN** it is bound by exactly the same invariants, because enforcement lives in SpacetimeDB and Convex, not the library
