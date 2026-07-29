# mint-game-runtime — Proposal

This is a mint change: ADDED-only, no seed/edit pair. It is **not**
self-contained — it requires the counterpart edits listed under *Changes
outside this folder*, which land alongside it.

## Why

One SpacetimeDB transaction — the resolving reducer — must atomically read
the staged-move log, assemble the game's state and run the shared engine over
it, write the turn's historical rows and events, write the per-turn team
aggregates, apply the clock increment and open the next turn, and detect the
end condition. Six capabilities own pieces of that transaction today
(`operator-control`, `global-invariants`, `replay-and-audit`,
`live-game-observation`, `turn-pacing`, `game-lifecycle`) and **none owns the
transaction**. The assembly step — building `GameState` from instance tables
and invoking the engine — is a `global-invariants` requirement, which by that
capability's own admission test means no user-story capability owns it, so
there is no capability whose spec can state what the transaction reads and
writes as a whole.

The plan already knows this. `migrate-turn-pacing`'s task 3.7 reads: *"the
resolving reducer's body is co-owned … Agree the reducer's assembly order and
file ownership with those changes' implementers."* A task that says "agree it
between four changes" is the visible symptom of a missing capability.

Two consequences follow that no amount of careful task-writing fixes:

1. **Completeness is unstateable.** Nobody can write "these are all the
   writes of a turn, and they commit together", because the enumeration would
   have to name requirements from five other capabilities. The corpus
   therefore has no requirement a reviewer could falsify by finding a turn
   consequence written outside the transaction.
2. **Fold order forces the runtime to the back.** The turn loop is spread
   across capabilities at graph depths 3, 6, 9 and 10, so the last of it is
   only archivable at depth 10 — behind the whole operator UI, the bot
   framework, the bot configuration surfaces and the decision-transparency
   displays. The single largest block of authoritative implementation work in
   the train is gated on user-interface work it does not need.

## Carving decision

Mint **`game-runtime`** — a component-level capability, the corpus's third
non-user-story capability after `game-engine` (root domain vocabulary) and
`global-invariants` (the cross-cutting constraint layer).

The user-story carving stands everywhere else. It is being suspended at
exactly one place, for the reason the migration adopted it in the first
place: the migration's founding observation was that *a single coherent thing
sawn along a seam has to spend prose stitching itself back together*. Here the
coherent thing is not a user story — it is **one ACID transaction and the
state it is authoritative for**. Carving it by user story is the same mistake
in the opposite direction: six stories each holding a slice of one
transaction, with `tasks.md` prose doing the stitching.

`game-runtime` is bounded by an admission test carried in its Purpose, in the
manner of `global-invariants`:

> a requirement belongs iff **(a)** it is realised inside one game's own
> runtime and is authoritative — it commits game state, or defines the
> instance-resident state that committing reads and writes; **(b)** it is
> agent-blind — stated with no reference to a human role, an interface, or
> coordination held outside the instance, so it reads identically for a game
> played entirely by bots with no operator interface in existence; **(c)** it
> is pre-egress — about the instance's own state and transitions, not about
> what a connection may read of them and not about what the platform does with
> the record after it leaves at game end.

(b) and (c) are what stop this from being the retired module `04-stdb-engine`
under a new name. That module was *everything deployed in one artifact*;
`game-runtime` is *everything one transaction is authoritative for*. The
observation surface, the operator interface, the team's pacing and the replay
viewer stay where they are — and three of them are still implemented in the
same deployed module, exactly as `game-lifecycle`'s initialization operation
already is. Capability boundaries and package boundaries are orthogonal in
this corpus and stay that way.

Declared dependencies: **game-engine, game-lifecycle, global-invariants,
identity-and-authorization, test-sequences**. `game-runtime` declares no
dependency on any capability that is downstream of it — no observation, no
operator, no pacing, no framework, no replay — which is what makes it
archivable four graph levels earlier than the same work is today.

## What Changes

