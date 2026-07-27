## ADDED Requirements

### Requirement: global-invariants/no-shared-secrets
Authentication within the platform's own trust chain — the Convex deployment, a game's SpacetimeDB instance, a Snek Centaur Server, a registered external system — SHALL rest on asymmetric signatures alone: a credential is either an assertion the presenting party signed with a private key it alone holds, or a token an authority signed for it, and in both cases the receiver decides by verifying the signature against published public material rather than by comparing against a stored copy. No symmetric key, client secret, or long-lived bearer key SHALL be generated, stored, transmitted, or seeded anywhere to authenticate a party in that chain. Where the platform is instead the *client* of a third-party service whose protocol admits no asymmetric client authentication, the secret that protocol requires MAY be held: it SHALL authenticate the platform outward to that one service only, SHALL confer no authority inside the trust chain, and SHALL never stand in for a credential this invariant governs.

#### Scenario: #no-secret-at-rest
- **WHEN** any runtime's stored state is examined for what would let it authenticate as, or on behalf of, another party in the trust chain
- **THEN** it holds only its own private key and other parties' public material — nothing it shares with anyone, so disclosure of everything it holds forges no credential the platform would honour

#### Scenario: #third-party-protocols-may-require-a-secret
- **WHEN** the platform integrates a third-party service whose protocol requires a shared client secret — a consumer identity provider's authorization-code exchange, for example
- **THEN** that secret may be held, scoped to that service alone: it proves the platform is itself to an outside party, grants nothing to anyone inside the chain, and cannot be presented to any resource holder here as authority

#### Scenario: #no-secret-configured-into-a-component
- **WHEN** a new party joins the trust chain — a game instance, a Snek Centaur Server, an external system, an automation
- **THEN** nothing secret is generated for it, sent to it, or configured into it: it holds a key it generated and publishes the public half, and registering it means recording where that public material is found

### Requirement: global-invariants/issuer-anchored-trust
Every party holding a protected resource — the platform's Convex deployment, a game's SpacetimeDB instance, a Snek Centaur Server — SHALL define what it trusts as a set of issuers, each recorded together with the public material verifying its signatures and the ceiling of capabilities it may confer, and SHALL honour a presented credential only for capabilities within its issuer's recorded ceiling. Recognising an issuer's signature SHALL establish only that the credential is authentic; what the credential claims about its own authority is never the answer.

#### Scenario: #ceiling-is-checked-at-the-resource
- **WHEN** a credential arrives carrying capabilities beyond its issuer's recorded ceiling
- **THEN** the resource holder refuses them itself — the ceiling is enforced where the resource lives, never delegated to the issuer's self-restraint, because the case it exists for is an issuer that has stopped restraining itself

#### Scenario: #recognition-is-not-authorization
- **WHEN** an issuer is added to a resource holder's trust set
- **THEN** nothing already protected becomes reachable by that act alone; every capability the issuer may confer is recorded explicitly alongside it, so trusting one more issuer can never silently widen what the resource holder exposes

#### Scenario: #authority-only-narrows
- **WHEN** an issuer mints a credential for one caller and one purpose
- **THEN** it may name any subset of its own ceiling and nothing outside it; delegation at any depth narrows, and no hop in a chain holds more than the hop before it

### Requirement: global-invariants/durable-identity-references
Every identity that any runtime records or transmits — in credentials, in game records, in attributions, in logs — SHALL be named by the platform's own durable identifier for it, never by an external provider's subject, an email address, or any other attribute the platform does not control. An external credential's own identifiers SHALL appear only where that credential is being resolved to the identity behind it.

#### Scenario: #provider-change-breaks-no-record
- **WHEN** the external credential behind a human identity is replaced with a different one
- **THEN** every record naming that human still resolves to them, because none of them ever named the credential — the replacement touches only the credential's own record

#### Scenario: #derived-identities-inherit-durability
- **WHEN** another runtime derives its own identity for a principal from a presented credential's subject
- **THEN** that derived identity is stable across any change of the principal's external credentials, because the subject carried the platform's durable identifier rather than the provider's

## MODIFIED Requirements

### Requirement: global-invariants/ephemeral-game-credentials
A Snek Centaur Server SHALL hold platform credentials only per hosted team and per game, only short-lived, and only earned afresh: each names one team and one game, expires within minutes, and is obtainable only by the Server proving control of the domain that team has named as its home. A Server SHALL hold no credential spanning two hosted teams, none spanning two games, and no privilege of its own; platform data shown to a visitor comes through the visitor's own connection, never the Server's.

#### Scenario: #no-credentials-at-rest
- **WHEN** no game a Server hosts is active
- **THEN** it holds no platform credential, no game connection, and no subscription of its own; what it keeps at rest is its own signing key, from which it earns credentials again when a game needs it to

