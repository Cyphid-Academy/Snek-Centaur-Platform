## Purpose

A team acquires and runs its Snek Centaur Server. This capability owns that
workflow end to end: the captain's naming of a home server domain, the
team↔server hosting relationship and the two-sided consent that establishes
it, the server's own key publication and its whitelist of teams it will
operate, its administration API and the administrative issuers that reach
it, the game-start invitation that wakes it, the healthcheck contract and
availability reporting, the one unified web
application every server serves, and the forkable reference application a
team owns outright. What hosting means for a game's launch, and what the
hosted bots then do in play, belong to the capabilities that own those
workflows.

The trust model is deliberate and asymmetric. A server operates a team only
where two independent facts hold — the team's captain named its domain, and
the server, proving control of that domain, asked to operate the team — and
neither fact alone confers anything. Beyond that the platform neither vets
nor certifies a server. Every server serves the same open-source client
application and a visitor's data access follows their own identity rather
than the server they visit; nevertheless a malicious server operator can
serve modified client code that exfiltrates whatever data its visitors can
legitimately read. The platform accepts this trade-off: it attempts no
detection or prevention, and users are expected to visit only servers they
trust, exactly as with any web application. What bounds the trade-off is
that security is enforced outside the library: because no security-relevant
invariant is ever enforced by server-controlled code, a hostile server can
betray only what its own visitors could already read, never widen anyone's
read or write authority.

Depends on: identity-and-authorization, team-management, global-invariants.

## ADDED Requirements

### Requirement: team-server-management/server-nomination
Depends on: team-management/team-record, team-management/captain-authority, team-management/roster-freeze.

A Centaur Team's captain SHALL name the team's home Snek Centaur Server by recording a server domain on the team record, and MAY change or clear it at any time — captain-only, and frozen while the team is playing. The platform SHALL record the naming as a homing record and SHALL, over an authenticated transport, read the domain's published verification material to confirm it exists and parses. That the domain controls its own key and that the captain associated the domain with the team are two separate facts and SHALL be recorded separately.

#### Scenario: #naming-is-the-captains-act-alone
- **WHEN** a captain sets or changes the team's home server domain
- **THEN** it completes without any acceptance, handshake, or acknowledgement from the server, and no secret is stored, sent, or received as part of it

#### Scenario: #naming-a-domain-you-do-not-control-is-harmless
- **WHEN** a captain names a domain belonging to someone else, or one that is unreachable, misconfigured, or running no server at all
- **THEN** the homing record exists and confers nothing: no credential can be produced for the team without the private key behind that domain's published material, so the worst outcome is a team that cannot yet play

#### Scenario: #clearing-is-allowed
- **WHEN** the captain clears the naming
- **THEN** the team record holds no home server, and the team cannot enter games until one is named again

### Requirement: team-server-management/nomination-required-to-play
A Centaur Team SHALL enter a game only while it has a home server domain: entry into games is barred while none is named. The platform supports no pure-human teams — playing without a Snek Centaur Server is not a configuration any flow may offer.

#### Scenario: #empty-nomination-bars-entry
- **WHEN** a team with no home server domain is put forward for a game
- **THEN** its entry is refused until one is named

#### Scenario: #no-pure-human-path
- **WHEN** a team seeks to compete with humans staging every move and no server hosting it
- **THEN** no such mode exists — the gate is structural, not a default that can be waived

### Requirement: team-server-management/two-sided-consent
Depends on: identity-and-authorization/game-credential-scope, global-invariants/ephemeral-game-credentials.

A Snek Centaur Server SHALL be able to act for a Centaur Team only where both of two independent facts hold: the team's captain has named that server's domain as the team's home, and the server, proving control of that domain, has asked the platform for that team's credential. Neither fact alone SHALL confer anything.

#### Scenario: #naming-without-asking-confers-nothing
- **WHEN** a team's captain names a domain whose server never asks to operate the team
- **THEN** the team cannot play from it: nothing is issued, no bot computation runs for the team, and the homing record alone changes nothing about what any party may do

#### Scenario: #asking-without-being-named-confers-nothing
- **WHEN** a server proves control of its domain and requests a credential for a team that has not named it
- **THEN** the request is refused; proving who you are establishes eligibility, never authority over a team that did not choose you

