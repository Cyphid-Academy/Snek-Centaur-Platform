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
game-rules/team-potion-effects                      # a requirement
game-rules/team-potion-effects#sacrificial-collection   # one of its scenarios
```

- Definition headers carry the full path: `### Requirement:
  game-rules/team-potion-effects`; scenarios are `#### Scenario: #<slug>`.
- Identifiers are frozen API: renames only via RENAMED deltas with a
  same-commit sweep of all references.
- Code cites `// spec: <capability>/<slug>[#<scenario>]`; archived decision
  rationale is cited `// design: <archived-change-folder>`.
- `pnpm spec:check` validates structure (strict OpenSpec validation),
  every reference (`scripts/check-spec-citations.mjs`), and open changes'
  seed freshness (`scripts/check-change-freshness.mjs`).

## Migration cutover table

The pre-OpenSpec corpus is quarantined in
[`legacy-spec-archive/`](../legacy-spec-archive/README.md). **Bindingness is
per-module**: until a module's row says Migrated, its archived file is the
binding spec (and its numeric `MM-REQ-NNN` identifiers remain citable).

| Module | Capability carving | Status | Binding source |
|--------|--------------------|--------|----------------|
| 01-game-rules | `specs/game-rules/` (single capability, author decision) | **Migrated** | `openspec/specs/game-rules/spec.md` |
| 02-platform-architecture | *decided at migration* | Pending | `legacy-spec-archive/spec/02-platform-architecture.md` |
| 03-auth-and-identity | *decided at migration* | Pending | `legacy-spec-archive/spec/03-auth-and-identity.md` |
| 04-stdb-engine | *decided at migration* | Pending | `legacy-spec-archive/spec/04-stdb-engine.md` |
| 05-convex-platform | *decided at migration* | Pending | `legacy-spec-archive/spec/05-convex-platform.md` |
| 06-centaur-state | *decided at migration* | Pending | `legacy-spec-archive/spec/06-centaur-state.md` |
| 07-bot-framework | *decided at migration* | Pending | `legacy-spec-archive/spec/07-bot-framework.md` |
| 08-centaur-server-app | *decided at migration* | Pending | `legacy-spec-archive/spec/08-centaur-server-app.md` |

(Module 09 was absorbed into module 08 pre-migration; its archived file is a
redirect stub.)

Modules do **not** map 1:1 to capabilities: module boundaries were chosen
to sequence authoring and implementation work, while capabilities are
semantic feature delineations. Each migration therefore *begins* with a
**carving decision made with the human author** — the module may become one
capability, several, and/or contribute deltas to capabilities that already
exist — recorded in the migration change's proposal and filled into the
carving column above. Migrating a module = deciding its carving, then
re-authoring its substance at intent grain under named identifiers,
recorded as a change folder that archives when the migration PR completes;
`node scripts/spec-migration/audit-module.mjs <NN>` audits a migrated
module's disposition (every archived identifier mapped, every anchor
resolving, no stale code references).

## Workflow

Spec-affecting work flows through OpenSpec changes: `/opsx:explore` →
`/opsx:propose` → **author review of the change artifacts** (Open Questions
resolved, deltas approved) → `/opsx:apply` — implementation lands in the
same PR as the still-open change folder → `openspec archive` as the PR's
final commit → merge. Four conventions bind agents:

- **Two-commit delta authoring.** A delta that modifies existing
  requirements is introduced across exactly two commits: the first seeds
  the delta file with the affected requirement blocks copied verbatim from
  `specs/`; the second applies the edits. The second commit's diff is then
  a native word-level review diff of exactly what the change does to the
  requirements. This is an AI responsibility — and if the deltas are
  revised after review, the AI rewrites history to keep the seed/edit pair
  intact rather than stacking correction commits.
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
- **Archiving is the PR's final commit, on a human decision.** Archiving
  folds the deltas into `specs/` (the only way `specs/` ever advances) and
  is the terminal act of a change — standardised as the **last commit of
  the PR**, once review is resolved. An AI agent should say when everything
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
- **Concurrency is guarded, not assumed away.** The archive machinery
  replaces MODIFIED blocks by header match with no three-way merge, so a
  delta authored against a stale base can silently clobber an interleaved
  edit. The reference lint fails when two open changes touch the same
  requirement, and `pnpm spec:freshness` verifies each open change's
  seeded blocks still match `specs/`. With archiving standardised as the
  PR's final commit, the main staleness event is **rebasing the PR onto an
  advanced main** — run `pnpm spec:freshness` after every rebase; if it
  reports staleness, re-seed (rewrite the seed/edit pair against the new
  base) and have the word-diff re-reviewed.

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
