# Team Snek Centaur Platform — Specification

This repository contains the formal specification for the Team Snek Centaur
Platform: a team-based multiplayer snake game built as the first title on
Cyphid Academy's **Battle Bunker** educational program. The platform is
specified here in detail; none of it is implemented yet. This README is
written for the engineers who will build it.

## The Centaur Thesis

Cyphid Academy's wager is that discrete test-based education is dead in the
age of AI. AI commoditizes performance in static metrics: any task whose
output can be graded against a rubric is, increasingly, a task at which a
model is competitive with or better than the humans being trained on it.
Battle Bunker is a response — an educational program that trains gifted
children to collaborate with AI and with each other in novel competitive
games where both human and AI strengths offer marginal value *even when
access to AI is unrestricted*.

The framing analogy is modern warfare, where AI-controlled hardware is
pushing human attention up the conceptual stack. Operators no longer aim
guns; they direct fleets. Pilots no longer fly aircraft; they direct
swarms. The corresponding educational paradigm is one where humans learn
to operate at strategic altitude *over* AI micromanagers — guiding their
priorities, overruling them when judgment matters, and otherwise leaving
them to execute. The archetype is the **centaur**: a single competitive
agent in which a human rider directs an animal body whose physical
capabilities exceed their own.

Team Snek operationalises this. Every team in the game is a Centaur Team:
bot-by-default, with humans selectively overriding individual snakes only
when their judgment adds marginal value. There are no purely human teams.
There is no setting that disables the bot. The bot is the body; the human
operators are the rider; collaboration between them is the skill being
trained. The platform's job is to make that collaboration legible, fluent,
and worth practicing.

This commitment is the load-bearing rule the entire stack is shaped to
enforce. Several decisions in the architecture below — the mandatory
per-team Centaur Server, selection-as-a-viewing-affordance distinct from
manual override, anytime worst-case bot evaluation that runs continuously
in the background, sub-turn replay fidelity that captures every
configuration change as it happened — only make sense once you accept that
humans guiding bots, not humans driving snakes directly, is the central
play pattern.

## Architecture at a Glance

