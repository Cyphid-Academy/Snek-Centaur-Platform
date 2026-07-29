## Why

Planning the change train's implementation surfaced three places where a
capability's requirement rests on engine behaviour the engine does not have.
Each is a real gap rather than an oversight in the depending capability: the
requirement is right, the engine cannot answer it, and
`global-invariants/one-shared-engine#no-parallel-implementation` forbids the
obvious workaround of implementing the missing piece a second time in the
runtime that needs it. `game-engine` is archived, so no migration change can
amend it; this change is the sanctioned route.

- **A team's score is defined only at game end.** `scoring` opens "A team's
  score **at game end**", but `live-game-observation/scoreboard-sole-aggregate-authority`
  needs a normalised score for every rostered team **every turn**. The formula
  is turn-agnostic; only the ending-specific adjustments are terminal.
- **Hazard damage is applied but never announced.** `health-and-starvation`
  already has a surviving moved head on a Hazard cell take `hazardDamage`, yet
  `turn-events`' closed set has no event for it, so
  `game-runtime/turn-event-record` has to close over "the engine's event
  vocabulary **plus** a hazard-damage event" — two vocabularies where the
  corpus wants one.
- **A snake cannot be held still for one resolution.** The bot framework's
  tree search must represent *uncertainty* about what other snakes will do.
  Advancing an uninteresting foreign snake in its last direction is not a
  neutral placeholder — it is a claim, and a claim that manufactures **false
  safety**: a candidate move can be computed as safe because an opponent was
  assumed to continue straight, when a different opponent move would leave that
  candidate trapped. A worst-case search may never err in that direction. What
  the framework needs is to say "I am not modelling this snake this turn",
  which `movement` cannot express: it advances every alive snake
  unconditionally.

A fourth gap arrived from a different direction — not a dependent capability
asking for a rule, but the corpus asking for a bound. `game-end-conditions`
lets `maxTurns` be 0, and the chess timer's budget grows by
`clock.budgetIncrementMs` every turn, so a team that declares quickly gains
time as fast as it spends it: **a game can be configured with no finite
maximum duration at all.** That is what makes
`game-lifecycle/stale-game-recovery` unsound as written — its staleness bound
is specified as generous above "the longest game the configured clocks and
turn limit can produce", a quantity that does not exist while a
no-limit-at-all configuration is legal. Fixing it needs a *time* limit as well
as a turn limit — and closing it changes **how the engine is called**, which is
why this change's scope is now wider than "engine affordances the train needs".

A fifth strand arrived last, and it is what renamed this change. Asking what
the engine *takes* made it obvious that it takes too much: seven of its
requirements describe how a **board is built** — its wall ring, its hazards,
its fertile patches, its starting territories, the snakes and food placed in
them, and the bounded retry over all of it — and five of its sixteen
configuration parameters exist only to feed them. Nothing in turn resolution
reads any of it. `resolve/` imports nothing from generation, `snakesPerTeam`
appears nowhere in it, and whether fertile ground is on is already derived
from the board's cells rather than from configuration. The boundary decision
that put generation platform-side is years old, argued at length and already
implemented; what never caught up was the packaging. So this change takes the
generation requirements out of `game-engine` and puts them in
`game-configuration`, which owns the parameters that drive them and the
preview that renders them — one move, both halves. The engine's contract
becomes: it is handed a **fully specified board**, whose dimensions state its
size and whose placed snakes state each team's count, and it plays it.

The engine cannot read a clock; it can, however, be **told** what a turn cost.
So both entry points gain two required parameters — the turn's clock duration
and the time each team burned on it — and the engine does with them what it
already does with the snapshot, the staged moves and the turn seed: treats them
as declared inputs. Determinism is untouched, because the property was never
"the engine ignores time", it was "the same inputs produce the same outcome";
the input tuple grew by two quantities and stayed closed. With time inside the
tuple, the engine can derive the endings that depend on it — a team out of time,
and a game that has consumed its configured duration — as ordinary end
conditions at the same commit as every other. Two consumer capabilities come
along, because a resolution input has to be recorded to be replayed and
supplied to be simulated: `test-sequences` carries the timings per turn, and
`visual-tester` supplies them.

