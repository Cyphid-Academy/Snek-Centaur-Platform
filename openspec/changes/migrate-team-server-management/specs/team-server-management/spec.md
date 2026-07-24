## Purpose

A team acquires and runs its Snek Centaur Server. This capability owns
that workflow end to end: the captain's nomination of a server domain, the
team↔server hosting relationship, the game-start invitation surface —
delivery, credential carriage, acceptance, and the receiving endpoint's
discipline — the healthcheck contract and availability reporting, the one
unified web application every server serves, and the forkable reference
application a team owns outright. What an invitation refusal means for the
game, when a game consults server health at start, and what the hosted
bots then do in play belong to the capabilities that own those workflows.

The trust model is deliberate and asymmetric. Nominating a server is the
captain's unilateral declaration of trust — the platform never vets,
registers, or certifies a server, and a server has no platform identity of
its own. Every server serves the same open-source client application, and
a visitor's data access is determined by their own identity, never by the
server they visit; nevertheless a malicious server operator can serve
modified client code that exfiltrates whatever data its visitors can
legitimately read. The platform accepts this trade-off: it attempts no
detection or prevention, and users are expected to sign in only on servers
they trust, exactly as with any web application. The trade-off stays
bounded because no security-relevant invariant is ever enforced by
server-controlled code — a hostile server can betray only what its own
visitors could already read, never widen anyone's read or write authority.

Depends on: identity-and-authorization, team-management.

## ADDED Requirements

### Requirement: team-server-management/server-nomination
A Centaur Team's captain SHALL nominate the team's Snek Centaur Server by recording a server domain on the team record (team-management/team-record), and MAY change or clear it at any time — captain-only per team-management/captain-authority, and frozen while the team is playing per team-management/roster-freeze. Nomination SHALL be unilateral: no acceptance, registration, or handshake from the nominated server is required or possible, and no secret is exchanged with the server as part of nomination. A nominated domain's validity is proven only implicitly, when the platform actually delivers to it.

#### Scenario: #unilateral-and-secretless
- **WHEN** a captain sets or changes the team's nominated server domain
- **THEN** the change is a plain record update, complete immediately — the platform contacts no server, awaits no acceptance, and stores, sends, or receives no secret as part of the nomination

#### Scenario: #validity-not-checked-at-nomination
- **WHEN** a captain nominates a domain that is unreachable, misconfigured, or not running a Snek Centaur Server at all
- **THEN** the nomination succeeds anyway — validity surfaces later, through healthchecks and invitation delivery, never as a nomination-time gate

#### Scenario: #clearing-is-allowed
- **WHEN** the captain clears the nomination
- **THEN** the team record holds no nominated server, and the team cannot enter games until a server is nominated again (team-server-management/nomination-required-to-play)

### Requirement: team-server-management/nomination-required-to-play
A Centaur Team SHALL enter a game only while it has a nominated server domain: entry into games is barred while the nomination is empty. The platform supports no pure-human teams — playing without a Snek Centaur Server is not a configuration any flow may offer.

#### Scenario: #empty-nomination-bars-entry
- **WHEN** a team with no nominated server domain is put forward for a game
- **THEN** its entry is refused until a server is nominated

#### Scenario: #no-pure-human-path
- **WHEN** a team seeks to compete with humans staging every move and no server hosting it
- **THEN** no such mode exists — the nomination gate is structural, not a default that can be waived

### Requirement: team-server-management/no-server-identity
A Snek Centaur Server SHALL have no persistent identity on the platform: no server account, record, registry, or enrolment exists, and a server domain is configuration on a Centaur Team record, never an identity. Every platform interaction with a server SHALL flow from some team's nomination of it, and any credential a server ever receives SHALL be a hosted team's per-team game credential (identity-and-authorization/game-credential-scope) — nothing is ever issued to, or scoped to, the server itself.

#### Scenario: #nothing-to-register
- **WHEN** a new server comes online intending to host teams
- **THEN** there is no platform registration step for it to perform — it becomes involved exactly when a team nominates its domain and a game invitation arrives

#### Scenario: #credentials-name-teams-never-servers
- **WHEN** any credential in a server's possession is examined
- **THEN** it is a hosted team's credential, scoped to that team and one game; no credential names, authenticates, or empowers the server as an entity

### Requirement: team-server-management/shared-hosting
The relationship between Centaur Teams and Snek Centaur Servers SHALL be many-to-many over time: several teams may nominate the same server simultaneously, and a team may switch servers between games — but during any one game a team SHALL play from exactly one server, the one nominated when the game started. The application SHALL present team-internal surfaces in the context of exactly one specific hosted team, reachable only on that team's hosting server; platform-wide surfaces SHALL be team-independent and available identically on every server.

