## Context

Migration change minting `bot-framework` from legacy module 07 (37 authored
ids, 11 note-only mechanism ids, 5 review items), per the author-approved
capability map, dependency DAG (game-engine + operator-control), and
assignment matrix. Legacy text is binding source material. This file
records the decisions a future reader cannot recover from the specs alone —
above all the mechanism boundary, since this module is where the corpus's
"mechanism belongs in code" rule does the most work.

## Decisions

### The mechanism boundary: observable contract in spec, machinery in code

The legacy module specified its internals as numbered requirements: the
append-only simulated-world cache and its normalised-output records
(024–026), the lattice of foreign-move combinations (027), per-(snake,
direction) priority weights with rank decay (028), the anytime
Dijkstra-like traversal (029–031), round-robin/breadth-first scheduling
details (041), cache-based rescoring and enqueue mechanics (042–043), and
the no-re-simulation half of branch activation (021). The author resolved
that these are mechanism: none is a promise an author, operator, or
downstream capability binds to — they are *how* the observable contract
(reactive inputs, activation predicate, worst-case stateMap, anytime
decisions) is delivered efficiently. Per demoted cluster, the justification
and what the spec retains instead:

- **Cache and normalised outputs (024–026)**: the observable truths are
  that evaluation work within a turn only grows (`turn-scoped-evaluation`),
  that dormant worlds reactivate rather than being discarded
  (`reactive-inputs#dormant-worlds-reactivate`), and that a zero weight
  silences a heuristic exactly (`score-composition#zero-weight-silences` —
  the behavioural residue of weights-applied-at-scoring-time). Whether
  those truths are delivered by a per-direction world map with
  weight-independent cached outputs is the implementation's business; a
  different memoisation delivering the same observables is legitimate.
- **Lattice, priority weights, traversal (027–031, 041)**: these define
  *which world gets simulated next* — pure compute-ordering heuristics.
  The observable residue kept as spec: anytime partial results are usable
  (`softmax-decision#partial-statemap-is-decidable`), no owned snake is
  starved (`attention-tiers#manual-snakes-still-served`), and the tier
  ordering itself. The rank-decay constant, heap discipline, and
  breadth-first-on-rank-0 property are plastic performance choices —
  doc-comment territory with a `// design:` reference here.
- **Rescoring/enqueue mechanics and the no-re-simulation half of 021
  (042–043)**: "toggling never re-simulates" and "rescoring reads the
  cache" are efficiency properties of the machinery. What implementers
  must not silently break is captured observably: activation is a
  predicate over current inputs, evaluated work survives input churn, and
  only actual entry changes raise the dirty flag.

What breaks if reversed (authoring the machinery as requirements): the
spec freezes a specific cache and traversal design as API, so improving the
scheduler or replacing the lattice becomes a spec change with RENAMED/
REMOVED ceremony for behaviour no consumer can observe — the exact failure
mode the four-layer knowledge model exists to prevent.

### Temperature is an opaque portfolio scalar (the cycle-break)

The portfolio requirement names one effective softmax temperature per
snake; the softmax requirement consumes it; nothing here derives it. The
legacy module derived it (override-else-team-default) from configuration
state — but the configuration capability sits *above* this one in the DAG
(it configures the vocabulary this capability defines), so authoring the
derivation here would either invert the DAG or force a cycle. The author
resolved: `bot-framework` owns the scalar's meaning (sampling divisor,
opaque, reactive at next use — `per-snake-portfolio#temperature-is-opaque`);
the configuration story owns its sources and derivation. What breaks if
reversed: either a dependency cycle (lint-fatal) or this spec citing
downstream vocabulary, and every future configuration-side change to
temperature sourcing would ripple into this capability's spec despite
changing nothing the framework observes.

### Submission, snapshots, and portfolio mutation phrased abstractly

Three adjacent workflows touch the same machinery and are deliberately not
authored here: *when* decided moves are staged (the scheduled/final
submission passes — pacing story), *when* display snapshots are written
(transparency story), and *how* portfolios are initialised and mutated
(configuration story). This spec supplies the shared vocabulary those
stories bind to — the softmax decision, the dirty flag, the portfolio —
and phrases its own text abstractly ("when the framework decides a move",
never "on the scheduled submission pass"). What breaks if reversed: this
capability would cite capabilities above it in the DAG, and the pacing
story's tunable cadence would fossilise inside the decision engine's spec.

