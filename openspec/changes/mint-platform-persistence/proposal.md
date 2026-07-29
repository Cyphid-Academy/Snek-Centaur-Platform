# mint-platform-persistence — Proposal

This is a mint change: ADDED-only, no seed/edit pair. It carries **two**
deltas — the new capability, and **two** ADDED requirements in
`global-invariants`. It is **not** self-contained; the counterpart edits below
land alongside it.

## Why

The Convex deployment is the only one of the platform's three runtimes with no
capability that can state a fact about it. Every Convex-side capability is a
user story, and three facts about the deployment are therefore unowned:

1. **The component topology.** The deployment mounts `convex-snek-platform`
   and `convex-centaur-state` under `convex-host`.
   `global-invariants/centaur-state-boundary` constrains what the Centaur
   subsystem may *hold*; nothing says the components exist, what a component
   owns, or what may cross between them. A component that reads another's
   tables directly would violate no requirement in the corpus.
2. **The access path.** `packages/stdb`'s `codegen` script is `echo 'no
   codegen yet'` and its Convex counterpart does not exist. Nothing says that
   a caller reaches the deployment through generated references, so nothing
   makes a signature change break a build rather than a running call.
3. **Schema change.** Nothing anywhere says how a stored shape changes. The
   Convex SDK is not installed and all three `schema.ts` are placeholders, so
   the first migration will invent a discipline that then becomes the
   convention by accident.

Underneath all three sits the deliverable that has no owner at all: **the
Convex bootstrap**. `migrate-game-configuration`'s drift-guard ownership task — the one this
change deletes — recorded the same shape for its own corner — *"Decide whether the drift guard becomes shared
tooling and who owns it … the mechanism this requirement mints is needed at
four sites and no capability currently owns it."* A task that says "decide who
owns this" is the visible symptom of a missing capability, exactly as
`migrate-turn-pacing`'s co-ownership note was for `game-runtime`.

## Carving decision

Mint **`platform-persistence`** — a substrate capability owning the persistent
deployment's own shape.

Bounded by a four-prong admission test carried in its Purpose, whose prong (b)
counterfactual is **would this read identically for a deployment holding no
records yet?** That test does more work here than anywhere else in this train,
because it is what keeps the capability from swallowing the Convex half of the
corpus: `game-lifecycle/game-record`,
`platform-integrations/functions-are-the-api`,
`decision-transparency/extensible-state-slots`,
`identity-and-authorization`'s registries and
`game-configuration/config-lives-on-the-game` all name a record, a family, or
a slot, and every one of them stays where it is.

Declared dependencies: **global-invariants**, and nothing else. It lands at
graph depth 2, before every capability that stores anything — which is what
lets it own the bootstrap.

## What Changes

- **New capability `platform-persistence`** (mint delta, ADDED-only, 3
  requirements), all new: `component-boundaries`, `generated-access-path`,
  `schema-change-rollout`.

- **The engine-schema drift guard is not this capability's**, and reversing
  the premise it was proposed under (*every mirror is a Convex validator*) is
  what established that: the corpus enumerates **four** mirror sites, two of
  them outside Convex. A rule binding three runtimes and three capabilities
  fails this capability's prong (d) — it is not a fact about one deployment.
  It is `global-invariants/engine-mirrors-are-guarded`, and it is adopted by
  `adopt-mirror-and-generation-invariants` rather than here: a gi requirement
  binds nothing until it folds, and this change does not fold until the Convex
  bootstrap is built. The argument that placed it in gi travels with it.

- **`game-configuration/engine-schema-fidelity` narrows** to what is genuinely
  configuration's: that the stored configuration schema mirrors the engine's
  configuration types field-for-field, partition included, and is handed over
  without translation. The build-time check it used to mandate is now the
  invariant it declares. Its drift-guard ownership task — the one asking who owns the
  mechanism — is deleted rather than retargeted: the question is answered.
  Deleted, so no number here names it; the numbers around it close up.

- **`global-invariants/one-shared-generation` is likewise not this
  capability's.** Board generation moved from `game-engine` to
  `game-configuration`, and with it went `one-shared-engine`'s cover against a
  second implementation; a spec-only move must not quietly delete a constraint.
  Both requirements were drafted here and both have moved to
  `adopt-mirror-and-generation-invariants`, for the reason above.

