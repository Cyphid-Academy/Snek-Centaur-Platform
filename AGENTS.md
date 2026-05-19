# Agent Context — Implementation Work

This is the top-level agent context for **implementation work** in the Snek Centaur Platform monorepo.

- For **spec authoring** (editing `spec/` module files, REVIEW items, SPEC-INSTRUCTIONS): read `spec/AGENTS.md`.
- For **package-scoped implementation**: read the `AGENTS.md` in the relevant `packages/*/` or `apps/*/` directory.
- This file covers repo-wide implementation conventions that apply everywhere.

## Project Overview

The **Team Snek Centaur Platform** is a team-based multiplayer snake game for Cyphid Academy's Battle Bunker educational program. Players collaborate with an AI "Centaur Server" that controls their team's snakes by default; human operators selectively override individual snakes.

The platform runs across three distinct runtimes:

| Runtime | Role | Lifecycle |
|---------|------|-----------|
| SpacetimeDB | Authoritative game logic — turn resolution, RLS, chess timer | Per-game (transient) |
| Convex | User accounts, rooms, replays, bot state, game orchestration | Global (persistent) |
| Centaur Servers | Bot computation + operator UI + game invitation acceptance | Per-team |

Full architectural detail is in `spec/02-platform-architecture.md`. The spec is the binding source of truth for every behavioural and structural decision.

## Package Map

| Path | npm name | What it is | Spec module(s) |
|------|----------|------------|----------------|
| `packages/engine/` | `@cyphid/snek-engine` | Shared game engine — domain types, `resolveTurn`, collision detection, move validation. Consumed by all runtimes. | 01, 02 |
| `packages/stdb/` | `@cyphid/snek-stdb` | SpacetimeDB TypeScript module — reducers, RLS, schema, chess timer. | 04 |
| `packages/convex-snek-platform/` | `@cyphid/convex-snek-platform` | Convex Component for platform-wide state (users, rooms, games, replays, webhooks). | 03, 05 |
| `packages/convex-centaur-state/` | `@cyphid/convex-centaur-state` | Convex Component for Centaur subsystem (snake config, drives, action log). | 06 |
| `packages/convex-host/` | `@cyphid/snek-convex-host` | Convex deployment that mounts both components, adds auth wrappers, HTTP API, game lifecycle. | 02, 03, 05, 06 |
| `packages/centaur-server-lib/` | `@cyphid/snek-centaur-server-lib` | Bot framework + invitation handler + healthcheck contract + typed Convex clients. Published via GitHub tags for forkers. | 07, 02-REQ-030 |
| `apps/centaur-server-reference/` | *(app, not published)* | Svelte 5 reference implementation of the Centaur Server. Mirrored to `cyphid/snek-centaur-server` via `git subtree split`. | 08 |

## Monorepo Mirror Model

The `apps/centaur-server-reference/` directory is the **canonical** source of the Snek Centaur Server. The `cyphid/snek-centaur-server` GitHub repository is a generated mirror. Teams fork the mirror; PRs from forks are cherry-picked here by a maintainer and the mirror workflow re-syncs. See `docs/external-setup.md` for the setup procedure and `.github/workflows/mirror-centaur-server.yml` for the sync workflow.

## Code-to-Spec Citation Convention

Every non-trivial implementation decision that traces to a requirement must carry a comment:

```typescript
// spec: MM-REQ-NNN
// spec: MM-REQ-NNN, MM-REQ-MMM  (multi-clause)
```

Use the module number and requirement ID from `spec/` files. This is convention, not yet lint-enforced.

## Tooling Conventions

**Package manager**: pnpm only. Use `pnpm add`, `pnpm install`, `pnpm remove`. Never use `npm install` or `yarn`.

**TypeScript**: strict mode throughout. Root `tsconfig.base.json` defines the baseline; each package extends it. Run `pnpm typecheck` to check the whole workspace via `tsc -b`.

**Linting / formatting**: Biome. Run `pnpm lint` (check) or `pnpm format` (write). No ESLint or Prettier.

**Testing**: Vitest. Run `pnpm test` across the workspace. Every package should have at least a smoke test confirming it loads.

**Dev server**: `pnpm dev` starts the Centaur Server reference app on port 5000 via Vite. The Replit preview iframe connects to this port.

## Root Scripts

| Script | What it does |
|--------|-------------|
| `pnpm typecheck` | `tsc -b` across the workspace |
| `pnpm lint` | `biome check .` |
| `pnpm format` | `biome check --write .` |
| `pnpm test` | `vitest run` across all packages |
| `pnpm dev` | Starts the Centaur Server reference app |
| `pnpm build` | Builds all packages |

## Squash-Merge Commit Messages

Project tasks are squash-merged to `main`. The commit message must describe the **entire task** — every file changed, every decision made, every cascade — not just the last edit. Re-read the task scope before staging the final commit.

## Convex Auth Note

`convex-host` has a `TODO` comment for `@convex-dev/auth` integration. Do not integrate it until the first Convex implementation task. See `packages/convex-host/AGENTS.md` for details.