#### Scenario: #re-homing-cuts-the-old-server-off
- **WHEN** a captain re-homes their team to a different domain
- **THEN** the previous server's next request for that team is refused, and any credential it holds lapses within its own short lifetime — nothing it kept at rest outlives the captain's decision

### Requirement: team-server-management/server-key-publication
Depends on: global-invariants/no-shared-secrets, global-invariants/credential-confinement#every-party-keeps-its-own-key.

A Snek Centaur Server SHALL, on first start and without any operator action, generate a signing keypair if it has none persisted, persist it, and publish the public half at a stable well-known address on its own domain. It SHALL be able to publish several keys at once, so that rotation is publish-both, switch, drop-the-old, with no exchange with the platform. Generating, persisting, and publishing the key SHALL be invisible in the operator experience — captains are coaches and students, not platform engineers — and if it cannot be made invisible, the platform SHALL instead authenticate servers by a challenge it initiates, because onboarding friction is not worth trading for protocol elegance in an educational product.

#### Scenario: #first-boot-needs-no-operator
- **WHEN** someone deploys a Snek Centaur Server for the first time
- **THEN** it is ready to be named as a team's home with no key to generate, copy, paste, or register — the deployment itself is the whole setup

#### Scenario: #ephemeral-storage-self-heals
- **WHEN** a server is redeployed onto storage that did not preserve its key
- **THEN** it generates and publishes a new one and resumes operating its teams; nothing on the platform was pinned to the old key, so nothing needs re-registering

#### Scenario: #rotation-is-uncoordinated
- **WHEN** a server rotates its signing key
- **THEN** it publishes the new key alongside the old, switches, and later drops the old one — the platform is neither told nor asked, and no team's operation is interrupted

### Requirement: team-server-management/whitelist-admission
A Snek Centaur Server SHALL decide independently which teams it operates, by whatever policy it holds; that decision is what its answers to game invitations express. The platform SHALL hold no representation of the decision and SHALL offer no approval step. The reference implementation SHALL make it from a whitelist of admitted teams. Whitelisting and being named SHALL be independent and order-independent: a team may name a server before or after that server whitelists it, and neither order is an error. A Cyphid-operated Reference Centaur Server SHALL NOT admit teams automatically.

#### Scenario: #either-order-works
- **WHEN** a server admits a team that has not yet named it, or a team names a server that has not yet admitted it
- **THEN** neither is an error and neither is lost: operation begins when the second fact arrives, with no retry, re-registration, or re-naming needed

#### Scenario: #unwhitelisted-team-simply-waits
- **WHEN** a team's captain has named a server that has not admitted it
- **THEN** the team cannot yet play — the server declines its invitations and runs no bot computation for it — and the team's own state is untouched and unlost

#### Scenario: #the-reference-server-does-not-auto-admit
- **WHEN** a team names a Cyphid-operated Reference Centaur Server as its home without any administrative act admitting it
- **THEN** it is not operated: explicit admission bounds the nuisance load from teams naming it opportunistically

### Requirement: team-server-management/homing-inbox
The platform SHALL expose a query, scoped to the authenticated server's own domain, returning the teams that have named that domain as their home. The query SHALL be informational and SHALL confer nothing: a server learns which teams are waiting for it and remains free to whitelist none of them.

#### Scenario: #inbox-shows-only-your-own
- **WHEN** an authenticated server queries its inbox
- **THEN** it sees the teams that named its own domain and no others — the query is scoped by the domain that authenticated, never by a parameter the caller supplies

#### Scenario: #reading-the-inbox-admits-nobody
- **WHEN** a server reads its inbox
- **THEN** no team becomes operated by it and no state on the platform changes; admission remains the server's separate act

### Requirement: team-server-management/server-administration-api
Depends on: global-invariants/issuer-anchored-trust, global-invariants/no-shared-secrets.

The reference implementation SHALL expose an administration API through which an external system admits a team to its whitelist and removes one, and SHALL maintain, as configuration local to the deployment, a set of administrative issuers it trusts, each recorded with the ceiling of capabilities it may confer. It SHALL accept an administrative request bearing a credential from one of those issuers carrying capabilities within that ceiling, enforcing exactly what the credential carries; its capability set SHALL be extensible without a protocol change; and both operations SHALL be idempotent so retries in an automation are safe. A Cyphid-operated Reference Centaur Server SHALL be administered this way.

