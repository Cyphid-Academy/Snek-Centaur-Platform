# Design — migrate-identity-and-authorization

## Context

This change mints the train's first user-story capability from ~59 legacy
ids across modules 02, 03, 04, 05, 06, and 08 (module 03 is the core).
Legacy text was binding throughout; the assignment matrix supplied routing
only. The decisions below record how the substance was compressed to 28
requirements at intent grain and why the boundaries fall where they do.

## Decisions

### Root of the user-story DAG: global-invariants beneath, no peer above

The capability declares **Depends on: global-invariants** and nothing else.
It cites no *user-story* capability's requirements — not game-lifecycle for
"the game is playing", not team-management for coach designation, not even
game-engine — which is what lets every other user-story capability
(team-management, game-lifecycle, live-game observation, operator control,
replay) cite identity requirements without cycles. Where this spec needs a
downstream concept it names the observable fact ("a game currently being
played", "a designated coach of a participating team") without citing the
capability that governs it. *If that were reversed* — citing a peer or a
downstream story — the DAG inverts: downstream capabilities could no longer
cite identity requirements without a cycle, and the train's archive order
collapses.

The dependency on `global-invariants` is a different thing and costs the
root position nothing. gi is a meta layer *beneath* every concrete
capability (it declares only `game-engine`), so identity → gi → game-engine
stays acyclic and no capability that cites identity is affected. The
citations are recorded because this capability's requirements are among the
most invariant-dependent in the corpus: admission, validation, and issuance
are only sound while the instance stays hermetic, signing material stays
inside Convex, credentials stay per-team-per-game, and the instance
authorises at team granularity. Declared dependencies are an affordance to
extend when a citation is warranted, and this is that case.

### Integration with global-invariants (what is cited, and what is not)

The invariants are the *ground* these requirements stand on; where gi
already implies a constraint, the requirement states only its own
contribution and cites gi rather than repeating it:

- **Self-sufficient admission** — `verification-without-shared-secrets`,
  `connect-time-validation`, `admission-validation`, and
  `roster-snapshot-binding` all take their shape from
  `global-invariants/game-instance-hermeticity`: an instance validates with
  material and a roster obtained at initialisation, calls nothing out
  per-connection, and therefore cannot be re-pointed mid-game. Relax
  hermeticity and once-only validation, published-material-only validation,
  and snapshot binding all lose their reason to be exactly as stated.
- **Which runtime holds which record** — the admission and attribution
  records live in the instance (`admission-records-private`) and are read
  only by the platform's end-of-game retrieval, the one egress
  `global-invariants/game-instance-hermeticity#no-egress-before-game-end`
  sanctions. Their integrity under a rejected connection is instance-side
  atomicity: the "no record written on rejection" guarantee of
  `admission-validation#reject-before-touching-state` is enforced inside the
  reducer transaction, per
  `global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants`
  — not by ordering checks before writes in application code. The Convex
  counterpart is the same rule's uniqueness case, cited on
  `linked-provider-credentials`: one provider account belongs to one person
  forever, and two racing first links must not slip past that guard.
- **Surface parity is gi's, authorization is ours** —
  `mutation-authorization` no longer restates that client-side gating is
  presentation or that a caller must be authenticated: those are
  `global-invariants/one-contract-many-surfaces#every-surface-hits-the-same-invariants`,
  `global-invariants/security-enforced-outside-the-library#customised-app-changes-no-invariant`,
  and `global-invariants/authenticated-unambiguous-identity#no-anonymous-mutation-path`.
  What is left is the part with a single owner: the *right* to mutate is
  decided at the function contract from the authenticated identity. The
  legacy id this re-authors is a Convex-contract rule, not a two-runtime
  invariant, which is why it stays a requirement at all.
- **Credential lifetime is split by owner** — gi
  (`ephemeral-game-credentials`) owns what a Server may *hold* and when it
  expires; `game-credential-scope` owns issuance scope and the exactly-two
  grants, and `live-game-issuance` owns the per-request liveness re-check
  that actually delivers gi's end-of-game expiry. The credential's write
  grant is safe to hand a bot only because
  `global-invariants/centaur-state-boundary` keeps Centaur state incapable
  of deciding a game.
- **Spectators and coaches** — that a spectator connection holds no team's
  private state and can stage nothing is
  `global-invariants/team-granularity-authorization#spectators-hold-no-private-state`;
  `spectator-tokens` states only the issuance floor and the absent team
  binding that makes the connection a spectator. `coach-tokens` grants a
  team-granularity filtered view because that is the only granularity of
  view the instance has.
- **Admin read breadth is a granted read scope, not an exception** —
  `global-invariants/team-private-centaur-state` confines a team's
  configuration, coordination state, and recorded deliberation to its own
  members *and the identities the platform grants a team's read scope* while
  the competition is live. `platform-admin-role`'s implicit-coach standing
  and `coach-tokens` are exactly such grants: they are how a team's read
  scope is extended, so they do not widen the invariant and the requirement
  does not need to say so. An admin's read breadth is therefore bounded the
  same way a coach's is, and nothing in the admin role reaches another
  team's private state by a route the Centaur subsystem's own function
  contract does not authorise. *If reversed* — an admin surface reading team
  state outside that contract — the invariant is violated by a bypass, not
  by a grant.

### Crypto-neutrality: primitives are mechanism

No requirement here names a signature algorithm, a token or key-document
format, a claim name, an endpoint URL, a key-storage location, or the
library that implements any of it. The behavioural substance those
primitives serve is what is required: credentials are *signed*;
verification material is *published at stable well-known addresses*; a
credential names *the one resource it may be used at*; an assertion is
accepted *once*; capabilities travel as *structure*. *If reversed* —
primitives named in requirement text — swapping a scheme or a library would
falsely read as a behavioural change, and the spec would compete with code
as the source of truth for mechanism.

One thing sits on the behavioural side of that line that might look like a
primitive: *whether* authentication is asymmetric. It decides what a
compromised component yields and whether onboarding a party needs a human to
move a secret, which makes it an invariant
(`global-invariants/no-shared-secrets`) these requirements stand on rather
than restate. What stays mechanism is every question of *how*.

Concretely: the legacy discovery pair became
`verification-without-shared-secrets`; the claim schema became
`game-token-contents` plus `capability-claim-structure` — the latter fixing
only that capabilities are a sequence of entries able to carry constraints,
never a string, because that is the part a later change of wire format must
not break. The "platform-wide key pair" id retires onto the verification
requirement with its key-management detail left to code, and the
signing-material-maintenance id is retired note-only as mechanism.

### Implementation substrate, and the boundary policy must not cross

Requirement text names no library, but the shape of the implementation is
worth recording because one boundary in it is load-bearing.

The platform's Convex deployment runs **Better Auth**, installed in local
mode — the component embedded in the application's Convex directory rather
than consumed across a component boundary — because the schema this
capability needs (linkage records, the issuer registry, accepted-assertion
identifiers) has to be modifiable where it lives. Forking the integration
was rejected: it would mean tracking upstream security fixes in a
fast-moving dependency forever, for a project with no dedicated security
function. Local install buys the schema control without that liability.

The library supplies key management, signing, publication of verification
material, and human authentication. Everything this document specifies
beyond that — the assertion exchange, single-use enforcement, ceiling
intersection, and minting of the capability claim — is a **plugin the
project writes**, rather than an adaptation of a built-in consent-flow
provider. Bending a user-consent authorization-code flow into
machine-to-machine issuance imports constraints that have nothing to do with
the problem; owning the endpoint costs less than working around them.

**The plugin owns protocol; ordinary application code owns policy.** The
issuer registry and its ceilings, homing and two-sided consent, the
capability registry, principal-kind gating, per-peer ceilings and
attribution all stay in application code. *Reversed* — policy migrated into
the plugin — the platform's authorization rules, the code most needing
review, end up buried inside an auth plugin and coupled to its lifecycle.

### Trust and identity model: Google as a linked credential, not as the identity

**Google specifically** (not "a federated provider") is carried as binding
requirement text, and `#google-account-specifically` exists precisely so
provider-neutral drift is visible as a violation.

What Google supplies is a *credential*, and the person is the platform's own
user record. The mapping between them is one-to-one and settled at first
sign-in: this platform affords no way to repoint a linkage, and losing the
Google account behind a record means losing the ability to sign in as that
person. That is a real cost, accepted deliberately.

The split still earns its place, because it is not bookkeeping — it is what
decides the price of the identity work that comes later. A centralised Cyphid
identity service will arrive, and every CGP user will need to hang off it
instead of off Google. With the provider's subject isolated in a linkage row
and every other record naming the platform's own user id, that migration
re-points one table. *If reversed* — the provider subject as the user
record's key, or as a column other records join on — the same migration
touches every foreign key in the system. The one-to-one mapping is what keeps
it mechanical, which is the reason to preserve it rather than to build a
rebinding affordance that would let it drift.

An in-platform rebinding operation was considered and rejected for now. It
is the operation nothing external can perform for us — a provider's subject
is immutable and never reused, so "this person now uses a different Google
account" is a fact no protocol can carry — but it is also an
account-takeover primitive, and it is not needed before the identity service
exists. Building it now would cost the guarantee that makes the migration
cheap. *If reversed* — rebinding shipped — the linkage stops being one-to-one
the first time anyone uses it, and the central-identity refactor has to
reconcile histories rather than re-point a column.

Two consequences are stated as requirement text rather than left to
implementation, because both are silently violable. Uniqueness holds in both
directions, so whom an account belongs to is settled once at first sign-in.
And nothing is auto-linked by matching email claims: unverified-email
auto-linking is a known account-takeover route, so identity comes from the
provider's subject alone and is never inferred from a claim that can change
or repeat.

Email survives as a profile attribute for display, notification, and
inviting someone who has no account yet. It is never an identity key and
never a join key.

**What this asks of the substrate is Better Auth's default behaviour, and
that is deliberate.** Its Google provider already keys an account on the
provider's immutable subject and already declines to link accounts by
matching email unless linking is switched on — so `linked-provider-credentials`
and `#no-auto-linking-by-email` are satisfied by taking the defaults and
leaving automatic linking off, not by customising the account model. Nothing
here calls for a bespoke sign-in path, and the simplest correct
implementation is the intended one.

**The centralised Cyphid identity service is out of scope of this spec.**
This capability is written so that its arrival is a re-pointing of the
linkage table rather than a migration of every record, and that is the whole
of the accommodation made for it here — no requirement anticipates its
protocol, its claims, or its rollout. Until it exists, the stability of the
Google accounts behind player records is an **operational commitment**
rather than a platform mechanism: the platform affords no rebinding, so a
subject that is genuinely lost is an unrecoverable record, and the mitigation
is care in administering those accounts. Recording that here means the
absence of a recovery affordance reads as a decision rather than an
oversight when someone eventually looks for one.

The runtime trust model the requirements encode: **the platform's Convex
deployment is the sole authorization server for the platform's own
affordances** (`sole-credential-issuer`, `mutation-authorization`,
`live-game-issuance`); **a game instance trusts only validated tokens and
only at connect time** (`admission-validation`, `connect-time-validation`,
`role-bound-privileges`); **servers and clients are custodians, never
authorities** (`client-credential-custody`, `game-credential-scope`).
Platform-side distinctions (captaincy, admin) deliberately do not travel
into game instances — the token's role is the whole in-game privilege story.

### One exchange, two registrations

A Snek Centaur Server and a peer Cyphid system authenticate identically:
each signs a short-lived assertion with its own key, the platform verifies
it against material published where that principal's registration says to
look, and issues a bounded credential. They differ only in what the
registration records and what ceiling it carries. Authoring them as one
mechanism (`service-principal-assertions`, `trusted-issuer-registry`) rather
than two protocols is deliberate: *reversed*, the two drift, and the second
one written is the one whose replay defence, audience check or ceiling
enforcement is subtly weaker.

Registering by *where a principal publishes its material* rather than by the
key itself is what makes rotation a non-event — publish both keys, switch,
drop the old — and lets a server redeployed onto empty storage self-heal by
generating and publishing a new key. It also re-proves control of the
publishing location on every read rather than once, at registration.

`#excess-fails-loudly` is a deliberate choice against the friendlier
behaviour. Intersecting a request silently down to the permitted subset
produces a working call that does less than the caller intended; the failure
then surfaces as unexplained missing behaviour at some later call site,
arbitrarily far from the grant that was wrong.

### Capabilities aligned to the function surface, total at build time

Capabilities name what the platform actually exposes, and the registry is
keyed so that adding a public function without declaring its capability
fails the build. Fail-closed at build time is the whole value of aligning
them: a review-enforced registry is complete until the first time someone
forgets, and what they forget is by construction a function nobody is
thinking about. *Reversed* — capabilities as a hand-maintained list beside
the code — the gap between the two is invisible and grows silently.

Declaring the capability on each function rather than deriving it from
module or file paths matters because module structure is organised for
developer convenience: colocated functions routinely differ in risk, and a
path-derived grouping quietly grants the dangerous one alongside the dull
one.

`#reachability-is-not-authorization` guards the failure this alignment
invites. Once a handler can see that the caller holds a broad capability,
the tempting simplification is to treat that as the decision already made —
which turns a broadly-scoped credential into an ambient superuser at exactly
the handlers where that is most costly.

### Principal kind is a separate axis from capability

`principal-kind-gating` is expressed as a property of the **function** rather
than as a scope a Server's credential lacks, and the asymmetry with the peer
model is intentional.

The two axes are ordered, and the order is what keeps them independent.
Capabilities decide *reachability* — whether this credential may cause this
function to run at all — and that check runs first, knowing nothing about
who is calling beyond what the claim carries. The function then decides
whether it accepts the caller's **kind**, and that decision is the
function's own: it is written where the operation's meaning lives, next to
the authorization the function already performs. Locating it on the
capability instead would put a statement about an operation's nature in the
credential-shaped layer, and the two would drift the first time one function
in a capability's reach differed from its neighbours.

Accepting human identities alone is therefore the **default a function
departs from explicitly**, not a restriction it opts into. The consequence is
deliberate and worth stating plainly: most public functions are not callable
by a service principal, and the programmatic surface is exactly the set that
declares otherwise. `platform-integrations/functions-are-the-api` is scoped
to that documented surface for this reason — a function outside it refusing a
client is a declared kind restriction, not a hole in the surface. Reversed —
service reach inferred from a broad ceiling — every function the first-party
application gained would silently join the API, and the surface would be
whatever the newest mutation happened to leave open.

The path that would widen this later is **impersonation**: permitting a
trusted external system to act as a named human, under that human's own
authority. That would open the remaining functions without changing a single
function's kind declaration, because the caller would arrive as a human
identity. It is deliberately **out of scope here** — it reintroduces the
threat `peer-capability-ceiling` exists to bound, so it needs its own change
with its own consent and attribution rules, not a quiet extension of this
one. Scopes earn their keep when a principal's maximum
authority meaningfully exceeds any single operation's needs. A Server's
ceiling and floor coincide — it stages moves, declares turns over, and reads
and writes its team's Centaur state; remove any and it cannot operate — so a
scope parameter on its credential would be ceremony.

The deeper reason is what each principal *is*. A peer system acts on behalf
of users, so impersonation is the threat and attenuation the defence. A
Server acts as itself, a service principal whose authority its team
knowingly conferred, bounded by design: the worst it can do is play badly
with snakes the team already owns. What it must never reach is the
administration that would make that harm persistent — re-homing the team to
a domain of the attacker's choosing, or locking its captains out. That is a
bound on the *operation*, not on the credential, so it belongs on the
capability.

This matters most where teams concentrate on one server: without the bound,
one compromise re-homes every team hosted there.

### Audience binding rather than separated signing material

Every credential names the one resource it may be used at, and every
resource refuses credentials naming another. That is what contains a
compromise here, and it is why a single signing arrangement behind all of
the platform's credentials is safe rather than a concentration of risk:
forging is not the reachable attack, and a leaked credential is inert
outside its named resource and dead within minutes. *Reversed* — separate
signing material per credential type, with audiences unchecked — the
platform pays for key separation while leaving the cross-use it was meant to
prevent wide open, since nothing stops a credential earned for one purpose
being presented at another.

### Role is decided from the derived identity, not from a claim

A game instance derives its Identity by hashing the token's issuer and
subject, and encoding the role in the subject means a spectator and an
operator arrive as *different identities* — one of which the instance's
seeded permissions simply do not name. The read-only guarantee is then
structural and fails closed: there is no check to omit.

The alternative is available and is what the requirement forbids. A game
instance can read its caller's validated token — issuer, subject and audience
directly, arbitrary custom claims through the raw payload — so a `role` claim
would work. Taking it converts a structural property into a conditional one:
a spectator and an operator would then share an identity, and every staging
path would depend on remembering the check. *Reversed* — role read from a
claim — the failure mode is a spectator who can stage, produced by one
missing branch.

That claims are readable at all is worth recording for a different reason:
the structured capability claim is legible in-instance, so in-game
authorization finer than team granularity is reachable later without changing
what tokens carry. Nothing today needs it, and the subject-encoded role
stands either way.

### Credentials are short, and renewed ahead of expiry

Self-contained credentials trade revocation immediacy for stateless
verification; short lifetimes are what makes that trade acceptable, and
minting is cheap. Fifteen minutes is the number, chosen because it caps the
window a withdrawn grant stays usable at something a person would wait out,
and because it matches the issuing library's own default — a lifetime nobody
has to configure against the grain is a lifetime that stays what the spec
says. `#renewal-is-proactive-never-reactive` is the constraint
that keeps the trade from costing a game: a holder that discovers expiry
from a refused call pays the retry while the chess clock runs. Renewal on a
timer well ahead of expiry costs nothing and cannot land on a turn.

### Where the fifteen-minute bound stops: two kinds of credential, not one

The fifteen-minute rule was first written as "every credential the platform
issues", and that letter proved wrong the moment the client side of sign-in
was designed against it. The sentence's own rationale draws the real line:
short lifetimes are what make a **self-contained** credential's revocation
delay tolerable. A credential a resource verifies from signature and
published material alone is a decision the platform made once and cannot
take back, so it must die quickly. The session credential established at
sign-in is the other kind: checked against platform state on every use and
revocable at that same instant, its revocation delay is zero and expiry is
not what bounds it. The requirement now names the distinction, and
`#only-the-stateful-session-outlives-the-bound` makes the session the *only*
credential permitted to outlive the bound — so a second long-lived
credential appearing anywhere is a violation, not a precedent.

Two tempting alternatives were weighed and rejected. A long-lived
self-contained credential held by the page (skipping renewal round-trips)
converts every response capability — sign-out, per-issuer revocation, a
compromised-machine sweep — from minutes to hours, and violates the bound
for no gain the renewal loop doesn't already provide. Revocable JWTs via
identifier-and-denylist re-introduce a per-use platform check at every
verification site, which is the stateful session rebuilt with more moving
parts and none of its instant-revocation guarantee at resources that verify
offline. *If reversed* — the bound kept as "every credential" — the session
itself is non-compliant and every implementation quietly ships a violation,
because no cross-origin client can renew without holding *something* that
outlives fifteen minutes.

### The client's credential architecture: an in-memory session, concealed, refreshed in the background

Recorded here because the shape is load-bearing and each piece is the answer
to a rejected alternative. The sign-in and handoff mechanism is the identity
change's `convex/signIn.ts` and `convex/issuance.ts`; the client custody
shape below is what the reference app's sign-in route must realise, and the
requirements it satisfies are `client-credential-custody` (with
`#concealed-from-co-resident-scripts`), `token-lifetime-and-refresh`
(`#renewal-does-not-interrupt-a-live-session`), and `google-sign-in`'s
session-lifetime floor.

The durable session credential lives in exactly one place — a `SameSite=Lax`
cookie on the platform's own origin, `HttpOnly` and so readable by no page
script on any origin. A team-served page never holds it. What a live page
holds instead, in memory, is a **renewal credential** obtained under that
cookie, from which it mints the short working credentials it presents to the
platform; and it holds those working credentials, also in memory. Nothing a
page holds is written to storage, and a page reload — which empties memory —
re-obtains the renewal credential through the cookie rather than recovering
anything client-side.

There were three shapes to choose from, and the requirements mandate the
guarantees of the middle one, not its mechanism:

- **(A) The session token in `localStorage`** — the integration library's
  default. It survives reload with no redirect, but the durable, long-lived
  session sits *at rest*, readable by any script in the origin. Rejected. In
  a fork ecosystem the realistic code-execution vector is not bespoke
  injection but a *co-resident* script the fork author trusted — a
  compromised dependency, an analytics snippet — and such a script reads
  `localStorage` in one passive line, the way generic credential-mining
  sweeps already work. The distinction that kills A is exactly what
  `#concealed-from-co-resident-scripts` requires: a credential reachable
  only through the code that uses it forces that attacker to actively
  instrument a specific transport, which a generic sweep does not do. *The
  advantage is contingent on the concealment* — a renewal credential parked
  on `window` or a well-known property is `localStorage`'s exposure by
  another name, which is why concealment is a requirement and not a note.

- **(B) The renewal credential in concealed page memory** — the chosen
  shape. Refresh of a working credential is a background fetch carrying the
  in-memory renewal credential explicitly, so it needs no cookie and
  crosses origins freely; nothing is at rest, so the co-resident sweep of A
  comes away empty; and only an actual reload costs a redirect. Its honest
  cost against C is that a live page holds something session-powerful, so a
  *full* XSS on that live page takes more than it would under C — but that
  attacker is not the one concealment is aimed at, and against a full live
  XSS no client shape helps. What B denies is the larger, more probable set:
  the generic miner, the other-tab or after-close read that only a
  persistent store affords, the residue on a shared machine.

- **(C) The cookie and a short working credential only** — the more austere
  sibling, holding nothing session-powerful on the page. It is stronger
  against the live-page full XSS, but with nothing in memory to authenticate
  a background refresh, a working credential that ages out can be replaced
  only by re-reading the session — and the session rides only a top-level
  navigation, so continuous use past one working-credential lifetime forces
  a visible reload. For a two-hour workshop that is unacceptable, which is
  what `#renewal-does-not-interrupt-a-live-session` forecloses. C remains
  *compliant* where a runtime holds the live connection through the working
  credential's expiry (no reload results), which is why the requirement
  mandates the no-interruption guarantee rather than B's in-memory-renewal
  mechanism — it forbids the degenerate C, not the connection-holding one.

`SameSite=Lax` is load-bearing for exactly one leg: the reload that
re-obtains the renewal credential is a top-level GET navigation to the
platform, and Lax is what lets the cookie ride it while `Strict` would
withhold it and force a fresh Google round trip. Background refresh does not
touch the cookie at all — a cross-site fetch never carries it under Lax or
Strict — which is precisely why the durable session stays out of script
reach: the only thing that ever presents it is a navigation the browser
controls, never code.

**Session lifetime is a deployment configuration floored at four hours, and
that revises the seven-day default an earlier reading assumed.** With
background refresh keeping a live session seamless, a shorter session no
longer costs active-use convenience — only the interval between *sittings*
sets how often a human signs in again, and for a cohort meeting in a weekly
two-hour workshop a four-hour session and a seven-day one are
indistinguishable in that respect. They are not indistinguishable in
exposure: the session is the one durable credential, so the shorter it lives
the less standing exposure it carries, and a deployment should be free to
keep it short. The floor exists so the shortening never reaches into a
sitting — four hours comfortably outlasts the two-hour workshop — and
seven days remains permitted for deployments whose pattern wants it. *If
reversed* — a long fixed lifetime — a deployment pays for durable exposure
it has no convenience reason to want.

Why the handoff earns requirement text rather than staying mechanism: its
two failure modes are invisible in testing and catastrophic in the field. A
reference redeemable twice works perfectly until someone captures a URL —
and it *does* travel in one, through the address bar of a page a team
serves. A return address taken from the request works perfectly until
someone supplies a hostile one, at which point the platform is a
trusted-looking bounce delivering sign-in artifacts to any origin that
asks — theft from users who never chose to trust that origin, outside the
trust trade-off the read-access principle accepted. `sign-in-handoff` and
the registry's return-address field exist to make both failures visible as
violations. The PKCE-shaped challenge does double duty: it is what makes a
reference in a URL, a log, or a browser history worthless to whoever finds
it, and it is the only way to redeem — there being no key-based alternative
is what stops the Server a reference passes through from taking the human's
credential for itself.

Custody of the client-side artifacts splits on what each *is*. The renewal
credential and the working credentials are credentials, so they live in
memory, concealed, and nothing else (`client-credential-custody#memory-only`
and `#concealed-from-co-resident-scripts`) — reachable only through the code
that presents them, never a global or a storage key a passive read would
find. The challenge verifier is *not* a credential — it confers nothing and
answers only for one pending reference — and it must survive the top-level
navigation that empties page memory, so session storage is its one possible
home and holding it there breaches nothing. A page that finds a reference but
no stored verifier discards the reference unredeemed: redeeming against a
challenge the page never generated is how a third party would plant a
session.

### Dedupe clusters: one requirement per behaviour

- **Credential scoping** (two module-03 ids stating scope and
  non-transferability, plus the credential-grants id and the
  credential-resolution id) → `game-credential-scope`. One requirement
  states scope, non-transferability, the exactly-two grants, and
  game-bounded lifetime.
- **Sole issuer** (module 03's sole-issuer and token-admission ids,
  module 05's sole-issuer id, module 02's credential-infrastructure id,
  module 08's never-self-issue id, module 04's only-admission-mechanism
  id) → `sole-credential-issuer`; the refuse-finished half of module 05's
  id lands as `live-game-issuance#no-tokens-for-finished-games`.
- **Verification-material discovery** (modules 03 and 05 stating the same
  cross-runtime contract) → `verification-without-shared-secrets`.
- **Admission validation** (module 03's rejection criteria + module 04's
  callback trio) → `admission-validation`, with the module-04 "no
  attribution written on rejection" as `#reject-before-touching-state`.
- **Admin role** (four module-03 ids, two module-05 ids, module 08's
  admin-experience pair and reload-freshness id) → `platform-admin-role`,
  one requirement whose text carries both the read breadth and the
  read-only bound, rather than a separate negative requirement — the
  bound is what makes the role safe, so it belongs in the same read.

*If any cluster is reversed* into per-module restatements, the halves can
drift independently — exactly the failure mode the user-story carving
exists to end.

- **Judgment call — credential-to-team resolution id**: the matrix offered
  `alt:code-mechanism`. Resolved: retire it onto `game-credential-scope`
  (resolution of a credential to its team is the observable precondition
  of scope enforcement) while treating the identity-kind-exposure helper
  shape (`resolveIdentity` and friends) as mechanism.

### Boundary rulings (seams)

- **Coach tokens** are issued here (mirroring spectator tokens; the
  admin-as-implicit-coach rule lives in `platform-admin-role` and
  `coach-tokens` jointly). What a coach connection experiences — the
  filtered live view, the client-side inspection UX — belongs to the
  live-observation story; coach *designation* (who appoints coaches, where
  they are recorded) belongs to the team-management story. This spec
  therefore says only "a designated coach of a participating team".
- **Roster snapshot**: this capability owns the *binding* — authorization
  is answered from the initialization snapshot for the whole game
  (`roster-snapshot-binding`, plus token gating in
  `participant-token-eligibility`). Snapshot creation/storage belongs to
  the game-lifecycle story; the roster mutation-freeze (edits rejected
  while playing, and its hard-reject review scenario) belongs to
  team-management. The binding is stated so it holds *even if* a team
  record were somehow mutated — it does not presume the freeze.
- **Spectator eligibility policy** beyond authentication was legacy-deferred
  to the application layer; the routed review item for it belongs to the
  live-observation story. `spectator-tokens` states the issuance floor
  (any authenticated human) and nothing more.
- **Cross-cutting rules** routed to `global-invariants` (identity-kind
  distinguishability, no anonymous mutators, credential-transmission
  custody, access-follows-identity, team-granularity authorization) are
  **cited, not restated**, here — see the integration notes above for the
  division of labour, including why `mutation-authorization` survives as a
  requirement.

### Admin designation mechanism stays mechanism

Both legacy ids deferring *how* admins are designated (env-var list vs
database flag) retire note-only; `platform-admin-role` states the
designation is platform-level on the user record and takes effect without
reload, which is the entire observable contract. *If reversed* (specifying
the mechanism), the spec would freeze an operational choice the legacy
corpus explicitly left open.

## Constraint-mining (mandatory final step)

Each routed lead was judged: does a design decision's quality depend on an
invariant a future implementer could silently violate?

1. **Credential requests re-check the game is playing** — *minted*:
   `live-game-issuance` (with `#credential-dead-at-finish`). The two-hour
   expiry is safe *only because* liveness is re-checked per request; an
   implementer who trusts the expiry alone silently opens a post-game
   access window. What breaks if violated: a leaked or retained credential
   keeps working after the game it was scoped to has finished.
2. **Reject-before-touching-state admission** — *minted*: scenario
   `admission-validation#reject-before-touching-state`. Attribution and
   admission records are trustworthy *only because* failed admissions
   write nothing. What breaks: phantom attribution rows from rejected
   connections poison the game's historical record.
3. **Admin extends read only** — *minted*: `platform-admin-role` text +
   `#no-write-path-into-live-games`. The role is grantable casually *only
   because* it cannot act. What breaks: admin becomes an operational
   super-user and every game a member of the admin list watches is
   competitively compromised.
4. **Tokens refuse finished games** — *minted*:
   `live-game-issuance#no-tokens-for-finished-games` (uniform across all
   four roles). What breaks: token issuance against finished games
   re-opens exactly the access that instance teardown is supposed to end.
5. **Token custody in memory only** — *minted*:
   `client-credential-custody#memory-only`. Connect-time-only validation
   is acceptable *only because* tokens are short-lived and never at rest;
   a token cached in browser storage or a URL outlives the threat model.
   What breaks: leaked storage/history yields replayable two-hour access.
6. **Admission records invisible to clients** (module-04 design lead) —
   *minted*: `admission-records-private`. Team-granularity privacy and
   attribution integrity depend on the connection-to-identity mapping
   never being a client-readable surface. What breaks: any client could
   enumerate who is connected for which team — metadata the invisibility
   and role model deliberately withhold.

7. **Assertions are accepted once** — *minted*:
   `service-principal-assertions#replayed-assertion-refused`. A signed
   assertion is a bearer artifact for its lifetime; without single use, a
   captured one is a working credential for whoever captured it. Silently
   violable because the success path never exercises it.
8. **Capability declaration is total at build time** — *minted*:
   `capability-registry#unregistered-function-fails-the-build`. A registry
   maintained by discipline is complete until the first omission, and the
   omission is invisible. What breaks: a public function reachable under no
   recorded capability, which no grant review will ever surface.
9. **Team administration is barred by principal kind** — *minted*:
   `principal-kind-gating` with
   `#a-service-principal-cannot-administer-a-team`. What breaks: a Server
   compromise stops being transient — it re-homes teams and locks captains
   out, which no expiry undoes.
10. **Renewal precedes expiry** — *minted*:
    `token-lifetime-and-refresh#renewal-is-proactive-never-reactive`, with
    `#renewal-failure-is-quiet-until-it-bites` settling the degraded case.
    Short lifetimes are safe *only because* renewal never lands on a turn;
    the natural implementation refreshes on the first refusal and pays for it
    with the clock running. The quiet-retry half is minted because the
    tempting alternative — warning the operator at the first failed renewal —
    spends their attention on something they cannot act on, since standing
    down would need the same platform that is unreachable.
11. **Role is structural, not checked** — *minted*:
    `game-token-contents` text and `#subject-alone-decides-the-role`. The
    instance can read claims, so deciding a role from one is an available
    and wrong implementation; the requirement forecloses it.
11. **Capabilities travel as structure** — *minted*:
    `capability-claim-structure`. Every constraint field is empty today, so
    a flat string would work and would be the natural first implementation.
    What breaks later: adding a constraint becomes a breaking change across
    every enforcement site, audit consumer and registered system at once —
    the most expensive shape of change in a federation.

No further lead survived judgment: the remaining design content (wire
parameter names, claim encodings, key formats, callback step orderings,
helper signatures, and which library implements the issuance endpoint) is
mechanism whose violation is caught by the minted behavioural requirements
above.
