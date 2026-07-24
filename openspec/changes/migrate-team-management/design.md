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
  tournaments change, and this capability's DAG ceiling does not include
  tournaments — so the freeze names no tournament. Instead the interval
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

### Boot mechanics excluded from captain authority

Legacy 05-REQ-012 bundled the captain's roster authority with the in-game
operator-boot affordance. The boot is an in-game control (a forced
disconnect during play, entangled with pacing quorum), owned by the
operator-control / turn-pacing stories; what is minted here is the
captain's authority over *membership*. Reversed — boot authored here —
this capability would need in-game vocabulary (connections, quorum,
disconnect semantics) its dependency ceiling cannot reach, and the boot
rule would sit where no one debugging in-game behaviour looks.

### UI mirrors folded; page scope authored as substance with a prose seam

08-REQ-023d (captain-only affordances) and 08-REQ-023e (frozen
affordances visibly disabled) mirror server-side authority and are folded
as scenarios into captain-authority and roster-freeze respectively —
enforcement authored once, the UI obligated to reflect and never bypass.
The page-scope rows (02-REQ-043, 08-REQ-023b) are authored as
team-management substance (the view, its audience, its display set, its
deliberate scope limit) with the nomination/health display kept — it is
part of what the page shows members — while nomination and healthcheck
*behaviour* is left as prose ("owned elsewhere") for the
server-management story. Reversed — parallel UI requirements — the two
copies drift, which is the legacy corpus's stitching problem re-imported.

### Admin unarchive dropped pending the Open Question

The delta authors unarchive as captain-only. The legacy parenthetical
"(or an admin)" collides with the sibling mint's read-only admin role;
the conflict is recorded as this change's Open Question rather than
silently resolved in either direction. If option B is chosen, the
amendment touches both changes (see proposal).

## Constraint-mining (mandatory final step)

- **Judged: the query-then-guard uniqueness lead.** Module 05's Design
  declares all indexes non-unique, with uniqueness enforced
  application-side via query-then-guard. For team records specifically:
  (a) *captaincy uniqueness needs no guard at all* — the structural
  single-reference representation makes a second captain unrepresentable,
  which is precisely why #exactly-one-captain pins the representation
  choice as behaviour; (b) *team names carry no uniqueness invariant in
  the binding text*, so none is invented; (c) *membership uniqueness is
  the real query-then-guard exposure* — a duplicate-add race is silently
  violable by an implementer who checks then inserts without atomicity.
  That invariant is minted as
  team-management/roster-of-operators#membership-is-a-set.
- **Minted: freeze-check atomicity.** The legacy freeze design is itself
  a query-then-guard (query for a playing game, then write the roster).
  Its quality depends on the check and the write sharing one atomic
  transaction — an implementer who hoists the check out of the mutation
  (or into the client) opens a window where a roster edit lands on a
  frozen team just after its game's snapshot binds. Minted as
  team-management/roster-freeze#check-and-write-atomic, minimally
  constraining: any mechanism that makes check-and-write atomic
  satisfies it.
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
