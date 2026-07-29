## Context

Migration change minting `game-configuration` from legacy modules 02, 05,
and 08 (17 ids, 3 review items), per the author-approved capability map,
dependency DAG (game-engine only), and assignment matrix. Legacy text is
binding source material; the module-02 parked ledger's drafted text for
02-REQ-050 was used as a starting point. This file records the decisions
a future reader cannot recover from the specs alone.

## Decisions

### Preview persistence: the shared current-preview slot (author-settled, 2026-07-24)

Module 05 carried two divergent renderings of the board preview: the
requirement text of 05-REQ-032b (persist the starting state on every
regeneration; a `boardPreviewLocked` boolean governs launch reuse) and the
never-reconciled pre-decision Design §2.4 (candidates not auto-persisted; a
client-supplied lock-in payload). A forensic pass established the
chronology: the requirement text was the author's deliberate 2026-04-17
decision (08-REVIEW-015), whose cascade never updated the two-days-older
Design section. During train review the author first read
"persist on every regeneration" as mandating an archive of every candidate
and reversed it; the forensic findings then surfaced the original
decision's actual intent, which the author re-integrated and settled as:

- **One current-preview slot** on the game record, overwritten by each
  platform-side regeneration — never an archive of candidates.
- **Broadcast, not private**: the slot is delivered reactively to every
  configuration surface, so concurrent viewers and rejoining clients all
  render the same candidate (the property the 2026-04-17 decision was
  buying with "trivially reactive").
- **Boards only ever come from the platform**: generation runs in a
  platform mutation/action; a lock request carries no board data — the
  boolean designates the platform-held value, which structurally closes
  both the fabrication hole of the stale Design (client-supplied payload)
  and the WYSIWYG race (the flag designates the exact value every viewer
  is rendering).
- **Auto-clear on any change to the generation inputs** (new, this train;
  widened 2026-07-28 — see below): the lock cannot survive a change to its
  generation inputs, so a frozen configuration and a launched board always
  agree; re-locking is a deliberate act on the new candidate. The absolute
  ("can never describe different generation inputs") is only safe because
  the clear happens in the same transaction as the edit that provokes it
  (global-invariants/transactional-invariant-enforcement): a lock cleared
  in a second, later write would leave a window in which the standing lock
  designates a preview its own parameters no longer produce. The spec
  therefore states the joint outcome and declares the invariant as a
  dependency rather than restating atomicity per requirement.
