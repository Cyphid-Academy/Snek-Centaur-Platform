## Context

Final migration change of the train, minting `accounts-and-profiles`
from legacy modules 05 (user records) and 08 (profiles, statistics,
leaderboard, and the email-hygiene rule) — 21 ids, 2 review items — per
the author-approved capability map, dependency DAG
(identity-and-authorization, team-management, replay-and-audit), and
assignment matrix. Legacy text is binding, matrix intents are hints.
This file records the decisions a future reader cannot recover from the
specs alone.

## Decisions

### The record is here; the identity is not (cite, don't restate)

Legacy module 05 restated module 03's identity semantics while adding the
record substance. The mint keeps only the record: creation at first sign-in,
the captured fields, the immutability of its identifier, permanence. Which
credential resolves to which person is cited
(identity-and-authorization/linked-provider-credentials), never restated —
reversed, two capabilities would own "who is the same human", and the first
revision to one would silently contradict the other.

The record's *identifier* is what never changes; the email is an ordinary
attribute alongside the display name. That split is what makes attribution
durable through a change of provider account, and it is the record-side face
of global-invariants/durable-identity-references. Reversed — the email frozen
on the record and treated as its identity — every downstream reference
inherits a key the platform does not control.

`user-record-permanence` is kept separate from `user-record` because it is
the archive-grade invariant everything downstream leans on: attribution,
profiles, and statistics survive the loss of a provider account only because
no record is ever deleted or merged. Reversed — a "cleanup" of dormant
records — every replay and history referencing them dangles, which the
append-only record model forbids.

Integration: both requirements stand on invariants they now cite.
`user-record`'s one-record-per-person guarantee is
achievable only as a guard inside the writing transaction
(global-invariants/transactional-invariant-enforcement) — two racing
first sign-ins are the case that fails otherwise; permanence's
"anchored forever" presumes accounts live in exactly one persistent home
(global-invariants/single-convex-deployment), which is also what lets a
single mutation relate a record to the team and game records that
reference it. Neither requirement restates the guard discipline: the
discipline is gi's, the record semantics are ours.

### Email confidentiality is a data-contract rule, not a UI rule (resolved review: profile visibility)

The resolved email-visibility review chose the strictest option: emails
never appear in any user-facing query, the user's own self-view included.
The address exists for contacting a person and for administrative
operations; none of the surfaces this capability defines is either. The mint authors this
as `email-confidentiality`, a rule over *record shapes*, not screens:
user-facing shapes omit the email at the boundary, and participation
snapshots never store it. What breaks if reversed (email returned, then
hidden by presentation): every new view built on the same shape is a
leak waiting to happen, browser tooling exposes what the UI hides, and
— worst — an email stored in an append-only participation snapshot
could never be removed again, turning one implementation shortcut into
permanent PII in every export. Scope judgment: the requirement binds
the *user-facing* surface; the identity-matching and administrative
machinery (which must read the stored email to do its job) sits outside
that surface, consistent with the legacy carve-out for admin-only
access. It grants no user-facing admin view of emails — none exists in
the binding text, so none is minted.

Why the boundary and not the screen: teams run forked applications, and
global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant
places every enforced invariant in the Convex function contract rather
than in any application's presentation layer. A confidentiality rule
phrased over screens would be unenforceable by construction — the rule
is sound only as a constraint on the record shapes the contract returns,
which is why the requirement cites that invariant. Consequence for the
profile requirements: neither carries an email clause of its own.
`email-confidentiality` already names profiles, the self-view included,
so a second statement on `player-profile` would be a copy with no
authority; it was removed.

### Authenticated-only, authored once

Three legacy statements pinned authenticated-only access (player
profile, team profile, leaderboard), all flowing from the same resolved
review. The mint authors one `no-public-surface` requirement citing
identity-and-authorization/authentication-required, plus the
complementary positive rule: among authenticated users there is no
further gate — profile and leaderboard scoping is discovery, never
access. Reversed (per-view repetition): the next surface added to this
capability — a statistics page, say — would carry no rule at all, which
is exactly how the legacy "public" ambiguity arose. Reversed (public
surface): team and player data becomes internet-indexable, contradicting
the platform's auth-required posture.

