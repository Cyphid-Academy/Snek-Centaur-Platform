## Purpose

An admin automates the platform from outside the first-party application:
the platform's own public function surface, called directly by registered
integration clients rather than through any proxy of its own; the client
registrations that authorize it and the capability ceilings they carry; and the webhooks by which external systems learn that
games have started and finished. This capability owns the integration
surface itself — who may register a client, what a client can and cannot
reach, and the delivery semantics of event notifications. The platform
behaviour reached *through* it — team management, rooms, game launch — is
owned by the capabilities that own those workflows; this capability
guarantees external callers meet exactly those rules, because they call
exactly those functions.

Depends on: identity-and-authorization, game-lifecycle, global-invariants, platform-persistence.

## ADDED Requirements

### Requirement: platform-integrations/integration-clients
Depends on: identity-and-authorization/service-principal-assertions, identity-and-authorization/trusted-issuer-registry, identity-and-authorization/platform-admin-role, global-invariants/no-shared-secrets.

Every request to the platform's HTTP API SHALL be authorized by a credential the platform issued to a registered **integration client**, obtained by that client proving who it is with its own key. A client SHALL act as itself and never as a person: what it may do is the capability ceiling recorded on its registration, never the authority of the admin who registered it. Registering a client SHALL be an admin-only affordance, and a client whose registration is revoked SHALL obtain no further credential.

#### Scenario: #a-client-is-not-its-registrar
- **WHEN** the admin who registered a client later gains or loses standing, or is granted some new power
- **THEN** the client's reach does not move with them — it is its own recorded ceiling, so a client is never a way to hold a person's authority at rest

#### Scenario: #nothing-secret-is-created-to-register
- **WHEN** an integrator sets up a client
- **THEN** no secret is generated, disclosed, copied, or transmitted anywhere: the client publishes its own public material and the registration records where to read it

#### Scenario: #unregistered-caller-refused
- **WHEN** a request arrives bearing a well-formed credential from a client the platform holds no registration for
- **THEN** it is refused; a valid signature establishes who signed and nothing about what they may do

### Requirement: platform-integrations/client-registration
Depends on: identity-and-authorization/trusted-issuer-registry#registry-holds-no-secret.

The platform SHALL hold a persistent record per registered integration client capturing at minimum: the client's issuer identifier, the location at which it publishes its verification material, its granted capability ceiling, a human-chosen label, the registering admin's user record, the registration timestamp, and a revocation timestamp that is null until the registration is revoked. The record SHALL contain nothing secret.

#### Scenario: #nothing-to-disclose-at-creation
- **WHEN** a client is registered
- **THEN** no plaintext credential is presented to anyone, because none was created — there is no one-time disclosure to copy before it disappears, and nothing about the registration needs protecting in transit

#### Scenario: #metadata-only-ever-after
- **WHEN** a registration is listed or inspected at any time
- **THEN** the whole record is presentable — label, ceiling, timestamps, registrar — because no part of it is sensitive

### Requirement: platform-integrations/client-management
The platform SHALL give admins the means — through the first-party application and through the HTTP API itself — to register integration clients, adjust a client's capability ceiling, and revoke a registration. The management surface SHALL list active and revoked registrations with each one's label, ceiling, timestamps, and registering admin. Revocation SHALL take effect on issuance immediately, and revoked registration records SHALL be retained, never deleted, so the history of what was registered, by whom, with what reach, and when it ended remains auditable.

#### Scenario: #revocation-immediate
- **WHEN** a registration is revoked while an integration is actively using it
- **THEN** its very next credential request is refused with no grace period; the credential it already holds keeps working until it expires minutes later and nothing renews it — the delay a self-contained credential trades for stateless verification, and the reason lifetimes are short

#### Scenario: #revoked-records-retained
- **WHEN** a registration has been revoked
- **THEN** its record persists with its revocation timestamp and still appears in the management listing — revocation ends the client's reach, never the audit trail of its existence

### Requirement: platform-integrations/client-capability-bounds
Depends on: identity-and-authorization/peer-capability-ceiling, identity-and-authorization/principal-kind-gating, identity-and-authorization/platform-admin-role#no-write-path-into-live-games.

No integration client's ceiling SHALL include: creating a human identity, any action that requires an interactive sign-in, changing any authentication configuration, issuing access tokens for a human or a team, or reading or writing Centaur-subsystem state. No client SHALL ever act inside a live game. Everything else the platform exposes is grantable, so a system that is the source of truth for its own teams may administer them.

#### Scenario: #never-a-gameplay-actor
- **WHEN** an API caller attempts by any means to act inside a live game — stage a move, mutate game state, or touch any Centaur-subsystem state
- **THEN** it is refused: no part of the API affords it, and no ceiling unlocks it