#### Scenario: #an-issuer-may-mint-narrower-than-itself
- **WHEN** a registered administrative issuer mints a credential for one automation carrying only the capability to admit a team
- **THEN** the server enforces exactly that — the automation cannot remove a team — and learns nothing about it; an issuer adding automations needs no configuration change on the server

#### Scenario: #capabilities-beyond-the-ceiling-are-refused
- **WHEN** a credential from a registered issuer carries a capability outside that issuer's recorded ceiling
- **THEN** the request is refused; a registration is a ceiling to attenuate downward from, never a licence to self-assess

#### Scenario: #adding-an-already-whitelisted-team-succeeds
- **WHEN** an automation admits a team the server has already admitted
- **THEN** the call succeeds unchanged, so a pipeline may retry it freely without special-casing the second attempt

#### Scenario: #the-platform-is-not-in-this-path
- **WHEN** an external system administers the reference implementation's whitelist
- **THEN** the exchange is between that system and that server alone; the platform is not called, is not consulted, and holds no record of it

### Requirement: team-server-management/game-invitations
When a game starts, the platform SHALL send each participating team's home server a game invitation: one per participating team — even where several teams are homed on the same server — delivered to all servers concurrently, by HTTPS POST to a single well-known path fixed platform-wide on the home domain, never over plain HTTP. An invitation SHALL be a bare notification naming the game and the team, carrying no credential and conferring nothing; the response's status SHALL be the whole answer. The platform SHALL wait a bounded window of ten seconds for each response, treating a server that has not answered within it as not having accepted.

#### Scenario: #one-invitation-per-team
- **WHEN** two participating teams are homed on the same server
- **THEN** that server receives two separate invitations, each processable independently of the other

#### Scenario: #https-only
- **WHEN** a home domain is reachable only over plain HTTP
- **THEN** no invitation is delivered to it — every platform exchange with a server's domain travels over the same authenticated transport, and a domain that cannot offer one cannot be identified as itself

#### Scenario: #bounded-concurrent-delivery
- **WHEN** a game with several participating teams starts
- **THEN** the invitations go out concurrently, and a server that has not answered within the ten-second window is treated as not having accepted — one slow or unreachable server can neither serialize the other deliveries nor stall the start indefinitely

#### Scenario: #wakes-a-sleeping-server
- **WHEN** a server has scaled down to nothing because none of the teams it operates is playing
- **THEN** the invitation is what brings it back in time to play, which is why this one exchange is the platform's to initiate — a server that had to keep a subscription open to hear about its games could never be idle

#### Scenario: #the-invitation-carries-no-authority
- **WHEN** an invitation is forged, replayed, or misdelivered by anyone able to reach the endpoint
- **THEN** the most it achieves is waking a server that then finds nothing to do: the server verifies by authenticating to the platform itself rather than by verifying the message, so the endpoint needs no signature check and no secret-handling discipline of any kind

### Requirement: team-server-management/invitation-acceptance
An invited server SHALL answer a game invitation by accepting or declining, in the response's status, and a team SHALL proceed into the game only if its home server accepts. Accepting SHALL be a commitment to operate that team for that game, which the server then does by authenticating for the team and requesting what it needs — the invitation conveys nothing it could act on. A server MAY decline on any policy of its own; the reference implementation SHALL decline for any team absent from its whitelist.

#### Scenario: #acceptance-gates-the-team
- **WHEN** a team's home server has not accepted the game invitation
- **THEN** the team does not proceed into the game — acceptance is a precondition of the team's participation

#### Scenario: #accepting-then-authenticating
- **WHEN** a server accepts an invitation
- **THEN** it holds nothing yet: it obtains that team's credential for that game, and from it the game's access token, by its own authenticated requests — accepting is a promise to act rather than a receipt of authority

#### Scenario: #nobody-has-to-be-watching
- **WHEN** a game starts for a team none of whose operators is signed in anywhere
- **THEN** the server still wakes, accepts, authenticates, and plays the team's snakes: its authority for the team is its own and derives from no operator's presence, so an unattended team competes rather than forfeiting

#### Scenario: #whitelist-refusal
- **WHEN** an invitation names a team absent from the reference implementation's whitelist
- **THEN** it declines

### Requirement: team-server-management/shared-hosting
Depends on: global-invariants/server-trust-boundary.

