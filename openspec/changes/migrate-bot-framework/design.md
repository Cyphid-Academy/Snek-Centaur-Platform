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

**Corollary — `score-composition` is deliberately not amended to describe the
recorded snapshot (reviewed 2026-07-28).** The transparency story's breakdown
needs, per candidate direction, each heuristic's scoring-time weight and output;
`decision-transparency/computed-display-state` already requires exactly that of
the record — "the portfolio weight in force at the moment the score was computed",
per candidate direction, self-sufficient against later configuration drift — and
that obligation falls on whoever writes the record, which is this framework. It
therefore already binds the producer to capture at composition time rather than
re-read a portfolio at publish time. Restating it here would be the DRY failure
the spec rules name explicitly: a duplicate with no authority that drifts into
conflict, placed in the capability that does not know what the *record* is for.
The declared edge already exists in the correct direction
(`computed-display-state` declares `score-composition`). What breaks if reversed
(restating it here): two requirements own the recorded shape, and the next edit to
the record's contents updates one of them.

### The dirty flag's lifecycle: set here, cleared by the stager

Three capabilities share the dirty flag — this one raises it, the pacing
story's submission passes act on it, the transparency story's snapshots are
published on it — and the original delta minted only the *setting*, leaving
"when does it go down" owned by nobody. A flag with two consumers and no
clearing owner is the classic double-consume bug: whichever consumer clears
it first silently starves the other.

Resolved by giving the flag one owner (this capability, which defines it)
and one clearer (the workflow that stages the snake's decided move, on the
staging acknowledgement). `score-composition` now states both halves, so
the lifecycle is complete on the page that defines the flag, and the pacing
story authors the clearing act itself. The negative half is the load-bearing
one and is stated here as well: publishing a snapshot of decision state
does **not** clear the flag (`#publishing-does-not-consume-the-news`).
Snapshots are published far more often than moves are staged, so a snapshot
that consumed the news would routinely wipe it before the submission pass
ran — the snake would keep a stale staged move for a turn it had already
rescored. Reporting news is not consuming it.

This capability cannot declare the dependency in the other direction: the
pacing story sits above the framework in the DAG, so `score-composition`
names the concept ("the workflow that stages the snake's decided move")
and the identifier lives on the pacing side. Turn change is not an
exception to "only the stager clears": the turn reset discards the flag
along with every other piece of per-turn scratch, which
`turn-scoped-evaluation` already owns — hence the clearing rule is scoped
"within a turn".

What breaks if reversed (no owner, or clearing on snapshot): either every
consumer clears it and news is lost to whichever consumer ran first, or
none does and the flag latches on for the turn, making
`#unchanged-scores-set-no-flag` pointless — the submission pass re-rolls
and re-stages every automatic snake on every pass, which is exactly the
churn the flag exists to prevent.

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
review confined violations to the server log, off the operator UI).

The choice of destination is safe rather than merely convenient: a
violation entry carries heuristic internals (the offending heuristic, the
raw value), and the hosting process's log is visible to exactly the Server
operator, who under `global-invariants/server-trust-boundary` is already
understood to see every hosted team's strategy and state. So the diagnostic
never has to enter Centaur state, where it would fall under
`global-invariants/team-private-centaur-state` and need read-scope
authorization to be legible to the team at all. Relax the trust boundary —
make a Server operator someone a team's strategy must be kept from — and
the process log becomes a leak channel, at which point the diagnostic would
have to be routed as team-scoped Centaur state instead.

What breaks if reversed: a single broken heuristic — the platform's most
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
duplicate a cross-cutting rule. What this capability does instead is
*depend* on it: `frozen-snake-timestamps` cites it, because the
frozen-in-place fiction — and with it the entire head-start compensation
contract — exists only because every simulated turn is resolved by the one
shared engine, which advances every snake, instead of by a forked variant
that could model a snake simply not moving. Relax that invariant and the
requirement has nothing left to compensate for. What this change mints is
the *behavioural* content the wrapper exists to deliver: frozen-in-place semantics for out-of-interest
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

### Simulated time: the team's live submission allocation, declared for everyone
### (constraint-mined)

The engine's resolution entry points require the turn's clock duration and each
team's burn (`revise-game-engine-contract`), so every simulated world has to declare them.
The choice is what to declare, and it is not free: the values decide when the
projected clocks empty, and therefore when a clock-driven loss or victory becomes
visible to the search at all. Four properties settle it.

