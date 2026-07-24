# Module 02 — Parked Requirements

Module 02 migrated **partially**: its cross-cutting invariants became the
`global-invariants` capability (see the `mint-global-invariants` change);
the requirements below are **parked** — still binding in
`legacy-spec-archive/spec/02-platform-architecture.md`, waiting for the
prospective user-story capability named on each entry (see
[`capability-map.md`](capability-map.md)).

Backticked module-02 ids below mark parked ids for
`scripts/spec-migration/audit-module.mjs` (see [`README.md`](README.md));
other ids are written in plain text deliberately.

Each entry preserves the requirement text drafted during the module-02
migration (draft only — the legacy text is what binds). Scenario drafts are
kept where they existed.

## → game-lifecycle

### Per-game SpacetimeDB instance
Legacy: `02-REQ-003`, `02-REQ-019`, `02-REQ-020`, `02-REQ-021`

> Each started game SHALL be served by its own freshly provisioned
> SpacetimeDB instance, provisioned by Convex at launch and torn down after
> the game ends; a game that has not been launched has no instance, and no
> instance is ever reused across games.
>
> Scenarios: no instance before launch; a fresh instance on every launch
> path (first in a room, auto-created successor, tournament round);
> teardown only after Convex persists the replay.

### Game record lifecycle
Legacy: `02-REQ-021` (walkover semantics; forward-only status)

> A Convex game record SHALL advance only forward through `not-started →
> playing → finished`, with Convex as the sole authority for the value: at
> launch Convex freezes the configuration and provisions the SpacetimeDB
> instance, and the game reaches `finished` only after the instance's
> game-end notification and the replay's persistence. A launch that cannot
> seat the minimum number of Centaur Teams needed to play SHALL take the
> record straight to `finished` without it ever entering `playing`.
>
> Scenarios: status only moves forward; a walkover tears down any
> uninitialised instance without resolving a turn (how many teams is
> "enough" is owned by launch orchestration).
>
> Note: terminal-state term settled as `finished` (code currently says
> `ended`; aligned when this graduates or when the code citation conversion
> lands, whichever first).

### Replay persisted on push
Legacy: `02-REQ-022`, `02-REQ-022a` (also feeds replay-and-audit)

> At game end Convex SHALL obtain the complete game log from the
> SpacetimeDB instance and write the replay before tearing the instance
> down; Convex SHALL hold no live gameplay subscription to any SpacetimeDB
> instance and SHALL learn of a game's terminal state only from a
> notification the instance pushes to it.
>
> Scenarios: Convex is notified, not polling; replay persisted before
> teardown.

### Successor auto-creation
Legacy: `02-REQ-051`

> When a game ends, Convex SHALL create its successor as a new
> `not-started`, mutable game record inheriting the predecessor's
> configuration, with no SpacetimeDB instance provisioned until the
> successor is itself launched; uniform across tournament and
> non-tournament rooms.

## → game-configuration

### Config frozen at launch
Legacy: `02-REQ-050`

> A game's configuration SHALL be a mutable Convex record before launch and
> frozen immutable at launch for the rest of the game's life; Convex SHALL
> consume the board-generation parameters by running the shared engine's
> `generateBoardAndInitialState` to produce the initial board and state,
> and SHALL pass only the dynamic gameplay parameters together with that
> precomputed initial state to the SpacetimeDB instance.
>
> Scenarios: immutable after launch; board-generation parameters never
> reach SpacetimeDB.

## → identity-and-authorization

### Identity infrastructure in Convex
Legacy: `02-REQ-016`

> Convex SHALL host all identity and credential infrastructure for the
> platform — Google OAuth for humans, the game-start credential issuance
> for Snek Centaur Servers, and the SpacetimeDB access tokens that
> authorise connections to game instances.
>
> Natural home: module 03's migration (legacy 03 remains binding for the
> mechanism meanwhile).

## → live-game-observation

### Real-time state sync
Legacy: `02-REQ-009`

> The SpacetimeDB instance SHALL deliver committed state changes to its
> subscribed clients in real time through SpacetimeDB subscription queries,
> without per-turn polling.

### Invisibility filtered by RLS
Legacy: `02-REQ-010`