## What Changes

The third gap is not a single affordance but a second way of using the engine.
The mainline is a real-time game where every snake moves each turn; hypothetical
exploration needs the same rules over a board where only some snakes have
advanced. Both are expressed over one data structure and one rule set.

- **MODIFIED `game-engine/domain-vocabulary`** — game state carries the turn it
  has advanced to, and each snake carries the turn it has advanced to. A
  **partial game state** allows a snake to lag; a **game state** is the case
  where every snake's turn equals the state's, which is what the mainline
  always produces and every runtime persists.
- **MODIFIED `game-engine/turn-resolution-model`** — two entry points over one
  stage list. *Imagining moves* advances a caller-chosen subset of snakes and
  yields a partial state; *advancing a turn* resolves every snake's direction
  by the movement rules and then imagines those moves, yielding a game state.
  Item spawning and the win check run only while nothing lags. **Both entry
  points require the turn's timings** — its clock duration and each team's burn
  — and those are the sole channel by which elapsed time reaches committed
  state; the movements they drive land at the commit, and only when the state's
  current turn advances.
- **MODIFIED `game-engine/determinism`** — the requirement now names the closed
  input tuple a resolution is a function of, the timings included, and
  `#reproducibility` enumerates them.
- **MODIFIED `game-engine/chess-timer`** — the clock arithmetic the engine
  already owns is now *applied* by a turn's resolution from the declared burn:
  spend, bank, **kill on exhaustion**, then increment and carve, all in the one
  commit, plus the game's consumed duration. A competing team left with no
  remaining time at all loses every snake still alive at that commit
  (`clock_exhaustion`) — a cause of death, not an ending — and the stated order
  is what makes zero reachable at all: a team that burns its whole remaining
  budget without declaring early is at zero *before* the next turn's increment
  arrives, so a positive per-turn mint is not a floor beneath it. The two
  timing quantities are stated as distinct, because a team that declared early
  burned less than the turn lasted.
- **MODIFIED `game-engine/movement`** — its universal is scoped to snakes
  taking the turn, and direction fallback belongs to advancing a turn rather
  than to imagining moves, so a hypothetical never silently invents a
  direction.
- **MODIFIED `game-engine/scoring`** — the same formula defines a **standing
  score** at any turn; the **final score** is the standing score at the last
  turn with the ending-specific adjustments applied. Running out of time adds
  no adjustment: a team whose snakes died to its clock is scored as any other
  team whose snakes died.
- **MODIFIED `game-engine/turn-events`** — hazard damage taken by a surviving
  snake joins the closed set, and `#deterministic-order` enumerates the timings.
- **MODIFIED `game-engine/game-end-conditions`** — **one** time-based ending
  joins the list the engine derives: the game's consumed duration reaching
  `maxGameDurationMs`. A team out of time is explicitly *not* an ending — its
  snakes die and the elimination conditions decide. The no-turn-limit case no
  longer says a game "continues indefinitely", the first condition met ends the
  game, and where an elimination and a limit land at one commit the elimination
  is the ending.
- **MODIFIED `game-engine/board-geometry`** — reworded from a rule about how a
  board is *constructed* into the rule the engine actually applies to a board it
  is *handed*: the flat row-major encoding, the inner playable area, off-board
  resolving exactly as a `Wall` cell does, and terrain fixed for the whole game
  — which absorbs the permanence halves of the departing `hazards` and
  `fertile-ground`. The complete wall ring leaves with generation, because
  resolution never depended on it.
- **REMOVED `game-engine/hazards`, `fertile-ground`, `starting-placement`,
  `initial-snakes`, `initial-food`, `board-generation-retry`** — re-authored,
  slugs unchanged, as `game-configuration/*` by `migrate-game-configuration`'s
  mint delta in this same train, together with two requirements the move
  obliges that capability to author itself: `generation-parameters` (the five
  parameters the engine no longer declares, with their ranges, defaults and
  sentinels) and `generated-board-shape` (the wall ring). Recorded as six
  renames and one split in `openspec/maps/identifier-lineage.json`, with ~28
  legacy identifier-map entries retargeted.