#### Scenario: #credentials-are-earned-afresh
- **WHEN** a Server's credential for a hosted team's game expires mid-game
- **THEN** it obtains another only by proving control of that team's home domain again — nothing it holds at rest authenticates it, so a Server that loses its standing to operate a team stops operating it within one credential's lifetime

#### Scenario: #no-standing-server-privilege
- **WHEN** a Server is examined for what it may do in its own right
- **THEN** it may do nothing: every credential it holds confers authority for one hosted team, and names the Server only so the team's actions can be attributed to the domain that took them

#### Scenario: #per-team-credentials-never-merge
- **WHEN** a Server hosts several teams in one game
- **THEN** it acts for each team only under that team's own credentials — co-tenancy never merges into a broader privilege

### Requirement: global-invariants/access-follows-identity
A user's read access to platform data SHALL be determined solely by their own platform identity and never by which Snek Centaur Server they visit — every Server serves the same web application backed by the one platform Convex deployment, so a user sees the same data everywhere — and no Server deployment SHALL hold platform privilege that any other lacks.

#### Scenario: #same-data-regardless-of-server
- **WHEN** the same user opens two different Snek Centaur Servers
- **THEN** they see the same platform data — access followed their own platform identity through their own connection, not the Server

#### Scenario: #reference-deployment-has-no-special-privilege
- **WHEN** a Cyphid-operated Server serves the platform — the socially-canonical reference deployment among them
- **THEN** it uses the same platform APIs as any other Server, with no special privilege, and another community may run its own platform deployment and canonical Server

### Requirement: global-invariants/authenticated-unambiguous-identity
Every action that stages moves or mutates game, platform, or Centaur state SHALL be performed under an authenticated identity, and the kind of any identity platform code observes — human, Centaur Team, external system, or derived game participant — SHALL be unambiguous and drawn from a closed enumeration. A team identifier seeded into a game instance SHALL denote exactly one persistent platform team record for that game's entire lifetime.

#### Scenario: #no-anonymous-mutation-path
- **WHEN** a connection or call without an authenticated identity attempts any state-mutating action on any runtime
- **THEN** it is refused; no anonymous staging, game-state, platform-state, or Centaur-state mutation path exists

#### Scenario: #identity-kind-is-decidable
- **WHEN** platform code on any runtime receives an identity
- **THEN** the identity's kind is decidable without guesswork; no code path is obligated to handle an identity that could be more than one kind

#### Scenario: #instance-team-ids-resolve-uniquely
- **WHEN** any runtime resolves a team identifier found in a game's records, live or historical
- **THEN** it reaches exactly one persistent team record, the same one for the game's whole lifetime — the mapping never dangles, changes, or becomes ambiguous mid-game

### Requirement: global-invariants/credential-confinement
Private key material SHALL never leave the party that generated it: the keys signing the platform's tokens stay inside the platform's Convex deployment, a Snek Centaur Server's signing key stays on that Server, and every other party validates using published public material alone. An issued credential SHALL be returned only to the party whose own authentication earned it, in the response to that exchange, and SHALL travel on no other channel.

#### Scenario: #signing-keys-never-leave-convex
- **WHEN** any other runtime must validate a platform-issued token
- **THEN** it does so with the published public verification keys; the private signing material is never transmitted outside the platform's Convex deployment, on any channel, for any purpose

#### Scenario: #every-party-keeps-its-own-key
- **WHEN** a party in the trust chain authenticates by signing
- **THEN** the key it signs with was generated where it lives and has never been transmitted; what every other party holds of it is the published public half

#### Scenario: #credentials-return-only-to-the-requester
- **WHEN** a credential is issued
- **THEN** it reaches its holder in the response to the exchange that authenticated the request, and appears in no other response, page, message, or transmission

### Requirement: global-invariants/one-contract-many-surfaces
Every mutation of platform or Centaur state, from any surface — the web application, any programmatic surface, or a Server acting under a hosted team's credentials — SHALL be dispatched against the owning runtime's server-side function contract and be subject to identical invariants; no surface has a private bypass. A human SHALL act against that contract directly, under their own identity and connection — never routed through, impersonated by, or acting on a credential held by any service component, their team's Server included.

#### Scenario: #every-surface-hits-the-same-invariants
- **WHEN** the same invariant-violating mutation is attempted from the web application and from a programmatic surface
- **THEN** both are rejected by the same server-side contract; parity is a property of the contract, not of each client's restraint

#### Scenario: #operators-never-proxy-through-the-server
- **WHEN** an operator reads or mutates Centaur state
- **THEN** they do so through their own connection under their own identity; no service component is an intermediary, and none can act as them
