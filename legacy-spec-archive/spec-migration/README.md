> **ARCHIVED (2026-07-24).** The migration completed: every legacy
> identifier is tombstoned in `../maps/identifier-map.json`, and the
> sixteen carved capabilities live as open changes under
> `openspec/changes/` until implemented and archived. Everything below is
> preserved as the migration's planning record and is no longer
> operative.

# Spec Migration Staging

Planning artifacts for the OpenSpec migration under **capability-at-a-time
carving**: the target capability set is carved by **user-story locality**
(each capability owns a workflow a user experiences as one thing), not by
the runtime or artifact that implements it. Cross-cutting rules that no
user story owns live in the `global-invariants` capability. The adoption
rationale is recorded in the `mint-global-invariants` change's `design.md`;
the strategy history is in [`../openspec-migration.md`](../openspec-migration.md).

Nothing in this folder is binding. Binding sources are exactly:

- `openspec/specs/` for migrated requirements, and
- `legacy-spec-archive/spec/` for everything else — **per identifier**: a
  legacy id is retired the moment it gains an entry in
  `legacy-spec-archive/maps/identifier-map.json`; until then it stays
  binding and citable, even when other ids of the same module have already
  migrated.

## Contents

- [`capability-map.md`](capability-map.md) — the prospective user-story
  capability set. Draft until a capability's migration change mints it;
  each mint is still a carving decision made with the author.
- [`assignment-matrix.md`](assignment-matrix.md) — the Phase B draft
  partition for the final migration train: a per-id assignment of every
  undisposed legacy id to its prospective capability (or
  global-invariants / code-mechanism / drop), with dedupe clusters,
  resolved contradictions, and the open carving questions.
- `map-staging/` — per-change staged identifier-map retirements for the
  final migration train (one JSON per change plus the closing-sweep
  tombstones). Non-binding until each change archives, when its entries
  merge into `legacy-spec-archive/maps/identifier-map.json` with dated
  `change` attribution; the folder is deleted when the train completes.
- `module-<NN>-parked.md` — per-module **parked ledgers**. A parked
  requirement stays binding in its legacy module file while it waits for
  its prospective capability; the ledger records the wait and preserves any
  requirement text already drafted for it, so the drafting work is not lost.

## Parked-ledger contract (machine-read)

`scripts/spec-migration/audit-module.mjs` reads the module's parked ledger:
a module-NN requirement id **in backticks** in that file marks the id as
parked, which satisfies the audit's disposition check without an
identifier-map entry. Consequently, in a parked ledger, backticks around a
module-NN requirement id are reserved for exactly that meaning — write
incidental mentions of other ids in plain text.

## Graduation path

A parked requirement graduates when a migration change mints (or extends)
its prospective capability: the change authors the requirement at intent
grain (the parked draft is source material, the legacy text is the binding
source), the identifier map gains the id's entry (retiring it), and the
ledger entry is removed in the same change. A module's cutover row flips to
Migrated when its last id is disposed — mapped, not parked.
