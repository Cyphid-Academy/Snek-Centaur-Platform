## Purpose

Who someone is on the platform and what that identity may reach: the
provider account a human signs in with and the durable user record it is
linked to, the identity kinds (humans, Centaur Teams, external systems, and
the per-game participant identities derived from them), the platform admin
role, the issuers the platform trusts and the capabilities each may confer,
and every credential the platform's Convex deployment issues — human
sessions, the per-team, per-game credentials a Snek Centaur Server earns,
capability tokens for registered external systems, and the game access tokens under
which a game's SpacetimeDB instance admits operators, bots, spectators, and
coaches. This capability owns identity, credential issuance, and admission:
who may obtain access and on what terms. What an admitted participant then
does — operating a snake, watching the board, running a team — belongs to
the capabilities that own those workflows.

Depends on: global-invariants.

## ADDED Requirements

### Requirement: identity-and-authorization/identity-kinds
Depends on: global-invariants/authenticated-unambiguous-identity#identity-kind-is-decidable.

The platform SHALL recognize exactly three kinds of persistent identity — **human identities**, **Centaur Team identities**, and **external system identities** (a peer Cyphid system or an automation registered to act as itself) — plus **game-participant identities**: derived identities scoped to a single game, one per authenticated connection, in one of the roles operator, bot, spectator, or coach. Operator, spectator, and coach identities derive from a human identity; bot identities derive from a Centaur Team identity. The enumeration is closed so that every identity platform code meets falls in exactly one kind. A Centaur Team is the persistent competitive unit, identified by a platform-assigned id; the domain of the server operating it is recorded so its actions can be attributed, and is never an identity of its own.

#### Scenario: #server-domain-is-not-identity
- **WHEN** a Centaur Team changes the server domain it is operated from
- **THEN** the team's identity is unchanged — no new team identity is created, and the team's history, membership, and records remain attached

#### Scenario: #participants-are-derived
- **WHEN** a connection is admitted to a game in any role
- **THEN** its participant identity is a derivation — from the human identity or team game credential that obtained the access token — scoped to that one game, never a new persistent identity

### Requirement: identity-and-authorization/google-sign-in
Humans SHALL sign in exclusively with a Google account, and the platform SHALL maintain no independent credential store for humans. A successful sign-in SHALL produce a persistent session that survives page loads until it expires or the user signs out — persistent in the script-inaccessible cookie credential custody permits, never in storage a page can read — and sign-out SHALL terminate the session and revoke the client-held session credential, returning the client to the unauthenticated state.

#### Scenario: #google-account-specifically
- **WHEN** any human authentication path exists
- **THEN** it authenticates a Google account — the binding is deliberate, so supporting any other provider requires revising this requirement, never provider-neutral drift

#### Scenario: #no-human-shared-secrets
- **WHEN** the platform's stored state is examined
- **THEN** it contains no password, password hash, or other secret capable of authenticating a human directly

#### Scenario: #session-survives-reload
- **WHEN** a signed-in user reloads or reopens the application
- **THEN** their session is still established without a fresh sign-in, until it expires or is revoked

#### Scenario: #sign-out-clears-client-state
- **WHEN** a user signs out
- **THEN** the session is terminated and client-held session tokens are revoked; nothing retained by the client continues to authenticate

### Requirement: identity-and-authorization/substituted-provider-verification
Depends on: global-invariants/no-shared-secrets.

A deployment SHALL verify a human's provider assertion against the identity provider's own published material, and SHALL substitute other verification material for it only where that deployment's configuration explicitly names a substitute issuer and where it publishes its keys. The substitution SHALL reach the verification step alone: resolving the account, applying the linking policy, issuing the session, placing it in the client's custody, and every authorization decision taken afterwards SHALL be the platform's ordinary behaviour, indistinguishable from a sign-in the provider verified.

#### Scenario: #absence-of-configuration-is-production-behaviour
- **WHEN** a deployment carries no configuration naming a substitute
- **THEN** it verifies exactly as it does in production, and an assertion signed by anything else is refused as unverifiable — the production path is what runs when nothing has been switched on, rather than something a deployment must remember to switch off

#### Scenario: #only-the-verification-step-is-substituted
- **WHEN** a human whose assertion was verified against a configured substitute acts on the platform
- **THEN** the account they act as was created and linked by the platform's own rules under its own policy, and the session they hold was issued and stored by the platform's own mechanism

#### Scenario: #substituted-subjects-carry-no-privilege
- **WHEN** such a human is authorized for anything
- **THEN** the decision reads their identity exactly as it reads any other human's — how an assertion was verified settles who someone is, never what they may do

### Requirement: identity-and-authorization/linked-provider-credentials
Depends on: global-invariants/durable-identity-references, global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard.

A human's durable identity SHALL be their platform user record, and a provider account SHALL be a credential *linked* to it: the platform SHALL hold a linkage record naming the provider and the provider's immutable subject for that account, created with the user record at first sign-in. Authentication SHALL resolve a provider and subject to a user through that linkage alone. The mapping SHALL be one-to-one in both directions — one linked account per user, one user per linked account — and the platform SHALL afford no operation that repoints, replaces, or detaches a linkage.

