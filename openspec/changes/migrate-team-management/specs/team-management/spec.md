## Purpose

The captain runs the team. This capability owns the Centaur Team as a
managed unit: founding a team, the persistent team record and its identity,
the roster of operator members, structural captaincy and its transfer,
coach designation, archiving in place of deletion, and the roster freeze
while the team is competing. What the team does in competition — operating
snakes in games, running its nominated server, configuring its bots —
belongs to the capabilities that own those workflows; the team record
managed here carries the anchors those workflows consume, the server
nomination among them.

Depends on: identity-and-authorization, global-invariants.

## ADDED Requirements

### Requirement: team-management/team-record
Depends on: global-invariants/single-convex-deployment.

The platform SHALL maintain a persistent record of every Centaur Team, capturing at minimum the team's name, its display colour, and its current captain — the one platform-wide anchor through which any runtime resolves a team, and *the* record only for as long as platform-persistent state has a single home. Captaincy SHALL be structural — a single reference on the team record identifying exactly one current captain — never a role attribute recorded per member. The team record also anchors the team's server nomination; the nomination's semantics are owned elsewhere.

#### Scenario: #exactly-one-captain
- **WHEN** a team record is read at any moment of the team's life — just created, mid-transfer, archived
- **THEN** it identifies exactly one current captain; the structural representation admits no captainless team and no co-captains

#### Scenario: #captaincy-not-a-member-role
- **WHEN** captaincy changes hands
- **THEN** only the team record's captain reference changes — no membership record is rewritten, because no membership record carries captaincy or any other role

### Requirement: team-management/team-creation
Depends on: global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction.

Any authenticated user SHALL be able to create a new Centaur Team. On creation the creating user SHALL become the team's captain and its first roster member, with no intermediate state in which the team exists captainless or memberless — a single-commit creation of the team record together with its first membership record, which is reachable only while every persistent record shares one deployment.

#### Scenario: #creator-captains-from-the-first-instant
- **WHEN** a user creates a team
- **THEN** they are its captain and its sole roster member from the moment the team exists, holding every captain authority immediately

#### Scenario: #no-special-standing-required
- **WHEN** any authenticated user — with or without existing team memberships or any platform role — requests team creation
- **THEN** the team is created; no membership, tenure, standing, or platform role is a precondition

### Requirement: team-management/roster-of-operators
Depends on: team-management/team-record, global-invariants/transactional-invariant-enforcement.

The platform SHALL maintain persistent membership records associating each human member with their Centaur Team. Every member is an operator; membership SHALL carry no role distinctions of any kind. The captain SHALL themselves be a current member at all times.

#### Scenario: #members-are-peers
- **WHEN** any two members of a team are compared
- **THEN** membership grants them identical standing — any team-level authority a member holds beyond operating flows from structural captaincy, never from anything recorded on membership

#### Scenario: #captain-cannot-leave-uncrowned
- **WHEN** removal of the current captain from the roster is attempted without a preceding captaincy transfer
- **THEN** the removal is rejected — the captain is always a member

#### Scenario: #membership-is-a-set
- **WHEN** a member addition names a human who is already on the roster — including two racing additions of the same human
- **THEN** the roster afterwards contains that human exactly once; no duplicate membership ever exists — the racing case is decidable only inside the write's own transaction

### Requirement: team-management/captain-authority
Depends on: identity-and-authorization/mutation-authorization, global-invariants/one-contract-many-surfaces.

Only a team's current captain SHALL be able to mutate the team: its identity (name and display colour), its membership (adding and removing members), its coach designations, its server nomination, and — by transfer to another current member — the captaincy itself. The captain gate is this capability's authorization rule, and it reads as "only the captain" — rather than "only the captain, on the surfaces that choose to ask" — solely because every surface meets one contract.

#### Scenario: #non-captain-rejected-at-the-function
- **WHEN** a member who is not the captain invokes a team mutation directly, bypassing every interface affordance
- **THEN** the mutation is rejected — membership grants no authority to mutate the team

#### Scenario: #captain-only-affordances
- **WHEN** a non-captain member views the team's management surface
- **THEN** the mutating affordances are not offered to them

#### Scenario: #transfer-only-to-a-member
- **WHEN** a captaincy transfer names a target who is not a current member — an outsider, or a coach who is not also a member
- **THEN** the transfer is rejected

#### Scenario: #transfer-is-immediate-and-complete
- **WHEN** a captaincy transfer completes
- **THEN** the new captain holds every captain authority at once, and the former captain remains an ordinary member holding none

### Requirement: team-management/coaches
Coach designations SHALL be stored on the team record, distinct from the member roster: designating a coach makes them neither a member nor an operator, and coaching grants no captain authority. The current set of coaches SHALL be observable to every team member.

