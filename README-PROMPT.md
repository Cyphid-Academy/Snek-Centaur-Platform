# Prompt: Write the Team Snek Centaur Platform README

This document is a self-contained prompt for a fresh AI tasked with writing
`README.md` for this repository. It captures the vision content the README
must convey, the architecture and module surface it must cover, the
selection principles that should govern what's included, the anti-patterns
to avoid, and a workflow for producing a high-quality draft on the first
attempt. Hand this prompt to an AI that has not seen prior conversations
about this repo.

---

## Task

Replace the existing `README.md` with a ~4000-word, implementer-facing
index. The current README is a 19-line landing-page stub. Your job is to
produce a document that gives a future engineer a confident initial
intuition for the platform: what it's for, how the game works, how the
architecture is organised, and which spec module to open for any question
they have.

## What this repo is

`/home/user/Snek-Centaur-Platform-Spec` holds the formal specification for
the Team Snek Centaur Platform — a team-based multiplayer snake game that
is the first title on Cyphid Academy's Battle Bunker educational program.
Nothing is implemented yet; this repo is the source of truth for what will
be built. The modular spec lives in `specs/` as nine numbered modules; the
upstream informal sources live in `informal-spec/`; the modular authoring
discipline is in `SPEC-INSTRUCTIONS.md`; agent context is in `AGENTS.md`.
A small Node/Express server (`server.js`, port 5000) renders the markdown.

## Audience, length, register

