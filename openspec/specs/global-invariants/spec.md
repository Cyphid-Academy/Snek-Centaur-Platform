# global-invariants Specification

## Purpose

The cross-cutting invariants of the Team Snek platform — the rules that
constrain implementers of more than one capability or runtime and that no
single user-story capability owns. The platform runs on three kinds of
runtime: **Convex** (one persistent deployment), a **SpacetimeDB** instance
per started game (transient), and any number of **Snek Centaur Servers** (a
SvelteKit web application, one nominated per team). Every requirement here
binds at least two of them; each runtime's own behaviour — and every
user-facing workflow — belongs to the capability that owns it, which cites
the invariants here.

Admission test — a requirement belongs in this capability iff all three
hold: **(a)** it constrains implementers of two or more other capabilities
or runtimes; **(b)** no single user-story capability owns it; **(c)** it is
falsifiable — a future implementer could silently violate it. Anything
failing (c) is architecture narrative and belongs in a change's design.md;
anything failing (a) or (b) belongs in the capability that owns it.

Depends on: game-engine.

## Requirements

### Requirement: global-invariants/runtime-ownership
The platform SHALL comprise exactly three runtime kinds — the single Convex deployment, per-game SpacetimeDB instances, and Snek Centaur Servers — and every piece of platform behaviour SHALL belong to exactly one of them, acting within its own lifecycle and ownership scope, never duplicated across runtimes and never split so that two runtimes each hold partial authority over it.

#### Scenario: #each-behaviour-has-one-home
- **WHEN** any behaviour runs — persisting a game record, resolving a turn, or computing a bot move
- **THEN** it runs in exactly one runtime: Convex for persistent state and coordination, the game's SpacetimeDB instance for authoritative gameplay, a Snek Centaur Server for bot compute

### Requirement: global-invariants/single-convex-deployment
There SHALL be exactly one Convex deployment for the whole platform, and it SHALL be the sole home of every piece of state that outlives a single game — user accounts, Centaur Team records, rooms, game records, replays, game configuration, and per-team Centaur-subsystem state.

#### Scenario: #cross-record-invariants-are-one-transaction
- **WHEN** an invariant spans more than one Convex record — e.g. a rule relating a team's records to a game's records
- **THEN** a single Convex mutation can enforce it transactionally, because all persistent state lives in one deployment; this is why "exactly one" is load-bearing, not incidental

### Requirement: global-invariants/spacetimedb-instance-isolation
SpacetimeDB instances SHALL be isolated from one another: no instance has read or write access to another game's instance.

#### Scenario: #a-compromised-server-cannot-cross-games
- **WHEN** a Snek Centaur Server authenticated to game X's SpacetimeDB instance tries to read or write game Y's instance
- **THEN** it cannot — the instances are separate SpacetimeDB databases sharing no state; the isolation is a security boundary, not an optimisation

### Requirement: global-invariants/authoritative-turn-resolution
Depends on: game-engine/turn-resolution-model.

The game's SpacetimeDB instance SHALL be the sole authoritative executor of turn resolution, running the shared engine's `resolveTurn` inside its turn-resolution reducer as one ACID transaction; no other runtime's execution of the engine produces committed game state.

#### Scenario: #turn-resolution-is-atomic
- **WHEN** the turn-resolution reducer runs
- **THEN** either the whole turn commits and is observable, or the reducer rolls back and nothing changes

#### Scenario: #server-simulation-is-not-authoritative
- **WHEN** a Snek Centaur Server runs the same engine to simulate candidate worlds for bot decisions
- **THEN** its output is never committed as game state; only the SpacetimeDB instance's resolution is

### Requirement: global-invariants/one-shared-engine
Depends on: game-engine/runtime-portability.

The SpacetimeDB game module, the Convex deployment, the Snek Centaur Server, and the SvelteKit web clients SHALL each obtain the rules by consuming the one shared `game-engine` build directly; none SHALL reimplement its domain types or turn-resolution algorithm, and the engine SHALL stay pluggable into all four.

