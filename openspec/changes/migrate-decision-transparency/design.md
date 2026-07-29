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

### Where the record lives, and why Convex may hold simulated worlds

The computed display state record is Centaur-subsystem state in the one
Convex deployment (`global-invariants/centaur-state-boundary`,
`global-invariants/single-convex-deployment`), so the requirement names
only *which* slot holds it and leaves the runtime placement to the
invariant that owns it. That placement is sound despite the record
carrying whole simulated game worlds during a live game: those worlds are
a Server's non-authoritative simulation output
(`global-invariants/authoritative-turn-resolution#server-simulation-is-not-authoritative`),
not a mirror of the game instance's own state, so persisting them in
Convex does not make Convex a live-game mirror
(`global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game`)
and nothing in the record can decide a game
(`global-invariants/centaur-state-boundary#centaur-state-cannot-decide-a-game`).
What breaks if reversed (treating the record as game state, or homing it
in the game instance): it would die with the instance, taking the
recorded decision history replay depends on with it.

### Recording this much deliberation is sound only because it is team-private

The record is the most strategically revealing artifact the platform
holds: a team's heuristic weights, its portfolio state, and the
pessimistic worlds it is steering by, published continuously *while the
game is live*. `global-invariants/team-private-centaur-state` is what
makes recording it at that fidelity acceptable, so
`computed-display-state` and `extensible-state-slots` cite it rather than
restating a read rule of their own — the read scope is one rule, enforced
once in the Centaur subsystem's function contract, and a second copy here
would drift. The consequence for this capability's displays is that
"operator-visible" in `published-slots-only` means visible to the
team's own operators: the displays are a surface over the record and a
surface may not widen its read scope. What breaks if the invariant is
relaxed: the transparency layer becomes an opponent-intelligence feed,
and the honest response would be to record *less*, gutting both the
displays and the replay story built on the same slots.

### The sole writer is named without credential vocabulary

Legacy 06-REQ-027 identifies the writer by its authentication mechanism
(the per-team game credential). That vocabulary — credential issuance,
game invitations — belongs to capabilities this one does not declare as
dependencies. Author-resolved: `hosting-server-sole-writer` names the writer
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

The format also makes subscription recovery trivial: a client that lost
its subscription and must resume from fresh state rather than a stale
cache (`global-invariants/client-truthfulness#subscription-loss-is-visible`)
needs exactly the newest snapshot, with no gap to replay. That is a
consequence of full replacement, not a premise of it — the invariant
holds for delta-encoded streams too, at the cost of history the client
would have to refetch — so it is recorded here rather than cited by
`snapshot-full-replacement`, whose soundness does not rest on it.

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

### The record carries the weights and labels it scored with (author-decided)

The delta as first drafted recorded per-heuristic *outputs* but no weights,
while `decision-breakdown` required each row's "current portfolio weight"
and its weighted contribution. That is an internal contradiction, not a
gap: the only place a current weight can come from is
`bot-configuration`'s portfolio record, which an operator may edit
mid-game (`bot-configuration/any-member-live-editing`) and whose
per-heuristic nickname the captain may rename at any time
(`bot-configuration/registry-sync-insert-only#sync-never-overwrites`), so a
live join reads a weight and a label from a moment other than the one that
produced the score. `computed-display-state` now records, per heuristic
that contributed to a direction's score, the **portfolio weight in force
when the score was computed** and the **display label as it then stood**,
and `decision-breakdown` reads those recorded values rather than current
ones. Four things this resolves, each of which the live-join design broke:

- **Contributions sum to the recorded score.** The score is the weighted
  sum of the heuristics' values (`bot-framework/score-composition`), so a
  decomposition using *different* weights than the summation used does not
  add up. Recorded weights make `#contributions-sum-to-the-recorded-score`
  a checkable property of the snapshot rather than a coincidence that holds
  only while nobody edits a weight.
