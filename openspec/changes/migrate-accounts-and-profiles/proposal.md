## Why

Final capability change of the spec-migration train. The "who is this
person, how is this team doing" story — the permanent user record behind
each Google identity, player and team profiles, game histories with
aggregate statistics, the leaderboard, and the home/browser discovery
views — has no vocabulary owner today: its substance is split between
module 05 (the user record and its permanence) and module 08 (every
profile, statistics, and leaderboard surface, plus the email-hygiene
rule the platform's query layer must honour). Re-authoring it as one
capability puts the account-and-presentation workflow in one readable
place and retires 21 legacy ids and 2 review items.

## Carving decision

Mint **`accounts-and-profiles`** exactly as drawn in the author-approved
capability map and assignment matrix. The legacy requirements and review
items this change absorbs are recorded in the identifier map under this
change's name. Declared dependencies: **game-engine, game-lifecycle,
global-invariants, identity-and-authorization, replay-and-audit,
rooms-and-matchmaking, team-management** — all seven genuinely cited. The
declaration is an affordance, extended whenever a citation is warranted,
not a fixed allowance: `game-lifecycle` (the per-game roster snapshot,
the recorded outcome and final scores every history and statistic reads),
`rooms-and-matchmaking` (the room record a listing labels a game with and
the room-scoped ranking filters on) and `game-engine` (the scoring rule
that makes scores comparable within a game and that decides a forfeit)
were added when it became clear the historical layer's soundness rested
on records it could not name. The graph stays acyclic — this capability
is a leaf nothing depends on.

Deliberate boundaries, per the author-resolved decisions:

- **Identity semantics are cited, never restated.** Who counts as the
  same human — which provider account is linked to whom, and what
  happens when one is retired — is identity-and-authorization's. This
  capability owns the *record*: created at first sign-in, its identifier
  immutable, its attributes editable, never deleted, never merged.
- **Authenticated-only, no public surface.** Profiles, histories,
  statistics, and leaderboards are offered exclusively to authenticated
  users (the resolved profile-visibility review); "public" in this
  capability always means "any authenticated user", never "the
  internet". Authored once as `no-public-surface` rather than repeated
  per view.
- **Historical attribution via participating-team snapshots,
  archive-stable.** Profile histories, statistics, head-to-head records,
  and leaderboard rankings all resolve through the game's snapshots,
  never current records; archiving never rewrites history — archived
  teams stay in the default leaderboard (the resolved
  archived-teams-in-leaderboards review).
- **Leaderboard criteria and windows are closed sets** with time-window
  and room-scoped filters, per the author decision.
- **UI mirrors fold as scenarios.** The no-mutating-affordances rule of
  the team profile is the `#strictly-informational` scenario, not a
  parallel requirement; authenticated-only statements fold into
  `no-public-surface`.
- **What this capability does not own**: team mutation (team-management,
  which the team profile links onward to), finished-game readability and
  the replay viewer (replay-and-audit — profiles list and link, they do
  not gate), the per-hosted-team game-history page
  (replay-and-audit/team-game-history; the profile histories cite its
  eligibility rule and score convention), and room/live-game semantics
  the home view merely links to.

## What Changes

- **New capability `accounts-and-profiles`** (mint delta, ADDED-only, 12
  requirements): the persistent user record and its permanence
  (never-delete/never-merge), the email-confidentiality contract over
  every user-facing surface (query-boundary omission, email-free
  snapshots, hidden even from self-view), the authenticated-only surface
  rule, the home view, the teams browser, player and team profiles,
  aggregate statistics consistent with their listings, the recorded-outcome
  rule that fixes which games those listings and statistics are drawn
  from, snapshot-resolved archive-stable attribution, and the
  closed-criteria leaderboard.
- **Constraint-mining promotions**: the legacy design's query-boundary
  email projection and email-free roster snapshots become scenarios of
  `email-confidentiality` (they were silently violable design prose);
  email *uniqueness* enforcement is judged already covered (see
  design.md) and is not re-minted — `user-record` instead cites
  global-invariants/transactional-invariant-enforcement, the invariant
  its one-record-per-identity guarantee rests on.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-accounts-and-profiles/specs/accounts-and-profiles/spec.md`
  (folded to `openspec/specs/accounts-and-profiles/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `accounts-and-profiles` (at archive).
- Code citations: the user-record creation path, the user-facing query
  shapes, and the profile/leaderboard views gain
  `// spec: accounts-and-profiles/...` citations when the
  implementation lands.

## Open Questions

None. The candidate ambiguities were all resolvable from settled
sources and are recorded as decisions in design.md: leaderboard
"average score" reads as the normalised score (the only cross-game
comparable form, and the train-wide headline convention); the teams
browser's "all teams" yields to the later, author-approved
default-listing hiding of archived teams; and the email-confidentiality
requirement is scoped to the user-facing surface, leaving the
administrative/identity machinery outside it rather than contradicting
the legacy admin carve-out.

Five questions raised in review are now resolved, each recorded in
`design.md`:

- **Decision — the historical layer's sources are declared.** Every
  history, statistic, head-to-head and ranking here reads records owned
  by `game-lifecycle` (roster snapshot, recorded outcome, final scores)
  and `rooms-and-matchmaking` (the room record, which
  `leaderboard#room-scoped-ranking` is a predicate over). Both join the
  Purpose declaration, along with `game-engine`, and the requirements
  whose soundness rests on them carry the entries.
- **Decision — historical team memberships are derivable from game
  records.** `player-profile` asked for current *and historical*
  memberships; no membership-history record exists anywhere in the
  corpus. It is reworded to the derivable definition — past teams are
  the teams the user's game history attributes to them — with the
  accepted limitation stated as behaviour
  (`player-profile#past-teams-are-teams-played-for`): a membership that
  produced no game leaves no trace.
- **Decision — forfeited games are ranked, at the engine's score.**
  `leaderboard` counts a forfeited game towards every criterion at the
  value the platform's scoring rule assigns a forfeiting team, citing
  that rule rather than restating the zero
  (`leaderboard#forfeits-rank-rather-than-vanish`). The rule stands on
  its own and depends on no other capability surfacing forfeits
  downstream.
- **Decision — games with no recorded outcome are presented nowhere.**
  A game finished by failure records no scores and broke
  `aggregate-statistics#consistent-with-the-listing` under either
  reading. New requirement `recorded-outcomes-only` fixes the presented
  set once for the whole historical layer, excluding such games from
  listing and statistics identically; a game *decided without play* is
  not excluded.
- **Decision — head-to-head is pairwise in multi-team games.** A game
  with more than two competing teams contributes one entry against each
  other participant, settled on the two teams' own final scores and
  independent of who won overall.
