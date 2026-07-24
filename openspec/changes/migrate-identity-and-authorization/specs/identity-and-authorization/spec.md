## Purpose

Who someone is on the platform and what that identity may reach: signing in
with a Google account, the identity kinds (humans, Centaur Teams, and the
per-game participant identities derived from them), the platform admin
role, and every credential Convex issues — persistent sessions, per-team
game credentials, and the game access tokens under which a game's
SpacetimeDB instance admits operators, bots, spectators, and coaches. This
capability owns identity, credential issuance, and admission: who may
obtain access to a game and on what terms. What an admitted participant
then does — operating a snake, watching the board, running a team — belongs
to the capabilities that own those workflows.

Depends on: (none — root alongside game-engine).

## ADDED Requirements

### Requirement: identity-and-authorization/identity-kinds
The platform SHALL recognize exactly two kinds of persistent identity — **human identities** and **Centaur Team identities** — plus **game-participant identities**: derived identities scoped to a single game, one per authenticated connection, in one of the roles operator, bot, spectator, or coach. Operator, spectator, and coach identities derive from a human identity; bot identities derive from a Centaur Team identity via its game credential. A Centaur Team is the persistent competitive unit, identified by a platform-assigned id; its nominated server domain is configuration, not identity.

#### Scenario: #server-domain-is-not-identity
- **WHEN** a Centaur Team's nominated server domain changes
- **THEN** the team's identity is unchanged — no new team identity is created, and the team's history, membership, and records remain attached

#### Scenario: #participants-are-derived
- **WHEN** a connection is admitted to a game in any role
- **THEN** its participant identity is a derivation — from the human identity or team game credential that obtained the access token — scoped to that one game, never a new persistent identity

### Requirement: identity-and-authorization/google-sign-in
Humans SHALL sign in exclusively with a Google account, via Google OAuth integrated with Convex; the platform maintains no independent credential store for humans. A successful sign-in SHALL produce a persistent session that survives page loads until it expires or the user signs out, and sign-out SHALL terminate the session and revoke client-held session tokens, returning the client to the unauthenticated state.

#### Scenario: #google-account-specifically
- **WHEN** any human authentication path exists
- **THEN** it authenticates a Google account — the Google binding is deliberate (Google-account email addresses serve as stable identifiers in systems beyond this platform), so supporting any other provider requires revising this requirement, never provider-neutral drift

#### Scenario: #session-survives-reload
- **WHEN** a signed-in user reloads or reopens the application
- **THEN** their session is still established without a fresh sign-in, until it expires or is revoked

#### Scenario: #sign-out-clears-client-state
- **WHEN** a user signs out
- **THEN** the session is terminated and client-held session tokens are revoked; nothing retained by the client continues to authenticate

### Requirement: identity-and-authorization/email-as-canonical-identity
A human SHALL be identified canonically by the email address of their Google account: any two successful authentications yielding the same email are the same human identity, irrespective of other provider-side attributes. The platform SHALL store no passwords, password hashes, or shared secrets that could authenticate a human outside Google sign-in.

#### Scenario: #same-email-merges
- **WHEN** a human authenticates and a platform identity already exists for that email
- **THEN** the sign-in attaches to the existing identity — no duplicate is created

#### Scenario: #email-fork-keeps-history
- **WHEN** a Google account's email address changes at the provider
- **THEN** subsequent sign-ins under the new email are a new, distinct human identity, and the prior email's identity remains attached to all of its historical state — memberships, attributions, replays — with no migration

#### Scenario: #no-human-shared-secrets
- **WHEN** the platform's stored state is examined
- **THEN** it contains no password, password hash, or other shared secret capable of authenticating a human directly

### Requirement: identity-and-authorization/authentication-required
Every affordance that reads or writes user-scoped state SHALL require an authenticated human identity; the only unauthenticated surface is sign-in itself plus public, non-user-specific views. The authenticated identity SHALL resolve to its persistent user record — the anchor against which team membership, the admin role, credential ownership, and action attribution are determined.

#### Scenario: #unauthenticated-refused
- **WHEN** an unauthenticated visitor requests anything beyond sign-in and the public, non-user-specific views
- **THEN** the request is refused