**The value is an existing pacing parameter, not a framework constant
(author-corrected, 2026-07-28).** An earlier framing had the framework declaring
"its own per-turn deliberation limit", a constant it set for itself. That was
wrong twice over. It invents a second timing knob beside one the corpus already
has — `turn-pacing/live-pacing-parameters` carries, per game and per team, the
**automatic submission time allocation**: how long the team's automated player
deliberates before it auto-submits when no operator is in thinking mode,
initialised from the team's captured defaults and adjustable during play
(`bot-configuration/any-member-live-editing#game-scoped-parameters-need-no-captain`
makes any current member, the captain included, able to retune it live). And it
justified the number by the framework's own restraint, when the real
justification is better: this allocation is *the principled duration of a turn
nobody intervenes to lengthen*. Simulating with it is simulating the game as it
will actually be paced absent a human taking more time, which is exactly the
counterfactual a one-turn search is asking about. The framework therefore reads
the value; it does not own it.

**One value, for every team.** Whatever the number is, the framework declares it
for opponents and teammates too. That looks like an assumption and is in fact the
refusal of one: the framework has no information about anybody else's
deliberation, so a per-team estimate would be a claim about a team it declined to
model — precisely the failure that `game-engine/held-snakes` exists to prevent on
the positional axis. One visible, uniform number is auditable; five invented ones
are not. Nothing about re-sourcing the value changes this.

**A bound, not an average.** The value is what its own team's player will not
deliberate past before submitting, so its own simulated clock drains at least as
fast as the real one. The projection therefore reaches the end of its own clock no
later than the game does: it may warn a turn early, never a turn late. Declaring
an *average* instead — a smaller number, closer to typical — is the one error that
matters, because it lets a search conclude that time remains when it does not,
which is the same class of false safety as advancing an unmodelled snake in its
last direction. The bound holds under the new sourcing for a structural reason:
`turn-pacing/final-flush` arms the team's final submission from the smaller of
this allocation and the observed remaining time, so the allocation is precisely
the quantity the player is pacing itself to.

**Not the game's turn cap, and that is not merely taste.** Declaring the
configured maximum turn time instead would project every clock to empty within a
few turns, so every candidate would score as doomed and the stateMap would stop
separating one direction from another. A conservative projection is only useful
while it stays near enough to what will happen to discriminate. The old wording
made this a hard clause on the requirement ("SHALL be below the game's configured
maximum turn time"), which is no longer the framework's to promise now that the
number is an operator-tunable pacing value; the reasoning survives as
`#a-turn-cap-would-be-useless-not-merely-pessimistic`, and the natural bound is
`final-flush`'s minimum against the observed remaining time, which the game's own
per-turn cap already bounds.

**One allocation per turn — the collision with `reactive-inputs`.** Making the
declared duration live raises a conflict worth stating: `reactive-inputs`
enumerates *exactly three* reactive inputs and
`#nothing-else-is-reactive` says nothing else may move a snake's active-world set
or stateMap. A retune of the allocation mid-turn would move every simulated
world's clocks, hence its scores — a fourth reactive input by the back door, and
worse, a stateMap silently mixing worlds projected under two different durations.
`simulated-turn-timings` resolves it by *reading the allocation in force at the
turn's start and holding it for that turn* (`#the-turn-holds-one-allocation`): the
retune is live in the sense the author asked for — it is accepted immediately and
`turn-pacing/live-pacing-parameters#mid-game-retuning-is-live` has submission
cadence and deadline arming use it from their next scheduling decision — but the
turn's *simulations* are unaffected, and the new duration times the next turn's.
This keeps `reactive-inputs` intact with no amendment, keeps
`turn-scoped-evaluation`'s only-grows discipline true (nothing accumulated is
invalidated), and costs at most one turn of latency on a knob whose effect on a
one-turn projection is second-order anyway.

The residual asymmetry is worth stating rather than hiding: for *opponents'*
clocks and for the game's consumed duration the declared value is a floor, not a
bound — real turns can last longer than one team's submission allocation, and
another team's is very likely a different number — so those endings can arrive
earlier in the real game than in the projection. Their
absence from a simulated board is therefore not a guarantee, and a heuristic that
treats it as one is wrong in the same direction the rest of this design is careful
about. The honest reading is: the framework's own clock is projected
conservatively; everything else is projected optimistically, and the search's
worst-case discipline lives on the moves rather than on other teams' tempo.