The relationship between Centaur Teams and Snek Centaur Servers SHALL be many-to-many over time: several teams may be homed on the same server simultaneously — opponents in one game included, on the terms the Server trust boundary sets — and a team may switch servers between games, but during any one game a team SHALL play from exactly one server, the one it was homed on when the game started. The application SHALL present team-internal surfaces in the context of exactly one specific hosted team, reachable only on that team's home server; platform-wide surfaces SHALL be team-independent and available identically on every server.

#### Scenario: #one-server-per-team-per-game
- **WHEN** a game is running
- **THEN** each participating team is operated by the single server that held its session at launch, for the whole game — the freeze on re-homing while playing guarantees the pairing cannot shift underneath a running game

#### Scenario: #switching-between-games
- **WHEN** a team changes its home between games
- **THEN** its next game is played from the new server, with no re-registration or migration step, and its history from games played on prior servers remains intact

#### Scenario: #unhosted-team-surface-refused
- **WHEN** a user navigates on one server to a team-internal surface — one whose behaviour requires the serving server's own in-process operation of that team — for a team that server does not operate
- **THEN** the surface is refused with an explanatory state, never silently rendered against the wrong server

#### Scenario: #cross-server-links-resolve-the-home
- **WHEN** any server's application links into another team's team-internal live surface
- **THEN** the link resolves to that team's own home server; every other surface it links is served locally, since all servers serve it identically

### Requirement: team-server-management/library-tenant-separation
Depends on: global-invariants/server-trust-boundary#tenant-isolation-is-best-effort, global-invariants/ephemeral-game-credentials#per-team-credentials-never-merge.

The server library the platform distributes SHALL keep each operated team's credentials and state reachable only by the compute acting for that team, and SHALL offer no ambient client standing in for all of them, so that an operator who wants co-tenants kept apart gets that from the library rather than having to build it. This SHALL remain support for a willing operator and never a promise to the teams: a server's operator can replace or bypass the library entirely.

#### Scenario: #no-ambient-client
- **WHEN** a server built on the library operates several teams
- **THEN** the connection management it offers is per team and per game throughout; an implementer wanting one client for all of them would be working against the library rather than with it

#### Scenario: #still-not-a-guarantee
- **WHEN** a team weighs what being co-hosted costs it
- **THEN** the answer is unchanged by this requirement — the operator sees everything, a server that does not use the library owes nothing, and nothing here may be presented to a team as protection

### Requirement: team-server-management/reference-heuristics-on-shared-hosting

The reference implementation SHALL run only the heuristic implementations distributed in the reference codebase whenever it operates more than one team, and any Cyphid-operated Reference Centaur Server SHALL operate on those terms. A team wanting its own Drive or Preference implementations SHALL run its own server, on which it is the only tenant.

#### Scenario: #shared-reference-server-refuses-team-code
- **WHEN** a team asks for its own Drive or Preference implementation on a Cyphid-operated server that operates other teams
- **THEN** it is not offered: team-supplied code in a process holding other teams' credentials would undo the separation the library provides, and the answer is a server of the team's own — a step the educational progression already anticipates

#### Scenario: #single-tenant-server-runs-anything
- **WHEN** a team runs a server operating only itself
- **THEN** it may run whatever heuristics it writes; there is no co-tenant whose separation could be undone

#### Scenario: #other-operators-choose-for-themselves
- **WHEN** a third party operates a server hosting several teams and runs team-supplied code on it
- **THEN** nothing in the platform prevents it, and the teams homed there are relying on that operator's judgement — which is what choosing a home server means

### Requirement: team-server-management/no-operator-state
Depends on: global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server, global-invariants/access-follows-identity.

A Snek Centaur Server SHALL hold no user records, no user sessions, and no identity state of any kind, and SHALL authenticate no person. It serves the web application; it does not mediate that application's data access, and the operator's own connections to the platform and to the game's instance are the operator's, opened under the operator's own identity.

#### Scenario: #no-per-server-sign-in
- **WHEN** a person uses the application served by any server
- **THEN** they sign in to the platform, not to the server — no server registers an identity-provider client of its own, holds a credential for one, or has any sign-in step a team's operator must be onboarded through

#### Scenario: #serving-the-wrong-visitor-exposes-nothing
- **WHEN** a server serves the application to someone with no relationship to the teams it operates
- **THEN** they see exactly what their own identity entitles them to and nothing more — the server was never the gatekeeper, so it has nothing to leak by serving