#### Scenario: #user-record-anchors-authorization
- **WHEN** any authorization or attribution question is asked about a human actor
- **THEN** it is answered against the actor's resolved user record, and every action taken in the session is attributed to that record

### Requirement: identity-and-authorization/sole-credential-issuer
Convex SHALL host all identity and credential infrastructure and SHALL be the sole issuer of every credential any platform runtime accepts — sessions, per-team game credentials, and game access tokens. A game's SpacetimeDB instance SHALL admit connections only on access tokens Convex issued, with no alternative admission mechanism, and no Snek Centaur Server or web client SHALL issue a credential that any runtime accepts.

#### Scenario: #no-alternative-admission
- **WHEN** a connection attempts admission to a game instance on any basis other than a Convex-issued access token
- **THEN** it is refused — there is no secondary admission path

#### Scenario: #app-never-self-issues
- **WHEN** the web application or a Snek Centaur Server needs a game access token
- **THEN** it obtains one through Convex's issuance path; it never mints, forges, or re-derives one itself

### Requirement: identity-and-authorization/verification-without-shared-secrets
Convex SHALL publish, at stable well-known addresses, the verification material for the game access tokens it signs, sufficient for any game's SpacetimeDB instance to validate tokens entirely on its own. No per-instance secret SHALL ever be provisioned or exchanged for token validation.

#### Scenario: #instance-validates-alone
- **WHEN** a game's instance validates an access token
- **THEN** it does so using only the published verification material — no secret was seeded into the instance and none is consulted elsewhere

#### Scenario: #same-material-platform-wide
- **WHEN** a new game instance comes into existence
- **THEN** no new verification arrangement is negotiated; the platform-wide published material already covers its tokens

### Requirement: identity-and-authorization/game-token-contents
Every game access token SHALL be signed by Convex and SHALL carry, at minimum: the specific game it grants admission to, a subject encoding the holder's role (operator, bot, spectator, or coach) with its identity binding — the acting human for operators, the Centaur Team for bots, and for coaches both the human and the team whose view the token grants; spectator tokens carry no team binding — and an expiry beyond which the token is not accepted.

#### Scenario: #token-names-its-game
- **WHEN** an access token issued for one game is presented to a different game's instance
- **THEN** admission is refused — the token's game binding is checked, not merely its signature

### Requirement: identity-and-authorization/connect-time-validation
A game's SpacetimeDB instance SHALL validate a connection's access token exactly once, at connection time; the role and team association established then SHALL persist for the lifetime of that connection without re-validation.

#### Scenario: #expiry-never-disconnects
- **WHEN** an admitted connection's access token passes its expiry mid-game
- **THEN** the connection is not dropped — expiry bounds only the window for establishing connections, never the lifetime of an established one

#### Scenario: #reconnect-revalidates
- **WHEN** a client reconnects after an interruption
- **THEN** it presents a currently valid token and is validated afresh, exactly like a first connection

### Requirement: identity-and-authorization/admission-validation
At connection time the game's instance SHALL reject any connection whose token fails signature verification, names a different game, is past its expiry, or binds a team that is not registered as a participant of this game. Rejection SHALL happen before any game state is touched: the client is disconnected and no admission or attribution record is written. Gameplay mutations SHALL be accepted only from admitted connections.

#### Scenario: #reject-before-touching-state
- **WHEN** a connection fails any admission check
- **THEN** it is disconnected with no state written — a rejected connection leaves no admission record, no attribution entry, and no other trace in game state

#### Scenario: #unregistered-team-refused
- **WHEN** a structurally valid token binds a team that is not a registered participant of this game
- **THEN** the connection is rejected

#### Scenario: #unadmitted-mutations-rejected
- **WHEN** a connection that was never admitted attempts move staging, turn declaration, or any other gameplay mutation
- **THEN** the operation is rejected

### Requirement: identity-and-authorization/role-bound-privileges
A connection's privileges within a game SHALL derive solely from its validated role and team binding. Operator and bot connections may mutate only on behalf of their bound team; spectator and coach connections SHALL be refused by every state-mutating operation; and no distinction held outside the token — captaincy, admin standing, or any other platform-side role — SHALL grant a connection privileges within the game beyond its token's role.