#### Scenario: #one-provider-account-one-person-forever
- **WHEN** a provider account already linked to one user is presented for linking to another
- **THEN** it is refused, and two racing first sign-ins for the same account cannot both commit — whom an account belongs to is settled once, at first sign-in, and never revised

#### Scenario: #the-linkage-is-the-only-lookup
- **WHEN** an authenticated session is resolved to a user
- **THEN** it is resolved through the linkage record and nothing else: no other field of the user record identifies them to a provider, so the provider's subject appears in exactly one place

#### Scenario: #no-auto-linking-by-email
- **WHEN** an authentication presents an email address matching an existing user's
- **THEN** nothing is linked and no session is established for that user: whom an account belongs to is settled by the provider's subject alone, never inferred from a claim that can change or repeat

### Requirement: identity-and-authorization/authentication-required
Depends on: global-invariants/authenticated-unambiguous-identity#no-anonymous-mutation-path, global-invariants/single-convex-deployment.

Every affordance that reads or writes user-scoped state SHALL require an authenticated human identity — extending the platform-wide ban on anonymous mutation to reads; the only unauthenticated surface is sign-in itself plus public, non-user-specific views. The authenticated identity SHALL resolve to its persistent user record — the one anchor against which team membership, the admin role, credential ownership, and action attribution are determined.

#### Scenario: #unauthenticated-refused
- **WHEN** an unauthenticated visitor requests anything beyond sign-in and the public, non-user-specific views
- **THEN** the request is refused

#### Scenario: #user-record-anchors-authorization
- **WHEN** any authorization or attribution question is asked about a human actor
- **THEN** it is answered against the actor's resolved user record, and every action taken in the session is attributed to that record

### Requirement: identity-and-authorization/sole-credential-issuer
Depends on: global-invariants/credential-confinement#signing-keys-never-leave-convex, global-invariants/issuer-anchored-trust#recognition-is-not-authorization.

The platform's Convex deployment SHALL be the sole authorization server for the platform's own affordances and the sole issuer of every credential the platform's runtimes accept as authority — human sessions, Snek Centaur Servers' per-team game credentials, capability tokens for registered external systems, and game access tokens. A game's SpacetimeDB instance SHALL admit connections only on access tokens the platform issued, with no alternative admission mechanism. A credential another system issued SHALL be evidence of who is calling and never authority over platform resources.

#### Scenario: #no-alternative-admission
- **WHEN** a connection attempts admission to a game instance on any basis other than a platform-issued access token
- **THEN** it is refused — there is no secondary admission path

#### Scenario: #app-never-self-issues
- **WHEN** the web application or a Snek Centaur Server needs a game access token
- **THEN** it obtains one through the platform's issuance path; it never mints, forges, or re-derives one itself

#### Scenario: #peer-tokens-carry-no-platform-authority
- **WHEN** a registered peer system presents a credential its own deployment signed
- **THEN** the platform reads it as proof of who is calling and answers from the grants it holds for that peer; nothing the peer's own credential asserts about its authority is honoured

### Requirement: identity-and-authorization/service-principal-assertions
Depends on: global-invariants/no-shared-secrets, global-invariants/issuer-anchored-trust.

A non-human principal SHALL authenticate to the platform by presenting a short-lived assertion it signed with its own private key, naming itself, naming the platform's issuance endpoint as the only place it may be used, and carrying an identifier unique to that assertion. The platform SHALL verify the signature against public material published at the location recorded for that principal's registration, check the audience and expiry, and refuse any assertion whose identifier it has already accepted.

#### Scenario: #unregistered-principal-refused
- **WHEN** an assertion arrives from a principal the platform holds no registration for
- **THEN** it is refused: a valid signature over a well-formed assertion proves only that someone holds a key

#### Scenario: #replayed-assertion-refused
- **WHEN** a captured assertion is presented a second time, still within its lifetime
- **THEN** it is refused — each assertion is accepted once, and the record of accepted identifiers is expired on the assertion lifetime rather than retained indefinitely

#### Scenario: #rotation-needs-no-coordination
- **WHEN** a principal rotates its signing key
- **THEN** it publishes the new public material alongside the old and switches; the platform re-reads the published material on meeting a key it does not know, so nothing about the registration changes and no exchange with the platform is required

### Requirement: identity-and-authorization/trusted-issuer-registry
Depends on: global-invariants/issuer-anchored-trust.

The platform SHALL hold a registry of the issuers it trusts — its own deployment and zero or more registered external systems — each recorded with an issuer identifier, the location at which that issuer publishes its verification material, the ceiling of capabilities it may confer, and, for a principal humans are returned to after signing in, the addresses at which it may receive them. The registry SHALL hold no secret for any issuer. A request for capabilities outside the requesting issuer's ceiling SHALL be refused with the excess named, never quietly narrowed to the permitted subset.

#### Scenario: #excess-fails-loudly
- **WHEN** a caller requests more capability than its issuer's ceiling allows
- **THEN** the request is refused and the excess is named; narrowing silently would surface later as an unexplained runtime failure far from the misconfiguration that caused it

#### Scenario: #registry-holds-no-secret
- **WHEN** an issuer is registered
- **THEN** everything recorded is public — an identifier, where its material is published, a ceiling, and any addresses humans may be returned to; the record has no field a secret could occupy

