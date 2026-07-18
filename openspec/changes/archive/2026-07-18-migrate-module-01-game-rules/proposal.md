## Why

The numeric-era module 01 was a ~10× formal decompression of the project
author's informal spec: 85 fine-grained single-assertion requirements with
dense, heavily cross-referential bodies, plus Design and Exported
Interfaces sections that re-encoded much of the same substance. Internally
consistent, but too large for the author to realistically read end-to-end —
an **unvetted decompression of precisely communicated intent**, which makes
a binding spec fragile as a guidance artifact: it speaks with the author's
authority without having passed through the author's eyes as a whole.

## What Changes

- Carving decision (made with the author): module 01 forms a **single
  capability, `game-rules`** — its boundaries are already semantic (the
  complete rules of the game, independent of storage, networking, and UI).
  Modules in general do not map 1:1 to capabilities; each migration decides
  its own carving.
- The `game-rules` capability is created at **intent grain**: 24
  requirements (one behaviour each, 1–3 plain sentences) with 64 named
  scenarios carrying the edge-case semantics — a Requirements layer sized
  to be read and vetted in one sitting, converting the spec from an
  unvetted decompression into a vetted compression.
- Requirement identity becomes **named** (`game-rules/<requirement>` with
  `#<scenario>` anchors), treated like code identifiers; all numeric
  module-01 identifiers are retired and tombstoned.
- All engine code citations are rewritten to named identifiers; review-item
  references are replaced by the scenario that encodes each edge case.
- The numeric-era corpus is quarantined in `legacy-spec-archive/` (frozen;
  its sole mutable file is `maps/identifier-map.json`, which this change
  populates for module 01).

## Capabilities

### New: game-rules

Domain model and game behaviour for Team Snek (supersedes
`legacy-spec-archive/spec/01-game-rules.md`).

## Impact

- `openspec/specs/game-rules/spec.md` (new), `packages/engine/**`
  (citations only — no behavioural change; 141 tests unchanged and green),
  `legacy-spec-archive/maps/identifier-map.json`, cutover table, reference
  lint.

## Note on provenance

This change folder was authored at migration time to give the migration's
decisions a citable archive home in the new system's own format — the
change was executed directly (with machine-audited transformations) rather
than through the live `/opsx` flow, which post-dates it.
