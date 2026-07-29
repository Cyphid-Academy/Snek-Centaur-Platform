## Why

Tenth change of the final spec-migration train. The bot framework is the
one legacy module whose requirements section mixes three different kinds of
material at full depth: the author-facing heuristic contract (the
Drive/Preference vocabulary and its safety rails), the decision engine's
observable behaviour (stateMap, worst-case scoring, softmax, attention),
and genuinely internal mechanism (the simulated-world cache, the lattice,
Dijkstra-like traversal, priority ordering) written out as numbered
requirements. Re-authoring it as one capability puts the whole "authoring
bot logic" story — what a heuristic author and an operator can rely on — in
one readable place, and moves the mechanism where this corpus says
mechanism lives: in code, with rationale in this change's design.md.

## Carving decision

Mint **`bot-framework`** (name confirmed by the author — assignment-matrix
Q3) from module 07 exactly as drawn in the author-approved capability map
and assignment matrix. The legacy requirements and review items this
change absorbs are recorded in the identifier map under this change's
name. Declared dependencies:
**game-engine, global-invariants, operator-control**.
The engine owns turn resolution, movement fallback, and the chess clock;
operator-control owns the staged-move log, selection, and manual mode that
this capability's commitment and attention semantics range over;
`global-invariants` is declared because several of this capability's
requirements are sound only while a cross-cutting invariant holds — the
Centaur/game channel pair, view confinement, atomic turn commit, and the
one shared engine — and the declaration is extended whenever another such
citation proves warranted.

**Author-resolved boundary decisions binding this change:**

- **The mechanism boundary is the observable contract.** The lattice
  structure, Dijkstra-like traversal, cache data structures, priority-weight
  ordering internals (07-REQ-024–031, 041–043), and the
  no-re-simulation half of the branch-activation rule are code plus this
  change's design.md — retired note-only, not re-authored as requirements.
  What is binding spec: the vocabulary and scalar rails, depth-1 scope,
  candidate enumeration with the lethal-last-resort, the three reactive
  inputs and the activation predicate, the turn-scoped cache lifecycle,
  frozen-snake semantics with timestamps, teammates-as-foreign and
  commitment semantics, worst-case stateMap scoring with the dirty flag,
  softmax with its fallbacks, attention tiers and selection promotion, and
  the statefulness and write-channel boundaries.
- **Temperature is an opaque portfolio scalar here.** The portfolio
  requirement names one effective softmax temperature per snake and the
  softmax requirement consumes it; its derivation from team defaults and
  per-snake overrides is the configuration story's and is not authored here
  (this is the cycle-break recorded in the capability map).
- **Submission timing is not authored here.** The scheduled and final
  submission passes and the Captain-suppression rule belong to the pacing
  story; where this spec needs them it says "when the framework decides a
  move", never citing a submission schedule. Likewise the display-state
  snapshot writing belongs to the transparency story (the dirty flag is
  authored here as the shared signal it consumes), and portfolio
  initialisation and mutation to the configuration story.
- **07-REQ-040 is included** (it is assigned `bot-framework` in the
  matrix): the three attention tiers are the vocabulary the author-resolved
  promotion behaviour (051–054) ranges over, so the tier ordering is
  authored at intent grain while its round-robin internals (041) stay
  mechanism.

Deliberate boundaries restated from the matrix seams: 07-REQ-004/039
(display-state sole-writership and snapshot triggering) →
decision-transparency; 07-REQ-014–018, 022, 037, 050, 055, 056 →
bot-configuration; 07-REQ-044/045/045a → turn-pacing; 07-REQ-046 →
operator-control (already authored there); 07-REQ-047/062/063/064 →
replay-and-audit; 07-REQ-061 → global-invariants. None are touched by this
change.

## What Changes

- **New capability `bot-framework`** (mint delta, ADDED-only, 19
  requirements): the embedded per-team player and its state boundary
  (persistent state only in Centaur state, scratch in memory);
  observe-and-stage-only (subscriptions in, staged moves for automatic
  snakes the sole game write, no mutation on operators' behalf); the
  Drive/Preference vocabulary with Goal/Fear as author semantics; the
  [−1, 1] scalar discipline with no algebraic assumptions; author fault
  containment (validate/clamp/substitute, contained exceptions, structured
  per-turn-deduplicated logging); satisfaction terminal reward and
  authoritative-board-anchored retirement, retirement being reversible
  deactivation in the framework's working portfolio that persists nothing;
  the per-snake portfolio with
  temperature as an opaque scalar; candidate enumeration with the
  lethal-last-resort guarantee; the three reactive inputs and the
  world-activation predicate; the turn-scoped, reconnect-safe evaluation
  lifecycle; foreign-snake treatment (teammates foreign, per-category
  commitment, freezing); per-snake turn timestamps with head-start
  compensation; the timings a simulated resolution declares — the team's live
  automatic submission time allocation, read rather than owned, held constant for
  the turn — so that clock-driven
  endings are visible to the search; the depth-1 worst-case stateMap; total
  heuristic coverage — every heuristic answers every candidate direction with
  a concrete value, with evaluation over the partial state in which only the
  evaluated snake has advanced as the cheap way to honour it; score
  composition and the
  dirty flag, whose whole lifecycle is now stated here — set on an actual
  score change, cleared only by the workflow that stages the decided move,
  never by a snapshot; softmax sampling with the undefined-exclusion and
  `lastDirection`/engine fallbacks; and attention tiers with selection
  promotion.
- **~37 legacy ids compress to 17 requirements**; the five resolved legacy
  review items carrying behaviour are encoded as scenarios
  (out-of-interest teammate move adds nothing; temporal head-start
  compensation; partial-stateMap sampling; retirement anchored to the
  authoritative board; same-turn reconnect keeps the cache).
- **Mechanism demoted deliberately**: 07-REQ-024–031, 041, 042, 043 and the
  no-re-simulation half of 021 retire note-only, with their rationale
  preserved in this change's design.md (the mechanism-boundary
  justification per cluster).
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-bot-framework/specs/bot-framework/spec.md`
  (folded to `openspec/specs/bot-framework/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `bot-framework`
  (at archive).
