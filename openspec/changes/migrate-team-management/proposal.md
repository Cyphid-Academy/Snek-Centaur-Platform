## Why

Third change of the final spec-migration train. The "captain runs the
team" story — creating a team, its roster and captaincy, coaches,
archiving, the mid-game roster freeze — has no vocabulary owner today: its
substance is scattered across module 02 (the management page's scope),
module 03 (the roster freeze), module 05 (the team and membership records,
captain authority, archive-only semantics, coach storage), and module 08
(the Team Management view and its captain gating). Re-authoring it as one
capability puts the whole workflow in one readable place and retires 12
legacy ids.

## Carving decision

Mint **`team-management`** exactly as drawn in the capability map and
assignment matrix (open question Q1, author-approved with the capability
set and DAG). The legacy requirements and review items this change
absorbs are recorded in the identifier map under this change's name,
including the roster-freeze dedupe cluster (03-REQ-046 +
05-REQ-013 authored as one requirement). Declared dependencies:
**identity-and-authorization** and **global-invariants** — the latter
declared because the delta's requirements carry genuine soundness
dependencies on cross-cutting invariants (see design.md, "Where
global-invariants carries the load"); the declaration is extended
whenever a citation is warranted, not held to a fixed set.

Deliberate boundaries:

- **Captaincy is structural, roles are dead.** Per the resolved timekeeper
  elimination, every member is an operator and captaincy is a single
  structural reference on the team record — this change mints no
  per-member role vocabulary.
- **Membership authority here; in-game boot mechanics elsewhere.** The
  captain's authority over who is on the team is authored here; the
  in-game operator-boot affordance the legacy captain text also mentioned
  is an in-game control belonging to the operator-control / turn-pacing
  stories and is not carried into this capability.
- **Nomination and health semantics belong to team-server-management.**
  The team record anchors the server nomination and the management view
  displays it with its health status (authored here as page/record
  substance, seam left as prose); nominating, validating, clearing, and
  healthchecking are that capability's story.
- **The tournament-wide freeze extension belongs to tournaments.** The
  freeze here is phrased extensibly — frozen "at minimum" while a game is
  being played, with longer intervals holdable by enclosing competitive
  engagements — so the tournament-span extension (legacy 05-REQ-064) can
  later cite it without this capability referencing tournaments. The
  whole-event-freeze question is routed to the tournaments change.

## What Changes

- **New capability `team-management`** (mint delta, ADDED-only, 8
  requirements): the persistent team record with structural captaincy,
  team creation by any authenticated user (creator becomes captain), the
  current-membership-only roster of role-less operator members with no
  membership timeline of any kind, captain-only mutation authority
  with server-side enforcement, coach designations distinct from the
  roster, the hard mid-game roster freeze (single dedupe of the module 03
  and module 05 statements), archive-in-place-of-deletion — with the state
  "archived while an active participant of a game being played" pinned as
  unreachable rather than left to be composed out of the archive gate and
  the freeze — and the scope-limited Team Management view.
- **UI-mirror requirements folded, enforcement authored once**:
  08-REQ-023d becomes the #non-captain-rejected-at-the-function /
  #captain-only-affordances scenarios of the captain-authority
  requirement; 08-REQ-023e becomes the #frozen-affordances-visibly-disabled
  scenario of the freeze requirement.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-team-management/specs/team-management/spec.md`
  (folded to `openspec/specs/team-management/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `team-management`
  (at archive).
- Code citations: team-record/membership/coach mutations and the Team
  Management view gain `// spec: team-management/...` citations when the
  implementation lands.

## Open Questions

1. **Admin unarchive vs the read-only admin role.**
   - **Context**: the binding legacy text (05-REQ-015a) says an archived
     team "may be unarchived by its Captain (or an admin)", and legacy
     module 05 elsewhere gives admins room-unarchive powers too. The open
     sibling mint `identity-and-authorization/platform-admin-role`
     re-authors the admin role as extending **read access only**, with the
     #no-write-path-into-live-games scenario rejecting any mutation an admin
     could not perform as an ordinary user. The two cannot both hold.
   - **Question**: does the platform admin retain the unarchive mutation
     over teams, as a deliberate exception to the read-only admin stance,
     or does the read-only re-authoring supersede the legacy parenthetical?
   - **Options**: (A) captain-only unarchive — the read-only admin role
     supersedes; the delta as authored states this, and the map entry for
     05-REQ-015a notes the dropped parenthetical. (B) keep admin
     unarchive — amend team-management/archive-not-delete with an explicit
     admin-unarchive scenario **and** carve a corresponding exception into
     the sibling change's platform-admin-role requirement (a cross-change
     edit needing that change's author attention).
   - The delta is currently authored per option A (the conservative
     reading that keeps the sibling mint intact); a human decision is
     required before archive.
   - **Decision (author, 2026-07-24)**: Option B, generalized. The admin role's read-only principle is scoped to the authoritative state of live game runtimes; platform-held state is not principle-barred from admin mutation, with powers granted expressly per requirement. Team unarchive is so granted: archive-not-delete carries the #admin-unarchive-recovers-abandoned-teams scenario, and the sibling's platform-admin-role is re-authored to match (#no-write-path-into-live-games, #powers-are-expressly-granted). Both halves are in place.

2. **Does the platform keep historical team membership?**
   - **Context**: `roster-of-operators` said only "persistent membership
     records", silent about tense, while the sibling
     `accounts-and-profiles/player-profile` promises a user's "current
     **and historical**" team memberships. Either this capability owes a
     membership timeline, or the profile is promising something no store
     can answer.
   - **Decision (author, 2026-07-28)**: no timeline. Historical membership
     is **derivable from game records** — the participating-team snapshots
     each launched game keeps — and nothing is minted here. The delta now
     says so outright: the roster is current membership only, and a removed
     member leaves no trace on the team
     (`roster-of-operators#the-roster-is-not-a-history`). The author
     accepts the consequence that **a player who joined and left a team
     without ever playing a game for it leaves no trace anywhere**; the
     limitation and its rationale are recorded in design.md so it reads as
     a decision rather than an oversight. `player-profile` is owned by
     another change and must be reworded to promise only what the snapshots
     can answer.

3. **`roster-freeze` reads game status it cannot declare a dependency on.**
   - **Context**: the freeze predicate is phrased abstractly ("any game the
     team is participating in is currently being played") but reads records
     `game-lifecycle` owns, and this capability declares only
     `identity-and-authorization` and `global-invariants`. The intended
     resolution was to add `game-lifecycle` to the Purpose and to
     `roster-freeze`'s declaration.
   - **Decision (2026-07-28)**: the edge is **inverted**, not added. The
     natural direction is a cycle — `team-management → game-lifecycle →
     team-server-management → team-management`, which the graph check
     rejects, and all three hops carry real substance, so there is no weak
     edge to drop. Instead `game-lifecycle` now publishes the fact:
     `game-lifecycle/competitive-engagement` is the single definition of
     "this team is competitively engaged right now", derived only from the
     games that capability owns and readable without knowing games exist.
     This capability consumes it and declares nothing, which is what
     removes the need for the edge in either direction.
   - The abstraction in the requirement stays and is now deliberate rather
     than vague: the capabilities running the engagements own whether a
     game is being played and who is in it; this one consumes those facts
     as freeze sources and resolves none itself. The seam still lives in
     `tasks.md` (4.1) and is still not lint-checked — publishing gives it
     one authoritative producer, not a declared edge.

4. **Does an archived team need a rule about the games it is already
   lined up for?**
   - **Context**: `archive-not-delete` says an archived team "cannot be
     enrolled in new games" — a bar on future enrolment that says nothing
     about enrolments the team already holds. `rooms-and-matchmaking`
     briefly carried the complement as a start-time condition: a start was
     refused while any enrolled team was archived.
   - **Decision (author, 2026-07-28)**: no new requirement here, and the
     start-time condition is dropped. The author's shape is one
     prohibition plus one reactive withdrawal. The prohibition — a team
     enrolled in an active game or an active tournament cannot be archived
     at all — **is already authored in this capability**:
     `archive-not-delete` permits archiving only while the roster is not
     frozen, and `roster-freeze` already freezes a competitively engaged
     team over an interval that enclosing engagements may lengthen but
     never shorten, which is what the tournament-wide extension plugs
     into. The
     reactive withdrawal — archiving a team removes it from the rooms it
     is enrolled in, in the archival's own transaction — is authored on
     the matchmaking capability's enrolment requirement, because the
     enrolled set is that capability's record; this change's design notes
     where a reader should look for it, and `tasks.md` (3.7, 6.1) carries
     the implementation seam, since the archival mutation is this
     capability's while the enrolment write is not.
   - **Follow-up decision (author, 2026-07-28, second pass)**: the
     prohibition stays transitive in its *derivation* but stops being
     transitive to *read*. The author was explicit that the state "an
     active participant of a game while simultaneously being archived"
     must never be reachable, and a rule that consequential should not
     require composing three requirements to find, so
     `archive-not-delete` gains one scenario —
     `#archived-and-playing-is-unreachable` — asserting the composed
     outcome and deferring to the freeze for the reason. Deliberately a
     scenario and not a clause: a clause would have to restate what
     "engaged" means, putting a second definition beside the published one
     and a second copy of the freeze predicate beside `roster-freeze`'s,
     which would silently stop matching the moment an enclosing engagement
     lengthens the interval. No requirement body, no `Depends on:` line,
     and no other scenario changed. The complementary half is the sibling
     change's: `rooms-and-matchmaking/room-mode` closes the other route to
     the same state by making it impossible to enrol a team into a room
     after that room's game has launched.