This reads consistently with `frozen-snake-timestamps`: a frozen snake's fiction
is *positional*, which is exactly what its lagging timestamp records and what the
head-start compensation corrects. Its team's clock was never in doubt, so the
declared burn applies to it like any other — the same line the engine draws for a
held snake's potion timers. Nothing here closes Open Question 1: how much of the
staleness compensation the framework owns versus the author is still open, and
the answer will not change what a simulation declares about time.

**The dependency is deliberately undeclared, and that is a cycle, not an
oversight.** The value belongs to `turn-pacing` (the live game-scoped record) and
its captured default to `bot-configuration`, and **both of those capabilities
already declare `bot-framework`** — `turn-pacing`'s Purpose lists it, and
`bot-configuration`'s does too. An edge in the direction this requirement needs
would close a capability-grain cycle, which the graph forbids and the lint
rejects. So `simulated-turn-timings` declares nothing new and names the concept in
prose instead — "the team's live automatic submission time allocation" — which is
what the no-identifiers-in-prose grammar is for. This is the same cycle-break
already used twice in this capability: the effective temperature reaches the
framework as an opaque scalar it neither derives nor stores, and the dirty flag's
clearing is named as a concept with the identifier living on the pacing side. The
framework is downstream vocabulary that its configuration and pacing stories
consume; it reads their values without being able to point at them, and the
pointer lives on their side of the graph where it can.

**What breaks if reversed** (back to a private framework constant): the bot
simulates a turn length nobody is actually playing to, so the projection and the
real submission deadline drift apart with no signal — the search believes the
clock drains at one rate while the player empties it at another. Retuning pacing
mid-game then silently stops meaning what it says: the team submits sooner, and
the analysis that decided *what* to submit still thinks it had the old turn.
Worse, the constant is a second knob with no owner, no surface, and no default,
sitting beside a parameter the corpus already has. And in the fully reversed case
— no timings declared, or a placeholder — the engine cannot report a clock-driven
ending at all, so a bot plays into a lost clock exactly as confidently as into a
won position, and the failure looks like a heuristic tuning problem rather than a
simulator that was never told what time it is.

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
human staging is intent).

