# Agent Context — Implementation Work

This is the top-level agent context for **implementation work** in the Snek Centaur Platform monorepo.

> **Spec system.** The binding spec lives in `openspec/specs/` (strict
> OpenSpec; conventions in `openspec/config.yaml`, workflow and cutover
> table in `openspec/README.md`). The pre-OpenSpec corpus is quarantined in
> `legacy-spec-archive/` and remains binding for modules not yet migrated.
> Spec changes flow through `/opsx:*` change folders. Run `pnpm spec:check`
> after any change touching spec content or spec references.

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

Full architectural detail is in `legacy-spec-archive/spec/02-platform-architecture.md` (binding until that module migrates). The spec is the binding source of truth for every behavioural and structural decision.

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

Every non-trivial implementation decision that traces to a requirement must carry a comment. Spec identifiers are treated like code identifiers:

```typescript
// spec: game-rules/team-potion-effects                       (a requirement)
// spec: game-rules/team-potion-effects#sacrificial-collection (edge case pinned by a scenario)
// spec: 04-REQ-014                                            (unmigrated module — numeric legacy ID)
// design: 2026-07-18-cache-normalized-outputs                 (rationale in an archived change folder)
```

Named identifiers come from `openspec/specs/<capability>/spec.md` headers; numeric IDs are valid only for modules still pending migration (cutover table in `openspec/README.md`). All forms are lint-enforced by `pnpm spec:citations` — stale or unknown references fail, and retired numeric IDs point you to `legacy-spec-archive/maps/`.

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

## Commit History & Message Grammar

`main` is **semi-linear**, and how a PR lands depends on its shape:

- **Multi-commit PR** (a phase-structured change, or a seed/edit pair) → **Create a merge commit**. The merge node carries the clickable `#<PR>` link while the PR's **phase commits are preserved intact** beneath it (its second parent). Read PR-level history with `git log --first-parent` (one line per merged PR); expand a PR with `git show <merge>` or `git log <merge>^1..<merge>^2`.
- **Single-commit PR** → **Squash and merge**. A merge commit would wrap the lone commit in a redundant second node (the same change appearing twice on `main`), so squash lands exactly one commit, subject `… (#<PR>)`, carrying the link without the extra node.

Both squash and merge-commit are enabled; **rebase-merge stays off** (it drops the PR link). Never squash a multi-commit PR — it destroys the phase commits. A spec-affecting change lands as a small **ordered set of phase commits** rather than one squash, so each phase is reviewable on its own and the history reads as the change's shape:

- **`Open change <name>: …`** — the proposal artifacts (proposal, design, tasks, spec deltas).
- **`Seed <name> deltas verbatim` → `Edit <name> deltas: …`** — the two-commit seed/edit pair, required only when the change **modifies** existing requirements (ADDED-only deltas skip it; see `openspec/README.md`).
- **`Implement <name>: …`** — the code, tests, and any design/spec refinements found while building.
- **`Archive <name>: …`** — the terminal fold into `specs/`, on explicit human instruction.

**Subject grammar:** sentence-case imperative, led by a phase verb from that fixed vocabulary — `Open change` / `Seed` / `Edit` / `Implement` / `Archive` for the change lifecycle, plus `Propose`, `Migrate`, `Document`, `Adopt`, and similar for non-lifecycle work. This is a domain vocabulary tuned to the OpenSpec workflow, and it is deliberately **not** Conventional Commits (`feat:` / `fix:` / …): the automation those prefixes exist for (semantic-release, commitlint) is not in use, and the semantic layer already lives in `specs/`, archived change folders, and `// spec:` citations. No type prefixes.

**Body:** explain **what and why**. The `Implement` commit is where the whole-task description belongs — every file changed, every decision made, every cascade, not just the last edit; re-read the change scope before writing it. Decisions that were explored and abandoned (a swapped library, a reversed approach) live as rationale in `design.md`, not as dead-end commits — clean history carries the final tree, and provenance stays in the design record.

**Merging:** the PR branch MUST be up to date with `main` before merge — rebase it onto the latest `main` (re-seed any stale delta per the two-commit rule; run `pnpm spec:freshness`), push, then merge (merge commit for multi-commit, squash for single-commit). Never bring `main` *into* the branch with a plain merge (it injects a merge commit and pollutes the phase structure) — rebase, or use GitHub's "Update with rebase". Repo settings and the `main` ruleset allow **squash and merge-commit** (not rebase-merge), require the branch to be up to date, and require CI (`lint`, `typecheck`, `test`, `spec-check`) to pass; "Require linear history" is deliberately **off** (it would forbid the merge commit that carries the PR link).

## Convex Auth Note

`convex-host` has a `TODO` comment for `@convex-dev/auth` integration. Do not integrate it until the first Convex implementation task. See `packages/convex-host/AGENTS.md` for details.