#### Scenario: #no-parallel-implementation
- **WHEN** any runtime needs turn resolution or the domain vocabulary — SpacetimeDB to resolve a turn, Convex to validate a configuration against the engine's schema, a Server to simulate, a web client to pre-validate a move
- **THEN** it calls the shared `game-engine` build, never a parallel copy that could drift from the authoritative rules

### Requirement: global-invariants/team-granularity-authorization
SpacetimeDB SHALL authorise every game action at Centaur-Team granularity and no finer — a connection may act for a snake only if it is authorised for that snake's team, and SpacetimeDB holds no notion of individual operators — while Convex SHALL be the sole authority for all within-team coordination: which member may act, in what role, on which snake. The same team granularity SHALL bound observation: a connection observes other teams' state only through the instance's filtered views, and a spectator connection is authorised to observe no team's private state and to stage nothing.

#### Scenario: #staging-is-team-checked
- **WHEN** the SpacetimeDB instance accepts a staged move
- **THEN** it checks only that the connection is authorised for the snake's Centaur Team — never which human or bot within the team is acting

#### Scenario: #within-team-discipline-lives-in-convex
- **WHEN** a team constrains which of its members may drive a snake
- **THEN** that rule is defined and enforced in Convex; SpacetimeDB neither knows nor checks it

#### Scenario: #spectators-hold-no-private-state
- **WHEN** a spectator connection reads or subscribes
- **THEN** it receives only the filtered public view — no team's private state reaches it, and it can stage or alter nothing

### Requirement: global-invariants/security-enforced-outside-the-library
Every invariant that bounds what a Snek Centaur Server — or any client of the platform — may do SHALL be enforced by SpacetimeDB (row-level security, reducer-level team checks, and OIDC validation of the access token) and by Convex function contracts — never by the Server library, and never by what any application chooses to present or hide — and SHALL hold against a Server that speaks the raw SpacetimeDB and Convex protocols directly.

#### Scenario: #library-bypass-is-still-bound
- **WHEN** a team builds a Server from scratch, bypassing the provided library, and speaks the raw protocols
- **THEN** it is bound by exactly the same invariants, because enforcement lives in SpacetimeDB and Convex, not the library

#### Scenario: #customised-app-changes-no-invariant
- **WHEN** a team customises its forked application — hiding affordances, adding new ones, or altering what the interface appears to permit
- **THEN** every security and correctness invariant holds unchanged, because none is enforced by any application's presentation layer

### Requirement: global-invariants/server-trust-boundary
A Snek Centaur Server MAY host several Centaur Teams at once, including opponents in the same game; the Server operator SHALL be understood to have full access to every hosted team's strategy and state, and any isolation between co-hosted teams SHALL be treated as a best-effort application-level boundary the operator can bypass — never a security guarantee.

#### Scenario: #same-game-opponents-may-share-a-server
- **WHEN** two teams that nominate the same Server are drawn into one game
- **THEN** the Server may host both; the players accept that the operator sees both teams' bot strategies

#### Scenario: #tenant-isolation-is-best-effort
- **WHEN** a Server hosts multiple teams
- **THEN** it may isolate their bot compute at the application level, but no capability may promise that isolation as a security property — the operator can bypass it

### Requirement: global-invariants/ephemeral-game-credentials
A Snek Centaur Server SHALL hold platform credentials only per hosted team and per game, only short-lived, and only earned afresh: each names one team and one game, expires within minutes, and is obtainable only by the Server proving control of the domain that team has named as its home. A Server SHALL hold no credential spanning two hosted teams, none spanning two games, and no privilege of its own; platform data shown to a visitor comes through the visitor's own connection, never the Server's.

#### Scenario: #no-credentials-at-rest
- **WHEN** no game a Server hosts is active
- **THEN** it holds no platform credential, no game connection, and no subscription of its own; what it keeps at rest is its own signing key, from which it earns credentials again when a game needs it to

