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
change's name. Declared dependencies: **identity-and-authorization,
team-management, replay-and-audit** (the full DAG ceiling for this
capability; all three are genuinely cited).

Deliberate boundaries, per the author-resolved decisions:

- **Identity semantics are cited, never restated.** Who counts as the
  same human — email as canonical identity, the same-email merge, the
  email-change fork — is identity-and-authorization's. This capability
  owns the *record*: created at first sign-in, canonical email
  immutable on it, never deleted, never merged, history staying on the
  original record across a fork.
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

- **New capability `accounts-and-profiles`** (mint delta, ADDED-only, 11
  requirements): the persistent user record and its permanence
  (never-delete/never-merge), the email-confidentiality contract over
  every user-facing surface (query-boundary omission, email-free
  snapshots, hidden even from self-view), the authenticated-only surface
  rule, the home view, the teams browser, player and team profiles,
  aggregate statistics consistent with their listings, snapshot-resolved
  archive-stable attribution, and the closed-criteria leaderboard.
- **Constraint-mining promotions**: the legacy design's query-boundary
  email projection and email-free roster snapshots become scenarios of
  `email-confidentiality` (they were silently violable design prose);
  email *uniqueness* enforcement is judged already covered (see
  design.md) and is not re-minted.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

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
