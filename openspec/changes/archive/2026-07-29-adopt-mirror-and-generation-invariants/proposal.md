## Why

Two invariants were authored inside `mint-platform-persistence`, a substrate
mint that will not archive until the Convex bootstrap is built. That is the
wrong home for a `global-invariants` requirement, and the corpus already said
so: `extend-global-invariants`' plan records that gi "prescribes nothing to
build itself… enforcement is each dependent's obligation verified at *that*
dependent's own archive — **never a precondition of archiving gi**."

The point of gi is that it binds everything. An invariant sitting in an open
change binds only the code written against that change; it does not reach
`specs/`, so it does not constrain the twenty-one other open changes, and it
does not constrain work that opens while it waits. `one-shared-generation`
made that concrete: board generation was extracted into its own package
while the invariant forbidding a second generator existed nowhere in the
binding corpus.

The reasoning that put them there was backwards. It asked *which open change is
permitted to carry a gi delta* — gi is folded, one change may amend a
capability, and that change already had a gi delta — rather than *what a gi
change requires*, which is immediate folding. The permission question has an
answer; it is just not the question.

## Carving decision

**A dedicated change, archived in the same PR that opens it.** This is the
shape `extend-global-invariants` and `adopt-federated-trust-invariants` both
used, for the same reason: a constraint-defining meta-capability has no
implementation phase, so there is nothing for its change to wait on.

Nothing about the two requirements changes. They move verbatim, with the
rationale that argued their placement, out of a folder whose subject is the
Convex deployment and into one whose subject is the invariants themselves.

The delta is `## ADDED Requirements` against a folded capability, so it needs
no seed and no `## MODIFIED Purpose`: both requirements declare `game-engine`
requirements, and gi already declares `game-engine`. No other open change
touches gi.

## What Changes

- **`global-invariants/engine-mirrors-are-guarded`** moves here from
  `mint-platform-persistence`. Wherever a runtime holds its own declaration of
  a shared engine type, one shared build-time assertion checks it, and
  modifier-only divergence counts as divergence.
- **`global-invariants/one-shared-generation`** moves here likewise. The board
  generation rules have exactly one implementation, and every board offered as
  their output is that implementation's.
- **`mint-platform-persistence` loses its gi delta** and the sections of its
  `design.md` that argued for these two requirements. What remains is that
  capability's own three requirements and the bootstrap it owns. Its admission
  test is unaffected — the drift guard failing its fourth prong is *why* the
  requirement is gi's, and that argument travels with the requirement.

No implementation is performed by this change, and none is owed by it.

## Impact

- `openspec/specs/global-invariants/spec.md` gains two requirements at archive,
  which is this PR's second commit rather than a later one.
- Four requirements across two open changes already declare them —
  `game-configuration/engine-schema-fidelity`,
  `game-configuration/generation-parameter-boundary`,
  `game-configuration/board-preview` and
  `visual-tester/generated-board-sessions`. They resolve through the
  open-change overlay before the fold and against `specs/` after it, so no
  sibling change needs editing.
- `openspec/capability-graph.md` is unchanged: gi already declares
  `game-engine`, and no capability-grain edge is added or removed.
- `openspec/config.yaml` needs no capability-list edit — `global-invariants`
  is already in it.
- Code: `packages/game-configuration` and `apps/visual-tester` already cite
  `one-shared-generation`. Those citations resolve identically after the fold.

## Open Questions

None. The requirements are unchanged text with an unchanged argument; what
this change corrects is which folder holds them and when they reach `specs/`.
