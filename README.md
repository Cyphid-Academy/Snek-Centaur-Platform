# Team Snek Centaur Platform

Team Snek is a team-based multiplayer snake game and the first title on Cyphid Academy's Battle Bunker educational program. This repository is now the primary implementation monorepo — the formal spec lives in `spec/` and the implementation packages are being built here alongside it.

---

## Cyphid Academy and Battle Bunker

Cyphid Academy is an educational program for gifted children built around a single pedagogical thesis: **discrete test-based education is dead in the age of AI.** Any static-rubric task — a standardised test, a homework assignment, a coding challenge — can be commoditised by AI. A gifted child who learns to excel at such tasks learns a skill that is structurally obsolete.

The Cyphid thesis does not ask kids to compete against AI or to avoid it. It asks them to learn to operate *above* it: to guide the priorities of AI micromanagers at strategic altitude, overrule them when human judgment adds value, and otherwise leave them to execute. The analogy is modern warfare, where the scarcest human skill is no longer triggering weapons but directing attention across an AI-saturated battlefield.

Battle Bunker is the games arm of Cyphid Academy. It trains children to collaborate with AI and with each other in novel competitive games where both human and AI strengths offer genuine marginal value even when access to AI is fully unrestricted. The design constraint is strict: there must be no ceiling on how helpful your AI can be, and yet a team that uses it better still wins. The game design has to make that true.

### Cooperation as a Load-Bearing Design Criterion

Gifted children tend to learn individualism. In most school environments they discover early that they can outperform their peers on assignments by working alone — the social cost of coordinating with a slower collaborator exceeds the benefit. Over time they optimise away from collaboration and toward solo excellence. This is rational, and it produces adults who are much worse at working with other capable people than their raw ability would suggest.

Cyphid's countervailing aim is to create conditions under which such kids have **viscerally rewarding experiences of cooperation with worthy teammates** — experiences that are memorable and repeatable, so they start to become intrinsically motivated to *become* more worthy teammates themselves. The mechanism is game design, not exhortation. No amount of telling a high-IQ kid that teamwork matters will rewire their incentives. Giving them a mechanic that makes them desperately *need* a capable partner, and then delivering on that need, can.

Cyphid games are designed so that the highest-value play is substantially easier to execute through coordination than solo. The strong-play affordances are structured to require split attention across two or more operators at the same time. A player who tries to capture the full benefit alone does both jobs worse than a coordinated team does each job well. The game does not penalise solo play with artificial handicaps — it rewards coordination through the arithmetic of divided labour on genuinely parallel tasks.

Team Snek implements this through its potion mechanic, described in the game rules section below.

---

## Architecture at a Glance

The platform runs across three distinct runtime kinds:

| Runtime | Lifecycle | Role |
|---------|-----------|------|
| **SpacetimeDB** | Per-game (transient) | Authoritative game logic — turn resolution, RLS, chess timer |
| **Convex** | Global (persistent) | User accounts, rooms, replays, bot state, game orchestration |
| **Centaur Servers** | Per-team | Bot computation + operator UI + game invitation acceptance |

The **Centaur Server** reference implementation lives in `apps/centaur-server-reference/` and is mirrored to the separately-forkable `cyphid/snek-centaur-server` repository via `git subtree split`. Teams fork the mirror to build their own Centaur Server with custom bot logic. See `docs/external-setup.md` for the mirror setup procedure.

---

## Package Map

| Package | npm name | Spec module(s) | What it is |
|---------|----------|---------------|------------|
| `packages/engine/` | `@cyphid/snek-engine` | 01, 02 | Shared game engine — domain types, `resolveTurn`, collision detection. Consumed by all runtimes. |
| `packages/stdb/` | `@cyphid/snek-stdb` | 04 | SpacetimeDB TypeScript module — reducers, RLS, schema, chess timer. |
| `packages/convex-snek-platform/` | `@cyphid/convex-snek-platform` | 03, 05 | Convex Component — users, rooms, games, replays, webhooks. |
| `packages/convex-centaur-state/` | `@cyphid/convex-centaur-state` | 06 | Convex Component — snake config, drives, heuristic config, action log. |
| `packages/convex-host/` | `@cyphid/snek-convex-host` | 02, 03, 05, 06 | Convex deployment — mounts both components, adds auth, HTTP API, lifecycle. |
| `packages/centaur-server-lib/` | `@cyphid/snek-centaur-server-lib` | 07, 02-REQ-030 | Bot framework + invitation handler + healthcheck contract. Published via GitHub tags. |
| `apps/centaur-server-reference/` | *(app)* | 08 | Svelte 5 reference Centaur Server. Mirrored to `cyphid/snek-centaur-server`. |