Integration. `identity-and-authorization/authentication-required` leaves
a carve-out for "public, non-user-specific views" — a permission, not an
entitlement — and a leaderboard or teams browser is precisely the kind of
surface a reader might expect to sit in it. `no-public-surface` settles
that question for this capability by leaving the carve-out empty; the two
read together as a general allowance a capability declines to exercise,
not as a conflict. Two invariants make the settled rule deliverable:
enforcement lives in the Convex function contract, not in a forked
application's routing
(global-invariants/security-enforced-outside-the-library), and read
access follows the viewer's Google identity rather than the Server they
happened to visit (global-invariants/access-follows-identity#same-data-regardless-of-server)
— without the latter, "any authenticated user, no further gate" would be
a per-deployment claim rather than a platform-wide one. Because
`no-public-surface` owns access for every surface here, `player-profile`
and `team-profile` no longer restate who may view them, and the team
profile's history openness follows from that rule plus
`replay-and-audit/finished-games-public` rather than from a third
statement of its own.

### Snapshot attribution, archive-stable (resolved review: archived teams in leaderboards)

All historical presentation — histories, statistics, head-to-head,
rankings — resolves through participating-team snapshots, and archiving
never changes a presented datum. The resolved review's rationale is
carried whole: deletion is not a thing on this platform, so hiding
archived teams from the leaderboard would *rewrite historical outcomes*
— team A's ranking would improve because team B archived, without a
game being played. Reversed — current-record resolution — a user's old
games would re-attribute to their new team, head-to-head records would
dangle when opponents archive, and rankings would drift with roster
churn. The teams-browser tension ("lists all teams" vs. archive's
hidden-from-default-listings) is resolved in favour of the later,
author-approved archive semantics: the browser is a *live discovery*
surface and follows the default-listing rule, while the leaderboard is
a *historical* surface and deliberately does not — the two defaults
differ because they present different things.

What makes snapshot resolution work at all: a team identifier found in a
game's records resolves to exactly one persistent team record, the same
one for the game's whole lifetime
(global-invariants/authenticated-unambiguous-identity#instance-team-ids-resolve-uniquely)
— cited by the requirement, because without it every head-to-head record
and archived-opponent reference could dangle or drift. Complementing it
from the client side,
global-invariants/client-truthfulness#archived-teams-still-render already
requires views over archived entities to render from the persisted
snapshot and show archived status explicitly; `snapshot-attribution` is
not cited to it (it stands on its own, and states more) but the two are
the same discipline seen from the data and the render, and neither
capability should restate the other's half.

### Leaderboard: closed sets; "average score" is the normalised score

The criteria set (win rate with qualifying threshold, total wins,
average score) and time-window set are closed, per the author decision;
`#closed-sets-only` makes adding one a spec revision. The legacy
"average score" is authored as the *normalised* score: raw segment
counts are not comparable across board sizes and game configurations,
so a cross-game average is only meaningful in the normalised form — the
same form the train made the headline convention for every listing
(replay-and-audit/team-game-history). Alternative considered (raw
score, or leaving it unspecified): rejected — an unspecified average
invites each implementer to pick a different aggregate, and a raw
average rewards playing on big boards, not winning. The qualifying
threshold's *value* is deliberately unpinned: it is a tuning parameter,
not behaviour; only its existence is spec.

### UI mirrors folded; profile histories cite the listing conventions

The team profile's no-mutating-affordances rule folds into
`team-profile#strictly-informational` (enforcement lives with
team-management; the profile merely links onward to the management
surface). The profile game histories reuse, by citation, the two
conventions replay-and-audit/team-game-history already owns: the
historical-or-current membership rule (for the player profile's
eligibility) and the normalised-score presentation. Reversed — parallel
restatement — the eligibility rule would drift between the team history
page and the player profile, the legacy corpus's stitching problem
re-imported.

Why an absolute ("no mutating affordance") is safe to state as UI
shaping rather than as a security boundary: every mutation of platform
state is dispatched against the owning runtime's function contract and
meets identical invariants from any surface
(global-invariants/one-contract-many-surfaces), so a profile view that
grew a button would be refused by team-management's authority checks
anyway. The requirement is therefore about a coherent read-only surface,
not about containment — nothing here is load-bearing for security, and
implementers should not read it as the place authority is enforced.

### Home view and teams browser: discovery substance, peer semantics elsewhere

The home view names rooms and games-in-progress as prose; their
semantics (room membership, game status) belong to peer capabilities
this capability may not cite, and the home view needs none of them — it
is a hub of links. The teams browser shows team-record substance
(cited) and routes to profiles. Both are kept as requirements rather
than dropped to mechanism because each pins an upset-worthy behaviour:
your own live game is always one click from home, and every team is
discoverable-to-profile.

Why a link and not a summary: the platform runtime holds no mirror of a
live game's state
(global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game),
so a home view rendered from Convex can know *that* one of your teams is
playing and route you there, but the board itself is derived afresh from
the game's own instance on the surface that owns it. That is a
placement decision, not a further requirement.

## Constraint-mining (mandatory final step)

- **Judged: record uniqueness (query-then-guard lead).** The legacy
  design enforces one-record-per-person application-side via
  query-then-guard over non-unique indexes. The *invariant* is already
  behaviour: `user-record#created-at-first-sign-in` pins "every later
  sign-in resolves to that same record — never a second record", and
  identity-and-authorization/linked-provider-credentials#one-provider-account-one-person-forever
  pins the credential half. The *enforcement discipline* — the guard must
  run inside the same serializable mutation as the insert — is exactly
  global-invariants/transactional-invariant-enforcement, which the
  scenario now cites: the uniqueness it asserts is unachievable if that
  invariant is relaxed. Nothing new to mint; restating the guard here
  would double-own it.
- **Minted: query-boundary email omission.** The legacy design's
  "project email away at the query boundary" was design prose an
  implementer could silently violate (return it, hide it in the UI).
  Now `email-confidentiality#omitted-at-the-boundary`.
- **Minted: email-free participation snapshots.** The legacy design's
  note that roster snapshots store no email — load-bearing because
  snapshots are append-only, so a stored email is a permanent leak —
  was design prose. Now
  `email-confidentiality#participation-snapshots-are-email-free`.
- **Checked, already requirements**: never-delete/never-merge
  (`user-record-permanence`); statistics/listing consistency
  (`aggregate-statistics#consistent-with-the-listing` — the invariant
  that makes "computed from the same data" checkable); archive
  stability of every presented datum (`snapshot-attribution`,
  `leaderboard#archived-teams-still-ranked`).
- **Checked, plastic**: where aggregates are computed and whether they
  are cached or derived per view, the shape of the recently-visited-rooms
  memory, index layouts, and the qualifying-threshold value — mechanism,
  to carry `// design:` references to this change when the code lands.