#### Scenario: #one-server-per-team-per-game
- **WHEN** a game is running
- **THEN** each participating team is hosted by the single server that accepted its invitation, for the whole game — the nomination freeze guarantees the pairing cannot shift underneath a running game

#### Scenario: #switching-between-games
- **WHEN** a team changes its nomination between games
- **THEN** its next game is played from the newly nominated server, with no re-registration or migration step, and its history from games played on prior servers remains intact

#### Scenario: #unhosted-team-surface-refused
- **WHEN** a user navigates on one server to a team-internal surface — one whose behaviour requires the serving server's own in-process hosting of that team — for a team that server does not host
- **THEN** the surface is refused with an explanatory state, never silently rendered against the wrong server

#### Scenario: #cross-server-links-resolve-the-nomination
- **WHEN** any server's application links into another team's team-internal live surface
- **THEN** the link resolves to that team's own nominated server; every other surface it links is served locally, since all servers serve it identically

### Requirement: team-server-management/game-invitations
When a game starts, the platform SHALL send each participating team's nominated server a game invitation: one self-contained invitation per participating team — even when several teams share a server — delivered to all servers concurrently, by HTTPS POST to a single well-known invitation endpoint path fixed platform-wide on the nominated domain, never over plain HTTP. The platform SHALL wait a bounded window of ten seconds for each server's response, and DNS resolution of the nominated domain SHALL be the sufficient proof of server ownership: the delivery's security property is that only the domain's legitimate operator receives the invitation, with no further challenge.

#### Scenario: #one-invitation-per-team
- **WHEN** two participating teams have nominated the same server
- **THEN** that server receives two separate invitations, each self-contained and processable independently of the other

#### Scenario: #https-only
- **WHEN** a nominated domain is reachable only over plain HTTP
- **THEN** no invitation is delivered to it — invitations travel exclusively over HTTPS, because what they carry must never transit unencrypted

#### Scenario: #bounded-concurrent-delivery
- **WHEN** a game with several participating teams starts
- **THEN** the invitations go out concurrently, and a server that has not answered within the ten-second window is treated as not having accepted — one slow or unreachable server can neither serialize the other deliveries nor stall the start indefinitely

#### Scenario: #dns-is-the-proof
- **WHEN** the platform delivers an invitation
- **THEN** resolving the nominated domain is the entire ownership check — the platform is sending to the domain, not receiving credentials from it, so delivery reaching only the domain's legitimate operator is the security property relied upon

### Requirement: team-server-management/invitation-credential-carriage
Each game invitation SHALL carry the receiving team's per-team game credential (identity-and-authorization/game-credential-scope) together with the game context the server needs to act on it, and the invitation SHALL be the only channel through which a Snek Centaur Server ever receives a platform secret: no secret is stored, exchanged, or transmitted between the platform and a server at nomination or at any other time.

#### Scenario: #sole-secret-channel
- **WHEN** the complete set of platform-to-server exchanges is examined
- **THEN** game invitations are the only messages that ever carry a secret — nomination, healthchecks, and every other exchange are secret-free

#### Scenario: #self-sufficient-provisioning
- **WHEN** a server has accepted a team's invitation
- **THEN** it holds everything required to act for that team in that game — the credential and the game's connection context — with no further provisioning exchange to perform

### Requirement: team-server-management/invitation-acceptance
An invited server SHALL respond to a game invitation by accepting or rejecting it, and a team SHALL proceed into the game only if its nominated server accepts. Custom servers MAY reject on any policy of their own. The reference implementation SHALL accept automatically by default, offering a server-side whitelist configuration, keyed by team identity, that restricts which teams it will host; the default configuration SHALL be unrestricted.

#### Scenario: #acceptance-gates-the-team
- **WHEN** a team's nominated server has not accepted the game invitation
- **THEN** the team does not proceed into the game — acceptance is a precondition of the team's participation

#### Scenario: #default-open
- **WHEN** the reference implementation receives an invitation and no whitelist is configured
- **THEN** it accepts — the default imposes no restriction, so any team that nominates the server and starts a game will engage its compute

#### Scenario: #whitelist-refusal
- **WHEN** a whitelist is configured and the inviting team matches no entry in it
- **THEN** the reference implementation rejects the invitation