#### Scenario: #the-set-is-never-assumed-singular
- **WHEN** any code resolves the issuer of a presented credential
- **THEN** it resolves against the registry as a set, so registering a second issuer requires no change to how credentials are validated

### Requirement: identity-and-authorization/sign-in-handoff
Depends on: global-invariants/credential-confinement, global-invariants/issuer-anchored-trust#recognition-is-not-authorization.

A Snek Centaur Server SHALL NOT authenticate a human itself. Where a human's identity must reach a Server application, the platform SHALL complete the sign-in at its own origin and return the browser to that Server carrying a handoff reference: an opaque value naming one authenticated human and one registered Server, accepted once, expiring on the redirect it exists to survive rather than on a credential's lifetime, and conferring nothing on its own. The platform SHALL return a browser only to an address that Server's registration records, and SHALL issue the resulting credential only to the party that redeems the reference and proves itself the party it was minted for.

#### Scenario: #server-never-holds-the-provider-exchange
- **WHEN** a human signs in to use a Server application
- **THEN** the provider's authorization code and the platform's session credential stay at the platform's origin; the Server sees neither, and what a handoff reference can be exchanged for is bounded by that Server's registered ceiling

#### Scenario: #reference-is-accepted-once
- **WHEN** a handoff reference is presented a second time, whatever its remaining lifetime
- **THEN** it is refused — a value that travelled in a URL is assumed to have been seen, so its defence is that redeeming it takes something the URL did not carry

#### Scenario: #return-address-is-registered-not-requested
- **WHEN** a sign-in names a return address the requesting Server's registration does not record
- **THEN** the platform refuses to redirect there; taking the target from the request would make the platform a trusted-looking bounce to anywhere and hand the reference to whoever asked for it

#### Scenario: #the-redeemer-keeps-what-it-earns
- **WHEN** a handoff reference is redeemed
- **THEN** the credential is returned in that exchange to the redeeming party and relayed onward to nobody — a party that redeems on a human's behalf holds a credential it may use, never one it may pass along

### Requirement: identity-and-authorization/capability-claim-structure
Every credential the platform issues SHALL carry the capabilities it confers as a structured claim — a sequence of entries rather than an unstructured string — and enforcement SHALL read that structure from the first line of enforcement code written. An entry SHALL name one capability as a bare verb identifier and carry nothing else; the claim is a sequence so that constraining an entry later is a change to minting alone, and no entry carries a constraint today. Where a service principal obtained a credential to act with, the credential SHALL also name that principal — except a game access token, which SHALL NOT carry it, because a game instance authorises on role and team alone and no platform-side distinction travels into one.

#### Scenario: #structured-from-the-first-token
- **WHEN** an enforcement site reads a credential's capabilities
- **THEN** it reads entries, not a string it splits — so later constraining an entry changes minting alone, and no enforcement site, audit consumer, or external system's credential-reading code

#### Scenario: #uniform-today-attenuable-tomorrow
- **WHEN** a Snek Centaur Server's game credential for a team is issued
- **THEN** it carries the structured claim like every other credential, with the same value for every Server today — so narrowing one later adds a constraint rather than changing the shape of what every Server already reads

#### Scenario: #acting-principal-is-recorded
- **WHEN** an action is taken under a credential a service principal obtained
- **THEN** the platform can name that principal afterwards, because the record kept it — and, for every credential but a game access token, because the credential carried it too

### Requirement: identity-and-authorization/capability-registry
Every function the platform exposes publicly SHALL declare the capability that reaches it, explicitly and never derived from where its code lives, and the declaration SHALL be total: a public function with no declared capability SHALL fail the build. A capability SHALL grant reachability only — the function's own authorization decision runs regardless of how broadly the caller was scoped.

#### Scenario: #unregistered-function-fails-the-build
- **WHEN** a public function is added without declaring its capability
- **THEN** the build fails; the registry is complete by construction, not by review, because a function reachable under no declared capability is the one nobody notices

#### Scenario: #capabilities-are-declared-not-derived
- **WHEN** two functions of different risk sit in the same module
- **THEN** they may belong to different capabilities — grouping follows what a function does, never where it lives, because module structure is organised for developers

#### Scenario: #reachability-is-not-authorization
- **WHEN** a broadly scoped credential reaches a function
- **THEN** the function still decides whether this caller may do this thing; no handler may treat the capability as having settled the question

#### Scenario: #naming-one-function-is-a-contract
- **WHEN** a grant names an individual function rather than a capability group
- **THEN** the grant is recorded as unstable, so renaming that function is knowable in advance as a breaking change for whoever holds it

### Requirement: identity-and-authorization/anonymous-reach
Depends on: global-invariants/authenticated-unambiguous-identity#no-anonymous-mutation-path.

A capability SHALL be reachable by a caller presenting no platform credential only where what it exposes is specific to no principal, or where the call carries its own proof of who is making it — a proof that does not depend on a credential the platform issued. Anonymous reach SHALL be a declared property of a capability, recorded in the same place the capabilities themselves are, so that the reach of every capability is read from one enumeration rather than assembled from a second list that could disagree with it. A capability that declares no reach SHALL NOT be anonymously reachable. The same rule SHALL govern every other class of caller whose reach is declared — in particular, the capabilities a human's session confers SHALL be declared on the capability itself and never assembled as a separate list. Exactly four capabilities are anonymously reachable: reading the platform's liveness, exchanging a signed assertion for a credential, redeeming a sign-in handoff reference, and beginning a sign-in. Adding a fifth is a revision of this requirement, never a change to code alone.