- **MODIFIED `game-engine/configuration-parameters`** — a `maxGameDurationMs`
  parameter joins the vocabulary, with its range, default (0) and disable
  sentinel, declared here so one declaration serves every surface and every
  runtime, and evaluated here against the durations declared to the engine's own
  resolutions. The five board-generation parameters leave, taking the table from
  sixteen rows to eleven, and the requirement now states the rule that keeps it
  that way: a parameter no turn's resolution reads is a parameter the engine
  must not declare.
- **MODIFIED `game-engine/determinism`** — scoped to a turn's resolution now
  that setup randomness travels with generation.
- **MODIFIED `game-engine/runtime-portability`** — the explicit inputs the
  engine may read the current time from now name the declared timings, which is
  the one place the "no ambient clock" rule could otherwise be read as "no time
  at all".
- **ADDED `game-engine/held-snakes`** — what holding means: the snake splits
  into a **historic record**, frozen at the turn it was held from and changed by
  nothing thereafter, and a **projection** that stands on the board in its
  place. The projection is an ordinary occupant in every respect the rules read
  — severable, carrying effects that expire and that team events reach,
  advancing its turn with the state, dying with its team's clock — and differs
  in exactly one way: it has **no head**, because the cell a snake vacates only
  into its own next segment is certain while where the head went is not. It
  carries maximum health and does not vacate its tail, both because a snake
  nobody modelled might have reached food.
- **ADDED `game-engine/historic-advance`** — a hold need not be terminal. The
  move a projection made *at the turn it was held at* may be supplied later, and
  the board is then resolved again from before that turn with the fact in place
  and every resolution since replayed over it, from a rewind log the partial
  state carries. The revision may change what already happened, and reports
  which snakes' fates it changed. One move recovers one turn, not all of them.
- **ADDED `game-engine/hypothetical-resolution-failure`** — imagining moves
  returns a failure rather than a state when the answer would depend on
  information the caller did not supply, or on resolving a snake whose lag the
  rules cannot express. Four kinds: no disposition for an alive snake, a
  lagging snake asked to move, a running stage's turn seed missing, and input
  that could not have arisen. The seed refusal names no snake, because it is
  about the resolution rather than about one. Conservative refusal, because the
  caller is a worst-case search.

Two consumer capabilities are dragged along by the calling-convention change,
and this change carries their deltas because a resolution input is worthless
unless it is recorded and supplied:

- **`test-sequences`** (a delta for a capability this change did not previously
  touch) — **MODIFIED `sequence-format`** records each turn's timings among its
  inputs, **MODIFIED `replay-check`** replays from them, and **MODIFIED
  `validation`** requires a burn for exactly the teams present. Without this the
  replay-check is unsound: it would compare a recording against a resolution run
  on invented timings and report the divergence it created.
- **`visual-tester`** (likewise new to this change) — **MODIFIED
  `board-editor`** drops its declared dependency on the departing
  `game-engine/starting-placement#shared-parity`: the editor's parity rule rests
  on movement preserving parity every turn, not on how the first parity was
  chosen, and the editor explicitly permits states generation would never
  produce, so the edge was never the one carrying its soundness; **MODIFIED
  `turn-simulation`** supplies a configurable default duration (500 ms out of the
  box) as both the turn's length and every team's burn, with per-advance
  overrides; **MODIFIED `session-history`** keeps each turn's timings so
  re-simulating a scrubbed-to turn cannot silently change its outcome; and
  **MODIFIED `sequence-management`** has a saved fixture record the timings among
  its inputs.

No implementation is performed by this change.

## Impact

- `openspec/specs/game-engine/spec.md` at archive: eleven requirements amended,
  two added, **six removed**. `openspec/specs/test-sequences/spec.md`: three
  amended — no `## MODIFIED Purpose` is owed there, since it already declares
  `game-engine`. `openspec/specs/visual-tester/spec.md`: four amended — no
  `## MODIFIED Purpose` is owed there either, since every amended requirement
  cites only `game-engine` and `test-sequences`.
