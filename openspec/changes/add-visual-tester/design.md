# Design: add-visual-tester

## Context

Module 01 (`game-rules`) is fully implemented in `@cyphid/snek-engine` as a pure, deterministic library: `resolveTurn(state, stagedMoves, turnNumber, turnSeed, config)` with `GameState = { board, snakes, items, clocks }`. The platform's seed convention is `turnSeed = subSeed(gameSeed, "turn-" + T)`. There is no visual way to author positions or replay hand-built scenarios, and no Postgres usage anywhere in the repo yet. The author has resolved three Open Questions (see proposal): halt-at-first-discrepancy runs, two capabilities, full resolver output in the diff.

## Goals / Non-Goals

**Goals:**
- A dedicated SvelteKit dev app for visually authoring states, staging moves, simulating turns, and managing/running Test Sequences.
- A UI-free Test Sequence contract (`test-sequences`) a future headless runner (e.g. CI regression replay) can consume unchanged.
- Durable sequence storage in Replit Postgres with paste-import and copy-export.

**Non-Goals:**
- No changes to the engine, SpacetimeDB module, Convex components, or the Centaur Server reference app.
- No auth, no multi-user concerns — this is a single-operator dev tool.
- No CI runner in this change (the contract is shaped for it; building it is future work).
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

### D6 — Persistence: single Postgres table, `postgres` (postgres.js) client, bootstrap-on-start

```sql
CREATE TABLE IF NOT EXISTS test_sequences (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  data       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

Accessed only from the visual-tester's `+server.ts` routes via `DATABASE_URL` (Replit Postgres). Schema bootstrap is an idempotent `CREATE TABLE IF NOT EXISTS` at server start — no migration framework for one table. `jsonb` preserves JSON *value* identity, not byte identity; the round-trip requirement (`test-sequences/persistence#round-trip-fidelity`) is therefore value-level, which D3's canonical encoding makes well-defined (re-serialization from jsonb is re-canonicalised through the codec before display/copy).
*Alternatives considered*: Convex (the platform's persistent runtime — but it drags dev-tool data into product infrastructure and needs a deployment); Drizzle ORM (overhead unjustified for one table); `text` column for byte fidelity (byte identity buys nothing once value identity is canonical). "Replit Postgres for now" is the author's explicit call; the store is plastic behind the two REST-ish routes.

### D7 — Validation: Zod schema in the app, colocated with the codec

Pasted/imported JSON is validated by a Zod schema derived from the engine's types (structural + closed vocabularies + referential integrity checks as refinements), producing path-addressed errors for `test-sequences/validation`. It lives beside the codec in the visual-tester app for now; if/when a headless runner materialises, codec + schema + replay-check lift into a small package — they have no Svelte imports by construction.
*If reversed* (hand-rolled validation): path-quality error reporting is exactly what Zod gives for free; hand-rolling it is where validators rot.

### D8 — Diff presentation: path-level JSON diff, colour-coded by side

The replay-check reports differences as `(path, expected, computed)` over canonical JSON. The UI renders them below the board grouped by top-level section (snakes / board / items / events / outcome), expected in one colour, computed in another, unchanged context muted. Cells implicated by state diffs are also highlighted on the board itself where a path maps to a cell.

### D9 — Editor freedom bounded only by structural validity

The editor accepts any in-vocabulary, in-bounds state (see `visual-tester/board-editor`), because the whole point is reaching states boardgen cannot. Conveniences — "generate from boardgen" seeding of a fresh session, and quick-set helpers — are UI affordances, not spec surface. Clocks are carried through as data (resolveTurn passes `clocks` through untouched) with default values; the editor exposes them read-only in v1 since no resolver behaviour reads them.

## Risks / Trade-offs

- **Engine drift vs saved sequences**: sequences pin resolver behaviour; deliberate rule changes will fail old sequences. That is the feature working — but there is no bulk re-baseline in this change. Mitigation: copy-JSON makes manual re-baselining possible; a "re-record expectations" affordance is cheap future work.
- **`structuredClone`/deep-copy discipline**: history-rewrite and scrubbing require immutable snapshots per turn; engine types are `readonly` but nothing enforces deep-freeze at runtime. Tasks include a test that editing a scrubbed-to turn never mutates neighbouring snapshots.
- **jsonb value-identity**: key order is not preserved by Postgres; anyone comparing raw response bytes to their paste will see reordering. Mitigated by always re-canonicalising through the codec before display/copy (D6).
- **No auth on CRUD routes**: acceptable for a Replit dev tool; noted as a hard prerequisite to revisit if the app is ever exposed beyond the workspace.