#### Scenario: #liveness-exposes-no-principal
- **WHEN** an unauthenticated caller reads the platform's liveness
- **THEN** it is answered, because the answer is the same for everyone and names nobody — there is no principal-specific state for a credential to protect

#### Scenario: #assertion-exchange-proves-itself
- **WHEN** a non-human principal presents a signed assertion in order to obtain its first credential
- **THEN** the call is reachable without a credential, because requiring one would be circular; what stands in for it is the signature over the assertion, checked against the material that principal's registration records

#### Scenario: #handoff-redemption-proves-itself
- **WHEN** a party redeems a sign-in handoff reference
- **THEN** the call is reachable without a credential, because the credential is what redemption exists to obtain; what stands in for it is the reference together with proof of being the party it was minted for

#### Scenario: #sign-in-entry-exposes-no-principal
- **WHEN** a browser that has never signed in asks the platform to begin a sign-in on a Server's behalf
- **THEN** the call is reachable without a credential, because it is what a caller who has none arrives at first; the entry decides only whether the naming Server and the address it asks to be returned to are registered, which the registry already holds in public, and answers every caller alike because there is no caller yet for the answer to be specific to

#### Scenario: #session-reach-is-declared-with-the-capability
- **WHEN** the capabilities a human's session confers are determined
- **THEN** they are read from the capability enumeration itself; a list maintained beside it is not a permitted implementation, for the reason it is not one here — a second list is a thing that can disagree, and a field is not

#### Scenario: #credentialed-by-default
- **WHEN** a capability is added without declaring its reach
- **THEN** it is not anonymously reachable — the default is the safe one, so forgetting to think about reach denies access rather than granting it, and widening reach is always a visible act

#### Scenario: #anonymous-caller-has-no-kind
- **WHEN** a caller presenting no credential reaches an anonymously reachable capability
- **THEN** no check of principal kind is applied to it, because it is not a principal at all: what it may reach was settled entirely by the capability's declared reach, and there is no identity for a kind to be a property of

### Requirement: identity-and-authorization/principal-kind-gating
Depends on: global-invariants/authenticated-unambiguous-identity#identity-kind-is-decidable.

Every public function SHALL declare which kinds of principal it accepts, and SHALL itself refuse a caller of an undeclared kind however broad that caller's capabilities. The capability check and the kind check are distinct and ordered: whether a credential reaches a function at all is decided from its capabilities first, and acceptance of the caller's kind is decided after, by the function. Accepting human identities alone SHALL be the default a function departs from explicitly, so a function is reachable by a service principal only where it declares that kind — and the functions behind the platform's documented programmatic surface SHALL declare it. Administering a team — re-homing it, changing its membership or captaincy, altering its identity, entering or leaving rooms — SHALL exclude the Centaur Team principal, whose whole authority exists to operate that team in play. Changing authentication configuration SHALL be declared reachable by human identities alone.

#### Scenario: #a-service-principal-cannot-administer-a-team
- **WHEN** the Snek Centaur Server operating a team attempts to re-home it, alter its roster, transfer captaincy, or change its identity
- **THEN** it is refused on principal kind: a compromised Server can play badly with snakes the team already owns, and can neither lock the team's captains out nor move the team to a domain of its own choosing

#### Scenario: #kind-is-checked-independently-of-capability
- **WHEN** a principal of a barred kind presents a credential whose capabilities include the operation
- **THEN** the call is still refused; the two checks are independent and both must pass — the capabilities decided only that the function was reachable

#### Scenario: #service-reach-is-declared-never-inferred
- **WHEN** a registered external system holds a capability naming a function that declares human identities alone
- **THEN** the call is refused on kind: breadth of capability never implies acceptance of kind, so widening what a system can reach means a function declaring the additional kind, never a wider ceiling

### Requirement: identity-and-authorization/peer-capability-ceiling
Depends on: global-invariants/issuer-anchored-trust#ceiling-is-checked-at-the-resource.

No external system's ceiling SHALL include operations that destroy platform state, issue credentials for a human, or change authentication configuration, regardless of what a user that system acts for could do directly. The exclusion SHALL be read against what a capability reaches in combination with the others the same principal may hold, never against a single step in isolation: a capability that begins an exchange another completes is excluded with the one that completes it.

The platform SHALL additionally bound the rate at which each registered system changes platform state, charging that bound in the same transaction as the change it admits, and SHALL be able to show a user which actions on their behalf were taken through which system.

#### Scenario: #no-chain-reaches-what-one-step-may-not
- **WHEN** a registered system holds only capabilities its ceiling permits
- **THEN** no sequence of them obtains or renews a credential naming a human — otherwise the ceiling bounds each step while permitting the outcome every step was excluded to prevent

#### Scenario: #ceiling-sits-below-the-user
- **WHEN** an external system acts for a user who could perform an excluded operation themselves
- **THEN** the system still cannot: the exclusion is a property of the system, and it is the only control that shrinks what a compromised peer can do rather than merely shortening how long it can do it

