# Proposal: add-visual-tester

## Why

Module 01's turn resolver is fully implemented and property-tested, but there is no way to *visually* construct a board position, stage moves by hand, and watch the resolver advance it — which makes edge-case investigation, rule vetting, and regression triage slow and error-prone. A visual testing tool turns hand-built scenarios into durable, replayable artifacts (Test Sequences) that pin resolver behaviour and surface regressions as annotated diffs.

## What Changes

- A new dedicated SvelteKit app (`apps/visual-tester/`) — a development/testing tool, separate from the Centaur Server reference app and never part of the player-facing platform.
- A map editor covering every component of engine game state: board terrain, snakes (bodies, health, effects), items, runtime config, and game seed — including states board generation would never produce.
- Manual staging of each snake's move, then one-click simulation of the next turn via the shared engine's `resolveTurn` (never a reimplementation).
- In-memory session history with a scrub bar; editing any past turn truncates all turns after it and simulation continues from the edit.
- **Test Sequence**: a new versioned JSON data contract recording a deterministic run — initial state, per-turn staged moves, and the resolver's full expected output (next state, events, outcome) per turn.
- Persistence of Test Sequences as JSON blobs in Postgres (Replit Postgres for now), with list/load, copy-JSON-to-clipboard, and create-by-pasting-raw-JSON (schema-validated; invalid JSON is rejected and creates nothing).
- Running a Test Sequence replays it through the resolver, halting at the first divergent turn and annotating the differences as a colour-coded diff below the board.

## Capabilities

### New Capabilities

- `test-sequences`: the Test Sequence data contract — canonical JSON format, schema versioning, validation rules, deterministic seed derivation, persistence semantics, and replay-check semantics (expected vs computed comparison). Depends on `game-rules`. Deliberately UI-free so a future headless runner (e.g. CI regression replay) can consume it unchanged.
- `visual-tester`: the dedicated testing app — board-state editor, move staging, turn simulation, session history with scrub bar and history-rewrite, and the Test Sequence management/run UI. Depends on `test-sequences` and `game-rules`.

### Modified Capabilities

*(none — `game-rules` is consumed read-only via the engine's public API)*

## Impact

- **New app**: `apps/visual-tester/` (SvelteKit 2 + Svelte 5, mirroring the reference app's stack; not published, not mirrored).
- **New dependency direction**: first Postgres usage in the repo — a single table, accessed only from the visual-tester's server routes via `DATABASE_URL`. No other package touches it.
- **Engine**: consumed as-is via `@cyphid/snek-engine` public exports (`resolveTurn`, `subSeed`, `isValidMove`, types). No engine changes.
- **Spec corpus**: two new capabilities; no deltas to existing requirements (so no two-commit seeding is needed for this change).
- **CI/scripts**: `pnpm spec:check` picks up the new capabilities automatically; the app joins the workspace's `typecheck`/`lint`/`test` scripts.

## Open Questions

All resolved with the author (Q&A, 2026-07-19):

1. **Divergence handling when running a saved sequence.**
   - *Context*: when the resolver's computed output diverges from the recorded expectation at turn k, what happens to turns after k?
   - *Options*: (a) evaluate every turn independently from its recorded pre-state; (b) cascade the computed state; (c) UI toggle for both.
   - **Decision**: none of the above — the run **stops at the first discrepancy** and shows the diff for that turn. Later turns are not evaluated. (This also dissolves the cascade question: every turn that does get evaluated started from a state the resolver just reproduced exactly.)
2. **Capability carving.**
   - *Context*: the JSON contract could later be consumed headlessly (CI regression runner) without the UI.
   - **Decision**: two capabilities — `test-sequences` (data contract) and `visual-tester` (app).
3. **Diff scope.**
   - *Context*: the user asked for diffs of *states*, but `resolveTurn` also returns `TurnEvent[]` and `GameOutcome`; many regressions are event-only.
   - **Decision**: record and diff the resolver's full observable output — next state **and** events **and** outcome.
