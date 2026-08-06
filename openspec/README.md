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
  capability's `spec.md`, a mint delta's preamble, or a `## MODIFIED
  Purpose` amendment) declares its dependencies in a `Depends on:`
  sentence; a capability's spec may reference only itself and those
  declared dependencies, and the declared graph must stay acyclic.
- **A `global-invariants` change gets its own change folder, and archives in
  the PR that opens it.** Never carry a gi requirement inside a change that
  has an implementation phase. gi prescribes nothing to build itself, so its
  change has nothing to wait on, and enforcement is each dependent's
  obligation verified at *that* dependent's archive — never a precondition of
  archiving gi. The reason is not tidiness: **an unfolded invariant binds only
  the change carrying it.** It never reaches `specs/`, so it constrains none
  of the other open changes and nothing that opens while it waits, however
  emphatically its prose says it binds everything. `extend-global-invariants`,
  `adopt-federated-trust-invariants` and
  `adopt-mirror-and-generation-invariants` are the shape to copy.
- **Ask what a placement obliges, not which change may carry it.** *Which open
  change is allowed to hold this?* has a crisp answer from the rules — one
  change per Purpose, that one already amends the capability, the slot is
  taken — and it is the easier question, so it is the one you will drift into.
  *What does holding this oblige?* is the one that decides correctly. A
  permission test will confirm a placement a purpose test rejects. Whenever a
  placement argument's weight rests on what is **permitted**, re-derive it
  from what the requirement is **for**.