#### Scenario: #attribution-is-user-visible
- **WHEN** a user reviews the actions taken on their account
- **THEN** those taken through an external system are identified as such, and by which system

#### Scenario: #the-bound-is-charged-where-the-change-is-made
- **WHEN** a registered system makes a call that changes platform state
- **THEN** the bound is checked and spent in the transaction performing the change, so a system cannot exceed it by issuing calls faster than the count settles — a bound checked anywhere else is one two concurrent calls can both pass

#### Scenario: #read-volume-is-bounded-outside-the-capability-system
- **WHEN** a registered system issues reads that change nothing
- **THEN** its volume is bounded by the deployment's own request limits rather than by this ceiling, and no per-system count is charged for them — charging one would make every read a write, which costs more in contention and latency than the load it is meant to contain, and read protection therefore belongs at the deployment edge where it does not sit inside a transaction

### Requirement: identity-and-authorization/verification-without-shared-secrets
Depends on: global-invariants/game-instance-hermeticity, global-invariants/no-shared-secrets.

The platform SHALL publish, at stable well-known addresses, the verification material for the credentials it signs — sufficient for a game's SpacetimeDB instance, a Snek Centaur Server, or any other party to validate them entirely on its own. Self-sufficient validation is what a hermetic instance requires. A validating party SHALL pin the issuer that material belongs to alongside the material itself, and SHALL resolve verification material only from what it already holds — never from a location the credential under examination names.

#### Scenario: #instance-validates-alone
- **WHEN** a game's instance validates an access token
- **THEN** it does so using only the published verification material it obtained at startup, consulting nothing else and no one else

#### Scenario: #a-valid-signature-from-a-stranger-is-refused
- **WHEN** a token names an issuer other than the pinned one, and that issuer publishes resolvable verification material of its own
- **THEN** it is refused on the issuer alone: a signature that verifies against material the token led the validator to is not a signature the platform made, so verifying a signature and knowing who signed it are two checks and not one

#### Scenario: #same-material-platform-wide
- **WHEN** a new game instance comes into existence
- **THEN** no new verification arrangement is negotiated; the platform-wide published material already covers its tokens

### Requirement: identity-and-authorization/audience-bound-tokens
Every credential the platform issues SHALL name the exact resource it may be used at, and every resource SHALL refuse a credential naming another — checking the binding before anything else about the credential is considered. A credential is therefore inert everywhere but where it was meant to be used.

#### Scenario: #wrong-audience-refused
- **WHEN** a credential issued for one resource — a particular game's instance, the platform's own functions, another system — is presented at a different one
- **THEN** it is refused on the binding alone, whatever capabilities it carries and however valid its signature

#### Scenario: #compromise-contained
- **WHEN** an issued credential leaks
- **THEN** what it reaches is one named resource for the few minutes of its life and nothing anywhere else — which is what makes a single signing arrangement behind all of the platform's credentials safe, rather than a concentration of risk

### Requirement: identity-and-authorization/game-token-contents
Depends on: global-invariants/authenticated-unambiguous-identity#identity-kind-is-decidable, global-invariants/durable-identity-references#derived-identities-inherit-durability.

Every game access token SHALL be signed by the platform and SHALL carry, at minimum: the specific game it grants admission to, a subject naming the holder by the platform's own durable identifier for it and encoding the holder's role (operator, bot, spectator, or coach) with its identity binding — the acting human for operators, the Centaur Team for bots, and for coaches both the human and the team whose view the token grants; spectator tokens carry no team binding — and an expiry beyond which the token is not accepted. An operator token SHALL bind the acting human and no team: the team an operator acts for is derived at admission from the roster snapshot the instance was seeded with, which keeps that snapshot the single source of truth for who plays for whom and leaves no second statement of it to disagree. The subject is what makes the admitted identity's kind and role decidable inside the instance, and the instance SHALL decide them from the identity it derived rather than by reading any other claim, whatever claim access its runtime affords.

#### Scenario: #token-names-its-game
- **WHEN** an access token issued for one game is presented to a different game's instance
- **THEN** admission is refused — the token's game binding is checked, not merely its signature

#### Scenario: #subject-alone-decides-the-role
- **WHEN** an instance must tell a spectator connection from an operator connection
- **THEN** the distinction is already in the identity it derived from the subject, so a read-only role is structural: the two are different identities, one of which the instance's seeded permissions simply do not name. No role record is consulted and no claim is read, so no coding error can promote a spectator to an actor

### Requirement: identity-and-authorization/connect-time-validation
Depends on: global-invariants/game-instance-hermeticity.

A game's SpacetimeDB instance SHALL validate a connection's access token exactly once, at connection time; the role and team association established then SHALL persist for the lifetime of that connection without re-validation. Once-only validation is the form validation must take in a hermetic instance, which makes no per-connection external call. Where the instance's runtime re-issues a presented credential as part of establishing the connection, the claims admission decides on SHALL be those the platform signed — issuer, game binding and subject carried through that exchange unaltered — or the platform credential SHALL reach admission by a path that performs no re-issuance.

