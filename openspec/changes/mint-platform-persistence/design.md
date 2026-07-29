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

### 2. The drift guard is `global-invariants`', and that reverses the sketch

`platform-persistence` was proposed partly to own the engine-schema drift
guard, on the premise that every mirror is a Convex validator. The premise is
false and the corpus already records why:
the drift-guard ownership task `migrate-game-configuration` carried (deleted
by this change) enumerated four mirror sites,
two of which are not Convex — `apps/visual-tester/src/lib/test-sequences/`
(owned by `test-sequences`) and `packages/stdb` (owned by `game-lifecycle`).

A rule binding three runtimes and three capabilities satisfies
`global-invariants`' own prong (a) and (b), and fails this capability's prong
(d): it is not a fact about one deployment. So it is minted in gi, and
`game-configuration/engine-schema-fidelity` narrows to declare it.

This is worth recording as evidence about the admission test rather than as an
embarrassment: the test caught a mis-placement in the proposal that motivated
the capability. A test that only ever confirms the intended answer is not a
test.

`global-invariants` is folded, so this is an `## ADDED Requirements` delta
against `specs/global-invariants/spec.md`. It needs no `## MODIFIED Purpose`
(the new requirement declares `game-engine/runtime-portability`, and gi
already declares `game-engine`) and no seed/edit pair (ADDED-only), and no
other open change touches gi — checked.

**What breaks if reversed** (keep it here): the rule would sit in a capability
most of the sites it binds have no other reason to read. Two of the four —
`apps/visual-tester/src/lib/test-sequences/` and `packages/stdb` — mirror
engine types for reasons unconnected to game configuration, so hosting the
rule there makes a mirror site a consumer of the configuration story in order
to learn a fact about engine types. `game-configuration/engine-schema-fidelity`
keeps *what must correspond*, which is genuinely its own, and declares this
invariant for *how the correspondence is held*.

An earlier draft of this section argued the same placement from a **false**
premise: that those two capabilities *cannot declare* `game-configuration`.
They can. `test-sequences` is folded, but the bar is on two *open changes*
amending one Purpose, and `revise-game-engine-contract` is the only change
amending it — so a `## MODIFIED Purpose` there is ordinary, and is exactly the
move `visual-tester` makes elsewhere in this branch. `game-lifecycle` already
declares `game-configuration`. The correction is recorded rather than quietly
deleted because "cannot" is the shape of mistake worth leaving a marker for:
the corpus's rules bound what one change may do, never what the corpus may
become, and an argument that reads a cost as a prohibition will reach the
wrong placement sooner or later.

### 2b. `global-invariants` gains a second requirement here: one shared generation

Board generation has just left `game-engine` for `game-configuration` — six
requirements plus a split, spec-only, with the algorithm still shipping from
`packages/engine/src/boardgen.ts`. While it lived in the engine,
`global-invariants/one-shared-engine` covered it: a second generator would have
been a second implementation of the engine. After the move nothing at the
invariant layer forbids one, and *the move must not be a net loss of
constraint*. `migrate-game-configuration/design.md` asked for the gap to be
closed by another change; this is that change, for a mechanical reason —
`global-invariants` is folded, so a second open change amending it is exactly
the collision the corpus guards against, and this change already carries a gi
delta.

**gi's own admission test, satisfied explicitly** (its Purpose: a requirement
belongs here iff all three hold):

- **(a) It constrains implementers of two or more other capabilities or
  runtimes.** Three consumers exist in the corpus today, in three capabilities.
  `game-configuration` regenerates a preview on every change to a board's
  inputs. `game-lifecycle`'s launch orchestration obtains the starting state and
  halts before provisioning when generation fails — a second call site, in
  another capability, on the path that produces the board players actually get.
  `visual-tester` seeds a fresh session from production generation
  (`apps/visual-tester/src/lib/factory.ts` calls the same entry point the
  platform does). Two runtime contexts: the Convex deployment and a browser
  application. ✔
