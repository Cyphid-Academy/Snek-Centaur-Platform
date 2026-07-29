## Purpose

What a deployment must be in order to be a Snek Centaur Server: the promises
the artifact makes to whoever runs it, forks it, or reaches it. This
capability owns the server's self-provisioning key publication; the whitelist
administration API the reference implementation exposes and the
administrative issuers it trusts; the separation the distributed library
keeps between co-hosted teams, and the heuristics a shared reference
deployment will run; the absence of any identity state of its own; the
liveness endpoint it answers; and the forkable reference repository, its
enumerated compatibility surface, and the versioned library a fork binds to.
Whether a team may be operated at all — the naming, the two-sided consent,
the invitation exchange and its acceptance, the platform's record of a
server's health, and the reference deployment the platform undertakes to
operate — belongs to the story of a team acquiring a server. What the hosted
bot computes belongs to the framework, and what the served application shows
belongs to the application.

Admission test — a requirement belongs in this capability iff all four hold:
**(a)** the obligation is discharged inside the server deployment itself, by
whoever builds or forks it; **(b)** it reads identically for a server that
operates no team — one that has just started, has been named by nobody, and
has admitted nobody — so it cannot rest on a team relationship, a game, or an
operator; **(c)** it constrains what the server is or exposes, never what a
consumer does with it; **(d)** it is a fact about this artifact, checkable by
opening its source, rather than a rule binding a server, the platform, and a
client alike. Anything failing (a) belongs to the capability that owns the
platform's side of the same exchange; anything failing (b) is a user story and
belongs to the story capability; anything failing (c) belongs to the framework
or the application; anything failing (d) is `global-invariants`'.

Depends on: application-shell, global-invariants.

## ADDED Requirements

### Requirement: centaur-server-runtime/server-key-publication
Depends on: global-invariants/no-shared-secrets, global-invariants/credential-confinement#every-party-keeps-its-own-key.

A Snek Centaur Server SHALL, on first start and without any operator action, generate a signing keypair if it has none persisted, persist it, and publish the public half at a single well-known path fixed platform-wide on its own domain, so the platform reads it without any discovery or configuration step. It SHALL be able to publish several keys at once, so that rotation is publish-both, switch, drop-the-old, with no exchange with the platform. Generating, persisting, and publishing the key SHALL be invisible in the operator experience — captains are coaches and students, not platform engineers — and if it cannot be made invisible, the platform SHALL instead authenticate servers by a challenge it initiates, because onboarding friction is not worth trading for protocol elegance in an educational product.

#### Scenario: #first-boot-needs-no-operator
- **WHEN** someone deploys a Snek Centaur Server for the first time
- **THEN** it is ready to be named as a team's home with no key to generate, copy, paste, or register — the deployment itself is the whole setup

#### Scenario: #ephemeral-storage-self-heals
- **WHEN** a server is redeployed onto storage that did not preserve its key
- **THEN** it generates and publishes a new one and resumes operating its teams; nothing on the platform was pinned to the old key, so nothing needs re-registering

#### Scenario: #rotation-is-uncoordinated
- **WHEN** a server rotates its signing key
- **THEN** it publishes the new key alongside the old, switches, and later drops the old one — the platform is neither told nor asked, and no team's operation is interrupted

### Requirement: centaur-server-runtime/healthcheck-endpoint

Every Snek Centaur Server SHALL expose a healthcheck endpoint at a single well-known path fixed platform-wide on its own domain, answering availability only: callable without any credential, with a minimal response carrying no team-scoped or otherwise sensitive state, and available whether or not the server currently operates any team.

#### Scenario: #unauthenticated-and-minimal
- **WHEN** the healthcheck endpoint is called — by the platform or by anyone else
- **THEN** it answers without any credential and reveals only liveness; extending the response with team-scoped state would change the threat model and is a violation of this contract, not an enrichment of it

#### Scenario: #liveness-is-not-readiness-to-play
- **WHEN** a server that has admitted no team is checked
- **THEN** it answers exactly as a fully loaded one does — the endpoint reports that the deployment is up, and says nothing about whom it will operate, which is a separate question with a separate answer

### Requirement: centaur-server-runtime/server-administration-api
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

### Requirement: centaur-server-runtime/library-tenant-separation
Depends on: global-invariants/server-trust-boundary#tenant-isolation-is-best-effort, global-invariants/ephemeral-game-credentials#per-team-credentials-never-merge.

The server library the platform distributes SHALL keep each operated team's credentials and state reachable only by the compute acting for that team, and SHALL offer no ambient client standing in for all of them, so that an operator who wants co-tenants kept apart gets that from the library rather than having to build it. This SHALL remain support for a willing operator and never a promise to the teams: a server's operator can replace or bypass the library entirely.