#### Scenario: #expiry-never-disconnects
- **WHEN** an admitted connection's access token passes its expiry mid-game
- **THEN** the connection is not dropped — expiry bounds only the window for establishing connections, never the lifetime of an established one

#### Scenario: #reconnect-revalidates
- **WHEN** a client reconnects after an interruption
- **THEN** it presents a currently valid token and is validated afresh, exactly like a first connection

#### Scenario: #re-issuance-preserves-the-binding
- **WHEN** a connection is established through a runtime exchange that re-signs the presented credential under the runtime's own key
- **THEN** admission decides on the issuer, game binding and subject of the platform-issued credential; an exchange that does not carry them through admits nobody, because the claims reaching the decision would be the runtime's own rather than the platform's

### Requirement: identity-and-authorization/admission-validation
Depends on: global-invariants/game-instance-hermeticity#seeded-once-never-refreshed, global-invariants/authenticated-unambiguous-identity#instance-team-ids-resolve-uniquely.

At connection time the game's instance SHALL reject any connection whose token names an issuer other than the platform issuer it was seeded with, fails signature verification against that issuer's pinned material, names a different game, is past its expiry, binds a team that is not registered as a participant of this game, names a coach the seeded roster snapshot does not record as a coach of the team the token binds, or — where the token names an operator and so binds no team — names a human the seeded roster snapshot does not record on a participating team. Every one of those checks is answerable from state seeded at initialisation, and the participant check is decidable because a team identifier in a game's records denotes exactly one persistent team record. Rejection SHALL happen before any game state is touched: the client is disconnected and no admission or attribution record is written. Gameplay mutations SHALL be accepted only from admitted connections.

#### Scenario: #reject-before-touching-state
- **WHEN** a connection fails any admission check
- **THEN** it is disconnected with no state written — a rejected connection leaves no admission record, no attribution entry, and no other trace in game state

#### Scenario: #unregistered-team-refused
- **WHEN** a structurally valid token binds a team that is not a registered participant of this game
- **THEN** the connection is rejected

#### Scenario: #operator-absent-from-the-snapshot-refused
- **WHEN** a structurally valid operator token names a human the seeded roster snapshot does not record on a participating team
- **THEN** the connection is rejected — this is the operator's form of the participant check, and it is the only form there is for that role, because an operator token binds no team for the team check to fire on

#### Scenario: #coach-absent-from-the-snapshot-refused
- **WHEN** a structurally valid coach token names a human the seeded roster snapshot does not record as a coach of the team it binds
- **THEN** the connection is rejected — a coach token binds a human and a team, so the instance checks both halves against the snapshot; checking the team alone would admit any human as coach of any participating team

#### Scenario: #unadmitted-mutations-rejected
- **WHEN** a connection that was never admitted attempts move staging, turn declaration, or any other gameplay mutation
- **THEN** the operation is rejected

### Requirement: identity-and-authorization/role-bound-privileges
Depends on: global-invariants/team-granularity-authorization.

A connection's privileges within a game SHALL derive solely from its validated role and team binding — the only granularity the instance authorises at. For a bot or coach connection the bound team is the one its token names; for an operator connection the bound team is the one the seeded roster snapshot records the admitted human as playing for, derived at admission and never read from the token. Operator and bot connections may mutate only on behalf of their bound team; spectator and coach connections SHALL be refused by every state-mutating operation; and no distinction held outside the token — captaincy, admin standing, or any other platform-side role — SHALL grant a connection privileges within the game beyond its token's role.

#### Scenario: #spectator-and-coach-never-mutate
- **WHEN** a spectator or coach connection invokes any state-mutating operation
- **THEN** the operation is rejected — these roles are read-only inside a game

#### Scenario: #captaincy-invisible-in-game
- **WHEN** a team captain or platform admin connects to a game as an operator or coach
- **THEN** the instance grants exactly the token role's privileges — it neither knows nor honours captaincy, admin standing, or any other platform-side distinction

### Requirement: identity-and-authorization/admission-records-private
Depends on: global-invariants/game-instance-hermeticity#no-egress-before-game-end.

The records a game's instance keeps of admitted connections and their identity bindings SHALL never be readable by any client connection. They exist to enforce admission and attribute actions, not as gameplay data; the only reader is the platform's own privileged retrieval of the finished record, the instance's sole sanctioned egress.

#### Scenario: #no-subscription-reaches-admission-records
- **WHEN** any client connection — participant, spectator, or coach — queries or subscribes
- **THEN** no queryable or subscribable surface exposes the admission and attribution records

### Requirement: identity-and-authorization/participant-token-eligibility
The platform SHALL issue an operator access token only to an authenticated human who is, per the target game's roster snapshot, a member of a participating team; and a bot access token only to the holder of a valid game credential whose Centaur Team is registered to the target game.

#### Scenario: #operator-outside-roster-refused
- **WHEN** an authenticated human requests an operator token for a game whose roster snapshot does not include them on a participating team
- **THEN** issuance is refused

#### Scenario: #bot-token-requires-team-credential
- **WHEN** a bot access token is requested
- **THEN** it is issued only against a valid game credential, for that credential's own team, in that credential's own game

### Requirement: identity-and-authorization/spectator-tokens
Depends on: global-invariants/team-granularity-authorization#spectators-hold-no-private-state.