- **(b) No single user-story capability owns it.** `game-configuration` owns the
  *rules*. What this invariant says is that nobody anywhere writes a second
  implementation of them — a negative constraint over the whole system, binding
  every potential duplicator and therefore owned by no one capability. The
  provider is in fact the one place the rule is *not* about:
  `game-configuration` implementing generation is the thing being permitted,
  not the thing being forbidden. `one-shared-engine` has sat in gi on exactly
  this reasoning since it was minted, while `game-engine` owns the rules it
  forbids a second copy of; `one-shared-generation` joins it for the same
  reason rather than by analogy to it. ✔

  *An earlier draft argued (b) from a false premise instead — that
  `visual-tester` could not declare `game-configuration`, because the engine
  change was already amending it, leaving "no arrangement" in which
  `game-configuration` could host the rule. It can: the bar is on two open
  changes amending one Purpose, and `add-generated-board-sessions` now makes
  precisely that declaration. The premise was wrong and the conclusion is right
  for the reason above — which is the argument that should have been given
  first, because a placement argued from an impossibility stops holding the
  moment the impossibility turns out to be a cost.*
- **(c) Falsifiable.** A second implementation is found by opening the source,
  and `#a-local-preview-is-a-second-implementation` is the case a future
  implementer ships while believing they are optimising. ✔

And the substrate test's prong (d) sends it here rather than to
`platform-persistence` or `application-shell`: it is not a fact about one named
artifact checkable by opening its source — it binds every place a board is
produced, in whichever runtime. Generation is not even Convex-resident: the
visual tester runs it in a browser.

### 2c. What the invariant forbids: one *generator*, not one *definition*

This is the part that is not simply `one-shared-engine` with a word changed.
That invariant forbids reimplementing two things — the domain *types* and the
turn-resolution *algorithm*. Only the second half transfers.

**The definition side is already owned, twice over.** What a valid generated
board is, is stated by `game-configuration`'s eight generation requirements, and
the five parameters have a requirement saying in terms that its table is their
sole declaration anywhere. A gi clause forbidding "a second definition of what a
valid generated board is" would either restate the corpus's one-owner rule, or —
much worse — sweep in every legitimate structural check over a board. The live
example is `visual-tester/board-editor`, which enforces shared head parity on
*hand-authored* states. Under a definition-shaped invariant that is a second,
partial, hand-maintained statement of what a generated board looks like, living
in an editor. It is not: the corpus already refactored it, dropping the editor's
declaration of generation's parity rule and justifying the check from the
movement rules instead — parity is preserved every turn because all heads step
together. The editor's check and generation's placement rule are independent
facts that agree, not a copy.

