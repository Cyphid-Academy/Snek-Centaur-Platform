## Purpose

An admin automates the platform from outside the first-party application:
the HTTP API through which Centaur Teams, rooms, games, and webhook
subscriptions are administered programmatically; the admin-only API keys
that authorize it; and the webhooks by which external systems learn that
games have started and finished. This capability owns the integration
surface itself — who may hold a key, what a key can and cannot reach, the
custody hygiene around key material, and the delivery semantics of event
notifications. The platform behaviour reached *through* the surface — team
management, rooms, game launch — is owned by the capabilities that own
those workflows; this capability guarantees the surface is a second door
to the same rules, never a second set of rules.

Depends on: identity-and-authorization, game-lifecycle.

## ADDED Requirements

### Requirement: platform-integrations/admin-api-keys
Every request to the platform's HTTP API SHALL be authorized by a bearer API key. API keys SHALL be an admin-only affordance: only holders of the platform admin role (identity-and-authorization/platform-admin-role) may create keys, and each key is bound permanently to the creating admin's user record — never transferable. A valid key's scope SHALL be global, never scoped down to a team, room, or game. A request SHALL be rejected when its key is missing, invalid, or revoked, and validation SHALL re-check on every request that the key's creator currently holds the admin role, so a key whose creator has lost admin standing stops working without needing separate revocation.

#### Scenario: #creator-no-longer-admin
- **WHEN** a request presents a valid, unrevoked key whose creating admin has since lost the admin role
- **THEN** the request is rejected — the admin check is made against the creator's current standing on every request, never cached from creation time, and the key works again only if the creator regains the role

#### Scenario: #key-follows-its-creator-only
- **WHEN** any attempt is made to rebind a key to a different user, or to create a key on behalf of someone other than the authenticated admin creating it
- **THEN** it is refused — a key's authority is exactly its creator's, for the key's whole life

### Requirement: platform-integrations/key-custody
The platform SHALL store API keys only in a form from which the key material cannot be recovered, in a persistent per-key record capturing at minimum: the one-way digest of the key material, a human-chosen label, the creating admin's user record, the creation timestamp, and a revocation timestamp that is null until the key is revoked. The plaintext of a newly created key SHALL be disclosed exactly once, at creation, to its creator — with an explicit affordance to copy it before the disclosure is dismissed — and SHALL never be stored, displayed, or transmitted afterwards, this being the designed one-time disclosure of identity-and-authorization/client-credential-custody.

#### Scenario: #plaintext-shown-exactly-once
- **WHEN** an admin creates a key
- **THEN** the plaintext appears once, at creation, with a copy affordance; once the disclosure is dismissed the plaintext is unrecoverable by anyone — creator, other admins, or the platform itself, which holds only the digest

#### Scenario: #metadata-only-ever-after
- **WHEN** a key is listed or inspected at any time after creation
- **THEN** only its label and metadata are presented — no surface re-displays, exports, or transmits the plaintext or any recoverable form of it

### Requirement: platform-integrations/key-management
The platform SHALL give admins the means — through the first-party application and through the HTTP API itself — to create API keys and to revoke them. The management surface SHALL list the admin's active and revoked keys with each key's label, creation timestamp, and revocation timestamp where applicable, and SHALL communicate that a key carries its creator's global admin authority and stops working if the creator loses the admin role. Revocation SHALL take effect immediately — every subsequent request presenting the revoked key is rejected — and revoked key records SHALL be retained, never deleted, so the history of what keys existed, who created them, and when they were revoked remains auditable.

#### Scenario: #revocation-immediate
- **WHEN** a key is revoked while an integration is actively using it
- **THEN** the very next request presenting that key is rejected — there is no grace period and no window in which a cached validity outlives the revocation

#### Scenario: #revoked-records-retained
- **WHEN** a key has been revoked
- **THEN** its record persists with its revocation timestamp and still appears in the management listing — revocation ends the key's authority, never the audit trail of its existence

### Requirement: platform-integrations/key-capability-bounds
An API key SHALL never authorize: creating a human identity, performing any action that requires an interactive sign-in flow, issuing game access tokens, or reading or writing Centaur-subsystem state. The API's mutating reach SHALL be exactly the management surface of platform-integrations/http-api-surface — consistent with admin access being strictly observational over live game and Centaur state (identity-and-authorization/platform-admin-role), no API request ever acts inside a game.

#### Scenario: #never-a-gameplay-actor
- **WHEN** an API caller attempts by any means to act inside a live game — stage a move, mutate game state, or touch any Centaur-subsystem state
- **THEN** it is refused: no part of the API affords it, and no key's scope unlocks it

