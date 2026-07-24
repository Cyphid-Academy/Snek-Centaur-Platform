## Purpose

Who a person is on the platform as a persisted account, and how the
platform presents people, teams, and competitive standing to its signed-in
users: the permanent user record behind each human identity, the
confidentiality contract that keeps email addresses out of every
user-facing surface, player and team profiles with their game histories
and aggregate statistics, the team leaderboard, and the discovery views —
home and teams browser — that link them together. Identity itself (who
counts as the same human) belongs to identity-and-authorization; running a
team to team-management; the finished-game records these views present to
replay-and-audit. This capability owns the account record and the
authenticated presentation layer over competitive history.

Depends on: identity-and-authorization, team-management, replay-and-audit.

## ADDED Requirements

### Requirement: accounts-and-profiles/user-record
The platform SHALL maintain a persistent user record for every human identity that has successfully signed in, created at the moment of the identity's first successful sign-in and capturing at minimum the identity's canonical email address (identity-and-authorization/email-as-canonical-identity), a display name, and the timestamp of that first authentication. A record's canonical email SHALL never change: the record follows its identity for life, and a provider-side email change is a new identity with its own fresh record per identity-and-authorization/email-as-canonical-identity#email-fork-keeps-history.

#### Scenario: #created-at-first-sign-in
- **WHEN** a human completes their first successful sign-in
- **THEN** their user record exists from that moment, and every later sign-in under the same canonical email resolves to that same record — never a second record for the same identity

#### Scenario: #record-follows-the-fork
- **WHEN** a provider-side email change forks the identity
- **THEN** the original record stays intact under its original canonical email with all of its state, and the new identity receives a fresh record — no existing record is ever rewritten to a new email

### Requirement: accounts-and-profiles/user-record-permanence
A user record SHALL never be deleted — including when the human loses access to the underlying Google account — and two user records SHALL never be merged, whatever provider-side history relates them. Historical attribution remains anchored to the record that earned it, forever.

#### Scenario: #lost-account-deletes-nothing
- **WHEN** a human permanently loses access to the Google account behind their identity
- **THEN** the user record and everything attributed to it persist unchanged; no cleanup, expiry, or deletion path removes it

#### Scenario: #never-merged
- **WHEN** two user records exist with distinct canonical emails — even ones known to belong to the same human across an email fork
- **THEN** they remain distinct records; history stays on the record that earned it, and no operation folds one record's memberships, attributions, or statistics into the other