The platform SHALL issue spectator access tokens to any authenticated human who requests to spectate a game being played. A spectator token SHALL carry no team binding — which is what makes the connection a spectator connection, and so read-only and private-state-free.

#### Scenario: #any-authenticated-human-may-request
- **WHEN** any authenticated human — team member or not — requests to spectate a playing game
- **THEN** a spectator token is issuable to them; team membership is not a precondition

#### Scenario: #no-team-binding
- **WHEN** a spectator token is issued
- **THEN** it binds the spectating human and the game only — no team binding is ever attached to it, on request or by default

### Requirement: identity-and-authorization/coach-tokens
Depends on: global-invariants/team-granularity-authorization.

The platform SHALL issue a coach access token to an authenticated human who is a designated coach of a participating team — the platform admin counting as an implicit coach of every team — for a game being played. A coach token SHALL be bound to that team, SHALL grant read access to the game on the same filtered terms as a member of that team — the team-granularity view is the only view there is to grant — and SHALL confer no mutating privilege.

#### Scenario: #coach-reads-as-bound-team
- **WHEN** a coach connection is admitted
- **THEN** it receives the same filtered view of the game a member of the bound team would receive — read-only

#### Scenario: #coach-of-nonparticipating-team-refused
- **WHEN** a coach token is requested for a team that is not a participant of the target game
- **THEN** issuance is refused, however valid the coach designation

### Requirement: identity-and-authorization/token-lifetime-and-refresh
Depends on: global-invariants/state-confined-to-owning-runtime#game-instance-holds-only-its-games-state.

Every credential the platform issues SHALL expire fifteen minutes after issuance, and a holder SHALL be able to obtain a replacement without re-authenticating from scratch, so long as its underlying session or registration is still valid. A credential naming a human SHALL be renewable only while that human's own session is live, re-read at each renewal rather than inherited from the credential being replaced. Holders SHALL renew ahead of expiry on their own schedule, never in reaction to a refusal. Short lifetimes are what make a self-contained credential's revocation delay tolerable; the boundary that ends access after a game is the instance's decommissioning, not expiry.

#### Scenario: #refresh-without-reauth
- **WHEN** a holder needs a fresh credential during a long game — to reconnect after an interruption, or simply because the last one is ageing
- **THEN** they obtain one on the strength of their still-valid session or registration, with no interactive re-authentication

#### Scenario: #renewal-is-proactive-never-reactive
- **WHEN** a holder's credential approaches expiry during a live game
- **THEN** it is replaced before it lapses; discovering the expiry from a refused call is a violation, because the game's clock keeps running while that call is retried and a lost turn is a real cost

#### Scenario: #renewal-re-reads-the-session
- **WHEN** a holder renews a credential naming a human whose session has since ended
- **THEN** renewal is refused, whatever the holder's own registration still permits — a human's absence ends what is minted in their name, rather than being outlived by it

#### Scenario: #renewal-failure-is-quiet-until-it-bites
- **WHEN** renewal fails because the platform is briefly unreachable, while the credential in hand is still valid
- **THEN** the holder keeps retrying and says nothing: the failure is surfaced when the credential actually lapses and access is really lost, not while it is still working. A holder that cannot renew has no way to hand off or stand down either — that would take the same unreachable platform — so warning earlier would cost attention without offering an action

#### Scenario: #teardown-not-expiry-ends-access
- **WHEN** a game ends and its instance is decommissioned
- **THEN** every outstanding token for that game has nothing left to authenticate against, whatever its remaining lifetime

### Requirement: identity-and-authorization/game-credential-scope
Depends on: global-invariants/ephemeral-game-credentials, global-invariants/centaur-state-boundary.

A per-team game credential SHALL be scoped to exactly one Centaur Team and one game, and SHALL be non-transferable: the platform SHALL resolve every credential-authenticated call to the credential's own team and enforce that scope on every access. The credential SHALL grant exactly two capabilities — writes to that team's own Centaur-subsystem state, which holds nothing authoritative for game outcome, and requests for that team's bot access tokens — and nothing else.

#### Scenario: #not-valid-for-another-team
- **WHEN** a credential issued for team A is used in any attempt to read or write team B's state, or to obtain tokens for team B
- **THEN** the request is refused — possession of a credential grants nothing outside its named team

#### Scenario: #not-valid-for-another-game
- **WHEN** a credential issued for one game is presented in the context of any other game
- **THEN** it is refused — a server operating a team in two games at once holds two credentials, and neither reaches the other's game

#### Scenario: #grants-nothing-beyond-the-two
- **WHEN** a credential holder attempts anything beyond its team's Centaur-subsystem writes and bot-token requests — platform mutations, other teams' reads, roster changes
- **THEN** the request is refused

### Requirement: identity-and-authorization/live-game-issuance
Depends on: global-invariants/ephemeral-game-credentials.

The platform SHALL issue game access tokens only for a game currently being played, re-checking the game's status at the moment of the request and refusing when the game is finished or not yet started — regardless of the requester's remaining credential validity.

#### Scenario: #credential-dead-at-finish
- **WHEN** a game finishes while its participants' credentials and tokens remain cryptographically valid
- **THEN** the very next request under them is refused; liveness is re-checked per request, and remaining cryptographic validity confers nothing toward a game that has ended