The platform comprises three runtimes plus a shared TypeScript engine
codebase consumed by all of them. Detailed module references are in the
[Reading Guide](#reading-guide); this section is the high-altitude map.

### SpacetimeDB (per-game, transient)

Authoritative game logic runs as a TypeScript SpacetimeDB module deployed
once per game and torn down at game end. Each turn resolves as a single
ACID transaction running the eleven-phase pipeline (move collection →
movement → collision detection → effect scheduling → health/hazards/food
→ potion collection → food spawning → potion spawning → effect
application → win check → event emission). Real-time state synchronisation
to all connected clients is automatic via subscription queries.

The schema is **append-only and turn-keyed**: snake states, item
lifetimes, time budgets, and turn events are written as new rows per turn,
never mutated. Any historical board state is reconstructable by querying
with the appropriate turn number, which is what enables both client-side
timeline scrubbing and end-of-game replay export with no per-turn posting
to Convex during play. **Invisibility is enforced at the data layer via
Row Level Security** — invisible snakes still collide, sever, and score
identically to visible snakes server-side; opponents simply do not receive
those rows. Specified in [`specs/04-stdb-engine.md`](specs/04-stdb-engine.md).

### Convex (global, persistent)

A single Convex deployment is the platform's control plane and long-lived
persistence layer. It owns user accounts, Centaur Teams, rooms, game
records, replays, API keys, the platform HTTP API, and all per-team
Centaur subsystem state (snake portfolios, drives, bot parameters, action
logs). It is the OAuth identity anchor and acts as the **OIDC issuer**
for SpacetimeDB access tokens — a single platform-wide RSA key pair signs
all game-scoped JWTs, and SpacetimeDB validates them via standard
`/.well-known/openid-configuration` discovery. No per-instance secret
distribution is required.

Convex orchestrates the entire game lifecycle: it provisions SpacetimeDB
instances, generates and seeds the board (board generation is pure
TypeScript in a Convex mutation; SpacetimeDB only validates state it
receives), invites the participating Centaur Servers, and persists the
replay log pushed back to it on game end. Teams and rooms are
archive-only — never deleted — to preserve historical attribution and
unbroken leaderboard presence. Specified in
[`specs/05-convex-platform.md`](specs/05-convex-platform.md) (platform
state) and [`specs/06-centaur-state.md`](specs/06-centaur-state.md)
(per-team state).

### Snek Centaur Servers (per-team, semi-stateless)

The client-serving and bot-computation tier. Outside games, a Snek Centaur
Server is a static web host serving the unified SvelteKit application,
with no Convex credentials and no SpacetimeDB connections of its own —
all data the user sees comes from their own direct Convex client connection
authenticated by their Google identity.

During games the server additionally runs bot computation for each Centaur
Team it has been invited to host. The handshake is one-way: when a game
starts, Convex POSTs an invitation to the server's well-known endpoint
(`POST /.well-known/snek-game-invite`) carrying a per-Centaur-Team game
credential — an Ed25519-signed JWT scoped to one team and one game. The
server uses that credential to subscribe to SpacetimeDB and write to
Convex on the team's behalf. A single server can host multiple teams
simultaneously with tenant-isolated bot compute per team. The
relationship is captain-declared and unilateral: a captain nominates a
server domain in their team configuration and trust flows from there;
no acceptance from the server is required outside the per-game
invitation handshake. Specified across
[`specs/02-platform-architecture.md`](specs/02-platform-architecture.md),
[`specs/07-bot-framework.md`](specs/07-bot-framework.md), and
[`specs/08-centaur-server-app.md`](specs/08-centaur-server-app.md).

### Cross-cutting choices worth flagging

- **Shared engine codebase.** Game state types, turn resolution, and move
  validation live in one TypeScript codebase consumed by SpacetimeDB
  (authoritative), Snek Centaur Servers (simulation for the bot's lookahead),
  and the web client (pre-validation). There are no parallel
  implementations of game logic.
- **Identity model.** Two persistent identity types (human, Centaur Team)
  plus one derived game-participant type. **Email is canonical for humans**
  rather than the OIDC `sub` claim — a deliberate prioritisation of
  out-of-band roster and API-key usage over strict OIDC best practice.
  SpacetimeDB access tokens are RS256 JWTs from Convex's OIDC issuer;
  per-team game credentials are Ed25519 JWTs delivered only via game
  invitation. Asymmetric signing for credential independence: compromise
  of one scheme does not compromise the other. Specified in
  [`specs/03-auth-and-identity.md`](specs/03-auth-and-identity.md).
- **Bot framework.** Single-ply (depth-1) anytime evaluation with
  worst-case minimax aggregation. Teams plug in custom **Drives**
  (directed motivations parameterised by a target snake or cell) and
  **Preferences** (time-invariant board heuristics) into a softmax
  decision pipeline. Critically, **portfolio weights apply at scoring
  time, not simulation time**, so weight edits trigger a pure rescore
  over cached worlds rather than re-simulation. Foreign-move combinations
  are explored via a Dijkstra traversal over a lattice of per-snake
  interest maps; partial progress is immediately usable.
- **Operator UX commitments.** All snakes are bot-controlled by default.
  **Selection is a viewing affordance, not an override** — selecting a
  snake lets an operator inspect its scores and edit its drives, but the
  bot continues staging moves for it. **Manual mode is an explicit
  toggle**, automatically activated when the operator picks a concrete
  direction. Selection is an **exclusive lock** (one operator per snake,
  one snake per operator), enforced by Convex function contracts rather
  than by client convention. These rules shape the entire UI surface.
- **Replay fidelity.** Replays are the union of SpacetimeDB's append-only
  game log (turn-level board state) and Convex's `centaur_action_log`
  (sub-turn Centaur experience: selections, stateMap snapshots, drive
  edits, mode toggles, every staged move). The unified replay viewer
  reuses the live operator UI components against a read-only data source
  abstraction, scrubbing in clock time within each turn. The same data
  enables coach inspection during live play.

## Reading Guide

The spec is organised into nine modules. Read **02** first for the
architecture map; then **04 and 05** for the two backend runtimes; then
**03** before either if identity questions block you. **06, 07, and 08**
are the Centaur-specific surface — read **06** before **07** before **08**.
**01** is independent and can be read at any point.

- **[`specs/01-game-rules.md`](specs/01-game-rules.md)** — Board
  geometry, snake physics, item effects, the eleven-phase atomic turn
  pipeline, deterministic board generation from a seed.
- **[`specs/02-platform-architecture.md`](specs/02-platform-architecture.md)** —
  The three-runtime topology, lifecycle transitions, ownership boundaries,
  the game invitation flow, the shared engine codebase contract.
- **[`specs/03-auth-and-identity.md`](specs/03-auth-and-identity.md)** —
  Identity model, OIDC issuance, per-team game credentials, the `Agent`
  value resolved at SpacetimeDB connection time and propagated through
  every staged move.
- **[`specs/04-stdb-engine.md`](specs/04-stdb-engine.md)** — The
  SpacetimeDB module's schema, reducers, RLS rules, append-only history,
  initialisation contract.
- **[`specs/05-convex-platform.md`](specs/05-convex-platform.md)** —
  Convex schema for platform state, the HTTP API and webhook surface,
  board generation, replay persistence, archive semantics for teams and
  rooms.
- **[`specs/06-centaur-state.md`](specs/06-centaur-state.md)** —
  Per-team Centaur state in Convex: snake portfolios, drives, selection
  locks, the `centaur_action_log`, stateMap snapshots, the function
  contracts that enforce selection discipline.
- **[`specs/07-bot-framework.md`](specs/07-bot-framework.md)** — Drives
  and Preferences, the lattice of foreign-move combinations, anytime
  evaluation, the Dijkstra traversal, worst-case minimax scoring,
  human-selection resume.
- **[`specs/08-centaur-server-app.md`](specs/08-centaur-server-app.md)** —
  The unified SvelteKit web application: live operator UI, drive
  management, replay viewer, Coach mode, lobby, profiles, leaderboard,
  the data-source abstraction that lets the same components serve live
  play, replay, and coaching.
- **[`specs/09-platform-ui.md`](specs/09-platform-ui.md)** — Redirect
  stub. Module 09's content has been absorbed into module 08; references
  to `[09]` elsewhere should be read as references to `[08]`.

Each module has a sibling `specs/XX-*.review.md` decision log. The
modules themselves describe only the current correct behaviour of the
system — they carry no "we considered X and rejected it" narration. That
content lives in the decision logs in a `Context / Question / Options /
Decision / Rationale` format. When you need to know *why* a contentious
call was settled the way it was, read the decision log; when you need to
know *what* the call is, read the module.

[`SPEC-INSTRUCTIONS.md`](SPEC-INSTRUCTIONS.md) carries the modular
authoring process, the review protocol, and the module dependency graph
governing which calls in one module are downstream of which other
modules. Every conversation that touches spec content must follow those
rules.

## Repo Orientation

This is a documentation-only repository. None of the platform is
implemented yet; this repo is the source of truth for what *will* be
implemented.

A small Node/Express server (`server.js`, port 5000) renders the markdown
specs as a navigable web application with syntax highlighting and a
dark-themed sidebar. Run it with `node server.js`. It is a review and
reading aid only — no spec content is generated by the server.

The `informal-spec/` directory holds the upstream source documents
(`team-snek-centaur-platform-spec.md` and the broader
`general-centaur-game-engine-spec.md`) from which the modular spec was
distilled. They are useful for context, but the modular specs in
`specs/` are authoritative — when the two disagree, the modular specs
win.

`AGENTS.md` and `CLAUDE.md` carry the context that AI collaborators
working on the spec rely on. `AGENTS.md` is canonical; `CLAUDE.md` is a
pointer file plus a section for Claude-specific environment notes.
