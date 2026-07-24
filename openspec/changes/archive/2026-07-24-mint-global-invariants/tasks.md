## Depends on

- [x] Capability-rename tooling (PR #17): the `## RENAMES CAPABILITY` delta
  directive, its overlay resolution, fold, and freshness handling. This change
  is authored on top of that branch and uses the directive to rename
  `game-rules → game-engine` from within the change.

## 1. Open change (proposal, design, tasks, spec deltas, staging)
- [x] 1.1 Author the `global-invariants` delta (10 requirements, ADDED-only, Purpose preamble carrying the admission test, cites `game-engine` only)
- [x] 1.2 Author the `game-engine` rename delta (`## RENAMES CAPABILITY: game-rules` + carried Purpose + ADDED `game-engine/runtime-portability`)
- [x] 1.3 Create `docs/spec-migration/` (staging README with the parked-ledger contract, prospective capability map, module-02 parked ledger preserving drafted texts)
- [x] 1.4 Record disposition (own/park/omit/design), the carving-grain pivot, the admission test, per-id bindingness, and semantic corners in proposal.md / design.md
- [x] 1.5 Create `openspec/maps/identifier-lineage.json` recording the `game-rules → game-engine` rename (schema accommodates future merges/splits)
- [x] 1.6 Extend `scripts/spec-migration/audit-module.mjs`: reverse-citation completeness, `pendingRehome` gate, and parked-ledger support (mapped-or-parked disposition; no overlap; stale-reference flagging limited to retired ids)
- [x] 1.7 Update the migration-plan documents for capability-at-a-time carving: `openspec/README.md` (cutover semantics + staging pointer), `docs/openspec-migration.md` (§6 revision), `openspec/config.yaml` migration note

## 2. Implement (code and reference sweep)
- [x] 2.1 Sweep `game-rules/ → game-engine/` references: code citations (`packages/engine`, `apps/visual-tester`), the other capabilities' specs (`test-sequences`, `visual-tester`), docs (README, `openspec/README.md`, `config.yaml`, AGENTS files), and the legacy identifier map's targets/anchors. `specs/game-rules/` itself is NOT swept — the fold renames that folder at archive. Archived change folders and the legacy corpus stay frozen.
- [x] 2.2 Populate `legacy-spec-archive/maps/identifier-map.json` for module 02: `target` + scenario anchors for owned ids; note-only tombstones with `pendingRehome` for omitted/design ids; NO entries for parked ids (that is what keeps them binding) 
- [x] 2.3 Convert module-02 code citations for owned ids: `02-REQ-002 → global-invariants/single-convex-deployment` (convex-host ×3); `02-REQ-034/037 → game-engine`/`global-invariants/one-shared-engine` (engine ×4); drop the `02-REQ-030` half of the centaur-server-lib citation, leaving `07-REQ-001` 
- [x] 2.4 Change `packages/convex-snek-platform` `GameStatus` terminal literal `ended → finished` (type-literal only; no persisted data yet) 

## 3. Archive (terminal fold — on explicit human instruction)
- [x] 3.1 `pnpm spec:fold mint-global-invariants` — folds `global-invariants` (mint) and `game-engine` (rename: folder move + re-prefix + `runtime-portability`); then `openspec archive --skip-specs -y`
- [x] 3.2 Flip the module-02 cutover row to **Partial** (NOT Migrated, and module 02 is NOT added to `MIGRATED_MODULES` — parked ids stay binding and citable); add `global-invariants` to the config context capability list and to the capability map's minted table

## 4. Verification (before archive)
- [x] 4.1 `pnpm spec:check` (strict validation + reference lint + freshness) green
- [x] 4.2 `node scripts/spec-migration/audit-module.mjs 02` green (every module-02 id mapped or parked; targets/anchors resolving; no pending re-homes onto 02; no stale code references to retired ids)
- [x] 4.3 Full test battery, typecheck, biome green