- **New capability `game-runtime`** (mint delta, ADDED-only, 18
  requirements). Thirteen move in whole from four capabilities, three are the
  runtime halves of requirements that split, and two are new.

- **One genuinely new requirement, `game-runtime/resolving-transaction`** —
  the owner Q9 says is missing. It states what the transaction assembles,
  that the outcome comes from the shared engine alone, that every consequence
  commits together, and that no second writer of committed turn state exists.
  It does not restate `global-invariants/authoritative-turn-resolution` (one
  transaction, sole authoritative executor); it adds the closed enumeration of
  what is *in* that transaction, which is precisely what no capability can say
  today.

- **A second new requirement, `game-runtime/turn-timing-measurement`** — the
  instance measures what each turn cost, in the two quantities the engine's
  entry points require (the turn's duration, and each team's burn), supplies both
  to the resolution, and decides nothing from them. It exists because a game can
  otherwise be configured with no finite maximum duration (no turn limit, and a
  clock budget that grows every turn), which leaves
  `game-lifecycle/stale-game-recovery`'s bound with no quantity to be generous
  above — and because time is the one resolution input no rule can compute:
  somebody has to look at a clock, and the instance is the only thing here that
  can. The endings themselves are the engine's (`revise-game-engine-contract`), evaluated
  at a turn commit like every other, which is what leaves
  `game-lifecycle/game-end-boundary`, `game-runtime/game-over-freeze` and
  `game-runtime/per-turn-scoreboard` untouched.
  `game-configuration/bounded-game-duration` remains what forbids a
  configuration carrying neither limit.

- **`operator-control` loses the game-runtime state and keeps the story.**
  The staged-move log, the team-granular staging check and the
  no-legality-evaluation rule move. What remains is the operator's workflow:
  the dual connection, selection and its transfer, manual mode, the live
  interface, the board and staging affordances, presence, Captain boot,
  staged-move privacy.

- **`turn-pacing` loses the mechanism and keeps the decision.** The in-runtime
  clock, the declare-turn-over operation, the exactly-once trigger, the
  next-turn bracket and the measurement of what a turn cost move. What remains is *the team decides when its turn
  resolves*: per-operator tempo, the flow quorum, the live pacing parameters,
  the automated player's submission passes, the Captain's override, the
  pacing header.

- **`replay-and-audit` loses the accumulation and keeps the audit.** The
  turn-keyed record, the closed event set and its canonical order, the
  record's sufficiency, connect-time attribution and staged-move attribution
  move; `append-only-history` splits, its instance half moving. What remains
  is what the capability's own Purpose already claims: *what the platform can
  prove about a game after it ends* — the once-at-end export, persistence, the
  team action log, the viewer, public readability.

- **`live-game-observation` keeps every read rule; the scoreboard splits.**
  The write obligation (one row per rostered team per completed turn,
  zero-filled, normalised as-if-ended, computed over the true alive set, in
  the resolving transaction) becomes `game-runtime/per-turn-scoreboard`; the
  read discipline (identical for every connection, aggregates obtained
  exclusively from this channel, client aggregation is a defect) stays.

- **`game-lifecycle` keeps the bracket; the freeze splits out.** Provisioning,
  the once-only initialization, the finish notification and teardown are
  untouched. `game-end-boundary` keeps *a game ends at the commit of the turn
  whose resolution detects an end condition*; the enforcement half — reject
  every gameplay operation from that commit, zero grace window — becomes
  `game-runtime/game-over-freeze`, which declares the lifecycle requirement.

## Changes outside this folder

These are not optional; the change is incoherent without them and they land in
the same commit. All were applied and verified in a sandbox copy of the repo:
`openspec validate --strict` passes on every affected change,
`scripts/check-spec-citations.mjs` passes repo-wide, and `scripts/spec-graph.mjs`
regenerates an acyclic graph.

