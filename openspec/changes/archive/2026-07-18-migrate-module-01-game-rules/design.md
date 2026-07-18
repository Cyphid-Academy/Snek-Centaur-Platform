## Context

First module migrated from the numeric-era corpus
(`legacy-spec-archive/`) into strict OpenSpec. The decisions below were
stress-tested against alternatives during migration and govern how the
remaining modules (02–08) migrate.

## Decisions

### Capability carving: module 01 → the single game-rules capability

Decided with the project author. Modules do not map 1:1 to capabilities —
module boundaries sequenced authoring/implementation work, while
capabilities are semantic feature delineations — so every migration begins
with a carving decision: one new capability, several, and/or deltas to
capabilities that already exist. For module 01 the boundaries coincide:
the complete rules of the game, independent of storage, networking, and
UI, form one coherent semantic unit, so it carves 1:1 into `game-rules`.
Later modules are not expected to be this clean (module 08 in particular
should carve into several capabilities).

### Intent grain

One behaviour per requirement, stated so plainly the author can vet it at
a read; edge-case semantics live in named scenarios (each one a case
someone would be upset to see broken — never a restatement of the
requirement); mechanism lives in code. Rejected alternative: 1:1
conversion of the fine-grained corpus — it preserved fidelity but kept the
spec unreadable, defeating its purpose as an intent artifact.

### Named identifiers

`capability/requirement#scenario`, kebab-case, full path in definition
headers, treated as frozen API (renames only via RENAMED deltas with a
same-commit reference sweep; the lint makes violations loud). Rejected
alternative: stable numeric ids — opaque in references, and sequence
allocation races under parallel authorship (a real collision occurred
during this migration).

### Strict OpenSpec layers — no capability-level design documents

Knowledge lives in exactly four places: spec.md (WHAT), the code (current
HOW), archived change design.md (WHY, frozen), config context (small
global facts). The capability-level design document was considered and
rejected: requirements encode the system's **active constraints**; design
is local choice within the remaining degrees of freedom and must stay
plastic. **Constraint-mining** replaces the durable design layer: if a
design choice's quality depends on an invariant future implementers could
silently violate, that invariant is minted as a requirement in the same
change. Performance-motivated choices stay plastic and are protected by
doc comments on the interfaces they concern, referencing the relevant
archived change (`// design: <folder>`).

### Frozen archive with a single mutable map

The numeric-era corpus is quarantined, binding-until-migrated per module,
and never edited except `maps/identifier-map.json` — the machine-readable
bridge (legacy id → named home + scenario anchors; review item → encoding
scenarios), validated by the reference lint so it cannot rot.

## Migration recipe (modules 02–08)

1. Source: the archived module + informal spec + its decision log. The
   archived file is binding until cutover.
2. Decide the carving WITH the human author (see the carving decision
   above): one new capability, several, and/or deltas to existing
   capabilities — modules are not guaranteed to be isolated with respect
   to a good capability grain. Record the decision in the migration
   change's proposal and the cutover table's carving column.
3. Author each capability at intent grain with named identifiers; every
   legacy assertion's substance must land in a requirement body, a
   scenario, canonical types in code, or (rationale only) stay in the
   archived decision log — dropped content requires explicit sign-off.
4. Constraint-mine the legacy Design/Exported-Interfaces sections: any
   invariant whose violation would break current or planned behaviour
   becomes a requirement/scenario now; constraints on OTHER modules wait
   for those modules' migrations.
5. Extend `maps/identifier-map.json` — its requirement keys are the
   tombstone registry for the module's retired numeric ids; convert code
   citations and review-item references (edge cases become scenarios first
   if not already encoded).
6. Flip the cutover row; add the module to the lint's migrated set; run
   `pnpm spec:check`, `node scripts/spec-migration/audit-module.mjs <NN>`,
   and the full test battery.
7. Record the migration as an archived change folder like this one.

## Risks / Trade-offs

- [Re-authoring can drift semantics] → machine-audited disposition mapping
  plus the module's test suite pinning behaviour independently of prose.
- [Constraint-mining can be skipped under pressure] → mandatory design
  rule in config.yaml; reviewer checklist item.
- [Named identifiers break on rename] → frozen-identifier rule; lint
  fails on any dangling reference.

## Verification (module 01)

Strict OpenSpec validation; reference lint (24 requirements, 64 scenarios,
111 tombstones mapped); 141 engine tests unchanged and green; typecheck
and biome clean.
