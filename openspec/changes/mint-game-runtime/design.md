# mint-game-runtime — Design

## Context

The migration carved the corpus by user-story locality, on the finding that
the legacy modules' runtime/artifact seams sawed single workflows in half and
then spent design prose stitching them back together
(`2026-07-24-mint-global-invariants`). That finding is correct and this change
does not revisit it. It records the one place where the same pathology appears
with the polarity reversed: a single **transaction** — not a workflow — sawn
across six capabilities, with `tasks.md` prose doing the stitching.

The affected artifact is one reducer in a game's own SpacetimeDB instance.
`packages/stdb` is 86 lines of typed stubs; nothing here is a refactor of
shipped code, and the cost is entirely in open change folders, which are
ADDED-only and freely editable.

## Decisions

### 1. Carve by transactional authority, not by deployed artifact

`game-runtime` owns *the state one game's runtime is authoritative for, and
the transaction that advances it*. It deliberately does **not** own everything
in the SpacetimeDB module: row-level security and the filtered views stay in
`live-game-observation`, and the once-only initialization operation stays in
`game-lifecycle`. Both are implemented in the same deployed module and always
were — `game-lifecycle/instance-initialization` is already a reducer.

The distinction matters because "everything in the module" is exactly the
retired `04-stdb-engine`, and re-minting it would undo the migration's
founding decision. The three-prong admission test in the Purpose is the
mechanical guard, and prongs (b) and (c) are the ones that do the work:

- **(b) agent-blind** rejects everything the operator story owns. Selection,
  displacement, manual mode, the boot, the board affordances, presence colours
  — all of them mention a human role or an interface, and none of them would
  exist in a bot-only game. The staged-move log, by contrast, reads identically
  in a bot-only game, which is why it belongs here and not in a UI capability.
- **(c) pre-egress** rejects everything the observation and replay stories
  own. Who may read the record, how it is delivered, what happens to it after
  it leaves at game end — all outside. The egress transmission itself is the
  seam and stays with `replay-and-audit/once-at-end-export`, which is already
  co-held with `game-lifecycle/finish-notification`.

**What breaks if reversed** (carve by module instead): `live-game-observation`
is gutted — invisibility filtering, filtered views, historical reconstruction
and real-time delivery all "run inside the instance" — and the corpus is back
to module 04 with a Purpose paragraph on top.

**What breaks if reversed** (no carve at all): the resolving transaction
remains unowned. No requirement anywhere can enumerate what a turn commits, so
"a consequence of a turn that was written outside the transaction" is not
falsifiable against the spec; the plan keeps discharging it as a cross-change
agreement in `migrate-turn-pacing` task 3.7; and the runtime stays archivable
only at graph depth 10.

### 2. The keystone requirement is the *completeness* of the transaction, not its atomicity

`global-invariants/authoritative-turn-resolution` already states that the
instance is the sole authoritative executor and that resolution is one ACID
transaction. Restating that would violate the DRY rule and the copy would
carry no authority. `game-runtime/resolving-transaction` therefore states the
thing gi cannot: **the closed enumeration of what that one transaction reads
and writes**, and that no second writer of committed turn state exists. It
declares the gi requirement rather than duplicating it.

**What breaks if reversed** (state only atomicity): the requirement is a
duplicate of gi, and the actual defect class — a turn consequence written by a
follow-up reducer, a scheduled repair, or an administrative path — stays
unspecified and therefore unreviewable.

### 3. Three requirements split rather than move

A split is more expensive than a move and was used only where a single
requirement genuinely states two obligations held by two runtimes or two
sides of the read/write line.

