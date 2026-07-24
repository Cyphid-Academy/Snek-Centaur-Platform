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
**game-engine, operator-control** (the DAG ceiling for this capability).
The engine owns turn resolution, movement fallback, and the chess clock;
operator-control owns the staged-move log, selection, and manual mode that
this capability's commitment and attention semantics range over.

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

- **New capability `bot-framework`** (mint delta, ADDED-only, 17
  requirements): the embedded per-team player and its state boundary
  (persistent state only in Centaur state, scratch in memory);
  observe-and-stage-only (subscriptions in, staged moves for automatic
  snakes the sole game write, no mutation on operators' behalf); the
  Drive/Preference vocabulary with Goal/Fear as author semantics; the
  [−1, 1] scalar discipline with no algebraic assumptions; author fault
  containment (validate/clamp/substitute, contained exceptions, structured
  per-turn-deduplicated logging); satisfaction terminal reward and
  authoritative-board-anchored retirement; the per-snake portfolio with
  temperature as an opaque scalar; candidate enumeration with the
  lethal-last-resort guarantee; the three reactive inputs and the
  world-activation predicate; the turn-scoped, reconnect-safe evaluation
  lifecycle; foreign-snake treatment (teammates foreign, per-category
  commitment, freezing); per-snake turn timestamps with head-start
  compensation; the depth-1 worst-case stateMap; score composition and the
  dirty flag; softmax sampling with the undefined-exclusion and
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
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-bot-framework/specs/bot-framework/spec.md`
  (folded to `openspec/specs/bot-framework/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `bot-framework`
  (at archive).
- Cross-change citations: this delta cites
  `operator-control/staged-move-log`, `manual-mode`, `exclusive-selection`,
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

None. The candidate ambiguities were resolved by the author before
authoring and are recorded in design.md: the capability name (Q3 —
confirmed `bot-framework`), the mechanism boundary (observable contract in
spec, simulation machinery in code), the temperature cycle-break (opaque
scalar here, derivation in the configuration story), and the split of the
branch-activation rule (predicate observable, no-re-simulation mechanism).
07-REQ-040's inclusion follows the assignment matrix's operative partition;
its tier ordering is authored at intent grain with the round-robin
internals demoted alongside 041.