- Cross-change citations: this delta cites
  `game-runtime/staged-move-log`, `manual-mode`, `exclusive-selection`,
  and `selection-is-view-only` from the open sibling change; the reference
  lint resolves them via the open-change overlay, and the train's archive
  order (operator-control immediately before this change) keeps them
  resolving at fold time.
- Downstream train changes cite this capability: bot-configuration (the
  vocabulary and portfolio it configures, the temperature contract),
  turn-pacing (the dirty flag and softmax decision its submission passes
  consume), decision-transparency (the stateMap, worst-case worlds, and
  dirty flag its snapshots carry).
- Code citations: the framework package's coordinator, heuristic guard,
  scoring, sampling, and scheduling code gain `// spec: bot-framework/...`
  citations when the implementation lands; the cache/lattice/traversal
  internals gain `// design:` references to this change's archive folder.

## Open Questions

1. **What shape do staleness-aware analysis primitives take, and how much of
   the compensation does the framework own rather than the author?**
   - **Context**: `frozen-snake-timestamps#head-start-compensation` makes
     compensating for a held snake's staleness the obligation of *any* analysis
     over a simulated board — including analysis heuristic authors write
     themselves. A territory search that ignores it penalises a held snake for
     not having moved and quietly biases the bot's own scores, with nothing to
     detect the mistake. The `revise-game-engine-contract` change is what makes staleness
     observable: the engine's whole obligation there is to carry each snake's
     turn honestly, and it deliberately grows no compensation helper, because
     analysis over partial states belongs to this capability.
   - **Decision taken, shape still open**: this capability **will** provide
     staleness-aware primitives rather than leaving the rule as the only
     defence. What remains is which analyses they cover (a multi-source
     distance search is the motivating one), whether the raw per-snake turns
     stay reachable for authors writing their own, and whether the rule is
     restated as the contract those primitives implement or becomes an internal
     detail of them.
   - Not a blocker for authoring this change's requirements — the primitives
     are mechanism — but it must be settled before the author-facing surface is
     published, because a fork consumes it and
     `centaur-server-runtime/forkable-reference-app` makes that surface a
     compatibility contract.

2. **Does a satisfied Drive's retirement mutate the persisted portfolio?**
   - **Context**: `drive-satisfaction` required a satisfied Drive to be
     "retired from the snake's portfolio at that turn's close", which reads as
     a deletion — but `bot-configuration/per-snake-portfolio-record` says the
     platform never deletes a Drive, and `observe-and-stage-only` leaves this
     capability no channel to write Centaur state at all.
   - **Decision**: retirement is **deactivation within the framework's own
     working portfolio** and is never a write to any record. It is re-derived
     from each turn's observed authoritative board rather than latched, so it
     reverses by itself when the board stops satisfying the Drive
     (`#retirement-reverses-with-the-board`), and it persists nowhere
     (`#retirement-writes-nothing`). The configuration story states the
     matching half — the record survives untouched and the Drive stays listed
     as omitted-from-play with its reason shown, alongside the existing
     unresolvable-target case. Rationale in design.md.

3. **Who clears the dirty flag?**
   - **Context**: this capability minted only the *setting* of the flag; the
     pacing story's submission passes and the transparency story's snapshots
     both consume it, and neither the flag's definition nor either consumer
     said when it goes down.
   - **Decision**: setting is this capability's and clearing belongs to the
     capability that stages the decided move, on the staging acknowledgement.
     `score-composition` now states both halves so the lifecycle is complete
     where the flag is defined, and pins the negative — a published snapshot
     of decision state leaves the flag set
     (`#publishing-does-not-consume-the-news`). The clearing act itself is
     authored by the pacing story; the DAG forbids a declared dependency in
     that direction, so the requirement names the concept and the identifier
     lives on the pacing side.