### Author fault containment is a requirement, not a code nicety
### (constraint-mined — the routed lead)

Heuristics are authored by inexperienced developers, often with AI
assistance; the legacy Design is explicit that a thrown author exception
must not crash the worker or the coordinator. That is precisely an
invariant a future implementer could silently violate — an unguarded
`heuristic.reward()` call compiles, works for correct heuristics, and
kills the team's player the first time a beginner's Drive throws. Minted
as `author-fault-containment`: boundary validation with clamp/substitute
semantics, contained exceptions
(`#thrown-exception-is-contained`), no invalid value ever reaching
scoring/sampling/staging/written state, and structured per-turn-deduped
process-log reporting (`#log-noise-is-bounded` — the resolved legacy
review confined violations to the server log, off the operator UI). What
breaks if reversed: a single broken heuristic — the platform's most
predictable failure mode — takes down every snake of every hosted team in
the process, and the author gets a crash instead of a named, deduplicated
diagnosis.

### Frozen snakes: behaviour minted, wrapper composition kept mechanism
### (constraint-mined — the routed lead)

The legacy Design implements freezing by a thin `resolveTurnFrozenForeign`
composition over the shared engine's turn resolution — explicitly *not* a
modification to the engine. Constraint-mining verdict: the invariant that
implementers could silently violate — "there is exactly one shared engine;
no parallel variant of the rules" — is already owned by
`global-invariants/one-shared-engine`, so re-minting it here would
duplicate a cross-cutting rule (and this capability could not cite it
anyway). What this change mints instead is the *behavioural* content the
wrapper exists to deliver: frozen-in-place semantics for out-of-interest
snakes (`foreign-snake-treatment`), the per-snake turn timestamps that
make the fiction detectable (`frozen-snake-timestamps#staleness-is-readable`),
and the head-start compensation contract on consumers
(`#head-start-compensation`, from the resolved temporal-head-start
review). The wrapper-not-fork choice itself stays mechanism with a
`// design:` reference to this change. What breaks if the compensation
contract is dropped: every territory-style analysis silently favours the
moving snakes by one step, biasing all scores against exactly the
opponents the snake has no Drives about — a subtle, systematic mis-scoring
no test of the engine would catch.

### Teammates are foreign; only human intent commits

