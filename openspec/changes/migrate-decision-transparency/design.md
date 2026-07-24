## Context

Migration change minting `decision-transparency` from legacy modules 06
(the Centaur-state slot and its write rules), 07 (snapshot triggering and
sole-writership), and 08 (the operator-facing decision displays), plus
the module-02 parked ledger's id-less constraint-mined entry (12
requirement ids, 2 review items, 1 ledger entry → 8 requirements).
Legacy text is binding source material. This file records the decisions
a future reader cannot recover from the specs alone.

## Decisions

### One record, three displays: the record is the only source

The legacy corpus already gestured at this rule in three places (the
frontend no-recompute note, the full-replacement rendering note, the
independently-interpretable snapshot requirement); this change promotes
it to the capability's organising principle. `computed-display-state`
defines what the record carries; `scored-direction-display`,
`worst-case-preview`, and `decision-breakdown` are each defined as
renderings *of the record* — the breakdown decomposes the recorded
world's score (`#rows-explain-the-recorded-world`), the preview draws
the recorded world (`#no-record-no-preview`), the colours plot the
recorded scores. What breaks if reversed (displays computing their own
values): the live view and the replay of the same moment diverge — the
replay can only ever render the record, so any client-side recomputation
makes "what the operator saw" unreconstructable; and a frontend
re-running heuristics needs the heuristic implementations and the
simulation machinery in the client, doubling the surface on which a
scoring bug can exist and disagreeing with the framework whenever the
two drift.

### The sole writer is named without credential vocabulary

Legacy 06-REQ-027 identifies the writer by its authentication mechanism
(the per-team game credential). That vocabulary — credential issuance,
game invitations — belongs to capabilities outside this one's dependency
ceiling. Author-resolved: `hosting-server-sole-writer` names the writer
behaviourally — the hosting server process the team's automated player
runs in (`bot-framework/embedded-team-player`) — and leaves how that
writer authenticates to the identity story that owns credentials.
07-REQ-004, the same rule stated from the framework side, dedupes onto
it. What breaks if reversed: this spec would cite vocabulary from
capabilities it may not depend on (lint-fatal), and every future change
to credential mechanics would ripple through a transparency requirement
that cares only about *who*, not *how proven*.

### No rate limit; cadence belongs to the writer (author-resolved)

06-REQ-029 survives at full strength: the platform imposes no per-turn
or per-second throttle on display-state writes
(`#cadence-is-the-writers-choice`), and no cadence requirement is
authored here at all — the framework decides when to publish, this
capability only guarantees that publication is triggered by the dirty
flag and never impeded. What breaks if reversed (a platform-side rate
limit): the `#preview-evolves-in-place` experience degrades exactly in
the busiest turns, when snapshots are most frequent and most valuable;
and silently dropped or coalesced snapshots thin the recorded history
that replay reconstruction depends on, in a way no consumer can detect
from the record.

### Full-replacement snapshots, and consumers forbidden to diff-merge
### (constraint-mined — routed lead)

06-REQ-028's producer-side rule (full snapshots, independently
interpretable) is authored together with its consumer-side dual from the
legacy downstream-impact note: `snapshot-full-replacement` binds
consumers to treat every update as a wholesale replacement — no merging,
no back-filling absent keys from earlier snapshots
(`#absence-is-meaningful`). The consumer half is precisely an invariant
a future implementer could silently violate: a "helpful" UI cache that
patches missing cells from the previous snapshot compiles, looks
smoother, and displays withdrawn decision state as current. What breaks
if reversed: stale entries from prior compute passes surface as live
cells in the decision table and phantom worlds in the preview, and a
snapshot stops being a statement of current truth — which also breaks
`#any-snapshot-stands-alone`, the property replay depends on to render
any recorded instant without its neighbours.

### Missing cells render absent — never zero, never stale
### (constraint-mined — routed lead)

`published-slots-only` mints the frontend no-recompute rule from the
legacy downstream-impact note, with the absence semantics made explicit:
no client-side heuristic evaluation or simulation
(`#no-client-recomputation`), and unpublished values render as visibly
absent (`#missing-cell-renders-absent`), echoed in the neutral-state
rendering of `scored-direction-display#neutral-is-not-worst`. This is
the display-side twin of bot-framework's undefined-is-not-zero rule: on
a [−1, 1] scale zero is a *good* score, so a zero-filled unknown cell
would actively misrank directions in the operator's eyes. What breaks if
reversed: operators steer by fabricated numbers during exactly the
window (early turn, partial evaluation) when trust in the display
matters most.

### Deterministic worst-case tie-break makes the record reproducible
### (constraint-mined — routed lead)

