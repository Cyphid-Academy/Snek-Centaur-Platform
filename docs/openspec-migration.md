# Adopting OpenSpec for the Snek Centaur Platform Spec

**Status**: Adopted decision record — the evaluation that selected OpenSpec
and the design the adoption follows. The operative conventions live in
`openspec/README.md` and `openspec/config.yaml` once the tooling lands;
each module migration records its own decisions and rationale as an
OpenSpec change folder, archived when it ships.
**Date**: 2026-07-11 (revised 2026-07-18; migration plan revised
2026-07-23 — §4.5/§6: capability-at-a-time carving by user-story locality,
per-identifier bindingness, adopted during the module-02 migration and
recorded in the `mint-global-invariants` change)
**Scope**: Evaluates OpenSpec (`@fission-ai/openspec` v1.6.0) as the home of
the `spec/` corpus and the change-management workflow for it, and records
the adopted migration design.

Everything below labelled *(verified)* was confirmed hands-on against
OpenSpec 1.6.0 — in a sandbox during the evaluation, or by reading the
installed CLI's implementation where noted.

---

## 1. Executive Summary

**Decision: adopt OpenSpec strictly — no structural extensions — and
migrate the corpus one module per PR, re-authoring each module at intent
grain under named identifiers rather than converting it mechanically.**

The timing is close to ideal: the spec-authoring project that
`SPEC-INSTRUCTIONS.md` governs is *finished* (all eight modules Phase-2
complete, zero open REVIEW items), and the repo has entered its
implementation era. From here on, every spec edit is by definition a
*change to settled truth* — which is exactly the shape OpenSpec is built
around (`openspec/specs/` = current truth, `openspec/changes/` = proposed
deltas, archive = merge). Our current process has no first-class artifact
for "a change in flight"; OpenSpec's entire design is that artifact.

The adopted shape, in one paragraph: the pre-OpenSpec corpus is quarantined
wholesale into a frozen `legacy-spec-archive/` that stays **binding
per-module until that module migrates**. Migration re-authors each module's
substance as one or more OpenSpec capabilities at intent grain — one
behaviour per requirement, edge cases carried by named scenarios — under
code-symbol-style identifiers (`capability/requirement#scenario`) that
replace the numeric `MM-REQ-NNN` scheme. A single machine-readable
identifier map is the only bridge between the eras, and a reference lint
makes every identifier — in code, specs, and the map — mechanically
checkable. The legacy Design and Exported Interfaces sections are *not*
carried into capabilities: knowledge lives in exactly four layers
(spec = WHAT, code = HOW, archived change design docs = WHY, config
context = global facts), with constraint-mining turning load-bearing design
invariants into requirements.

Key risks to accept knowingly: OpenSpec is effectively single-maintainer
despite ~60k stars; its v1.x workflow landed in January 2026 after a
breaking overhaul, and two subsystems (custom schemas, stores) are
explicitly experimental; its soft gates mean spec/code drift prevention
remains a discipline problem; and its archive machinery does not detect a
delta authored against a stale base (§3.2.5 — we add our own tripwires).
Mitigations are in §7.

---

## 2. What OpenSpec Is (v1.6, verified)

OpenSpec is an MIT-licensed CLI plus agent-prompt scaffolding for
spec-driven development. It is stack-neutral, has no runtime service and no
API key, and works entirely by convention over markdown files in the repo.
`openspec init --tools claude` installs six Claude Code skills and
`/opsx:*` slash commands (*verified*: `explore`, `propose`, `apply`,
`sync`, `archive`, `update`).

### 2.1 The two-tier model

```
openspec/
├── config.yaml                     # schema selection, project context, per-artifact rules
├── specs/<capability>/spec.md      # CURRENT TRUTH — one folder per capability
└── changes/
    ├── <change-name>/              # a change in flight
    │   ├── proposal.md             # why + what changes + capabilities affected
    │   ├── design.md               # decision rationale for this change
    │   ├── specs/<capability>/spec.md   # DELTAS against current truth
    │   └── tasks.md                # implementation checklist
    └── archive/2026-07-11-<name>/  # completed changes, date-prefixed
```

