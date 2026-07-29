## Context

Migration change minting `replay-and-audit` from legacy modules 02–08 (72
requirement ids, 3 note-only mechanism ids, 12 review items) — the final
train's widest aggregator — per the author-approved capability map,
dependency DAG (all seven permitted dependencies are cited), and
assignment matrix. Legacy text is binding source material; the module-02
parked ledger's drafted text for 02-REQ-013/014/065 was the starting point
for the record-sufficiency and public-readability requirements. This file
records the decisions a future reader cannot recover from the specs alone.

## Decisions

### The two-log model, authored as two records plus one guarantee

The platform deliberately keeps **two** append-only histories of a game:
the game instance's turn-keyed game log (board truth, replay-sufficient,
exported once at game end) and the platform's team action log (sub-turn
team-experience events, written transactionally with the mutations they
describe). Legacy text stated this across four modules; here it is three
requirements — `turn-keyed-game-record` / `replay-sufficiency` for the
game log, `team-action-log` for the action log — tied together by
`experience-reconstruction`: replay + log reconstruct the full team
experience at any timestamp, while the action log is never a source of
authoritative game state. Staged moves live in exactly one of the two
(the game instance's log, per the resolved legacy review): the
authoritative act and its record are the same transaction there, whereas
a Convex-side copy could fail independently and lie. The spec no longer
states that exclusion as a rule of its own: the action log is Convex-held
and written while the game runs, and Convex may hold no mirror of a live
game's staged moves at all
(global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game),
so the exclusion follows from the runtime split — `team-action-log` points
at the owning invariant instead of restating a prohibition, and
`experience-reconstruction` reads staged moves from the game record. What
breaks if reversed: merging the logs forces either per-turn posting of game
state off the instance (breaking
global-invariants/game-instance-hermeticity and the once-at-end export) or
team-experience writes into the game runtime (breaking
global-invariants/team-granularity-authorization, under which the instance
has no notion of the individual operators the action log is about);
duplicating staged moves into the action log reintroduces the exact
divergence the review resolution eliminated — a log claiming a move that
was never authoritatively staged.

### Connection events are a log category, and Convex writes the departures

`experience-reconstruction` promises the active-operator set with each
operator's tempo at any wall-clock moment, and
`team-perspective-replay#shadows-in-original-colours` needs to know who was
connected then. Nothing in the corpus produced that fact. Connects were
inferable — `turn-pacing/operator-tempo#flow-on-every-rejoin` writes a tempo
entry on every join, and `connect-time-attribution` stamps an attribution
entry at each admission — but a plain network disconnect wrote nothing
anywhere: `connect-time-attribution` says outright that disconnection writes
nothing (deliberately: deleting or amending an attribution entry would orphan
every action attributed through it), and
`operator-control/operator-presence-and-identity` is live presence with no
server-held state at all. The decision is to add a **connection-event
category to `team-action-log`** — arrivals and departures, the departure
carrying its cause — rather than mint a presence record somewhere else. The
action log is already the reconstruction source, already clock-stamped at
sub-turn resolution, already append-only, and already carries a category
vocabulary; a second durable presence store would be a parallel history of
the same team-experience timeline, with all the divergence that implies.

**Convex is the writer, not the game instance.** The log is Centaur state,
and the instance may not egress before game end
(`global-invariants/game-instance-hermeticity#no-egress-before-game-end`), so
the instance physically cannot append to it while the game runs — it could
only report disconnects inside the once-at-end export, which is far too late
for a log whose whole value is sub-turn wall-clock resolution, and would put
a team-experience fact inside the board-truth record. Convex, by contrast,
already holds the operator's own coordination connection
(`operator-control/operator-dual-connection`) and can observe it end. That
observation is also why the arrival half stays an ordinary self-written
entry — the joining client is present and credentialed — while the departure
half becomes the **one** exemption to `actors-write-own-entries`: a departing
client cannot be relied on to announce its own departure, least of all the
network-drop case the category exists for. The exemption is stated as
exactly one category, at the log's own runtime, so it cannot grow into a
general back-fill licence; `#server-never-ghost-writes` still forbids the
team's server supplying anything an operator's own write did not.

A Captain boot consequently produces two entries — the Captain's boot entry
(theirs, an act they performed) and the booted operator's departure entry
(Convex's, observing the severed connection). That is not duplication: the
first records a decision, the second records a presence transition, and the
reconstruction folds only the second.

What breaks if reversed: without the category, the active-operator set is
recoverable only by guessing from silence — an operator who stages nothing
for two minutes is indistinguishable from one who dropped — so
`experience-reconstruction` would promise something no data supports, and
the shadow rule would render shadows for operators who had gone. Putting the
producer in the instance instead breaks hermeticity or delays the fact past
usefulness; putting it in a new presence store recreates the two-histories
problem the two-log model exists to avoid; requiring the actor to write its
own departure loses precisely the disconnects that matter.

### The dead operator-mode bullet is not carried

Legacy 06-REQ-035 enumerated "the current operator mode (Centaur or
Automatic)" among reconstructible state. That model was dissolved by the
tempo resolutions (per-operator tempo is the model; the sibling
turn-pacing change owns it). `experience-reconstruction` therefore lists
the active-operator set and each operator's tempo instead. Reversed —
carrying the bullet verbatim — the minted spec would mandate
reconstructing state the platform no longer has, and the first
implementer would either invent a team-level mode or silently drop the
clause; both are drift.

### Attribution is resolved once, at the connection boundary

The legacy corpus's longest-argued cluster (03-REVIEW-005 superseded by
04-REVIEW-011): the connection identity is resolved to an agent value at
admission, stored per admitted connection, carried untouched through
staging, resolution, export, and persistence — never interpreted by the
runtime, never re-derived at serialization, never expressed as a raw
connection identifier in persisted data. Authored as
`connect-time-attribution` + `agent-form-persistence`, with
`staged-move-attribution` carrying the per-entry permanence and the
null-means-fallback rule (04-REVIEW-002: nullable attribution, no
sentinel value, no split event kind). Disconnect semantics are the
constraint-mined half: entries are never mutated or deleted on
disconnect, and a reconnect appends a fresh entry. What breaks if
reversed: resolving at export time requires the instance to keep raw
connection identities resolvable for the whole game (the exact fragility
the supersession removed — a turn-10 identity may belong to a connection
replaced by minute four); deleting entries on disconnect orphans every
historical attribution that flowed through the dead connection; a
sentinel "fallback agent" would leak a magic value into a field the
runtime is forbidden to interpret.