---

## Local Dev Quickstart

```bash
# 1. Clone the repo
git clone git@github.com:cyphid/snek-centaur-platform.git
cd snek-centaur-platform

# 2. Enable corepack (once per machine)
corepack enable

# 3. Install all workspace dependencies
pnpm install

# 4. Start the Centaur Server reference app (port 5000)
pnpm dev

# Other useful commands:
pnpm typecheck   # tsc -b across all packages
pnpm lint        # Biome check
pnpm format      # Biome format (writes)
pnpm test        # Vitest across all packages
pnpm build       # Build all packages
```

The Centaur Server reference app will be available at `http://localhost:5000`. In Replit, it appears in the preview pane automatically.

---

## Code-to-Spec Citation Convention

Every non-trivial implementation decision that traces to a requirement carries a comment:

```typescript
// spec: MM-REQ-NNN
// spec: MM-REQ-NNN, MM-REQ-MMM  (multi-clause)
```

Where `MM` is the module number (e.g. `01`, `07`) and `NNN` is the requirement ID from the corresponding `spec/` file. This convention is not yet lint-enforced.

---

## How to Navigate the Spec

The spec is in `spec/` (nine numbered modules in roughly dependency order). Start with `spec/SPEC-INSTRUCTIONS.md` for a complete orientation, or follow this reading order:

1. **`spec/02-platform-architecture.md`** — start here; establishes the three-runtime topology, shared engine contract, and Centaur Server lifecycle.
2. **`openspec/specs/game-engine/spec.md`** — domain model, the full staged turn-resolution model, potion mechanics.
3. **`spec/03-auth-and-identity.md`** — identity types, Google OAuth, game invitation flow.
4. **`spec/04-stdb-engine.md`** and **`spec/05-convex-platform.md`** — the two backend runtimes (either order).
5. **`spec/06-centaur-state.md`** — Centaur subsystem Convex schema.
6. **`spec/07-bot-framework.md`** — bot evaluation, Drives, Preferences, anytime algorithm.
7. **`spec/08-centaur-server-app.md`** — the unified Centaur Server web application.

Decision logs for each module live in `spec/review/`. The informal spec source documents live in `spec/informal-spec/`.

---

## Game Rules and Mechanics

### The Board

The board is a rectangular grid bordered by an impassable wall on all sides, available in several named sizes from Small to Giant. Inner cells are Normal by default. Optional **Hazard** cells deal damage per turn to any snake whose head enters them. Optional **Fertile** cells are the only eligible spawn sites for food when fertile-ground mode is active; their layout is generated by Perlin noise seeded per-game, producing organic blobs or scattered patches depending on a clustering parameter.

Each team fields an equal number of snakes, named by team and letter (Red.A, Red.B, Blue.A, Blue.B, and so on). At game start every snake has its segments stacked on its starting cell and full health. Starting positions are distributed across team-specific territory sectors and constrained to a single board parity so that any two snakes can potentially collide head-to-head.

### What a Turn Looks Like

Turns are simultaneous. Every turn, every team submits one direction (Up, Right, Down, Left) per alive snake. When all teams have submitted — or their time runs out — the turn resolves atomically in eleven phases: move all snakes simultaneously, detect collisions, apply health and hazard damage, process food and potion collection, spawn new food and potions, apply and expire potion effects, check win conditions, and emit events.

A snake dies if its head hits a wall, hits a snake body of equal or greater invulnerability level, loses a head-to-head collision, or runs out of health. A snake that reaches zero health from the passive per-turn health tick or hazard damage is eliminated. Food restores health to its maximum and grows the snake by one segment the following turn.

**Collisions use invulnerability levels.** Each snake has an invulnerability level derived from active potion effects. When a snake's head enters a non-head body segment of another snake, the attacker dies unless its invulnerability level exceeds the victim's, in which case the victim is **severed** — all segments from the contact point to the tail are removed — and the attacker survives. In head-to-head collisions, snakes below the maximum invulnerability level among the colliding snakes die; among those at the maximum, the shorter snake dies (ties kill all).

