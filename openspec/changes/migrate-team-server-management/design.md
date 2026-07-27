## Context

Migration change minting `team-server-management` from legacy modules 02,
03, 05, and 08 (23 ids, 1 review item), per the author-approved capability
map, dependency DAG (identity-and-authorization + team-management), and
assignment matrix. Legacy module 03's server-authority sections and module
02's nomination/healthcheck requirements are the core sources; legacy text
is binding, matrix intents are hints. This file records the decisions a
future reader cannot recover from the specs alone.

## Decisions

### Mint the capability rather than scatter the server story

The alternative was to leave nomination with team-management, hosting with
the lifecycle story, and the app/fork substance with a UI capability.
Reversed, "the team's server" — one thing a captain acquires, points the
platform at, and answers for — would have no single readable home: the
consent that lets a server act for a team would be split from the
whitelist that is the server's half of it, and the fork-compatibility
surface would be split from the endpoints it enumerates. The capability
map's story row and the matrix assignment were author-approved with the
capability set.

### The trust trade-off is Purpose prose (author-resolved)

The accepted-exfiltration statement (a malicious server can serve client
code that exfiltrates whatever its visitors can legitimately read; users
must choose servers they trust) is not a falsifiable behaviour — there is
no scenario a test could break. Its enforceable shadow (nothing
server-controlled is ever a security enforcement point) was retired onto
the global-invariants enforcement-model requirement by the train's
extend-global-invariants change, which is also where the legacy id's map
entry lives; this change deliberately adds no second map entry. What lands
here is the user-facing statement of the accepted risk, as the Purpose's
trust-model paragraph, so the capability that invites users to trust
servers is the text that names the cost of that trust. Reversed — authored
as a requirement — validation would carry an untestable clause, and the
prose would still have to exist somewhere to explain it.

### Two-sided consent is the security property this capability exists to hold

A server acts for a team only where the captain named its domain *and* the
server, proving control of that domain, asked. Each fact alone is
deliberately inert, and each is worthless to an attacker holding only the
other: naming a domain you do not control produces no credential, because
no credential is issued without the private key behind that domain's
published material; and controlling a domain no captain named reaches no
team, because eligibility is not authority.

That is why naming can stay a plain field update with no handshake,
nothing to verify beyond "this domain publishes something that parses", and
no way for a captain to get it wrong dangerously. Reversed — either fact
alone sufficient — the capability turns into either a land-grab (any
domain-holder claims teams) or a hijack (any captain points a team at a
server that never agreed to operate it, and the platform issues against it).

### Registration is by domain, not by key

The platform records where a server publishes its material, not the
material itself. Three things follow, and all three are the reason:
rotation is a non-event (publish both, switch, drop the old) with nothing
to tell the platform; a server redeployed onto empty storage self-heals by
generating and publishing a new key; and control of the domain is re-proven
on every read rather than once, at registration. Reversed — the key
registered — every rotation and every ephemeral redeploy becomes a support
interaction with a captain who is a coach or a student.

### The ergonomic obligation is a requirement, not a note

`server-key-publication` states that key handling must be invisible in the
operator experience, and states the fallback if it cannot be: authenticate
servers by a platform-initiated challenge instead. That reads oddly in a
spec and is deliberate. The whole asymmetric design is worth having only
while onboarding stays "deploy it and name it"; a captain who has to
generate, copy, and register a key is a captain the product loses, and no
protocol elegance repays that in an educational tool. Written as a note it
would be dropped silently under implementation pressure — which is exactly
the moment the trade-off needs to be visible.

### Admission is the server's, asynchronous, and never modelled on the platform

The platform holds no approval step, no pending state, and no
representation of a server's whitelist; admitting a team to it is the
server's own act, and accepting that team's invitations follows from it.
That keeps the two halves of consent genuinely independent,
which is what lets an external system provision a team — create it, home it
on a Reference Centaur Server, and separately whitelist it through that
server's own administration API — with nothing synchronous between the two
and each half retryable on its own.

