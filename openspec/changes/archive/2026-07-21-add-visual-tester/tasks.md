# Tasks: add-visual-tester

## 1. App scaffold

- [x] 1.1 Scaffold `apps/visual-tester/` (SvelteKit 2 + Svelte 5 + adapter-node, `vite dev --port 5001 --host`), wire `@cyphid/snek-engine` workspace dep, add `AGENTS.md` describing the app's scope, join root `typecheck`/`lint`/`test`
- [x] 1.2 Add `pnpm dev:tester` root script; confirm the app boots alongside the reference app

## 2. Test Sequence contract (UI-free modules)

- [x] 2.1 Canonical codec: engine values ⇄ canonical JSON (hex seeds, sorted-key maps, absent-key optionality) with encode/decode round-trip tests (`test-sequences/canonical-encoding`)
- [x] 2.2 Zod schema + validation (structure, closed vocabularies, referential integrity, schema version gate) with path-addressed error tests (`test-sequences/validation`, `test-sequences/schema-version`)
- [x] 2.3 Turn-seed derivation helper matching `subSeed(gameSeed, "turn-" + T)` with a test pinning byte-equality against the engine (`test-sequences/determinism`)
- [x] 2.4 Replay-check: ordered evaluation, halt-at-first-divergence, `(path, expected, computed)` difference reporting over state+events+outcome, with unit tests for pass / state-divergence / event-only-divergence (`test-sequences/replay-check`)

## 3. Persistence

- [x] 3.1 Filesystem store `fsStore.ts` (design D6): canonical-JSON files under `sequences/`, git-tracked `fixture` tier + gitignored `scratch/`; list/get/create with safe id derivation; round-trip + tier-placement tests that run with no DB (`test-sequences/persistence`)
- [x] 3.2 CRUD server routes: list (id/name/tier/timestamps only), get, create (validated; `?tier=`; invalid paste creates nothing)
- [x] 3.3 CI regression: `sequences.regression.test.ts` globs committed fixtures and replays each through the resolver — promotion (save-as-fixture + commit) becomes CI coverage (`test-sequences/replay-check`)

## 4. Editor & simulation UI

