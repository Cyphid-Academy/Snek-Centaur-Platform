## Context

Corrections directed by the project author while vetting the migrated
game-rules capability; several correct the legacy corpus itself, so they
are expressed as a change rather than folded silently into the migration.

## Decisions

### Item identity as a composite key, carried as fields

An item is identified by the pair (spawn turn, spawn index): the turn
boundary at which the item first exists — setup items at boundary 0, items
spawned by turn T's resolution at boundary T+1 — and its index within that
boundary's spawn order, from 0. The item model carries the two fields
directly; any scalar item id is COMPUTED from the pair on demand and never
stored, so downstream layers (e.g. the data layer's lifetime record) read
spawn turn and spawn index straight off the model rather than packing and
unpacking a stored composite. Rejected: the migrated `(T+1) × 256 + k`
arithmetic id — a fixed-width namespace with an overflow cliff, an
implementation choice masquerading as a requirement. Also rejected: a
stored composite string id — it re-derives the pair at every consumer and
invites a second, independently-chosen notion of spawn turn. The pair is
collision-free by construction; if a runtime ever needs database-style
scalar ids, that runtime derives them (database concern, not engine).

In the engine this lands as a sealed union over a common supertype: an
item base interface holds the identity pair and cell, food and potion
item interfaces extend it discriminated by item type, and the closed
union is the item type (with never-checked exhaustive switches enforcing
the domain vocabulary's closed-set rule at compile time — the TypeScript
rendering of a sealed hierarchy, kept as plain data because engine state
crosses runtime boundaries as values). Everything that REFERS to an item
does so by the derived scalar id: claims carry item ids and the commit
resolves them against a per-turn snapshot index, so a dangling reference
fails loudly instead of a fabricated item object travelling by value.
Spawn events are birth records carrying the item's full data (identity
pair, cell, potion type); consumption events reference the existing item
by id — downstream lifetime records take their fields from the birth
event and are completed by id, with nothing ever unpacking the scalar.

### Initial food: snakesPerTeam per territory

Every team starts with one food per snake, distributed inside its own
territory — `snakesPerTeam` items per starting territory on distinct
eligible cells — keeping the opening symmetric across teams and local to
each team's sector (author decision on PR #8, superseding both the legacy
one-per-snake global placement and an interim one-per-territory reading).
Initial food ignores fertile designations so the opening is never starved
by fertile-ground configurations. Failure condition follows: a territory
with fewer than `snakesPerTeam` distinct eligible cells after head
placement fails the generation attempt.

### Unreachable states removed rather than specified

Spawn eligibility excludes hazard cells, so item-on-hazard interactions
cannot occur. The spec no longer describes behaviour for unreachable
states (food-on-hazard heal dominance, item/hazard coexistence).

### Property-based tests pin the corrected behaviours

The affected behaviours are pinned by fast-check property suites
(generators + shrinking, via @fast-check/vitest) instead of hand-picked
seed lotteries: constructive generators guarantee the interesting path
(e.g. a potion collection actually occurs) rather than tuning spawn rates
until randomness cooperates. Rejected: raising potion spawn rates beyond
the surface-enforced ranges to force effect coverage — legal for the
engine but a test smell that couples coverage to configuration abuse.

## Constraint-mining

The composite identity's uniqueness is inherent in its construction; no
new invariant depends on implementer discipline, so no additional
requirements are minted. Fertile-scope and per-territory rules are fully
pinned by the modified requirement bodies and scenarios.

## Risks / Trade-offs

- [Composite id changes the wire shape of the item identity] → module 04+
  are unimplemented and treat ids as opaque; only engine internals and
  tests change.
- [Per-territory food changes opening balance] → intended by the author;
  engine tests updated with the spec.

## Open Questions

(none — every item was resolved in the PR #8 review threads)