The legacy module's most counter-intuitive stance is kept and centralised
in `foreign-snake-treatment`: teammates are lattice-foreign
(`#teammate-is-not-self`), a manual teammate's staged move commits only
when it intersects the evaluator's interest map (the resolved
out-of-interest review: an uninteresting staged move adds no explored
alternative — `#uninteresting-staged-move-freezes`), and an automatic
teammate's framework-staged move never commits it
(`#automatic-teammate-stays-uncommitted` — the legacy rationale: a bot's
rolling best-guess changes too often to be a constraint; only deliberate
human staging is intent). What breaks if reversed: treating the bot's own
staged guesses as commitments couples sibling evaluations into feedback
loops (A plans around B's guess, B's guess shifts, A's plan is stale), and
joint optimisation of teammates is a different, unbuilt product — depth-1
worst-case scoring is only coherent when every other snake is adversarial
or committed.

### The stateMap contract: worst-case over active worlds, undefined is absent

`worst-case-statemap` + `score-composition` carry the scoring semantics:
min over currently active worlds, linear weight composition with the
terminal-reward override, dirty flag on actual change only, and — minted
as an explicit edge (`#undefined-is-not-zero`) — entries stay *undefined*
until a first active world exists, and softmax excludes them
(`softmax-decision`). What breaks if undefined defaulted to zero: on the
[−1, 1] scale zero is a *good* score, so unevaluated directions would
outcompete evaluated dangerous ones, and early-turn sampling would
systematically prefer ignorance; the resolved partial-stateMap review
(anytime sampling is legitimate) only works because absence is honest.
The depth-1 horizon (`#one-turn-horizon`) is authored as binding MVP
scope: consumers (worst-case previews, decision tables) are built on
"one resolved next turn", and silently deepening the tree would change
score meanings under them.

### Turn-scoped, reconnect-safe evaluation lifecycle (constraint-mined)

`turn-scoped-evaluation` mints the two lifecycle edges from the resolved
same-turn-reconnect review: the observed turn number changing is the *only*
reset, and a reconnection resurfacing the same turn clears nothing
(`#reconnect-same-turn-keeps-work`). What breaks if reversed:
clear-on-reconnect turns every network blip into a cold start at exactly
the moment (mid-turn, clock running) the team can least afford one; and
any reset trigger other than turn change lets stale worlds from an old
board leak into a new turn's scores (`#turn-change-is-the-only-reset`).

### Attention tiers and selection promotion split from operator-control

The tier ordering (040) is authored at intent grain — automatic first,
selected-manual second, unselected-manual last, no starvation — and the
promotion behaviour (051–054) binds to operator-control's selection state
(`exclusive-selection`), never stages (`#promotion-never-stages`, aligning
with `selection-is-view-only`), and preserves an existing operator-staged
move (`#staged-move-survives-promotion`). 040's inclusion follows the
assignment matrix (it is assigned `bot-framework`; the tier vocabulary is
what promotion ranges over) even though the round-robin internals beside
it (041) are demoted. What breaks if promotion staged a move: selecting a
snake would *play* it — the exact inversion of the view-only selection
contract the operator capability just minted — and an operator's staged
move could be silently overwritten by the act of looking at the snake.

### The write-channel and state boundaries as behaviour

`embedded-team-player` and `observe-and-stage-only` carry the boundary ids
(001, 005, 057–060) at intent grain: subscriptions in, staged moves for
automatic snakes the sole game write, no Convex caching of game state, no
mutation on operators' behalf, no framework-private persistence
(`#restart-rebuilds-from-subscriptions` — the crash-recovery contract).
What breaks if reversed: a framework-private store or shadow board creates
a second source of truth that survives restarts wrong; mediating operator
mutations makes the framework a hidden authority the audit trail cannot
attribute; and any game write beyond staging would breach the
authority placement the cross-cutting rules pin.

## Constraint-mining (mandatory final step)

- **Minted: author exceptions and invalid outputs are contained at the
  boundary** (`author-fault-containment`, all three scenarios) — the
  routed lead.
- **Minted: head-start compensation on frozen-snake consumers**
  (`frozen-snake-timestamps#head-start-compensation`) plus timestamps as
  the readable staleness signal (`#staleness-is-readable`) — the routed
  lead's behavioural half; the wrapper-composition half stays mechanism,
  its invariant already owned by `global-invariants/one-shared-engine`.
- **Minted: undefined stateMap entries are absent, never zero**
  (`worst-case-statemap#undefined-is-not-zero`,
  `softmax-decision#partial-statemap-is-decidable`).
- **Minted: retirement anchored to the authoritative board only**
  (`drive-satisfaction#simulated-satisfaction-does-not-retire`).
- **Minted: same-turn reconnect clears nothing; turn change is the only
  reset** (`turn-scoped-evaluation`, both scenarios).
- **Minted: automatic teammates never self-commit**
  (`foreign-snake-treatment#automatic-teammate-stays-uncommitted`).
- **Minted: dirty flag only on actual change**
  (`score-composition#unchanged-scores-set-no-flag`) — spurious news
  would make downstream snapshot/submission consumers thrash.
- **Minted: promotion never stages; staged move survives promotion**
  (`selection-promotion#promotion-never-stages`,
  `#staged-move-survives-promotion`).
- **Minted: lethal directions are last-resort, never absent**
  (`candidate-directions#all-lethal-still-decides`).
- **Checked, owned by dependencies or cross-cutting rules**: manual-mode
  snakes never framework-staged (operator-control/manual-mode, retired via
  the operator-control change); one shared engine, no parallel variant
  (`global-invariants/one-shared-engine`); no cross-team state access
  (global-invariants, retired via the extend-global-invariants change).
- **Checked, plastic (mechanism, doc-comment territory)**: the rank-decay
  constant and priority formula, the lattice and heap discipline, the
  worker-pool topology and message protocol, back-pressure bounds, the
  memoisation layout of normalised outputs, and the randomness source for
  sampling — code citing this change's archive folder suffices when they
  land.