### Requirement: accounts-and-profiles/email-confidentiality
A user's canonical email address SHALL be stored solely for identity matching (identity-and-authorization/email-as-canonical-identity) and administrative operations, and SHALL never be exposed on any user-facing surface — no query, view, or exported record shape serving user-facing consumers may include any user's email, whether on profiles (the user's own included), member listings, game-history attribution, leaderboards, or anywhere else. Record shapes serving user-facing consumers SHALL omit the email at the data-contract boundary itself, and per-game participation snapshots SHALL store no email at all: display names resolve through email-free paths.

#### Scenario: #hidden-even-from-self-view
- **WHEN** a user views their own profile or any other surface presenting their own account
- **THEN** their email address does not appear — the email is owned by the sign-in provider, and any change to it is made there, so the platform has no reason to display it back even to its owner

#### Scenario: #omitted-at-the-boundary
- **WHEN** the record shape returned by any user-facing query or subscription is examined
- **THEN** the email field is absent from the shape itself — never returned and then hidden by presentation, so no new view built on the same shape can leak it

#### Scenario: #participation-snapshots-are-email-free
- **WHEN** a game's participating-team snapshot, or any other historical attribution record, is examined
- **THEN** it holds no email address; consumers needing a human-readable name resolve the referenced user record through the email-free path

### Requirement: accounts-and-profiles/no-public-surface
Every surface this capability defines — player and team profiles, game histories, aggregate statistics, the leaderboard, the home view, and the teams browser — SHALL be offered exclusively to authenticated users, per identity-and-authorization/authentication-required. The platform has no public or unauthenticated profile, statistics, or leaderboard surface; among authenticated users these surfaces impose no further access gate — visibility scoping is discovery, never a second gate.

#### Scenario: #unauthenticated-visitors-see-nothing
- **WHEN** an unauthenticated visitor requests any profile, history, statistic, leaderboard, or discovery view
- **THEN** the request is refused; none of this capability's data is reachable, indexable, or enumerable without sign-in

#### Scenario: #authenticated-users-face-no-further-gate
- **WHEN** any authenticated user navigates to any player profile, any team profile, or the leaderboard
- **THEN** the surface opens for them — membership in a team, a role, or any other standing is never required to view it

### Requirement: accounts-and-profiles/home-view
The application SHALL present, as an authenticated user's home view, at minimum: the Centaur Teams the user is currently a member of, the rooms the user has recently visited, and the games currently being played in which any of the user's teams participate. Each listed item SHALL link directly to its corresponding detailed view.

#### Scenario: #live-participation-surfaces
- **WHEN** a team the user belongs to is participating in a game currently being played
- **THEN** that game appears on the user's home view, linked to its live surface — the user never has to hunt for their own team's game in progress

#### Scenario: #home-links-onward
- **WHEN** the user selects any listed team, room, or game on the home view
- **THEN** they land directly on that item's detailed view — the home view is a hub of links, not a dead-end summary

### Requirement: accounts-and-profiles/teams-browser
The application SHALL provide a teams browser listing the platform's Centaur Teams, showing for each at minimum the team's name, display colour, and current captain (team-management/team-record), with every entry linking to that team's profile. The default listing SHALL follow team-management/archive-not-delete: archived teams are hidden from it by default, while their profiles remain reachable.

#### Scenario: #entry-opens-the-profile
- **WHEN** a user selects any team in the browser
- **THEN** that team's profile view opens — the browser is the discovery path onto team profiles

#### Scenario: #archived-hidden-not-gone
- **WHEN** a team is archived
- **THEN** it leaves the default browser listing, yet its profile — and every history that references it — remains reachable; hiding from discovery removes nothing

### Requirement: accounts-and-profiles/player-profile
The application SHALL provide a Player Profile view for every user record: the user reaches their own profile through the application's global navigation, and profiles of other users are reachable to any authenticated user, linked at minimum from team member listings and game histories. The profile SHALL display at minimum the user's display name, their current and historical Centaur Team memberships, and a chronological game history — each game's room, date, participating teams, result, and final scores — listing every game in which the user was a member of a participating team at the time of the game (per its participating-team snapshot) or is a current member of such a team: the same historical-or-current rule that scopes a team's own history listing (replay-and-audit/team-game-history). The profile never displays an email address (accounts-and-profiles/email-confidentiality).

#### Scenario: #every-user-has-one
- **WHEN** any user record exists — freshly created, long inactive, or belonging to a forked-away identity
- **THEN** a Player Profile view exists for it, reachable to any authenticated user

#### Scenario: #history-outlives-membership
- **WHEN** a user has left a team they once played for
- **THEN** the games in whose participating-team snapshots they appear remain listed on their profile — playing history follows the player, not their current roster status

### Requirement: accounts-and-profiles/team-profile
The application SHALL provide a Team Profile view for every Centaur Team — archived teams included — visible to every authenticated user, displaying at minimum the team's name, display colour, current captain, current member roster, its server nomination with the latest recorded health status (team-management/team-record), and a chronological game history of every game the team has participated in, with each game's room, date, opposing teams, result, and final scores. The full history SHALL be visible to any authenticated viewer, consistent with the open readability of finished games (replay-and-audit/finished-games-public). The view SHALL expose no mutating affordance over team state: mutation belongs solely to the management surface (team-management/team-management-view).

#### Scenario: #full-history-for-any-viewer
- **WHEN** an authenticated user with no relationship to a team opens its profile
- **THEN** they see the team's complete game history — profile visibility is platform-wide among authenticated users, matching the openness of finished games

#### Scenario: #strictly-informational
- **WHEN** any viewer — a member, the captain, anyone — examines the Team Profile's affordances
- **THEN** none mutates team state; at most the profile links onward to the management surface, where authority is enforced

#### Scenario: #archived-teams-keep-their-profile
- **WHEN** an archived team's profile is opened
- **THEN** it renders in full — identity, roster, history, statistics — under the team's archived identity

### Requirement: accounts-and-profiles/aggregate-statistics
Profile views SHALL display aggregate statistics computed from exactly the data that populates the accompanying game-history listing, and therefore consistent with it: for a player, at minimum games played, win rate, and average team score; for a team, at minimum games played, win rate, average score, and a head-to-head record against every team it has ever played. Score aggregates SHALL use the normalised score — the cross-game comparable form that history listings present as their headline (replay-and-audit/team-game-history).

#### Scenario: #consistent-with-the-listing
- **WHEN** a profile's aggregate statistics and its game-history listing are compared
- **THEN** they agree — every game in the listing is counted in the statistics and nothing else is, so the two can never tell different stories

#### Scenario: #head-to-head-covers-every-opponent
- **WHEN** a team's profile statistics are viewed
- **THEN** a head-to-head record appears for each distinct team it has ever played, with no opponent omitted

### Requirement: accounts-and-profiles/snapshot-attribution
Everywhere this capability presents historical participation — profile game histories, aggregate statistics, head-to-head records, and leaderboard rankings — attribution SHALL resolve through the game's participating-team snapshots, never through current team or membership records; and archiving a team SHALL never change any presented history, statistic, or ranking input (team-management/archive-not-delete).

#### Scenario: #team-of-the-day
- **WHEN** a user's profile lists a game played before the user changed teams
- **THEN** the game shows the team the user was playing for at the time, resolved from the snapshot — never retroactively re-attributed to their current team

#### Scenario: #head-to-head-archive-stable
- **WHEN** a team a profile's head-to-head record references has since been archived
- **THEN** the record is unchanged — the opponent appears under its historical identity, with the same games and outcomes as before the archiving

#### Scenario: #roster-changes-rewrite-nothing
- **WHEN** a team's current roster or captaincy differs from what it was when a historical game was played
- **THEN** that game's presented participants are still those of its snapshot; no current-state read leaks into historical presentation

### Requirement: accounts-and-profiles/leaderboard
The application SHALL provide a global leaderboard ranking Centaur Teams by exactly one criterion at a time from a closed set — at minimum win rate (subject to a minimum-games qualifying threshold), total wins, and average normalised score — switchable by the viewer, filtered by a time window from a closed set including at minimum all time, the last 30 days, and the last 7 days, and optionally restricted to games played within a single room. Each ranked entry SHALL link to that team's profile. Archived teams SHALL remain in the default leaderboard view under their archived identity: archiving is a live-state action, never a rewrite of competitive history.

#### Scenario: #closed-sets-only
- **WHEN** the leaderboard's ranking criteria and time windows are enumerated
- **THEN** both are closed sets — ranking a new criterion or window means revising this requirement, never an open-ended ranking surface drifting in

#### Scenario: #room-scoped-ranking
- **WHEN** a room restriction is applied
- **THEN** the ranking considers only games played within that room — every criterion and time window recomputed over that subset alone

#### Scenario: #archived-teams-still-ranked
- **WHEN** a team with ranked games is archived
- **THEN** the default leaderboard still ranks it, under its archived identity, with nothing recomputed — no team's standing shifts because a rival archived