- **Unlocked launch generates out of sight**: fresh parameters + fresh
  seed at launch, persisted as the starting state, first visible through
  gameplay delivery (board surprise, per 08-REVIEW-015's unlocked arm).

What breaks if reversed to fully ephemeral candidates: shared visibility
and refresh-survivability of the candidate need a bespoke delivery channel
that the slot provides for free, and the lock reacquires a capture race.
What breaks if the slot is read as an archive: candidate exploration
writes game data the product never wanted recorded. Whether the slot and
the designated starting state are one field or two is mechanism.

### The lock's clearing trigger is *generation inputs*, not *parameters* (author, 2026-07-28)

The train-era auto-clear was first written against "board-affecting
parameter edits". That is too narrow, because the parameters are not the
whole input to generation: the engine's generation reads the team
registrations as well — team count drives the angular starting-territory
sectors and, with snakes per team, decides whether every territory can seat
its heads and its initial food. A preview generated for four teams is not a
board for three. The trigger is therefore **any change to what the board is
generated from**: a board-generation parameter, the number of players, or
the composition of teams. Regeneration and lock-clearing move together —
`game-configuration/board-preview` regenerates on the same widened trigger
that `game-configuration/board-preview-lock-in` clears on, so the pair can
never disagree about what counts as a change.

What breaks if reversed to parameters only: a team joining or leaving while
a lock stands leaves a designated board whose snake set does not match the
roster it will launch with — precisely the mismatch the auto-clear exists to
make unrepresentable, arriving through the one input path the narrow rule
left open. The failure is silent up to launch and then either seats the
wrong snakes or fails at instance initialisation, which is the worst
possible moment to discover it. The narrow rule also left the question
"does an enrolment change regenerate the preview?" open as a task; the
widened one answers it by construction.

The residual conflict this does *not* close is the launch-time one: a
standing lock plus a team server that declines to seat at launch still
leaves a designated board for a roster that will not materialise. That is a
launch-gate concern, not a configuration one, and stays a cross-capability
integration task.

### No permissions in this capability; affordances are host-selected (author, 2026-07-28)

The capability originally spoke of "permitted administrative users" in its
Purpose and in three requirements. That was an inherited seam from module
08, and it put an access model inside a capability that has no way to know
the actors: the room story owns who exists and what they may do. The
capability is therefore re-carved to reference permissions **nowhere**.

What ships is a *self-contained configuration component*: mounted with
nothing around it, it presents the whole parameter set, renders the
platform-generated board, and operates the lock, and its outputs are the
game's configuration serialised exactly as stored plus that rendered board.
First delivery is that component standing alone in the development
environment, every affordance offered, nothing gating anything. Because the
component is complete on its own, embedding it later *adds* context rather
than being the precondition for it working — which is what makes a dev-only
first delivery an honest increment rather than a throwaway harness.

The seam that makes the later embedding possible is
`game-configuration/host-selected-affordances`. The component groups what it
offers into three kinds, named in vocabulary local to itself so that no
permission concept leaks in: **inspection** (reading the parameters and the
current board), **parameter editing**, and **board designation** (setting and
clearing the lock). At mount time the host passes one explicit parameter per
kind saying whether it is offered. The component derives no actor, holds no
access rule, and consults no notion of who is present. The room story will
map its own roles onto these three kinds; nothing about that mapping is
knowable here, and nothing about it needs to be.

Why three and not one flag or one per widget: one flag cannot express the
common shape — everyone in a room watches the configuration, fewer people
change it, and designating the board that will actually be played is
plausibly narrower still — while a flag per widget would make the host
responsible for the component's internal composition and would churn every
time a parameter is added. Three kinds is the coarsest grouping that
survives the widget set changing.

Integration with the invariants: offering a kind is a **presentation**
decision, never an authorisation one, so this requirement neither restates
nor competes with global-invariants/security-enforced-outside-the-library.
The `#hiding-is-not-enforcing` scenario was originally kept here, on the
grounds that it states a local, falsifiable consequence of *this*
parameterisation — the obvious wrong implementation is to treat the mount-time
flags as the gate. It has since moved to
application-shell/surface-mounting-contract, together with the clause that the
component derives no actor and holds no access rule: that is the contract every
mountable surface in the application is written to, and once it is stated there,
restating it here is the duplication the DRY rule forbids rather than a local
specialisation like `#out-of-range-rejected-regardless-of-client`. What this
requirement keeps is what only the configuration surface can say: which three
kinds it groups its affordances into, and that they are independently
selectable. The requirement declares
global-invariants/one-contract-many-surfaces, because a surface that omits an
affordance is only harmless while every surface dispatches against one
contract. Similarly, withholding a kind is not the client-side optimism that
global-invariants/client-truthfulness forbids: the component is not
simulating a server invariant, it is rendering the subset it was told to
render, and the record's answer is still authoritative for anything that
reaches it.

What breaks if reversed — permissions back inside this capability: it would
have to reference the room story's actors, inverting the author-approved
DAG (a peer user-story capability cited from here), and the component would
stop being mountable anywhere but a room, so the standalone dev delivery and
any future host (a tournament setup screen, an admin tool) would each need a
fake actor to satisfy a check that is not this component's to make.

### Parameter bounds: read from the engine, never restated (author split, 2026-07-28)

**Investigation of `packages/engine/` (read-only).** The engine performs
**no bounds checking of configuration inputs at all**, and this is
deliberate, not an omission: `game-engine/configuration-parameters` states
"Numeric bounds SHALL be enforced by the user-facing configuration surfaces;
the game engine itself accepts any type-valid configuration", pinned by its
`#bounds-live-at-the-surfaces` scenario. `generateBoardAndInitialState` and
`resolveTurn` consume whatever numbers they are handed. The bounds
themselves exist in the engine in exactly two places, neither of them usable
as a contract:

1. Line comments on the fields of `GameOrchestrationConfig` /
   `GameRuntimeConfig` (`// 1-10, default 5`) — prose, unreachable by code.
2. `CONFIG_RANGES` in `src/arbitraries.ts` — a real, complete, exported
   min/max table for all fifteen parameters, but explicitly documented "Not
   part of the package's public API", not re-exported from `src/index.ts`,
   and existing only to feed the property suites' fast-check arbitraries.

The only configuration data the engine exports publicly is
`DEFAULT_GAME_CONFIG`. So bounds are, today, undeclared as data — while
already being duplicated four times across the repo in weaker forms (the
comments, `CONFIG_RANGES`, the visual-tester Zod schema which mirrors the
shape with no bounds at all, and the divergent hand-rolled `GameConfig` in
`packages/stdb`).

**Is a schema/validation library with reflection feasible here?** Partly,
and it is the wrong instrument. Feasible: Zod v4 is already in the repo
(`apps/visual-tester`), is pure ECMAScript, and supports the reflection this
would need. Wrong instrument, for three reasons: (a) the engine's dependency
policy is deliberate and documented — `@noble/hashes` is its *only* runtime
dependency and was admitted only because a spec mandate forced it, and the
package must stay pluggable into all four consumers; (b) the authoritative
validator on the configuration path is Convex's own `v.*` validator system,
which cannot consume a Zod schema without a further bridge, so a Zod schema
in the engine becomes a *fifth* representation rather than a collapse of the
existing four; (c) what "reflection and form generation" actually requires
is *bounds as iterable data*, which a plain descriptor table supplies with
no dependency at all — and the engine already has one in `CONFIG_RANGES`,
merely unpublished.

**Decision.** The authored rule is
`game-configuration/parameter-bounds-sourcing`: every bound this capability
enforces and every bound its surface presents is *read from* the engine's
declared bounds, never restated. The mechanism the implementation should ask
`game-engine` for is a public, reflectable parameter descriptor exported as
data — per parameter: its path in the configuration tree, its kind, min,
max, default, and any disable sentinel — from which the Convex validator's
range checks, the editing surface's widget limits, and `CONFIG_RANGES`
itself all derive. That is an engine-side change and is therefore requested,
not made here.

**Ownership split (author's position, authored as written; simplified later
the same day by the board-generation move — see below).** Bounds on
parameters that only shape a game already under way — hazard damage, the
potion spawn rates, maximum health, the clock — are the engine's alone and
are reflected here unchanged. Bounds on board-generation parameters are
*additionally* this capability's, because the useful ones are contextual:
whether a given board size admits the requested snakes per team depends on
how many teams must be seated, which the engine declares its bounds without
knowing. The two positions reconciled against the binding engine spec, which
listed ranges for the generation parameters too: the engine's declared range
was the outer limit, and what this capability owned was the *tightening* of
that range against the current roster — never a widening, and never a second
set of numbers for the same fact.

**What the board-generation move did to that split.** The engine's parameter
vocabulary no longer carries the five generation parameters at all, so the
outer limit the tightening sat inside no longer exists. The split therefore
collapses to something simpler and strictly better: **each parameter has
exactly one declaration, and which capability declares it follows from
whether a turn's resolution reads it.** Gameplay bounds are the engine's and
are read from it; generation bounds are this capability's own
(`game-configuration/generation-parameters`), and the roster-contextual
tightening is a derivation over that declaration rather than a negotiation
with a second one. Nothing about "read it, never restate it" changed — that
was always the load-bearing half, and it now applies to two declarations
instead of one. The engine-side export requested below is correspondingly
narrowed to the gameplay parameters.

What breaks if reversed to documented duplication (bounds written out in
both the engine and the surface, with an alignment obligation in prose): the
obligation has no enforcement, and the repo already demonstrates the failure
mode four times over — the visual-tester schema mirrors the shape and
silently dropped every bound. A widget that still offers 0–30 after the
engine widens hazard percentage is a bug no test can see, because the two
copies are each internally consistent. The fallback is only acceptable if
the engine export is refused, and then it needs a test that reads both
copies and compares them, which is the single-source solution wearing a
disguise.

### Every game must be bounded: a turn limit or a time limit (author, 2026-07-28)

**The hole.** The engine's parameters admit `maxTurns` 0 — no turn limit — and
the chess timer grants each team `clock.budgetIncrementMs` more budget every
turn, which a team that declares quickly gains faster than it spends. Losing on
time exists as an ending, but a team that never runs its total time down never
reaches it, and no other rule ends a game on time. So a configuration this
capability would happily accept can describe a game with **no finite maximum
duration**. That is not only a product oddity:
`game-lifecycle/stale-game-recovery` specifies its staleness bound as generous
above "the longest game the configured clocks and turn limit can produce", and
that phrase names nothing while a no-limit-at-all configuration is legal.

**Decision.** A configuration carries at least one of the two limits — a turn
limit or a limit on wall-clock duration — and the wall-clock limit is added to
the vocabulary as an affordance (`maxGameDurationMs`, declared by the engine in
`revise-game-engine-contract`, default 0). Three properties made this shape the cheap
one:

- **The parameter belongs in the engine's vocabulary.** Anything else contradicts
  four requirements at once: `closed-parameter-vocabulary` admits exactly the
  engine's parameters, `engine-schema-fidelity` mirrors the engine's config types
  field-for-field, `parameter-bounds-sourcing` requires every bound to be read
  from the engine's declaration rather than restated, and
  `generation-parameter-boundary` forwards only the gameplay subtree to the
  per-game runtime — which is where the limit has to arrive to have any effect.
  (This point originally added "even though the engine never reads it", on the
  reasoning that a wall-clock limit cannot be an engine end condition. The author
  reversed that the same day: the engine takes each turn's duration and each
  team's burn as *declared inputs* of its resolution entry points, so it reads no
  clock, stays replayable from its inputs, and evaluates the limit itself. The
  four reasons above are unaffected — they were about the parameter's home, not
  about who acts on it — and nothing in this capability's delta moved.)
- **It is a cross-field condition, not a range.** `closed-parameter-vocabulary`
  validates each value against *its own* parameter's type and range; "at least
  one limit" is a predicate over two fields together, which no bound on either
  can express. That is why it is its own requirement rather than a widened
  range, and why it is not a restatement of the validation rule it sits beside.
- **Rejection at the record, not discouragement in a widget.** The condition is
  guarded inside the transaction of any write that could leave the record
  without either limit, so the record never *holds* an unbounded configuration —
  which is what lets a downstream reader treat "this game's configuration" as
  sufficient to bound the game, with no second check. Launch is gated too, for
  the game whose configuration predates the rule or arrives by any other path.

The visible cost is **edit ordering**: switching a turn-limited game to
duration-limited means setting the duration limit before zeroing the turn limit,
because the intermediate state with neither is refused. Authored as
`#switching-which-limit-applies` rather than smoothed away, because the
alternative — validating the conjunction only at launch — is strictly worse: the
record would then be allowed to sit in a state its own terms cannot bound, and
every consumer that reads a not-yet-launched game's configuration would need to
know that. Presenting the two limits as one joint affordance is the surface's
answer to the ordering, and is presentation mechanism.

**What breaks if reversed** (no such constraint, or a UI-only nudge): a game can
be configured to run forever, and the failure surfaces nowhere near the
configuration screen. It surfaces in `game-lifecycle`'s stale-game sweep, whose
bound has no finite value to be generous above — so either the sweep picks an
arbitrary number and eventually recovers a game that is genuinely still being
played (finishing it out from under its players, the one thing that requirement
is built to never do), or it picks a huge number and a genuinely lost game sits
at `playing` for that long. Both failures are attributed to the sweep, and
neither is fixable there.

**Interaction with the board preview and the lock.** The duration limit is a
dynamic gameplay parameter, not a board-generation input: board generation never
reads it, so editing it neither regenerates the preview nor clears the lock.
Left ambiguous, an implementer deriving the regeneration trigger from "any
parameter edit" (rather than from the generation inputs, as the plan requires)
would clear a deliberate designation over a parameter the board cannot depend
on. Pinned by `board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing`,
which states the rule for the whole class rather than for this one parameter.

**Interaction with the launch freeze.** The freeze needs nothing new: the
constraint is checked on every write and the engine's default configuration
already carries a turn limit, so a record only reaches launch satisfying it. The
launch gate in `#launch-cannot-freeze-an-unbounded-game` is therefore
belt-and-braces by design — it is the point at which the configuration becomes
the game's permanent terms, and the cost of checking a two-field predicate once
more there is nil against the cost of a frozen unbounded snapshot.

### The minimal `games` table is created here (author, 2026-07-28)

The configuration record's physical home is a `games` table that does not
exist: both Convex schema files are stubs awaiting the SDK install. The
table, and the game's `status` field, read naturally as the lifecycle
story's property — but this change archives *before* the lifecycle change in
capability-dependency order, so waiting for it would leave this capability's
central requirement with nowhere to live.

Decision: **this capability creates the table, minimally** — the game's
identity plus the configuration this capability owns (the two engine
subtrees, the current-preview value, the lock) — and the capabilities that
own the rest of a game's life extend that same record. Authored as a
sentence in `game-configuration/config-lives-on-the-game` and pinned by
`#the-game-record-starts-minimal`, phrased without naming the lifecycle
capability, which is not a declared dependency.

What breaks if reversed: either this change cannot be implemented before the
lifecycle change (inverting the archive order the fold enforces), or the
configuration lands on a second record keyed to the game — and then "exactly
one configuration record, on the game record itself" is false the moment the
real table arrives, and every view has two places to look. "Minimally" is
the load-bearing word: creating the table is not a claim on `status`,
launch, or successor creation, all of which stay the lifecycle story's.

### Config on the game record, one live editable game (05-REVIEW-008)

The room holds no configuration state; every game carries its own record,
and at most one game per room is open for configuration at a time. This is
the resolved 05-REVIEW-008 architecture: with no room-level parameter set,
game turnover (a finished game being succeeded by a fresh editable one)
has nothing to race against, and "which values govern this game" always
has exactly one answer — the game's own record. Reversed, config edits and
game turnover race, and historical games could display values they never
ran under. The display half (08-REQ-102's "snapshotted params, never
defaults") folds into the same requirement as
#views-read-the-games-own-record: under config-on-the-game it is not a
separate rule but the observable consequence of the single record plus the
launch freeze.

### UI-mirror requirements folded; enforcement authored once

08-REQ-027d (client range checks are UX-only), 027d1 (board-size widget),
and 027e (visual gating of conditional parameters) each mirrored an
authoritative Convex-side rule. Per the author's instruction, enforcement
is authored once, in the owning requirement, and the UI's obligations
appear as reflect/never-bypass scenarios
(#out-of-range-rejected-regardless-of-client, #board-size-round-trip,
#ui-communicates-without-blocking). Reversed — parallel UI requirements
restating the server rules — the two copies drift and the spec re-imports
the legacy corpus's stitching problem.

The fold's second half is what the requirements now *omit*. Three of them
carried the same hedge — client-side validation is a UX affordance and
never the enforcement point; no affordance, client, or programmatic path
bypasses the freeze; a doctored client cannot smuggle a board in. All three
are consequences of one invariant,
global-invariants/security-enforced-outside-the-library (enforcement lives
in the authoritative stores' function contracts, never in the Server
library and never in what an application chooses to present or hide),
together with global-invariants/one-contract-many-surfaces (every surface
dispatches against the same contract, so none has a private bypass). Three
copies of a rule this capability does not own would drift and carry no
authority, so the hedges are deleted and the integration is pinned here:
this capability authors *where* each value is checked (the configuration
record) and *what* is checked (the engine's vocabulary, the edit window,
the lock's designation); *that* client-side behaviour can never be the
check is global-invariants' rule, inherited whether or not any requirement
repeats it. The reflect/never-bypass scenarios that survive
(#out-of-range-rejected-regardless-of-client, #board-size-round-trip,
#ui-communicates-without-blocking, #hiding-is-not-enforcing) each state a
local, falsifiable consequence — not the general rule again. Consequently
the lock request's no-board-data shape stays a requirement (it is a
structural property of the mutation's contract, something an implementer
could get wrong) while its "a doctored client cannot smuggle a board"
justification does not.

Within that fold, 08-REQ-027d1 was deliberately demoted to its intent
grain: the spec keeps the round-trip discipline (the raw integer is the
only persisted value; the widget derives its display from the stored
integer), because that is the invariant a future implementer could
silently violate (persisting a preset token would corrupt the schema
mirror). The preset list itself — four named options, their labels and
values — is presentation mechanism and stays in code; the legacy text
never enumerated the presets, so nothing binding is lost.

### Board generation comes here, and what arriving obliges (author, 2026-07-28)

The engine's spec carried seven requirements describing how a board is
*built* — the wall ring, hazard proportion and connectivity, fertile patches
and their noise knobs, the angular starting territories, the snakes and food
placed in them, and the bounded retry over all of it — plus five
configuration parameters that exist only to feed them. Nothing in turn
resolution reads any of it. The author's correction is that the engine should
take a **fully specified board** and nothing else, so those requirements move
here, in a single change paired with `revise-game-engine-contract`, which
removes them.

**Why here.** This capability already owns the parameters generation reads,
the preview that renders its output, the lock that designates one, and the
boundary that keeps generation platform-side and out of the per-game runtime.
Adding the rules themselves puts the whole "what does a board look like
before its first turn" story in one readable place. Per the corpus rule that
a capability does not own a section of code, the algorithm may keep shipping
from `packages/engine/` — and does, for now — while the contract lives here.

**Six arrive unchanged; `board-geometry` splits.** `hazards`,
`fertile-ground`, `starting-placement`, `initial-snakes`, `initial-food` and
`board-generation-retry` keep their slugs, which is what makes the lineage
1:1 and legible. `game-engine/board-geometry` stays in the engine, reworded
from a construction rule into the validity rule the engine actually applies,
and the complete Wall ring leaves as
`game-configuration/generated-board-shape`. The ring left because resolution
never depended on it: off-board resolves exactly as a `Wall` cell does and
spawning excludes the border by index, so a ringless board resolves
identically. Two scenarios were absorbed rather than moved —
`hazards#permanence` and `fertile-ground#stable-designation` say one thing
about a board in play, and that is now `game-engine/board-geometry#terrain-is-fixed`.

**Two requirements this capability had to author itself.**
`generation-parameters`, because the engine's table no longer declares the
five parameters and `parameter-bounds-sourcing` would otherwise point at
nothing; and `generated-board-shape`, the ring. `boardSize` needed a default
it never had — the engine's table left it blank deliberately, since the
engine has no use for one — and `21` is declared here because a
configuration record must initialise and that is the value the shipped
`DEFAULT_GAME_CONFIG` already uses. (The legacy module-05 table showed 13;
the code has said 21 for as long as it has existed, and the record is what
this decision is about.)

**Two capabilities describing "the board" is the failure this must avoid**,
so the split is by distinct names and disjoint facts rather than a mirrored
pair. There is no `game-configuration/board-geometry`. The engine's
requirement says what a board is *to a resolution*; these say what generation
*produces*; and the single declared edge runs from here to
`game-engine/board-geometry`.

**The gap this move opened is now closed.**
`global-invariants/one-shared-engine#no-parallel-implementation` binds "domain
types or turn-resolution algorithm" and never named board generation. While
generation was inside the engine that was harmless; after the move nothing at
the invariant layer forbade a second implementation, and a spec-only move must
not quietly delete a constraint that was in force before it. The durable home
is a `global-invariants` requirement, and neither of the two changes making
this move may amend `global-invariants`; `mint-platform-persistence` already
carries a gi delta, so `global-invariants/one-shared-generation` is minted
there. Its rationale, the admission test worked through prong by prong, and the
scope argument — one *implementation*, not one *definition* and not a
*location* — are in that change's design.md §2b–2c.

Two consequences here. `generation-parameter-boundary` **loses** its clause
"board generation therefore has exactly one home and one implementation, which
every surface that needs a board calls rather than reproducing": that is now
word-for-word the invariant, and the DRY rule forbids the copy. What stays is
the partition and the platform-side consumption, which are genuinely this
capability's — and the requirement declares the invariant it now rests on.
`board-preview` declares it too, because its claim that the preview "is produced
by the same generation the launch will use" is not merely vague under two
implementations, it is false. Deliberately *not* declared:
`board-preview-lock-in` (every clause survives two generators intact; the
sameness claim it leans on is `board-preview`'s), `parameter-bounds-sourcing`
(its parties are the widget and the record, not the generator), and the eight
generation rule requirements (they bind every implementation by their own terms
— and `game-engine/determinism` sets the precedent by not declaring
`one-shared-engine` either).

**What breaks if reversed** (generation stays in the engine's spec): the
engine declares five parameters no resolution reads, so this capability's
schema mirror carries them, its bounds sourcing has to reconcile a
roster-contextual tightening against an outer range whose owner cannot see
the roster, and the vocabulary rule "exactly the engine's parameters" quietly
means "exactly the engine's parameters, half of which the engine ignores".
The concrete cost shows up at the preview: `board-preview` and
`board-preview-lock-in` regenerate on *the inputs generation reads*, and
those inputs being defined in another capability is what made the
lock-clearing trigger hard to state in the first place.

### The parameter boundary is authored from the configuration side

02-REQ-050's parameter split and 05-REQ-032d's subtree partition become
game-configuration/generation-parameter-boundary: board-generation
parameters are consumed platform-side into a precomputed initial state;
the per-game runtime receives only dynamic gameplay parameters plus that
state, and never generates a board (the generation-locality half of
08-REVIEW-014; its no-client-generation half lands in
game-configuration/board-preview#clients-render-never-generate). The
launch orchestration that performs the handoff belongs to the
game-lifecycle story; what is authored here is the shape of the boundary,
which is configuration's contract. Reversed — generation allowed in the
runtime or the client — board secrecy (the unlocked fresh-seed path) and
the single-authority determinism story both collapse.

### Boundary phrasing without naming sibling capabilities

05-REQ-026's bot-parameter exclusion is a boundary with the
bot-configuration story, and 08-REQ-102's display rule borders
game-lifecycle. Both are phrased self-containedly ("bot behaviour
parameters are owned elsewhere"; "that game's own record") because neither
owning capability is among this one's declared dependencies, and citing a
peer user-story capability would invert the author-approved DAG. The
declaration itself is an affordance rather than a fixed budget: this change
extends it from game-engine alone to game-engine plus global-invariants,
because several requirements here are only sound while named invariants
hold (the single persistent deployment behind "exactly one configuration
record", the one shared engine build behind the schema mirror and the bounds
source, the one-home rule and instance hermeticity behind the generation
boundary, in-transaction guarding behind the launch freeze, the lock's
auto-clear, and the one-open-game exclusivity, and one-contract-many-surfaces
behind the host-selected affordances). Extending toward the meta layer is
legitimate in a way extending toward a peer story is not — the direction
stays concrete → global-invariants, and global-invariants declares only
game-engine, so no cycle appears.

Two phrasings do the same work for the re-carve: "the capabilities that own
the rest of a game's life" (the minimal-table decision) and "whatever host
mounts it" (the affordance seam) each name the *role* the sibling plays
without naming the sibling.

### Intra-capability dependency declarations removed

Per the corpus-wide rule that a requirement never declares a `Depends on:`
entry naming a requirement of its own capability — the requirements of a
capability are one integrated cohort, and an internal edge adds ordering
noise without adding traceability — `game-configuration/board-preview`
dropped its declaration of `game-configuration/board-preview-lock-in`. The
relationship survives in the prose, which names the concept (the preview
"designates the game's starting state only through lock-in or launch")
without carrying the identifier.

### Freeze wording covers the never-launched ending

02-REQ-050 ties the freeze to launch; 05-REQ-024 ties editability to the
awaiting-launch state. A game can end without ever launching (a walkover),
which the launch-anchored phrasing alone would leave editable forever.
game-configuration/launch-freeze therefore says: editable only while the
game awaits launch; frozen at launch; a game that ends without launching
likewise stops being editable. This is 05-REQ-024's model stated
completely, not new policy.

### Mechanism deliberately left in code

Regeneration cadence (debouncing of rapid parameter edits) is
design-level per the legacy text and stays that way; the reactive delivery
channel's implementation, the mutation names, the preset widget's option
list, and how the three affordance kinds are expressed as component props
are all code mechanism. None carries an invariant beyond what the authored
requirements already pin.

## Constraint-mining (mandatory final step)

- **Minted: game-configuration/engine-schema-fidelity.** The whole design
  assumes the stored configuration's gameplay half and the engine's own
  configuration types are the same shape — the no-translation handoff, the
  closed vocabulary, and the parameter boundary all silently depend on it.
  Module 05's Design carried this as a compile-time `AssertEqual` drift guard;
  that is exactly an invariant a future implementer could silently violate (add
  an engine field, forget the mirror, ship a validator that drops it). **The
  guard itself has since moved to global-invariants/engine-mirrors-are-guarded**,
  because the corpus has four mirror sites across three runtimes and what they
  share is a fact about engine types rather than about this capability — two of
  the sites mirror those types for reasons unconnected to configuration at all
  (`mint-platform-persistence`'s design §2 carries the argument, and corrects an
  earlier and false "cannot declare this one" framing of it). What this
  requirement keeps is *what must correspond*, and it declares the invariant
  that makes the correspondence hold.
- **Minted: game-configuration/parameter-bounds-sourcing.** The
  bounds decision's quality rests on there being exactly one set of numbers.
  Duplication is the silent violation — the repo already contains four
  weakened copies of the engine's bounds, and a drifted widget limit is
  invisible to any test that reads only one side. Stating "read from the
  engine's declared bounds, never restated" as a requirement is what makes
  the duplication a spec violation rather than a style preference.
- **Minted: game-configuration/host-selected-affordances.** The
  no-permissions carve is only sound while the mount-time parameters stay a
  presentation choice. An implementer who reads them as the access check
  produces a component that looks correct standalone and is a security hole
  the moment a host mounts it with a narrow selection — precisely a
  silently-violable invariant, so it is a requirement with the
  `#hiding-is-not-enforcing` scenario rather than a design note.
- **Minted: game-configuration/bounded-game-duration.** The whole corpus's
  treatment of a game as a thing that finishes — the staleness bound most
  visibly — rests on every game having a finite maximum duration, and nothing
  enforced it. The silent violation is the ordinary one: a configuration with
  both limits at their sentinels validates field by field and is accepted, and
  the consequence appears in another capability's sweep. Stating it as a
  condition on the record makes the unbounded configuration unrepresentable
  rather than merely unwise. Minimally constraining: it demands one of the two
  limits and says nothing about which, nor about their values beyond the bounds
  the engine already declares.
- **Minted: game-configuration/generation-parameters.** The board-generation
  move removes the only declaration these five parameters had, and the silent
  violation is the obvious one: a validator or a widget hardcodes 7–32 because
  there is nothing left to read it from, and the copy is internally consistent
  and invisible to every test that reads one side. Declaring them here as data,
  in the same reflectable shape the engine's descriptor uses for the gameplay
  half, is what keeps `parameter-bounds-sourcing` true of both halves rather
  than only of one.
- **Checked, already requirements**: persist-on-every-regeneration and
  no-client-generation (the other two invariants the preview design's
  quality depends on) are authored directly in
  game-configuration/board-preview; authoritative-validation-at-the-record
  is authored in game-configuration/closed-parameter-vocabulary; the
  widened lock-clearing trigger is authored in
  game-configuration/board-preview-lock-in with a roster scenario on each
  side of the pair.
- **Checked, plastic**: debounce cadence and the preview warm-up-style
  optimisations are performance-motivated mechanism — doc comments citing
  this change suffice when they land.
