## Context

Migration change minting `turn-pacing` from legacy modules 04, 06, 07, and
08 (24 ids — one a documented drop — and 5 review items), per the
author-approved capability map, dependency DAG (game-engine +
operator-control + bot-framework + bot-configuration), and assignment
matrix. Legacy text is binding source material. Two structural facts shape
this change: the chess timer's arithmetic RULES already live in
`game-engine/chess-timer` (this change authors their runtime realization
and the workflow above them, citing rather than restating), and the
legacy corpus's team-level "operator mode (Centaur/Automatic)" model was
superseded twice in review — first by per-operator ready-state, then by
durable per-operator tempo — so this change authors the tempo model only.
This file records the decisions a future reader cannot recover from the
specs alone.

## Decisions

### Realization cites the rules; the invariant is promoted to every instant

The engine owns what the clock arithmetic *is*; the game instance owns
*running* it — autonomously, in its own state, mediated by no external
runtime (`in-game-clock`). The legacy correction chain (the budget
carve-out cascade) fixed a model in which the budget was not debited when
the clock was carved out, making depletion unreachable; its residue is
promoted to spec text as the every-instant invariant: budget + clock =
total remaining time at every observable moment, not merely at turn
boundaries (`#invariant-at-every-instant`). What breaks if reversed
(external timekeeping): the game's tempo acquires a dependency on the
liveness of systems the game was deliberately isolated from — a Convex
hiccup would stop the clock — and expiry, which must fire with nobody
connected, has no home. What breaks if the invariant is boundary-only: a
mid-turn reader (the automated player computing its deadline from
observed remaining time, the header) sees double-counted or vanished
time, and the deadline math silently degrades.

### Turn-0 clocks start at playability (constraint-mined)

Nothing at legacy requirement level said when the first turn's clock
starts; the legacy design started it at initialization completion, and a
future implementer could defensibly start it at "first operator connects"
instead — making the first turn's time depend on how quickly each team
shows up. Minted as `#clocks-run-from-playability`, phrased against "the
moment the game becomes playable" (the lifecycle story owns what makes a
game playable; this capability owns only that the clocks are already
running then, with no grace period). What breaks if reversed: turn-0
timing becomes per-team subjective, the recorded first-turn duration
stops matching the clock rules, and a team can farm setup time by
connecting late.

### Declaration: team-only, idempotent, kinds distinguishable, snakeless auto

One requirement (`turn-declaration`) carries the declaration operation and
both implicit paths. It also carries, since 2026-07-28, the *other* half of
team-granular authorization: the instance does not care **which** operator
issued an instruction, and it nevertheless always records **which specific
authenticated identity** sent the command
(`#team-granular-but-never-anonymous`). The two halves were previously only
one — the requirement stated the missing check and left the recording
implied — and a reader can plausibly slide from "no finer check" to "the
instance cannot say who did it", which is false and would license reducers
that discard the caller identity. Authorization coarseness and attribution
completeness are independent axes and the requirement now says both. The
recording is sound only while every mutating action arrives under an
authenticated identity of decidable kind
(global-invariants/authenticated-unambiguous-identity), which the
requirement therefore declares. What breaks if reversed: an operator's
declaration becomes an act of "the team" with no answerable author, and the
audit story that carries the attribution
(game-runtime/connect-time-attribution) has nothing upstream
guaranteeing the instance kept the value it is supposed to carry untouched. Idempotency is load-bearing, not hygiene: several
actors can legitimately declare for the same team in the same turn (an
operator, the automated player at its deadline, the Captain), and the
banking step must not double-credit. Expiry detection is the instance's
own act — it must fire with zero clients connected. Snakeless teams count
as declared at each turn's start so an eliminated team's clock never
gates the survivors. Declaration kinds (explicit / expiry / snakeless)
are authored as distinguishable behaviour; the per-turn *record* that
persists them is the audit story's (the legacy record id is its row, not
this change's). What breaks if reversed: without idempotency, the credit
arithmetic corrupts under racing declarers; without autonomous expiry, an
absent team hangs the game forever; without the snakeless rule, every
post-elimination turn waits out a dead team's full clock; without
distinguishable kinds, replay cannot tell a deliberate submission from a
timeout — materially different accounts of the team's play.

### Exactly-once resolution, and the bracket around a committed turn