### Canonical event order is derived, never stored (constraint-mined)

A turn's events are a set; the deterministic order consumers need is
derived from event data (type class, then subject id) and must never be
materialised as a stored sequence column. This is precisely an invariant
a future implementer could silently violate — adding an "order" column is
the obvious convenience — after which the stored index and the derivation
rule can disagree, bit-exact record comparison breaks, and delivery
order starts looking load-bearing again (the posture live-game-observation
already pins for the live channel). Minted as
`canonical-event-order#derived-not-stored`.

### The record's event vocabulary is the engine's, with nothing added

`turn-event-record` originally closed over "the engine's event vocabulary
plus a hazard-damage event for each snake that took hazard damage and
survived the turn", because the engine's vocabulary did not carry hazard
damage and the record needed it to avoid making clients diff snapshots. The
open `revise-game-engine-contract` change adds it to `game-engine/turn-events`
(`#hazard-damage-is-announced`) — correctly, since the engine already applies
the damage and deriving it instance-side would be a second implementation of
that rule. The addendum is therefore redundant and is removed: the record's
enumeration is now *exactly* the shared engine's vocabulary, neither
narrowed nor extended. The dedup semantics stay pinned at the engine (one
act never produces two events); the scenario kept here states only the
record-side consequence — a consumer totalling hazard damage from the record
counts each application once, because the record stores the engine's events
as emitted and synthesises none. What breaks if reversed: keeping the
addendum leaves two places that decide when a hazard event exists, and the
first divergence between them is a replay that shows damage the game never
emitted (or hides damage it did).

### The export is single, privileged, unfiltered, and seeded

