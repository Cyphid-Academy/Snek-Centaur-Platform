## Context

Migration change minting `live-game-observation` from legacy modules 02,
03, 04, 05, 06, and 08 (39 ids, 9 review items), per the author-approved
capability map, dependency DAG (game-engine + identity-and-authorization),
and assignment matrix. Legacy text is binding source material; the
module-02 parked ledger's drafted text for 02-REQ-009/010 was used as a
starting point. This file records the decisions a future reader cannot
recover from the specs alone.

## Decisions

### The invisibility cluster is one rule with a time dimension

Three legacy modules each restated the invisibility filter at their own
runtime's seam (the platform-architecture statement, the
per-connection-admission statement, the runtime data-layer statement), and
two more ids covered its historical and boundary behaviour. Authored here
as exactly two requirements: `invisibility-filtering` (who is filtered,
what is hidden, what stays observable) and
`visibility-transitions-and-history` (when the filter's answer changes and
that history reads under the same filter). The enforcement-locus principle
— security enforced at the data layer, outside any client library — is not
restated: `global-invariants/security-enforced-outside-the-library` already
owns it, and `filtered-views-are-the-only-surface` cites it as the rule its
own view-shaped enforcement discharges; what is authored here is the
invisibility feature's own visibility semantics. The other half of the
integration is who counts as "bound to the owning team": that reader
partition is team-granular, and a spectator holds no team's private state,
by `global-invariants/team-granularity-authorization` — cited in
`invisibility-filtering` rather than re-derived, because the intersection
semantics below would be incoherent if a connection could be bound at any
finer or looser grain than a team. What breaks if reversed
(three parallel restatements kept): the copies drift exactly as the legacy
corpus's did, and the scrub-safety and boundary-transition edge cases —
each carried by exactly one scenario now — lose their single home.

### Spectators are opponents of every team (intersection semantics)

The resolved legacy ambiguity: a team-unbound observer could plausibly see
the union of team views (invisibility as a team-vs-team mechanic only) or
the intersection (invisibility hides from everyone outside the owning
team). The author resolved intersection, and the delta pins it in
`invisibility-filtering#spectators-are-opponents-of-every-team`. Reversed,
invisibility's tactical value halves: any player could open a spectator
session in a second tab and see every "hidden" snake, making the potion a
placebo. The same posture makes the coach case coherent — a coach is
bound to a team and sees what that team sees, while a spectator is bound
to none and sees what no team's secrets include.

### Atomic turn delivery authored once; delivery order deliberately unguaranteed

The atomic-delivery cluster (single transaction, single logical update, no
pre-commit delivery) collapses into `real-time-committed-delivery`: the
three legacy statements were one guarantee viewed from the writer's, the
subscriber's, and the negative side. The resolved legacy review posture on
event ordering is kept: a turn's events are a *set*; the canonical order
is a property of the stored representation, and no delivery-order
guarantee exists — encoded as
`observation-use-cases#canonical-order-is-read-not-delivered`.

The atomicity half is not this capability's achievement: it is deliverable
only because turn resolution commits all-or-nothing inside the instance's
reducer transaction
(`global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic`),
which `real-time-committed-delivery` therefore cites. This capability adds
the observation-side consequence the invariant alone does not state — that
no subscriber sees intermediate pipeline state, and that the commit reaches
subscribers as one logical update rather than as separately-visible parts.
What breaks if reversed: promising delivery order would bind the
subscription infrastructure to an ordering it cannot cheaply provide, and
clients built
on delivery order would render nondeterministic animations the moment the
infrastructure reorders; conversely, dropping the atomicity guarantee lets
observers see snapshots without their events (torn turns), which every
animation and narration consumer downstream assumes cannot happen.

### Filtered views are the only client surface (constraint-mined)

The legacy Design routed every client read through purpose-built filtered
views rather than raw tables — and every filtering requirement silently
depends on that: a single raw-table subscription path would bypass the
invisibility filter, the aggregate-only scoreboard posture, and the
team-privacy boundary at once. That is precisely an invariant a future
implementer could silently violate (expose one convenient raw table for a
new feature), so it is minted as
`filtered-views-are-the-only-surface`, minimally constraining: any
server-side view mechanism satisfies it.