#### Scenario: #credentials-are-earned-afresh
- **WHEN** a Server's credential for a hosted team's game expires mid-game
- **THEN** it obtains another only by proving control of that team's home domain again — nothing it holds at rest authenticates it, so a Server that loses its standing to operate a team stops operating it within one credential's lifetime

#### Scenario: #no-standing-server-privilege
- **WHEN** a Server is examined for what it may do in its own right
- **THEN** it may do nothing: every credential it holds confers authority for one hosted team, and names the Server only so the team's actions can be attributed to the domain that took them

#### Scenario: #per-team-credentials-never-merge
- **WHEN** a Server hosts several teams in one game
- **THEN** it acts for each team only under that team's own credentials — co-tenancy never merges into a broader privilege

### Requirement: global-invariants/access-follows-identity
A user's read access to platform data SHALL be determined solely by their own platform identity and never by which Snek Centaur Server they visit — every Server serves the same web application backed by the one platform Convex deployment, so a user sees the same data everywhere — and no Server deployment SHALL hold platform privilege that any other lacks.

#### Scenario: #same-data-regardless-of-server
- **WHEN** the same user opens two different Snek Centaur Servers
- **THEN** they see the same platform data — access followed their own platform identity through their own connection, not the Server

#### Scenario: #reference-deployment-has-no-special-privilege
- **WHEN** a Cyphid-operated Server serves the platform — the socially-canonical reference deployment among them
- **THEN** it uses the same platform APIs as any other Server, with no special privilege, and another community may run its own platform deployment and canonical Server

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
Every stated invariant over records held by an authoritative store — the Convex deployment platform-wide, and a game's SpacetimeDB instance for the duration of that one game — SHALL be enforced by a guard that runs inside the same serializable transaction as the write it protects, whether that is a Convex mutation or an instance reducer, so that no interleaving of concurrent writes can commit a violating state. Uniqueness, exclusivity, and freeze rules are alike in this.

#### Scenario: #concurrent-mutations-cannot-race-past-a-guard
- **WHEN** two concurrently submitted mutations would jointly violate an exclusivity rule that either alone satisfies — such as two claims on something that admits one holder
- **THEN** at most one commits; the guard is evaluated within each mutation's own transaction, never as a separate earlier check whose result a concurrent commit can invalidate

#### Scenario: #both-stores-guard-their-own-invariants
- **WHEN** the invariant is over a game instance's own records rather than Convex's — an idempotent turn declaration, a once-only resolution trigger, an aggregate written with the turn it summarises
- **THEN** the guard runs inside that instance's reducer transaction, on the same terms: each store enforces the invariants over the records it is authoritative for, and neither defers a guard to the other

### Requirement: global-invariants/game-instance-hermeticity
From initialisation to game end, a game's SpacetimeDB instance SHALL be hermetic: everything gameplay needs — rules, parameters, initial state, the team roster, seeds — is seeded at initialisation and never refreshed; the instance consults no external system during gameplay, and transmits nothing outward of its own accord until the game ends, when the game-end notification and delivery of the finished record are the sole sanctioned egress. Serving its own connected, authorized subscribers is the instance's contract, not egress; connection-token validation uses verification key material obtained at instance startup, not a per-connection external call.

#### Scenario: #seeded-once-never-refreshed
- **WHEN** the instance needs any datum during gameplay — a rule, a parameter, the roster, a seed
- **THEN** the datum is already present from initialisation; the instance issues no call to Convex, to any Server, or to any other system to obtain or refresh it, so nothing that changes elsewhere mid-game can reach a running game

#### Scenario: #no-egress-before-game-end
- **WHEN** a game is in progress
- **THEN** the instance transmits no gameplay or replay data to any external system on its own initiative; the first outward transmission is the game-end notification with the finished record

### Requirement: global-invariants/bot-compute-view-confinement
Depends on: global-invariants/server-trust-boundary.

Bot compute acting for a team SHALL consume only that team's authorized, filtered view of that team's game — never another team's view and never another game's state — even when the Server running it legitimately holds other teams' credentials and views; and it SHALL NOT recover, through any side channel, state that the team's own view masks. Within a Server this confinement is bounded by the Server trust boundary: it binds the platform's compute implementations, not the operator.

