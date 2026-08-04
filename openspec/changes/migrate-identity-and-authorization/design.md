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

### Substrate as built: three departures from the section above

The section above was written before the substrate was tried. Building it moved
three things, and they are recorded as departures rather than folded into the
original text, because what a decision *was* is part of why the current one is
right.

**Better Auth is mounted in npm mode, not installed locally.** Local install was
chosen for schema control: the linkage records, issuer registry and
accepted-assertion identifiers "had to be modifiable where they live". They did
not. Better Auth's tables live in a Convex component of their own **either
way** — local install vendors that component's source into this repository so
its schema can be extended, and buys nothing else. Every record this capability
owns turned out to be a table of *ours* (`trusted_issuers`,
`accepted_assertions`, `sign_in_handoffs`, `platform_admins` in
`convex-snek-platform`), so nothing of Better Auth's needed an added field or
index, and npm mode avoids committing a few hundred lines of generated schema
that would then have to be re-vendored on every upgrade. *If reversed* — local
install taken anyway — the repository carries a generated schema nobody edits
and an upgrade path that reads as a source change.

This also settles the open question `packages/convex-host/AGENTS.md` recorded,
and settles it in the negative: auth tables do not breach the host's "owns no
tables" rule, because they are the auth component's. `convex/schema.ts` stays
empty and needs no amendment.

**The platform mints and verifies its own credentials, with `jose`.** The
section above assigns key management, signing and publication of verification
material to the library. Better Auth's token endpoint cannot carry them: it is
bound to the caller's own session and hardcodes its audience, and a credential
of ours names a Centaur Team as its subject and one game instance as its
audience. So `auth/credential.ts` signs and verifies, `auth/deployment.ts` holds
the signing key and publishes the material at the well-known addresses, and the
library's role narrows to human authentication — the Google exchange and the
session cookie — which is the one thing it does that nothing here wants to own.

The boundary that section calls load-bearing is unchanged, and is now enforced
by construction rather than by discipline: there is no plugin, so no policy can
migrate into one. Issuance is ordinary application code in `convex/issuance.ts`,
which is where the registry, ceilings, kind gating and attribution already were
required to live.

**The admin designation is a table of this capability's own.** Better Auth's
user table belongs to its component and is not ours to extend, so the
designation is a `platform_admins` row keyed by user id rather than a field on
the user record. "Admin designation stays mechanism" below already retires the
mechanism note-only, so this sits inside what the design left open; the
observable contract it does fix — effect without reload — holds because the
membership is read per call rather than carried in a credential.

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

### Where sign-in happens: one Google client, at the platform's origin

Module 09 was absorbed into module 08, so the human-facing application *is*
the Snek Centaur Server application — the artifact every team forks and runs
on an origin the team controls. That makes one question the requirements
never ask out loud load-bearing: **which origin does Google talk to?** The
platform's Convex deployment, and only ever that one. A single OAuth client
is registered to Cyphid, its redirect URIs naming platform *environments* —
never teams, never developers — and a Server holds no client, receives no
authorization code, and never sees the platform's session cookie. It is a
relying party exactly as a peer Cyphid system is.

**The Server's own authentication introduces no second protocol; the handoff
does introduce something new, and `sign-in-handoff` is it.** A Server proves
who it is exactly as it already does under `service-principal-assertions`
and `trusted-issuer-registry` — nothing there is new. But that mechanism
authenticates a *Server*; nothing in it carries *which human just signed
in*, and that gap is filled by a single-use reference handed back through
the browser and exchanged for a credential. Claiming the existing exchange
covered both would have left the one genuinely new artifact unnamed, and
with it the two ways it fails: replayed, and redirected somewhere the
requester chose. Hence a requirement rather than a paragraph.

**Who ends up holding the human's credential is not a free choice**, which
is easy to miss. `credential-confinement` returns an issued credential "only
to the party whose own authentication earned it, in the response to that
exchange", and lets it "travel on no other channel" — so a Server that
redeems the reference may *use* the resulting credential, but may not relay
it onward to the page it serves. The two coherent shapes are therefore a
Server that redeems and acts, or a client that redeems for itself and leaves
the Server holding nothing of the human's; the intermediate one, where a
Server redeems and forwards, is already closed. Which of the two is built is
left to implementation, but it is a choice between two, not a detail — the
second keeps a hostile fork out of the human's credential entirely, at the
cost of the redeeming client having to prove itself without the Server's
key. `#the-redeemer-keeps-what-it-earns` is written so either satisfies it
and the relay satisfies neither.