Its integration with the invariants it sits on is the whole of its content
beyond the view shape itself, so the requirement cites rather than restates
both halves. *That* enforcement lives outside any client and holds against a
raw-protocol speaker is `global-invariants/security-enforced-outside-the-library`;
what this capability adds is *where* — in purpose-built views, so a new
observable datum cannot arrive as a raw-table read path. The generic
"assuming no client cooperation" clause and the "rather than hidden by a
cooperating client" contrast were therefore dropped from the requirement and
the scenario: they were the invariant restated, and the scenario now states
only the local fact that the bypasser reaches the same views and was never
delivered the withheld data. *That the views are the whole surface* — the
completeness claim the visibility rules actually rest on — depends on no
second store holding a live game to read instead
(`global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game`):
relax that and a client could read a live game out of Convex, leaving every
filter in this capability enforcing nothing. Reversed, every visibility rule
in this capability becomes advisory.

### The scoreboard is the sole aggregate authority

The resolved legacy reviews converged on one architecture: clients are
dumb readers; team-level aggregates are computed server-side over the
*true* alive set (including invisible snakes) and published through a
dedicated per-turn aggregate channel that every connection sees
identically; clients never aggregate per-snake data. Authored once as
`scoreboard-sole-aggregate-authority`, folding the runtime-side content
rule and the client-side prohibition into one requirement (they are one
posture — the prohibition is meaningless without the channel, the channel
pointless without the prohibition). Two refinements ride along from the
resolved reviews: rows are zero-filled for eliminated teams (absence would
itself leak information and break rendering), and the live score is the
normalised as-if-ended score per game-engine/scoring (par 1.0), not a raw
length count.

The same-transaction write is where this requirement leans on the
game instance's own transactional guarantees: an aggregate written with the
turn it summarises is exactly the instance-side case
`global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants`
covers, so the requirement cites it there and the
`#never-lags-the-snapshot` scenario no longer restates the mechanism —
it states only the observable consequence (no committed turn is ever
catchable with a missing or stale scoreboard). The division is deliberate:
gi owns *where the guard runs* (inside the reducer transaction that writes
the turn, not a later materialisation job), this capability owns *what the
row must contain and that it exists for every rostered team every turn*.
What breaks if reversed: client-side aggregation systematically
under-counts whenever an opponent snake is invisible — turning the
scoreboard into an invisibility leak detector (the aggregate dips exactly
when a snake goes invisible) *and* wrong — and per-connection scoreboards
reopen the divergence the single authority exists to close.

### UI-mirror requirements re-authored as "honours / never infers"

The legacy UI module restated the server-side filter and scoreboard rules
from the client's seat. Per the author's instruction, enforcement is
authored once (server-side), and the UI's obligations are authored as
honouring requirements: `ui-honours-the-filter` (never infer hidden state,
own-team invisibility indication only — the binding half of the legacy
effect-rendering id; the outline/shimmer styling itself is presentation
mechanism) and the `#client-aggregation-is-a-defect` scenario. The general
rule that a client presents only what the owning runtimes assert is
`global-invariants/client-truthfulness`, which `ui-honours-the-filter` cites
in place of its original "renders exactly what the filtered surface
delivers" opening: that opening was the invariant restated, and the narrow
local prohibition (don't infer hidden snakes from events, aggregates, or
gaps) is only *sufficient* because the general rule holds — relax it and
this capability would have to re-specify the whole client posture to keep
the filter honest end to end. Reversed —
parallel UI requirements restating server rules — the two copies drift,
and the genuinely client-side obligations (don't *infer* what the server
correctly withheld) get lost inside restatements of what the server
already enforces.

### Spectator eligibility stays deliberately deferred

The legacy review chain deferred all spectator eligibility policy (private
games, room-level visibility, issuance rate limits) out of the auth module
and no later module ever specified it. Per the author's direction this is
recorded as a deliberate deferral, not resolved and not faked: the
`spectator-access#eligibility-deliberately-open` scenario states that
authentication plus the game being in play are the *only* gates, and that
narrower eligibility arrives only by revising the requirement. Reversed —
leaving it unstated — the gap resurfaces as silent drift: an implementer
adds an ad-hoc restriction (or a rate limit that breaks legitimate
spectating) with no spec event marking the policy change.

### Up-front full-history subscription for the spectator timeline

The resolved legacy review chose up-front full-history subscription on
spectating entry over lazy historical fetching: games are bounded to a few
hundred turns, and bounded entry latency buys instant scrubbing with no
moving-window state machine. Kept as authored behaviour
(`spectator-timeline#upfront-history-no-lazy-fetch`) because it is
observable (scrub latency, entry behaviour), not just implementation.
Reversed, the client grows a prefetch state machine that stutters at
window borders — the worse experience the review explicitly rejected.

### Splits and the abstract coach-read authoring