Four legacy ids collapse into `once-at-end-export`, authored as the
positive statement only: the record crosses the boundary exactly once,
bundled into the terminal notification (game-lifecycle owns the
notification mechanics); only the platform's distinct privilege can
retrieve it; the visibility filter is bypassed for it. The negative half —
nothing leaves the instance during play — is
global-invariants/game-instance-hermeticity#no-egress-before-game-end and
is cited, not restated; what this requirement adds is that the sanctioned
egress is *one* transmission, so there is no incremental or partial export
path to be tempted into. The privileged-retrieval clause is the other
integration point: every gameplay admission is bounded by
global-invariants/team-granularity-authorization to a team-granular,
filtered view, so an unfiltered bulk record is by construction outside what
any admission may observe — which is why one distinct platform privilege,
rather than a per-role check list, is sufficient. Two review-resolved edges ride
along: the per-game seed is hidden from every game client while the game
runs but included in the export (04-REVIEW-013 — otherwise determinism is
unverifiable downstream), and an error outcome exports no replay data and
no scores (constraint-mined from the legacy notification design: a failed
game must not masquerade as a playable replay). What breaks if reversed:
per-turn posting reintroduces a live external dependency
global-invariants/game-instance-hermeticity forbids; a filtered export
bakes one team's perspective
into the permanent record and makes every other perspective
unreconstructable forever; a secret-forever seed makes
`replay-sufficiency#bit-identical-reproduction` untestable.

### One canonical encoding: the record reuses the recorded-run contract

`test-sequences` was folded into `specs/` before this train and already
defines everything `replay-sufficiency` was reaching for: exactly one JSON
encoding per engine value with equality defined over it
(`test-sequences/canonical-encoding`), production-identical turn-seed
derivation (`test-sequences/determinism#production-seed-derivation`), and a
replay-check that resolves recorded turns in order and halts at the first
divergence reporting every value-level difference
(`test-sequences/replay-check`). That last one *is* the harness
`replay-sufficiency#bit-identical-reproduction` describes. This change
therefore declares `test-sequences` in its Purpose and reuses the contract
rather than defining a second one; the requirement now says the record's
engine-valued content carries that canonical encoding and that record-to-record
comparison is defined over it, and `#one-canonical-encoding` names the
alternative as a defect rather than an option.

The alternative considered was divergence — keeping the legacy replay shape,
which was row-oriented with JSON-string bodies. It was rejected because it
would leave two canonical encodings of the same engine values in one repo,
which `test-sequences/canonical-encoding` arguably forbids in spirit (its
whole content is that there is exactly one) and which certainly defeats its
purpose: two encodings means two notions of "equal", and the moment a replay
and a Test Sequence disagree about the same turn nobody can say which
encoding was wrong. What breaks if reversed: `#bit-identical-reproduction`
becomes untestable against recorded sequences, the visual tester and the
production replay drift into separate value semantics, and every future
consumer must be told which of two encodings it is holding.

The codec, seed derivation and replay-check live app-locally today, in
`apps/visual-tester/src/lib/test-sequences/`. Extracting them into a package
both the instance's record path and the tester consume is implementation, so
it is a task, not a requirement — but it is a precondition for this
capability's record work, and `test-sequences`'s own Purpose already
anticipates a headless consumer.

### Scoreboard rows are part of the record, not a live-only channel

`board-level-replay` must render the per-team scoreboard "from the persisted
replay alone", yet the rows appeared in neither `turn-keyed-game-record`'s
enumeration nor `once-at-end-export`'s list, and their only producer —
`live-game-observation/scoreboard-sole-aggregate-authority` — carried no
obligation for them to outlive the live subscription. Both enumerations now
name them, and the producing requirement gains the durability clause and
`#rows-outlive-the-live-audience`, so the row is a per-turn fact of the
record rather than a projection assembled for whoever is watching.

The alternative — recomputing aggregates from the persisted snapshots at
replay time — was rejected for the same reason the live rule exists: the
score is a normalised as-if-ended figure over the *true* alive set including
invisible snakes, so a recomputation is a second implementation of
`game-engine/scoring` sitting in the viewer, and any drift between it and
the published figure would silently rewrite history. What breaks if
reversed: a replay's scoreboard could disagree with what the teams saw
during the game, and the disagreement would be invisible because nothing
would hold the original figures to compare against.

### Retention is unbounded, and permanence changes owner at teardown

04-REVIEW-007 resolved in-instance retention as unbounded for the
instance's life (`turn-keyed-game-record#unbounded-retention`): the
persistence contract reads the complete record in one pass at game end,
so any instance-side eviction breaks it. After persistence, permanence is
the platform's: `replay-persistence` pins persist-before-teardown,
not-before-terminal-signal, and that the replay *and* the game-scoped
team records (action log, snapshots) outlive the instance for the game
record's life. Reversed, a retention cap silently truncates early turns
from every replay of a long game, and teardown that cascades into
team-experience data deletes the audit trail the game record exists to
anchor.

