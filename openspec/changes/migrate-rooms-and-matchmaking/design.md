## Context

Migration change minting `rooms-and-matchmaking` from legacy modules 05
and 08 (17 ids, 4 review items), per the author-approved capability map,
dependency DAG (game-lifecycle, game-configuration, team-management), and
assignment matrix. Legacy module 05 §5.4 and module 08 §8.6/§8.8 are the
core sources; legacy text is binding, matrix intents are hints. This file
records the decisions a future reader cannot recover from the specs
alone.

## Decisions

### Mint the capability as carved rather than scatter it

The alternatives were to push the room record into game-lifecycle (it
holds the current-game reference) and the browser/lobby into an app-pages
capability. Reversed, the one workflow a player experiences as one thing
— find a room, get your team in, say you're ready, play — would live in
three places, and game-lifecycle would grow pre-game social vocabulary
(ownership, enrolment, readiness) that its launch story never consults
except as a single gate. The room-side gate and the launch-side gates
stay cleanly separated (see below).

### The room is a dumb container; the eager game holds the state

The resolved config-on-game model is carried whole: rooms hold no
parameter state and no readiness state; both live on the current game
record, created eagerly at room creation exactly so there is always a
record to hold them. Reversed — room-level config or readiness — the two
legacy race conditions return: game turnover racing parameter edits
(which record was I editing?) and stale readiness surviving into the
next game. The eager initial game authored here and the successor
auto-creation authored in game-lifecycle are two halves of one invariant
("a room always has a current game"); the atomic install of the
successor as current is owned there and only cited here
(#currency-moves-with-the-succession), so the invariant has exactly one
enforcement owner per edge.

### Readiness is captain-only consent, cleared by succession

Three resolved reviews are encoded together. (a) Captain-only: only the
team's authorized representative commits the team to play; reversed —
any member marks ready — a team is committed by someone without
authority to commit it, and the read-only indicator the lobby shows
everyone else (#captain-only-even-for-insiders) has no definite rule to
mirror. (b) Per-game scoping with clearing-by-freshness: the delta
states "every freshly created game begins with no team ready" rather
than mandating a clearing sweep — readiness lives on the game record, so
a fresh record is the clearing; reversed — readiness carried over — a
team ready for game N silently pre-consents to game N+1 and an
unintended start fires, the exact bug the resolved review named. (c)
Read-only display for non-captains is folded as the UI-mirror half of
the same scenario, not a separate requirement.

### Enrolment is unilateral; readiness is the consent gate

The legacy lobby text says the administrative actor may "invite or
remove" teams, but no acceptance protocol exists anywhere in the binding
corpus, and the legacy platform design's enrolment surface is a direct
add/remove. The coherent reading — authored here — is that "invite"
names the affordance, not a handshake: enrolment is the actor's
unilateral act, and the team's consent lives where the corpus actually
put it, in the captain's readiness declaration (a start needs every
enrolled team ready, so no team plays without its captain's explicit
say-so). Reversed — an acceptance flow on enrolment — the platform would
carry two team-consent gates in sequence with no behaviour the second
adds, and the start gate's "every enrolled team" quantifier would need
an extra pending-enrolment state to quantify over.

### Abdication is terminal; ownership is never reassigned

Authored as stated in the binding text, with the scenario pinning the
strongest consequence: after abdication no path to ownership exists for
anyone, ever (#abdication-is-forever). Reversed — reassignable ownership
— "who controls this room" becomes contested mutable state needing a
claim/grant protocol, and the clean two-state administrative model
(owner, or open control) grows a third negotiated state. The ownerless
room's open control is deliberately authored as a defined administrative
state, not a permission gap, so implementers gate on "is administrative
actor" rather than special-casing null owners.

### Room archival edges (judged, per the task's constraint-mining brief)

- **Mid-play archival is rejected** (Open Question 1, authored per
  option A). The legacy text forbids creating or starting games in an
  archived room; a game finishing inside an archived room would force
  successor auto-creation to either violate that or leave the room
  without a current game. Rejecting archival while the current game is
  playing keeps both invariants whole with one small gate, parallels
  the team-archive freeze gate, and makes unarchival trivially safe:
  the room always resumes onto an intact not-started current game
  (#unarchive-resumes-intact). Reversed, one of two open siblings'
  invariants must be carved with an exception.
- **The mid-play bar generalises to "while a format governs the room"**
  (Open Question 3). "Playing" turned out to be the wrong quantity to
  gate on the moment a competition format entered the picture: such a
  format leaves its room holding a *not-started* game between contests,
  so the mid-play test is false exactly during the windows in which
  archiving does the most damage — the room would go dark and the
  format's remaining schedule would be stranded with no game creatable
  in it. The gate is therefore stated over the room's *claimed* state
  rather than its current game's status
  (rooms-and-matchmaking/room-archival#archive-blocked-mid-play), which
  strictly subsumes the old test for the format case and leaves the
  ordinary case untouched. Reversed — keeping the status test — a room
  can be archived between two rounds of a running event, and the only
  repairs available are an unarchive race or a carve-out in the format's
  own scheduling requirement, neither of which the room's own invariant
  should be leaning on.
- **Archive preserves everything** (resolved room-deletion review).
  No deletion path exists because deletion would cascade to or orphan
  historical games, replays, and action logs whose attribution must
  stay stable. The scenario (#archive-preserves-everything) pins the
  observable half: history resolves identically before and after.
- **Archival does not strip state.** Enrolment, ownership state, and
  the current game survive the archive round trip; archived is a
  listing/activity flag, not a reset. An implementer who "cleans up" an
  archived room's enrolment would break resume.

### The room's gate and the launch's gates have one seam

The start requirement owns exactly what the room decides: who may
initiate (administrative actor), and the matchmaking precondition (at
least two enrolled, all enrolled ready). It hands off by citation to
game-lifecycle/launch-orchestration and launch-gates, stating explicitly
that passing the room's gate is necessary, never sufficient. Reversed —
health/invitation gates restated here — the two copies drift, and this
capability would have to reach for server-health vocabulary it has no
business owning: the only honest fix would be to declare
team-server-management among its dependencies and cite it, which is the
wrong shape when game-lifecycle already owns that seam. The
walkover path is likewise not this capability's concern: below two
enrolled-and-ready teams there is simply no start; the walkover is a
launch-time outcome among seated teams, owned by game-lifecycle.

### A room may be governed by a competition format, named abstractly

A schedule-bound competition format needs rooms whose games it starts
itself, on its own schedule, with no readiness declared and no human
initiating — which is flatly incompatible with the gate as first
authored ("only the administrative actor … only when every enrolled team
has declared itself ready"). The two requirements were jointly
unsatisfiable for every round of such an event, and the author's intent
is the plain one: **non-tournament games require unanimous readiness;
schedule-bound games begin strictly as scheduled.** So the gate now says
what it always meant — it governs *user-initiated* starts — and a
schedule-bound format is exempt
(rooms-and-matchmaking/game-start-gate#a-scheduled-start-does-not-consult-this-gate).

The carve-out is phrased over "a competition format", exactly as
game-lifecycle/launch-gates already phrases its own override, and for
the same reason: this capability sits upstream of every format, so
naming one would invert the dependency direction and force a declared
dependency on a capability whose vocabulary the room story has no
business carrying. Abstract phrasing also composes with a second format
arriving later without touching a word here.

Three requirements carry a clause each, and they are one decision seen
from three sides: a format may create a room
(rooms-and-matchmaking/room-creation), the acts it reserves are refused
to every user while it governs
(rooms-and-matchmaking/room-administration#reserved-acts-belong-to-the-governing-format),
and the readiness gate is not among the things its starts consult. The
reserved set is stated as a minimum — enrolment, starting the current
game, archival — because those are the three the room's own invariants
turn on; everything else, configuration and abdication included, stays
with the administrative actor, which is what lets an organiser set an
event's parameters up before it begins.

Reversed — no carve-out — a schedule-bound format is unimplementable
without contradicting this capability, and an implementer resolves the
contradiction by quietly reusing the manual start path (whose readiness
gate no auto-created game can satisfy, so every round after the first
stalls forever) or by bypassing the gate in code with nothing in the
spec licensing it. Reversed the other way — the format holding *all*
administrative control — nobody can configure or enrol before the event
starts, and a room created for a contest becomes an object with no human
administrator at all.

### A room is configuring or playing, and the mode is a requirement

The author's correction of 2026-07-28 rests on a fact the corpus had left
implicit: **a room is either configuring its next game or playing its
current one, never both and never neither.** Everything downstream reads
better once that fact is named, so it is authored as a requirement of its
own — rooms-and-matchmaking/room-mode — rather than as clauses spread over
enrolment, the start gate, and archival.

Why a requirement rather than clauses. The mode is a room-level state
machine, and a state machine with no name is one every reader re-derives:
the enrolment bar, the configuration freeze, the archival bar and the start
gate are four consequences of one fact, and a reader who meets them
separately has no way to tell they are the same fact. A named mode is also
what a future requirement can *cite* — the tournaments story, the lobby's
affordance mapping, and anything that later needs "is this room busy" all
want one predicate, not four. Reversed — leaving the modes implicit — the
consequences drift apart one edit at a time, and the specific bug the
author named becomes reachable again by a route nobody is checking: with
no rule saying enrolment is closed during play, a team can be enrolled
into a playing room, is not a participant of that room's game, is
therefore not competitively engaged, is therefore archivable, and lands in
the successor's enrolled set as an archived team — "an active participant
of a game while simultaneously being archived" is the edge next door, and
both are what a room-level mode forecloses in one sentence.

What the mode requirement adds and what it deliberately does not. The
configuration half is already bound: game-configuration/launch-freeze
makes a game's configuration editable only while it awaits launch and
freezes it at launch for the rest of the game's life. That is not restated
— it is cited, and the mode requirement says the two bars share one
interval. What is genuinely missing from the corpus is the **enrolment**
half (nothing anywhere closed the enrolled set during play) and the
**name** (nothing gave the interval an identity). Those two are the
requirement's whole content, plus the standing rule that a refusal lives
with the mutation, never with an absent affordance.

Where the boundary sits, and why not at the commit to `playing`. The mode
leaves *configuring* when a launch begins, not when the game's status
commits to `playing`. Launch orchestration is a sequence — freeze, generate,
provision, invite, initialize, commit — and the status only reaches
`playing` at its end
(game-lifecycle/status-authority#aborted-launch-was-never-playing),
so a boundary drawn at the commit would leave the whole
orchestration window open to enrolment: a team enrolled after invitations
were dispatched is not seated, is not engaged, and is archivable — the
rejected example rebuilt inside the launch itself. Drawing the boundary at
the launch's start closes it. The abort path then needs no special rule:
an aborted launch leaves the game awaiting launch (same requirement), so
the room is configuring again and the actor can fix the roster and retry,
which is what game-lifecycle/launch-gates#refusal-aborts-cleanly assumes
someone can do. Reversed — boundary at the status commit — the window is
narrow enough that no test would ever catch it and wide enough that a slow
invitation round makes it minutes long.

The definition is deliberately derived, never stored
(#the-mode-is-never-a-stored-flag), for the same reason the room holds no
configuration and no readiness of its own: a second representation of "is
this room busy" is a flag that can disagree with the game whose progress
defines it. And it is deliberately written so that the *safe* answer is the
default one: the room is configuring only while its current game is one
that can still be started, so any state the corpus has not thought about —
a format that governs that no successor follows its last game, leaving a
finished game current — refuses enrolment and configuration rather than
permitting them. That residual state is a gap in the succession story
rather than in this one, and it is flagged in this change's report rather
than papered over here.

### Archival withdraws the team; the start gate says nothing about archival

"All enrolled teams are not archived" was a start precondition in the
legacy corpus that the migration left homeless: enrolment rejects an
archived team at the door, but nothing re-checked a team archived
*afterwards*. An earlier round of this change closed that by adding the
condition to rooms-and-matchmaking/game-start-gate — the start was
refused while any enrolled team was archived. **The author rejected that
shape (2026-07-28) as more complicated than it needs to be**, and
specified a simpler one, which the delta now carries:

1. **Archiving is prohibited while the team is competitively engaged** —
   in an active game or an active tournament. The rule itself needed no
   new authoring; the chain was already in the corpus.
   team-management/archive-not-delete permits archiving "only while its
   roster is not frozen"; team-management/roster-freeze freezes the team
   at minimum whenever it is competitively engaged, over an interval
   "held longer by enclosing competitive engagements, never shorter";
   game-lifecycle/competitive-engagement publishes the playing-game half
   of that fact; and tournaments/tournament-roster-freeze is exactly such
   an enclosing engagement, anchored to the tournament's own state and
   spanning its interludes. Nothing restates the predicate — a fourth
   statement of the rule is the drift the corpus is organised to avoid —
   but the author was explicit that the *state* "archived while an active
   participant of a game" must never be reachable, and a rule that
   important should not oblige a reader to compose three requirements
   before they can see it. So the sibling change pins the composed
   outcome as a scenario on the requirement a reader actually opens:
   team-management/archive-not-delete#archived-and-playing-is-unreachable
   asserts the unreachable state and defers to the freeze for *why*,
   adding no second definition of engagement and no second copy of the
   predicate.
2. **Archival reactively withdraws the team from the rooms it is enrolled
   in**, authored as a clause on rooms-and-matchmaking/team-enrolment
   with #archiving-withdraws-the-team-from-every-room and
   #the-withdrawal-clears-a-standing-board-too. This is the genuinely new
   half, and it lands on enrolment because the enrolled set is the record
   it changes: the withdrawal is an ordinary enrolment change, so it
   inherits the board-clearing rule already authored there rather than
   needing a second rule of its own.

Why this beats the gate condition: the gate version was a *third*
statement of "no archived team plays" — enrolment bars entry, the freeze
bars archiving, the gate re-checks — whose only job was to cover the
window between the other two. Withdrawal closes that window instead of
watching it, so the gate keeps exactly the preconditions that are about
the room's own contents (enough teams, all consenting), and the number of
places that must agree about archival drops from three to two. The gate's
archived-team clause, its #archived-enrolled-team-blocks-the-start
scenario, and team-management/archive-not-delete in its declared
dependencies are all removed as now load-bearing for nothing; the two
surviving in-transaction scenarios were reworded around the conditions
that remain.

**Unqualified — "every room in which it is enrolled" — because that is
the simpler statement, not because it is the wider one.** An earlier round
justified the unqualified form with a worked example: a team enrolled in a
room *after* that room's game launched is not a participant of it, so is
not competitively engaged, so may be archived — and a
not-yet-launched-only withdrawal would skip the room, leaving the archived
team in the enrolled set when successor auto-creation installs a fresh
not-launched game. **The author rejected that example's premise
(2026-07-28)**: enrolling a team after a launch must simply be impossible,
because a room is either configuring or playing (see "A room is
configuring or playing, and the mode is a requirement" above). With that
window closed, the two candidate scopes coincide for every room the
manual path can produce — an ordinary launch aborts unless every enrolled
team's server accepts (game-lifecycle/launch-gates#refusal-aborts-cleanly),
so a playing ordinary room's enrolled set *is* its participant set, and
every one of those teams is engaged and unarchivable.

So the phrasing survives on its own merits rather than on the rejected
example: "every room in which it is enrolled" carries no qualifier to
state, test, or keep true, while "every room whose current game has not
launched" obliges every reader and implementer to evaluate a condition
that — for the rooms an ordinary start produces — can never discriminate.
One residue keeps the two sets formally distinct and is worth knowing
about rather than pretending away: a schedule-bound format's override may
seat a *subset* of the enrolled teams
(game-lifecycle/launch-gates#override-seats-the-willing), so an enrolled
team can be unseated, hence unengaged, hence archivable, while that room
plays. The unqualified withdrawal handles it; the qualified one would skip
the room and hand the archived team to the successor. That case is also
exactly why rooms-and-matchmaking/room-mode admits the withdrawal as the
one enrolment change a playing room accepts
(#the-withdrawal-is-the-one-change-a-playing-room-admits).

The withdrawal is safe against a launched game for two cited reasons, not
by luck: game-lifecycle/roster-snapshot binds participation at
initialization and
global-invariants/game-instance-hermeticity#seeded-once-never-refreshed
keeps the instance sealed. #removal-never-reaches-a-launched-game is now
worded around the surviving case only — the archival-driven withdrawal —
because the actor's mid-play removal it used to also cover is no longer a
reachable act at all.

The deliberate non-choice: the withdrawal **drops the team**, where the
gate version **rejected the start**. Dropping is the right call here only
because the two acts differ in who is present. Rejecting a start told a
human at the surface "fix this", and the fix was one click; a withdrawal
happens at archival time, when the room's actor is not the person acting
and there is nobody to tell. A captain retiring a team has already said
the team is done playing, so removing it from rooms enacts that intent
rather than overriding it — and if the archival was a mistake, unarchiving
restores the team but not its enrolments, which the actor re-adds. The
asymmetry is worth stating because the earlier round argued the opposite
at the gate, and both arguments are right about their own moment.

Reversed — keeping the gate condition alongside the withdrawal — the
corpus carries a permanently unreachable precondition: no start can
observe an archived enrolled team any more, so the clause is untestable
except by constructing a state the spec forbids, and it decays into a
claim nobody can verify. Reversed the other way — dropping the gate
condition *without* adding the withdrawal — restores exactly the
homeless-precondition bug the earlier round was written to fix, and it
surfaces as a game whose participating-team snapshot names a team the
platform says is retired.

### The lobby mounts the configuration component and owns the actor mapping

`migrate-game-configuration` re-carved its capability so the configuration
surface is a standalone component with no permission vocabulary at all: it
names three affordance kinds in its own terms (inspection, parameter
editing, board designation), takes one mount-time parameter per kind, and
is explicit that offering a kind is presentation, never authorisation
(game-configuration/self-contained-configuration-surface,
game-configuration/host-selected-affordances). Something must nonetheless
decide which kinds a given viewer is offered, and the room is the only
place in the corpus where the answer exists — "administrative actor" is
this capability's word, defined by its ownership model, and nothing
downstream of it can compute it. So rooms-and-matchmaking/room-lobby now
*mounts* the surface rather than restating its parameter values, and
carries the mapping: inspection to everyone who can see the room, parameter
editing and board designation to the administrative actor.

The mapping is deliberately stated as presentation with the enforcement
elsewhere, which is the same authority-vs-affordance split this capability
already makes for its three authorities (see "Where this capability leans
on the global invariants"). The configuration write is an administrative
act under rooms-and-matchmaking/room-administration, whose guard is where
an unoffered write is actually refused; the lobby's job is only to not
offer it.

Reversed — the component resolving the actor itself — the two capabilities
invert: game-configuration would have to declare a dependency on
rooms-and-matchmaking to know what an administrative actor is, which points
the wrong way down the DAG, and the component would stop being mountable
standalone (its dev-environment-first property, which is the whole point of
the re-carve). Reversed the other way — the lobby offering all three kinds
to everyone and leaning purely on server-side rejection — the surface stops
being truthful about what a viewer can do, and an ordinary spectator is
shown editable widgets that fail on submit. Reversed a third way — the
lobby reimplementing the parameter display instead of mounting the
component — there are two renderings of one parameter set to keep in step,
which is precisely the duplication the standalone carve removed.

The seam this leaves is a real one and is recorded as a task rather than
resolved here: the component's mount-time parameter shape belongs to
game-configuration, so the exact call must be agreed with that change
before either side is built.

### An enrolment change clears the board in the same transaction

The sibling widened board generation's inputs to include the roster, so a
change to the number of players or the composition of teams clears any
standing board lock and regenerates the preview
(game-configuration/board-preview-lock-in#roster-change-clears-the-lock).
That rule is stated from the board's side; the room-side event that
actually changes a not-yet-launched game's roster is an enrolment change,
and nothing said so. The consequence is authored on
rooms-and-matchmaking/team-enrolment because enrolment is this
capability's write — the sibling can state what a roster change does, but
only the owner of the enrolment mutation can commit to *when*.

"When" is the whole content of the decision: the clearing is required in
the same transaction as the enrolment change, not as a follow-up. Reversed
— clearing afterwards, or reactively — a refusal between the two writes, or
a start arriving in the gap, leaves a board designated for launch that was
generated for a different set of teams, and a launch consumes it exactly
per game-configuration/board-preview-lock-in#locked-board-launches-exactly:
the players get a board seating the wrong number of teams, with every
requirement in the corpus satisfied along the way. The late-join case is
the one to test, because it is the one where the window is widest and the
board is most obviously wrong. Affordable for the same reason the rest of
this capability's atomic claims are: room and game records sit in one
deployment, so one mutation spans them
(global-invariants/single-convex-deployment).

The removal side needs the same treatment as the join side and gets it by
the same sentence — a removal below the designated board's team count is as
invalidating as an addition above it. What is *not* claimed here is
anything about a launched game: enrolment never reaches one
(#removal-never-reaches-a-launched-game), so the clearing rule is scoped to
the not-yet-launched current game and to nothing else.

### The engine must declare its bounds as data (planned, not specified)

game-configuration/parameter-bounds-sourcing requires every enforced and
every presented bound to be read from the engine's declaration. The engine
does not have one: the fifteen parameters' ranges live as line comments on
`GameOrchestrationConfig` / `GameRuntimeConfig`, and as `CONFIG_RANGES` in
the engine's test-support module — a complete and correct table that is
documented "Not part of the package's public API" and is not re-exported,
so a consumer physically cannot read it. The plan is a public, reflectable
descriptor (path, kind, min, max, default, disable sentinel per parameter)
with `CONFIG_RANGES` re-derived from it, planned in `revise-game-engine-contract`'s
tasks rather than here, since it is that package's public surface.

Deliberately **no spec delta**: game-engine/configuration-parameters
already carries the numbers and already delegates enforcement to the
surfaces, so exporting them changes the shape of an API, not a behaviour —
minting a requirement for it would put an implementation location in a spec
body. Reversed — leaving the bounds unexported and letting each consumer
re-type them — the sibling's requirement is unimplementable as written, and
what actually ships is a second copy of fifteen ranges in the Convex
validator and a third in the widgets, which is the exact drift
parameter-bounds-sourcing exists to forbid; the first symptom is a widget
that accepts a value the record rejects. The drift check is part of the
plan for the same reason: three tables reduced to one only stays one if
something fails the build when a fourth appears.

### UI mirrors folded; discovery scope pinned

Browser and lobby are authored as two requirements of substance (the
platform-wide discovery surface; the universally readable room detail),
and every authorization mirror folds into its owning requirement's
scenarios: actor-exclusive administrative affordances
(#non-actor-rejected-at-the-function), captain-only readiness toggling
(#captain-only-even-for-insiders), the self-explaining disabled start
(#disabled-start-explains-itself), and the outsider's read-only lobby
(#unaffiliated-viewers-see-everything-touch-nothing). The resolved
discoverability review is carried as the browser's scope sentence: the
Room Browser is the only platform-wide live-game discovery surface, and
user-scoped surfaces list own-team games only
(#live-games-found-through-the-browser) — reversed, a parallel
"live games" surface appears without a spec home and the home surface's
narrow scope (owned by the accounts story) is contradicted from below.

### Where this capability leans on the global invariants

Everything this capability owns is Convex platform state — the room
record, its current game record, enrolment, readiness — which is what
makes the deltas' absolutes affordable rather than aspirational.

- **Atomicity of the multi-record acts.** Room creation installs a fresh
  game as the room's current game "in the same act", and the start gate
  is checked "at initiation itself"; both are invariants spanning two
  records. They are deliverable because those records sit in the one
  deployment, so a single mutation can span them
  (global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction),
  and because a guard runs inside the transaction of the write it
  protects (global-invariants/transactional-invariant-enforcement).
  Relax either and the spec's phrasing would have to weaken to eventual
  consistency with an observable ownerless-or-gameless window, and to a
  start whose gate no longer held at commit. The same rule carries the
  enrolment set (a duplicate would double-count toward the two-team
  gate) and the mid-play archival bar, which is a freeze rule in gi's
  sense over the room and its current game's status — that is why
  "archived only between games" survives an archive racing a start.
- **Authority vs. affordance, decided once.** Three authorities are
  defined here: the room's administrative actor, the enrolled team's
  captain, and the actor-only start. Each is a Convex function-contract
  check, and the requirements state only the *local* half — which
  identity holds the authority, and what surfaces therefore show. The
  general half is gi's:
  global-invariants/security-enforced-outside-the-library places
  enforcement outside every application, including a team's forked and
  customised one (#customised-app-changes-no-invariant), and
  global-invariants/one-contract-many-surfaces makes it reach every
  surface alike — the web app, a programmatic caller, a Server under its
  game credentials
  (#every-surface-hits-the-same-invariants). Earlier drafts restated
  that ("enforced server-side at the mutating functions … the gating
  reflects the enforcement rather than substituting for it") in three
  requirements; it is now cited at each authority and restated nowhere,
  since a duplicated copy of gi's sentence carries no authority and
  drifts.
- **Enrolment removal cannot reach a running game** for two independent
  reasons, both cited rather than restated: the participating roster was
  snapshotted at initialization (game-lifecycle/roster-snapshot) and the
  instance refreshes nothing from outside while it runs
  (global-invariants/game-instance-hermeticity#seeded-once-never-refreshed).
  The room holds no channel into a live instance at all.
- **Deliberately not cited.** The lobby's read-only-for-outsiders clause
  and the browser's archived-room exclusion are presentation
  requirements, not security claims: nothing about them stops making
  sense if a gi rule is relaxed — they would merely stop mirroring
  anything. The authorities they mirror are the three above, where the
  dependency actually lives.

## Constraint-mining (mandatory final step)

- **Minted: gate checked authoritatively at initiation.** The start
  gate is a query-then-guard over two records (room enrolment, game
  readiness) that races captains retracting readiness and actors
  editing enrolment. Its quality depends on the check being atomic with
  initiation — an implementer who trusts the surface's enablement, or
  checks in a separate step, starts games whose gate no longer holds.
  The atomicity itself is gi's rule
  (global-invariants/transactional-invariant-enforcement); what is
  minted here is that this two-record gate is one of the invariants that
  rule covers. Minted as
  rooms-and-matchmaking/game-start-gate#gate-checked-at-initiation-not-in-the-surface,
  minimally constraining: any mechanism making check-and-initiate
  atomic satisfies it.
- **Minted: enrolment set semantics.** Under optimistic concurrency, a
  duplicate-add race is silently violable by check-then-insert without
  atomicity — and a duplicate here double-counts toward the two-team
  gate. Set-ness is the local invariant; its enforcement discipline is
  gi's
  (global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard).
  Minted as
  rooms-and-matchmaking/team-enrolment#enrolment-is-a-set.
- **Minted: freshness-as-clearing for readiness.** The invariant "no
  fresh game starts with anyone ready" is what makes the succession
  safe; an implementer copying game records wholesale (as successor
  creation copies configuration) could silently carry readiness.
  Minted as
  rooms-and-matchmaking/team-readiness#stale-readiness-never-survives.
- **Minted: a governing format's reserved acts are refused to users.**
  The room's authority model is one shared guard, so the natural
  implementation of a format-governed room is "the owner still holds
  administrative control, the format merely also acts" — under which the
  owner can start a scheduled game early, or archive the room between
  two rounds, and the format's schedule is silently corrupted by an
  ordinary, permitted click. The refusal has to be a rule, not a
  convention in the surface. Minted as
  rooms-and-matchmaking/room-administration#reserved-acts-belong-to-the-governing-format,
  minimally constraining: any guard that refuses the reserved acts while
  a format governs satisfies it.
- **Minted: archival withdraws the team from the rooms it is enrolled
  in.** Enrolment's archived-team rejection reads as sufficient right up
  until a team is archived after enrolling, and an implementer who checks
  only at enrolment produces a system that is correct in every test that
  enrols and starts in one sitting. The earlier round minted a re-check at
  the gate for this; the author's simpler shape mints the withdrawal
  instead, as
  rooms-and-matchmaking/team-enrolment#archiving-withdraws-the-team-from-every-room
  with #the-withdrawal-clears-a-standing-board-too, atomic with the
  archival rather than a sweep some later job performs — an eventually
  consistent withdrawal reintroduces the very window it exists to close.
  Minimally constraining: any mechanism committing the withdrawal in the
  archival's own transaction satisfies it.
- **Minted: the room's two modes, and enrolment closed during play.** The
  configuration half of "a launched game's setting is settled" was already
  a requirement (game-configuration/launch-freeze); the enrolment half was
  nobody's, and an implementer building enrolment against a room record
  has no reason to suspect it. Left implicit, the archived-participant edge
  the author refuses to own becomes reachable through late enrolment, and
  the four consequences of one room-level fact drift apart independently.
  Minted as rooms-and-matchmaking/room-mode with the mode named, the
  boundary drawn at the launch's start rather than at the status commit,
  and the refusal placed in the mutation
  (#enrolment-refused-while-playing) — minimally constraining: any guard
  that refuses an enrolment write while the room's current game is under
  way satisfies it, and the mode itself is required to be derived rather
  than stored (#the-mode-is-never-a-stored-flag).
- **Checked, owned elsewhere**: the atomicity of successor-install-as-
  current is game-lifecycle/successor-auto-creation#atomic-with-currency
  (cited, not re-minted); the archived-team enrolment bar's substance is
  team-management/archive-not-delete (cited; the scenario here pins the
  enrolment-side rejection, and the withdrawal is triggered by the
  archival that requirement owns). The prohibition on archiving a team
  that is competitively engaged is **not** minted here at all: it already
  falls out of that requirement's freeze precondition and
  team-management/roster-freeze's extensible interval, and the sibling
  change pins the unreachable state it produces.
- **Checked, plastic**: the readiness representation (an id array on
  the game record), browser pagination and search implementation,
  lobby routing, and the start-confirmation nicety are mechanism — doc
  comments citing this change suffice when the code lands.