A change flows: `/opsx:explore` (think) → `/opsx:propose` (create proposal,
delta specs, design, tasks) → `/opsx:apply` (implement tasks) →
`openspec archive` (mechanically merge the deltas into `openspec/specs/`
and move the change folder to the archive). Artifacts are created
incrementally in dependency order (proposal → specs+design → tasks), each
driven by `openspec instructions <artifact> --json`, which emits the
template, rules, and project context for the agent (*verified*).

### 2.2 The spec grammar

Main specs must contain `## Purpose` and `## Requirements`. Inside
Requirements:

```markdown
### Requirement: <name>
The system SHALL ... (RFC-2119: SHALL/MUST required — verified enforced)

#### Scenario: <name>
- **WHEN** ...
- **THEN** ...
```

Validation (*verified* against 1.6.0):

- Every requirement must contain SHALL or MUST — a scenario-less or
  normative-keyword-less requirement **fails** validation.
- Every requirement must have ≥ 1 `#### Scenario:` (exactly four hashes;
  three fails silently at parse level).
- `### Requirement:` headers **outside** `## Requirements` are an error
  ("invisible to validate, list, and archive").
- `--strict` promotes warnings (e.g. "Purpose < 50 chars") to failures.

Delta specs in a change use `## ADDED | MODIFIED | REMOVED | RENAMED
Requirements` sections. MODIFIED must carry the **full replacement text**
of the requirement and its header must exactly match the existing one — the
header text *is* the matching key. On archive, ADDED appends, MODIFIED
replaces in place, REMOVED deletes (*verified*).

### 2.3 Customization surface

- `config.yaml` supports a free-text `context` block injected into every
  artifact's instructions, and per-artifact `rules` lists (*verified*).
- `openspec schema fork` copies the workflow definition for project-local
  customization (*verified*), but schema commands are marked
  **experimental**.
- `store`/`workset` subcommands handle multi-repo planning — explicitly
  "very early beta."

---

## 3. Reputation, Weak Areas, and Community Guidance

Summarised from a July 2026 research pass across the OpenSpec repo/docs,
npm registry, hands-on third-party reviews, and comparison literature.
Sources at the end of this section.

### 3.1 Standing

- ~60k GitHub stars, ~27 commits/month, v1.6.0 published 2026-07-10; one of
  the three poles of the spec-driven-development conversation alongside
  GitHub Spec Kit (~80–90k stars, greenfield/constitution-model) and
  BMAD-METHOD (~37–43k, role-structured enterprise).
- Consensus positioning across every comparison found: **OpenSpec is the
  brownfield tool** — the delta workflow (forced ADDED/MODIFIED/REMOVED
  categorization) is its signature advantage, and it is the lightest of the
  three (~250 lines of artifacts per change vs ~800 for rivals; no
  lock-in).
- A hands-on three-way bake-off on a real feature scored it highest overall
  (4.0/5): best out-of-box experience, cheapest planning cost.
  `/opsx:explore` is repeatedly singled out as the killer feature.
- **Governance caveat**: effectively a single primary maintainer
  (Tab / @0xTab); an unanswered GitHub Discussion asks who is steering the
  project. The v1.0 release (Jan 2026) was a breaking overhaul of the 0.x
  workflow. Expect further churn in the beta subsystems.

### 3.2 Known weak areas (with our exposure noted)

1. **Spec drift is the dominant complaint.** `/opsx:sync` and
   `/opsx:verify` are advisory; `archive --no-validate` bypasses
   everything; nothing forces code and spec to reconcile. *Our exposure is
   lower than typical*: this repo already treats the spec as binding,
   already cites requirements from code, and already reviews spec deltas
   with the code. The citation convention becomes mechanically checkable
   after migration (§5.3).
2. **No behavioral quality gate.** `openspec validate` is structural only.
   A documented public failure: an app whose tasks were all "complete"
   while its E2E tests were silently skipped. Mitigation is CI + our verify
   culture, not OpenSpec.
3. **Scale/discovery limits.** Flat `specs/<capability>/` reportedly
   "becomes unmanageable at 50+ specs"; agents skip checking existing specs
   or load whole files. The corpus will migrate into a small number of
   deliberately-carved capabilities (§4.5) — far below that line — and
   intent-grain re-authoring shrinks each file well under today's module
   sizes.