#### Scenario: #spectator-and-coach-never-mutate
- **WHEN** a spectator or coach connection invokes any state-mutating operation
- **THEN** the operation is rejected — these roles are read-only inside a game

#### Scenario: #captaincy-invisible-in-game
- **WHEN** a team captain or platform admin connects to a game as an operator or coach
- **THEN** the instance grants exactly the token role's privileges — it neither knows nor honours captaincy, admin standing, or any other platform-side distinction

### Requirement: identity-and-authorization/admission-records-private
The records a game's instance keeps of admitted connections and their identity bindings SHALL never be readable by any client connection. They exist to enforce admission and attribute actions, not as gameplay data; only the platform's own privileged end-of-game retrieval reads them.

#### Scenario: #no-subscription-reaches-admission-records
- **WHEN** any client connection — participant, spectator, or coach — queries or subscribes
- **THEN** no queryable or subscribable surface exposes the admission and attribution records

### Requirement: identity-and-authorization/participant-token-eligibility
Convex SHALL issue an operator access token only to an authenticated human who is, per the target game's roster snapshot, a member of a participating team; and a bot access token only to the holder of a valid game credential whose Centaur Team is registered to the target game.

#### Scenario: #operator-outside-roster-refused
- **WHEN** an authenticated human requests an operator token for a game whose roster snapshot does not include them on a participating team
- **THEN** issuance is refused

#### Scenario: #bot-token-requires-team-credential
- **WHEN** a bot access token is requested
- **THEN** it is issued only against a valid game credential, for that credential's own team, in that credential's own game

### Requirement: identity-and-authorization/spectator-tokens
Convex SHALL issue spectator access tokens to any authenticated human who requests to spectate a game being played. A spectator token SHALL carry no team binding and SHALL confer no move-staging or other mutating privilege.

#### Scenario: #any-authenticated-human-may-request
- **WHEN** any authenticated human — team member or not — requests to spectate a playing game
- **THEN** a spectator token is issuable to them; team membership is not a precondition

#### Scenario: #no-team-binding
- **WHEN** a spectator token is issued
- **THEN** it binds the spectating human and the game only — it grants no team's private view and no ability to act

### Requirement: identity-and-authorization/coach-tokens
Convex SHALL issue a coach access token to an authenticated human who is a designated coach of a participating team — the platform admin counting as an implicit coach of every team — for a game being played. A coach token SHALL be bound to that team, SHALL grant read access to the game on the same filtered terms as a member of that team, and SHALL confer no mutating privilege.

#### Scenario: #coach-reads-as-bound-team
- **WHEN** a coach connection is admitted
- **THEN** it receives the same filtered view of the game a member of the bound team would receive — read-only

#### Scenario: #coach-of-nonparticipating-team-refused
- **WHEN** a coach token is requested for a team that is not a participant of the target game
- **THEN** issuance is refused, however valid the coach designation

### Requirement: identity-and-authorization/token-lifetime-and-refresh
Game access tokens of every role SHALL expire two hours after issuance, and a holder SHALL be able to obtain a replacement without re-authenticating from scratch — an operator without repeating Google sign-in, a bot without a new game credential — so long as the underlying session or credential is still valid. Expiry is defense-in-depth against leaked tokens: the boundary that ends access after a game is the game instance's decommissioning, not token expiry.

#### Scenario: #refresh-without-reauth
- **WHEN** a token holder needs a fresh token during a long game — for example to reconnect after an interruption
- **THEN** they obtain one from Convex on the strength of their still-valid session or credential, with no interactive re-authentication

#### Scenario: #teardown-not-expiry-ends-access
- **WHEN** a game ends and its instance is decommissioned
- **THEN** every outstanding token for that game has nothing left to authenticate against, whatever its remaining lifetime

### Requirement: identity-and-authorization/game-credential-scope
A per-team game credential SHALL be scoped to exactly one Centaur Team and one game and SHALL be non-transferable: Convex SHALL resolve every credential-authenticated call to the credential's own team and enforce that scope on every access. The credential SHALL grant exactly two capabilities — writes to that team's own Centaur-subsystem state, and requests for that team's bot access tokens — and nothing else; its lifetime SHALL be bounded to the game.

