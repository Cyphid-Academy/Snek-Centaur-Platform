# mint-platform-persistence — Design

## Context

Of the platform's three runtimes, two now have a capability that can state a
fact about them: `game-runtime` for a game's SpacetimeDB instance,
`centaur-server-runtime` for a Snek Centaur Server. Convex has none, and it is
the runtime with the most capabilities standing on it — eleven of them.

This change is the smallest of the three substrate mints and the one whose
justification is weakest on consolidation and strongest on fold order. It is
stated that way deliberately; see Q-A.

## Decisions

### 1. The gi boundary is drawn by independence, not by subject matter

The obvious failure mode of a Convex-shaped capability is that it restates
`global-invariants/single-convex-deployment`, which is the DRY failure the
corpus explicitly forbids. The operative test used throughout this change is
mutual independence: **for any pair, can each be violated while the other
holds?**

- `single-convex-deployment` (one deployment, sole home of durable state) vs
  `component-boundaries` (components reached by function, not by table): you
  can run a second deployment while the components are perfectly bounded, and
  you can run exactly one deployment whose host reads a component's tables
  directly. Independent — both may exist.
- `centaur-state-boundary` (the Centaur subsystem is the sole home of bot-side
  state and holds nothing authoritative for outcome) vs `component-boundaries`:
  you can honour the contents rule with one undifferentiated component, and you
  can honour the access rule while storing the wrong things. Independent.
- `one-contract-many-surfaces` (every mutation dispatched against the
  server-side function contract) vs `generated-access-path` (callers reach it
  through generated references): you can dispatch every mutation against the
  contract using hand-written string addressing. Independent.

Where the test fails, the requirement does not exist. That is why this
capability holds no statement of atomicity, no statement that Convex is the
sole home of durable state, and no statement about what a hostile client may
do — all of those are gi's, and each of these three requirements declares the
gi requirement it rests on instead of repeating it.

**What breaks if reversed** (state the constraint locally too): two statements
of one rule, the local copy carrying no authority, drifting the first time
either is edited.

### 3. The keystone is the boundary, not the component list

`component-boundaries` deliberately states the *access rule* and leaves the
component enumeration to the scenarios and to the code. A requirement naming
`convex-snek-platform` and `convex-centaur-state` would be a fact about the
repository that goes stale the first time a third component is added; the
falsifiable content is that a component's tables have exactly one reachable
owner.

Its third scenario, `#the-boundary-costs-no-atomicity`, exists because an
implementer who reads the boundary rule strictly will reach for eventual
consistency between components, and that would silently give up the property
`single-convex-deployment#cross-record-invariants-are-one-transaction` is
load-bearing for. The boundary constrains the access path and nothing else.

**What breaks if reversed** (enumerate the components): the spec carries a
package list, and the rule that actually matters — no ambient access — stays
unstated.

### 4. The bootstrap can live here because this capability folds first

`mint-game-runtime`'s Q-C established the rule: a toolchain belongs to the
first consumer in fold order, because putting it downstream makes the
consumer's archive-due gate unsatisfiable. There, that forced the SpacetimeDB
module build *upstream* into `game-lifecycle`, since `game-runtime` folds
after it.

Here the substrate is at depth 2 and every Convex consumer is at 3 or deeper,
so the rule points the other way: this capability's plan can hold the SDK
install, the three real `schema.ts`, the component wiring and the generated
client, and every consumer inherits them. That is the practical benefit the
capability buys, and it is not available from any story capability, because
each of them has a peer that must fold before it.

**What breaks if reversed** (bootstrap in a story capability's plan): whichever
story is chosen becomes an implicit prerequisite of every other Convex
capability without the graph recording it — the thing declared dependencies
exist to prevent.

## Constraint-mining

- Decision 1 → no new invariant; the independence test is the guard.
- The two `global-invariants` requirements this change drafted are mined in
  `adopt-mirror-and-generation-invariants`, which now owns them.
- Decision 3 → the invariant is that the boundary is not paid for in atomicity.
  Minted as `platform-persistence/component-boundaries#the-boundary-costs-no-atomicity`.
- Decision 4 → the invariant is that no untyped call path survives alongside
  the generated one, since one is all it takes for a signature change to reach
  production as a runtime failure. Minted as
  `platform-persistence/generated-access-path#no-second-call-path`.
- `schema-change-rollout` mines the discipline itself: `#removal-is-the-last-step`
  exists because the tempting implementation — rename and re-point in one
  deploy — is invisible in review and fails only in production.

## Risks / Trade-offs

- **It consolidates nothing.** All three requirements are new. Unlike
  `game-runtime` there is no six-owners-of-one-thing argument, and unlike
  `centaur-server-runtime` there is no mis-filed cohort to reclaim. Recorded
  as Q-A, and it is the honest reason a reviewer might decline this one while
  accepting the other two.
- **One dependent.** Only `platform-integrations` declares it today, at weight
  1. `decision-transparency/extensible-state-slots` is its natural second
  dependent — the Centaur component's bounded slots are exactly a component's
  own schema surface — but that folder is held by another agent this session.
- **"Persistence" undersells the scope.** The capability also owns the access
  path. The alternative names (`platform-backend`, `platform-datastore`) are
  worse in other ways; recorded, not resolved.

## Alternatives considered

- **Do not mint it; keep the gi drift guard only.** The serious alternative,
  and the one Q-A puts to the author. Rejected because the bootstrap then has
  no owner that folds before its consumers, and the three unstated facts stay
  unstated — the topology in particular, which the first Convex implementation
  will fix in code and nobody will be able to check afterwards.
- **Give the three facts to `global-invariants`.** Rejected on gi's own terms:
  they are implementation-bearing facts about one deployment, checkable by
  opening its definition, and gi is a meta layer with no implementation of its
  own — the same ground on which `mint-game-runtime` declined to give gi the
  resolving transaction.
- **Give them to `game-lifecycle`.** Rejected: it is the largest Convex
  consumer but it is a story about a game's existence, it folds at depth 5
  behind four other Convex capabilities, and it would become the "everything
  about the backend" dumping ground the migration broke module 05 apart to
  avoid.
- **Merge with `centaur-server-runtime` as one `platform-infrastructure`
  capability.** Rejected: different runtimes, disjoint consumers, and a merged
  capability would sit at depth 3 with `game-configuration` behind it at 4 —
  measurably worse, and semantically the runtime-shaped decomposition the
  migration dismantled.