### Public readability, with the perspective bound as fidelity not secrecy

08-REVIEW-003's resolution is carried whole: once finished, a game's full
record — including both teams' within-turn operational data — is readable
by every authenticated user; the history listing scopes discovery only,
and a direct link grants any finished replay. Live games are excluded
from the replay surface entirely (the live boundary belongs to
live-game-observation). The team-perspective mode stays participants-only
(08-REQ-069/071a) — an interface-scoping rule, not a data-access rule —
and `replay-visibility-bound` pins that the team perspective replays
exactly what the team could see at the time, with the deliberate contrast
scenario that board-level mode shows the whole truth. What breaks if
reversed: gating finished-game data reintroduces the cross-module
privacy machinery the author deliberately eliminated; dropping the
perspective bound makes "team-perspective" a lie (it would replay a view
the team never had, and incidentally normalise rendering opponents'
invisible-at-the-time snakes inside an experience-fidelity mode);
dropping the participants-only scoping erases a deliberate product
boundary the author reconfirmed for this change.

### Team-perspective replay reads no live portfolio configuration

Team-perspective mode renders the decision displays from the published
decision snapshot alone: each contributing heuristic's weight *and* its
display label are recorded inside the snapshot at scoring time
(`decision-transparency/computed-display-state`, pinned by
`#weights-and-labels-are-recorded-not-joined`), so the viewer joins nothing
against the team's live portfolio configuration and never has to reach for
a record that may have moved since the game. What that buys is a conflict
that now cannot arise: a breakdown assembled by joining current
configuration would make this mode *structurally* require reading a team's
private configuration for a finished game — the one thing
`global-invariants/team-private-centaur-state#finished-games-release-only-what-is-published`
says finishing does not release, since what opens is the published record
and replay, not the losing team's configuration. Everything this mode
displays is therefore published deliberation, released on exactly the same
terms as the rest of the record, and no part of the replay path depends on
that invariant being relaxed. What breaks if reversed (rendering the
breakdown from a live configuration join): team-perspective replay becomes
unimplementable without weakening that invariant; the same snapshot
decomposes differently on different days as weights are tuned, so two
audits of one game disagree; and this capability acquires a dependency on
the team's configuration story that its Purpose deliberately does not
declare.

### Timeline semantics kept; exact speeds and key bindings demoted

The unified timeline's load-bearing behaviour is authored: one control
for both modes; Per-Turn snapping to end-of-turn states (what the team
saw while declaring); Timeline mode on the real wall-clock axis with
proportional spacing; per-mode
speed units; client-local mode/speed; keyboard scrubbing matching the
mode's granularity. The legacy-pinned literal speed sets ({0.25…8}
turns/s and ×) and the exact key/modifier table (08-REQ-072b–d) are
mechanism at this grain and stay in code, with this section as the
citable record that they were deliberate choices (08-REVIEW-010 lineage),
not accidents. Reversed — pinning the literals — every UX tuning of a
speed step becomes a spec revision; dropping the *semantics* instead
(snap-to-boundary, real-time axis) would let an implementer flatten the
two modes into one scrubber and lose the "what the team actually saw /
when it actually happened" distinction both modes exist to preserve.

The marker's clock source needed deciding, because "at their actual
declaration times" was not implementable. A declaration timestamp is
recorded only for **explicit** declarations
(`game-runtime/turn-declaration`): a clock-expiry declaration is detected by
the instance itself and a snakeless team is treated as having declared at
each turn's start, and neither carries a stamp. Worse, declaration is
per-team, not per-turn, so even a fully-stamped turn has several candidate
moments. The only per-turn boundary clock the record guarantees is the
recorded resolution start (`turn-keyed-game-record`, already enumerated and
scenario-pinned by `#resolution-takes-time`). The rule authored is therefore:
the marker is the latest declaration timestamp the record holds for the turn
**when every team's declaration for that turn was stamped** — then the last
of them is the moment the turn actually ended — and the turn's recorded
resolution start otherwise. The all-stamped condition matters: if any of a
turn's declarations is unstamped, the stamped ones cannot be known to be the
last, so taking the maximum of them would place the marker *before* the real
boundary. Falling back to the resolution start in that case is a hair late
rather than arbitrarily early, and it is available for every turn without
exception. What breaks if reversed: leaving "actual declaration times" as
written, Timeline mode is unimplementable for any turn a clock expiry ended
— the implementer either drops those turns from the axis, collapses them
onto a neighbour, or quietly invents equidistant spacing, which is
Per-Turn mode wearing Timeline mode's label.

