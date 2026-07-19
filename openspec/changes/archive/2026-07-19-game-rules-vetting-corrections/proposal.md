## Why

The project author's end-to-end vetting review of the migrated game-rules
capability (PR #8) surfaced defects that predate the migration: rules the
legacy spec stated wrongly or vacuously, one module-01 implementation
choice that leaked into the spec as a requirement, and scenario-writing
faults introduced during migration. The review threads on PR #8 are the
resolution record for each item.

## What Changes

- **Initial food**: `snakesPerTeam` items per starting territory (angular
  sector) — one per snake of the owning team, on distinct eligible cells
  inside its own territory — and never fertile-restricted;
  board-generation failure conditions updated to match.
- **Item identity**: the fixed 256-per-turn id namespace (an implementation
  choice wrongly pinned as spec) is replaced by the natural composite
  identity (spawn turn — the turn boundary at which the item first exists —
  paired with its index in that boundary's spawn order), carried on the
  item itself; any scalar id is computed from the pair, never stored.
- **Fertile ground constrains food only**: potion spawning is never
  fertile-restricted (the engine already behaved this way; the spec text
  wrongly implied otherwise).
- **Vacuous food-on-hazard semantics removed**: spawn eligibility excludes
  hazard cells, so no item ever occupies one; the food-on-hazard scenario,
  the hazard/item-coexistence clause, and the hazard-damage clause of the
  heal-dominance scenario are all unreachable and removed.
- **Sacrificial collection**: the "by a cause other than head-to-head"
  exception is dropped — head-to-head losers can never be collectors
  (withdrawal already specifies this).
- **Game end timing**: the game ends at the end of the triggering turn.
- **Scenario hygiene**: the growth scenario is made self-contained.

## Capabilities

### Modified: game-rules

## Impact

- `openspec/specs/game-rules/spec.md` (at archive); `packages/engine`
  (boardgen initial food, item identity representation, affected tests);
  `legacy-spec-archive/maps/identifier-map.json` (anchor updates).