#### Scenario: #no-identity-creation
- **WHEN** an API caller attempts to create a human identity, relink a person's credential, or any action whose authorization inherently requires an interactive sign-in
- **THEN** it is refused — humans enter the platform only through sign-in, and whose credential belongs to whom is settled inside the platform alone

#### Scenario: #a-roster-system-may-run-its-rosters
- **WHEN** an academy system that owns its classes creates teams, names their captains and coaches, and adds and removes students as enrolment changes
- **THEN** it is permitted on its recorded ceiling: the exclusions above bound what a compromised client could do irreversibly to the platform's own authority, and a system administering the teams it created is not that

### Requirement: platform-integrations/functions-are-the-api
Depends on: game-lifecycle/launch-orchestration, identity-and-authorization/capability-registry, platform-persistence/component-boundaries#the-host-adds-authority-not-storage.

The platform SHALL maintain no integration-specific request surface: a registered client calls the platform's own public functions directly, the very ones the first-party application calls, and its capabilities name those functions. The platform's documented programmatic surface — at minimum administering Centaur Teams, rooms, games including setting a not-yet-launched game's configuration, webhook subscriptions, and client registrations — SHALL be reachable this way by a client whose ceiling reaches it, with no family of behaviour inside that surface requiring a fallback to the application. Functions outside it accept human identities alone, and their being unreachable programmatically is a declared kind restriction rather than a gap in this surface: what a client may reach grows by a function declaring the service-principal kind, never by widening a ceiling.

#### Scenario: #no-second-surface-to-keep-in-step
- **WHEN** a new platform behaviour is added and should be automatable
- **THEN** nothing has to be built for it: it is a public function with a declared capability, and a client's ceiling either reaches it or does not — there is no proxy layer that could be forgotten, lag behind, or diverge

#### Scenario: #api-start-is-a-real-launch
- **WHEN** a game is started by a registered client
- **THEN** the one launch orchestration runs — the same gates, the same freeze, the same provisioning — and the resulting game is indistinguishable from one started first-party, because it is the same function

#### Scenario: #the-families-are-a-floor
- **WHEN** an external integrator administers teams, rooms, games, webhooks, or client registrations
- **THEN** each of these families is reachable programmatically with the client's own credential alone; none requires falling back to the first-party application

#### Scenario: #configuring-a-game-is-inside-the-surface
- **WHEN** a client whose ceiling reaches it sets the parameters of a game that has not yet launched, and then starts it
- **THEN** both calls succeed programmatically: starting a game presupposes deciding what game is to be played, so the configuration edit is inside the promised surface rather than the one step that sends an integrator back to the first-party application

#### Scenario: #outside-the-surface-is-not-a-fallback
- **WHEN** a client calls a function outside the documented surface, which accepts human identities alone
- **THEN** it is refused on principal kind, and that is not a family requiring fallback: the surface is what the platform undertakes to expose programmatically, and enlarging it is a deliberate act on the function

### Requirement: platform-integrations/first-party-parity
Depends on: global-invariants/one-contract-many-surfaces, identity-and-authorization/mutation-authorization, identity-and-authorization/capability-registry#reachability-is-not-authorization.

Parity between programmatic and first-party access SHALL be structural rather than maintained: because both dispatch the same functions, no validation exists in one path and not the other. A client's ceiling SHALL widen who may act and never what the platform's rules permit — reaching a function is not permission to have done what it does.

#### Scenario: #no-privileged-bypass
- **WHEN** a client's call targets state the platform's rules currently hold immutable — a launched game's frozen configuration, say
- **THEN** it is rejected by the same rule that rejects the first-party attempt, because it is the same code; there is no place an API-only exemption could live

#### Scenario: #broad-ceiling-is-not-a-superuser
- **WHEN** a client whose ceiling reaches a function calls it in circumstances the function's own authorization refuses
- **THEN** the call is rejected — the capability got it to the door and decided nothing else

### Requirement: platform-integrations/webhook-subscriptions
The platform SHALL let authenticated integration clients register webhook subscriptions. Each subscription SHALL capture at minimum: a delivery URL, one or more event types drawn from the closed set `game_start`, `game_end`; a scope naming either one specific game or one specific room — a room-scoped subscription applying to every game hosted in that room; the integration client under which it was created; and a creation timestamp. A subscription SHALL be revoked automatically when its owning client's registration is revoked, and no notification SHALL be delivered to it for any event occurring after that revocation.

#### Scenario: #room-scope-follows-the-room
- **WHEN** a room-scoped subscription exists and a new game comes to be hosted in that room
- **THEN** the subscription covers the new game without re-registration — the scope names the room, not any one game