The cleaner fix is upstream and is not this change's to make: if
`turn-pacing` stamped **every** declaration — the instance knows the
wall-clock moment it detects an expiry, and the moment it treats a snakeless
team as declared — the fallback would be unnecessary and every marker exact.
That is recorded here as the recommendation; the fallback is authored so
Timeline mode is implementable either way.

### Which store guards append-only, who writes an entry, and what the replay binding is not

`append-only-history` is one requirement over two stores, so it states the
property once and leans on the invariant that says where each store's guard
runs
(global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants):
in the game instance, the resolving reducer's own transaction commits
game-record rows and events and performs the single destroyed-turn stamp
from empty, so no second turn can re-stamp it; in Convex, each action-log
entry's write shares the transaction of the mutation it describes
(`actors-write-own-entries`). That is also why the requirement can speak of
"once the instance's resolving transaction commits" as a bright line at all
— the whole turn commits or none of it does
(global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic),
so there is never a half-turn for a later correction to tidy up. Reversed —
a guard evaluated outside the writing transaction, in either store — and
"append-only" degrades to a convention two concurrent writers can defeat,
after which no historical read is stable.

`actors-write-own-entries` was thinned on the same principle. Its rule is
that an entry's writer is the actor it describes; "the server never writes
entries for operator-originated events" is that rule read backwards, and
the prohibition on a Server standing in for an operator is already
global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server.
The requirement therefore cites it and keeps only the residue the invariant
does not cover: no later back-fill supplies an entry the operator's own
credentialed write did not produce — the case that matters because a
best-effort reconciliation job is the obvious thing to reach for when an
entry is found missing, and it would manufacture history.

The same reasoning bounds what `replay-binding-mutation-free` claims. A
binding that offers no mutation surface is an architecture property, not a
security boundary: writes from a replay client are refused by the owning
runtimes regardless (global-invariants/security-enforced-outside-the-library),
and mutating a finished game's records is forbidden outright by
`append-only-history`. The structural absence removes a whole class of
client-side mistake; it is never what the record's integrity rests on, and
a fork that restructures the binding loses no protection. The same holds
for `unified-replay-viewer`'s participants-only team-perspective mode —
presentation, not enforcement, and safe precisely because the underlying
data is already public for a finished game (`finished-games-public`).

### Inspection is client-local; concurrent auditors share nothing

08-REVIEW-008's resolution: replay inspection is a distinct, purely
client-local affordance (at most one inspected snake per client, no
writes, no shadows, no displacement), never the exclusive-lock selection
mechanic — whose semantics would be actively wrong for replay, where two
viewers inspecting the same snake must not displace each other.
`replay-inspection#concurrent-inspectors-never-conflict` pins the
no-shared-state property. Reversed — reusing the selection record — the
first two simultaneous auditors of a popular game would fight over a
lock that means nothing, and replay viewing would write state into a
finished game's records, violating append-only history.

That *general* property — a client-local, never-persisted examination
lens, independent of who holds a snake, that stages nothing — is now
owned once, by `decision-transparency/examined-subject`, the primitive
both the live coach displays and this viewer key off. `replay-inspection`
therefore declares it and states only the two increments replay adds: the
subject is free of the game's history (a snake someone else held then is
examinable now), and the reconstructed shadows keep rendering beside it.
Reversed — restating the generic clause here — the corpus would carry two
authorities for one idea, and the copy (which no consumer is obliged to
honour) would drift out of step with the owner the moment either is
revised.

### Mechanism demotions: 08-REQ-013, 08-REQ-076, 08-REQ-077

- **08-REQ-013** (replay viewer reached from the history page or direct
  link, not a top-level nav target): navigation topology is mechanism.
  Its behavioural residue — listings open the viewer, direct links reach
  it — is authored in `team-game-history` and
  `finished-games-public#direct-link-grants-any-finished-replay`.
- **08-REQ-076** (the data-source abstraction, live vs replay bindings):
  the abstraction is code architecture; its fork-stability contract was
  authored by team-server-management. What is behaviour — the replay
  binding exposing no mutation surface — is minted here as
  `replay-binding-mutation-free`.
