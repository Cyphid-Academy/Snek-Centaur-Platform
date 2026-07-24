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
both implicit paths. Idempotency is load-bearing, not hygiene: several
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
clear the flag). What breaks if the news gate is dropped: every pass
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

### Captain submit: human judgement suppresses the flush; coordination by observation only

`captain-submit` authors the override: immediate declaration with exactly
the currently staged moves, tempo-blind, keyboard-bindable, Captain-only
server-side. Two subtleties are the requirement's point. First, flush
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
observation of the single authoritative state cannot desynchronize. What
breaks without server-side rejection: any member with a devtools console
ends the team's turn.

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

## Constraint-mining (mandatory final step)

- **Minted: budget+clock invariant at every observable instant**
  (`in-game-clock#invariant-at-every-instant`).
- **Minted: turn-0 clocks run from the moment the game becomes playable**
  (`in-game-clock#clocks-run-from-playability`).
- **Minted: decision news cleared only on staging acknowledgement**
  (`scheduled-submission#ack-gates-the-clear`).
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
  (operator-control/staged-move-log#accepted-until-declaration); manual
  snakes never framework-staged (operator-control/manual-mode); the dirty
  flag's definition (bot-framework/score-composition); sampling semantics
  (bot-framework/softmax-decision); parameter storage/captaincy/capture
  (bot-configuration/team-bot-parameters, game-start-snapshot).
- **Checked, deferred to owners**: the per-turn record of budgets,
  declaration kinds, and timestamps, and the tempo/boot/submit action-log
  events (replay-and-audit's rows).
- **Checked, plastic (mechanism, doc-comment territory)**: the expiry
  scheduler's implementation, the interval/timeout primitives and their
  re-arm mechanics, the presence library and channel shape, the default
  parameter values (100 ms interval / 50 ms threshold live in code with
  configuration-change rationale), the specific keyboard binding, and the
  countdown's exact visual treatment — code citing this change's archive
  folder suffices when they land.
