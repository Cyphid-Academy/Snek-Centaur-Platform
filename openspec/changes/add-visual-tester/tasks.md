# Tasks: add-visual-tester

## 1. App scaffold

- [ ] 1.1 Scaffold `apps/visual-tester/` (SvelteKit 2 + Svelte 5 + adapter-node, `vite dev --port 5001 --host`), wire `@cyphid/snek-engine` workspace dep, add `AGENTS.md` describing the app's scope, join root `typecheck`/`lint`/`test`
- [ ] 1.2 Add `pnpm dev:tester` root script; confirm the app boots alongside the reference app

## 2. Test Sequence contract (UI-free modules)

- [ ] 2.1 Canonical codec: engine values ⇄ canonical JSON (hex seeds, sorted-key maps, absent-key optionality) with encode/decode round-trip tests (`test-sequences/canonical-encoding`)
- [ ] 2.2 Zod schema + validation (structure, closed vocabularies, referential integrity, schema version gate) with path-addressed error tests (`test-sequences/validation`, `test-sequences/schema-version`)
- [ ] 2.3 Turn-seed derivation helper matching `subSeed(gameSeed, "turn-" + T)` with a test pinning byte-equality against the engine (`test-sequences/determinism`)
- [ ] 2.4 Replay-check: ordered evaluation, halt-at-first-divergence, `(path, expected, computed)` difference reporting over state+events+outcome, with unit tests for pass / state-divergence / event-only-divergence (`test-sequences/replay-check`)

## 3. Persistence

- [ ] 3.1 Postgres client via `DATABASE_URL` (postgres.js), idempotent `test_sequences` bootstrap on server start (`test-sequences/persistence`)
- [ ] 3.2 CRUD server routes: list (id/name/timestamps only), get, create (validated; invalid paste creates nothing) with round-trip value-fidelity test

## 4. Editor & simulation UI

- [ ] 4.1 Board renderer + map editor: terrain painting, board size, items, snakes (body, health, effects, direction, alive, team/letter), runtime config, game seed; structural-validity enforcement at the editor boundary; boardgen-seeded new-session convenience (`visual-tester/board-editor`)
- [ ] 4.2 Move staging panel with `isValidMove` indication, invalid/unstaged moves passed through unchanged (`visual-tester/move-staging`)
- [ ] 4.3 Simulate-turn action recording full resolver output; repeatable (`visual-tester/turn-simulation`)
- [ ] 4.4 In-memory session history + scrub bar; immutable per-turn snapshots with a no-cross-turn-mutation test (`visual-tester/session-history`)
- [ ] 4.5 History rewrite: edit at turn k truncates k+1..n, simulation continues from k (`visual-tester/history-rewrite`)

## 5. Sequence management & run UI

- [ ] 5.1 Save session as named sequence; list, load into session, copy JSON to clipboard (`visual-tester/sequence-management`)
- [ ] 5.2 Paste-import flow showing validation errors on rejection
- [ ] 5.3 Run mode: halt-at-first-divergence, divergent turn on the board, colour-coded `(path, expected, computed)` diff below with cell highlighting; pass indication with turns-verified count (`visual-tester/sequence-run`)

## 6. Spec hygiene & wrap-up

- [ ] 6.1 Add `// spec: test-sequences/...` and `// spec: visual-tester/...` citations on all non-trivial implementation decisions; `// design: <archived-change-folder>` references where D1–D9 rationale warrants (finalize folder name at archive)
- [ ] 6.2 Run `pnpm spec:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` clean
- [ ] 6.3 At archive (on explicit author instruction): `pnpm spec:fold add-visual-tester` (mints both capability specs from the deltas' `## Purpose` preambles), add `test-sequences` and `visual-tester` to the capability list in `openspec/config.yaml`'s context block, then `openspec archive --skip-specs -y add-visual-tester` as the PR's final commit