#### Scenario: #no-ambient-client
- **WHEN** a server built on the library operates several teams
- **THEN** the connection management it offers is per team and per game throughout; an implementer wanting one client for all of them would be working against the library rather than with it

#### Scenario: #still-not-a-guarantee
- **WHEN** a team weighs what being co-hosted costs it
- **THEN** the answer is unchanged by this requirement — the operator sees everything, a server that does not use the library owes nothing, and nothing here may be presented to a team as protection

### Requirement: centaur-server-runtime/reference-heuristics-on-shared-hosting

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

### Requirement: centaur-server-runtime/no-operator-state
Depends on: global-invariants/one-contract-many-surfaces#operators-never-proxy-through-the-server, global-invariants/access-follows-identity.

A Snek Centaur Server SHALL hold no user records, no user sessions, and no identity state of any kind, and SHALL authenticate no person. It serves the web application; it does not mediate that application's data access, and the operator's own connections to the platform and to the game's instance are the operator's, opened under the operator's own identity.

#### Scenario: #no-per-server-sign-in
- **WHEN** a person uses the application served by any server
- **THEN** they sign in to the platform, not to the server — no server registers an identity-provider client of its own, holds a credential for one, or has any sign-in step a team's operator must be onboarded through

#### Scenario: #serving-the-wrong-visitor-exposes-nothing
- **WHEN** a server serves the application to someone with no relationship to the teams it operates
- **THEN** they see exactly what their own identity entitles them to and nothing more — the server was never the gatekeeper, so it has nothing to leak by serving

### Requirement: centaur-server-runtime/forkable-reference-app
Depends on: global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant, application-shell/unified-web-application.

The server SHALL be delivered as a forkable reference implementation repository, separate from the platform's server library: a team customises it by modifying its fork directly — full source ownership, not a bounded extension point — free to modify, replace, or restructure any part of the interface, latitude that is safe to grant only because customising the application changes no invariant. The platform-facing compatibility surface a fork must preserve SHALL be exactly three HTTP endpoints on the server's own domain, fixed platform-wide and identical on every server — `POST /.well-known/snek-game-invite` (the game-start invitation), `GET /.well-known/snek-server-keys` (the published verification material), and `GET /.well-known/snek-healthcheck` (the healthcheck) — together with the published library interfaces the application consumes. The platform SHALL reserve nothing outside the `/.well-known/snek-` prefix: every other path on the domain belongs to the fork. A fork preserving the enumerated surface SHALL remain platform-compatible regardless of what else it changes.

#### Scenario: #full-source-ownership
- **WHEN** a team wants behaviour the reference interface does not offer
- **THEN** it edits its fork — any component, page, layout, or flow — without requesting an extension point, because the fork itself is the extension point

#### Scenario: #enumerated-surface-is-the-contract
- **WHEN** a fork diverges arbitrarily from the reference implementation while preserving the enumerated compatibility surface
- **THEN** the platform interoperates with it exactly as with the reference: invitations are answered, its key resolves, its health is reported, and its teams are operated

#### Scenario: #the-rest-of-the-path-space-is-the-forks
- **WHEN** a fork restructures its routes, or gives its own operator-facing pages the short obvious names — a status page at the root, a differently organised admin area
- **THEN** nothing collides: the platform reaches the domain only under the prefixed well-known family, so the fork's own path space is unreserved and stays that way

#### Scenario: #surface-changes-are-platform-changes
- **WHEN** the platform needs to alter anything within the enumerated compatibility surface — a path among them
- **THEN** that is a deliberate breaking change to every fork, made and communicated as such — never an incidental drift a fork discovers when its teams stop being operated

### Requirement: centaur-server-runtime/published-library-surface

The server library SHALL be published as a versioned artifact a fork resolves without any access to the platform's own repository, and the interfaces it publishes SHALL be the code half of the compatibility surface a fork binds to. A fork pinned to a published version SHALL keep building and keep being operated for as long as that version's interfaces are honoured, and a change that removes or narrows a published interface SHALL be released as a breaking version rather than reaching pinned forks at all.

#### Scenario: #a-fork-builds-without-the-monorepo
- **WHEN** someone forks the reference repository and builds it
- **THEN** every dependency resolves from published artifacts alone; no step of the build reaches into the platform's own repository, which a fork author cannot be assumed to have

#### Scenario: #pinned-forks-do-not-drift
- **WHEN** a newer library version is published
- **THEN** a fork that has not taken it is unaffected — it keeps building, and its teams keep being operated, because nothing about the new version reaches a fork that did not ask for it

#### Scenario: #a-removal-is-a-version-not-a-surprise
- **WHEN** a published interface is removed or narrowed
- **THEN** it ships as a breaking version, so a fork meets the change when it chooses to upgrade — never when its teams stop being operated
