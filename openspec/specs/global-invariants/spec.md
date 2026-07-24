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
The game's SpacetimeDB instance SHALL be the sole authoritative executor of turn resolution, running the shared engine's `resolveTurn` inside its turn-resolution reducer as one ACID transaction; no other runtime's execution of the engine produces committed game state.

#### Scenario: #turn-resolution-is-atomic
- **WHEN** the turn-resolution reducer runs
- **THEN** either the whole turn (per game-engine/turn-resolution-model) commits and is observable, or the reducer rolls back and nothing changes

#### Scenario: #server-simulation-is-not-authoritative
- **WHEN** a Snek Centaur Server runs the same engine to simulate candidate worlds for bot decisions
- **THEN** its output is never committed as game state; only the SpacetimeDB instance's resolution is

### Requirement: global-invariants/one-shared-engine
The SpacetimeDB game module, the Snek Centaur Server, and the SvelteKit web clients SHALL each obtain the rules by consuming the one shared `game-engine` build directly; none SHALL reimplement its domain types or turn-resolution algorithm, and the engine SHALL stay pluggable into all three (see game-engine/runtime-portability).

#### Scenario: #no-parallel-implementation
- **WHEN** any runtime needs turn resolution or the domain vocabulary — SpacetimeDB to resolve a turn, a Server to simulate, a web client to pre-validate a move
- **THEN** it calls the shared `game-engine` build, never a parallel copy that could drift from the authoritative rules

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

### Requirement: global-invariants/server-trust-boundary
A Snek Centaur Server MAY host several Centaur Teams at once, including opponents in the same game; the Server operator SHALL be understood to have full access to every hosted team's strategy and state, and any isolation between co-hosted teams SHALL be treated as a best-effort application-level boundary the operator can bypass — never a security guarantee.

#### Scenario: #same-game-opponents-may-share-a-server
- **WHEN** two teams that nominate the same Server are drawn into one game
- **THEN** the Server may host both; the players accept that the operator sees both teams' bot strategies

#### Scenario: #tenant-isolation-is-best-effort
- **WHEN** a Server hosts multiple teams
- **THEN** it may isolate their bot compute at the application level, but no capability may promise that isolation as a security property — the operator can bypass it

### Requirement: global-invariants/ephemeral-game-credentials
A Snek Centaur Server SHALL hold platform credentials only per team and per game — issued by Convex at game start, scoped to that team and that game, and expiring when the game ends. Outside its hosted teams' active games a Server SHALL hold no Convex credentials, no SpacetimeDB connections, and no standing privilege; platform data shown to a visitor then comes through the visitor's own Convex connection.

#### Scenario: #no-credentials-at-rest
- **WHEN** no game the Server hosts is active
- **THEN** the Server holds no Convex credentials, no SpacetimeDB connections, and no subscriptions of its own

#### Scenario: #game-credentials-expire
- **WHEN** a game the Server hosts ends
- **THEN** that game's per-team credentials expire and the Server returns to holding none

#### Scenario: #per-team-credentials-never-merge
- **WHEN** a Server hosts several teams in one game
- **THEN** it acts for each team only under that team's own credentials — co-tenancy never merges into a broader privilege

### Requirement: global-invariants/access-follows-identity
A user's read access to platform data SHALL be determined solely by their Google identity and never by which Snek Centaur Server they visit — every Server serves the same web application backed by the one Convex deployment, so a user sees the same data everywhere — and no Server deployment SHALL hold Convex privilege that any other lacks.

#### Scenario: #same-data-regardless-of-server
- **WHEN** the same user opens two different Snek Centaur Servers
- **THEN** they see the same platform data — access followed their Google identity through their own Convex connection, not the Server

#### Scenario: #reference-deployment-has-no-special-privilege
- **WHEN** the socially-canonical reference deployment (e.g. snek-centaur.cyphid.org) serves the platform
- **THEN** it uses the same Convex APIs as any other Server, with no special privilege, and another community may run its own Convex deployment and canonical Server