#### Scenario: #coach-gains-no-roster-standing
- **WHEN** a human is designated a coach of a team
- **THEN** the member roster is unchanged — the coach gains no membership, no operator standing, and no team mutation rights

#### Scenario: #coaches-visible-to-members
- **WHEN** any current member inspects their team
- **THEN** the full current set of designated coaches is visible to them

### Requirement: team-management/roster-freeze
Depends on: identity-and-authorization/roster-snapshot-binding, global-invariants/transactional-invariant-enforcement.

A Centaur Team's roster SHALL be frozen at minimum whenever any game the team is participating in is currently being played; the frozen interval may be held longer by enclosing competitive engagements, never shorter. While frozen, the platform SHALL reject every mutation to the team's competitive composition — member additions, member removals, captaincy transfer, and changes to the team's server nomination. A running game's authorization is already bound by its initialization-time snapshot; the freeze keeps the live team record coherent with the game being played.

#### Scenario: #hard-rejection-never-deferral
- **WHEN** a frozen mutation is attempted
- **THEN** it is rejected with an error naming the freeze — never queued, deferred, or silently applied once the freeze lifts

#### Scenario: #check-and-write-atomic
- **WHEN** a roster mutation races the freeze taking effect
- **THEN** the mutation either completes entirely before the team is frozen or is rejected — no roster change ever lands on a frozen team; the freeze is a guarded invariant, evaluated inside the mutation's own transaction

#### Scenario: #frozen-affordances-visibly-disabled
- **WHEN** a member views the team's management surface while the roster is frozen
- **THEN** the affordances the freeze rejects are visibly disabled, with an explanation that a game in progress makes them temporarily unavailable — the interface mirrors the rejection

#### Scenario: #identity-edits-stay-open
- **WHEN** the captain edits the team's name or display colour while the roster is frozen
- **THEN** the edit is permitted — the freeze covers competitive composition, not display identity

### Requirement: team-management/archive-not-delete
Depends on: team-management/roster-freeze, global-invariants/single-convex-deployment, identity-and-authorization/platform-admin-role.

A Centaur Team SHALL never be deleted; no deletion operation exists. The captain MAY instead archive the team — only while its roster is not frozen — after which the team is hidden from default listings and cannot be enrolled in new games, while all live and historical state is preserved: membership records, team-scoped state, historical game records, and attribution. Historical records that reference an archived team SHALL continue to resolve the team's historical identity — one guarantee rather than a per-store cleanup contract only because that state shares a single persistent home. The captain MAY unarchive the team to resume activity, and a platform admin MAY do likewise — an expressly granted administrative power.

#### Scenario: #archive-is-the-only-retirement
- **WHEN** any actor seeks to remove a team from the platform
- **THEN** no deletion path exists for them to take; archiving is the only retirement, and it removes nothing

#### Scenario: #history-resolves-after-archive
- **WHEN** a historical game record referencing an archived team is viewed
- **THEN** the team's historical identity and every attribution resolve exactly as they did before the archiving

#### Scenario: #admin-unarchive-recovers-abandoned-teams
- **WHEN** a team sits archived and its captain is no longer active on the platform
- **THEN** a platform admin may unarchive it without any captain action — the expressly granted recovery path for otherwise-stranded teams

#### Scenario: #archive-blocked-while-frozen
- **WHEN** the captain attempts to archive the team while its roster is frozen
- **THEN** the archiving is rejected for as long as the freeze holds

#### Scenario: #unarchive-resumes-intact
- **WHEN** the captain unarchives the team
- **THEN** the team resumes activity with its roster, captaincy, and coach designations exactly as they were at archiving — nothing was reset

### Requirement: team-management/team-management-view
Depends on: global-invariants/access-follows-identity.

The application SHALL provide a Team Management view accessible to every current member of a Centaur Team — on whichever Snek Centaur Server deployment they open it — displaying at minimum the team's name, display colour, current captain, member roster, designated coaches, and the team's server nomination with its latest recorded health status. The view SHALL be limited to team identity, membership, coaching, and server nomination: it SHALL NOT expose team-internal competitive configuration — bot parameters, heuristic settings, or any other configuration of how the team plays — which is owned elsewhere.

#### Scenario: #every-member-sees-the-whole-picture
- **WHEN** any current member — not only the captain — opens the view
- **THEN** they see the full display, coaches and nomination health included, whether or not any mutating affordance is offered to them

#### Scenario: #management-is-not-play-configuration
- **WHEN** the view's affordances are examined
- **THEN** none configures the team's play — no bot, heuristic, or in-game affordance appears; managing the team and configuring its competition are separate surfaces