#### Scenario: #not-valid-for-another-team
- **WHEN** a credential issued for team A is used in any attempt to read or write team B's state, or to obtain tokens for team B
- **THEN** the request is refused — possession of a credential grants nothing outside its named team

#### Scenario: #not-valid-for-another-game
- **WHEN** a credential issued for one game is presented in the context of any other game
- **THEN** it is refused

#### Scenario: #grants-nothing-beyond-the-two
- **WHEN** a credential holder attempts anything beyond its team's Centaur-subsystem writes and bot-token requests — platform mutations, other teams' reads, roster changes
- **THEN** the request is refused

### Requirement: identity-and-authorization/live-game-issuance
Convex SHALL honour game credentials and issue game access tokens only for a game currently being played. Every credential-authenticated request and every token issuance SHALL re-check the game's status at request time, refusing when the game is finished or not yet started — regardless of the credential's or token request's remaining cryptographic validity.

#### Scenario: #credential-dead-at-finish
- **WHEN** a game finishes well inside a game credential's two-hour lifetime
- **THEN** the credential's very next request is refused — liveness is re-checked per request; expiry is only a backstop against leaks

#### Scenario: #no-tokens-for-finished-games
- **WHEN** any access token — operator, bot, spectator, or coach — is requested for a finished game
- **THEN** issuance is refused

### Requirement: identity-and-authorization/roster-snapshot-binding
Authorization for a game SHALL be bound by the roster snapshot taken when the game is initialized: which humans may obtain operator tokens, and which Centaur Team identities participate. The snapshot SHALL bind for the entire game — the in-game authorization state of a running game SHALL never change in response to later mutations of team records.

#### Scenario: #running-game-reads-only-the-snapshot
- **WHEN** any team-record change occurs while one of the team's games is running
- **THEN** the running game's authorization — operator-token eligibility and participating identities — is still answered from the initialization snapshot, never from current team records

### Requirement: identity-and-authorization/platform-admin-role
The platform SHALL support an **admin** role as a platform-level designation on the user record — never per-team and never per-server. An admin SHALL be able to read everything: browse all Centaur Teams, see all games across all teams, watch any replay, and hold implicit coach standing for every team's live games. Toward the authoritative state of a live game's runtime the role SHALL be read-only as a matter of principle, conferring no write path into a live game. Over platform-held state the role is not barred in principle from mutation: the administrative powers an admin holds are exactly those granted expressly by requirement, and every expressly granted power remains subject to the same invariants that bind any other actor.

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

### Requirement: identity-and-authorization/signing-independence
Convex SHALL maintain separate signing material for each credential type it issues — per-team game credentials and game access tokens — such that compromise of one type's signing material never compromises the other.

#### Scenario: #compromise-contained
- **WHEN** the signing material behind one credential type is compromised
- **THEN** credentials of the other type remain trustworthy — the attacker cannot parlay forging one type into forging the other, and unifying the two signing paths under shared material is a violation of this requirement, not a simplification

### Requirement: identity-and-authorization/client-credential-custody
Clients SHALL hold received credentials — access tokens, game credentials, session tokens — in memory only, for the duration of use, and SHALL never store, display, or transmit credential plaintext, with the sole exception of a credential's designed one-time creation-time disclosure to its creator.

#### Scenario: #memory-only
- **WHEN** the web application holds a game access token
- **THEN** the token lives in component memory only — never persisted to browser storage, never placed in a URL — and a page reload re-obtains a token rather than recovering one

#### Scenario: #single-disclosure-only
- **WHEN** a credential's design includes a one-time creation-time disclosure
- **THEN** the plaintext is shown exactly once, at creation, and is never displayable or recoverable afterwards

### Requirement: identity-and-authorization/mutation-authorization
Every function that mutates platform-held state SHALL authenticate its caller and SHALL reject the call when the authenticated identity lacks the right to perform it. Authorization SHALL be enforced server-side, at the function contract, from the authenticated identity — client-side gating is presentation, never enforcement.

#### Scenario: #ui-gating-is-not-enforcement
- **WHEN** a client bypasses the interface and invokes a mutating function directly
- **THEN** the same server-side authorization check applies and rejects an unauthorized caller
