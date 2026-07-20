# Design: add-visual-tester

## Context

Module 01 (`game-rules`) is fully implemented in `@cyphid/snek-engine` as a pure, deterministic library: `resolveTurn(state, stagedMoves, turnNumber, turnSeed, config)` with `GameState = { board, snakes, items, clocks }`. The platform's seed convention is `turnSeed = subSeed(gameSeed, "turn-" + T)`. There is no visual way to author positions or replay hand-built scenarios, and no persistence layer in the repo yet. The author has resolved three Open Questions (see proposal): halt-at-first-discrepancy runs, two capabilities, full resolver output in the diff.

## Goals / Non-Goals

**Goals:**
- A dedicated SvelteKit dev app for visually authoring states, staging moves, simulating turns, and managing/running Test Sequences.
- A UI-free Test Sequence contract (`test-sequences`) a future headless runner (e.g. CI regression replay) can consume unchanged.
- Durable sequence storage as canonical-JSON files in the repo, with paste-import, copy-export, and a promoted fixture tier CI replays.

**Non-Goals:**
- No changes to the engine, SpacetimeDB module, Convex components, or the Centaur Server reference app.
- No auth, no multi-user concerns — this is a single-operator dev tool.
- No standalone/headless CI *tool* in this change, but committed fixtures are already replayed by a vitest regression test (`sequences.regression.test.ts`) — the contract's headless-runner shape realized minimally.
- No bot/centaur involvement — moves are exclusively manual.

## Decisions

### D1 — App placement and stack: `apps/visual-tester/`, SvelteKit 2 + Svelte 5 + adapter-node, port 5001

Mirrors the reference app's stack exactly (same framework majors, same layout, `vite dev --port 5001 --host` so it can run alongside the reference app's 5000 in Replit). Not published, not mirrored, excluded from the mirror workflow's scope by living in its own directory.
*If reversed* (folding into the reference app): the testing tool would ride along into the team-facing mirror `cyphid/snek-centaur-server`, leaking a dev tool with DB credentials into forks. The dedicated app is also what the author explicitly asked for.
*Alternative considered*: a Vite SPA without SvelteKit — rejected because persistence needs server routes, and SvelteKit gives both in one app with the stack the repo already uses.

### D2 — Engine runs in the browser

`@cyphid/snek-engine` is pure TypeScript (`@noble/hashes` is browser-compatible), so simulation, replay-check, validation, and diffing all run client-side. Server routes exist only for sequence CRUD. This keeps simulate/scrub latency at zero and the server surface minimal.
*If reversed* (server-side resolution): every simulate click becomes a network round trip and the tool gains a second copy of session state to keep consistent.

### D3 — Canonical JSON encoding (`test-sequences/canonical-encoding`)

One codec module owns engine-value ⇄ JSON conversion:
- `Uint8Array` seeds → lowercase hex strings.
- `ReadonlyMap` fields (e.g. `GameOutcome.scores`) → plain objects with keys sorted lexicographically.
- `stagedMoves` maps → objects keyed by snake id, sorted; absent snake = absent key.
- Arrays keep engine order (body segments, events are order-significant).
- No `undefined`/`null` padding: optional absence is key absence.

Diffing and equality then reduce to deep-equal over canonical JSON, which is also what gets persisted and copied to the clipboard.
*If reversed* (ad-hoc `JSON.stringify`): Maps silently serialize to `{}`, seeds to index-keyed objects, and equal states can produce unequal JSON — every diff and round-trip guarantee collapses. This is why the encoding is a spec requirement rather than an implementation detail.

### D4 — Seed model: one game seed per sequence, production derivation

The sequence stores a single 32-byte game seed; each turn's seed is `subSeed(gameSeed, "turn-" + T)`, exactly the platform convention. Hand-built sequences and (future) recorded live games therefore share one seed model, and a sequence can never contain per-turn seeds inconsistent with each other.
*If reversed* (explicit per-turn seeds): documents get bigger, hand-edited seeds can silently disagree with the derivation used in production, and live-game import needs a translation step. Constraint mined as `test-sequences/determinism#production-seed-derivation`.

### D5 — Run semantics: halt at first discrepancy (author decision)

Replay resolves turn k from the *recorded* pre-state of turn k; the first turn whose computed output differs from the recording halts the run, and its differences are the run's result. Because the run halts, every turn actually evaluated started from a state the resolver just reproduced — so "continue from recorded vs computed" never arises.
*Alternatives considered*: evaluate all turns independently from recorded pre-states (more findings per run, but a long tail of diffs to read); cascade computed state (true end-to-end behaviour, but one early divergence turns every later diff into noise). The author chose halting: one run surfaces one actionable divergence with zero noise.
*If reversed*: revisit `test-sequences/replay-check` — the halt is spec-level behaviour, not an optimisation.