**The chess timer** governs turn deadlines. Each team has a time budget that persists across turns. At the start of each turn, a budget increment is added and the per-turn clock is capped at the smaller of a configured maximum and the team's current budget (the first turn allows a longer one-time clock for setup). A team can declare turn over early, returning unused clock time to its budget. A team that consistently moves fast accumulates surplus time for turns where deliberation matters. When a team's budget depletes, their per-turn clock drops to the increment alone — enough for automated play but not for human deliberation. Turn submission for a team is a direct SpacetimeDB call; Convex is not in the timing path.

### Potions and Why They Elicit Cooperation

Two potion types exist: **(in)vulnerability** and **invisibility**. Both follow the same collection pattern:

- The snake that collects the potion (the **collector**) receives a short debuff of that family.
- Every alive teammate immediately receives a short buff of that family.
- The collector is the **weak link**: if it suffers any disruption during the debuff window — death, severing, being severed, receiving a body collision, or entering a hazard — the entire team's active buffs for that family cancel instantly.

The invulnerability buff lets a snake sever opponents' bodies on contact instead of dying. The invisibility buff hides a snake from all opponent views; opponents see neither its position nor any derived state, though all game mechanics (collisions, severing) continue to apply to it on the server.

This mechanic is the cooperation engine. A team that has just collected an invulnerability potion holds a powerful attack window: their buffed snakes can cut through opponent bodies without dying. To capture full value from that window, someone needs to shepherd the collector snake safely through its debuff window while the rest of the team positions their buffed snakes for aggression. Those are genuinely parallel tasks that demand split attention. A solo operator trying to manage the collector and position the attackers simultaneously does both jobs worse than two operators each focused on one. The mechanic creates a moment where needing a worthy teammate is not a motivational message but an arithmetic reality.

---

## The Centaur Play Pattern

Every team in Team Snek is a **Centaur Team**: the bot controls all snakes by default. There are no purely human teams. The bot cannot be turned off.

Human operators direct the bot at two altitudes, and the higher-altitude one is where most of the leverage lives:

- **Strategic altitude — live Drive and Preference configuration.** Each snake carries a portfolio of Drives (directed motivations toward or away from a target — a specific opponent, a potion, a region of the board) and Preferences (time-invariant board-state heuristics). Operators add, remove, and reweight these per snake during the game. A single Drive change — telling Red.A to chase the opponent that just collected an invulnerability potion, or shifting Red.B's portfolio to favour shepherding the team's own collector through its debuff window — propagates instantly into the bot's evaluation and steers that snake's behaviour over the rest of the game without the operator ever picking a direction. This is multi-turn, high-leverage guidance: one configuration act shapes many subsequent moves.
- **Tactical altitude — per-turn manual overrides.** When the bot is about to make a specific move that human judgment can clearly improve on, an operator selects that snake, switches it to manual mode, and stages the better direction directly. Selection is exclusive (one operator per snake, one snake per operator) so two teammates can't fight over the same snake.

The metaphor is the centaur: the bot is the body executing the low-level work, and the human operators are the rider. Most riding is done with the reins — Drive and Preference configuration that biases the body's own decisions — not by grabbing the body's limbs directly. Learning when each altitude is appropriate, and how to divide that attention across teammates and across snakes, is the primary skill being trained. The architecture enforces the default: all snakes start each turn staged to the bot's best computed move under the current portfolio. If no operator intervenes at either altitude, the bot's move stands.

This play pattern is the load-bearing rule around which the entire platform architecture is shaped. The identity model, the Convex schema, the bot framework, the operator interface, the replay format — all of them exist to make centaur play tractable, legible, and trainable.

---

## Further Reading

- `spec/SPEC-INSTRUCTIONS.md` — full modular authoring process and phase gates
- `spec/AGENTS.md` — agent context for spec work
- `AGENTS.md` — agent context for implementation work
- `docs/external-setup.md` — GitHub, npm, Convex, and STDB setup instructions
- `CONTRIBUTORS.md` — how to add yourself as a contributor
- `LICENSE` — MIT