Nothing further is minted, because two requirements already forbid the
alternative to the origin decision itself:
`sole-credential-issuer` makes the platform's deployment the sole
authorization server for the platform's own affordances, and
`client-credential-custody` confines the session credential to a cookie sent
only to the platform's own origin — which a Server-run sign-in could not
produce. What was missing was the sentence naming the origin, and its
absence is not benign: wiring Google directly into the human-facing
application is the obvious implementation, so silence selects the violation
by default. *If reversed*, every team's domain becomes a registered redirect
URI on Cyphid's client — a list that grows with the cohort and never shrinks
— and a student-modified fork is handed the Google authorization code of
everyone who signs in through it, **including a platform admin who opens it
to observe a game**, whose read breadth `platform-admin-role` deliberately
makes wide. As decided, a hostile fork obtains only what its own players
granted it, bounded by `peer-capability-ceiling` and dead inside the fifteen
minutes of `token-lifetime-and-refresh`.

Reload therefore round-trips through the platform rather than establishing a
second session on a team-controlled origin. The round-trip is silent while
the platform session is live, so `google-sign-in#session-survives-reload`
holds without a second cookie and `client-credential-custody#memory-only` is
read literally rather than worked around; the alternative buys one fewer
redirect and costs the persistent credential this decision exists to remove.
The registered URI list stays at two or three entries because the platform
runs as a Convex **local deployment** on a fixed loopback port, so
development shares one loopback redirect rather than one per developer. And
when module 08 migrates, its ids requiring the application to authenticate
the human with Google re-read as requiring an *authenticated platform
identity, obtained from the platform*.

### Which of the two shapes was built: the client redeems, and sign-in is redirects

The section above leaves the choice between "a Server that redeems and acts"
and "a client that redeems for itself" to implementation, and calls it a
choice between two rather than a detail. The first landed initially. **The
second is what is built**, and the reason is not the preference that section
weighed — it is that the first turned out not to reach the case the whole
handoff exists for.

**A browser on a Server's origin could not authenticate here at all.** The
platform's session cookie is `sameSite: "lax"` on this deployment's origin, so
it is never sent on a cross-site request from a team's fork; the `ctx.auth`
branch of the caller seam is therefore unreachable from any origin but this
one. The other way in — a credential as a function argument — works from
anywhere, but the only function that minted a human's credential demanded a
service-principal assertion, so only a party holding a key could obtain one,
and a page holds none. Both halves looked correct in isolation, which is why
this is recorded rather than left to be rediscovered.

**The fix rests on one asymmetry, and it is why sign-in is redirects rather
than a better client library.** `sameSite: "lax"` blocks a cross-site *fetch*
and permits a top-level *GET navigation*. A page fetching the platform cannot
use the cookie; a browser navigating to the platform can. So the flow is a
chain of redirects through the platform's own HTTP routes — an entry address a
Server links a signed-out human to, and a return address the provider's
callback sends them back through — and the cookie is available exactly where
it is needed and nowhere else.

**The return context needs no artifact of ours.** Which Server, which of its
registered addresses, and the challenge must survive the visit to Google. The
obvious construction is a signed, short-lived token of the platform's own in
the `state` parameter — and it is unnecessary and, as it happens, impossible:
the provider library generates `state` itself and accepts none from a caller,
but it does store a caller-supplied return address server-side keyed by that
state. The context therefore rides in that address, which is attacker-invisible
and attacker-unmodifiable because the library kept it. *If reversed* — a token
minted for this — the platform gains a second short-lived credential format,
its own verification path, and a lifetime to keep in step with a redirect,
buying nothing the library was already doing.

**The keyless proof is PKCE, and no requirement moved to allow it.**
`anonymous-reach#handoff-redemption-proves-itself` already says what stands in
for a credential is "the reference together with proof of being the party it
was minted for". A verifier the page keeps and a challenge the reference is
bound to is such a proof. `#the-redeemer-keeps-what-it-earns` was written so
either shape satisfies it, and it does.

