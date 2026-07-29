## Context

Migration change minting `team-management` from legacy modules 02, 03, 05,
and 08 (12 ids, 3 review items), per the author-approved capability map,
dependency DAG (identity-and-authorization only), and assignment matrix
(open question Q1 resolved: mint). Legacy module 05 §5.3 is the core
source; legacy text is binding, matrix intents are hints. This file
records the decisions a future reader cannot recover from the specs alone.

## Decisions

### Mint the capability (matrix Q1) rather than fold into siblings

The alternative was to scatter the cluster into
identity-and-authorization (roster/freeze) and accounts-and-profiles
(records/archive). Reversed, "who is on the team and who leads it" — one
workflow the captain experiences as one thing — would again live in two
places, and identity-and-authorization would grow team-mutation substance
it explicitly disclaims (its Purpose ends where running a team begins).
The scouts for modules 03 and 05 independently proposed the mint; the
author approved it with the capability set.

### Captaincy is structural; the role model stays dead (05-REVIEW-014)

The resolved timekeeper elimination made captaincy a single reference on
the team record and left membership role-free — every member is an
operator. The mint encodes this twice over: team-record's structural
captaincy (#exactly-one-captain, #captaincy-not-a-member-role) and
roster-of-operators' "no role distinctions of any kind" (#members-are-peers).
Reversed — a per-member role field — the timekeeper ghost has a place to
respawn, captaincy can drift from the role field (two representations of
one fact), and the downstream stories that assume "member = operator"
(selection, tokens, quorum) inherit a phantom role dimension. The stale
"members with their roles" phrase in the legacy view text (08-REQ-023b,
pre-dating the role elimination) is deliberately not carried.

### The roster is current membership only — history is derivable, not kept

The delta keeps a membership record per human *currently* on a team's
roster and no membership timeline: removal deletes the record, and nothing
on the team says the person was ever a member
(`roster-of-operators#the-roster-is-not-a-history`). Historical membership
is instead **derivable from game records** — every launched game keeps a
participating-team snapshot naming each team's members at initialization
(`game-lifecycle/roster-snapshot`), those snapshots are append-only
historical fact, and reading them backwards answers "which teams has this
person played for" and "who was on this team when that game was played".

**The accepted limitation** (author decision, 2026-07-28): *a player who
joined a team and left it without ever playing a game for it leaves no
trace anywhere.* There is no record that the membership existed, no
join/leave dates for anyone, and no way to reconstruct a roster as of an
arbitrary date — only as of games actually played. The author accepts this
knowingly; it is a decision, not an oversight, and it is written here so
that the next reader who notices the gap finds it already answered rather
than filing it as a defect.

Why accept it: a membership-history table is a second representation of who
is on a team, and the corpus has already paid once for exactly that mistake
(the per-member role field the timekeeper elimination removed). It would
need its own invariants — an open interval per membership, exactly one open
interval per human-team pair, closure on removal, correct behaviour under
archive/unarchive — and every one of them is a guard that can drift out of
agreement with the roster it shadows. The game-record snapshots, by
contrast, are written for a different purpose (binding a game's
authorization), are append-only by construction, and cannot disagree with
anything because nothing else records the same fact. Reversed — minting a
membership history here — this capability acquires a second source of truth
for membership whose only consumer is a profile view, and the first
inconsistency between it and the roster is a bug with no principled
resolution.

The requirement is worded to make the absence visible rather than to leave
it inferable. Its previous wording ("persistent membership records
associating each human member with their Centaur Team") was silent about
tense, which is precisely how a downstream reader ends up promising
historical memberships on a profile page that no store can answer.

### One freeze requirement, phrased extensibly (dedupe 03-REQ-046 + 05-REQ-013)

The two legacy statements of the mid-game freeze are authored once as
roster-freeze. Three sub-decisions:

- **Hard rejection is the semantics (03-REVIEW-006).** The resolved
  review chose "reject, not queue": the snapshot binds the running game's
  authorization (cited: identity-and-authorization/roster-snapshot-binding),
  and the freeze exists to keep the live record coherent with it.
  Reversed — queued edits applying at game end — a captain's "remove
  member" would sit latent and fire minutes later, and the rejection
  contract the UI mirrors (#frozen-affordances-visibly-disabled) would
  have nothing definite to mirror.
- **The frozen set includes the server nomination.** The binding
  03-REQ-046 enumerates domain changes alongside roster edits, and the
  nomination anchor lives on the team record minted here; the freeze over
  the field is therefore authored here, while nomination *semantics* stay
  with the server-management story (which depends on this capability and
  can cite the freeze). Splitting the freeze per field across two
  capabilities would author the same rule twice.
- **"At minimum while a game is being played", extensible upward.** The
  tournament-wide extension (legacy 05-REQ-064) belongs to the
  tournaments change, and this capability's declared dependencies do not
  include tournaments — nor should they be extended to, since the
  dependency runs the other way — so the freeze names no tournament.
  Instead the interval
  is defined as extensible ("held longer by enclosing competitive
  engagements, never shorter"), giving the extension something to cite.
  Reversed — a freeze hard-coded to exactly the playing interval — the
  tournament extension would have to contradict this text rather than
  extend it.

The archive gate is expressed through the freeze ("only while its roster
is not frozen") rather than by re-enumerating conditions: the legacy
archive precondition ("no playing game and not in an active tournament")
is exactly the freeze condition plus its tournament extension, so the
phrasing inherits the extension automatically when tournaments lands.

One consequence of archiving is authored elsewhere, and a reader will look
for it here. `archive-not-delete` says an archived team "cannot be enrolled
in new games", which reads as a bar on *future* enrolment and says nothing
about the enrolments the team already holds — deliberately, because those
enrolments are the matchmaking capability's record, not this one's. That
capability's enrolment requirement is where the reactive half lives:
archiving a team withdraws it from the rooms it is enrolled in, in the same
transaction as the archival, which is why the gate above needs no clause
about rooms and why no start ever has to inspect a team's archived state.
The author settled this shape on 2026-07-28, in preference to re-checking
archival at the moment a game starts.

**The composed prohibition is pinned as a scenario, not re-derived as a
clause** (author, 2026-07-28). The rule the author cares most about here is
a *state* rather than an act: "a team that is an active participant of a
game while simultaneously archived" must never be reachable — in their
words, "that would be asking for bugs". The corpus already forbade it, but
only transitively: the archive gate defers to the freeze, the freeze holds
while the team is competitively engaged, and engagement is published by the
capability that runs the games. A reader had to compose three requirements
to see it, which is too much work for the rule with the sharpest
consequence on the page. So `archive-not-delete` gains
`#archived-and-playing-is-unreachable`, which asserts the composed outcome
and defers to the freeze for the reason.

What it deliberately is *not*: a clause on the requirement body restating
the condition. A clause would have to say what "engaged" means, which would
put a second definition of engagement in the corpus alongside the published
one, and a second copy of the freeze predicate alongside `roster-freeze`'s
— exactly the drift the DRY rule exists to prevent, and doubly bad here
because the freeze interval is designed to *lengthen* when enclosing
engagements (a tournament) plug in, so a local copy would silently stop
matching. The scenario names the freeze as a concept and no predicate of
its own, so the two can never disagree. What breaks if reversed (leaving
the prohibition purely transitive): the rule stays true and stays
invisible, and the first implementer to write an archive path reads a
requirement whose only stated precondition is "not frozen", with nothing
telling them which state that precondition exists to make unreachable —
so a well-meaning refactor that narrows the freeze looks locally harmless.

### The freeze consumes its sources; it cannot declare the capability that owns them

Review (2026-07-28) raised the obvious objection to the freeze's
abstraction: "any game the team is participating in is currently being
played" is a fact about game status, game status is owned by
`game-lifecycle`, and this capability declares no dependency on it. The
intended fix was to add `game-lifecycle` to the Purpose and to
`roster-freeze`'s declaration. **It cannot be added: it closes a cycle.**
`game-lifecycle` declares `team-server-management` (game invitations,
invitation acceptance, the launch healthcheck) and
`team-server-management` declares `team-management` (the captain names the
server, and the nomination anchor lives on the team record minted here), so
`team-management → game-lifecycle → team-server-management →
team-management` is a three-hop cycle the graph check rejects. The
declaration was attempted and the check reported exactly that; the cycle is
not an artefact of one weak edge, since all three hops carry real
substance.

So the abstraction stays, and the delta now says *why* it is an abstraction
rather than leaving it looking like vagueness: whether a game is being
played and which teams are in it are facts the capabilities running those
engagements own, and this capability consumes them as freeze sources and
resolves none itself. Mechanically this is the same shape already chosen
for the tournament extension — freeze sources plug in from outside, and the
freeze composes them so the interval can only lengthen. What breaks if
reversed (this capability resolving the predicate itself): it must reach
into game status, which means either the cycle above or a duplicate notion
of "being played" maintained here, and a team's roster would then be
frozen or thawed by a rule that can disagree with the game's own status.

The edge was then **inverted rather than abandoned**. `game-lifecycle` now
publishes the fact — one requirement there is the single definition of "this
team is competitively engaged right now", derived only from the games that
capability owns and readable without knowing games exist — and this
capability consumes it. That runs with the graph instead of against it: the
producer already sits downstream of this capability, so nothing new is
declared in either direction, and the tournament extension gets the same
seam for free. What breaks if reversed (each consumer deriving engagement
from game records itself): "engaged" acquires as many definitions as
consumers, and a team's roster can be frozen by one rule and thawed by
another.

What this still costs, honestly: publishing gives the seam an authoritative
producer, not a declared edge. `tasks.md` (4.1) remains where an implementer
learns which records the predicate reads, and the reference lint cannot
check that the seam still resolves.

### Boot mechanics excluded from captain authority

Legacy 05-REQ-012 bundled the captain's roster authority with the in-game
operator-boot affordance. The boot is an in-game control (a forced
disconnect during play, entangled with pacing quorum), owned by the
operator-control / turn-pacing stories; what is minted here is the
captain's authority over *membership*. Reversed — boot authored here —
this capability would need in-game vocabulary (connections, quorum,
disconnect semantics) its declared dependencies do not reach — and
extending them to reach it would be the wrong fix, since the boot's home
is the in-game story — and the boot rule would sit where no one debugging
in-game behaviour looks.

### UI mirrors folded; page scope authored as substance with a prose seam

08-REQ-023d (captain-only affordances) and 08-REQ-023e (frozen
affordances visibly disabled) mirror server-side authority and are folded
as scenarios into captain-authority and roster-freeze respectively —
enforcement authored once, the UI obligated to reflect it. The obligation
itself is not restated here: it is
`global-invariants/client-truthfulness` (rejections reach the user,
enablement derives from server state) together with
`global-invariants/one-contract-many-surfaces` (no surface has a private
bypass), so the folded scenarios say what the surface shows and stop
there — see "Integration pins" below.
The page-scope rows (02-REQ-043, 08-REQ-023b) are authored as
team-management substance (the view, its audience, its display set, its
deliberate scope limit) with the nomination/health display kept — it is
part of what the page shows members — while nomination and healthcheck
*behaviour* is left as prose ("owned elsewhere") for the
server-management story. Reversed — parallel UI requirements — the two
copies drift, which is the legacy corpus's stitching problem re-imported.

### Admin unarchive kept, with the admin role's principle re-scoped

The legacy parenthetical "(or an admin)" on unarchive collided with the
sibling mint's read-only admin role; the conflict was raised as this
change's Open Question rather than silently resolved in either direction,
and the author resolved it (2026-07-24) in favour of keeping the power.
The read-only principle is scoped to the authoritative state of **live game
runtimes**; platform-held state is not principle-barred from admin
mutation, and each such power is granted expressly, per requirement. Team
unarchive is one such express grant
(`archive-not-delete#admin-unarchive-recovers-abandoned-teams`), and the
sibling's `identity-and-authorization/platform-admin-role` carries the
matching `#powers-are-expressly-granted` scenario alongside
`#no-write-path-into-live-games`. Reversed — captain-only unarchive — a
team whose captain has left the platform is stranded permanently, with no
actor able to recover it and no deletion path either, since archiving is
the only retirement.

### Where global-invariants carries the load

Several requirements here are sound only while a cross-cutting invariant
holds; the delta cites `global-invariants` at those points (and the
capability declares the dependency) instead of restating the invariant
locally:

- **The team record's singularity** (`team-record`, `archive-not-delete`)
  rests on `global-invariants/single-convex-deployment`. "*The* team
  record" and "every historical reference still resolves after archiving"
  are single-store guarantees; relax the one-deployment rule and
  archiving becomes a distributed cleanup contract whose failure mode is
  exactly the dangling attribution this capability promises never
  happens.
- **Atomic team creation** (`team-creation`) rests on
  `single-convex-deployment#cross-record-invariants-are-one-transaction`:
  "no intermediate captainless or memberless state" is a two-record
  commit, and co-location in one deployment is what makes it one
  transaction rather than a compensating-write problem.
- **The captain gate's surface-independence** (`captain-authority`) rests
  on `global-invariants/one-contract-many-surfaces` — without it the gate
  would read "only the captain, on the surfaces that choose to ask".
- **The view's uniform reachability** (`team-management-view`) rests on
  `global-invariants/access-follows-identity`. Every team may fork and run
  its own Server, so "accessible to every current member" is a
  platform-wide fact only while read access follows the human's identity
  rather than the deployment they happen to open.
- **Uniqueness and freeze races** (`roster-of-operators`, `roster-freeze`)
  rest on `global-invariants/transactional-invariant-enforcement` — see
  the constraint-mining notes below.

### Integration pins: constraints borne, not restated

- `roster-of-operators`' "the captain SHALL themselves be a current
  member at all times" is a cross-record invariant spanning the team
  record's captain reference and the membership rows. One guard can
  enforce it because of
  `single-convex-deployment#cross-record-invariants-are-one-transaction`;
  the requirement states the invariant and leaves that ground to gi
  rather than pinning it a second time.
- `captain-authority` no longer says "enforced server-side at the
  mutating function … interface gating reflects it and never substitutes
  for it". Both halves are owned upstream:
  `identity-and-authorization/mutation-authorization` (authorization is
  enforced at the function contract; client-side gating is presentation,
  never enforcement) and, for the forked application specifically,
  `global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant`
  (a team that hides or adds affordances changes no invariant).
  `#captain-only-affordances` is therefore authored as the display
  expectation alone; that a withheld affordance is presentation rather
  than enforcement is
  `global-invariants/client-truthfulness#enablement-derives-from-server-state`.
- `team-creation`'s authentication floor is not this capability's to
  state — `global-invariants/authenticated-unambiguous-identity` and
  `identity-and-authorization/authentication-required` own it — so
  `#no-special-standing-required` asserts only what is local: that
  nothing *beyond* that floor is a precondition. The permissiveness is
  the requirement's content; the floor is cited ground, and this
  capability is not the place where relaxing the floor would first be
  noticed.
- `archive-not-delete#archive-blocked-while-frozen` is a freeze-guarded
  write. It used to reach the guard one hop away by declaring
  `team-management/roster-freeze`; that entry is gone under the
  intra-capability rule below, and nothing is lost — the gi citation is
  made once, where the freeze rule is authored, and the archive gate and
  the freeze rule are one guarded rule read from two places, not two.

### No requirement here declares another requirement of this capability

Two intra-capability entries were removed on 2026-07-28 under the author's
corpus-wide rule that the requirements of one capability are a single
integrated cohort: `roster-of-operators → team-record` and
`archive-not-delete → roster-freeze`. Both were true statements — the
roster hangs off the team record, the archive gate is the freeze condition
— and both were also invisible to the reader as *dependencies*, because a
reader of `team-management` has all eight requirements in front of them and
needs no edge to be told the roster and the team record belong together.
What the edges cost is the graph's meaning: a capability-grain acyclicity
check cannot see inside a capability, so intra-capability edges are the one
class of dependency the corpus records without ever checking, and here they
would have recorded a fact the capability's own boundary already carries.
The capability-grain declarations both entries implied were already carried
by other requirements, so the Purpose line is unchanged. What breaks if
reversed: every capability grows an internal graph that nothing validates
and no reader consults, and the real signal — which *other* capabilities a
requirement's soundness leans on — is diluted by edges that never leave
home.

## Constraint-mining (mandatory final step)

- **Judged: the query-then-guard uniqueness lead.** Module 05's Design
  declares all indexes non-unique, with uniqueness enforced
  application-side via query-then-guard. For team records specifically:
  (a) *captaincy uniqueness needs no guard at all* — the structural
  single-reference representation makes a second captain unrepresentable,
  which is precisely why #exactly-one-captain pins the representation
  choice as behaviour. That choice **discharges** the guard obligation
  `global-invariants/transactional-invariant-enforcement` would otherwise
  impose on a uniqueness rule; it does not depend on it. Relaxing that
  invariant would not endanger #exactly-one-captain, because there is no
  concurrent write that could produce a second captain for a guard to
  catch — so the dependency is recorded here, in design, and not as a
  citation on the requirement. (Reversed — captaincy as a set or as a
  per-member flag — the requirement would immediately acquire the same
  gi dependency membership uniqueness has.) (b) *team names carry no
  uniqueness invariant in the binding text*, so none is invented;
  (c) *membership uniqueness is the real query-then-guard exposure* — a
  duplicate-add race is silently violable by an implementer who checks
  then inserts without atomicity. That invariant is minted as
  team-management/roster-of-operators#membership-is-a-set, which cites
  `global-invariants/transactional-invariant-enforcement`: the set
  property is what this capability owns, the same-transaction guard that
  makes the racing case decidable is what gi owns.
- **Minted as an outcome, grounded in gi: freeze-check atomicity.** The
  legacy freeze design is itself a query-then-guard (query for a playing
  game, then write the roster). Its quality depends on the check and the
  write sharing one atomic transaction — an implementer who hoists the
  check out of the mutation (or into the client) opens a window where a
  roster edit lands on a frozen team just after its game's snapshot
  binds. The transactional discipline is not minted here: it is
  `global-invariants/transactional-invariant-enforcement`, which names
  freeze rules alongside uniqueness and exclusivity, and now covers a
  game instance's own reducer transactions as well as Convex mutations
  (#both-stores-guard-their-own-invariants). What
  team-management/roster-freeze#check-and-write-atomic authors is the
  local *outcome* that invariant must deliver here — no roster change
  ever lands on a frozen team — with the mechanism left where it belongs.
  Minimally constraining: any mechanism satisfying gi's guard placement
  satisfies it.
- **Minted as a pinned outcome, not a new predicate: archived-and-playing
  is unreachable.** The archive path's quality depends on an invariant an
  implementer can silently narrow — the freeze it defers to — and the
  observable consequence (no archived team is ever an active participant of
  a game being played) was nowhere stated, only derivable. Minted as
  team-management/archive-not-delete#archived-and-playing-is-unreachable,
  minimally constraining because it adds no condition to check: any
  implementation that honours the existing not-frozen precondition
  satisfies it, and the scenario's job is to make a narrowing of the freeze
  fail a test rather than pass review. The sibling capability's room modes
  close the other route to the same state — a team enrolled into a room
  after its game launched, which is no longer possible at all
  (rooms-and-matchmaking/room-mode) — so the two halves are one decision:
  the state is unreachable, and it is unreachable *visibly*.
- **Checked, already requirements**: no-deletion (the archive design's
  load-bearing invariant — historical attribution survives because
  nothing is ever removed) is authored directly as archive-not-delete
  with #history-resolves-after-archive; captain-gate placement at the
  function contract is carried by
  identity-and-authorization/mutation-authorization and reflected in
  #non-captain-rejected-at-the-function.
- **Checked, plastic**: the coach-storage shape (an id array on the team
  record), the freeze check's specific queries, and the view's routing
  are mechanism — doc comments citing this change suffice when the code
  lands.