4. **What does a simulated resolution declare for the turn's timings?** —
   **RESOLVED**
   - **Context**: `revise-game-engine-contract` makes the turn's clock duration and each
     team's burn required inputs of both engine entry points, so every simulated
     world declares them, and what is declared decides when the projected clocks
     empty — and therefore whether a clock-driven loss or victory is visible to
     the search at all.
   - **Decision (author, 2026-07-28; corrected the same day)**: a simulated
     resolution declares **the team's live automatic submission time
     allocation** as the turn's duration and as every team's burn. The first
     recording of this decision framed the value as "the framework's own
     configured per-turn deliberation limit" — a constant the framework set for
     itself. That was a misreading of the author's intent and is withdrawn: the
     parameter already exists as the pacing story's per-game, per-team automatic
     submission time allocation — how long the team's automated player computes
     before it auto-submits when no operator is in thinking mode — captured from
     the team's defaults at game start and retunable live during play by any
     current member, the captain included. The framework reads it rather than
     owning it, and the justification is stronger for it: this is the principled
     duration of a turn no human intervenes to lengthen, which is exactly the
     counterfactual a one-turn search asks about. The reasoning the requirement
     already carried survives intact — one uniform value for every team, because
     the framework knows nothing about anyone else's deliberation; a bound the
     player honours rather than an average; and declaring the game's turn cap
     instead would project every clock to empty within a few turns and the
     stateMap would stop discriminating. Two consequences: the hard clause
     "below the game's configured maximum turn time" is dropped (it is no longer
     the framework's to promise about an operator-tunable value; the reasoning
     stays as a scenario, and the real bound is the pacing story's flush arming
     against the observed remaining time), and the declared allocation is the one
     **in force at the turn's start**, held for that turn, so a mid-turn retune
     times the next turn's simulations rather than becoming a fourth reactive
     input and mixing two projections into one stateMap
     (`simulated-turn-timings#the-turn-holds-one-allocation`).
   - **No new dependency is declared, because the edge would be a cycle.** The
     value is owned by `turn-pacing` and its captured default by
     `bot-configuration`, and both of those capabilities already declare
     `bot-framework` in their Purpose. An edge in the needed direction closes a
     capability-grain cycle, so the requirement names the concept in prose and
     declares nothing — the same cycle-break this capability already uses for the
     effective temperature and for the dirty flag's clearing. Rationale, and the
     residual asymmetry for opponents' clocks, in design.md.
   - **Interaction with question 1, deliberately left open**: a frozen snake's
     fiction is positional, so its team's declared burn applies to it like any
     other — the same line the engine draws for a held snake's potion timers. How
     much of the *positional* staleness compensation the framework owns is still
     question 1's, and nothing about the timings changes it.

5. **May a heuristic decline to answer for a candidate move?** — **RESOLVED**
   - **Context**: nothing in the delta let a heuristic skip a candidate, but
     nothing obliged it to answer for one either. The transparency story's
     relative-impact column centres each heuristic's weighted contribution on
     its mean across the snapshot's candidate directions, and a mean is only
     defined when the heuristic has a value for each of them. The gap was
     first patched on the recording side, by requiring the *record* to carry a
     uniform heuristic set across its directions — a constraint the record
     invented about a producer it does not own.
   - **Decision (author, 2026-07-28)**: the obligation belongs to the
     heuristics. Every heuristic in a snake's portfolio produces a concrete
     value for every candidate direction the snake scores — a number, each
     candidate, every time. `total-heuristic-coverage` mints it, and mints with
     it the escape hatch that makes it cheap: a heuristic indifferent to what
     other snakes do under a candidate owes no simulation of their replies and
     may be evaluated over the partial state in which only the evaluated snake
     has advanced and every other snake is held — precisely what the engine's
     imagining entry point yields. Coverage therefore costs at most one shallow
     resolution per candidate, and a heuristic spends its effort selectively on
     *depth* rather than on *breadth*. That interplay is the point of the
     requirement, not a footnote to it.
   - **Consequence for the transparency story**: the record's uniformity clause
     stops being an independent constraint and becomes a consequence — the
     record keeps every heuristic it was handed, and the producer hands it one
     per candidate. The relative-impact definition itself is unchanged.
   - **Interaction with question 1, deliberately left open**: a state in which
     only one snake has advanced is the maximal staleness case the head-start
     compensation rule governs, so the cheapest evaluation is also the one that
     most needs the staleness-aware primitives question 1 is about. Recorded as
     a scenario (`total-heuristic-coverage#the-cheapest-evaluation-is-the-stalest`)
     so the two rules read as one story; nothing here settles what shape the
     primitives take.

Otherwise none. The candidate ambiguities were resolved by the author before
authoring and are recorded in design.md: the capability name (Q3 —
confirmed `bot-framework`), the mechanism boundary (observable contract in
spec, simulation machinery in code), the temperature cycle-break (opaque
scalar here, derivation in the configuration story), and the split of the
branch-activation rule (predicate observable, no-re-simulation mechanism).
07-REQ-040's inclusion follows the assignment matrix's operative partition;
its tier ordering is authored at intent grain with the round-robin
internals demoted alongside 041.