### Requirement: team-server-management/reference-server-home
Depends on: global-invariants/access-follows-identity#reference-deployment-has-no-special-privilege.

Cyphid SHALL operate a Reference Centaur Server that teams not running their own may be homed on, so that having no infrastructure is never a bar to playing. It SHALL hold no platform privilege another server lacks, and its concentration of teams SHALL be understood as the operational consequence it is: its domain and transport posture protect every team homed on it.

#### Scenario: #a-team-with-no-infrastructure-can-play
- **WHEN** a newly founded team has no server of its own
- **THEN** it can be homed on the Reference Centaur Server and, once admitted, play — running its own server is a progression, never a precondition

#### Scenario: #the-reference-server-is-just-a-server
- **WHEN** the Reference Centaur Server acts on the platform
- **THEN** it authenticates and is bounded exactly as any other server is; nothing about being Cyphid-operated widens what it may do for the teams it operates

### Requirement: team-server-management/server-healthcheck
Depends on: team-management/team-management-view.

Every Snek Centaur Server SHALL expose a healthcheck endpoint that answers availability only: callable without any credential, with a minimal response carrying no team-scoped or otherwise sensitive state. The platform SHALL record the latest healthcheck status and its timestamp for each team's home domain, checking on demand — when a team member or a platform surface requests it — with no obligation to poll automatically. The recorded status is what the team's management surface displays.

#### Scenario: #unauthenticated-and-minimal
- **WHEN** the healthcheck endpoint is called — by the platform or by anyone else
- **THEN** it answers without any credential and reveals only liveness; extending the response with team-scoped state would change the threat model and is a violation of this contract, not an enrichment of it

#### Scenario: #on-demand-not-polled
- **WHEN** no one has requested a check for some time
- **THEN** the platform is under no obligation to have polled — the recorded status is the latest on-demand result, and its staleness is visible from the recorded timestamp

#### Scenario: #member-triggered-check
- **WHEN** a team member triggers a health check of their team's home server from a surface that offers it — the pre-game readiness surfaces among them
- **THEN** the platform calls the server's healthcheck endpoint, records the status and timestamp, and surfaces the result to the requester

### Requirement: team-server-management/unified-web-application
Depends on: global-invariants/access-follows-identity.

There SHALL be exactly one web application for all platform interactions — its scope spanning both platform-level concerns and team-internal competitive concerns — and every Snek Centaur Server SHALL serve that same application: an open-source client backed by the same platform deployment, with no separate platform application anywhere. Serving the whole platform from interchangeable third-party servers is workable only because access follows identity, which settles what a visitor may read on any of them.

#### Scenario: #no-second-application
- **WHEN** any platform interaction is sought, platform-wide or team-internal
- **THEN** it lives in the one unified application every server serves — there is no separate platform application to visit for any of it

#### Scenario: #same-data-any-server
- **WHEN** a user reaches a platform surface from some server's copy of the application
- **THEN** the serving server is an interchangeable client: it determines where the application was fetched from and nothing else, since what the user may read is settled by their own identity

### Requirement: team-server-management/forkable-reference-app
Depends on: global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant.

The application SHALL be delivered as a forkable reference implementation repository, separate from the platform's server library: a team customises it by modifying its fork directly — full source ownership, not a bounded extension point — free to modify, replace, or restructure any part of the interface, latitude that is safe to grant only because customising the application changes no invariant. The platform-facing compatibility surface a fork must preserve SHALL be explicitly enumerated and kept stable: the invitation endpoint contract, the published key document, the healthcheck contract, and the published library interfaces the application consumes. A fork preserving the enumerated surface SHALL remain platform-compatible regardless of what else it changes.

#### Scenario: #full-source-ownership
- **WHEN** a team wants behaviour the reference interface does not offer
- **THEN** it edits its fork — any component, page, layout, or flow — without requesting an extension point, because the fork itself is the extension point

#### Scenario: #enumerated-surface-is-the-contract
- **WHEN** a fork diverges arbitrarily from the reference implementation while preserving the enumerated compatibility surface
- **THEN** the platform interoperates with it exactly as with the reference: invitations are answered, its key resolves, its health is reported, and its teams are operated

#### Scenario: #surface-changes-are-platform-changes
- **WHEN** the platform needs to alter anything within the enumerated compatibility surface
- **THEN** that is a deliberate breaking change to every fork, made and communicated as such — never an incidental drift a fork discovers when its teams stop being operated
