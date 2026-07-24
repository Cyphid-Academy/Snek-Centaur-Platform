# OpenSpec Corpus

This directory is the [OpenSpec](https://github.com/Fission-AI/OpenSpec)
root for the Team Snek Centaur Platform, used **strictly** — Purpose +
Requirements + scenarios in `specs/`, mechanism in code, decision rationale
in archived change folders. Conventions and rules live in
[`config.yaml`](config.yaml); the migration strategy's history is in
[`docs/openspec-migration.md`](../docs/openspec-migration.md).

## Identifier grammar

Requirements are identified like code symbols:

```
game-engine/team-potion-effects                      # a requirement
game-engine/team-potion-effects#sacrificial-collection   # one of its scenarios
```

- Definition headers carry the full path: `### Requirement:
  game-engine/team-potion-effects`; scenarios are `#### Scenario: #<slug>`.
- Identifiers are frozen API: renames only via RENAMED deltas with a
  same-commit sweep of all references. Renaming a whole **capability**
  (folder + every requirement's prefix) is a change-folder operation: the
  new capability's delta opens with a `## RENAMES CAPABILITY: <old>`
  directive above its `## Purpose` preamble and is otherwise ADDED-only.
  While the change is open the reference lint resolves both the old and new
  names (the overlay carries the source's requirements over); `pnpm
  spec:fold` performs the folder move and re-prefix at archive. Record the
  capability rename in `openspec/maps/identifier-lineage.json` so archived
  changes that cite the old name stay traceable.
- Code cites `// spec: <capability>/<slug>[#<scenario>]`; archived decision
  rationale is cited `// design: <archived-change-folder>`.
- The capability dependency rule is lint-enforced: every Purpose (a
  capability's `spec.md`, or a mint delta's preamble) declares its
  dependencies in a `Depends on:` sentence; a capability's spec may
  reference only itself and those declared dependencies, and the declared
  graph must stay acyclic.
- `pnpm spec:check` validates structure (strict OpenSpec validation of
  `specs/` and of every open change), every reference and the capability
  dependency graph (`scripts/check-spec-citations.mjs`), and open changes'
  seed freshness (`scripts/check-change-freshness.mjs`).

## The legacy corpus and the identifier map

The pre-OpenSpec corpus is quarantined in
[`legacy-spec-archive/`](../legacy-spec-archive/README.md) and is **fully
historical** (corpus retired 2026-07-24): every numeric `MM-REQ-NNN`
requirement and `MM-REVIEW-NNN` review item is tombstoned in
[`legacy-spec-archive/maps/identifier-map.json`](../legacy-spec-archive/maps/identifier-map.json)
— the sole bridge between the eras. Each entry names its new home (a
target resolving in `openspec/specs/` or, until archived, in the named
open change's deltas), the scenarios pinning its edge cases, and the
retiring change by its stable, dateless name. Citing a numeric identifier
anywhere in code or specs is a lint error.

| Module | Capability homes | Status |
|--------|------------------|--------|
| 01-game-rules | `game-engine` | **Migrated** |
| 02-platform-architecture | `global-invariants` + user-story capabilities | **Migrated** |
| 03-auth-and-identity | `identity-and-authorization`, `team-server-management`, … | **Migrated** |
| 04-stdb-engine | `turn-pacing`, `live-game-observation`, `replay-and-audit`, … | **Migrated** |
| 05-convex-platform | `game-lifecycle`, `rooms-and-matchmaking`, `tournaments`, … | **Migrated** |
| 06-centaur-state | `bot-configuration`, `operator-control`, `replay-and-audit`, … | **Migrated** |
| 07-bot-framework | `bot-framework`, `turn-pacing`, `decision-transparency`, … | **Migrated** |
| 08-centaur-server-app | `accounts-and-profiles`, `operator-control`, `replay-and-audit`, … | **Migrated** |

(The map is authoritative per identifier; the table is orientation only.
Module 09 was absorbed into module 08 pre-migration.) `node
scripts/spec-migration/audit-module.mjs <NN>` remains as a regression
check that every module's disposition stays complete and resolving. The
migration's planning artifacts — capability map, assignment matrix,
parked ledger, staged retirements — are archived permanently under
[`legacy-spec-archive/spec-migration/`](../legacy-spec-archive/spec-migration/).
The capability dependency graph's live home is the `Depends on:`
declaration in each capability's Purpose (lint-derived and acyclic;
`spec:fold` enforces dependency-ordered archiving).

## Workflow

Spec-affecting work flows through OpenSpec changes: `/opsx:explore` →
`/opsx:propose` → **author review of the change artifacts** (Open Questions
resolved, deltas approved) → `/opsx:apply` — implementation lands alongside
the still-open change folder (in the authoring PR when spec and code ship
together, otherwise in a later PR) → `openspec archive` at the tail of the
PR that completes the implementation (the archive-due gate enforces this)
→ merge. Five conventions bind agents:

- **Two-commit delta authoring.** A delta that modifies existing
  requirements is introduced across exactly two commits: the first seeds
  the delta file with the affected requirement blocks copied verbatim from
  `specs/`; the second applies the edits. The second commit's diff is then
  a native word-level review diff of exactly what the change does to the
  requirements. This is an AI responsibility — and if the deltas are
  revised after review, the AI rewrites history to keep the seed/edit pair
  intact rather than stacking correction commits. (In the Replit
  environment, use the scripted-rebase tooling for this — see
  `replit.md` → "Scripted history rewriting".)
- **New capabilities are minted by their change's delta.** A delta file
  whose capability has no `specs/<capability>/spec.md` yet must open with
  a `## Purpose` preamble — the capability's Purpose section, including
  its "Depends on:" line — above `## ADDED Requirements`, and must be
  ADDED-only. `pnpm spec:fold` creates the capability's spec.md from it
  (`# <capability> Specification` + Purpose + Requirements); the stock
  validator, the reference lint's overlay, and the fold op-parser all
  ignore the preamble until then. The preamble is the explicit mint
  marker, and it is guarded from both sides (continuously by `pnpm
  spec:freshness`, and as fold's hard precondition): a missing capability
  *without* a preamble fails — otherwise a typo'd capability folder name
  would silently mint a bogus capability — and a preamble whose capability
  *already exists* fails, because another change minted it first (e.g.
  across a rebase) and the Purpose was never reconciled. Minting a
  capability also means adding it to the capability list in
  `config.yaml`'s context block at archive time.
- **Archiving means implemented — the archive-due gate.** `specs/` is the
  record of how the system behaves, so a change archives in the PR that
  **completes its implementation**, never merely when its deltas are
  drafted. Open changes are a first-class state (approved spec work whose
  implementation hasn't landed) and any number may live on main. The
  enforced invariant is the dual: a change whose `tasks.md` has zero
  unchecked tasks outside its final `## Archive` section is
  **archive-due**, and the PR that reaches that state must archive it at
  its tail (`scripts/check-open-changes.mjs`; CI posts the
  `no-archive-due-changes` merge-readiness status — pending, not failed,
  while any change is due). Every `tasks.md` therefore keeps its
  archive-time bookkeeping (fold+archive, the config.yaml capability
  list) under a final `## Archive` heading, exempt from the completeness
  count. Folding
  additionally enforces **capability-dependency order**: a delta citing a
  capability that exists only as another open change refuses to fold —
  archive the minting change first.
- **Archiving is a human decision.** Archiving folds the
  deltas into `specs/` (the only way `specs/` ever advances) and is the
  terminal act of a change — executed once review is resolved, at the
  tail of the completing PR (one archive commit per change). An AI agent should say when everything
  in the PR looks resolved and ready to archive, but never archives without
  explicit instruction. Until then `specs/` states pre-change truth; the
  reference lint resolves citations against `specs/` overlaid with open
  changes' deltas, so code may already cite identifiers an open delta
  introduces. Mechanically, archiving is two steps: `pnpm spec:fold
  <change>` folds the deltas into `specs/` (full-block MODIFIED
  replacement, licensed by the two-commit convention and gated on the
  seed-freshness check), then `openspec archive --skip-specs -y <change>`
  validates the change and moves its folder into `changes/archive/`. The
  stock `openspec archive` spec-application path is not used: it guards
  MODIFIED blocks with an unconditional scenario-presence check — sound
  under ambient OpenSpec practice, where a MODIFIED block may be a partial
  patch and a missing scenario name is ambiguous — but this repo's
  full-block authoring makes scenario removals and renames explicit in the
  reviewed word-diff, which that guard would reject.
- **Change trains: one PR may carry several open changes.** Each change
  keeps its own folder — proposal, `design.md`, deltas, tasks — authored in
  its own commit(s), so each capability's decision rationale stays a
  dedicated, citable context in the archive. (A mint change is ADDED-only
  and needs no seed/edit pair, so it is normally a single commit.) The
  train's preconditions are the existing guards: the changes' requirement
  sets must be disjoint (the overlap tripwire), each capability is minted
  by exactly one change, and cross-change references are legal because the
  reference lint overlays **every** open change's deltas. Each change of a
  train archives whenever its implementation completes — in the authoring
  PR if implementation ships there, otherwise in the later PR that
  finishes it (the archive-due gate decides) — always in
  capability-dependency order, each archive its own commit: `pnpm
  spec:fold <change>`, the tasks under its `## Archive` section, then
  `openspec archive --skip-specs -y <change>`.
- **Concurrency is guarded, not assumed away.** The archive machinery
  replaces MODIFIED blocks by header match with no three-way merge, so a
  delta authored against a stale base can silently clobber an interleaved
  edit. The reference lint fails when two open changes touch the same
  requirement, and `pnpm spec:freshness` verifies each open change's
  seeded blocks still match `specs/`. Because open changes may outlive
  their authoring PR, `specs/` can advance under any of them whenever
  another change archives — and rebasing a PR onto an advanced main is the
  same event. The freshness check runs continuously in CI and as
  `spec:fold`'s hard precondition; on staleness, re-seed (rewrite the
  seed/edit pair against the new base) and have the word-diff
  re-reviewed. (Replit environment: the
  scripted-rebase tooling in `replit.md` → "Scripted history rewriting"
  performs these rewrites non-interactively.)

Design-time work ends with
**constraint-mining** (see `config.yaml` design rules): any decision whose
quality depends on a future invariant mints that invariant as a requirement
in the same change. Decision provenance lives in `changes/archive/` — there
is no separate review-item system; the numeric-era `MM-REVIEW-NNN` items are
archived with the legacy corpus and mapped in `legacy-spec-archive/maps/`.

A change may carry design.md + tasks with no spec deltas when its purpose is
to give design rationale a citable archive home (e.g. formalizing decisions
made while implementing from a legacy Design section).

> CI note: pushes from the Replit GitHub connection cannot touch
> `.github/workflows/` (missing `workflow` OAuth scope — see
> `docs/external-setup.md`). Wire `pnpm spec:check` into CI from an
> environment that has that scope.