#### Scenario: #co-hosted-teams-compute-apart
- **WHEN** one Server hosts two teams drawn into the same game
- **THEN** the compute acting for each team consumes only that team's filtered view; the Server's possession of the other team's credentials and view for its own hosting duties grants the compute no informational shortcut

#### Scenario: #masked-state-stays-masked
- **WHEN** part of the game state is masked from the team's authorized view
- **THEN** the compute does not read, subscribe to, or otherwise obtain the masked portion; its simulations and scores proceed from the filtered view alone

### Requirement: global-invariants/authenticated-unambiguous-identity
Every action that stages moves or mutates game, platform, or Centaur state SHALL be performed under an authenticated identity, and the kind of any identity platform code observes — human, Centaur Team, external system, or derived game participant — SHALL be unambiguous and drawn from a closed enumeration. A team identifier seeded into a game instance SHALL denote exactly one persistent platform team record for that game's entire lifetime.

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
Private key material SHALL never leave the party that generated it: the keys signing the platform's tokens stay inside the platform's Convex deployment, a Snek Centaur Server's signing key stays on that Server, and every other party validates using published public material alone. An issued credential SHALL be returned only to the party whose own authentication earned it, in the response to that exchange, and SHALL travel on no other channel.

#### Scenario: #signing-keys-never-leave-convex
- **WHEN** any other runtime must validate a platform-issued token
- **THEN** it does so with the published public verification keys; the private signing material is never transmitted outside the platform's Convex deployment, on any channel, for any purpose

#### Scenario: #every-party-keeps-its-own-key
- **WHEN** a party in the trust chain authenticates by signing
- **THEN** the key it signs with was generated where it lives and has never been transmitted; what every other party holds of it is the published public half

#### Scenario: #credentials-return-only-to-the-requester
- **WHEN** a credential is issued
- **THEN** it reaches its holder in the response to the exchange that authenticated the request, and appears in no other response, page, message, or transmission

### Requirement: global-invariants/team-private-centaur-state
A team's Centaur-subsystem state — its configuration, its per-game bot and operator coordination state, and the recorded outputs of its bot's deliberation — SHALL be readable only by that team's own members and the identities the platform grants a team's read scope, never by another competing team, for as long as the competition it belongs to is live. Read authorization SHALL be enforced by the Centaur subsystem's own function contract, and no surface SHALL widen it.

#### Scenario: #opponent-cannot-read-deliberation
- **WHEN** an operator of one team requests another team's recorded deliberation for a game in progress — heuristic weights, portfolio state, worst-case worlds, or any other computed display state
- **THEN** the request is refused; a team's reasoning is private to it while the game is live, exactly as its staged moves and filtered view are

#### Scenario: #finished-games-release-only-what-is-published
- **WHEN** a game has finished and its record is public
- **THEN** what becomes readable is what the platform publishes as that game's record and replay — not the losing team's private configuration, which stays team-scoped regardless of game state

### Requirement: global-invariants/one-contract-many-surfaces
Every mutation of platform or Centaur state, from any surface — the web application, any programmatic surface, or a Server acting under a hosted team's credentials — SHALL be dispatched against the owning runtime's server-side function contract and be subject to identical invariants; no surface has a private bypass. A human SHALL act against that contract directly, under their own identity and connection — never routed through, impersonated by, or acting on a credential held by any service component, their team's Server included.

#### Scenario: #every-surface-hits-the-same-invariants
- **WHEN** the same invariant-violating mutation is attempted from the web application and from a programmatic surface
- **THEN** both are rejected by the same server-side contract; parity is a property of the contract, not of each client's restraint

#### Scenario: #operators-never-proxy-through-the-server
- **WHEN** an operator reads or mutates Centaur state
- **THEN** they do so through their own connection under their own identity; no service component is an intermediary, and none can act as them

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