> Filtering of invisible snakes SHALL be performed by SpacetimeDB Row-Level
> Security at the data layer, keyed on the querying connection's Centaur
> Team, so that no opposing or unaffiliated connection can observe an
> invisible snake even if it bypasses the Server library and speaks the raw
> SpacetimeDB protocol.
>
> Scenarios: opponents cannot see invisible snakes (per
> game-engine/invisibility); spectators are treated as opponents of every
> team; raw-protocol connections are filtered identically.
>
> Note: the *data-layer enforcement* principle is already covered by
> global-invariants/security-enforced-outside-the-library; what parks here
> is the invisibility feature's own visibility semantics.

## → operator-control

### Staged-move mechanics
Legacy: `02-REQ-011`, `02-REQ-012`

> Drafted: last-write-wins per snake within a turn; staged moves consumed
> and cleared in the same transaction that resolves the turn.
>
> ⚠️ Reconciliation needed before this graduates: the author's intent is an
> **append-only per-turn staged-moves log, never deleted** — consistent
> with 04-REQ-025 (plain text; binding in module 04) — with
> last-write-wins as the *effective-move* semantics over that log, not as
> destructive overwrite. The legacy 02 text ("clear them") must be
> reconciled with the 04 log model when the owning capability is authored.

### Selection discipline
Legacy: `02-REQ-018`

> Convex SHALL maintain at most one operator per snake and at most one
> snake per operator.
>
> (The authority split itself — SpacetimeDB team-granularity only, Convex
> owns within-team coordination — graduated to
> global-invariants/team-granularity-authorization from 02-REQ-017.)

### Client connection topology
Legacy: `02-REQ-038`, `02-REQ-039`, `02-REQ-040`, `02-REQ-041` (spectator half feeds live-game-observation)

> Human operators SHALL connect directly to their game's SpacetimeDB
> instance (to observe state under RLS and to stage moves) and separately
> to Convex (for selection, Drive assignments, and the action log), with
> the operator interface served by the team's nominated Server; spectators
> SHALL connect to the SpacetimeDB instance read-only using a spectator
> access token.
>
> Scenarios: an operator holds two independently authenticated connections;
> the operator UI is served by the nominated Server; a spectator token
> authorises subscription but no reducer calls.

## → replay-and-audit

### Replay-sufficient game log
Legacy: `02-REQ-013`, `02-REQ-014`

> The SpacetimeDB instance SHALL retain the complete per-turn record of its
> game for the game's lifetime, in turn-keyed tables sufficient to
> reconstruct any prior turn without consulting Convex; the full log is
> exported to Convex once, at game end.
>
> (Review-driven edit already applied to this draft: the "SHALL NOT post
> game state to Convex per turn" negative clause was dropped — the positive
> once-at-game-end statement carries the requirement.)

### Finished games readable by all
Legacy: `02-REQ-065`

> Every finished game's full within-turn record (all teams' action-log
> entries and stateMap snapshots) SHALL be readable by every authenticated
> user; a game in progress SHALL NOT be readable through the replay
> surface.

## → team-server-management

### Server nomination
Legacy: `02-REQ-005`, `02-REQ-006`, `02-REQ-052`

> A Centaur Team's captain SHALL nominate a Snek Centaur Server domain on
> the team's Convex record unilaterally — no acceptance from the Server is
> required; a team SHALL NOT join a game without a nominated Server; and
> the team-to-Server relationship SHALL be many-to-many over time but
> exactly one Server per team per game.

### Static web host outside games
Legacy: 02-REQ-055 residue, plain-text deliberately — the id gets a map
entry for its no-credentials half (graduated to
global-invariants/ephemeral-game-credentials), and a mapped id cannot also
be parked; the entry's note records this residue.

> Outside of active games a Snek Centaur Server serves the Snek Centaur
> Server web application as a static host; visitors' platform data comes
> through their own Convex connections.

### Server healthcheck
Legacy: `02-REQ-029`

> Every Snek Centaur Server SHALL expose a healthcheck endpoint that Convex
> and the lobby can call to report the Server's availability.

### Deferred module-08 residue
Legacy: `02-REQ-043`, `02-REQ-059`, `02-REQ-064`

> Not drafted — architectural residue of the server app, authored when its
> owning capability is carved (expected out of module 08's substance).

## → decision-transparency

### Extensible Centaur state slots
Legacy: none (constraint-mined during the module-02 migration)

> The Convex Centaur-subsystem schema SHALL provide standardized, bounded
> slots — a per-snake computed-display-state record and an append-only
> action log — into which a hosting Server records its teams' bot decision
> and analysis outputs, so that a team running novel bot logic produces
> recorded, replayable data within those fixed slots without any per-team
> change to the Convex schema.