#### Scenario: #revoked-with-owning-client
- **WHEN** a subscription's owning client registration is revoked
- **THEN** the subscription dies with it: events occurring after the revocation produce no delivery to that URL, and the revoked registration cannot be used to resurrect it

### Requirement: platform-integrations/delivery-destination-admission
A delivery destination SHALL be admitted only if it is an HTTPS URL whose host resolves to a publicly routable address: loopback, link-local, private, and otherwise non-publicly-routable addresses SHALL be refused, as SHALL the deployment's own origin and the hosts of the platform's own operational control planes. The platform SHALL apply this admission twice — when the subscription is registered, and again against the address each delivery attempt is about to connect to — and SHALL abandon a delivery whose destination fails it outright, never counting it as a failed attempt to be retried.

#### Scenario: #inward-aimed-destination-refused
- **WHEN** a client registers a subscription pointed at loopback, a private-range address, the deployment's own endpoints, or the host game instances are provisioned on
- **THEN** it is refused: without the bound, registering a subscription is a way to have the platform issue requests from inside its own network boundary, carrying bodies the client chose to addresses no external caller can reach

#### Scenario: #plaintext-destination-refused
- **WHEN** a delivery URL is not HTTPS
- **THEN** it is refused and no delivery is ever attempted to it — a notification carries the game's configuration and its final scores, so it leaves the platform encrypted or not at all

#### Scenario: #rechecked-against-the-address-actually-reached
- **WHEN** a destination admitted at registration later resolves to an inadmissible address, the name having been re-pointed since
- **THEN** the attempt is refused at the moment of delivery and abandoned rather than retried; admission is a property of the address actually being connected to, so a registration-time check alone would establish only that the name once looked acceptable

### Requirement: platform-integrations/lifecycle-event-notifications
Depends on: game-lifecycle/status-authority.

The platform SHALL deliver a `game_start` notification for every game that transitions to `playing`, and a `game_end` notification for every game that transitions to `finished`, to each active subscription whose event types include the event and whose scope matches the game or its room. A `game_start` payload SHALL include at minimum the game's id, its room's id, and the game's configuration; a `game_end` payload at minimum the game's id, its room's id, and the game's final scores. These SHALL be the only lifecycle events: in particular, no notification announces a game's creation — the first thing a subscriber hears about any game is its `game_start`, at the moment it enters `playing`.

#### Scenario: #no-creation-event
- **WHEN** a game record comes into existence — created directly, or auto-created as a successor
- **THEN** no notification is delivered; a game becomes visible to subscribers only at its `playing` transition, so pre-launch activity and still-editable configuration are never broadcast

#### Scenario: #start-payload-is-the-played-config
- **WHEN** a `game_start` notification is delivered
- **THEN** the configuration it carries is the configuration the game is actually being played under — frozen at launch — so external automation can act on it without a follow-up read

### Requirement: platform-integrations/at-least-once-delivery
Webhook delivery SHALL use at-least-once semantics: a failed delivery attempt — network failure, non-success response, or timeout — SHALL be retried with exponential backoff until a delivery succeeds or a bounded retry budget is exhausted. Every notification SHALL carry a stable deduplication identifier determined solely by the game, the event type, and the subscription — identical on every delivery attempt and redelivery of the same event, and never colliding across distinct events — so a subscriber can deduplicate on that identifier alone.

#### Scenario: #same-id-on-every-redelivery
- **WHEN** the same event reaches the same subscription more than once — retries after a timeout the subscriber actually processed, or any other duplicated dispatch
- **THEN** every copy carries the identical deduplication identifier, and no other event ever carries it — deduplication by the identifier is sound with no further inspection of the payload

#### Scenario: #retries-back-off-and-stop
- **WHEN** a subscriber endpoint fails persistently
- **THEN** retries are spaced with exponential backoff and cease once the bounded budget is exhausted — a dead endpoint is never hammered indefinitely, and its subscription's failure affects no other subscription's deliveries

### Requirement: platform-integrations/non-blocking-delivery
Depends on: game-lifecycle/teardown-after-persistence, global-invariants/game-instance-hermeticity#no-egress-before-game-end.

Webhook delivery SHALL never block or delay the game lifecycle: a slow, failing, or unresponsive subscriber SHALL NOT delay a game's transition to `playing` or `finished`, nor the persistence of its record, nor its instance's teardown. Lifecycle handling SHALL complete on its own terms with deliveries proceeding after it, independently — reachable at all because no subscriber ever sits inside a game instance's own terminal path.

#### Scenario: #unresponsive-subscriber-harmless
- **WHEN** a subscriber hangs or fails while a game finishes
- **THEN** the game still reaches `finished`, its record is persisted, and its instance is torn down on the normal schedule — only the webhook's own retries linger
