# Agent Context — apps/visual-tester

This app is the **visual tester** — a development/testing tool for visually constructing board positions, staging moves, simulating turns via the shared engine, and managing/running Test Sequences. It is **never player-facing** and is separate from the Centaur Server reference app.

## Spec scope

- OpenSpec change `openspec/changes/add-visual-tester/` (capabilities `test-sequences` and `visual-tester`).

## Scope and boundaries

- **Dev tool only** — not published, not part of any deployment, no auth (single-operator tool inside the workspace).
- **Not mirrored** — unlike `apps/centaur-server-reference/`, this directory is NOT part of any subtree mirror. It must never leak into the `cyphid/snek-centaur-server` mirror.
- **Engine is consumed read-only** via `@cyphid/snek-engine` public exports (`resolveTurn`, `subSeed`, `isValidMove`, types). No engine changes originate here.
- Persistence is filesystem JSON, not a database (design D6): Test Sequences are canonical-JSON files under `sequences/` — git-tracked **fixtures** (the CI regression set replayed by `src/lib/sequences.regression.test.ts`) and gitignored `sequences/scratch/` working saves. Accessed only from this app's `+server.ts` routes via `$lib/server/fsStore.ts`. Zero setup on Replit, agent VMs, and CI — no `DATABASE_URL`.

## Stack

- SvelteKit 2 + Svelte 5 + `@sveltejs/adapter-node`, mirroring the reference app.
- Dev server: `vite dev --port 5001 --host` (with `allowedHosts: true`) so it runs alongside the reference app on port 5000 in Replit. Root script: `pnpm dev:tester`.

## Key files

- `src/routes/+page.svelte` — editor & simulation UI (board editor, move staging, history scrub)
- `src/lib/session.ts` — in-memory session history (immutable snapshots, history rewrite)
- `src/lib/editor.ts` — editor-boundary operations with structural-validity enforcement
- `vite.config.ts` — port 5001, host exposure, allowedHosts
- `svelte.config.js` — SvelteKit config with Node adapter
- `openspec/changes/add-visual-tester/design.md` — binding design decisions (D1–D9)