"Opponents are always uncommitted" is not a self-imposed handicap but a
consequence of two invariants, which the requirement cites for exactly that
reason: an opponent's staged move is masked from the team's filtered view
(`global-invariants/bot-compute-view-confinement#masked-state-stays-masked`)
and an opponent's *deliberation* — the bot-side intention behind it — is
private to that team while the game is live
(`global-invariants/team-private-centaur-state#opponent-cannot-read-deliberation`).
Relax either and an opponent's intentions become readable, at which point
narrowing their explored moves by an observed commitment would be the
correct model and the requirement's per-category commitment rule would be
wrong. What breaks if reversed: treating the bot's own
staged guesses as commitments couples sibling evaluations into feedback
loops (A plans around B's guess, B's guess shifts, A's plan is stale), and
joint optimisation of teammates is a different, unbuilt product — depth-1
worst-case scoring is only coherent when every other snake is adversarial
or committed.

### Drive retirement is deactivation in the working portfolio, never a write

The legacy text says a satisfied Drive is "retired from the snake's
portfolio", which reads as a deletion — and three things make that reading
untenable at once. `observe-and-stage-only` gives the framework exactly two
channels (subscriptions in, staged moves out), so it has no way to write
Centaur state at all; the configuration story's portfolio record is
explicitly never deleted by the platform, only by an operator; and
`embedded-team-player` makes everything the framework accumulates
process-owned scratch. Resolved: **retirement is deactivation within the
framework's own working portfolio** — the in-memory reading of the
portfolio it was handed — and nothing about it is persisted by anyone.

Three consequences follow and are all authored, so the two capabilities say
one thing rather than two:

- **Satisfaction is re-evaluated every turn, not latched.** The framework
  already discards and rebuilds its per-turn work on every turn change, so
  a retirement flag that outlived the turn would be the one piece of
  accumulated state with a different lifetime — and it could not survive a
  restart either, since nothing persists it. Making retirement a predicate
  over the current observed board removes the special case entirely:
  `#retirement-reverses-with-the-board` and `#retirement-writes-nothing`
  pin it. This also fixes a real hole in the deletion reading: a Drive
  targeting a snake that is momentarily "reached" would be gone for good,
  even though the same board a turn later no longer satisfies it.
- **The operator sees a satisfied Drive as inactive, not absent.** The
  configuration story's record already keeps an unresolvable-target Drive
  listed-but-inert; satisfaction is now the second member of that same
  "omitted from play" category, marked with its reason on the Drive list.
  One category, two causes, one operator affordance — and the operator
  keeps the only delete button.
- **Nobody persists it.** Not the framework (it cannot write), not the
  platform (its record changes only on an operator's edit), not a
  reconciliation job (there is nothing to reconcile — the state is derived).

What breaks if reversed (retirement as a persisted delete or a persisted
deactivation flag): the framework needs a Centaur-state write channel it is
specifically denied, which would also make it a hidden authority over state
an operator believes only they edit; a satisfied-then-unsatisfied Drive is
destroyed by a transient board state with no way back except the operator
noticing and re-adding it; and a mid-turn process restart either loses the
retirement or, worse, replays it against a board that no longer justifies
it.

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

That the framework may run the real turn-resolution algorithm over
arbitrarily many speculative worlds at all rests on
`global-invariants/authoritative-turn-resolution#server-simulation-is-not-authoritative`
— only the instance's own resolution commits — which the requirement cites.
Relax it (let an off-instance engine run produce committed state) and
continuous speculative rescoring becomes the most dangerous operation in
the platform rather than the framework's core loop.

### Every heuristic answers every candidate, and the shallow state is what makes
### that cheap (author-decided, constraint-mined)

The author's obligation, in his own framing: every heuristic must "come up with
a concrete aggregate score for every one of our candidate moves, even if they
may show very little interest in most branches in the tree within some of our
candidate moves". Two halves, and the second is what stops the first from being
onerous.

**The obligation.** `total-heuristic-coverage` requires a value from every
heuristic in the portfolio for every candidate direction the snake scores — a
number, each candidate, every time. Nothing in the delta previously *permitted*
a heuristic to skip a candidate; the defect was silence, and silence is enough,
because the natural implementation of an uninterested heuristic is an early
return. `score-composition` already summed over the whole portfolio, so no
existing rule had to be corrected — the coverage obligation is what that
summation was quietly assuming, stated where an implementer can see it.

**The escape hatch, which is the interesting half.** A heuristic uninterested in
what other snakes do under a candidate owes no simulation of their replies: it
may be evaluated over the partial state in which only the evaluated snake has
advanced and every other snake is held — exactly the shape the engine's
imagining entry point yields, so this costs the framework no new machinery. The
consequence is that coverage is not a cost model at all: answering every
candidate costs at worst one shallow resolution per candidate, and a heuristic's
selectivity moves from *which candidates it answers* to *how much of the
branching it asks to see*. Depth is where a heuristic spends; breadth is what it
owes.

**Why this reconciles with per-world composition.** A world's score is the
weighted sum of the portfolio's values *for* that world, and a heuristic that
nominated no foreign moves under a candidate cannot tell that candidate's worlds
apart — so its shallow value stands as its value for each of them. The
requirement says so explicitly, which is what keeps the worst-case minimum
well formed: a heuristic evaluated shallowly contributes a constant across the
candidate's worlds rather than a hole in some of them. (The one-word edit from
"its value in that world" to "its value for that world" in `score-composition`
carries this; a value produced over a shallower state the world extends is still
that heuristic's value for the world.)

**The staleness connection is real and is left open.** A state in which only the
evaluated snake has advanced is the *maximal* staleness case the head-start
compensation contract governs: every other snake lags by a full turn.
`#the-cheapest-evaluation-is-the-stalest` says so, so the two rules are read as
one story rather than as a cheap path that quietly escapes the expensive rule.
This makes Open Question 1 sharper — the staleness-aware primitives are most
needed by the evaluations least willing to pay for depth — and settles nothing
about it: what shape those primitives take, and how much of the compensation the
framework owns versus the author, is still that question's.

**Coverage is per *scored* candidate, not per enumerated one.** A direction with
no evaluated active world has no entry at all
(`worst-case-statemap#undefined-is-not-zero`), and that stays true: the coverage
rule closes holes in the *heuristic* dimension, never in the direction
dimension. The transparency record's mean therefore ranges over the directions a
snapshot carries, which is what its own scenario already pins.

**What breaks if reversed** (a heuristic may abstain from a candidate): the
downstream mean is taken over a set with holes. A heuristic that scored three of
four candidates has its relative impact computed against a denominator that
silently disagrees with the column beside it, and the operator reads a number
that cannot be reconciled with anything on the table — not with the score, not
with its neighbours, not with a second client that shrank the denominator
differently. Nothing errors, nothing renders wrong, and the arithmetic appears
to close per row. The alternative fix — legislating uniformity on the *record*
— was rejected because it puts a constraint about heuristics in the capability
that only writes them down: the record would be obliged to carry a set the
producer was free not to produce, which is unsatisfiable rather than merely
duplicative. And reversing only the escape hatch, keeping the obligation, is the
worst of both: coverage then means a heuristic must simulate every foreign
reply under every candidate it does not care about, so the cheapest way to obey
is to return a constant zero — a value that is not an opinion, contributing
noise to the worst-case minimum, and indistinguishable in the record from a
considered one.

### Turn-scoped, reconnect-safe evaluation lifecycle (constraint-mined)

`turn-scoped-evaluation` mints the two lifecycle edges from the resolved
same-turn-reconnect review: the observed turn number changing is the *only*
reset, and a reconnection resurfacing the same turn clears nothing
(`#reconnect-same-turn-keeps-work`). What breaks if reversed:
clear-on-reconnect turns every network blip into a cold start at exactly
the moment (mid-turn, clock running) the team can least afford one; and
any reset trigger other than turn change lets stale worlds from an old
board leak into a new turn's scores (`#turn-change-is-the-only-reset`).

Using the observed turn number as the *sole* validity key for a whole
turn's accumulated work is only sound because of two cross-cutting
guarantees the requirement cites: a turn becomes observable whole or not at
all (`global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic`),
so a fresh turn number never exposes a half-committed board to evaluate
against; and nothing external reaches a running game
(`global-invariants/game-instance-hermeticity#seeded-once-never-refreshed`),
so no rule, parameter, or roster change can alter what a stable turn number
denotes. Relax either and the cache would need a finer key — a board
revision or a re-validation on every reconnect — and
`#reconnect-same-turn-keeps-work` would become unsafe rather than
economical.

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
(001, 005, 057–060) at intent grain, and state only the part that is
locally theirs: one player per hosted team per live game, the two
subscriptions it reads, staging for automatic snakes as its one game
write, and — the framework-specific content — that caches, stateMaps, and
dirty flags are process-owned scratch written to no store at all
(`#restart-rebuilds-from-subscriptions`, the crash-recovery contract).
The surrounding absolutes are deliberately *not* restated as local
requirement text; the cross-cutting layer owns them, and these
requirements depend on them:

- *Where the framework's persistent state lives, and that the bot never
  meets the game through Convex*:
  `global-invariants/centaur-state-boundary` makes the Centaur subsystem
  the sole persistent home of bot-side state, holding nothing
  authoritative for game outcome, and confines bot compute to staged moves
  inward and filtered subscriptions outward. With that in force,
  "everything the framework persists lives in Centaur state", "no Convex
  copy of the board", and "never writes authoritative game state" are not
  separate local rules — the framework has no other channel to begin with.
  `#no-shadow-board` is therefore left saying the one thing that *is*
  local (the framework keeps no intermediary copy of its own) instead of
  re-legislating what Convex may hold
  (`global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game`).
- *That an operator's edit arrives as a committed effect rather than
  through the framework*:
  `global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server`
  already forbids a Server standing between an operator and the Convex
  contract, so "never call Centaur state mutations on an operator's
  behalf" is that invariant read at this capability, not a second rule.
  The retained scenario states the positive instead: observing the
  committed effect is the framework's entire relationship to the edit.
- *Why the unit is one player per hosted team rather than one per
  process*: `global-invariants/bot-compute-view-confinement` — a process
  may legitimately host opponents, so each team's compute must consume
  that team's filtered view alone. Relax that and per-team players become
  an arbitrary implementation shape rather than a requirement.

What breaks if reversed: a framework-private store or shadow board creates
a second source of truth that survives restarts wrong; mediating operator
mutations makes the framework a hidden authority the audit trail cannot
attribute; and any game write beyond staging would breach the authority
placement the cross-cutting layer pins.

## Constraint-mining (mandatory final step)

- **Minted: author exceptions and invalid outputs are contained at the
  boundary** (`author-fault-containment`, all three scenarios) — the
  routed lead.
- **Minted: head-start compensation on frozen-snake consumers**
  (`frozen-snake-timestamps#head-start-compensation`) plus timestamps as
  the readable staleness signal (`#staleness-is-readable`) — the routed
  lead's behavioural half; the wrapper-composition half stays mechanism,
  its invariant already owned by `global-invariants/one-shared-engine`,
  which the requirement now cites as the ground the compensation contract
  exists on.
- **Minted: a simulation declares the team's live automatic submission time
  allocation as the turn's duration and every team's burn**
  (`simulated-turn-timings#a-bound-it-honours-not-an-average`,
  `#one-declared-value-for-every-team`, `#the-turn-holds-one-allocation`) — the
  engine believes whatever timings it is handed, so a framework that declared a
  typical figure rather than the bound its player actually paces to, or invented
  a per-opponent estimate, would produce projections that understate its own
  drain with nothing anywhere to catch it; and holding one allocation for the
  whole turn is what stops a live retune from becoming an unlisted fourth
  reactive input, which `reactive-inputs#nothing-else-is-reactive` forbids and
  nothing else would detect. Its counterpart —
  that a frozen snake's fiction is positional and never temporal
  (`#a-frozen-snake-does-not-freeze-its-teams-clock`) — keeps the freezing rule
  and the timing rule from being read as one concession.
- **Minted: every heuristic answers every candidate, and may answer over the
  partial state in which only the evaluated snake has advanced**
  (`total-heuristic-coverage`, all four scenarios) — the natural
  implementation of an uninterested heuristic is an early return, which
  compiles, scores fine, and leaves the transparency record's centred column
  averaging over a set with holes; and without the shallow-state permission the
  obligation would push authors toward a constant filler value, which is worse
  than an absence because nothing can tell it from an opinion.
- **Minted: undefined stateMap entries are absent, never zero**
  (`worst-case-statemap#undefined-is-not-zero`,
  `softmax-decision#partial-statemap-is-decidable`).
- **Minted: retirement anchored to the authoritative board only**
  (`drive-satisfaction#simulated-satisfaction-does-not-retire`), and
  retirement as reversible in-memory deactivation that writes nothing
  (`#retirement-reverses-with-the-board`, `#retirement-writes-nothing`) —
  without these an implementer reads "retired from the portfolio" as a
  delete against a record this capability may not even write.
- **Minted: the dirty flag is cleared only by the stager, never by a
  snapshot** (`score-composition#publishing-does-not-consume-the-news`) —
  a shared flag with no clearing owner is silently double-consumed.
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
- **Checked, owned by dependencies or cross-cutting rules — cited, not
  restated**: manual-mode snakes never framework-staged
  (operator-control/manual-mode, retired via the operator-control change);
  one shared engine, no parallel variant
  (`global-invariants/one-shared-engine`); the bot/game channel pair and
  the persistent home of bot-side state
  (`global-invariants/centaur-state-boundary`, with
  `global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game`
  on the no-Convex-shadow half); operators dispatching their own mutations
  (`global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server`);
  no cross-team state access, in the game
  (`global-invariants/bot-compute-view-confinement`) and in Centaur state
  (`global-invariants/team-private-centaur-state`); atomic turn commit and
  instance hermeticity as the evaluation cache's validity ground
  (`global-invariants/authoritative-turn-resolution`,
  `global-invariants/game-instance-hermeticity`). All were reached via the
  declared `global-invariants` dependency rather than re-minted here.
- **Checked, plastic (mechanism, doc-comment territory)**: the rank-decay
  constant and priority formula, the lattice and heap discipline, the
  worker-pool topology and message protocol, back-pressure bounds, the
  memoisation layout of normalised outputs, and the randomness source for
  sampling — code citing this change's archive folder suffices when they
  land.