| File | Edit |
|---|---|
| `migrate-operator-control/specs/operator-control/spec.md` | remove 3 requirement blocks; Purpose `Depends on:` += `game-runtime`; narrow the Purpose's scope sentences |
| `migrate-turn-pacing/specs/turn-pacing/spec.md` | remove 4 requirement blocks; Purpose += `game-runtime`; rewrite the Purpose's opening clause |
| `migrate-replay-and-audit/specs/replay-and-audit/spec.md` | remove 6 blocks; narrow `append-only-history` to the action-log half; Purpose += `game-runtime`, −`test-sequences` |
| `migrate-live-game-observation/specs/live-game-observation/spec.md` | narrow `scoreboard-sole-aggregate-authority` to the read half; Purpose += `game-runtime` |
| `migrate-game-lifecycle/specs/game-lifecycle/spec.md` | narrow `game-end-boundary` to the definitional half |
| `migrate-bot-framework/specs/bot-framework/spec.md` | Purpose += `game-runtime`; retarget 2 dependency entries |
| six `tasks.md` + `revise-game-engine-contract/tasks.md` | retarget every citation of a moved identifier (linted) |
| `legacy-spec-archive/maps/identifier-map.json` | retarget 96 occurrences (48 `target` fields plus scenario anchors); 1 scenario anchor renamed |
| `openspec/maps/identifier-lineage.json` | record 13 requirement renames and 3 splits |
| `packages/stdb/src/index.ts` | 4 `// spec:` citations |
| `openspec/capability-graph.md` | regenerate (`pnpm spec:graph`) |
| `openspec/config.yaml` | add `game-runtime` to the context capability list (at archive) |

## Open Questions

### Q-A. Which way does the `game-lifecycle` ↔ `game-runtime` edge point? — **RESOLVED**

**Context.** Both directions are defensible. The lifecycle creates the
instance and writes turn 0, so the runtime's rules presuppose it; but the
lifecycle's status machine and finish handling rest on the runtime detecting
the end.