The alternative considered and rejected was a real-time join request to
which a server responds. It couples two systems synchronously on a path
that must not fail, and needs a callback protocol that exists for nothing
else. Reversed — admission modelled as platform state — the platform
acquires an approval workflow it cannot enforce, since the server can
decline simply by never asking.

The Reference Centaur Server not auto-admitting is the load-bearing default:
it is the one server every team can name without asking anyone, so an open
default would let unbounded teams conscript Cyphid's compute.

### Administrative issuers: the federation pattern, off the platform entirely

A server's administration API trusts *issuers* with capability ceilings,
configured locally on the server. An external system registers once and can
thereafter mint narrowly-scoped credentials for individual automations — a
roster sync receiving only the whitelist capability — with the server never
learning those automations exist and needing no configuration change when
they appear.

Worth recording explicitly: this path runs between an external system and a
non-platform component, with the platform not involved and holding no record
of it. That is evidence the peer model generalises rather than being a
special arrangement the platform mediates — and it is the reason not to
route whitelist administration through the platform for convenience.

Idempotency is required rather than left to implementations because the
caller is an automation pipeline: the natural retry after a timeout must not
need special-casing, and the natural implementation (insert, fail on
conflict) breaks it.

The requirement is scoped to the reference implementation because that is
where automated provisioning of the Reference Centaur Server actually
happens, and because the Server trust boundary leaves nothing else to scope
it to: what a third party's server exposes is outside anything the platform
observes or governs.

Endpoint paths, request shapes and capability names stay in code, under the
ordinary rule. Both ends of this contract are Cyphid's — a Cyphid system
administering a Cyphid-operated server — so they move together and there is
no cross-implementation deadline to pin. One note for whoever implements it:
the API is HTTP, because a Centaur Server runs no Convex deployment of its
own and the platform credential it does hold is scoped to one team and one
game, so nothing about administration can travel that way.

### The invitation is a doorbell, not a delivery

The platform sends a server exactly one thing: a bare notification, at game
start, naming a game and a team. It carries no credential, and the response
status is the whole answer. Everything the server can act on it obtains
afterwards, outward, with its own key.

The exchange survives because of what it is *for*. A server operating no team
currently playing should be able to cost nothing, and a server that has
scaled to zero cannot be holding a subscription to hear that a game has
started — nor could it authenticate to open one, since the credentials it
would need are exactly what it does not have while idle. Something has to
knock. *Reversed* — the server discovering its own games — a Centaur Server
must run continuously to be usable, which prices the educational progression
tier out of the free hosting most teams will start on.

What the redesign removes is not the exchange but everything the old one
carried. There is no credential in flight to a domain that might not be the
one intended; no signature for a third-party fork to verify, or skip; no
in-process credential-custody discipline; and no secret handling anywhere on
the endpoint. That is why the endpoint can be unauthenticated: forging an
invitation buys nothing but a wasted wake-up, because the server treats the
message as a prompt to go and ask rather than as something to believe.

It costs more round trips than handing a credential over inline. That is the
intended trade: the credential path is now the same one every other principal
uses, so a fork implements one standard flow instead of a bespoke receiving
protocol.

### Tenant separation is support for an operator, never a promise to a team

The library keeps each operated team's credentials reachable only by that team's compute, and offers no ambient client,
so an operator who wants co-tenants kept apart gets that by default rather
than having to build it. What the spec must not do is call it a security
property. A Centaur Server is third-party infrastructure: its operator can
replace the library, patch it, or write their own server against the raw
protocols, and the platform can detect none of it. Promising teams an
isolation the platform cannot enforce is exactly the unenforceable guarantee
`global-invariants/server-trust-boundary` exists to forbid, and the
requirement cites the scenario that forbids it so the boundary is legible at
the point of temptation.

So the requirement binds what we ship and says plainly what it is not. A team
weighing a shared home still weighs the operator, not the code.