### D6 — Persistence: canonical-JSON files in the repo, two tiers (author decision, revised from Postgres)

Test Sequences are stored as canonical-JSON files under `apps/visual-tester/sequences/`, in two tiers:
- **fixture** — the files directly in `sequences/`, git-tracked. This is the promoted regression set: `src/lib/sequences.regression.test.ts` globs them and replays each through `resolveTurn`, so committing a fixture turns it into CI coverage. "Save as fixture" in the UI writes here.
- **scratch** — `sequences/scratch/`, gitignored. Working saves ("Save session"); they survive server restarts but never enter version control.

Accessed only from the `+server.ts` routes via `$lib/server/fsStore.ts` (`listSequences`/`getSequence`/`createSequence`, the same interface the UI already called). An id is the filename stem (`<slug>-<8 hex>`, constrained to `[a-z0-9-]+` so a request id can't escape the directory); the display name lives inside the document, timestamps come from `stat`. The files *are* the canonical documents, so copy/paste and the round-trip guarantee (`test-sequences/persistence#round-trip-fidelity`) are exact and D3's re-canonicalization-after-jsonb dance disappears. Root resolves to `<cwd>/sequences` (the app's dev/build/test commands all run with the app dir as cwd) with a `VT_SEQUENCES_DIR` override for other deployments.

*Why this over the earlier Postgres table*: the stated goals are minimal friction on **both** Replit and agent VMs, and convenient CI/testing integration. Postgres fails the first — it isn't provisioned on agent VMs (the app 500'd here until the boot was made DB-optional) and needs a service container in CI — and the second, because fixtures would have to be loaded into a DB for CI to replay them. Files are zero-setup in all three environments, and "promotion" is just review + commit, with "an agent noticing unsynced sequences" reducing to `git status`. Test Sequences are test fixtures, and fixtures belong in the repo.
*Alternatives considered*: **SQLite** (`node:sqlite`, no native build on Node 22) — a binary `.db` in git is opaque, merge-conflict-prone, and not human-reviewable, defeating review-at-promotion; gitignoring it plus export tooling just reinvents files with extra parts. **PGlite** (embedded Postgres-in-WASM) — same binary-in-git problem, heavier dep. **Real Postgres/Convex** — high friction on agent VMs and CI, drags dev-tool data into product infrastructure. The store stays plastic behind the three-function interface.
*Trade-off*: files give value identity and git history/review, not transactional guarantees or concurrent-write safety — irrelevant for a single-operator dev tool.
*If reversed*: the `test-sequences/persistence` requirement is storage-agnostic (it never named a mechanism), so only this module and D6 change; the routes and UI are unaffected by construction.

### D7 — Validation: Zod schema in the app, colocated with the codec

Pasted/imported JSON is validated by a Zod schema derived from the engine's types (structural + closed vocabularies + referential integrity checks as refinements), producing path-addressed errors for `test-sequences/validation`. It lives beside the codec in the visual-tester app for now; if/when a headless runner materialises, codec + schema + replay-check lift into a small package — they have no Svelte imports by construction.
*If reversed* (hand-rolled validation): path-quality error reporting is exactly what Zod gives for free; hand-rolling it is where validators rot.

### D8 — Diff presentation: path-level JSON diff, colour-coded by side

The replay-check reports differences as `(path, expected, computed)` over canonical JSON. The UI renders them below the board grouped by top-level section (snakes / board / items / events / outcome), expected in one colour, computed in another, unchanged context muted. Cells implicated by state diffs are also highlighted on the board itself where a path maps to a cell.

### D9 — Editor freedom bounded only by structural validity

The editor accepts any in-vocabulary, in-bounds state (see `visual-tester/board-editor`), because the whole point is reaching states boardgen cannot. Conveniences — "generate from boardgen" seeding of a fresh session, and quick-set helpers — are UI affordances, not spec surface. Clocks are carried through as data (resolveTurn passes `clocks` through untouched) with default values; the editor exposes them read-only in v1 since no resolver behaviour reads them.

### D10 — Snake rendering: contiguous silhouette via centerline inflation (copied from the demo renderer)

Each snake renders as a single closed SVG `<path>`, never per-cell tiles: dedupe consecutive stacked segments (game-start stacks, duplicated growth tails), collapse the body to a cell-center polyline with collinear runs merged, inflate it by `cellSize/2 − padding` with round joins/ends (`clipper2-ts` `inflatePathsD`), and emit one path with `fill-rule="evenodd"`; a single-segment body renders as a rounded square, and the head gets a ringed circle with the snake's letter. The algorithm (`snakeBodyPath.ts` + `SnakeBody.svelte`) is *copied from* PR #6's demo renderer, not imported across app boundaries: the reference app is mirrored externally and must not grow visual-tester coupling (D1). In the visual tester the silhouettes live in an SVG overlay above the zero-gap editor cell grid (`pointer-events: none`, shared cell geometry via viewBox), so the editor keeps its per-cell click targets untouched.
*Consequences*: (a) the path builder requires each consecutive segment pair to be orthogonally adjacent or stacked — a "teleporting" body is not a snake under game-rules/movement, so contiguity is enforced at the editor boundary (`visual-tester/board-editor`) and in sequence validation (`test-sequences/validation`); (b) a discontinuous body is nonetheless *possible* as resolver output or a stale sequence, and there it is a bug to catch — so the board does NOT silently render it. `BoardView` detects discontinuities (`firstDiscontinuity`) and surfaces a loud on-page error while marking the offending raw segments, per `visual-tester/invalid-state-surfacing`; `SnakeBody` therefore never receives a broken body and keeps the demo copy's throwing contract (a silent render would defeat the tool's purpose — an early draft's graceful fallback was removed on author feedback).
*If reversed* (per-cell tiles): bodies read as disconnected fragments and stacked segments become invisible double-draws — the lesson the demo renderer already encodes.

### D11 — Auto-persist the working session to scratch; fork on middle edits (author decision)

There is no "save scratch" action: the working session is continuously persisted to a scratch sequence, and the only explicit save promotes a snapshot to a fixture (`visual-tester/auto-persist`). The store binds the session to a scratch **slot** and routes each mutation:
- **Head edit** (editing/simulating/renaming at the end of history) → update the bound scratch file in place, debounced (300 ms) so a health-field drag isn't one write per keystroke.
- **Middle edit** (editing a turn k before the head) → the session already truncates to 0..k; a *new* scratch is forked from that (named `<parent> (branch @turn k)`), the session rebinds to it, and the previous scratch keeps its full history on disk (`visual-tester/history-rewrite#middle-edit-forks-scratch`).
- **Loaded fixture, first modification** → fork to a scratch (fixtures are never written by autosave).

**Slot indirection is the key correctness device.** The scratch's server id is assigned asynchronously, but a brand-new session's first two synchronous edits must target *one* file. So a mutation creates a `Slot { id: string | null }` synchronously and binds to it immediately; persistence runs on a **serialized queue** where a slot's create is always enqueued before any update targeting it, so the id is known by update time. Without this, back-to-back edits before the create resolves each materialize a separate scratch (a bug caught in `store-autosave.test.ts`). The debounced head-update snapshots the doc at schedule time, so forking flushes the parent's last head state to the parent slot before branching.

**Naming**: auto-created scratches are named from the game seed (`scratch <hex6>` / `boardgen <hex6>`) and are renamable inline (rename updates the scratch, or forks a loaded fixture under the new name). Fork names carry the branch point; a `stripBranch` guard keeps repeated forks from stacking suffixes.

**No delete UI** (author decision): scratch accumulates and is cleaned up out-of-band (manual deletion / ephemeral VMs). Fixture save-by-name overwrites the matching fixture after an inline confirmation.

The decision logic is a pure function (`planPersist`) tested independently of fetch/DOM; the store wires it to a `SequenceClient` port (fetch in production, an in-memory fake in tests).
*If reversed* (explicit scratch save, in-place middle edits): the tester loses work on a forgotten save, and editing mid-history destroys the longer lineage the author wanted preserved as a branch.

### D12 — Session stability, board-gen settings, URL selection, and failure communication

A cluster of usability fixes:
- **Dev-server stability**: autosave writes Test Sequence files *inside* the project tree (`sequences/`), which the Vite dev watcher treated as source changes — reloading the page and wiping the in-memory session a moment after each edit (the reported "resets a few moments later" / intermittent blank fields). Fixed by ignoring `sequences/**` in `server.watch`. It is data, never a module. Production (adapter-node) has no watcher and was unaffected.
- **URL selection (`?seq=<id>`)** doubles as reload resilience: the active sequence's id is mirrored to the URL, and on load a `?seq` restores that sequence — so even an unexpected reload lands back on the working scratch. The incoming id is captured synchronously and the sync effect is gated behind an `initialized` flag, otherwise the effect (seeing `selectedId === null` at mount) would strip the param before the async load reads it.
- **Never-blank prerequisites**: the seed/board-size inputs initialize from the live session at declaration (not via an after-mount effect), and a fresh session always carries a valid seed + board (`visual-tester/board-editor#fresh-session-ready`) — so nothing is ever un-editable with no explanation.
- **Board-generation settings** (board size, snakes/team, hazard %, fertile density & clustering) feed `generateBoardAndInitialState`; they are orchestration inputs, not part of a sequence (the generated board *is* the state), so they live as store UI state, consistent with D9 (boardgen is an affordance, not spec surface). A generation failure now reports its `BoardGenerationFailure.code` and what to adjust, rather than doing nothing.
- **Item placement**: placing over an existing item replaces it (`visual-tester/board-editor#item-placement-replaces`), but an item may never share a cell with a snake body (`#item-not-on-body`) — the engine keeps items off *alive* bodies (`game-rules/item-spawning` excludes alive snakes; a surviving head consumes any item it enters), and every editor snake is alive, so the editor rejects an item on a body and a body onto an item. (Dead snakes are off the board after their death turn — `context.ts` resolves only `aliveInS` — so an item on a dead snake's cell is not coexistence; no engine change is needed.)

### D13 — Derived letters, configured teams, and snake selection

- **Auto letters** (`visual-tester/board-editor#letters-auto-assigned`): a snake's letter is its index within its team (game-rules/initial-snakes: lettered from A within the team), so `relabelTeams` re-derives all letters after any add / remove / team change and the letter is never hand-entered. `addSnake` no longer takes a letter.
- **Teams as UI state** (`visual-tester/team-configuration`): a team is `{ id, name, colour }`. The id is the stored identity (`centaurTeamId`); name and colour are presentation and are *not* part of a Test Sequence (the doc is the game-rules contract, which carries no team display metadata). Team ids are **numeric** (`team-0`, `team-1`, … — the smallest free `team-<n>`), deliberately NOT derived from the name or colour so those stay freely editable without the id drifting out of sync; the boardgen default teams use the same `team-0`/`team-1` ids so a generated state aligns with the configured teams. Adding a team draws the next name+colour from a fixed palette but mints a fresh numeric id. On load or generate, `#ensureTeamsForState` adds a palette-defaulted config for any team id present without one, never disturbing edited teams — so colours/names are reconstructed deterministically rather than persisted.
- **Selection is a separate visual channel** (`visual-tester/snake-selection`): buff status is already a body *border* (stroke — invuln buff solid gold, debuff dashed gold, invisibility fades opacity), so the selection indicator is a *glow* (SVG `drop-shadow`), leaving the border fully visible. Selection is single-valued in the store and bidirectionally bound: it is the sole expanded list entry (`<details open>` driven by selection, summary click toggles it) and is set by clicking a snake's body on the board under the Inspect tool (clicking empty space clears it).

### D14 — One-turn dead-snake ghosts, names over ids, and staged-move arrows

- **Dead snakes are off the board after their death turn** (`visual-tester/snake-rendering#dead-snake-ghost-one-turn`): the engine keeps a dead snake in `GameState.snakes` only so its active effects run their course, but `context.ts` filters to `aliveInS` before resolution and game-rules/collisions-and-severing keeps a severed body on the board only for the death turn. So the board renders alive snakes plus a *single-turn* faded ghost: a snake dead in the displayed state that was alive in the immediately preceding turn's state (`store.ghostSnakeIds` compares the cursor turn against turn − 1). This hints where a snake fell for one turn, then it vanishes — matching the engine's own board semantics rather than showing every historical corpse. At the initial turn (no preceding state) any already-dead snake is treated as a ghost, since there is no earlier turn to prove it died earlier.
- **Teams shown by name, never id** (`visual-tester/team-configuration`): the `team-<n>` id is stored identity, not a label. `store.teamName(id)` resolves the configured name (falling back to the id only if unconfigured) and every surface that showed a team id — move panel, history outcome/scores, add-snake picker — now shows the name. Ids remain the wire identity in the Test Sequence document; only presentation changes.
- **Staged-move arrows** (`visual-tester/move-staging#staged-arrows`): a staged direction is otherwise only legible in the move panel, so the board draws a small arrowhead on the staged snake's head pointing in the staged direction (`BoardView.stagedArrow`, from the store's `staged` map). It clears when the move is unstaged or the turn is simulated (staging resets on a new head state), giving an at-a-glance read of pending moves next to the selection glow and buff border — a third, non-conflicting overlay channel.

### D15 — Selection is one value; every consequence is derived (bug-class fix)

- **The bug class**: "which snake is the subject" was tracked in two places — `store.selectedSnakeId` (board glow, sole-expansion, move-panel highlight) and the `extendBody` tool's own captured `snakeId` — and adding a snake selected nothing. So a freshly-added snake could be open for editing while the board still highlighted a *different* snake, and clicking to grow the new snake instead appended to the stale tool target (a contiguity rejection). Any feature that reads "the selected snake" from one of these while another writes the other drifts the same way.
- **The fix** (`visual-tester/snake-selection`): `selectedSnakeId` is the single source of truth, written only through `selectSnake(id | null)` — a plain atomic setter, not a toggle. `extendBody` loses its `snakeId` and becomes a pure mode that grows `store.selectedSnake`; the per-row "Extend body" button *is* a select-plus-enter-extend gesture, so its target and the highlight are the same value. `addSnakeAt(cell)` creates and selects in one operation, so the new snake is immediately the expanded row, the highlighted body, and the extend target. `selectedSnake` is a derived getter that resolves the id against the displayed turn's snakes and yields null when it isn't present — so a removed or off-board selection self-heals with no clearing step, and stale ids can't capture a click. Toggle-to-deselect survives only where it is a real affordance (the list summary), computed at the call site and passed to the same setter.

### D16 — Head-parity enforcement on snake placement

- **The invariant** (`game-rules/starting-placement#shared-parity`): all starting heads share one `(x + y) mod 2`, and since every snake steps exactly one cell per turn, that parity flips in lockstep for all heads — so at *every* reachable turn the heads share a parity. A mixed-parity head arrangement is a state the engine can never produce, and authoring one lets edits exercise undefined collision behaviour instead of real edge cases. The editor previously allowed it.
- **The rule** (`visual-tester/board-editor#head-parity-enforced`): `requiredHeadParity(state)` is the parity of the first alive head (null if none). `addSnake` rejects a head whose `cellParity` differs — head parity joins in-bounds, vocabulary, and body-contiguity as an enforced structural-validity rule. Body extension is unconstrained (contiguity already governs it); only head cells carry parity. Dead snakes are off the board, so only alive heads fix the parity. The first head, with parity unfixed, may land anywhere.
- **The affordance**: while the Add Snake tool is active and a parity is fixed, `+page` passes `blockedParity = 1 − required` to `BoardView`, which tints every cell of that parity with a translucent red `::after` — a checkerboard that reads at a glance as "not here". It shows only during placement (not while painting or inspecting) so it never clutters other editing, and the rejection message explains a wrong-parity click that slips through. This tightened `#arbitrary-states-allowed`: "adjacent heads" (orthogonal, hence opposite parity) is no longer an allowed example; diagonally adjacent heads (shared parity) still are.

## Risks / Trade-offs

- **Engine drift vs saved sequences**: sequences pin resolver behaviour; deliberate rule changes will fail old sequences. That is the feature working — but there is no bulk re-baseline in this change. Mitigation: copy-JSON makes manual re-baselining possible; a "re-record expectations" affordance is cheap future work.
- **`structuredClone`/deep-copy discipline**: history-rewrite and scrubbing require immutable snapshots per turn; engine types are `readonly` but nothing enforces deep-freeze at runtime. Tasks include a test that editing a scrubbed-to turn never mutates neighbouring snapshots.
- **Filesystem durability, not a DB**: scratch saves live on the container's disk and are lost when an ephemeral agent VM is reclaimed; only committed fixtures are durable across environments. That is the intended model (scratch is working state; promotion = commit), but it means an unsynced scratch sequence worth keeping must be saved as a fixture and committed before the session ends.
- **Scratch accumulation with no delete UI** (D11, author decision): auto-persist plus fork-on-middle-edit steadily grows `sequences/scratch/`, and there is no in-app way to prune it — cleanup is manual or via ephemeral VMs. Revisit if the clutter becomes painful on long-lived Replit workspaces.
- **Autosave is best-effort**: a failed write surfaces `persistError` but does not block editing, and rapid edits during a slow write queue behind it (serialized). Acceptable for a single-operator local tool.
- **No auth on CRUD routes**: acceptable for a Replit dev tool; noted as a hard prerequisite to revisit if the app is ever exposed beyond the workspace.