- **The Convex bootstrap gains an owner.** The SDK install, the three real
  `schema.ts`, the component wiring and the generated client are this change's
  tasks. This is the mirror image of `mint-game-runtime`'s Q-C: there, the
  SpacetimeDB toolchain had to go *upstream* to `game-lifecycle` because
  `game-runtime` folds after its first consumer. Here the substrate folds
  *before* every consumer, so it can hold the bootstrap itself — which is the
  single strongest practical argument for minting it.

## Changes outside this folder

| File | Edit |
|---|---|
| `migrate-game-configuration/specs/game-configuration/spec.md` | narrow `engine-schema-fidelity` and retarget its declaration; narrow `generation-parameter-boundary`'s one-implementation clause and declare `one-shared-generation` there and on `board-preview` |
| `migrate-game-configuration/tasks.md` | delete the drift-guard ownership task and renumber §6; retarget the `#drift-fails-the-build` citations; add the single-generation call-site task and its citations |
| `migrate-game-configuration/design.md`, `proposal.md` | close the deliberately-left generation gap as a Decision |
| `legacy-spec-archive/maps/identifier-map.json` | 08-REVIEW-014 ("single generation authority") — that half is `adopt-mirror-and-generation-invariants`' |
| `migrate-platform-integrations/specs/platform-integrations/spec.md` | Purpose `Depends on:` += `platform-persistence`; `functions-are-the-api` declares the host's ownership of the public surface |
| `openspec/maps/identifier-lineage.json` | one split |
| `openspec/capability-graph.md` | regenerate (`pnpm spec:graph`) |
| `openspec/config.yaml` | add `platform-persistence` to the context capability list (at archive) |

## Open Questions

**Decision (2026-07-29): the two gi requirements leave this change.** They
were drafted here on the reasoning that gi is folded and at most one open
change may carry a delta against a capability — true, and the wrong question.
What matters is that a gi requirement binds nothing until it folds, and this
change does not fold until the Convex bootstrap is built. They are adopted by
`adopt-mirror-and-generation-invariants`, which archives in the PR that opens
it. Neither depended on `platform-persistence` existing, so both survive Q-A
being answered "defer" — now trivially, since they are no longer here at all.
The admission test worked prong by prong, and the six requirements considered
for a declaration (two taken), moved with them.

### Q-A. Is a three-requirement capability worth a graph node?

**Context.** This is the thinnest of the three substrate mints, and unlike
`centaur-server-runtime` it consolidates nothing — all three requirements are
new. Its measured cost is one capability node, one requirement-grain edge
inward, and no fold-order movement whatsoever.

**Options.** (i) Mint it. (ii) Defer: the gi drift guard is independently
justified and now lives elsewhere, so deferring would leave the other three
facts unstated and let the first Convex implementation set the conventions.

**Recommendation:** (i), on the bootstrap-ownership argument above — there is
no other capability that folds before every Convex consumer, so under (ii) the
bootstrap stays unowned or goes to a story capability that some other story
capability needs to fold before. But the author should decide this one
explicitly; it is the only capability in this train that would not obviously
be missed.

### Q-B. Is `schema-change-rollout` a requirement or a convention?

**Context.** Expand-migrate-contract is a well-known discipline, and one might
argue it belongs in an `AGENTS.md`.

**Recommendation:** requirement. It is falsifiable — a rollout that renames a
field in one step violates it visibly — and the failure it prevents is a read
error in production, which no test catches and no reviewer notices in a diff
that looks like a rename.

### Q-C. Who implements the shared mirror assertion?

**Context.** `global-invariants/engine-mirrors-are-guarded` requires one
assertion used at every site. Its natural home is next to the engine, since it
asserts against engine types, and its first consumer in fold order may well be
`revise-game-engine-contract` rather than this change.

**Recommendation:** the helper is a task here, with a note that if
`revise-game-engine-contract` needs it sooner it takes it. Unlike a capability
requirement, a task can move — and the requirement itself has now moved to
`adopt-mirror-and-generation-invariants`, which changes nothing about who
writes the assertion.