- [x] 4.1 Board renderer + map editor: terrain painting, board size, items, snakes (body of any length ≥ 1, health, effects, team/letter; alive and last direction lifecycle-derived, never editable), runtime config, game seed; structural-validity enforcement at the editor boundary; boardgen-seeded new-session convenience (`visual-tester/board-editor`)
- [x] 4.2 Move staging panel with `isValidMove`-based certain-death marking (advisory only), all staged/unstaged moves passed through unchanged (`visual-tester/move-staging`)
- [x] 4.3 Simulate-turn action recording full resolver output; repeatable (`visual-tester/turn-simulation`)
- [x] 4.4 In-memory session history + scrub bar; immutable per-turn snapshots with a no-cross-turn-mutation test (`visual-tester/session-history`)
- [x] 4.5 History rewrite: edit at turn k truncates k+1..n, simulation continues from k (`visual-tester/history-rewrite`)
- [x] 4.6 Contiguous snake silhouettes (design D10): copy `snakeBodyPath.ts` + `SnakeBody.svelte` from the demo renderer (PR #6, clipper2-ts centerline inflation) into an SVG overlay above the editor grid; enforce body contiguity in `appendBodyCell` and the sequence schema, with unit tests for the path builder and both guards
- [x] 4.7 Invalid-state surfacing (`visual-tester/invalid-state-surfacing`): `BoardView` detects a discontinuous snake body (resolver bug / stale sequence), shows a prominent on-page error and marks the raw segments instead of a silhouette; unit tests for the detector and a mounted-component test for the banner

## 5. Sequence management & run UI

- [x] 5.1 List with tier badges + tier filter (all/fixtures/scratch), load into session, copy JSON to clipboard (`visual-tester/sequence-management`)
- [x] 5.2 Paste-import to scratch, showing validation errors on rejection
- [x] 5.3 Run mode: halt-at-first-divergence, divergent turn on the board, colour-coded `(path, expected, computed)` diff below with cell highlighting; pass indication with turns-verified count (`visual-tester/sequence-run`)
- [x] 5.4 Auto-persist (`visual-tester/auto-persist`, design D11): pure `planPersist` (update/fork/create) + `SequenceClient` port; store slot indirection with a serialized queue and debounced head-update; head edits update the bound scratch, middle edits fork `<parent> (branch @turn k)`, loaded fixtures fork on first edit; inline rename; `PUT` route + `fsStore.updateSequence`. Unit tests: planner, fsStore update, store lifecycle against a fake client
- [x] 5.5 Fixture save is the only explicit save, with overwrite-by-name confirmation (`visual-tester/sequence-management#fixture-overwrite-confirm`)
- [x] 5.6 URL `?seq=<id>` mirrors the active selection and restores it on load; sync effect gated so it can't strip the incoming id (`visual-tester/sequence-management#url-selection-sync`, design D12)

## 7. Usability hardening (design D12)

- [x] 7.1 Dev-server stability: ignore `sequences/**` in Vite `server.watch` so autosave writes don't reload the page and wipe the session
- [x] 7.2 Never-blank prerequisites: seed/board-size inputs initialize from the live session; a fresh session always has a valid seed + board (`visual-tester/board-editor#fresh-session-ready`)
- [x] 7.3 Board-generation settings (board size, snakes/team, hazard %, fertile density & clustering) drive `newFromBoardgen`; failures report the reason
- [x] 7.4 Item placement replaces an existing item instead of failing (`visual-tester/board-editor#item-placement-replaces`); update the one-item-per-cell test
- [x] 7.5 Enforce the engine invariant in the editor: an item may not share a cell with a snake body — reject placing an item on a body and a body onto an item (`visual-tester/board-editor#item-not-on-body`). Confirmed no engine change is needed (dead snakes are off-board after their death turn; items are already kept off alive bodies)

## 8. Teams, auto-letters, and snake selection (design D13)

- [x] 8.1 Auto-assign snake letters by team index; `relabelTeams` runs after add/remove/team-change; drop the manual letter editor and `setSnakeLetter` (`visual-tester/board-editor#letters-auto-assigned`)
- [x] 8.2 Team configuration: store `teams` ({id,name,colour}) with an auto-colour palette, add/rename/recolour, Add Snake team dropdown, board colours from team config, reconcile teams on load/generate (`visual-tester/team-configuration`)
- [x] 8.3 Snake selection: single selection, sole-expanded list entry, expand-selects, board-body-click-selects; glow indicator distinct from buff-status body borders (`visual-tester/snake-selection`)
- [x] 8.4 One-turn dead-snake ghost: render only alive snakes plus snakes that died on the displayed turn (alive the turn before), never dead snakes on later turns (`visual-tester/snake-rendering#dead-snake-ghost-one-turn`)
- [x] 8.5 Identify teams by name, not id, throughout the UI — move panel, history/outcome, add-snake picker (`visual-tester/team-configuration`)
- [x] 8.6 Highlight the selected snake in the move-staging panel (`visual-tester/snake-selection`)
- [x] 8.7 Draw a staged-move direction arrow on each staged snake's head on the board (`visual-tester/move-staging#staged-arrows`)
- [x] 8.8 Selection single-source-of-truth (design D15): `selectedSnakeId` written only via the atomic `selectSnake` setter; `extendBody` tool drops its captured id and grows `selectedSnake`; `addSnakeAt` creates-and-selects atomically; `selectedSnake` derived getter self-heals a removed/off-board selection (`visual-tester/snake-selection#creation-selects`, `#extend-targets-selection`)
- [x] 8.9 Head-parity enforcement (design D16): `requiredHeadParity`/`cellParity` in editor; `addSnake` rejects a head off the shared parity; `BoardView` red-checkerboard overlay of wrong-parity cells while the add-snake tool is active (`visual-tester/board-editor#head-parity-enforced`)

## 6. Spec hygiene & wrap-up

- [x] 6.1 Add `// spec: test-sequences/...` and `// spec: visual-tester/...` citations on all non-trivial implementation decisions; `// design: <archived-change-folder>` references where D1–D9 rationale warrants (finalize folder name at archive)
- [x] 6.2 Run `pnpm spec:check`, `pnpm typecheck`, `pnpm lint`, `pnpm test` clean
- [x] 6.3 At archive (on explicit author instruction): `pnpm spec:fold add-visual-tester` (mints both capability specs from the deltas' `## Purpose` preambles), add `test-sequences` and `visual-tester` to the capability list in `openspec/config.yaml`'s context block, then `openspec archive --skip-specs -y add-visual-tester` as the PR's final commit
