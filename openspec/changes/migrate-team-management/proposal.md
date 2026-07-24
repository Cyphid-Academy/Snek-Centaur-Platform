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
05-REQ-013 authored as one requirement). Declared dependency:
**identity-and-authorization only** (the DAG ceiling for this capability).

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
  roster of role-less operator members, captain-only mutation authority
  with server-side enforcement, coach designations distinct from the
  roster, the hard mid-game roster freeze (single dedupe of the module 03
  and module 05 statements), archive-in-place-of-deletion, and the
  scope-limited Team Management view.
- **UI-mirror requirements folded, enforcement authored once**:
  08-REQ-023d becomes the #non-captain-rejected-at-the-function /
  #captain-only-affordances scenarios of the captain-authority
  requirement; 08-REQ-023e becomes the #frozen-affordances-visibly-disabled
  scenario of the freeze requirement.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

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
   - **Decision (author, 2026-07-24)**: Option B, generalized. The admin role's read-only principle is scoped to the authoritative state of live game runtimes; platform-held state is not principle-barred from admin mutation, with powers granted expressly per requirement. Team unarchive is so granted: archive-not-delete carries the #admin-unarchive-recovers-abandoned-teams scenario, and the sibling's platform-admin-role is re-authored to match (#no-write-path-into-live-games, #powers-are-expressly-granted).