- **This change stays fold-first**, and that is why the tester's generation
  route is not in it. Fold enforces dependency order requirement by
  requirement; a `visual-tester` requirement citing `game-configuration` would
  gate this whole folder — `game-engine` included — on the capability this
  change is *feeding*. `add-generated-board-sessions` carries that requirement
  instead, so the board-generation move is remove-then-add: generation leaves
  `game-engine` when this folds and arrives in `game-configuration` when that
  one does, with no interval in which two folded capabilities both specify
  it.
- `openspec/changes/migrate-game-configuration/`: the receiving half of the
  move — eight ADDED requirements and five reworded — plus its own task
  section. It is a separate folder for a mechanical reason, not a conceptual
  one: `game-configuration` has no `specs/` entry yet, a delta targeting a
  capability that does not exist must open with a `## Purpose` preamble, and a
  preamble means *mint* — so a second folder carrying `game-configuration`
  requirements would be a second mint of one capability, which the train's
  preconditions forbid and `spec:fold` refuses. The two folders are reviewed and
  land together.
- `legacy-spec-archive/maps/identifier-map.json`: ~28 entries retargeted from
  `game-engine/*` to `game-configuration/*` homes, two of them split across
  both. `openspec/maps/identifier-lineage.json`: six requirement renames and one
  split. `pnpm spec:audit` is what proves the sweep complete.
- `packages/engine/`: a per-snake turn and a state-level turn on the game-state
  types; the game's consumed duration alongside the team clocks; direction
  resolution factored out of the turn context so both entry points share stages
  1–5; the historic record and headless projection a hold splits a snake into,
  sharing one declared supertype with an ordinary snake, and the
  participant/present separation inside the context builder that follows;
  a third entry point supplying a projection's move at the turn it was held at,
  over a rewind log the partial state carries; per-snake effect expiry; the
  standing score on the public
  surface; a hazard-damage event kind; a `maxGameDurationMs` field on the
  gameplay configuration subtree; the timing
  parameters on both entry points, with the clock arithmetic moving from
  `clock.ts` helpers the runtime calls into the commit stage; and a
  `clock_exhaustion` death cause in the existing closed set.
- **`packages/engine/src/boardgen.ts` and `perlin.ts` move with the
  requirements**, into a new `@cyphid/snek-game-configuration` package — the 448
  production lines and their 475 test lines, behaviour untouched, citations
  retargeted to the new identifiers. Planned in §12 of `tasks.md`, and it lands
  the receiving half of `migrate-game-configuration`'s own §1: requirements
  moving with no code to receive them would leave the corpus describing a
  package layout that does not exist. The cost this pays is the engine property
  suite's source of initial states, which built every one by *calling*
  generation; it now draws them, deliberately harsher than a generated board,
  with a branch-coverage baseline over `resolve/` proving reach was not lost.
- **Migration cost, accepted:** `SnakeState` and the game-state aggregate gain
  fields and both entry points gain parameters, so every runtime that assembles
  or calls them changes — `packages/stdb/`, `packages/centaur-server-lib/`, and
  `apps/visual-tester/`, whose `test-sequences` schema is a `z.strictObject`
  with committed fixtures. The recorded format gains a per-turn field, so its
  schema version increments; the fixture directory holds none yet, so nothing
  is migrated today and a version-1 document is rejected rather than guessed
  at. The regression suite fails loudly on any that appear before then, which
  is the wanted signal. Every ingest path owes such a document a readable
  rejection naming its version, and the listing marks it before a reader spends
  a click on it.
- Dependents unblocked: `live-game-observation/scoreboard-sole-aggregate-authority`,
  `game-runtime/turn-event-record`, `bot-framework/foreign-snake-treatment`,
  `bot-framework/frozen-snake-timestamps`,
  `game-configuration/bounded-game-duration`,
  `game-runtime/turn-timing-measurement`,
  `bot-framework/simulated-turn-timings`.
