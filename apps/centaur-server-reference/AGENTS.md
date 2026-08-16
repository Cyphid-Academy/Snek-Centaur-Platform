# Agent Context — apps/centaur-server-reference

This app is the reference implementation of the Snek Centaur Server — a Svelte 5 / SvelteKit application backed by `@cyphid/snek-centaur-server-lib`.

## Spec scope

- **Module 08** (`legacy-spec-archive/spec/08-centaur-server-app.md`) — the full Snek Centaur Server Frontend specification.
- **`application-shell`** (`openspec/specs/application-shell/spec.md`, currently landing via `openspec/changes/mint-application-shell/`) — the state binding (`src/lib/shell/binding.svelte.ts`), the surface mounting contract (`src/lib/shell/mounting.ts`), and the one board rendering (`src/lib/board/BoardView.svelte`) every surface built in this app is written against.

## Subtree mirror model

This directory is the **canonical** source. The `cyphid/snek-centaur-server` GitHub repository is a **generated mirror** produced by `git subtree split --prefix=apps/centaur-server-reference`. The mirror workflow (`.github/workflows/mirror-centaur-server.yml`) runs on every push to `main`.

**Do not edit the mirror directly.** All changes must be made here and flow through the mirror workflow.

Forkers fork the mirror repository. PRs from forks come back to the mirror and are cherry-picked into `apps/centaur-server-reference/` by a maintainer before the workflow re-syncs.

When the mirror workflow runs, it rewrites the `@cyphid/snek-centaur-server-lib` workspace dependency in the split output to a `github:cyphid/snek-centaur-server-lib#<latest-tag>` reference so forkers can use it without access to this monorepo. `@cyphid/snek-engine` and `@cyphid/snek-game-configuration` are workspace dependencies of this app too (the application shell's board rendering consumes the engine's domain values directly; game-configuration is needed by the game-configuration surface built on top of the shell) — the mirror workflow's dependency-rewrite step must handle both the same way it handles `snek-centaur-server-lib`.

## What goes here

- The full SvelteKit app as specified in `legacy-spec-archive/spec/08-centaur-server-app.md`.
- `/.well-known/snek-game-invite`, `/.well-known/snek-server-keys` and `/.well-known/snek-healthcheck` — the three endpoints of the enumerated fork compatibility surface. Nothing outside the `/.well-known/snek-` prefix is platform-facing; the rest of the path space belongs to the fork.
- All platform-level and team-internal pages from the spec.
- Uses `defineBot` from `@cyphid/snek-centaur-server-lib` for bot computation.

## Vite / SvelteKit notes

- Dev server runs on port 5000 with `server.allowedHosts: true` so the Replit preview iframe works.
- `@sveltejs/adapter-node` is used for production builds.

## Key files

- `src/lib/shell/binding.svelte.ts` — the one state binding (`application-shell/one-state-binding`)
- `src/lib/shell/mounting.ts` — the surface mounting contract (`application-shell/surface-mounting-contract`)
- `src/lib/board/BoardView.svelte` — the one board rendering (`application-shell/one-board-rendering`)
- `src/routes/+page.svelte` — landing page skeleton
- `src/routes/.well-known/snek-game-invite/+server.ts` — game-start invitation endpoint
- `src/routes/.well-known/snek-server-keys/+server.ts` — published signing keys
- `src/routes/.well-known/snek-healthcheck/+server.ts` — unauthenticated liveness
- `vite.config.ts` — Vite config with allowedHosts
- `svelte.config.js` — SvelteKit config with Node adapter
- `legacy-spec-archive/spec/08-centaur-server-app.md` — binding source of truth