The reference-heuristics rule sits inside the same frame. Team-supplied Drive
and Preference implementations running in a process holding other teams'
credentials undo the separation the library provides — so the reference
implementation does not do it, and a Cyphid-operated server operates on those
terms. A team wanting its own implementations runs its own server, where it
is the only tenant and there is nothing to undo. Another operator may choose
differently and nothing stops them; the teams homed there are relying on that
operator's judgement, which is what choosing a home server means. *Reversed*
— the rule written as a platform guarantee — the spec would be asserting
behaviour of software it does not control.

### A server holds no user state at all

`no-operator-state` is stated positively because the alternative is a
specific, tempting, and expensive mistake: having the server authenticate
its operators. That would need every self-hosted server to register its own
identity-provider client — a secret per server, created by hand by a coach —
which is both a shared secret and an onboarding step that loses teams.

It is safe to hold no user state precisely because the server is not the
gatekeeper: the operator application and the bot code both talk to the
platform and to the game's instance directly, so a server that served the
application to the wrong person exposes nothing. That is also what makes
multi-tenancy tolerable at all — most team isolation is enforced by the
platform, and the server has nothing to leak by serving.

### A Cyphid-operated home, with no privilege attached

`reference-server-home` closes a real gap: playing requires a home server,
and a newly founded team has no infrastructure. Cyphid operating one is the
answer, and stating it as a requirement rather than an operational habit is
deliberate — it is a commitment teams depend on to start playing at all.

Its cost is concentration: one domain's transport and DNS posture protects
every team homed on it, making that the most security-sensitive operational
surface the system has. The requirement records the concentration rather
than pretending it away, and what bounds it is that the worst a compromised
server can do for a team it operates is play badly, since team
administration is barred to it by principal kind.

### Endpoint paths stay in code; their stability is spec'd

The literal well-known paths are mechanism — but their *existence and
stability* is exactly what a fork must be able to rely on. That is authored
as the forkable-reference-app requirement's enumerated compatibility surface
(the published key document, the healthcheck contract, the published library
interfaces), with #surface-changes-are-platform-changes making drift a
deliberate breaking change. Reversed — paths hard-coded in spec — every
wire-level rename becomes a spec change; reversed the other way — no
stability requirement — the fork story collapses, because "full source
ownership" is only safe while the platform-facing surface underneath it
holds still.

### Healthcheck: unauthenticated and minimal, on-demand recording

The resolved legacy review chose unauthenticated reachability-only
healthchecks (option A): they answer one question, need no identity, and
keep global-invariants/credential-confinement exception-free. The review's
guidance that the payload stay minimal is elevated into the
#unauthenticated-and-minimal scenario because it is the condition the
decision rests on — if the payload ever carries team-scoped state, the
threat model changes and the unauthenticated choice must be revisited.
Recording is on-demand with the timestamp visible (no polling obligation),
per the binding module-05 text. Start-time branching on health is excluded
(lifecycle story). Reversed — an authenticated healthcheck — the platform
would have to hold a credential for each server it checks, which is a
credential nothing else in the design needs.

### gi-overlap handling

Four places this capability deliberately stops short of restating existing
global-invariants substance, citing the owner instead:

- 03-REQ-049's credential-scoping half is carried by
  global-invariants/ephemeral-game-credentials and
  identity-and-authorization/game-credential-scope; what is authored here is
  the genuinely local half — the two facts that must both hold, and the fact
  that a server's domain identity confers nothing on its own.
  `two-sided-consent` cites the gi requirement rather than repeat the scope:
  "the domain is not authority" is only a coherent claim while a server's
  whole platform privilege *is* its hosted teams' short-lived sessions.
- The module-02 static-host residue (visitor data through visitors' own
  connections) is `no-operator-state`'s second scenario plus the gi
  credential requirements; the binding 02-REQ-059 text does not state it, so
  it is not re-authored, and the parked-ledger residue note closes against
  the gi requirement.
- The operator-trust half of shared hosting is
  global-invariants/server-trust-boundary, which `shared-hosting` cites
  where it permits opponents to share a server. The integration:
  shared-hosting's presentation contract (hosted-team context, refusal for
  unhosted teams, cross-server links resolving the home) is a *coherence*
  contract, not a security boundary — and neither is
  `library-tenant-separation`, which cites the gi scenario that says so.
