# Agent Context — apps/centaur-server-reference

This app is the reference implementation of the Snek Centaur Server — a Svelte 5 / SvelteKit application backed by `@cyphid/snek-centaur-server-lib`.

## Spec scope

- **Module 08** (`spec/08-centaur-server-app.md`) — the full Snek Centaur Server Frontend specification.

## Subtree mirror model

This directory is the **canonical** source. The `cyphid/snek-centaur-server` GitHub repository is a **generated mirror** produced by `git subtree split --prefix=apps/centaur-server-reference`. The mirror workflow (`.github/workflows/mirror-centaur-server.yml`) runs on every push to `main`.

**Do not edit the mirror directly.** All changes must be made here and flow through the mirror workflow.

Forkers fork the mirror repository. PRs from forks come back to the mirror and are cherry-picked into `apps/centaur-server-reference/` by a maintainer before the workflow re-syncs.

When the mirror workflow runs, it rewrites the `@cyphid/snek-centaur-server-lib` workspace dependency in the split output to a `github:cyphid/snek-centaur-server-lib#<latest-tag>` reference so forkers can use it without access to this monorepo.

## What goes here

- The full SvelteKit app as specified in `spec/08-centaur-server-app.md`.
- `/.well-known/snek-game-invite` endpoint (invitation acceptance + GET healthcheck).
- All platform-level and team-internal pages from the spec.
- Uses `defineBot` from `@cyphid/snek-centaur-server-lib` for bot computation.

## Vite / SvelteKit notes

- Dev server runs on port 5000 with `server.allowedHosts: true` so the Replit preview iframe works.
- `@sveltejs/adapter-node` is used for production builds.
- All engine access goes through `@cyphid/snek-centaur-server-lib` (which re-exports the
  full `@cyphid/snek-engine` surface) — never import the engine package directly, so the
  mirror/forker dependency rewrite keeps working.
- `vitest.config.ts` is a plain config (no SvelteKit plugin, no DOM env) — app tests are
  pure TS and run via the app's own `pnpm test`, not the root workspace suite.
- Svelte 5 gotcha: never hand a `$state` proxy to the engine or bot. The `/demo` page
  keeps the `LocalGame` driver outside `$state` and renders from a plain snapshot.

## Key files

- `src/routes/+page.svelte` — landing page skeleton
- `src/routes/demo/+page.svelte` — playable demo: two bot teams on the full engine rules
  (SVG board, event log, seeded replay) driven by the engine's `createLocalGame`
- `src/lib/snek/bot.ts` — greedy demo bot with certain-death avoidance (module-07 stand-in)
- `src/routes/.well-known/snek-game-invite/+server.ts` — invitation endpoint
- `vite.config.ts` — Vite config with allowedHosts
- `svelte.config.js` — SvelteKit config with Node adapter
- `spec/08-centaur-server-app.md` — binding source of truth