Write for an engineer who is about to build against the spec. They have not
read the spec yet. Hold the README to **~4000 words** (target 3800–4200).
Present tense throughout — no journey narration (no "originally we…", "the
spec used to say…", "we considered X and rejected Y"). Plain
GitHub-flavoured markdown. No emojis. Link modules with relative paths
like `specs/04-stdb-engine.md`.

## The vision the README must convey, in this order

### (1) Cyphid Academy and Battle Bunker

Cyphid Academy is an educational program for gifted children. Its central
pedagogical thesis is that **discrete test-based education is dead in the
age of AI** because AI commoditizes performance in any static-rubric task.
The new paradigm puts humans at strategic altitude *over* AI micromanagers
— guiding their priorities, overruling them when judgment matters, and
otherwise leaving them to execute. Battle Bunker is the games arm of the
program; it trains kids to collaborate with AI and with each other in
games where both human and AI strengths offer marginal value even when
access to AI is unrestricted.

### (2) Cooperation as a central Cyphid design criterion

Name this in the intro and explain it on its own terms. The thesis:
high-IQ kids tend to learn individualism because they learn they can
outperform their available peers solo on school assignments. Cyphid's
countervailing aim is to create conditions under which such kids have
**viscerally rewarding experiences of cooperation with worthy teammates**,
so they start to become intrinsically motivated to become more worthy
teammates themselves. Cyphid games are designed to elicit those
experiences by making essential strong-play affordances easier to pull off
through coordination than solo.

### (3) Team Snek's basic mechanics and why they elicit cooperation

Give a tight description an engineer can hold in working memory. Cover:

- A rectangular board with walls, optional hazards, optional fertile tiles
  for food spawning.
- Each team fields some number of snakes (default 3). Every snake starts
  at length 3 and dies if it hits a wall, hits its own body, hits another
  snake's body unfavourably, or runs out of health.
- Simultaneous turn-based: every turn, every team submits one direction
  per snake; turns resolve atomically. A chess-timer system governs turn
  deadlines, with per-team time budgets that fast play accumulates and
  slow play spends.
- Food restores health to full and grows the snake.
- Two potion types, **(in)vulnerability** and **invisibility**. Both work
  the same way: the collecting snake takes a 3-turn *debuff* while every
  alive teammate gets a 3-turn *buff* of the same family. The
  invulnerability buff lets a snake sever opponents' bodies on contact
  instead of dying; the invisibility buff hides the snake from opponent
  views entirely (mechanics still apply server-side; opponents simply
  don't see those snakes). Critically, **the collector is the weak link**:
  if the collector is disrupted (killed, severed, body-collided, or steps
  on a hazard) during the effect window, the whole team's buffs cancel.

Then explain *why this elicits cooperation*: the potion mechanic creates an
essential strong-play affordance — a team-wide buff window — that is
**much easier to capture by coordinating than by playing solo**. One
player needs all of their attention on microing the collector snake to the
potion and shepherding it safely through its debuff window while their
teammates position other snakes in the swarm to attack during the buff
window. A solo operator trying to do both jobs at once does both jobs
worse. The mechanic forces the player to *need* a worthy teammate, and
rewards them when they have one.

### (4) The centaur play pattern

Every team is a Centaur Team: bot-by-default, with humans selectively
overriding individual snakes only when their judgment adds marginal value.
There are no purely human teams; the bot cannot be turned off. The bot is
the body, the human operators are the rider, and learning to direct the
rider–body collaboration is the skill being trained. This is the
load-bearing rule the entire architecture is shaped to enforce.

## The architecture and module surface the README must cover

Treat every top-level chapter of the spec as something the README owes the
reader a paragraph on. **Do not leave whole modules invisible.** Aim for
roughly even depth across them.

### The three runtimes

- **SpacetimeDB** (per-game, transient TypeScript module): authoritative
  game logic; one ACID transaction per turn driving the 11-phase pipeline;
  real-time state sync via subscriptions; turn-keyed history that makes
  any past board state queryable; row-level filtering of the invisible
  snake's own row (game-board consequences remain visible to all).
- **Convex** (global, persistent): users, teams, rooms, games, replays,
  API keys, the platform HTTP API, all per-team Centaur state (snake
  portfolios, drives, action logs); OAuth identity anchor; OIDC issuer for
  SpacetimeDB tokens; provisions and tears down STDB instances; runs board
  generation.
- **Snek Centaur Servers** (per-team, semi-stateless): static web host
  outside games; during games receives a per-team game credential via
  `POST /.well-known/snek-game-invite` from Convex and runs tenant-isolated
  bot computation per hosted team; serves the unified SvelteKit web app.

### Other things the README must touch with at least a paragraph

- The **shared engine codebase** consumed by all three runtimes (no
  parallel implementations of game logic).
- The **identity model**: humans (Google OAuth, email-canonical), Centaur
  Teams, and derived game-participant identities. Mention the
  captain-unilateral server-nomination model and its trust implications
  (a malicious server can exfiltrate Convex-readable data, so trust is the
  team's responsibility).
- The **bot framework**: teams plug in **Drives** (directed motivations
  toward a target snake or cell) and **Preferences** (board-state
  heuristics) into a single-ply anytime evaluation that combines them via
  portfolio weights and picks via softmax. Computation runs continuously
  in the background and surfaces a `stateMap` of per-direction worst-case
  scores that operators see live. Worst-case minimax aggregation is
  conservative-by-design; the bot prefers directions with the best
  worst-case outcome.
- The **operator UI commitments**: all snakes are bot-controlled by
  default; selecting a snake is a viewing affordance, not an override;
  manual mode is an explicit toggle (auto-checked when the operator
  actively picks a direction); selection is an exclusive lock (one
  operator per snake, one snake per operator); a timekeeper role has
  shortcut keys for mode toggling and manual turn submission.
- The unified **replay viewer**: replays are the union of STDB's
  turn-level game log and Convex's sub-turn `centaur_action_log`; the live
  operator UI components are reused against a read-only data source so the
  viewer scrubs in clock time within each turn. Coach mode reuses the
  same abstraction for live observation.
- The **game lifecycle**: rooms as persistent lobbies, configuration
  freezing at game start, the invitation handshake to participating
  servers, Convex-orchestrated provisioning and teardown of STDB
  instances, tournament mode for chained rounds.
- The **platform HTTP API and webhooks**: external programmatic access to
  teams, rooms, and games via API keys; `game_start` and `game_end`
  webhook events; at-least-once delivery semantics.
- **Spectator and coach roles**: any authenticated user can spectate; the
  coach role gives an authorised non-team-member a team-perspective
  read-only view during live play.

## A reading guide section indexing all nine modules

End the README with a section that gives a one-line gloss for each of the
nine modules plus a pointer to the sibling `.review.md` decision logs and
`SPEC-INSTRUCTIONS.md`. Recommend a reading order (02 first for
architecture; 04 and 05 for the backends; 03 for identity; 06 → 07 → 08
for the Centaur-specific surface; 01 anywhere). Note that module 09 is a
redirect stub absorbed into 08.

Modules to index:
- `specs/01-game-rules.md` — board, snakes, items, the 11-phase atomic
  turn pipeline, deterministic board generation.
- `specs/02-platform-architecture.md` — three-runtime topology, lifecycle,
  ownership boundaries, game invitation flow, shared engine contract.
- `specs/03-auth-and-identity.md` — identity types, OIDC issuance,
  per-team game credentials, the `Agent` value attached to every staged
  move.
- `specs/04-stdb-engine.md` — STDB module schema, reducers, RLS, turn
  resolution implementation, replay export.
- `specs/05-convex-platform.md` — Convex platform schema, HTTP API and
  webhooks, board generation, replay persistence, archive semantics.
- `specs/06-centaur-state.md` — per-team Centaur state in Convex
  (portfolios, selection locks, action log, stateMap snapshots).
- `specs/07-bot-framework.md` — Drives and Preferences, lattice of
  foreign-move combinations, anytime evaluation, worst-case minimax,
  human-selection resume.
- `specs/08-centaur-server-app.md` — the unified SvelteKit web app: live
  operator UI, drive management, replay viewer, coach mode, lobby,
  profiles, leaderboard, API key management.
- `specs/09-platform-ui.md` — redirect stub; content lives in 08.

## Selection principles

Hold yourself to these throughout:

1. **Coverage in proportion to surface area, not personal taste.** Touch
   every top-level chapter of the spec. No chapter invisible. Consistent
   depth across them. If you find yourself dwelling on one module's
   clever implementation detail, you are probably starving another module
   of its paragraph.
2. **What-it-does before why-it's-done-that-way.** An engineer needs to
   picture a turn happening, an operator's screen, and a centaur server
   hosting a team before they need to know which JWT signing scheme is
   used. Mechanics first; clever implementation choices second and
   sparingly.
3. **The whiteboard test.** Include what an engineer would need to sketch
   from memory before opening their editor — entities, flows, invariants.
   Things they can look up when they need them belong in the modules, not
   the README.
4. **Bridge, don't replace.** The README's job is to make the engineer
   able to navigate the nine modules confidently. Spec-level fidelity is
   the wrong altitude.
5. **Distinctiveness budget.** Skip generic OAuth or snake-game
   explanation. Spend your wordcount on what's genuinely non-obvious about
   this platform: the centaur play pattern, cooperation-by-design,
   Drive/Preference vocabulary, anytime bot, three-runtime trust topology.

## Anti-patterns to avoid

- **Don't lavish detail on clever low-level decisions** (RLS filtering
  mechanics, RS256-vs-Ed25519 signing schemes, append-only-with-one-exception
  quirks, weights-applied-at-scoring) at the expense of game mechanics and
  UI surface. A prior attempt did exactly this and ended up describing the
  platform as "interesting cryptography and storage choices wrapped around
  an unspecified game."
- **Don't leave game mechanics implicit.** "Eleven-phase turn pipeline"
  alone is not a game description. The engineer needs the actual play loop
  and a working mental model of what a turn looks like in time.
- **Don't leave the UI invisible.** Module 08 specifies a large
  user-facing surface — operator interface, replay viewer, lobby, rooms,
  teams, leaderboard, coach mode, API keys. It deserves real treatment.
- **Don't narrate change** ("we considered X", "the spec used to say Y").
  Present tense, current rules only.
- **Don't pad with framing or roadmap fluff.** Every paragraph should add
  information the engineer didn't have. With ~4000 words of budget the
  temptation is to spread the existing content thinner; resist this.
  Spend the extra budget on touching the parts of the surface a 2000-word
  version would have to skip.

## Workflow

1. **Read the upstream sources first.**
   `informal-spec/general-centaur-game-engine-spec.md` §1 for the broader
   Centaur thesis and `informal-spec/team-snek-centaur-platform-spec.md`
   §§1–13 for the integrated platform vision and full game rules. These
   contain the substantive vision content; the modular specs are stripped
   of narrative motivation.
2. **In a single message, launch three Explore subagents in parallel** to
   summarise modules in clusters (01–03, 04–06, 07–09). Brief each agent
   that you need *what an engineer needs to know to build it*, not just
   the cleverest decisions. Ask for ~150 words per module covering: what
   it specifies, the load-bearing rules and entities, the user-visible
   surface where applicable.
3. **Plan with an explicit word budget per section** before writing.
   Suggested split for ~4000 words:
   - Vision and cooperation thesis: ~1000 words
   - Game mechanics with cooperation example: ~700 words
   - Architecture-at-a-glance (covering every module's surface): ~1500
     words
   - Reading guide: ~600 words
   - Repo orientation: ~200 words
4. **Write the README** as a full replacement of the existing `README.md`.
5. **Verify** with `wc -w` (target 3800–4200), `ls specs/` (every
   referenced path exists), and the **end-state test** below.

## End-state test

After reading your README, the engineer should be able to:

- Describe what a turn looks like in time (what they submit, what
  resolves, what the chess timer does).
- Explain in one sentence why the potion mechanic elicits cooperation.
- Name the major pages of the operator UI (board view, lobby, replay
  viewer, etc.).
- Say who talks to whom over what protocol at game start and game end.
- Define a Drive and a Preference and say how the bot turns them into a
  move.
- Open the right spec module on the first try for any question they have.

If any of these fail when you re-read your draft, fix the draft before
declaring it done.