#### Scenario: #no-tokens-for-finished-games
- **WHEN** any access token — operator, bot, spectator, or coach — is requested for a finished game
- **THEN** issuance is refused

### Requirement: identity-and-authorization/roster-snapshot-binding
Depends on: global-invariants/game-instance-hermeticity#seeded-once-never-refreshed.

Authorization for a game SHALL be bound by the roster snapshot taken when the game is initialized: which humans may obtain operator tokens, which humans are designated coaches of each participating team, and which Centaur Team identities participate. The snapshot SHALL bind for the entire game — the in-game authorization state of a running game SHALL never change in response to later mutations of team records, on the instance side because it is seeded once and never refreshed and on the platform side because issuance is answered from the snapshot.

#### Scenario: #running-game-reads-only-the-snapshot
- **WHEN** any team-record change occurs while one of the team's games is running
- **THEN** the running game's authorization — operator-token eligibility and participating identities — is still answered from the initialization snapshot, never from current team records

### Requirement: identity-and-authorization/platform-admin-role
Depends on: global-invariants/team-granularity-authorization, global-invariants/one-contract-many-surfaces#every-surface-hits-the-same-invariants, global-invariants/client-truthfulness#enablement-derives-from-server-state.

The platform SHALL support an **admin** role as a platform-level designation on the user record — never per-team and never per-server. An admin SHALL be able to read everything: browse all Centaur Teams, see all games across all teams, watch any replay, and hold implicit coach standing for every team's live games. Toward the authoritative state of a live game's runtime the role SHALL be read-only as a matter of principle, conferring no write path into a live game — a game instance honours no platform-side role at all. Over platform-held state the role is not barred in principle from mutation: the administrative powers an admin holds are exactly those granted expressly by requirement, and every expressly granted power remains subject to the same invariants that bind any other actor.

#### Scenario: #a-deployment-can-designate-its-first-admin
- **WHEN** a deployment holds no admin designation yet
- **THEN** it affords some means of designating one without a pre-existing admin — which means is mechanism, but a deployment that can never hold an admin grants none of the read breadth this role exists for

#### Scenario: #admin-reads-across-all-teams
- **WHEN** an admin browses teams, game history, or replays
- **THEN** membership filters do not apply — every team, every game, and every replay is visible to them

#### Scenario: #implicit-coach-everywhere
- **WHEN** an admin seeks read-only visibility into any live game from any team's perspective
- **THEN** they are treated as a coach of that team without explicit designation

#### Scenario: #no-write-path-into-live-games
- **WHEN** an admin attempts to act inside a live game — staging a move, holding a snake, or otherwise mutating the game runtime's authoritative state
- **THEN** the attempt is rejected; toward live games, admin standing is observational only

#### Scenario: #powers-are-expressly-granted
- **WHEN** an admin attempts a platform-state mutation that no requirement expressly grants the role
- **THEN** it is rejected exactly as for an ordinary user — admin standing alone confers no implicit edit access, and expressly granted powers obey every invariant that binds other actors

#### Scenario: #role-effective-without-reload
- **WHEN** a user's admin designation changes
- **THEN** admin affordances appear or disappear from the user record's current value without requiring a page reload or fresh session

### Requirement: identity-and-authorization/client-credential-custody
Depends on: global-invariants/credential-confinement, global-invariants/state-confined-to-owning-runtime#clients-restart-clean.

Clients SHALL hold received credentials — access tokens, game credentials — in memory only, for the duration of use, and SHALL never store, display, or transmit credential plaintext. The single exception is the session credential established at sign-in, which SHALL be held in a cookie the browser withholds from page scripts and sends only to the platform's own origin, over HTTPS: it is the one credential a page reload recovers, and every other credential is obtained afresh under it rather than persisted. A signing key a party generates for itself is the one thing it persists, and it never leaves the party that generated it.

#### Scenario: #memory-only
- **WHEN** the web application holds a game access token
- **THEN** the token lives in component memory only — never persisted to browser storage, never placed in a URL — and a page reload re-obtains a token rather than recovering one

#### Scenario: #the-session-is-the-only-thing-a-reload-recovers
- **WHEN** a signed-in user reloads the page
- **THEN** the session cookie is the only credential that survived, and no page script could read it while it did; every access token and game credential the page needs is obtained again under it

#### Scenario: #own-key-is-the-only-thing-at-rest
- **WHEN** a Snek Centaur Server restarts
- **THEN** what it recovers is its own signing key, from which it earns fresh credentials; no credential it was issued survived the restart

### Requirement: identity-and-authorization/mutation-authorization
Depends on: global-invariants/authenticated-unambiguous-identity#no-anonymous-mutation-path, global-invariants/one-contract-many-surfaces#every-surface-hits-the-same-invariants.

Every function that mutates platform-held state SHALL reject the call when its authenticated caller lacks the right to perform it, and SHALL decide that from the authenticated identity at the function contract. Callers arrive already authenticated and the contract is the same for every surface; what this requirement adds is that the right to mutate is decided there.

#### Scenario: #ui-gating-is-not-enforcement
- **WHEN** a client bypasses the interface and invokes a mutating function directly
- **THEN** the same server-side authorization check applies and rejects an unauthorized caller
