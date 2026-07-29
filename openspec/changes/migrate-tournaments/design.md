## Context

Migration change minting `tournaments` from legacy modules 05 and 03
(7 ids, 4 review items, plus the scoring aspect of the refusal-branching
id retired by migrate-game-lifecycle), per the author-approved capability
map, dependency DAG, and assignment matrix. Legacy module 05 §5.10
and §5.6 and module 03 §3.3 are the core sources; legacy text is
binding, matrix intents are hints. Author review of the change artifacts
then settled six open threads — the tournament's own creation act and
object model, the seam with the room's start gate, what happens when the
platform itself cannot start a round, the competitor's view of the
event, and the double-authored forfeit score — and the decisions below
record all of them. This file holds the reasoning a future reader cannot
recover from the specs alone.

## Decisions

### Mint the format as one capability rather than scatter it

The alternatives were to fold rounds/scheduling into game-lifecycle
(which already owns launch and succession) and forfeit scoring into a
results/leaderboard story. Reversed, game-lifecycle — deliberately
authored format-abstract, with the explicit author routing that forfeit
scoring is not its concern — would grow tournament vocabulary its launch
story never consults, and the one thing a competitor experiences as one
thing ("we entered a tournament") would live in three places. The
carving also keeps the abstraction seam honest: the lifecycle owns hooks
("a schedule-bound competition format MAY override…", "a format MAY
govern that none follows", the straight-to-finished transition), the
room story owns the parallel hooks on its own side (a format may create
a room, reserve acts on it, and start its games without the readiness
gate), and exactly one capability — this one — names the format that
exercises them all.

### A tournament is a created object that spawns the rooms it governs

The first authoring had no creation act at all: a tournament "began" as
an ordinary start of some room's current game, which left its three
meta-parameters — round count, interlude, scheduled start — with nowhere
to be entered, validated, or required. That gap was not fillable in
game-configuration either, whose parameter vocabulary is closed to
exactly the engine's parameters and excludes everything else by
requirement. The author's decision is structural and it resolves both
ends at once: **a tournament is a distinctly created object, and it
spawns the rooms it fully controls.**

The object model is tournament → round → match → room → game.
A tournament is an ordered sequence of rounds; a round holds one or more
matches; a match is a fixed set of teams contesting one or more games in
its own room. Only the last two levels existed before (a "round" was
simply a game), and collapsing them was what made the meta-parameters
homeless: a round is a slot in a schedule, a match is a contest, a game
is one playing of it, and each of the three attracts different
properties. **This format produces exactly one match per round and one
game per match** and the requirement says so — spec bodies state current
truth — but the *records* are required to carry the full structure
(tournaments/round-structure#a-second-match-reshapes-nothing) so that
parallel matches in one round are a scheduling change rather than a
migration. That is the one place where planning ahead is cheap and
retrofitting is not: a room reference living on the tournament instead
of on a match is a data shape every consumer would have to be rewritten
around later.

The tournament **governs each room it creates for its own whole
lifetime**, not merely while that room's match is in play, and releases
them only on conclusion or halt. That single choice is what makes three
other things true at once: no room of a running event can be archived
out from under it (the room story's bar is stated over exactly this
condition, so it needs no interlude special case); the in-room view has
a surface to live on for the whole event rather than blinking out the
moment a match ends; and a round's rooms can be created when the round
is, with no window in which a room exists but nothing claims it.
Reversed — releasing a room when its match ends — the previous round's
room becomes an ordinary room mid-event, archivable and view-less, and
the interlude gap the room story just closed reopens one level down.

Reversed — meta-parameters carried on a game record — they either
violate the closed parameter vocabulary or ride along as untyped extras
every game inherits, and finishing any game spawns a nested event (the
trap tournaments/round-config-inheritance#no-nested-tournament closes).
Reversed the other way — a tournament that attaches to a room somebody
else created — its guarantees about that room become conditional on a
human not touching it, and the reserved-acts rule the room story now
carries would have no moment at which it starts applying.

Ranges are stated in the requirement because "required with no default"
is only meaningful alongside a bound: 1–16 rounds (one round is a
legitimate one-off event; sixteen is well past a single teaching
session and bounds the work an unattended schedule can queue), 0–120
minutes of interlude (0 chains immediately; two hours is longer than any
session, and an unbounded interlude parks a room nobody may archive),
and a scheduled start strictly in the future (a start already past would
fire the instant the tournament existed, before its teams could be
enrolled). The numbers are policy, not physics — they are the sort of
thing an author revises — but having them stated is what makes the
validation testable and the surface buildable.

### The format is the concrete instance of the lifecycle's abstractions

tournaments/scheduled-start-override cites
game-lifecycle/launch-gates rather than restating the health/invitation
gates; tournaments/walkover-and-no-contest cites the
not-started-to-finished transition of game-lifecycle/status-authority
rather than re-deriving it; #nothing-after-the-final-round is the
concrete "none follows" arm of game-lifecycle/successor-auto-creation.
Reversed — the gates or transitions restated here — the status machine
and launch story would have two owners whose copies drift, and the
reference lint's one-owner-per-requirement guard is exactly the
discipline this authoring preserves. The ordering half of the resolved
orchestration-reordering review (invitations resolve before
initialization, so forfeiters' snakes never spawn) is likewise owned by
game-lifecycle/launch-orchestration#invitations-resolve-before-init and
only relied on here.

### Scheduled starts bypass the room's gate, and the room story says so

The room's start gate and this format's scheduling were, as first
authored, **jointly unsatisfiable**: the gate permitted a start only on
the administrative actor's initiation with every enrolled team ready,
while every round here starts on the platform's own act with no
readiness declared — and a round's game *is* the room's current game.
Neither requirement was wrong; the seam between them was missing. The
author's intent is the plain one: **non-tournament games require
unanimous readiness; tournament games begin strictly as scheduled.**

The fix lands on both sides and neither restates the other. The room's
gate is re-authored as governing *user-initiated* starts, with an
exemption phrased over "a schedule-bound competition format" — the same
abstraction game-lifecycle/launch-gates already uses, and phrased that
way for the same reason: rooms sit upstream of every format, so naming
this one would invert the dependency direction. On this side,
tournaments/round-scheduling states positively that the platform alone
starts every game of a tournament, and declares
rooms-and-matchmaking/game-start-gate as a genuine soundness
dependency — if that carve-out went away, this requirement would be
unimplementable, which is precisely what a declared dependency is for.

The first round no longer rides the room's gate either. It was tempting
to keep it there ("a tournament is initiated like any game, then the
schedule defers it"), but it made the opening round the one round a
human could hold hostage by never clicking start, and it made the
readiness gate applicable to exactly one round of the event. Strictly
scheduled, from the opening bell, is both simpler and what the schedule
is for.

Reversed — no carve-out, the contradiction left standing — an
implementer resolves it in code with nothing in the spec licensing the
choice, most likely by reusing the manual start path, whose readiness
gate no auto-created game can ever satisfy: every round after the first
stalls forever.

### An archived team is never a participant

Fixing the participant set at the moment the tournament begins was
already the rule; what it now also does is **exclude teams archived by
that moment**. The window is narrow but real — a team enrols, its
captain archives it, the scheduled start arrives — and an archived team
"cannot be enrolled in new games" is exactly the guarantee
team-management/archive-not-delete makes, cited here for that reason
(and the reason `team-management` is now among this capability's
declared dependencies).

Exclusion, not forfeiture, is the right shape: a forfeiting participant
is invited again next round (#forfeit-does-not-unseat), so marking an
archived team absent would have the platform inviting a retired team
once per round for the rest of the event. Excluding it settles the
question once, at the one moment the participant set is decided. The
consequence when exclusion drops the field below two is not a special
case: the round resolves as a walkover or no-contest by the ordinary
rules.

This is the schedule-bound half of a boundary whose other half lives in
the room's gate (which *rejects* a start whose enrolled set contains an
archived team, because a human is standing there who can fix it). One
rule — an archived team enters no new game — with the remedy differing
only where nobody is present to act on a rejection.

The freeze then holds the set: because
tournaments/tournament-roster-freeze runs from the moment the tournament
begins, and archiving a team is itself barred while its roster is
frozen, no participant can be archived for the rest of the event. That
is why the freeze's start was moved from "the first round enters play"
to "the tournament begins" — the two differ by exactly the launch
window, and a first round that resolves as a no-contest never enters
play at all, so the old anchor could leave an entire event unfrozen.

### Forfeit is a marked absence; the score is the engine's

A forfeit is distinguishable from a played loss only by the forfeit
marking on the game record (the unseated-teams set of
game-lifecycle/game-record). What it *scores* was double-authored:
game-engine/scoring already defines that forfeited teams are excluded
from all terms and score 0, and tournaments/forfeit-scoring restated it
— a restatement that could not even cite its source, because
`game-engine` was not a declared dependency of this capability.

The author's decision resolves the ownership rather than the wording:
**the forfeit outcome of a game is independent of tournaments.** The
engine owns it; `game-engine` joins this capability's declared
dependencies so the rule can be cited; the restatement is gone. What is
left here is the part that genuinely is this format's — that a team
which does not take its seat is *marked* as a forfeiter on the record,
and that the marking, not the value, is the discriminator. Declaring the
dependency rather than keeping a copy is the whole point of the
dependency list being an affordance and not a budget.

Reversed — the copy kept — two requirements define one number, and the
copy silently wins wherever an implementer reads this capability first;
reversed the other way (no requirement here at all) the marking has no
owner and a consumer is left inferring absence from a zero, which
#marking-not-value-distinguishes exists to forbid.

The marking rule stays minted as its own scenario because it is silently
violable: a leaderboard implementer inferring "forfeit" from
`score === 0` produces correct-looking results until the first team
plays a round to a genuine zero.

What is *also* left here — and was briefly and wrongly removed — is the
obligation that the marking be **reported as a forfeit** everywhere a
round's result is shown. That is the next section, and it is the same
ownership argument run one step further: if the engine owns the score
because a score is not a tournament concept, then this capability owns
forfeit *reporting* because a forfeit is nothing but a tournament
concept, and no surface owner should have to know one to display one.

### A capability may require display on surfaces another capability owns

An intermediate authoring of this change **dropped**
#forfeit-visible-downstream's display obligation, on the reasoning that
a requirement obliging accounts-and-profiles and replay-and-audit is
unenforceable because this capability neither declared nor could
reference them, and that the honest residue was "the marking and the
score are on the persisted record". The author overruled that, and the
governing principle is theirs:

> "A capability doesn't exclusively own a section of code, though it's
> nice when we can manage to carve capabilities in such a way that this
> does occur naturally. The tournament capabilities should be able to
> impose requirements on what information shows up in a number of UI
> contexts that are primarily the responsibility of another capability.
> The natural way for implementation to occur is that the capabilities
> responsible for the base implementation of those UI contexts get
> implemented first and then the tournament capability adds new
> requirements to the behaviour of those UI contexts and implementation
> of the tournament capability generates code diffs to those UI contexts
> to meet the requirements. So we should be able to straightforwardly
> define in the tournaments capability that forfeit events should be
> reported semantically as such in appropriate places including in the
> tournament scoreboard and game results and running scoreboard,
> including during replays. That requirement should not be duplicated in
> the capabilities primarily responsible for those UI contexts. That
> would be a failure of DRY principle. Implementation code, when it
> arrives, for displaying the forfeit information, can reference the
> requirement in the tournaments capability that requires it."

So **a capability is not a section of code**. Carving by user-story
locality often lands one capability's requirements in one region of the
tree, and that is a convenience, not the contract. A downstream
capability may impose a display obligation on a UI context another
capability primarily owns; the owning capability must **not** restate
it; and implementation arrives as a **diff to that context** carrying a
`// spec:` citation of the imposing requirement — which is exactly what
makes forfeit-aware code inside a leaderboard traceable to the
capability that knows what a forfeit is.

The mistake in the dropped version was reading "unenforceable" off the
wrong artifact. Nothing in the surface owners' specs failing is not the
test; the test is whether *the corpus* records who must do what, and it
does: this requirement names the obligation, the dependency
declarations name the surfaces, and the tasks name the diffs. What was
genuinely missing was the *declaration* — and the declared list is an
affordance, never a budget, so the fix is to declare
`live-game-observation`, `replay-and-audit` and `accounts-and-profiles`
rather than to shrink the requirement to fit an undeclared list. That is
also why the narrowed version's "the record carries the marking" residue
is kept as a **sentence** of the requirement rather than as its whole
content: it is the mechanism the four surfaces read from, not a
substitute for requiring them to read it.

**What breaks if this is reversed** — if a cross-capability display
obligation must instead be restated by each owning capability: the same
rule is authored N times and drifts, which is precisely the DRY failure
the corpus's no-restatement rule exists to prevent, and the copies carry
no authority. Worse, the one capability that actually cares about the
rule — the one that *defines* what a forfeit is — cannot state it at
all, so the reason each of the four surfaces shows a forfeit marker
exists nowhere, and the first refactor of any one of them deletes a
behaviour with no requirement behind it. The four restatements also
cannot be kept consistent by review, because no single reviewer of
`accounts-and-profiles` has any reason to look at `replay-and-audit`.

Reversed the other way — this capability requiring the display *and* the
owners restating it "for local readability" — the corpus has five
statements of one rule and gains nothing that a citation from the code
does not already give.

Scope discipline, so this does not become a licence to specify other
people's surfaces: the obligation is stated at the grain of *what
information must appear*, never how it is laid out, and only over
information this capability defines. A forfeit qualifies — nothing else
in the corpus knows what one is. The leaderboard's ranking arithmetic
does not, and stays entirely the leaderboard's: this requirement is
silent on it, and the one place a forfeit's *score* is defined remains
the engine's.

### The four surfaces, and how each is reached

The obligation names four presentation contexts, and the two the
narrowed version lost are given their own scenarios because they are the
two an implementer would otherwise never think of:

- **The event's own standings and completed-round results** — this
  capability's, rendered in the room by tournaments/tournament-view.
  Note that tournament-view's content list no longer says "with forfeits
  … shown as such": that would restate the forfeit obligation one
  requirement away from it, inside a single capability, so tournament-view
  now names only the three *round resolutions* it uniquely presents
  (played out, walkover, contest nobody entered) and forfeit reporting on
  that surface is forfeit-scoring's like everywhere else.
- **A finished game's result and the histories and rankings listing it**
  — reached through `replay-and-audit/team-game-history`,
  `accounts-and-profiles/player-profile`, `accounts-and-profiles/team-profile`
  and `accounts-and-profiles/leaderboard`.
- **The running scoreboard while the game is in play**
  (#live-scoreboard-names-the-absence) — reached through
  `live-game-observation/scoreboard-sole-aggregate-authority`. The
  integration worth pinning: a forfeit marking is **not a team-level
  aggregate**, so joining it in from the game record does not touch that
  requirement's "sole authority for aggregates" claim — the aggregates
  still come from the observation channel alone, and the marking rides
  alongside. This matters concretely because
  `game-runtime/per-turn-scoreboard` writes a row per *rostered* team and
  a forfeiter's snakes never spawn, so the marking cannot come from the
  aggregate rows even in principle. An implementer who tries to express
  the forfeit *as* a zeroed aggregate row produces exactly the confusion
  #marking-not-value-distinguishes forbids, one surface further out.
- **A replay of the round** (#the-replay-shows-the-forfeit) — reached
  through `replay-and-audit/board-level-replay`. Scoped to a round that
  was *played out*: a walkover or no-contest never plays a turn and
  therefore persists no replay
  (`replay-and-audit/unified-replay-viewer#finished-with-replay-only`),
  so there is no replay surface for the obligation to bind on those
  branches — and the in-room view is where those endings are read.

Acyclicity was checked before committing to this shape rather than
assumed: nothing in the transitive closure of `accounts-and-profiles`,
`live-game-observation` or `replay-and-audit` declares `tournaments`, so
all three edges point strictly outward from a capability nothing depends
on, and the reference lint confirms the graph stays acyclic. Had any one
closed a cycle, the answer would have been to report the dilemma rather
than to route around it — the requirement would name the concept while
one edge stayed undeclarable, which is a defect to surface, not to hide.
The cost of the three edges is real and accepted: `tournaments` now
folds after all three, which is recorded in the seam gate.

### Where forfeit-scoring's boundary now sits

Keeping the display obligation **inside tournaments/forfeit-scoring**
rather than minting a second requirement for it was a deliberate call,
and it went the other way at first. The case for a dedicated
requirement is real — a display obligation spanning four surfaces is
arguably its own behaviour, and it would let the surface dependencies
attach to it instead of to a requirement about a record. Two things
decided it:

1. `#forfeit-visible-downstream` is an **identifier-map anchor**: the
   legacy id it carries resolves through
   `tournaments/forfeit-scoring#forfeit-visible-downstream`, and moving
   the scenario under a new requirement breaks that anchor. Repairing it
   means editing the map, which is outside this change's sanctioned
   scope.
2. Substantively they are one behaviour, not two. "The marking, not the
   value, is what a forfeit *is*" is the whole requirement; it is
   recorded so it can be reported and reported because it is recorded.
   Split apart, the display requirement's entire content is "and show
   it", with no independent soundness of its own, while the recording
   requirement loses the answer to "why record a marking at all".

### The walkover scores par, cited rather than asserted

The sole acceptor of a walkover round records 1.0 — par, the value the
platform's normalised scoring yields analytically for a field of one —
and forfeiters whatever the scoring rule gives a forfeiter. With
`game-engine` now declared, the number is stated *and* its source cited
(game-engine/scoring), which is strictly better than the earlier
arrangement where the literal stood alone and only
global-invariants/one-shared-engine kept a second implementation from
contradicting it. Both citations stay: one says where the value comes
from, the other says why there can be only one place it comes from.
Reversed — a walkover-specific constant — the scoring rule becomes
double-sourced and the two can drift; reversed the other way (no number
at all), the walkover outcome is ill-defined and the sentinel temptation
returns. Par is also the *right* number: a team that showed up against a
field of zero held exactly its proportional share — not more (it beat no
one) and not zero (it was willing to play).

Integration, since a walkover finishes a round no turn ever resolved:
the outcome is authored in Convex without contradicting
`global-invariants/authoritative-turn-resolution` or
`global-invariants/state-confined-to-owning-runtime` — there is no
committed gameplay for an instance to be the authority over and no live
game-runtime state to mirror, so this round's record is Convex's from
the start rather than an imported finished record.

### Rounds inherit gameplay config, never the meta-parameters

Each game copies the tournament's base configuration; round count,
interlude, and scheduled start are properties of the tournament as a
whole. Reversed — meta-parameters inherited into games — every
auto-created round would itself describe a tournament, and finishing it
would recursively spawn nested events (or implementers would carry the
fields and rely on convention to ignore them, the exact trap the
captured-base-config model closes).

The capture happens **when the tournament begins**, not when it is
created. That moved with the creation decision: at creation the opening
game holds nothing but defaults, and the organiser configures it through
the room's ordinary affordances during the wait, so capturing at
creation would freeze the wrong values. Capturing at the start still
buys the property that mattered — no mid-event edit can make round three
a different game from round one
(#the-capture-closes-the-editing-window) — because the capture and the
first launch are the same moment.

Integration with the invariants bearing on a round boundary. Equality of
the *recorded* configuration only buys equality of *play* because a
game's instance is seeded once at initialisation and never refreshes
(`global-invariants/game-instance-hermeticity#seeded-once-never-refreshed`,
cited in the requirement) — otherwise a configuration edit could reach a
game already in flight and the captured base would guarantee nothing.
In the other direction, what crosses a round boundary is only the
tournament record: per-game state is confined to its own instance and
dies with it
(`global-invariants/state-confined-to-owning-runtime#game-instance-holds-only-its-games-state`),
so the delta cites that invariant in
tournaments/round-structure#every-round-a-real-game instead of restating
"nothing of one round's state survives into the next" as a rule of its
own. Only the tournament-level record — meta-parameters, participant
set, captured base configuration — spans the rounds, which is why
round-structure cites `global-invariants/single-convex-deployment`: a
cross-round entity presupposes one persistent home for state that
outlives a game.

### Whole-event roster freeze, anchored to the tournament

Authored per the later decided legacy source and confirmed by the author
(tournament-wide freeze, interludes included): the tournament is one
coherent competitive unit, and inter-round member swaps would be
strategically abusable. The requirement is phrased as this capability's
own — the tournament is an "enclosing competitive engagement" in exactly
the sense the team-management freeze was worded to admit — so the two
compose by construction. Reversed — per-round freezing — teams could be
rebuilt between rounds of a single event, and the freeze's enforcement
would toggle on every round boundary, multiplying the race windows the
atomic-check discipline exists to close. That discipline is
`global-invariants/transactional-invariant-enforcement`, which the
requirement cites: a freeze checked outside the transaction of the
mutation it rejects is not a freeze — a membership write racing the
tournament's entry into play would commit. Integration of the "every
mutation" absolute: it is safe to state without enumerating surfaces
because `global-invariants/one-contract-many-surfaces` already makes
every surface's mutations pass the same server-side contract, so the
freeze cannot be honoured by the web application alone while a
programmatic surface walks past it.

Two endpoints moved with the other decisions. It now **starts** when the
tournament begins rather than when the first round enters play (see "An
archived team is never a participant"), and it **lifts on a halt** as
well as on the final round's finish
(#a-halt-lifts-it-too). The second is not a nicety: a halted tournament
never concludes, so a freeze anchored only to conclusion would hold
every participant's roster forever, unliftable by anything short of a
repair to infrastructure that may never come.

### First round never early; the schedule is the platform's alone

The first round begins no earlier than the scheduled start time
regardless of readiness; subsequent rounds are created and started by
the platform after finish + interlude; after the final round, nothing.
Reversed — readiness-accelerated first rounds — the scheduled start
stops being a commitment competitors can plan servers and people
around; reversed on the tail — successor auto-creation firing after the
final round — the room accumulates an unwanted ready-to-start game the
moment every tournament ends, and "the tournament ended" has no
observable difference from "the tournament continues".

Naming Convex as the scheduling authority is the one runtime commitment
this otherwise runtime-neutral capability makes, and it rests on
`global-invariants/runtime-ownership` (cited in the requirement): round
chaining is a single behaviour with a single home, so it cannot be split
between the platform and a finishing round's instance. Were ownership
splittable, "the platform's act alone" would be satisfiable by an
instance that starts its own successor — and a round that failed to
finish cleanly would take the rest of the schedule with it.

### A platform failure stalls the tournament, gracefully and for good

Bounded resolution originally promised that *every* round reaches a
resolved state within its own start orchestration. It cannot: the
promise holds over what participating servers do (accept, decline, time
out), but not over the platform's own ability to start a round at all.
Board generation can fail, provisioning can fail, initialization can
reject the payload — and game-lifecycle/no-orphans deliberately answers
each by tearing the instance down and leaving the game `not-started`,
which is precisely the state the old promise forbade. Two requirements
said opposite things about the same event.

The author's decision: **it is appropriate for the tournament to stall
on infrastructure failure.** So the promise is narrowed to the failure
modes it genuinely bounds — invitation decline and timeout — and the
stall is authored explicitly as tournaments/round-launch-failure rather
than left as the gap between two requirements. What makes the stall
acceptable is that it is *graceful*: the failure is recorded and
surfaced, the round is left not-started with nothing orphaned, no
further round is created, and the event's outcome is **indeterminate** —
never a winner inferred from a partial standing. Recovery is an operator
repairing the infrastructure and creating a fresh tournament; there is
deliberately no resume path, because a schedule everyone stopped
watching is worse than an event everyone knows has ended.

Reversed — retry-until-it-works — the bracket hangs on infrastructure
nobody is watching and competitors sit in rooms whose next round may
arrive at any hour. Reversed the other way — skipping the failed round
and carrying on — the event's standings silently include a round some
teams never got to play, which is a worse outcome than no result at all.
Reversed on the outcome — declaring a winner from what did complete —
the platform asserts a competitive result the competition never
produced.

### The event has a defined outcome, so the view has something to show

Authoring the stall as "the outcome remains indeterminate" and the view
as "how the event stands" both presuppose something the corpus never
defined: what a tournament's standing *is*, and how it is won. Rather
than leave two requirements resting on an undefined term,
tournaments/event-outcome states the minimum: the standing is each
participant's running total of the scores its games recorded, the winner
is the highest total once the final round finishes, and a tie at the top
is shared.

Summing recorded scores — rather than counting round wins — falls out of
the scoring model already in place: scores are normalised so par is
1.0 regardless of field size, which makes them commensurable across
rounds in a way "wins" is not (a walkover win and a hard-fought win are
not the same achievement, and the score already says so). No tiebreak
round is defined because inventing one would run the event past the
round count its organiser fixed and required.

Reversed — leaving standings undefined — every consumer invents its own
arithmetic and the view becomes unbuildable; reversed on the tiebreak —
an automatic extra round — the round count stops being the commitment
the creation act made it.

### The competitor sees the event from the room they are in

No requirement anywhere authored a view of a tournament's schedule,
progress, or standings: a competitor could be dropped into round three
of an event with no way to learn that this is what had happened. The
author's decision is a dedicated requirement, shaped here as
tournaments/tournament-view, and the shaping choice worth recording is
**where** it renders: inside the room's own interface, not on a separate
tournament page.

That follows from the structure. The room is where the competitor
already is — it is the match's setting, it is what the lobby and the
browser link to, and it is the surface they wait in during an interlude.
A separate page would put the event's state one navigation away from
everyone who needs it and would need its own discovery story; the room,
by contrast, is already discoverable and already read-only-safe for
outsiders. The content is chosen for orientation rather than
completeness: which round of how many and which match, who is
contesting it, what has already happened, the standing, and what comes
next — including, explicitly, the difference between "concluded" and
"halted", which is the one distinction a competitor cannot infer from a
quiet room.

Reversed — no view — the event is invisible to the people in it, and
"when does the next round start" has no answer the platform is
accountable for. Reversed on the location — a standalone page — the room
stays a bare game with a hidden schedule, and #the-wait-is-explained has
no surface to be true on.

## Constraint-mining (mandatory final step)

- **Minted: scheduled rounds consult no readiness gate.** The routed
  lead. An implementer who reuses the manual start path for round
  chaining silently inherits the readiness gate — and every scheduled
  round then stalls forever, since nobody re-declares readiness for an
  auto-created round. Minted as
  tournaments/round-scheduling#no-ready-check-between-rounds,
  minimally constraining: any start path that does not consult
  readiness satisfies it.
- **Minted: the freeze anchors to the tournament's own state.**
  The routed lead's second half. A freeze check derived from "some game
  of this team is `playing`" is correct during rounds and silently
  wrong during every interlude — the exact gap the whole-event decision
  closed. Minted as
  tournaments/tournament-roster-freeze#anchored-to-the-tournament-not-to-a-round,
  with #a-halt-lifts-it-too closing the dual failure: a freeze anchored
  to a conclusion that never comes.
- **Minted: bounded resolution over what servers do.** The schedule's
  quality depends on a round never lingering unstarted awaiting a team's
  recovery; an implementer adding a retry-until-healthy loop would
  break the bracket for everyone else. Minted as
  tournaments/scheduled-start-override#bounded-resolution — and
  deliberately narrowed to server outcomes, since the platform's own
  failure is answered by the stall instead.
- **Minted: the stall is visible.** A tournament that halts silently is
  indistinguishable from one whose next round is merely a long way off,
  and the natural implementation of "stop scheduling" produces exactly
  that. Minted as
  tournaments/round-launch-failure#the-stall-is-graceful-and-named, with
  #a-halted-event-was-never-won forbidding the other tempting shortcut —
  reporting the leader of a partial event as its winner.
- **Minted: the records carry the round/match structure even at one
  match per round.** With a single match per round, every record can be
  collapsed one level and nothing observable changes — until parallel
  matches arrive and every consumer has to be rewritten. Minted as
  tournaments/round-structure#a-second-match-reshapes-nothing,
  minimally constraining: it demands shape, not a feature.
- **Minted: marking-not-value distinguishes forfeits.** See the
  forfeit decision above; silently violable by any consumer inferring
  forfeit from a zero score. Minted as
  tournaments/forfeit-scoring#marking-not-value-distinguishes.
- **Minted: the live scoreboard names the absence.** The obligation's
  most silently violable arm. The natural implementation of a running
  scoreboard renders the rows the observation channel delivers, and a
  forfeiter has no rows — so it disappears from the field with nothing
  failing, and a spectator reads "not competing" as "not in this
  tournament". Minted as
  tournaments/forfeit-scoring#live-scoreboard-names-the-absence,
  minimally constraining: it demands the information, not a layout.
- **Minted: the replay shows the forfeit.** The dual, one surface
  further on. A replay of a round played three-handed instead of
  four-handed renders an empty seat indistinguishable from a recording
  gap, and no requirement of the replay surface's own would fail.
  Minted as tournaments/forfeit-scoring#the-replay-shows-the-forfeit,
  scoped to rounds that were played out because unplayed branches
  persist no replay.
- **Checked, owned elsewhere**: the forfeiter's score itself
  (game-engine/scoring#forfeit-exclusion, now cited rather than
  restated); initialization deferred until invitations resolve
  (game-lifecycle/launch-orchestration#invitations-resolve-before-init);
  the walkover transition and its instance teardown
  (game-lifecycle/status-authority#walkover-straight-to-finished); the
  cleanup of a failed launch (game-lifecycle/no-orphans); the
  invitation window and delivery discipline
  (team-server-management/game-invitations); the room-side half of the
  scheduled-start seam (rooms-and-matchmaking/game-start-gate and the
  acts a governing format reserves); the ranking treatment of a
  forfeited game — that it stays in the ranked set at the engine's
  score — which is `accounts-and-profiles/leaderboard`'s and is
  deliberately *not* what this capability's display obligation touches;
  and the base implementation of all four presentation surfaces, whose
  owners build them first and whose specs this capability's obligation
  leaves unamended by design.
- **Checked, plastic**: the tournament record's representation and
  status vocabulary, the scheduler mechanism for interlude delays and
  the scheduled first start, interlude units, and the layout of the
  in-room event view are mechanism — doc comments citing this change
  suffice when the code lands. The parameter ranges are policy of the
  same kind: stated so they can be validated and revised deliberately,
  not because the numbers are load-bearing.