- **Live and replay agree.**
  `published-slots-only#no-client-recomputation` requires that "the live
  view and any later replay of the same snapshot agree" — which a live
  join cannot satisfy, because the replay joins whatever the weights are
  *then*. With the weights inside the snapshot, the two renderings read the
  same bytes and cannot diverge; `#weight-edits-do-not-rewrite-the-past` is
  that property stated where an implementer would break it.
- **No team-scoped configuration is released post-game.**
  `global-invariants/team-private-centaur-state#finished-games-release-only-what-is-published`
  says a finished game releases what the platform publishes as its record
  and replay, "not the losing team's private configuration, which stays
  team-scoped regardless of game state". A breakdown that joins the live
  portfolio record makes team-perspective replay structurally require a
  read of exactly that configuration — the invariant would have to be
  relaxed for the feature to work at all. Recording the weight moves the
  quantity inside the published deliberation record: a historical scoring
  fact, released (or not) on the same terms as the rest of the snapshot,
  with the team's *current* configuration never on the replay path. The
  live-vs-post-game release boundary for the record itself is a separate
  question and stays open for its owners (tasks §4.4); this decision only
  guarantees the boundary never has to cut through configuration.
- **This capability needs no `bot-configuration` dependency.** With weight,
  label and output all recorded, the breakdown joins nothing: every column
  comes from the snapshot. `decision-transparency` therefore declares
  **bot-framework, operator-control, global-invariants** and nothing more,
  and none of its requirements declares a `bot-configuration` identifier.
  The weights themselves are a framework-side quantity — the portfolio the
  framework scores with (`bot-framework/per-snake-portfolio`) — so the new
  citations land inside the already-declared dependency.

What breaks if reversed (dropping back to a live join): the breakdown
becomes the one display that is *not* a rendering of the record, silently
violating the capability's organising principle; replays of the same
snapshot render differently on different days; the arithmetic stops closing
exactly when an operator is most actively tuning; and the post-game story
acquires a hard dependency on reading team-private configuration.

### Relative impact is a centred contribution, and the record already carries what it needs (author-decided)

The breakdown's "relative impact" column was left as mechanism because two
plausible denominators disagreed — the heuristic's share of the direction's
score, or its share of the total absolute weighted contribution — and the
two rank heuristics differently whenever a score is near zero or a
contribution is negative. The author's definition (2026-07-28) is neither:

> the relative impact from a heuristic for a given candidate move is its
> weighted score for that move minus its average weighted score across all
> candidate moves.

It is a **centred difference, not a ratio**. The property it exists to
express is informational: a heuristic that scores every candidate move the
same tells the operator nothing about which move is best, and must therefore
read zero everywhere — which every ratio formulation gets wrong, since a
uniformly large contribution takes a uniformly large share. It is also
signed, so a heuristic can be seen arguing *against* the examined direction
relative to its own baseline, and the per-direction relative impacts of one
heuristic sum to zero across the candidates by construction, which makes the
column self-checking. `#uniform-heuristic-has-zero-relative-impact` pins
exactly the case that discriminates the definitions.

**What "the heuristic's score for this candidate" *is*, under the committed
model.** The question the definition presupposes — one number per heuristic per
candidate — has an answer already, and it needed no new quantity. A candidate's
score is `worst-case-statemap`'s minimum, across the active worlds, of the
whole-portfolio weighted sum; the world achieving that minimum is recorded, tie
broken deterministically; and the record carries each heuristic's output *in that
world* with the weight in force when the score was computed. So the per-heuristic
per-candidate quantity is **the heuristic's weighted output in that candidate's
own worst-case world** — defined for every pair by `total-heuristic-coverage`,
and exactly decomposing the candidate's score, which `#per-direction-coherence`
and `#contributions-sum-to-the-recorded-score` both pin.

