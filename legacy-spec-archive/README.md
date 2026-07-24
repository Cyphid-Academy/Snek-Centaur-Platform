# Legacy Spec Archive

The complete pre-OpenSpec specification corpus, quarantined here so it does
not ride along in default agent context, but retrievable on demand — the
same philosophy as OpenSpec's archived change folders. Come here for
**diagnostic archaeology** (tracing a spec inconsistency or mistake to the
decision that produced it) and as **source material** when migrating a
module into `openspec/specs/`.

## spec-migration/ — the migration's planning corpus (archived 2026-07-24)

The capability map, whole-corpus assignment matrix, module-02 parked
ledger, and per-change staged retirements that steered the migration are
preserved under [`spec-migration/`](spec-migration/). They are historical
records: the operative outcome lives entirely in
[`maps/identifier-map.json`](maps/identifier-map.json) and the capability
specs/changes under `openspec/`. As of the corpus retirement every
numeric identifier is tombstoned in the map.

## Bindingness

Migration to OpenSpec proceeds one module at a time (see the cutover table
in [`openspec/README.md`](../openspec/README.md)). **For modules not yet
migrated, the file in `spec/` here remains the binding specification** —
this archive is quarantined, not dead. Once a module's capability is
authored in `openspec/specs/`, the archived module and its numeric
identifiers become historical: the identifiers are tombstoned (the lint
rejects new references to them) and the maps below translate them.

## Contents

| Path | What it is |
|---|---|
| `spec/01…09-*.md` | The nine numeric-era spec modules, in their final form (module 01 as of main `113ddd3`, immediately before migration) |
| `review/*.review.md` | Per-module decision logs — resolved `MM-REVIEW-NNN` items with Context/Question/Options/Decision/Rationale |
| `maps/identifier-map.json` | The single machine-readable identifier map: legacy `MM-REQ-NNN` → named `capability/requirement` with scenario anchors, and review items → the scenarios encoding their edge cases. Schema described in its `$schema` field; every reference in it is validated by `scripts/check-spec-citations.mjs`. Its `provenance` field names the archived change folder recording each migration's rationale |
| `informal-spec/` | The original informal specification the formal corpus was derived from |
| `SPEC-INSTRUCTIONS.md` | The authoring process that produced the corpus (phases, module graph, REVIEW protocol) |
| `AGENTS.md` | The spec-work agent context of the numeric era |

## Conventions of the archived corpus (for readers)

- Requirements: `**MM-REQ-NNN**: …` bold-ID paragraphs; IDs never reused.
- Modules have three sections: Requirements / Design / Exported Interfaces.
- `MM-REVIEW-NNN` items record decision provenance; resolved items live in
  `review/`, and `See resolved MM-REVIEW-NNN` pointers in module bodies
  refer there.
- Cross-module references use `[MM]` / `[MM-REQ-NNN]` bracket form.

**This archive is frozen.** The only file ever modified after setup is
`maps/identifier-map.json`, which grows as modules migrate. Everything
else — including this README — is immutable history.