**The implementation side is the whole of the gap.** Nothing forbids two code
paths that both claim to implement those requirements — which is a live risk,
not a hypothetical, on two counts. First, `board-preview` and the unlocked-launch
arm of `board-preview-lock-in` are two call sites in two capabilities; the specs
say they are one implementation invoked twice ("the preview is produced by the
same generation the launch will use"), and nothing above `game-configuration`
holds them to it. Second, the configuration component's first delivery is
`#runs-with-no-host` — standing alone in a development environment, presenting
"the board generated from it" with no platform behind it. That is precisely the
situation that produces a client-side generator, and it will look like a
convenience rather than a violation.

**What it deliberately does not say: where generation runs.** "Platform-side,
never a client" stays `game-configuration/board-preview`'s, and must: the visual
tester legitimately runs the shared generator in a browser, so a gi placement
rule would be violated on day one by a tool that is doing exactly the right
thing. gi constrains *which implementation*, `game-configuration` constrains
*where a game's board is generated*. The two are independent — you can run the
one implementation client-side, and you can run a second implementation
platform-side — which is the test the corpus uses for whether both may exist.

**And the carve-out is stated in the requirement, not left to be inferred.**
Hand-authored boards, edited boards, fixture and sequence boards, and boards a
test's arbitrary constructs are outside it. Without that sentence the first
person to write a board arbitrary would read themselves as violating it —
`packages/engine/src/arbitraries.ts` and the visual tester's blank-canvas
factory both construct boards today, and `visual-tester/board-editor`
deliberately permits "states board generation would never produce". The line the
requirement draws is by *claim*: a board nobody offers as what a game's inputs
generate is not generation's output and is not governed.

**Where it is declared, and where it is deliberately not.** Two entries in
`migrate-game-configuration`, chosen by the corpus's test — *relax this and my
requirement stops making sense* — rather than by conformance:

| Requirement | Declared? | Why |
|---|:--:|---|
| `generation-parameter-boundary` | **yes** | Its rule is that the parameters are consumed by running the one shared implementation platform-side. Under two implementations "consumed platform-side into an initial state" no longer says which rules the state obeys |
| `board-preview` | **yes** | It asserts the preview "is produced by the same generation the launch will use". Under two implementations that sentence is not vague, it is *false*, and the preview stops being a preview |
| `board-preview-lock-in` | no | Every clause survives two generators intact: the lock still designates the platform-held preview, still clears on an input change, and launch still uses the designated board exactly. The unlocked fresh-seed arm gets vaguer, not unsound — and the sameness claim it would be leaning on is `board-preview`'s, which does declare it |
| `parameter-bounds-sourcing` | no | Its parties are the widget and the record, not the generator. Two generators both reading the one declaration violate nothing of it. It declares `one-shared-engine` for the *gameplay* half because the engine's declaration is that half's source; the generation half's source is this capability's own table, and an intra-capability entry is forbidden |
| the eight generation rule requirements | no | They bind every implementation by their own terms, so they read identically under one or two. `board-generation-retry`'s reproducibility is the near miss, and the corpus's own precedent settles it: `game-engine/determinism` does not declare `one-shared-engine` either — the invariant declares the portability requirement, not the reverse |
| `self-contained-configuration-surface` | no | Its subject is the absence of a host, not where the board comes from. It is nonetheless the sharpest place the violation will be attempted (see above), which is why the scenario exists |

`generation-parameter-boundary` also **narrows**: its clause "board generation
therefore has exactly one home and one implementation, which every surface that
needs a board calls rather than reproducing" is now word-for-word what the
invariant says, and the DRY rule forbids leaving the copy — the same forcing
that narrowed `host-selected-affordances` and `engine-schema-fidelity`. What
survives locally is the partition and the platform-side consumption, which are
genuinely configuration's.

**What breaks if reversed** (leave the rule as prose inside
`generation-parameter-boundary`): it binds only implementers reading that one
requirement, so the launch path and the visual tester are outside its reach, and
a *second server-side* generator — a launch path that reimplements generation
because it wants a different entry point — violates nothing at all. The
client-side preview is caught today only by `board-preview`'s
`#clients-render-never-generate`, which forbids the *location*, so the same
mistake made in a Convex action instead of a browser is legal. And the move of
generation out of the engine silently deletes a constraint that was in force
before it, which is the one outcome a spec-only move must not have.

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
- Decision 2 → three invariants in `global-invariants/engine-mirrors-are-guarded`:
  that drift fails the build wherever the mirror lives; that **modifier-only
  divergence counts** (`#modifier-only-divergence-is-divergence` — the mutual
  `extends` idiom passes while `readonly` differs, and Convex's `Infer<>`
  yields mutable properties against an engine whose fields are all `readonly`,
  so the naive implementation is not merely weak but actively misleading); and
  that one assertion serves every site, so a later mirror cannot ship with a
  weaker check of its own.
- Decision 3 → the invariant is that the boundary is not paid for in atomicity.
  Minted as `platform-persistence/component-boundaries#the-boundary-costs-no-atomicity`.
- Decision 4 → the invariant is that no untyped call path survives alongside
  the generated one, since one is all it takes for a signature change to reach
  production as a runtime failure. Minted as
  `platform-persistence/generated-access-path#no-second-call-path`.
- Decision 2b/2c → one invariant in `global-invariants/one-shared-generation`:
  that the generation rules have exactly one implementation and every board
  claiming to be their output is that implementation's
  (`#preview-and-launch-are-one-implementation`); that a locally-generated
  preview is a second implementation no matter how faithful
  (`#a-local-preview-is-a-second-implementation` — the failure is invisible
  until someone compares a shown board with a delivered one, and by then the
  game has started); and that authoring, editing, replaying, or randomly
  constructing a board is none of its business
  (`#authoring-a-board-is-not-generating-one`), without which the carve-out
  would have to be re-derived by every author of a fixture or an arbitrary.
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