- Made sound downstream: `game-lifecycle/stale-game-recovery`, whose staleness
  bound presupposes that every game has a finite maximum duration.

## Open Questions

None. Every decision this change required is resolved and recorded here or in
`design.md`. The one question it *surfaced* — whether heuristic authors get a
staleness rule or staleness-aware primitives over partial states — belongs to
`bot-framework`, which will provide the primitives; it is recorded as an open
question on `migrate-bot-framework`, where the work lives.

Sixteen resolved during train review:

- **Does the visual tester get board generation as a declared affordance, and
  may `visual-tester` depend on `game-configuration` to get it?** *Decision
  (author, 2026-07-28):* **yes to both** — and the requirement is carried by
  `add-generated-board-sessions` rather than here, so this change keeps its
  fold-first position (see Impact). The dependency is declared the ordinary
  way, through that change's `## MODIFIED Purpose` for `visual-tester`; the
  corpus rule that blocks a Purpose amendment applies to *two open changes*
  amending one Purpose, and that is the only change amending this one. An
  earlier round mistook that rule for "a folded capability an open change
  already amends can never gain a dependency" and reasoned from it; it is not a
  rule and nothing rests on it.

- **Does clock exhaustion end the game?** *Decision (author, 2026-07-28,
  correcting this change's first answer):* **no — it kills.** A competing team
  left with no remaining time loses every snake still alive at that commit, and
  the ending conditions then decide on the state that leaves, exactly as they
  would for any other cause of death: with three teams the game carries on with
  two, with two it ends by last-team-standing. The clock-exhaustion *ending* is
  removed from `game-end-conditions` and the death is authored in `chess-timer`.
  What this costs is one clause of ordering and nothing else; what it buys is in
  `design.md`.
- **Where does the death belong — `chess-timer`, `game-end-conditions`, or
  `collisions-and-severing`?** *Decision:* `chess-timer`. Death causes in this
  corpus are already owned by the requirement that owns the cause — `wall` and
  `body_collision` by collisions, `head_to_head` by precedence,
  `health_depletion` by health — and `chess-timer` is the requirement that holds
  the clocks, applies the burn and can say what "no remaining time at all" means.
  `collisions-and-severing` is about what happens on the board and knows nothing
  of clocks; `game-end-conditions` is now the one requirement that must *not*
  mention this, since mentioning it is what made it an ending.
- **Is zero reachable when the per-turn increment is positive?** *Decision:*
  yes, and the requirement says how. Exhaustion is judged after the burn is
  spent and the remainder banked but **before** the next turn's increment and
  carve-out, so a team that spends the whole of its remaining time without
  declaring early lands at zero with nothing yet minted. Left unordered, an
  implementer would apply the increment first and the ending would be
  unreachable in every configuration with a positive increment — which is every
  default one.
- **What does the death do to the turn-event vocabulary?** *Decision:* it adds
  a **cause**, not an event kind. `clock_exhaustion` joins `wall`,
  `self_collision`, `body_collision`, `head_to_head` and `health_depletion` in
  the death event's cause set, with no killer. `game-runtime/turn-event-record`
  closes over the engine's vocabulary generically and needs no change.
- **And to `scoring`?** *Decision:* nothing. A team whose snakes died to its
  clock is scored as any other team whose snakes died — 0 as an eliminated team
  where those deaths ended the game, and its plain standing score (0, holding no
  living segment) while the game runs on. The `losing on time scores 0`
  adjustment this change first added is **removed**, because there is no longer
  an ending for it to attach to.
- **Which conditions win when several are met at one commit?** *Decision:* the
  first condition met ends the game, and at one commit the game ends once with
  the elimination as the ending where one is present. The author's position is
  that there is no ambiguity between the turn limit and the duration limit, and
  there is not: both score by the standing score, so which one "fired" is not
  observable. The elimination case is different and is now more reachable,
  because a clock can produce one — so the tie-break is stated rather than left
  to an implementer.
- **Does board generation belong to the engine?** *Decision (author,
  2026-07-28):* **no.** The engine takes a fully specified board — cells with
  their terrain, snakes with their teams and bodies, the items — whose
  dimensions imply its size and whose placed snakes imply the per-team count.
  Seven requirements and five configuration parameters leave; the intent was
  never in doubt (the platform-side boundary was decided and implemented years
  ago, and no resolver code reads a generation parameter today), only the
  packaging.
- **Which of the seven move whole?** *Decision:* six —`hazards`,
  `fertile-ground`, `starting-placement`, `initial-snakes`, `initial-food`,
  `board-generation-retry` — slugs unchanged. `board-geometry` **splits**: the
  engine keeps it, reworded from construction into validity, and the wall ring
  leaves as `game-configuration/generated-board-shape`. Two scenarios are
  absorbed rather than moved — `hazards#permanence` and
  `fertile-ground#stable-designation` are one fact about a board in play, now
  `board-geometry#terrain-is-fixed`. Nothing is deleted outright.
- **Does the engine need the wall ring?** *Decision:* no, and this was checked
  rather than assumed. `resolve/rules.ts` treats off-board identically to a
  `Wall` cell and `resolve/spawn.ts` excludes the border by index, so a board
  with no ring resolves correctly and identically. The ring is a convention of
  the boards handed in — which is exactly why it is generation's to state and
  not a validity precondition the engine declares.
- **Both halves in one change folder?** *Decision:* no, and not by preference.
  `game-configuration` is not in `specs/` yet, a delta for a capability that
  does not exist must open with a `## Purpose` preamble, and a preamble means
  *mint* — so carrying the receiving half here would be a second mint of one
  capability, which the train's own preconditions forbid and `spec:fold`
  refuses. The removal half is here, the ADDED half is in
  `migrate-game-configuration`, and they are one reviewed unit that lands
  together. Once `game-configuration` has folded, a later move into it is an
  ordinary single-folder operation.
- **Is `extend-game-engine` still the right name?** *Decision:* no — the folder
  is now `revise-game-engine-contract`. The change no longer extends the engine;
  it revises what the engine *is*: what it takes (declared timings, a fully
  specified board), what it decides (a time-based ending), what it no longer
  owns (generation), and the hypothetical-resolution affordances on top.
- **Where can a game's time limit live without breaking determinism?**
  *Decision (2026-07-28, superseding the same day's earlier answer):* **inside
  the engine**, with the time declared to it. Both entry points require the
  turn's clock duration and each team's burn; the engine reads no clock, so
  determinism is unchanged — same state, directions, seed **and timings** give
  the same outcome. The earlier answer put the limit in the runtime on the
  grounds that elapsed time is not a function of committed state; that is true
  of a clock the engine *reads* and irrelevant to a value it is *given*. What
  the reversal buys is recorded in `design.md`: an engine that cannot report a
  clock-driven ending is an engine no tree search can use to anticipate one.
- **Does `game-end-conditions` still hold once a game can end another way?**
  *Decision:* not as written, and not as first amended either. Its
  `#turn-limit-and-no-limit` scenario promised a game with `maxTurns` 0
  "continues indefinitely until an elimination ending", which a duration limit
  falsifies. The first amendment added a scenario asserting the engine derives
  no such ending; that scenario is **removed**, and the duration limit is
  authored as an ordinary condition evaluated at the same commit as the others.
  The clock-exhaustion ending this question's first answer also added is gone
  too — see the first decision above.
- **One channel for time, or two?** *Decision:* one. The engine already owns the
  timer's arithmetic and exported it for a runtime to apply between turns; had
  the timings also arrived as resolution inputs, a turn's committed clocks and
  the clocks its outcome was decided on could disagree. `chess-timer` therefore
  moves the application into the resolution: the declared burn is spent, banked,
  judged for exhaustion, then incremented and carved in the one commit, and
  nothing outside a resolution moves a budget.
- **Do the two timing quantities collapse into one?** *Decision:* no. A team
  that declares early burns less than the turn lasted, and the teams' clocks run
  concurrently while the game's consumed duration does not, so neither quantity
  is recoverable from the other. Both are required parameters.