The consequence a reader should not mistake for a defect: **the candidates'
contributions are measured in different worlds.** Each candidate has its own
worst case, so heuristic *h*'s number under one candidate and under another come
from two different simulated futures. Centring across them is still the right
arithmetic, because each term is what *h* contributed to the score that candidate
actually received, and those scores are what the ranking compares. Averaging *h*
within a single world instead would centre against a baseline no candidate was
scored against, and the resulting column would not sum back to anything the
operator can see. The alternative reading — a per-heuristic aggregate over the
branches that heuristic itself nominated — would require re-authoring
`worst-case-statemap`, `reactive-inputs` and `score-composition`, and would
invalidate the record's "output in that worst-case world"; it was considered and
declined for that reason.

**The recording side is where this could have bitten, and it does not.**
Centring needs the heuristic's weighted contribution for *every* candidate
direction, not only the examined one. `computed-display-state` records per
**candidate direction** — its score, its worst-case world, and its
per-heuristic entries — so a snapshot already carries every term of the
mean, and the column is computable from the one snapshot the breakdown is
explaining. That is what keeps
`published-slots-only#no-client-recomputation` satisfied: arithmetic over
values the record carries is not re-evaluation, and because the inputs are
one snapshot's bytes, the live view and a later replay of that snapshot
compute the identical column. Had the record been per-decision rather than
per-direction, relative impact would not have been derivable and the
requirement would have had to grow a second recorded quantity.

**One genuine gap did have to be closed, and it is the producer's, not the
record's (author-corrected, 2026-07-28).** The record said "one entry per
heuristic that contributed to that score", which left it legal for a heuristic
to appear under one direction and be absent from another — and a mean over a set
with holes is not the author's mean; a consumer would have to invent a value or
silently shrink the denominator per heuristic. The first fix was authored here,
as a clause requiring the *record's* heuristic set to be uniform across its
directions. That was the wrong home. A record can only write down what it is
handed, so an obligation the producer does not carry is one the record cannot
discharge: a writer that was free to compose a candidate's score without a given
heuristic would have to fabricate an entry to satisfy the clause, which is worse
than the hole it was meant to close.

The obligation now lives on the heuristics, where the author put it:
`bot-framework/total-heuristic-coverage` requires every heuristic in a snake's
portfolio to answer every candidate direction with a concrete value, and makes
that cheap rather than onerous by letting an uninterested heuristic answer over
the partial state in which only the evaluated snake has advanced. This
capability therefore *cites* that requirement — the edge already runs in the
right direction, `decision-transparency` declaring `bot-framework` — and keeps
only a recording clause of its own: the record keeps every heuristic it was
handed for a direction, at one scoring-time weight per heuristic for the whole
snapshot. Uniformity across directions is then a consequence stated as such, not
a constraint the record invented about a producer it does not own.
`#the-same-heuristics-under-every-direction` survives as the check an
implementer optimising away "empty" entries would trip, now phrased as recording
fidelity rather than as an independent rule. The zero case above stays provable:
one weight per heuristic per snapshot means a constant *output* across
candidates gives a constant contribution, hence zero relative impact.

**What breaks if reversed.** Reverting to a ratio makes the column say a
heuristic that cannot distinguish the moves is the most important thing on
the table — the opposite of what an operator reads it for — and reintroduces
the sign and near-zero-score pathologies that stalled the decision. Letting a
heuristic abstain from a candidate is subtler and worse: the table still
renders, each row's arithmetic still appears to close, and a heuristic that
answered three of four candidates has its relative impact centred on a
denominator that silently disagrees with the column beside it — the operator
reads a number reconcilable with nothing on the page, and two clients that
shrink the denominator differently disagree about a snapshot neither of them
recomputed, violating the one-snapshot-one-rendering property this whole
capability is built on. Authoring the rule in *both* places is the third
failure mode and the one the corpus names explicitly: two owners of one
constraint, and the next edit to either drifts them apart with no lint able to
tell which copy is authoritative.

### The examined subject is a client-local lens, and holding is not it