- **`scoreboard-sole-aggregate-authority`.** Its write half ("write one row
  per rostered team per completed turn, over the true alive set, with the turn
  it summarises") is a resolving-transaction obligation; its read half
  ("identical for every connection; clients obtain aggregates exclusively from
  this channel; client-side aggregation is a defect") is an observation rule.
  The split is also *forced*: `turn-keyed-game-record` already declares this
  requirement, so moving the record without splitting the scoreboard would put
  `game-runtime → live-game-observation` alongside
  `live-game-observation → game-runtime`. A cycle.
- **`append-only-history`.** It spans two stores — the instance's committed
  rows and Convex's team action log. `global-invariants/runtime-ownership`
  says every behaviour has exactly one runtime home; a requirement binding two
  stores in one sentence is the thing that invariant exists to prevent. The
  instance half becomes `game-runtime/append-only-record`; the action-log
  scenario stays.
- **`game-end-boundary`.** *When the game ends* is the lifecycle's status
  machine; *what the instance refuses from that commit onward* is the reducer
  set's behaviour, and the reducer set now lives here. See Q-A in the
  proposal for why the edge points this way.

**What breaks if reversed** (move whole instead of split): the scoreboard move
takes the client-aggregation rule out of the capability that owns client
behaviour; the append-only move puts a Convex obligation inside a
SpacetimeDB capability; the end-boundary move flips the lifecycle edge and
puts Convex's provisioning work behind the whole module in fold order.

### 4. `canonical-event-order`'s dependency was pointing the wrong way, and the carve forces the fix

Today `replay-and-audit/canonical-event-order` declares
`live-game-observation/observation-use-cases`. Read the scenario it points at
— `#canonical-order-is-read-not-delivered` — and the direction is plainly the
other one: the observation surface is the *consumer* of the order rule, which
it names to say that delivery order carries no guarantee. Under the carve the
existing edge would close a cycle, so it is dropped, and the honest edge
(`live-game-observation/observation-use-cases → game-runtime/canonical-event-order`)
is added.

This is worth recording as evidence for the carve rather than against it: the
mis-pointed edge was invisible while both requirements sat in
mutually-unordered peers, and became a hard error the moment the graph had to
be layered honestly.

### 5. The intra-capability sweep destroyed real dependency information; this restores some of it

Under the rule that a requirement never declares a dependency inside its own
capability, three genuine soundness edges were deleted because both endpoints
happened to sit in one capability:
`operator-control/board-and-move-interface → staging-is-unvalidated`,
`turn-pacing/final-flush → turn-declaration`, and
`turn-pacing/captain-submit → turn-declaration`. The carve puts the callee in a
different capability, so all three become declarable again — the dependency
record improves rather than degrades. The reverse also happens: four edges that
cross capabilities today become intra and are deleted (see the report's edge
accounting).

**What breaks if reversed:** nothing structurally — but the corpus keeps
recording "the Captain's submit depends on nothing" when it plainly depends on
the declaration operation.

### 6. Fold order gets two levels longer, and that is the honest shape

`live-game-observation` currently sits at depth 3 — the second capability a
developer could archive. That is only true because it reads a per-turn record
it is forbidden to name (the record lives in `replay-and-audit`, downstream of
it). After the carve it can name the record, and it lands at depth 7. The
chain grows from 12 levels to 14.

The compensating movement is the point of the change: the complete
authoritative turn loop, which today is only finished when the *last* of its
four owning capabilities archives at depth 10, becomes one capability at depth
6. Four levels earlier, and behind nothing that renders a pixel.

**What breaks if reversed:** the early-archivability of
`live-game-observation` is preserved on paper, at the price of it continuing
to specify reads against a record its own capability graph says it cannot see.

### 7. Time is measured here and decided in the engine

A game may be configured with no turn limit, and the chess timer's budget grows
every turn, so nothing in the engine bounded how long a game could last. The
first version of this change answered that with an enforcement requirement here:
the instance would measure elapsed duration and, inside the resolving
transaction, decide that the limit had been reached. The reasoning was that
elapsed real time is not a function of committed state, so the engine could not
own the ending without losing its replayability.

**That reasoning was wrong in one place, and the author reversed the design.** It
assumed an engine that *reads* a clock. The engine instead takes the turn's clock
duration and each team's burn as required parameters of both its entry points —
declared inputs, on the same footing as the staged moves and the turn seed. Two
resolutions given the same state, directions, seed **and timings** agree exactly
as before; the tuple grew and stayed closed. So the endings that depend on time
are ordinary end conditions the engine derives, and this capability's job shrinks
to the one part no rule can compute: **somebody has to look at a clock**, and in
a game whose state lives in one hermetic instance, the instance is the only thing
that can.

`game-runtime/turn-timing-measurement` is therefore *measure and supply, never
decide*. It keeps the two invariants the removed requirement had genuinely mined
— that reaching a deadline never triggers a resolution of its own (the obvious
implementation is a scheduled reducer that resolves, racing the all-declared
trigger), and that nothing outside the instance is asked what time it is — and
adds the one the reversal creates: a measurement must be the elapsed time it
names. The engine believes whatever burn it is handed, so a runtime supplying a
configured nominal value instead of a measured one would produce a game whose
clocks are fiction, with every check inside the engine still passing. That is
irreducible, which is exactly why it is stated on the measuring side.

**Two writers of one budget was the real hazard.** The engine already owned the
timer's arithmetic and exported it (`applyTurnStart`, `declareTurnOver`) for this
capability to apply between turns — and `GameState` already carried the per-team
clocks. Had the timings also become resolution inputs while the instance kept
applying the arithmetic itself, a turn's committed clocks and the clocks its
outcome was decided against could differ, unfalsifiably from either side. So the
arithmetic moves into the commit: the instance holds what the last resolution
committed and derives the running clock by subtracting its own measured elapsed
time. `in-game-clock` keeps the parts that commit nothing — draining a clock,
detecting expiry — which is also what keeps `#no-external-timekeeper` and
`#clocks-run-from-playability` true word for word.

**What the ending no longer costs.** The removed requirement had to state that
the record says the duration limit ended the game, because elapsed real time was
not recoverable from committed state and a reader would otherwise see a game that
stopped for no reason its own record explains. With the game's consumed duration
now part of committed state, that ending is recomputable exactly like the turn
limit, and the record's obligation collapses into the ordinary one: carry the
inputs. `turn-keyed-game-record` gains the per-turn timings for that reason —
they are inputs of the resolution, so a record holding only their effects would
reproduce the turn by inventing them.

Termination is still not left to luck. Every turn ends within a bounded interval
whether or not anyone acts, because each team's per-turn clock is capped by the
configured maximum turn time and expiry auto-declares — so resolutions keep
arriving and any time-based ending is caught within roughly one turn of falling
due. The game's maximum duration is the limit plus one turn plus resolution time:
finite, and generous in exactly the direction
`game-lifecycle/stale-game-recovery`'s bound needs. An instance so wedged that no
turn resolves is the case that sweep already exists for.

**What breaks if reversed** (the ending decided here again): the engine can never
report a clock-driven ending, so no tree search can anticipate one — a bot plays
into a lost clock as confidently as into a won position — and a game's real
termination condition sits outside the capability that defines termination, so
every consumer of "the game ended" needs a second case for the ending the engine
cannot report.

**What breaks if reversed** (the instance keeps applying the clock arithmetic
between turns): two writers of one budget, and the disagreement is invisible —
the engine believes what it was told, the instance believes what it wrote, and
the ending is decided against whichever of the two the win check happened to see.

## Constraint-mining

Per the mandatory design rule, each decision was checked for an invariant a
future implementer could silently violate.

- Decision 1 (carve by transactional authority) → the invariant is that no
  operation other than staging, declaration and resolution writes committed
  turn state. Minted as
  `game-runtime/resolving-transaction#no-second-writer`.
- Decision 2 (completeness, not atomicity) → the invariant is that a turn's
  consequences have no second transaction to arrive in. Minted as
  `game-runtime/resolving-transaction#one-commit-carries-everything`, with
  `#assembled-from-instance-state-alone` closing the input side and
  `#outcome-is-the-engines` closing the "the transaction adds nothing of its
  own" side.
- Decision 3 (splits) → the scoreboard's write half needed an explicit
  statement that a row is a durable record fact rather than a subscription
  projection, or an implementer would compute it per subscriber. Carried as
  `game-runtime/per-turn-scoreboard#rows-outlive-the-live-audience` and
  `#written-with-the-turn` (both inherited from the source requirement, which
  had already mined them).
- Decision 4 (edge direction) → no new invariant; the fix is structural.
- Decision 5 (restored edges) → no new invariant.
- Decision 6 (fold order) → no new invariant.
- Decision 7 (time measured here, decided in the engine) → three invariants, all
  minted in `game-runtime/turn-timing-measurement` rather than left to design
  prose: that reaching a limit never triggers a resolution of its own
  (`#the-deadline-resolves-no-turn` — the obvious implementation is a scheduled
  reducer that resolves, which races the all-declared trigger); that a supplied
  measurement is the elapsed time it names rather than a nominal or configured
  value (`#two-quantities-not-one` and the requirement's own sentence — the
  engine believes whatever it is handed, so this is the one obligation nothing
  downstream can check); and that the deciding happens once, in the engine
  (`#measured-here-decided-there` — an implementer holding a measurement and a
  configured limit in the same reducer will compare them, and then two things
  decide when the game is over). A fourth, that one copy of a team's time exists,
  is `game-runtime/in-game-clock#one-copy-of-a-teams-time`, where the clock
  state lives. The complementary invariant — that a configuration cannot omit
  both limits — is `game-configuration/bounded-game-duration`'s, since a
  configuration is validated where it is written.

One invariant was considered and **deliberately not minted**: a rule that the
instance's module is built from the one shared engine build. That is already
`global-invariants/one-shared-engine`, and restating it here would be exactly
the duplication the DRY rule forbids.

## Risks / Trade-offs

- **"This is module 04 again."** The strongest objection, and the one a future
  reader will raise first. Mitigated by the admission test's prongs (b) and
  (c), which keep the read surface, the operator interface, the pacing story
  and the replay viewer out — three of which remain implemented in the same
  deployed module. If a future change argues that invisibility filtering
  belongs here because "it runs inside the instance", prong (c) is the answer:
  it governs what a connection may read, not what the transaction commits.
- **`game-runtime` is the corpus's largest single unimplemented block.** 17
  requirements, and the archive-due gate now blocks on one big change rather
  than four medium ones. This is a truthful re-description of work that is
  already indivisible — `migrate-turn-pacing` cannot finish its section 3
  without `replay-and-audit`'s per-turn writes and
  `live-game-observation`'s aggregate rows landing in the same reducer body.
- **Q35 is only half-answered.** The carve does not remove any capability's
  declared dependency on `operator-control`: `bot-framework` still needs
  manual mode and selection semantics, `turn-pacing` still needs the Captain
  boot and presence, `replay-and-audit` still needs the boot and the
  selection-cleared-at-finish scenario, and `decision-transparency` is
  untouched by the carve entirely (it is Convex plus interface work, not
  runtime work). What the carve changes is *where the runtime work sits*, not
  whether the operator UI is upstream of those four.
- **Cost is concentrated in one commit.** Eight change folders, ~100
  identifier occurrences in the identifier map, six task plans and one
  forbidden folder (`revise-game-engine-contract`). All mechanical, all verified in a
  sandbox — but a single reviewer has to read a large diff, and the seed/edit
  discipline does not apply because every affected delta is ADDED-only.
- **A reader looking for "what happens when I stage a move" now reads two
  capabilities.** True, and it was already two runtimes: the log is in the
  instance and the mode flag is in Convex. The current arrangement hides that
  by putting a runtime table inside an interface story.

## Alternatives considered

- **Do nothing; keep discharging it as a cross-change agreement.** Rejected:
  it leaves the transaction's completeness unstateable and unreviewable, and
  the agreement lives in a `tasks.md` that is deleted at archive.
- **Give the transaction to `global-invariants`.** Rejected on gi's own
  admission test: prong (b) of *that* test is "no single user-story capability
  owns it" — but the deeper problem is that gi is a meta layer with no
  implementation of its own, and a requirement enumerating a reducer's writes
  is implementation-bearing. It would also make gi cite five user-story
  capabilities, reversing the direction gi's Purpose fixes as always
  concrete → gi.
- **Give the transaction to `turn-pacing`.** Rejected: `turn-pacing` would
  then own the history writes, the aggregates and the end detection, none of
  which is pacing, and its Purpose would stop describing a user story.
- **Give the transaction to `game-lifecycle`.** Rejected: the lifecycle owns
  the instance's *existence*, and folding play into it would make the
  capability the same "everything about a game" dumping ground the migration
  broke module 05 apart to avoid.
- **A narrower `turn-resolution` capability holding only the reducer.**
  Rejected: it would own the transaction but not the state the transaction
  reads and writes, so the staged-move log, the record and the clock would
  stay scattered and every write obligation would still be a cross-capability
  citation. It also would not answer Q35, because the staged-move log would
  stay in `operator-control`.
- **A wider `game-instance` capability holding everything in the module.**
  Rejected as module 04 — see the first risk.