**Removing the assertion path is a security property, not tidying.** The return
leg puts the reference in the address bar of the Server's own page, so the
Server sees every reference it is sent. If a reference could also be opened
with something the Server already holds — its signing key — the Server could
take the human's credential for itself, which is `#the-redeemer-keeps-what-it-earns`
inverted with the credential landing somewhere the human never sent it. So the
challenge is required on every handoff row and there is no second way to
redeem: the intermediate shape the section above says is "already closed" is
now closed by construction rather than by rule. The proof is compared inside
the component's own mutation, which is the only place it can be — the challenge
lives on the row, so nothing outside that transaction can check it before the
row is read, and returning it to compare elsewhere would hand it to whoever is
guessing.

**The entry route is a fourth anonymously reachable capability**, and
`anonymous-reach` was revised to say so. It is reached by a browser that has
never signed in — that is what it is for — and it fits the requirement's own
first limb unchanged: it reads only the public issuer registry, mints nothing,
and answers every caller alike because there is no caller yet for an answer to
be specific to. Revising the requirement is what that requirement demands of a
fourth entry, and doing it now is cheap in a way it will not be later: the
capability is still minted by an open, ADDED-only delta, so this is an edit
rather than a modification of a live spec. The alternative — a second
no-capability builder beside the one serving the published verification
material — was rejected because that builder's justification is that its body
receives no context at all, and an entry route that reads a registry would
hollow it out for the next route that wanted the same exemption.

**Two consequences are accepted rather than solved.** A page's calls now carry
`act` naming the Server it arrived through, which keeps attribution and the
call bound live on this path — but that bound is per issuer, so every signed-in
page on a team's Server shares one window with the Server's own calls. The
constants say a per-issuer limit is "a registration column and a second lookup
on the day one is actually wanted"; this is the first evidence that day is
coming. And redemption itself is no longer charged against any window, because
there is no assertion to identify an issuer by and a failed proof deliberately
identifies nothing: what bounds it is the verifier's entropy and the
reference's one-minute life, which is a different argument from the one the
assertion path made and is written down here so it is not mistaken for the same
one.

**One thing the browser side will owe, recorded before it is built.** The
verifier must survive a top-level navigation, so a page cannot hold it in
memory; session storage is the only home, and that is not a breach of
`client-credential-custody#memory-only`, which binds access tokens and game
credentials — a verifier is neither. But a page that finds a reference and *no*
stored verifier must discard the reference rather than try to redeem: without
that, a third party can navigate a victim to the entry address carrying a
challenge of their own choosing, and the victim's page would redeem a handoff
bound to a challenge it never generated.

**`beginSignInHandoff` is kept**, though the return route means it now has no
production caller. It is the surface's only mutation and its only
humans-only-by-default function, so it is the sole exemplar three scenarios are
tested against — kind checked independently of capability, no anonymous
mutation path, and UI gating not being enforcement — and deleting it would
leave those unassertable with no substitute until team administration lands
real session-authenticated mutations. That is the change which should decide
whether it still earns its place.

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

**Judged and deliberately not minted — the sign-in origin.** That Google
talks only to the platform's deployment is the shape constraint-mining looks
for: silently violable, and violated by the *natural* implementation. It is
not minted because `sole-credential-issuer` and `client-credential-custody`
already imply it twice over, and a third statement would be the duplication
the corpus forbids, carrying no authority the originals lack. What the
omission warranted was a design decision naming the origin, recorded above.

**Minted — the handoff that origin decision implies.** The same pass over
the same decision found a second lead that nothing implied, and
`sign-in-handoff` is it. Sending a human back to a Server needs an artifact
carrying *which human*, and the assertion exchange carries only *which
Server*; an implementation must therefore invent one, and the two ways to
get it wrong are both invisible in testing. A reference redeemable twice
works perfectly until someone captures a URL. A return address taken from
the request works perfectly until someone supplies a hostile one — and turns
the platform into a trusted-looking bounce to anywhere, with the reference
attached. Neither shows up as a failing test, and `trusted-issuer-registry`
had no field for a return address at all, so nothing would have caught the
second. That is the profile this section exists to find.

No further lead survived judgment: the remaining design content (wire
parameter names, claim encodings, key formats, callback step orderings,
helper signatures, and which library implements the issuance endpoint) is
mechanism whose violation is caught by the minted behavioural requirements
above.