Two defects shared one root. First, all three display requirements were
scoped to "the operator's **held** snake", but
`live-game-observation/coach-mode-interface` requires the team's private
panels for a coach who holds nothing, and
`replay-and-audit/replay-inspection` requires inspecting any snake on the
viewed team regardless of who held it — so the displays' own text excluded
two of their three mandated consumers, and legacy module 08's explicit
inspection layer (the client-local affordance those two capabilities
inherited) had no home in this capability at all. Second,
`worst-case-preview` keyed off the direction the operator had *picked* —
which `operator-control/board-and-move-interface` defines as immediately
staged — while `decision-breakdown` keyed off which direction was
*examined*. Collapsing those into one control would make idly comparing
directions a sequence of real staged moves; keeping them separate without
naming the second one leaves a selector nothing owns.

Both are fixed by minting `examined-subject`: an explicitly client-local,
never-persisted selection of at most one readable snake and at most one of
its candidate directions, independent of holding, that selects *what is
explained and never what is done*. The three displays are then
parameterised by (snake, direction, snapshot) and coach mode and replay
inspection are in scope by construction rather than by exception — neither
capability can be named here anyway, since `live-game-observation` sits
upstream of `operator-control` and would cycle, and `replay-and-audit` sits
downstream. The operator's ergonomics survive intact:
`#operator-pick-also-examines` keeps the legacy one-gesture behaviour by
making a staging pick *also* set the examined direction, rather than by
making examination stage.

Why never persisted: `extensible-state-slots` admits exactly two recorded
slots, and an examined direction is in neither. A persisted examined
direction would either need a third slot — breaking the platform-wide
uniformity that makes novel bot logic replayable — or be smuggled into the
selection record, where every consumer that reads "what the team did"
would find a lens recorded as a decision. Because it is client-local, it
also needs no authorization rule of its own: read scope already bounds
which snakes a viewer may examine
(`global-invariants/team-private-centaur-state`), and writing nothing means
there is nothing further to guard.

What breaks if reversed — (a) re-scoping the displays to the held snake:
coach mode and replay must reimplement the same three panels against the
same record, doubling every rendering rule and guaranteeing the two copies
drift; (b) making the examined direction the staged one: examining a
direction is a game action, so an auditor scrubbing a replay would be
staging moves, a coach would be steering the team they may only watch, and
an operator comparing four directions would have staged four times, with
the last comparison silently becoming the move if the turn resolved
mid-thought.

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
- **Minted: the scoring-time weight and label travel inside the record**
  (`computed-display-state#weights-and-labels-are-recorded-not-joined`,
  `decision-breakdown#contributions-sum-to-the-recorded-score`,
  `#weight-edits-do-not-rewrite-the-past`) — the "helpful" implementation
  is a live join against the portfolio record, which compiles, looks
  correct in a static test, and only misreports once someone edits a
  weight or replays an old snapshot.
- **Minted: the examined selection is never persisted and never acts**
  (`examined-subject#never-persisted`, `#examining-is-not-acting`) — a UI
  that "remembers where you were looking" by writing it to the selection
  record turns a lens into a recorded team decision; one that reuses the
  staging affordance to change the examined direction turns browsing into
  play.
- **Minted: no second surface may nominate a direction to the game**
  (`operator-control/board-and-move-interface#no-second-direction-selector`,
  authored in that capability's own change) — the dual of the above, from
  the staging side.
- **Minted: transparency decorates controls, never gates them**
  (`scored-direction-display#display-decorates-never-gates`) — a display
  layer that disables staging while scores are absent would let a
  framework outage take the *human* controls down with it.
- **Checked, owned by dependencies**: every heuristic answers every candidate
  direction with a concrete value
  (`bot-framework/total-heuristic-coverage`) — cited, not restated, and the
  record's uniform heuristic set across its directions is inherited from it
  rather than legislated here; undefined stateMap entries are
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