- **08-REQ-077** (components need not distinguish live from replay;
  read-only enforced at the source, not per component): the
  per-component-uniformity half is mechanism (it prescribes *where in
  the code* the property lives); its observable core — read-only-ness
  comes from the binding offering no writes, never from per-component
  branches — is the `#read-only-is-not-per-component` scenario.

What breaks if the demotions are reversed: three requirements would pin a
specific client architecture (routing tables, an abstraction layer's
shape) that any fork may legitimately restructure, while the properties
that actually protect the record — no mutation path from replay — are
already held structurally by `replay-binding-mutation-free`.

## Constraint-mining (mandatory final step)

The leads routed to this change, each now a requirement or scenario:

- **Attribution records never deleted or mutated on disconnect; reconnect
  appends fresh** → `connect-time-attribution#disconnect-erases-nothing`,
  `#reconnect-appends-fresh`.
- **`weight_changed` carries full before/after values** →
  `team-action-log#weight-change-carries-before-and-after` (an entry is
  self-sufficient evidence of its transition; deltas would make
  reconstruction depend on a complete, gapless fold).
- **Canonical event order fully derived from event data, never stored** →
  `canonical-event-order#derived-not-stored`.
- **Replay data null for error outcomes; error outcomes carry no
  scores** → `once-at-end-export#error-outcome-exports-nothing`
  (with game-lifecycle/finish-notification owning the no-scores half of
  the terminal handling).
- **Replay/coach data-source bindings structurally mutation-free —
  type-level absence, not a runtime guard** →
  `replay-binding-mutation-free#absence-not-guard` (the coach-side
  binding was authored by live-game-observation; the replay binding is
  this capability's).
- **Tempo/boot/submit events' log half** →
  `team-action-log#tempo-and-boot-are-clock-anchored` (time-based, not
  turn-keyed, so the active-operator set is reconstructible at any
  wall-clock moment).
- **Transactional log pairing (06-REQ-037)** →
  `actors-write-own-entries#dropped-entry-means-no-mutation`.

- **Departure entries are the log's one non-self-written category, and no
  more than that** → `actors-write-own-entries#the-one-entry-its-actor-cannot-write`
  (an exemption stated as a single category at a single runtime, so it
  cannot be read as licence for the reconciliation job
  `#server-never-ghost-writes` exists to forbid).
- **Presence is folded from recorded events, never inferred from silence**
  → `experience-reconstruction#presence-is-read-not-guessed` (inferring
  from activity gaps is the obvious shortcut and it is wrong in exactly the
  case that matters — a connected operator who is thinking).
- **Scoreboard rows are recorded, not recomputed at read time** →
  `turn-keyed-game-record#aggregates-are-recorded-not-recomputed` and, on
  the producing side,
  `live-game-observation/scoreboard-sole-aggregate-authority#rows-outlive-the-live-audience`
  (a viewer-side recomputation is a second implementation of the scoring
  rule, and its drift would rewrite history invisibly).
- **Exactly one canonical encoding of engine values exists in the repo** →
  `replay-sufficiency#one-canonical-encoding` (the record adopting the
  recorded-run contract's encoding is precisely the invariant a future
  implementer would break by adding a convenient record-local shape).
- **Every turn is placeable on the real-time axis** →
  `unified-timeline#a-turn-nobody-declared-is-still-placed` (the failure
  mode is silent: an unplaceable turn gets dropped or collapsed rather than
  reported).

Swept once more over this change's own decisions: the absence-not-guard
invariant is the one whose quality depends on future implementers not
"improving" it, and it carries a scenario above. The derived-order,
unbounded-retention and single-stamp invariants this change mined were
re-homed to `game-runtime` by `mint-game-runtime`, which now carries them
and their scenarios; the mining that produced them is recorded here. No
further unminted invariants found.

## Requirement-grain dependencies are cross-capability only

Per the corpus-wide rule adopted while this change was open, a requirement
declares no dependency on a requirement in its own capability —
requirements inside a capability are one integrated cohort, reviewed
together, so an intra-capability edge carries no information and is the
only place a requirement-grain cycle could form. Two such entries were
removed from this delta: `team-perspective-replay`'s on
`experience-reconstruction`, and `replay-visibility-bound`'s on
`finished-games-public`. Nothing about either requirement's meaning
changes; the relationships they recorded are exactly the intra-capability
cohesion the rule assumes.