- **`global-invariants` is a meta layer; depend on it where your soundness
  rests on it.** gi constrains how concrete capabilities may be shaped, so
  the direction is always concrete → gi, never gi → a user-story capability
  (`game-engine` is the one thing gi may depend on: root domain vocabulary,
  not a story). **Declare a dependency on a gi requirement when this
  requirement's soundness depends on it remaining true.** The dependency
  graph is a *soundness* record, not a conformance checklist — conformance
  is universal and implicit (every capability is bound by every invariant
  whether or not it declares one, so the absence of a gi dependency never
  means "unconstrained"), while a declared dependency says *relax this
  invariant and my requirement stops making sense*. That is what makes the
  blast radius of relaxing a gi requirement traceable through its
  dependents, and because gi sits deep in the dependency tree carrying the
  corpus's most load-bearing constraints, depending on it **frequently** for
  that purpose is correct — a rule many requirements depend on should be
  hard to change. Corollary: when a change mints an invariant *because* its
  local solution needs that invariant to stay robust, the local requirement
  declares it. What does *not* warrant a declared dependency: a requirement
  that merely restates or specialises a gi rule without depending on it
  (that's the DRY problem below), a defensive note that gi permits
  something, or a pointer filling a gap the requirement should have
  specified itself.
- **Declarations are cross-capability only.** A requirement never declares a
  dependency on a requirement in its **own** capability. The requirements
  inside a capability are one integrated cohort: changing any of them is
  reviewed against all of them, which is a tractable local analysis and needs
  no per-requirement graph to prompt it. An intra-capability edge therefore
  buys no information, and it costs — a requirement-grain cycle can only arise
  inside a capability, so forbidding the edges is exactly what makes the
  capability-grain cycle check *sufficient* rather than merely convenient. A
  dependency on another capability's requirement additionally obliges the
  owning capability to declare that capability in its Purpose, so every
  declared edge is visible at both grains. Lint-enforced.
- **Declared dependencies are an affordance, not a fixed budget.** A
  capability's `Depends on:` list is extended whenever a dependency is
  genuinely warranted — via `## MODIFIED Purpose` for an existing
  capability. It is never a permanent budget that forces a capability to
  restate a rule it cannot reach.
- **A capability does not own a section of code, and may impose
  requirements on surfaces another capability builds.** Where the carving
  lines up with the code that is a convenience, not the contract. A
  downstream capability may require that a fact *it* understands appears in
  a UI context another capability is primarily responsible for — a forfeit
  reported as a forfeit on a leaderboard, a tournament's standing shown in
  a room — and the natural implementation order follows: the owning
  capability builds the context first, and the imposing capability's
  implementation lands as a diff to it, citing the requirement that
  demanded it. **The owning capability must not restate the obligation**;
  duplicating it is the DRY failure above, and it puts the rule where the
  capability that knows what a forfeit *is* cannot state it. Declare the
  dependency in the imposing direction (it depends on that surface
  existing) and keep the requirement's prose naming the concept.
- **"There is only one of these" belongs in `global-invariants`, not in the
  capability that provides the one.** A rule forbidding a second
  implementation of a shared thing is a negative constraint on what must not
  be done *anywhere* — it binds every potential duplicator and no single
  capability owns it, so both of gi's first two admission prongs hold, and
  the providing capability is the one place the rule is not about. The
  provider states what the thing is and how it behaves; gi states that
  there is exactly one of it. `one-shared-engine` and
  `one-shared-generation` sit together for that reason, not because the
  second was modelled on the first.
- **Don't restate what another requirement implies.** A constraint gi or a
  peer already cleanly implies must not be repeated in a second requirement:
  duplicates drift into conflict and the copy carries no authority. Depend
  on the owner where soundness depends on it, and pin the *integration* of
  the local requirement with the constraints bearing on it in `design.md` —
  which is equally a home for gi citations, since design and implementation
  are as subject to the invariants as the spec is. A decision motivated by
  an invariant (which runtime holds a record, why an absolute is safe)
  belongs there rather than over-pinning the requirement.
- A capability's Purpose is amended **only** through a `## MODIFIED
  Purpose` delta section — the sole way `Depends on:` can ever change, so
  gaining a dependency is a reviewed edit rather than an edit to `specs/`
  behind the change machinery's back. It is full-block and seeded like a
  MODIFIED requirement, and two open changes may not amend one
  capability's Purpose (fold replaces it wholesale, with no merge). A
  `## Purpose` **preamble** is the different thing: it *mints* a
  capability that has no `spec.md` yet.
- `pnpm spec:check` validates structure (strict OpenSpec validation of
  `specs/` and of every open change), every reference, the capability
  dependency graph, and each requirement's structural dependencies
  (`scripts/check-spec-citations.mjs`), the rendered graph's freshness
  (`scripts/spec-graph.mjs --check`), open changes'
  seed freshness (`scripts/check-change-freshness.mjs`), and the
  identifier map's completeness against the legacy corpus
  (`scripts/audit-all-modules.mjs`, `pnpm spec:audit`).
- **An open change's `tasks.md` is linted like code.** A task plan cites the
  requirements each task discharges, so its identifiers must resolve against
  `specs/` overlaid with the open changes. Without that, a plan rots
  silently: editing a delta to rename or drop a requirement leaves the
  change's own plan pointing at nothing, and nothing else reads `tasks.md`.
  The no-identifiers-in-prose rule deliberately does **not** apply — a task
  names its identifiers inline, which is the convention, not a violation of
  it. Archived changes are exempt: their plans record what was true when the
  change shipped, and the corpus moves on beneath them by design.

## The legacy corpus and the identifier map

The migration's planning corpus — capability map, assignment matrix, parked
ledger, staged retirements — is **still live** under
[`docs/spec-migration/`](../docs/spec-migration/README.md) while the migration
PR is open. Moving it to `legacy-spec-archive/spec-migration/` is the
migration's closing act and belongs in that PR's final commits, not earlier:
archiving it while changes are still being authored against it only signals
that it is off-limits when it is not.

The pre-OpenSpec corpus is quarantined in
[`legacy-spec-archive/`](../legacy-spec-archive/README.md) and is **fully
historical** (corpus retired 2026-07-24): every numeric `MM-REQ-NNN`
requirement and `MM-REVIEW-NNN` review item is tombstoned in
[`legacy-spec-archive/maps/identifier-map.json`](../legacy-spec-archive/maps/identifier-map.json)
— the sole bridge between the eras. Citing a numeric identifier anywhere in
code or specs is a lint error.

Every entry states **what became of the id** (`disposition`) and **where its
substance now lives** (`carriedBy`, one element per home, each naming the
`target` requirement and the `change` that authored it by stable dateless
name; a `part` says which portion it carries when the id split). A legacy id
mapping to several homes is ordinary, not exceptional — re-authoring at
intent grain routinely splits one numeric requirement across capabilities.
The disposition constrains the array, so absence can never mean "nobody
looked":

| `disposition` | meaning | `carriedBy` |
|---|---|---|
| `authored` | substance is one or more capability requirements | ≥ 1 home, every home has a resolving `target` |
| `mechanism` | deliberately not a requirement — it lives in code | any number of homes; `reason` mandatory |
| `dropped` | carried nowhere at all | **empty**; `reason` mandatory, naming the legacy review item that decided it |

Nothing carries a `dropped` id: if its intent survives anywhere, it is
`mechanism`. Review entries carry `carriedBy` for attribution but no
disposition — a review item's substance is by construction folded into the
scenarios it lists. The rules live in
[`scripts/identifier-map.mjs`](../scripts/identifier-map.mjs) (validated by
`pnpm spec:citations`); **completeness** — every id in the corpus has an
entry — is `pnpm spec:audit`.

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
[`docs/spec-migration/`](../docs/spec-migration/).
The capability dependency graph's live home is the `Depends on:`
declaration in each capability's Purpose (lint-derived and acyclic;
`spec:fold` enforces dependency-ordered archiving);
[`capability-graph.md`](capability-graph.md) is that graph rendered, and it is
a view — never a second place to edit. **Any commit that changes a `Depends
on:` declaration, at either grain, regenerates it**: run `pnpm spec:graph` and
include the result. `pnpm spec:check` re-derives the file and fails while it
is stale, naming the command, so the regeneration is enforced rather than
remembered.