From resolved legacy review: worst-case-world ties are broken by a fixed
deterministic rule, authored at intent grain in
`computed-display-state#worst-case-world-is-deterministic` (the
requirement pins determinism; the specific rule — the legacy resolution
chose lexicographic foreign-tuple order — is mechanism, cited from code
with a `// design:` reference here). What breaks if reversed
(arrival-order or otherwise nondeterministic selection): identical
evaluation state publishes different worlds on different runs, so the
preview an operator saw cannot be re-derived from the scores, snapshots
stop being reproducible artifacts, and any future replay-verification
tooling that recomputes the record has nothing stable to compare
against.

### The annotations excision posture is carried, not the annotations

The resolved legacy review excised the entire speculative annotations
subsystem and moved heuristic-violation diagnostics to the hosting
server's process log. This change carries the surviving posture as
spec: the published slots are the *complete* operator-visible decision
surface, and violations have no operator-UI surface
(`published-slots-only#violations-stay-in-the-server-log`, aligning with
`bot-framework/author-fault-containment`'s log-only reporting). The
excised annotations themselves are deliberately not re-authored — a
replacement annotations design remains future work that would extend
this capability. What breaks if reversed (an implementer "helpfully"
surfacing violations in the operator UI): a diagnostic channel for
heuristic authors becomes an in-game signal that leaks a team's broken
heuristics to anyone watching a shared screen, and the UI grows a
surface whose schema the resolved review deliberately declined to
commit to.

### The ledger entry graduates: extensible slots as a requirement

The module-02 migration constraint-mined an id-less entry: the Centaur
schema offers standardized bounded slots (the per-snake computed display
record and the append-only action log) so novel bot logic produces
recorded, replayable data without per-team schema change. Authored as
`extensible-state-slots` — the capability-level statement of *why* the
recorded surface is fixed slots rather than per-team tables. The action
log is named as a slot in plain language; its own contract (fields,
categories, immutability) is the replay story's to author, and this
requirement claims only the slot's role in the extensibility guarantee.
What breaks if reversed (per-team schema extensions): every consumer —
displays, replay, audit — needs per-team code to read per-team shapes,
the uniform replay surface fragments, and a team's novel bot logic
produces data only that team can interpret, defeating the platform's
recorded-game story.

### UI-mirror ids fold as scenarios (author-resolved)

08-REQ-050 and 08-REQ-060 (reactive updates) and 08-REQ-040's
neutral-state clause are qualities of displays, not standalone
behaviours; they are authored as scenarios on the display requirements
(`#preview-evolves-in-place`, `#snapshot-updates-the-open-table`,
`#neutral-is-not-worst`). The display halves of 08-REQ-044/045 (score
labels, pick-triggered preview) are authored here while
operator-control retired the ids with SPLIT notes pointing at this
capability. What breaks if reversed (authoring mirrors as requirements):
the capability doubles its requirement count restating "and the UI shows
it" against each behaviour, burying the load-bearing contracts.

## Constraint-mining (mandatory final step)

- **Minted: consumers never diff-merge snapshots; absence is
  information** (`snapshot-full-replacement#absence-is-meaningful`,
  `#any-snapshot-stands-alone`) — routed lead.
- **Minted: no client-side recomputation; missing cells render absent,
  never zero or stale** (`published-slots-only#missing-cell-renders-absent`,
  `#no-client-recomputation`;
  `scored-direction-display#neutral-is-not-worst`) — routed lead.
- **Minted: deterministic worst-case selection, record reproducible from
  itself** (`computed-display-state#worst-case-world-is-deterministic`)
  — routed lead.
- **Minted: per-direction coherence — score, world, and outputs describe
  one world** (`computed-display-state#per-direction-coherence`) — an
  invariant a writer could silently violate by publishing outputs from a
  fresher world than the recorded one, making the breakdown "explain" a
  world the preview does not show.
- **Minted: timestamps travel inside the record**
  (`computed-display-state#timestamps-travel-with-the-world`) — without
  them, frozen-snake compensation (a bot-framework consumer contract) is
  impossible for anything rendering from the record alone.
- **Minted: transparency decorates controls, never gates them**
  (`scored-direction-display#display-decorates-never-gates`) — a display
  layer that disables staging while scores are absent would let a
  framework outage take the *human* controls down with it.
- **Checked, owned by dependencies**: undefined stateMap entries are
  absent at the source (`bot-framework/worst-case-statemap`); the dirty
  flag is set only on real change (`bot-framework/score-composition`);
  violation containment and log-only reporting
  (`bot-framework/author-fault-containment`); staging semantics of the
  affordance the scores decorate
  (`operator-control/board-and-move-interface`).
- **Checked, plastic (mechanism, doc-comment territory)**: the concrete
  tie-break rule (lexicographic foreign-tuple order), the record's
  storage shape and column typing, the colour ramp itself, and the
  subscription plumbing that delivers snapshots to displays — code
  citing this change's archive folder suffices when they land.
