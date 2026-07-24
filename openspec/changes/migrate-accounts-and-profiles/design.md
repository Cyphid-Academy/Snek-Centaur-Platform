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

Legacy module 05 restated module 03's identity semantics (email
canonical, fork on change) while adding the record substance. The mint
keeps only the record: creation at first sign-in, the captured fields,
canonical-email immutability on the record, permanence. Fork semantics
are cited (identity-and-authorization/email-as-canonical-identity), and
`#record-follows-the-fork` states only the *record-side* consequence —
the original record keeps its state, the new identity gets a fresh one.
Reversed — fork semantics restated here — two capabilities would own
"who is the same human", and the first revision to one would silently
contradict the other. The `user-record-permanence` requirement is kept
separate from `user-record` because it is the archive-grade invariant
everything downstream leans on: attribution, profiles, and statistics
survive account loss and email forks only because no record is ever
deleted or merged. Reversed — a "cleanup" of dormant or forked-away
records — every replay and history referencing them dangles, which the
append-only record model forbids.

### Email confidentiality is a data-contract rule, not a UI rule (resolved review: profile visibility)

The resolved email-visibility review chose the strictest option: emails
never appear in any user-facing query, the user's own self-view
included — the email is the sign-in provider's datum, and the platform
has no authoritative reason to display it back. The mint authors this
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

### Home view and teams browser: discovery substance, peer semantics elsewhere

The home view names rooms and games-in-progress as prose; their
semantics (room membership, game status) belong to peer capabilities
this capability may not cite, and the home view needs none of them — it
is a hub of links. The teams browser shows team-record substance
(cited) and routes to profiles. Both are kept as requirements rather
than dropped to mechanism because each pins an upset-worthy behaviour:
your own live game is always one click from home, and every team is
discoverable-to-profile.

## Constraint-mining (mandatory final step)

- **Judged: email uniqueness (query-then-guard lead).** The legacy
  design enforces one-record-per-email application-side via
  query-then-guard over non-unique indexes. The *invariant* is already
  behaviour: `user-record#created-at-first-sign-in` pins "every later
  sign-in resolves to that same record — never a second record", and
  identity-and-authorization/email-as-canonical-identity#same-email-merges
  pins the identity half. The *enforcement discipline* — the guard must
  run inside the same serializable mutation as the insert — is exactly
  the open global-invariants transactional-invariant-enforcement rule,
  which binds implementers without being a citable dependency. Nothing
  new to mint; restating the guard here would double-own it.
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