## Workflow

Spec-affecting work flows through OpenSpec changes: `/opsx:explore` →
`/opsx:propose` → **author review of the change artifacts** (Open Questions
resolved, deltas approved) → `/opsx:apply` — implementation lands alongside
the still-open change folder (in the authoring PR when spec and code ship
together, otherwise in a later PR) → `openspec archive` at the tail of the
PR that completes the implementation (the archive-due gate enforces this)
→ merge. Five conventions bind agents:

- **A plan's task numbers are a contiguous sequence, not labels.** Sections
  run 1..K in order, each task's major number is its section's, a section's
  minors run 1..J in order, and the final `## Archive` section is unnumbered
  in its heading and continues the sequence. Deleting a task means
  renumbering what follows and sweeping any prose that named it — a gap is
  the fingerprint of a task removed without anyone checking whether its
  substance was rehomed, and a repeat is two tasks answering to one number.
  Both had gone undetected here. Emptying a section deliberately is fine:
  keep the heading and say where the work went. Lint-enforced.
- **Two-commit delta authoring.** A delta that modifies existing
  requirements is introduced across exactly two commits: the first seeds
  the delta file with the affected requirement blocks copied verbatim from
  `specs/`; the second applies the edits. The second commit's diff is then
  a native word-level review diff of exactly what the change does to the
  requirements. This is an AI responsibility — and if the deltas are
  revised after review, the AI rewrites history to keep the seed/edit pair
  intact rather than stacking correction commits. (Agent shells have no
  TTY for an interactive rebase — use the scripted-rebase tooling, see
  `AGENTS.md` → "Scripted history rewriting".)
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
  *already exists* fails, because a preamble means "mint": use a `##
  MODIFIED Purpose` section to amend the Purpose of a capability that is
  already there. Minting a
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
  re-reviewed. (The scripted-rebase tooling in `AGENTS.md` → "Scripted
  history rewriting" performs these rewrites non-interactively.)

**One thing that advances `specs/` without a fold: a grammar migration.** A
change to the *grammar* requirements are written in — the structural
dependency declaration was one — is not a spec change: applied mechanically
to every requirement, it moves no requirement's meaning, so there is nothing
for a reviewer to approve at the requirement level and routing it through a
change folder would bury the real diff (the tooling) under a full-corpus
MODIFIED delta whose word-diff says nothing. It lands as its own commit,
ordered in history **before** any open change's seed commit so no seed/edit
pair straddles the grammar, and it is verified block-by-block: every
requirement header and scenario slug identical before and after, every
requirement's set of referenced identifiers identical, and prose changed only
where the grammar forced a rewording. The commit message states that
verification. Anything that changes what a requirement *says* is a change
folder, always.

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