- **The legacy server-side-filtering negative requirement** had three
  concerns: no client-side invisibility filtering (authored here),
  blocking staged-move reads (the operator story's substance — its
  own-team read policy is that capability's to state), and blocking
  attribution-metadata reads (owned by
  identity-and-authorization/admission-records-private). The id retires
  here as the matrix's owning row, with the split noted in its map entry.
- **The legacy read-scoping requirement** likewise split: its live
  team-scoping substance is `team-private-live-state`; its finished-game
  (replay) half and its team-configuration-access half belong to the
  replay and bot-configuration stories. Retired here as the owning row.
  The cross-team prohibition itself is not authored here: a team's
  Centaur-side working state being readable only by that team and the
  identities granted its read scope, for as long as the competition is
  live, is `global-invariants/team-private-centaur-state`, which
  `team-private-live-state` cites. What is local is the pair gi leaves
  open — that this capability's *filtered game view* is part of that
  private context, and that the read-scope holders at the live-game
  boundary are the team's members, its designated coaches, and admins as
  implicit coaches — so the requirement now names the holders and their
  read parity instead of re-deriving the exclusion, and
  `#cross-team-reads-denied` carries the increment gi does not imply:
  coach standing is bound to the designating team and reaches no other.
- **The legacy coach-role requirement** enumerated bot-side state kinds
  (heuristic configuration, portfolio state, stateMap snapshots …) that
  this capability's declared dependencies do not reach — and extending the
  dependencies to reach them would be the wrong fix, since the bot-side
  vocabulary belongs to the bot stories. It is authored
  abstractly — "team-private live state": the team's filtered view plus
  the team-scoped working state around its play, whose kinds gi's
  `team-private-centaur-state` enumerates once. That is also the more
  durable statement: any future team-private live datum is automatically
  inside the boundary. Reversed (enumerating bot vocabulary), the DAG
  inverts and every new team-private datum needs a spec edit to be
  protected.
- **Coach designation** (who grants coach standing, where it is stored) is
  the team story's; **coach admission terms** are
  identity-and-authorization/coach-tokens; what is authored here is what
  the admitted coach *sees* — read parity with members, live-boundary
  meaningfulness, and the coach-mode interface with client-local
  inspection.

### Transport neutrality

The legacy corpus bound clients to a specific wire transport in passing;
that binding is mechanism. The behaviour that matters — committed state is
pushed to subscribers in real time, no polling — is authored; the
transport, subscription-channel implementation, and reconnection mechanics
stay in code with rationale here. Reversed, the spec would freeze a
transport choice that the real-time guarantee does not actually depend on.

## Constraint-mining (mandatory final step)

- **Minted: `filtered-views-are-the-only-surface`.** Every visibility rule
  in this capability assumes no client read path exists outside the
  filtered views (see the dedicated decision above).
- **Minted as scenario:
  `scoreboard-sole-aggregate-authority#never-lags-the-snapshot`.** The
  observable claim is that no committed turn is ever catchable with a
  missing or stale scoreboard — otherwise "sole aggregate authority"
  quietly pushes clients back toward self-aggregation during the gap, and a
  future implementer could easily materialise the scoreboard
  asynchronously "for performance". The *guard placement* that makes it
  hold — the aggregate written inside the reducer transaction that writes
  the turn it summarises — is owned by
  `global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants`,
  now that the invariant covers a game instance's own records and not only
  Convex's; the requirement cites it instead of restating it.
- **Checked, owned by an invariant: the atomic-delivery ground.** "Either
  the whole committed turn is observable or none of it" is not achievable
  by the observation surface on its own — it is the observable face of
  `global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic`,
  cited in `real-time-committed-delivery` rather than re-minted here.
- **Checked, owned by a dependency: the coach/operator distinction in the
  credential.** A coach connection must be distinguishable from an
  operator connection at admission — otherwise read parity would bleed
  into write parity. That is already pinned by
  identity-and-authorization/game-token-contents (the subject encodes the
  role) and role-bound-privileges (spectator/coach connections refused by
  every mutating operation); nothing is re-minted here. The observable
  residue on this capability's side — coach mode never presents or behaves
  as an operator — is authored in `coach-mode-interface`.
- **Checked, already requirements**: no-client-aggregation and scrub-safe
  historical filtering are authored directly; the no-cooperating-client
  posture is `global-invariants/security-enforced-outside-the-library`,
  cited from `filtered-views-are-the-only-surface` (which adds only the
  view-shaped locus of enforcement).
- **Checked, plastic**: subscription-channel implementation, indexes
  backing view queries, the entry-latency profile of the up-front history
  subscription, and invisibility-indicator styling are mechanism —
  doc comments citing this change suffice when they land.