**Decision (author-accepted).** `game-runtime` depends on `game-lifecycle`,
and `game-lifecycle/game-end-boundary` splits so that only its definitional
half stays. Rationale: the runtime's requirements genuinely cite
initialization (the board layout is written once at initialization; the first
clocks start when the game becomes playable; the instance's lifetime is the
game's), whereas the lifecycle needs no identifier from the runtime — it
depends on the *concept* of the end-detecting commit, which its own
requirement defines. `operator-control` already declares `game-lifecycle`, so
the ordering is established. The mirror option — move `game-end-boundary`
whole and flip the edge — costs the runtime its ability to cite
initialization and puts the whole Convex lifecycle behind the whole
SpacetimeDB module in fold order, which is backwards from implementation
reality.

**What breaks if reversed:** the runtime can no longer name the initialization
its record and clocks rest on, and `game-lifecycle` archives after
`game-runtime`, so Convex's provisioning work waits on the complete module.

### Q-B. Does `connect-time-attribution` move, or stay in `replay-and-audit`? — **RESOLVED**

**Context.** Attribution's *purpose* is audit, which argues for staying. Its
*substance* is instance-resident state written at admission and read by the
resolving transaction, which argues for moving.

**Decision (author-accepted).** It moves — and not on taste. `replay-and-audit` must be strictly
downstream of `game-runtime` (its export, persistence and viewer all rest on
the record). If the attribution table stayed, `game-runtime` would declare
`replay-and-audit` while `replay-and-audit` declares `game-runtime`: a cycle
the lint rejects. The same argument forces `turn-keyed-game-record`,
`turn-event-record`, `canonical-event-order`, `replay-sufficiency`,
`staged-move-attribution` and the instance half of `append-only-history`.

**What breaks if reversed:** the capability dependency graph acquires a cycle
and `pnpm spec:check` fails.

### Q-C. Does the SpacetimeDB module toolchain belong to this capability? — **RESOLVED**

**Context.** Q33 lists it as unowned: no `spacetimedb` dependency anywhere,
`packages/stdb` `codegen` is `echo 'no codegen yet'`, no module build, no
bindings, no reducer test harness. Every plan that touches the instance
carries a "seam / unowned prerequisite" task about it.

**Decision (author-accepted).** Partly. It stays **mechanism** — no requirement mandates a build
script — but its tasks get owners, split by fold order. `game-lifecycle`
archives before `game-runtime` and already needs the module to build, deploy
and expose one reducer, so the module build, the SDK pin and a smoke harness
belong to its plan. `game-runtime` owns the deepening: client bindings for
every consumer, the reducer test harness that concurrency tests need, and the
determinism harness that `game-runtime/replay-sufficiency` is checked by. Its
one spec anchor is `game-runtime/resolving-transaction#no-second-writer`,
which makes the module's mutating surface a closed, falsifiable set.

**What breaks if reversed** (all of it in `game-runtime`): `game-lifecycle`
cannot reach archive-due without work owned by a capability that folds after
it — an unsatisfiable ordering.

### Q-E. Where is a game's wall-clock duration limit enforced? — **RESOLVED (reversed)**

**Context.** A game can be configured with no turn limit while its clock budget
grows every turn, so nothing bounds how long it can last — and
`game-lifecycle/stale-game-recovery` needs that bound to exist.

**First decision (2026-07-28), superseded.** The engine would declare the
parameter and never read it; this capability would enforce it inside the
resolving transaction as `game-runtime/duration-limit-ending`. The reasoning was
that a wall-clock limit is not a function of committed state, so an engine end
condition over it would cost the engine its replayability.

**Decision (2026-07-28, author).** Reversed. The engine takes the turn's clock
duration and each team's burn as **declared inputs** of both its entry points, so
it never reads a clock and its replayability is untouched — the input tuple grew
and stayed closed. The endings are therefore the engine's: a team out of time,
and a game that has consumed its configured duration, evaluated at the same
commit as every other end condition. This capability's part is
`game-runtime/turn-timing-measurement`: **measure and supply, never decide**.
`game-runtime/duration-limit-ending` is removed, its enforcement clause having
moved to the engine and its two genuine invariants (no deadline triggers a
resolution; nothing outside the instance is asked what time it is) carried by the
new requirement. What the reversal buys is a bot search that can *see* a
clock-driven ending coming, which no arrangement with the ending outside the
engine can offer.

Still rejected: a scheduled reducer terminating the game between turns — it
would need `game-lifecycle/game-end-boundary` widened,
`game-runtime/game-over-freeze` re-anchored, and a final score computed outside
any turn's transaction.

**What breaks if reversed** (back to the limit enforced here): the engine can
never report a clock-driven ending, so no tree search can anticipate one, and a
game's real termination condition lives outside the capability that defines
termination — every consumer of an ending then needs a second notion of how a
game ends.

### Q-F. Who moves a team's clock — the instance between turns, or the resolution? — **RESOLVED**

**Context.** The engine already owns the timer's arithmetic and exports it for
the instance to apply between turns. Once the resolution is *told* what each team
burned, both could move the same budget.

**Decision (2026-07-28).** The resolution moves it, once, at the commit; the
instance holds what the last resolution committed and derives the running clock
by subtracting its own measured elapsed time. `game-runtime/in-game-clock` keeps
what is genuinely the instance's — draining a running clock and detecting expiry,
neither of which commits anything — and gains
`#one-copy-of-a-teams-time` to pin the negative.

**What breaks if reversed** (both writers): a turn's committed clocks and the
clocks its outcome was decided against can disagree, and no check anywhere can
see it — the engine believes what it was told and the instance believes what it
wrote.

### Q-D. Is `staged-move-privacy` in the right capability? — **RESOLVED**

**Context.** It is a read rule over runtime state, then in `operator-control`,
and it fails this capability's prong (c) — so the carve left it behind while
moving the log it governs.

**Decision (author, 2026-07-28).** It moves to `live-game-observation`, whose
Purpose already claims *what each admitted connection may see*, and it now sits
with the other filtering rules rather than apart from them. The carve was right
to exclude it and wrong to leave it where it was: prong (c) says it is not this
capability's, not that it belonged where it happened to be. It retains its
dependency on the log this capability now owns.