### Requirement: team-server-management/invitation-endpoint-discipline
The application SHALL expose the well-known invitation endpoint, and SHALL accept an invitation only after verifying both that it authentically originates from the platform — its signature verifies against the platform's published verification material — and that the team it names is one this server hosts; a forged invitation or an unhosted team SHALL be refused. Acceptance SHALL be idempotent per team and game: a duplicate delivery is re-acknowledged as accepted without starting a second hosting session. On acceptance the server SHALL hand the delivered credential in-process to the team's hosting session, holding it in memory only, per identity-and-authorization/client-credential-custody.

#### Scenario: #forged-invitation-refused
- **WHEN** a request arrives at the invitation endpoint whose signature does not verify as the platform's
- **THEN** it is refused and no hosting session starts — DNS protects delivery to the right server; the signature check protects the server from invitation forgery

#### Scenario: #unhosted-team-refused
- **WHEN** a signature-valid invitation names a team this server does not host
- **THEN** it is refused

#### Scenario: #duplicate-delivery-idempotent
- **WHEN** the same team-and-game invitation is delivered twice
- **THEN** the second delivery is acknowledged as already accepted, and exactly one hosting session for that team and game exists

#### Scenario: #credential-stays-in-process
- **WHEN** an invitation is accepted
- **THEN** the credential passes in-process to the team's hosting session and lives in server memory for the game's duration — never written to durable storage and never exposed on any outward interface

### Requirement: team-server-management/server-healthcheck
Every Snek Centaur Server SHALL expose a healthcheck endpoint that answers availability only: callable without any credential, with a minimal response carrying no team-scoped or otherwise sensitive state. The platform SHALL record the latest healthcheck status and its timestamp for each team's nominated domain, checking on demand — when a team member or a platform surface requests it — with no obligation to poll automatically. The recorded status is what the team's management surface displays per team-management/team-management-view.

#### Scenario: #unauthenticated-and-minimal
- **WHEN** the healthcheck endpoint is called — by the platform or by anyone else
- **THEN** it answers without any credential and reveals only liveness; extending the response with team-scoped state would change the threat model and is a violation of this contract, not an enrichment of it

#### Scenario: #on-demand-not-polled
- **WHEN** no one has requested a check for some time
- **THEN** the platform is under no obligation to have polled — the recorded status is the latest on-demand result, and its staleness is visible from the recorded timestamp

#### Scenario: #member-triggered-check
- **WHEN** a team member triggers a health check of their team's nominated server from a surface that offers it — the pre-game readiness surfaces among them
- **THEN** the platform calls the nominated server's healthcheck endpoint, records the status and timestamp, and surfaces the result to the requester

### Requirement: team-server-management/unified-web-application
There SHALL be exactly one web application for all platform interactions — its scope spanning both platform-level concerns and team-internal competitive concerns — and every Snek Centaur Server SHALL serve that same application: an open-source client backed by the same platform backend, with no separate platform application anywhere. A user SHALL see the same platform data regardless of which server they visit.

#### Scenario: #no-second-application
- **WHEN** any platform interaction is sought, platform-wide or team-internal
- **THEN** it lives in the one unified application every server serves — there is no separate platform application to visit for any of it

#### Scenario: #same-data-any-server
- **WHEN** the same user visits two different servers
- **THEN** the platform data visible to them is identical on both — the serving server is an interchangeable client, and which server one visits determines presentation origin, never data access

### Requirement: team-server-management/forkable-reference-app
The application SHALL be delivered as a forkable reference implementation repository, separate from the platform's server library: a team customises it by modifying its fork directly — full source ownership, not a bounded extension point — free to modify, replace, or restructure any part of the interface. The platform-facing compatibility surface a fork must preserve SHALL be explicitly enumerated and kept stable: the invitation endpoint contract, the healthcheck contract, and the published library interfaces the application consumes. A fork preserving the enumerated surface SHALL remain platform-compatible regardless of what else it changes.

#### Scenario: #full-source-ownership
- **WHEN** a team wants behaviour the reference interface does not offer
- **THEN** it edits its fork — any component, page, layout, or flow — without requesting an extension point, because the fork itself is the extension point

#### Scenario: #enumerated-surface-is-the-contract
- **WHEN** a fork diverges arbitrarily from the reference implementation while preserving the enumerated compatibility surface
- **THEN** the platform interoperates with it exactly as with the reference: invitations are received and accepted, health is reported, hosting proceeds

#### Scenario: #surface-changes-are-platform-changes
- **WHEN** the platform needs to alter anything within the enumerated compatibility surface
- **THEN** that is a deliberate breaking change to every fork, made and communicated as such — never an incidental drift a fork discovers when an invitation stops arriving