4. **Delta-format fragility.** MODIFIED matches on exact header text; a
   mismatched header or wrong delta type silently duplicates or strands
   requirements. Mitigation: requirement headers are treated as **frozen
   API** — kebab-case named identifiers, renamed only via RENAMED deltas
   with a same-commit reference sweep, with a lint that fails on any
   dangling reference.
5. **Concurrent changes are NOT reconciled by the tooling.** Two in-flight
   changes live in separate folders, and `specs/` is only written at
   archive — so git usually sees *no conflict at all*. What the archive
   machinery actually does (*verified* by reading the CLI's
   `specs-apply` implementation): MODIFIED matches the requirement by
   header text only and **replaces the whole block — no three-way merge,
   no record of the base the delta was authored against**. If the
   requirement was removed or renamed in the meantime, or the current spec
   has a scenario name the incoming block lacks, archive fails loudly; but
   an interleaved edit to the requirement *body*, or to a scenario's
   content under an unchanged name, is **silently clobbered — last archive
   wins**. The intended remedy is process ("refresh the change spec before
   archiving", says its own error message). We add two mechanical tripwires
   of our own: a lint error when two open changes modify the same
   requirement, and a seed-freshness check that verifies an open change's
   deltas were authored against the current `specs/` state (§5.4).
6. **Overhead on small tasks.** Community consensus: don't route bug fixes
   and trivial changes through a change folder. Threshold: *does any
   requirement change?*
7. **Proposal quality is unreviewed by default.** No gate between propose
   and apply. Our human-approval culture is ported into `config.yaml`
   rules: the author reviews change artifacts before implementation.

### 3.3 The community's brownfield advice — and why we partially deviate

Official guidance for existing projects explicitly rejects bulk
backfilling: *"You do not document your whole codebase to start"*; treat
existing docs as "source material," because one-time bulk conversions
"typically produce stale, untrusted specs."

That advice targets the typical brownfield case: informal, half-trusted
docs describing an old codebase. **Our situation is the inverse.** The
`spec/` corpus is not stale documentation to be reverse-engineered — it is
the formally authored, human-approved, *binding* source of truth, written
before the code, already cited from the code. It still must not be
converted mechanically: the corpus's fine-grained one-assertion-per-ID
style is the wrong grain for a spec a human vets by reading (§4.1). So the
migration is a **re-authoring of a living contract** — module by module,
against the archived module as binding source, with a disposition audit
proving nothing was dropped and the author reviewing every capability.

Other community recommendations adopted directly: always `/opsx:explore`
before `/opsx:propose`; one intent per change; ship spec deltas and code in
the same PR; put stack/conventions in `config.yaml` `context` and
per-artifact `rules`; run validation in CI; commit the whole `openspec/`
tree.

Key sources: OpenSpec repo + docs (`writing-specs.md`,
`existing-projects.md`, `migration-guide.md`, `team-workflow.md`,
`customization.md`); codemyspec.com/blog/openspec-explained;
ranthebuilder.cloud (three-tool bake-off); improveandrepeat.com (failure
case study); danclarke.com/openspec; dev.to & reenbit.com & specs.md
comparisons; Fission-AI/OpenSpec issues #901, #662, discussion #176; the
Reflection-SDD pattern (dataleadsfuture.com).

---

## 4. Adopted Design

### 4.1 Intent grain

One behaviour per requirement, stated in 1–3 plain sentences an author can
vet at a read. Edge-case semantics are carried by named scenarios — each
one a case someone would be upset to see broken, never a restatement of the
body. A capability's Requirements section should be readable end-to-end in
one sitting: the spec is a **vetted compression** of intent, not an
unvetted decompression into hundreds of micro-assertions. This deliberately
re-grains the numeric-era corpus (~640 fine-grained requirements) rather
than converting it 1:1 — the fine grain served authoring-time
traceability, but it defeats the spec's purpose as an artifact a human can
actually hold to account.

### 4.2 Named identifiers, treated like code identifiers

`<capability>/<requirement-slug>` with `#<scenario-slug>` sub-anchors;
definition headers carry the full path (`### Requirement:
game-rules/team-potion-effects`), and code cites specs as
`// spec: <capability>/<slug>[#<scenario>]`. Identifiers are **frozen
API**: renames only via RENAMED deltas with a same-commit sweep of every
reference. The numeric `MM-REQ-NNN` scheme is retired at each module's
migration; retired identifiers are never re-minted.

### 4.3 Strict OpenSpec layers — no capability-level design documents

Knowledge lives in exactly four places: `specs/<capability>/spec.md`
(WHAT), the code (the canonical current HOW, including canonical types),
each change's `design.md` frozen in `changes/archive/` (the permanent WHY),
and the config context block (small always-relevant facts). The legacy
Design and Exported Interfaces sections do **not** migrate into
capabilities. **Constraint-mining** replaces the durable design layer: if a
design choice's quality depends on an invariant future implementers could
silently violate, that invariant is minted as a requirement in the same
change. Performance-motivated choices stay plastic, protected by doc
comments on the interfaces they concern
(`// design: <archived-change-folder>`).

### 4.4 Frozen legacy quarantine, single identifier map

The entire pre-OpenSpec corpus (modules, review logs, informal spec,
authoring instructions) moves to `legacy-spec-archive/` in a pure-move
commit and is **frozen forever** — binding per-module until that module
migrates, then historical. The sole file ever modified after setup is
`maps/identifier-map.json`: legacy id → named home with scenario anchors,
review item → the scenarios encoding its edge cases. Its requirement keys
are the tombstone registry. **Spec purity**: capability specs never
reference the legacy archive, numeric identifiers, or implementation
locations — the map is the only bridge to the past, and code cites specs,
never the reverse. Purity is lint-enforced.

### 4.5 Capability carving is a decision, not a mapping — by user story

*(Revised 2026-07-23.)* Modules do **not** map 1:1 to capabilities. Module
boundaries were chosen to sequence chunks of authoring and implementation
work; capabilities are semantic feature delineations. The module-02
migration sharpened this into a grain rule: capabilities are carved by
**user-story locality** — each owns a workflow a user experiences as one
thing — because a corpus survey showed system-carved modules sawing single
stories along runtime seams (game end, replay, authorization, snake
selection each split across two or three modules) and bundling unrelated
stories by shared substrate. Cross-cutting rules no user story owns live
in the `global-invariants` capability, gated by the admission test in its
Purpose (constrains ≥2 capabilities/runtimes; no user-story owner;
falsifiable).

Each capability's migration still *begins* with a human+AI carving
decision, recorded in that migration's change proposal; the prospective
capability set is maintained as a draft in
`docs/spec-migration/capability-map.md`. Since user-story capabilities
draw from several modules, bindingness is tracked per *identifier* (a
legacy id retires when it gains an identifier-map entry), letting modules
migrate partially: unretired ids either wait untouched or are *parked* —
recorded with a prospective capability in
`docs/spec-migration/module-NN-parked.md`, machine-checked by the
migration audit so nothing is silently dropped.

---

## 5. Adopted Workflow

### 5.1 Change lifecycle

`/opsx:explore` → `/opsx:propose` → **author review of the change
artifacts** (Open Questions resolved, deltas approved) → `/opsx:apply` —
implementation lands in the same PR as the open change folder → **archive
as the PR's final commit**, executed only on the author's explicit
instruction → merge. Archiving folds the deltas into `specs/` and is the
only way `specs/` ever advances; an AI agent should say when everything in
the PR looks resolved and ready to archive, but never runs
`openspec archive` unprompted.

### 5.2 Two-commit delta authoring (AI responsibility)

A delta that modifies existing requirements is introduced across exactly
two commits: the first seeds the delta file with the affected requirement
blocks copied verbatim from `specs/`; the second applies the edits — so the
second commit's diff is a native word-level review diff of exactly what the
change does. If deltas are revised after review, history is rewritten to
keep the seed/edit pair intact rather than stacking correction commits.

### 5.3 Reference lint and migration audit

A repo lint (`pnpm spec:check`) validates every named identifier in code,
specs, delta files, and the identifier map — resolving against `specs/`
**overlaid with open changes' deltas**, since `specs/` states pre-change
truth until archive while code implementing the change already cites the
new identifiers. It also enforces spec purity, tombstones, review-reference
policy, and `design:` references. A per-module migration audit script
verifies disposition completeness: every archived identifier mapped, every
anchor resolving, no stale code references.

### 5.4 Concurrency: overlap tripwire and seed freshness

Because the tooling cannot detect a stale delta (§3.2.5), two mechanical
guards close the gap. The lint fails when **two open changes carry deltas
for the same requirement** (conflict-in-flight). And a **seed-freshness
check** exploits the two-commit policy: the seed commit is a durable record
of the base a change was authored against, so the check compares each open
change's seeded requirement blocks with the current `specs/` state and
fails if they diverge. With archive standardised as the PR's final commit,
the main event that can invalidate a seed is **rebasing the PR onto an
advanced main** — run the freshness check after every rebase; if it fails,
re-seed (rewrite the seed/edit pair against the new base) and re-review the
word-diff.

---

## 6. Migration Plan

*(Revised 2026-07-23 — steps 3+ replanned around capability-at-a-time
carving; steps 1–2 record what already happened.)* Principle: short
campaign, one capability per PR, the archived corpus stays binding per
identifier until each id's cutover, no long split-brain.

1. **Land the tooling first** (no spec content moves): OpenSpec init +
   skills, `config.yaml` conventions, the quarantine move, the reference
   lint and freshness check, README cutover table with every module
   Pending. *(Done.)*
2. **Pilot: module 01 (game-rules).** Largest requirement count, best test
   coverage to validate scenarios against, zero dependencies. Carving
   decision: module 01 becomes the single `game-rules` capability — it is
   already a coherent semantic unit (the complete rules of the game,
   independent of storage, networking, and UI). *(Done; later renamed
   `game-engine`.)*
3. **Module 02 partial-migrates as the pivot** (`mint-global-invariants`):
   its cross-cutting invariants become the `global-invariants` capability;
   its application-level requirements are parked with prospective
   user-story homes; per-identifier bindingness and the parked-ledger
   audit land with it.
4. **Remaining migration proceeds capability-at-a-time** from the
   prospective map (`docs/spec-migration/capability-map.md`), one
   capability per PR, ordered by the capability dependency graph and
   implementation need rather than by module number. Each PR: carving
   decision with the author → re-author at intent grain (parked drafts as
   source material, legacy text binding) → constraint-mine → retire the
   absorbed ids in the identifier map, convert code citations, clear
   ledger entries → update cutover rows (a module flips to Migrated when
   its last id is disposed) → audit + full battery.
5. **Retro as the shape settles**; adjust the recipe in each subsequent
   migration change as needed.

---

## 7. Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Re-authoring silently alters semantics | **High** — the one place migration can corrupt trust | Archived module stays binding until cutover; disposition audit (every legacy id mapped, anchors resolving); module tests pin behaviour independently of prose; author reviews every capability |
| Split-brain during migration | High if prolonged | Per-module bindingness cutover table; short campaign, module per PR |
| OpenSpec project churn / single maintainer | Medium | Everything is markdown in our repo — worst case keep the format, drop the CLI; pin the CLI version; avoid experimental subsystems |
| Delta header mismatch strands/duplicates requirements | Medium | Frozen named headers; RENAMED-only renames with same-commit sweep; lint fails dangling references |
| Stale delta clobbers an interleaved edit at archive | Medium | Archive as the PR's final commit; overlap lint; seed-freshness check after rebases (§5.4) |
| Spec drift once gates are soft | Medium | Reference lint in CI; change-folder discipline; the existing binding-spec culture |
| Carving decisions fragment or duplicate capabilities | Medium | Carving is an explicit human+AI decision per module, recorded in the migration change's proposal |
| Losing decision provenance | Low | Review logs frozen in the archive; review items mapped to encoding scenarios; future rationale in archived change folders |

---

## 8. Bottom Line

OpenSpec's philosophy — durable spec truth, explicit change deltas,
archive-as-provenance, spec bodies free of journey narration — is
strikingly close to what `SPEC-INSTRUCTIONS.md` already built by hand. What
OpenSpec adds is the piece our system never had: a first-class,
tool-supported representation of a *change in flight*, with agent workflows
any Claude Code session picks up for free. What it lacks — hard gates,
behavioral verification, concurrency reconciliation — we compensate for
with the reference lint, the disposition audit, the freshness check, and
the review culture the config rules encode. Adopt it strictly, re-author at
intent grain under named identifiers, quarantine the numeric era behind one
machine-checkable map, and migrate module by module with capability carving
decided by the humans it serves.