### Requirement: global-invariants/no-shared-secrets
Authentication within the platform's own trust chain — the Convex deployment, a game's SpacetimeDB instance, a Snek Centaur Server, a registered external system — SHALL rest on asymmetric signatures alone: a credential is either an assertion the presenting party signed with a private key it alone holds, or a token an authority signed for it, and in both cases the receiver decides by verifying the signature against published public material rather than by comparing against a stored copy. No symmetric key, client secret, or long-lived bearer key SHALL be generated, stored, transmitted, or seeded anywhere to authenticate a party in that chain. Where the platform is instead the *client* of a third-party service whose protocol admits no asymmetric client authentication, the secret that protocol requires MAY be held: it SHALL authenticate the platform outward to that one service only, SHALL confer no authority inside the trust chain, and SHALL never stand in for a credential this invariant governs.

#### Scenario: #no-secret-at-rest
- **WHEN** any runtime's stored state is examined for what would let it authenticate as, or on behalf of, another party in the trust chain
- **THEN** it holds only its own private key and other parties' public material — nothing it shares with anyone, so disclosure of everything it holds forges no credential the platform would honour

#### Scenario: #third-party-protocols-may-require-a-secret
- **WHEN** the platform integrates a third-party service whose protocol requires a shared client secret — a consumer identity provider's authorization-code exchange, for example
- **THEN** that secret may be held, scoped to that service alone: it proves the platform is itself to an outside party, grants nothing to anyone inside the chain, and cannot be presented to any resource holder here as authority

#### Scenario: #no-secret-configured-into-a-component
- **WHEN** a new party joins the trust chain — a game instance, a Snek Centaur Server, an external system, an automation
- **THEN** nothing secret is generated for it, sent to it, or configured into it: it holds a key it generated and publishes the public half, and registering it means recording where that public material is found

### Requirement: global-invariants/issuer-anchored-trust
Every party holding a protected resource — the platform's Convex deployment, a game's SpacetimeDB instance, a Snek Centaur Server — SHALL define what it trusts as a set of issuers, each recorded together with the public material verifying its signatures and the ceiling of capabilities it may confer, and SHALL honour a presented credential only for capabilities within its issuer's recorded ceiling. Recognising an issuer's signature SHALL establish only that the credential is authentic; what the credential claims about its own authority is never the answer.

#### Scenario: #ceiling-is-checked-at-the-resource
- **WHEN** a credential arrives carrying capabilities beyond its issuer's recorded ceiling
- **THEN** the resource holder refuses them itself — the ceiling is enforced where the resource lives, never delegated to the issuer's self-restraint, because the case it exists for is an issuer that has stopped restraining itself

#### Scenario: #recognition-is-not-authorization
- **WHEN** an issuer is added to a resource holder's trust set
- **THEN** nothing already protected becomes reachable by that act alone; every capability the issuer may confer is recorded explicitly alongside it, so trusting one more issuer can never silently widen what the resource holder exposes

#### Scenario: #authority-only-narrows
- **WHEN** an issuer mints a credential for one caller and one purpose
- **THEN** it may name any subset of its own ceiling and nothing outside it; delegation at any depth narrows, and no hop in a chain holds more than the hop before it

### Requirement: global-invariants/durable-identity-references
Every identity that any runtime records or transmits — in credentials, in game records, in attributions, in logs — SHALL be named by the platform's own durable identifier for it, never by an external provider's subject, an email address, or any other attribute the platform does not control. An external credential's own identifiers SHALL appear only where that credential is being resolved to the identity behind it.

#### Scenario: #provider-change-breaks-no-record
- **WHEN** the external credential behind a human identity is replaced with a different one
- **THEN** every record naming that human still resolves to them, because none of them ever named the credential — the replacement touches only the credential's own record

#### Scenario: #derived-identities-inherit-durability
- **WHEN** another runtime derives its own identity for a principal from a presented credential's subject
- **THEN** that derived identity is stable across any change of the principal's external credentials, because the subject carried the platform's durable identifier rather than the provider's