The all-declared condition is the sole resolution trigger, firing exactly
once (`exactly-once-resolution`); after commit, nothing late is ever
silently reordered into the committed turn, and the next turn opens with
the commit — increment, fresh carve-out, staging and declaration open
(`next-turn-bracket`). What breaks if reversed: a second trigger path
(wall-clock, admin) makes resolution timing nondeterministic with respect
to the recorded declarations, and double-firing resolves one turn twice —
the engine's determinism guarantees are downstream of the trigger being
unique; late reordering would edit committed history, which the entire
append-only record model forbids; a gap between commit and next-turn-open
would create an interval in which staged moves are neither turn T's nor
turn T+1's.

### The live pacing-parameter record: a record, not a log derivation

The resolved legacy review chose a live game-scoped record over deriving
current values from the action log, and the author's split assigns its
timing fields here (its temperature field was the configuration story's).
Authored as `live-pacing-parameters`: initialised from the captured
defaults at game start (citing the configuration capability's capture
requirement), independently mutable during play, and the direct operative
source for every consumer — this change also names the three parameters'
semantics (allocation, interval, threshold) that the configuration
capability deliberately stored as opaque scalars. What breaks if reversed
(log derivation): every consumer — most critically the automated player's
deadline arming, which runs on a per-turn timer — re-scans an unbounded
log on every read, and two consumers with different scan logic can
disagree about the current value mid-turn.

### The automatic submission time allocation defaults to the turn's own accrual
### (author-decided 2026-07-28)

`live-pacing-parameters` said the live values are "initialised from the
team's captured defaults", and nothing anywhere said what a team's default
*default* is. The author has now fixed it: absent a team setting, the
automatic submission time allocation is **exactly the clock time the game
accrues to the team each turn** — the increment the engine's chess timer
adds to the team's budget per turn. The principle is "as long as the game
gives you, and no longer": a team left at the default spends its accrual
every turn, so its total remaining time neither drains nor banks, and it
uses the whole of what the format budgets for a turn without ever eating
into the reserve it will need later. Any platform-chosen constant is worse
by construction — too small and the default wastes time the game granted;
too large and the default quietly bankrupts every team that never touches
it, in a format-dependent way nobody tuned for.

**Why here and not on `bot-configuration/team-bot-parameters`.** The captured
default belongs to that capability, which was the tempting home. Two reasons
it is wrong. First, that requirement deliberately holds the three timing
parameters as *"opaque team-tunable scalars whose consumption semantics are
owned elsewhere"* — a rule saying what one of them **means** in terms of the
game clock is exactly the consumption semantics it declines to own, and this
capability is the "elsewhere". Second, and decisively, the rule is stated in
game-engine vocabulary (per-turn clock accrual) and `bot-configuration` does
**not** declare `game-engine` among its dependencies, while this capability
does — so the requirement is unstateable there without dragging a new
capability-grain dependency into a capability that has no other use for it.
`live-pacing-parameters` additionally already owns the *initialisation* step
the default participates in, so the rule lands in the sentence it modifies.
The one thing `bot-configuration` does have to change is small and squarely
its own: its record must be able to hold a timing parameter as **unset**
rather than storing a placeholder, which is what gives the default something
to be the default of.

**What breaks if reversed** (default living in the configuration record, or as
a platform constant): the record has to name a number, so either
`bot-configuration` acquires a `game-engine` dependency and starts stating
clock semantics it declared out of scope, or the platform picks a constant
that is wrong for every game format whose per-turn budget differs from the one
it was picked against — and the failure is invisible, showing up as teams
mysteriously running short in long-budget games and idling in short-budget
ones, with no surface anywhere saying why.

### Tempo: durable, self-owned, flow-on-rejoin as the only automatic write

The tempo model's essence is a cost inversion: routine turns must cost
zero operator actions (tempo persists across turns; flow is the resting
state), while slowing down is the deliberate, explicit act. Hence
`operator-tempo`: durable across turns, written only by its operator,
toggleable at any moment, and exactly one automatic write — every path
into the session (first join, reconnect, post-boot rejoin) sets flow.
What breaks if durability is reversed (per-turn reset): every operator
must re-signal every turn, so routine play costs N clicks per turn and an
AFK operator blocks the team forever — the exact failure the legacy
ready-state model was replaced for. What breaks if flow-on-rejoin is
dropped: a rejoining operator's stale `thinking` from minutes ago silently
vetoes the team's pacing; if extended (any other automatic write): the
system starts editing an operator's stated stance, and the record stops
meaning "what this human chose".

### A restated tempo write is an act (constraint-mined, write half)

The legacy mutation accepts a write of the operator's current value as an
idempotent no-op *that still counts as the operator's act* — the (re)connect
flow write goes through this same path, and the audit story records the
intent either way. The logging half belongs to replay-and-audit; the write
half minted here (`#restating-tempo-is-still-an-act`): the write is
accepted, never rejected as redundant. What breaks if reversed (rejecting
no-op writes): the uniform (re)connect sequence fails for any operator
already in flow — the common case — forcing clients to read-then-write
racefully, and a deliberate human act vanishes without record.

### The flow quorum is passive, with its three carve-outs explicit

`flow-quorum` authors the precondition exactly as the legacy resolution
shaped it: unanimity of flow over the *active operators* (currently
connected member operators; coaches/admins have no tempo and never
count), passive (its becoming true triggers nothing — it permits the
automated path to proceed on its own schedule), with the Captain and
expiry paths bypassing it entirely and zero active operators leaving it
unsatisfied. The zero-operator case defers automated declaration but the
clock runs on — expiry is the backstop — so an unattended team slows the
game by at most its own time budget. Boot's quorum half is authored here
(leaves the active set as a disconnect would; rejoin lands in flow via
the tempo requirement), citing the operator story's boot act. What breaks
if the precondition is made active (flow-unanimity triggers submission):
the last operator returning to flow instantly ends the turn — a
hair-trigger that punishes the exact coordination the tempo model exists
to protect, and the Captain's suppress-the-flush semantics become
unreachable. What breaks if observers count: a coach's mere presence
gates the team's pacing, inverting read-only. What breaks if zero
operators satisfied the quorum: an abandoned team's bot plays at full
automated speed with nobody consenting — the opposite of the deferral the
review resolved.

### Submission passes: news-gated cadence, ack-gated clearing

`scheduled-submission` authors the automated player's cadence at intent
grain: on each interval pass, only snakes whose decision state has news
(the framework's dirty flag) are re-rolled and re-staged; the news is
marked consumed only on the staging acknowledgement (constraint-mined
from the legacy design, where the snapshot write explicitly does *not*
clear the flag).

**The dirty flag's lifecycle spans two capabilities, and each owns exactly
one end of it.** `bot-framework/score-composition` mints the setting side —
rescoring that moves a stateMap entry sets the flag, and neither publishing
the snake's decision state nor the passage of time clears it. This
capability owns the clearing side, because the flag is cleared by the
workflow that stages the decided move and that workflow lives here:
`scheduled-submission` states that staging is what consumes the news, that
it consumes it only on acknowledgement, and — explicitly, because the same
pass also publishes the snake's decision state to its observers — that the
publication is never what clears it (`#publishing-is-not-staging`). Naming
the publication here is deliberate duplication of emphasis rather than of
authority: bot-framework says publication does not clear the flag, this
capability says its own pass's clear is bound to the staging
acknowledgement alone, and a lifecycle whose two ends are stated in two
capabilities is only legible if both ends name the same trap. What breaks
if either half is dropped: with no owner for the clear, the flag is set
forever and every pass re-rolls every snake; with the clear attached to the
publication instead, a snake whose display update succeeded and whose
staging failed resolves on a stale move while the player believes it was
replaced. What breaks if the news gate is dropped: every pass
re-rolls every snake, so a snake's staged move churns randomly at the
cadence frequency with no new information — softmax noise, not decisions —
and the staged-move log fills with meaningless supersessions. What breaks
if clearing precedes acknowledgement: a staging call lost by the network
leaves the flag clear, the flush sees nothing pending, and the snake
resolves on a stale move the player believes it replaced — a silently
dropped decision, undetectable from the player's own state.

### The final flush: dynamic deadline, re-armed against the clock

`final-flush` carries the resolved deadline model at intent grain: the
deadline derives from live values — min(automatic allocation, observed
remaining time) less the imminent threshold — and re-arms earlier
whenever observed remaining time falls below what the armed deadline
assumed (constraint-mined from the legacy design's subscription re-arm).
At the deadline everything pending is flushed, however recently staged;
declaration follows when the quorum permits — immediately if it holds,
later on the player's own schedule if flow returns within the turn — and
the scheduled cadence runs until the turn is actually over. The
quorum-withheld case deliberately flushes-but-defers: staging is not
gated by the quorum (only declaration is), so a thinking operator sees
the bot's final intent on the board while deciding. What breaks if the
deadline is a fixed wall-clock value: it cannot be predicted across
expiry and declaration paths (the ambiguity the legacy review dissolved),
and a team whose budget shrank mid-turn gets its flush after the clock
already expired — the concrete failure the re-arm exists to prevent. What
breaks if the flush waits on the quorum: expiry during thinking submits
a stale staged set, silently discarding computed decisions.

### Captain submit is an allocation of an affordance, not an access control

The requirement originally demanded that any non-Captain invocation of a
Captain control be "rejected server-side". That is unimplementable in this
architecture and was withdrawn by the author on 2026-07-28. It was
unimplementable for a structural reason, not an effort reason: turn-over
declaration is a game-instance operation, the instance authorizes at team
granularity and holds no notion of an individual operator
(global-invariants/team-granularity-authorization), and every member
operator already holds an admitted game connection. There is therefore no
place the rejection could live — the instance cannot tell Captain from
member, and gating the Convex-mediated control path would leave the
instance path wide open while pretending otherwise. A gate that can be
walked around by using the connection you already legitimately hold is
worse than no gate: it reads as a guarantee in the spec and is none in the
running system.

What replaces it is the honest statement: the reference application offers
turn-submit to the Captain alone, that is an *allocation of an affordance*,
and a Centaur Server may allocate it differently
(`#captain-only-is-allocation-not-enforcement`). The requirement says so in
as many words because every reader arrives expecting a security control —
"Captain-only" is security-shaped language — and a reader who assumes one
exists will either rely on it or waste a review cycle looking for where it
is enforced. What breaks if reversed (re-adding the server-side gate): the
spec asserts a property no runtime can hold, and the first implementer
either ships a gate that the instance path bypasses or escalates the whole
declaration path through Convex, which
global-invariants/centaur-state-boundary#bot-to-game-flow-never-routes-through-convex
forbids for the bot half of the same operation.

The requirement consequently no longer declares
global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant.
That invariant is why a differently-allocating fork is legitimate, but
"gi permits this" is a defensive note, not a soundness dependency — the
requirement stands or falls on its own statement that no rule rejects a
non-Captain declaration, which it now makes locally rather than by
citation.

### Captain submit: human judgement suppresses the flush; coordination by observation only

`captain-submit` authors the override: immediate declaration with exactly
the currently staged moves, tempo-blind, keyboard-bindable, offered to the
Captain alone. Two subtleties are the requirement's point. First, flush
suppression: the Captain's submit asserts that the staged set *as seen*
is acceptable — flushing dirty snakes afterwards would land fresh softmax
rolls after the human decision with no chance to respond, so only the
deadline path flushes. Second, coordination by observation
(constraint-mined): the automated player learns of any declaration solely
from the game instance's declared state on its subscription — no
interface-to-player message exists — and the submission act itself is
intent, distinct from the game's declared state (the audit story records
the intent; pacing behaviour keys only off the declared state). What
breaks if suppression is reversed: the resolved moves differ from what
the Captain approved — the override stops being an override. What breaks
if coordination goes out-of-band: two sources of "is the turn over"
(message and state) can disagree under loss or reorder, yielding flushes
after declaration or cancelled flushes for turns not actually declared;
observation of the single authoritative state cannot desynchronize. Note
that flush suppression is a *pacing* behaviour and survives the withdrawal
of the Captain-only gate above: whoever the application let press submit,
the player stands down its pending flush, because it keys off the game's
declared state and not off who declared it.

### The pacing header: display discipline as behaviour

`pacing-header` folds the UI-mirror ids into three behaviours an operator
relies on: sub-second countdown precision with a warning state (the turn
is decided in the last second; a seconds-integer display hides exactly
the information that matters), a stable turn-submitted indicator that
never flickers back to a countdown while other teams finish (a flickering
clock reads as "the turn is somehow live again" at the moment of maximum
tension), and teammate tempo read from the durable record with presence
proving connectedness only (constraint-mined from the legacy design's
explicit non-duplication). What breaks if tempo were carried in presence
state: presence is ephemeral session state — a refresh would show a wrong
tempo until re-join writes land, and the quorum display could disagree
with the quorum the automated player actually computes from the record.

### How the pacing story integrates with the global invariants

Several decisions above are decisions *because* of a cross-cutting
invariant, and the integration is pinned here rather than restated in the
requirements.

- **Clock autonomy rests on hermeticity.** `in-game-clock`'s "no external
  timekeeper" is deliverable only because the instance consults no external
  system during gameplay
  (global-invariants/game-instance-hermeticity#seeded-once-never-refreshed).
  The scenario therefore states only the local guarantee — per-turn timing
  waits on nothing outside the instance — and leaves "the instance makes no
  outward calls" to the invariant that owns it.
- **Idempotent declaration and the once-only trigger are in-reducer
  guards.** Both are invariants over the instance's own records, so each
  guard runs inside the transaction of the reducer whose write it protects
  (global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants):
  the declaration reducer decides "already declared this turn?" and the
  resolution trigger decides "already resolved?" from state read in the very
  transaction that writes — never from a value read in an earlier one, which
  a concurrent declaration could invalidate between check and write. With
  global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic
  this is also what makes `next-turn-bracket` deliverable: because the whole
  turn commits or nothing does, "the committed turn's record is exactly what
  resolution consumed" and "the next turn opens with the commit" are one
  fact rather than two writes that could interleave.
- **Declaration is team-granular because the instance holds no operators.**
  `turn-declaration` admits any of the owning team's admitted operator and
  bot connections and checks nothing finer — not because within-team
  discipline is unwanted, but because
  global-invariants/team-granularity-authorization places all within-team
  coordination in Convex and denies the instance any notion of an individual
  operator. That is equally why `flow-quorum` is a *player-side*
  precondition: unanimity over a team's currently connected member operators
  is not a check the instance could make, so the quorum is computed where the
  roster and the tempo record live and merely permits the automated
  declaration path — the instance sees an ordinary team-granular declaration
  whichever path issued it. What breaks if the quorum were pushed into the
  instance: it would need the team's membership, roles, and presence — the
  platform-wide state
  global-invariants/state-confined-to-owning-runtime#game-instance-holds-only-its-games-state
  keeps out of a game instance.
- **The tempo and pacing-parameter records are Centaur-subsystem state, and
  the requirements are deliberately silent about it.** `operator-tempo` and
  `live-pacing-parameters` are per-game operator and bot coordination state,
  read by the team's automated player and its operators' interface and never
  by the game instance, so their home is the Centaur subsystem
  (global-invariants/centaur-state-boundary). That placement also settles
  that no pacing record can decide a game: clocks, declarations, and the
  resolution trigger are instance-held, so losing the tempo record can only
  change whether the *automated* path declares, never the outcome. Read
  scope follows global-invariants/team-private-centaur-state — a team's
  tempos and its mid-game retuning are visible to its own members, which is
  exactly what `pacing-header` renders, and to no opposing team while the
  game is live, which is why the header requirement can speak of "each
  active operator's tempo" without qualifying the audience. What breaks if
  the records were instance-held: retuning and tempo writes would become
  game actions on the authoritative runtime, and a team's pacing stance
  would ride in the game record it is not part of.
- **"Captain-only" here is not a security claim, and gi is why it need not
  be.** Every Server serves a forkable, customisable application, so a
  Captain control a client can re-enable would be no guarantee at all
  (global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant).
  The corpus has exactly two honest responses to that: enforce the rule
  where enforcement lives, or stop calling it a rule. Turn submission takes
  the second, because the first is unreachable — the declaration is a
  game-instance operation and the instance authorizes at team granularity
  (see the withdrawal decision above) — so `captain-submit` states the
  affordance allocation and disclaims enforcement, and declares no gi
  dependency for it. Contrast the team-management story's captain gate,
  where the mutation *is* a Convex function and "only the captain" is
  therefore a genuine, enforced rule; the difference is which runtime owns
  the operation, not how much the platform cares about captaincy.
  Relatedly, the automated
  player's observe-don't-signal coordination is not merely the preferable
  design but the only sanctioned channel it has
  (global-invariants/centaur-state-boundary#bot-to-game-flow-never-routes-through-convex):
  bot compute meets the game solely through the instance's contract —
  staged moves inward, filtered subscriptions outward — so an
  interface-to-player pacing message is outside the boundary as well as
  unnecessary.

### Why no requirement here declares another requirement of this capability

The delta originally carried nine intra-capability `Depends on:` entries,
including a genuine two-cycle: `flow-quorum` declared `final-flush` and
`final-flush` declared `flow-quorum`. Both entries were defensible in
isolation — the quorum is the precondition the flush's declaration step
waits on, and the flush is one of the paths the quorum permits — which is
exactly the diagnosis: they are two views of one behaviour, not two
behaviours with a direction between them. The author's corpus-wide rule
(2026-07-28) settles it structurally: **the requirements of one capability
are a single integrated cohort, so none declares a dependency on another.**
A capability is the unit a reader takes in at one sitting and an
implementer builds as one thing; a dependency edge inside it records
nothing a reader of the whole section does not already have, while costing
the one thing the graph is for — a cycle inside a capability is invisible
to a capability-grain acyclicity check, so it accumulates silently. All
nine went; the capability-grain declarations they implied
(`operator-control`, `bot-framework`, `bot-configuration`, `game-engine`,
`global-invariants`) were already carried by other requirements, so the
Purpose line is unchanged. What breaks if reversed: `turn-pacing`'s pacing
requirements are mutually referential by nature — tempo, quorum, cadence,
flush and submit are one mechanism described from five angles — so
permitting intra-capability edges here means permitting a dense cyclic
subgraph that no lint can check and no reader can order.

## Constraint-mining (mandatory final step)

- **Minted: budget+clock invariant at every observable instant**
  (`in-game-clock#invariant-at-every-instant`).
- **Minted: turn-0 clocks run from the moment the game becomes playable**
  (`in-game-clock#clocks-run-from-playability`).
- **Minted: decision news cleared only on staging acknowledgement, and
  never by the same pass's decision-state publication**
  (`scheduled-submission#ack-gates-the-clear`,
  `scheduled-submission#publishing-is-not-staging`).
- **Minted: team-granular authorization never yields an anonymous act — the
  instance records the authenticated identity behind every command it
  accepts** (`turn-declaration#team-granular-but-never-anonymous`).
- **Minted: the final-flush deadline re-arms when observed remaining time
  shrinks** (`final-flush#deadline-tracks-the-clock`).
- **Minted: declaration coordination exclusively by observing the game
  instance's declared state — no out-of-band channel, submission intent
  distinct from declared state**
  (`captain-submit#declaration-observed-never-signalled`).
- **Minted: a restated tempo write is accepted as an operator act**
  (`operator-tempo#restating-tempo-is-still-an-act`).
- **Minted: presence proves connectedness only; tempo is read from the
  durable record** (`pacing-header#tempo-from-the-record`).
- **Minted: zero active operators defers automated declaration while the
  clock runs on** (`flow-quorum#zero-operators-defers`).
- **Checked, owned by dependencies**: the clock arithmetic itself
  (game-engine/chess-timer); no-final-submission-barrier at the log
  (game-runtime/staged-move-log#accepted-until-declaration); manual
  snakes never framework-staged (operator-control/manual-mode); the dirty
  flag's definition (bot-framework/score-composition); sampling semantics
  (bot-framework/softmax-decision); parameter storage/captaincy/capture
  (bot-configuration/team-bot-parameters, game-start-snapshot).
- **Checked, owned by global-invariants** (cited where soundness leans on
  them, never restated): the instance's no-outward-call hermeticity
  (game-instance-hermeticity); in-transaction guarding of instance-side
  invariants (transactional-invariant-enforcement); resolution's sole
  authority and atomicity (authoritative-turn-resolution); team-granular
  authorization with within-team roles in Convex
  (team-granularity-authorization); every mutating act arriving under an
  authenticated identity of decidable kind
  (authenticated-unambiguous-identity); and the Centaur subsystem as home
  and privacy boundary of the pacing records (centaur-state-boundary,
  team-private-centaur-state).
- **Checked, deliberately *not* cited**: enforcement outside any
  application's presentation layer
  (security-enforced-outside-the-library) — it is why a fork may allocate
  turn-submit differently, but `captain-submit` claims no enforcement for
  the invariant to underwrite, so citing it would be a defensive note
  rather than a soundness dependency.
- **Checked, deferred to owners**: the per-turn record of budgets,
  declaration kinds, and timestamps, and the tempo/boot/submit action-log
  events (replay-and-audit's rows); the attribution entry that carries the
  identity `turn-declaration` records
  (game-runtime/connect-time-attribution) — this capability owns only
  that the instance keeps the answer, not the row it is kept in.
- **Checked, plastic (mechanism, doc-comment territory)**: the expiry
  scheduler's implementation, the interval/timeout primitives and their
  re-arm mechanics, the presence library and channel shape, the default
  parameter values (100 ms interval / 50 ms threshold live in code with
  configuration-change rationale), the specific keyboard binding, and the
  countdown's exact visual treatment — code citing this change's archive
  folder suffices when they land.