- `unified-web-application` states only the local substance — exactly one
  application, spanning platform-level and team-internal concerns, served by
  every server — and cites gi access-follows-identity for what makes that
  shape workable: if data access ever depended on the serving server, one
  interchangeable app everywhere would be untenable and a privileged
  platform application would have to exist.

Reversed in any of the four — the same invariant stated in two capabilities
— later modification would have to find and edit both, the drift the
per-identifier map exists to end.

### 08-REQ-023f retires by dedupe onto the sibling's view requirement

The matrix assigned the id here, but its substance — the Team Management
view exposes no bot/heuristic/operator configuration — is fully authored by
the open sibling's team-management/team-management-view
(#management-is-not-play-configuration), which this capability may cite as a
dependency. The id retires with a map entry targeting that requirement.
Reversed — a parallel scope requirement here — two capabilities would own
one page's negative space, and the sibling's "management is not play
configuration" line would have a competing authority.

## Constraint-mining (mandatory final step)

The routed leads, each judged:

- **Key handling must be invisible.** Silently violable by the most natural
  implementation — read a key from an environment variable and document how
  to generate one. Minted as team-server-management/server-key-publication
  with #first-boot-needs-no-operator and #ephemeral-storage-self-heals.
- **The invitation confers nothing.** An endpoint that treats the message
  as authorization — starting a hosting session, or requesting credentials,
  on the strength of the request alone — is the natural implementation and
  is wrong. Minted as
  game-invitations#the-invitation-carries-no-authority and
  invitation-acceptance#accepting-then-authenticating.
- **A sleeping server must be reachable within the window.** The ten-second
  window is a cross-implementation deadline both sides must agree on, and it
  now has to accommodate a cold start; a platform-side change to it silently
  breaks every conforming fork. Minted as
  game-invitations#bounded-concurrent-delivery and #wakes-a-sleeping-server.
- **Neither half of consent confers anything alone.** The failure is
  asymmetric and quiet: an implementation that issues on the homing record
  alone looks correct until someone names a domain they do not control, and
  one that issues on domain proof alone looks correct until a server asks
  for a team that never chose it. Minted as
  team-server-management/two-sided-consent and both its negative scenarios.
- **Whitelist administration must be idempotent.** The caller is a retrying
  pipeline and the natural implementation is not idempotent. Minted as
  server-administration-api#adding-an-already-whitelisted-team-succeeds.
- **The administration API enforces the issuer's ceiling.** An
  implementation that verifies the signature and proceeds passes every test
  written against a well-behaved issuer. Minted as
  #capabilities-beyond-the-ceiling-are-refused.
- **One session per tenant in the library we ship.** The natural
  implementation of a multi-tenant client is one ambient client, and it
  undoes the separation invisibly. Minted as
  team-server-management/library-tenant-separation — bounded by
  #still-not-a-guarantee, since the property is the library's and not the
  platform's — with reference-heuristics-on-shared-hosting as the condition
  that keeps it true where we do control the code.
- **Hosted-teams-only routes vs cross-server deep links.** The unified-app
  decision only works if the two route families are kept distinct: a fork
  that renders team-internal live surfaces for unhosted teams shows a server
  with no session for them, and one that links locally instead of resolving
  the home strands users on the wrong server. Minted as shared-hosting's
  #unhosted-team-surface-refused and #cross-server-links-resolve-the-home.
- **Fork-stable surface enumeration.** The fork model is safe only while the
  platform-facing surface is enumerated and stable — this is the requirement
  the whole forkable story hangs on. Minted as
  team-server-management/forkable-reference-app
  (#enumerated-surface-is-the-contract, #surface-changes-are-platform-changes).

Checked, plastic (stay in code with `// design:` references when the
implementation lands): the literal well-known paths and HTTP verbs, the
healthcheck call's five-second timeout and 200-is-healthy convention, how
far ahead of expiry a session is renewed, the whitelist store's format, and
the administration API's request shapes.