#### Scenario: #no-identity-creation
- **WHEN** an API caller attempts to create a human identity, or any action whose authorization inherently requires an interactive sign-in
- **THEN** it is refused — humans enter the platform only through sign-in, never through the API

### Requirement: platform-integrations/http-api-surface
The platform SHALL expose an HTTP API affording programmatic administration of, at minimum: Centaur Teams — listing and reading teams, creating a team, updating a team's attributes including its nominated server domain, and adding and removing members; rooms — listing and reading rooms with their current game, creating and updating a room, and enrolling and unenrolling teams; games — reading a game's state including its configuration, status, and final scores once finished, and starting a game in a room, which enters the same launch orchestration as a first-party start (game-lifecycle/launch-orchestration); webhook subscriptions — registering, listing, and deleting them; and API keys per platform-integrations/key-management.

#### Scenario: #api-start-is-a-real-launch
- **WHEN** a game is started through the API
- **THEN** the one launch orchestration runs — the same gates, the same freeze, the same provisioning — and the resulting game is indistinguishable from one started first-party

#### Scenario: #the-families-are-a-floor
- **WHEN** an external integrator administers teams, rooms, games, webhooks, or keys
- **THEN** each of these families is reachable programmatically with an API key alone — none of them requires falling back to the first-party application

### Requirement: platform-integrations/first-party-parity
Every mutation made through the HTTP API SHALL be subject to the same invariants and validation as the equivalent first-party action, enforced server-side at the function contract per identity-and-authorization/mutation-authorization. A key's global admin-level scope widens who may act — it never widens what the platform's rules permit: any state rule that would reject the equivalent first-party mutation SHALL reject the API mutation identically.

#### Scenario: #no-privileged-bypass
- **WHEN** an API mutation targets state the platform's rules currently hold immutable — for example a launched game's frozen configuration
- **THEN** it is rejected by the same rule that rejects the first-party attempt, with no API-only exemption

#### Scenario: #two-doors-one-rulebook
- **WHEN** any invariant enforced on the first-party surface is probed through the API under equivalent authority
- **THEN** it holds identically — a mutation acceptable through one surface and refused through the other is a violation, whichever direction the discrepancy runs

### Requirement: platform-integrations/webhook-subscriptions
The platform SHALL let API-key-authenticated callers register webhook subscriptions. Each subscription SHALL capture at minimum: a delivery URL, one or more event types drawn from the closed set `game_start`, `game_end`; a scope naming either one specific game or one specific room — a room-scoped subscription applying to every game hosted in that room; the API key under which it was created; and a creation timestamp. A subscription SHALL be revoked automatically when its owning key is revoked, and no notification SHALL be delivered to it for any event occurring after that revocation.

#### Scenario: #room-scope-follows-the-room
- **WHEN** a room-scoped subscription exists and a new game comes to be hosted in that room
- **THEN** the subscription covers the new game without re-registration — the scope names the room, not any one game

#### Scenario: #revoked-with-owning-key
- **WHEN** a subscription's owning key is revoked
- **THEN** the subscription dies with it: events occurring after the revocation produce no delivery to that URL, and the revoked key cannot be used to resurrect it

### Requirement: platform-integrations/lifecycle-event-notifications
The platform SHALL deliver a `game_start` notification for every game that transitions to `playing`, and a `game_end` notification for every game that transitions to `finished` (game-lifecycle/status-authority), to each active subscription whose event types include the event and whose scope matches the game or its room. A `game_start` payload SHALL include at minimum the game's id, its room's id, and the game's configuration; a `game_end` payload at minimum the game's id, its room's id, and the game's final scores. These SHALL be the only lifecycle events: in particular, no notification announces a game's creation — the first thing a subscriber hears about any game is its `game_start`, at the moment it enters `playing`.

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
Webhook delivery SHALL never block or delay the game lifecycle: a slow, failing, or unresponsive subscriber SHALL NOT delay a game's transition to `playing` or `finished`, nor the persistence of its record, nor its instance's teardown (game-lifecycle/teardown-after-persistence). Lifecycle handling SHALL complete on its own terms with deliveries proceeding after it, independently.

#### Scenario: #unresponsive-subscriber-harmless
- **WHEN** a subscriber hangs or fails while a game finishes
- **THEN** the game still reaches `finished`, its record is persisted, and its instance is torn down on the normal schedule — only the webhook's own retries linger
