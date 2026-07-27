# Design — migrate-platform-integrations

## Context

This change mints the train's last capability from 22 legacy ids across
modules 03 (programmatic authorization), 05 (the integration surface and
webhooks — the core), and 08 (the management view), plus one resolved review
decision.
Legacy text was binding throughout; the assignment matrix supplied routing
only. The decisions below record how the substance compressed to 10
requirements at intent grain, where the boundaries fall, and the
reconciliations performed.

## Decisions

### Leaf of the DAG: peer stories cited sparingly, the meta layer where soundness needs it

The capability declares **Depends on: identity-and-authorization,
game-lifecycle, global-invariants**. It cites six requirements of the two
story capabilities: `platform-admin-role` (the role registration is gated
on and the observational bound a client must respect),
`service-principal-assertions` and `trusted-issuer-registry` (how a client
proves who it is and where its ceiling is recorded),
`peer-capability-ceiling` and `principal-kind-gating` (what no client's
ceiling may reach), `mutation-authorization` (parity is enforced at the
same server-side contracts), `launch-orchestration` (the API's game-start
is the same launch), `status-authority` (the transitions webhooks fire
on), and `teardown-after-persistence` (what delivery must never delay).
`global-invariants` joined the declaration when the four invariant
citations recorded below proved warranted: the declaration is an
affordance, extended whenever a citation is genuinely warranted, never a
budget that would force this capability to restate a rule it cannot
reach.

The teams and rooms the API administers are named as vocabulary only:
their rules live in team-management and rooms-and-matchmaking, peer
stories this capability does not cite — the parity requirement is the
deliberate indirection that binds the API to those rules without naming
them. *If reversed* — citing team-management or rooms-and-matchmaking for
the surface families — the lint's dependency/acyclicity check fails, and
worse, every future capability whose objects the API might someday
administer would become a dependency, making the leaf a hub. That is the
distinction that matters here: extending the declaration *upward* to the
meta layer keeps a leaf a leaf, while extending it *sideways* into peer
stories would not.

### Which invariants this surface's soundness rests on

- **`first-party-parity` → `global-invariants/one-contract-many-surfaces`.**
  gi is the only home of the cross-surface no-private-bypass rule, and
  parity's soundness is exactly that rule: without it, "the same
  invariants as the equivalent first-party action" is satisfiable by a
  proxy layer that re-implements the validations itself and drifts — which
  is the failure parity exists to prevent, and which this capability now
  forecloses structurally by having no proxy at all. The requirement
  therefore no longer restates "subject to the same invariants, enforced
  server-side";
  it cites the owner (alongside `mutation-authorization`, the
  server-side-at-the-function-contract rule for platform state) and keeps
  only what is local to this surface: a client's ceiling widens *who* may
  act, never *what* the rules permit, and the API
  dispatches against the one contract rather than a copy of it. Both
  scenarios stay: `#no-privileged-bypass` and `#two-doors-one-rulebook`
  pin the two drift directions on this surface concretely, which gi's
  general scenario does not.
- **`integration-clients` → `global-invariants/authenticated-unambiguous-identity`.**
  A client is a principal of its own kind, and platform code must be able
  to tell that kind from a human's without guesswork — which is exactly
  what the closed enumeration guarantees. Relax the closure and the
  principal-kind checks that bar a client from authentication
  configuration lose the thing they test against.
- **`client-capability-bounds` → `global-invariants/credential-confinement`.**
  The bound "no client issues access tokens for a human or a team" depends
  on an issued credential reaching only the party whose own authentication
  earned it: an API able to mint one for someone else is precisely the
  second channel that rule forecloses. The requirement's other exclusion —
  Centaur state — holds `global-invariants/team-private-centaur-state` at
  this surface: a client reading a team's configuration or recorded
  deliberation would be a surface widening a team-private read scope,
  which is why the exclusion is absolute here rather than deferred to the
  admin role's read breadth.
- **`non-blocking-delivery` → `global-invariants/game-instance-hermeticity`.**
  Webhook delivery is Convex's act, never a game instance's: the
  instance's only sanctioned egress is its game-end notification with the
  finished record, so a third-party subscriber cannot be inside the
  instance's own terminal path. That placement is what makes "lifecycle
  handling completes on its own terms, deliveries proceed after it"
  deliverable rather than aspirational — with hermeticity relaxed,
  delivery could legitimately be implemented as instance egress and an
  unresponsive endpoint would sit directly between game end and teardown.
- **Declined.** `client-registration` → `credential-confinement` was
  weighed and not taken: the registration record holds nothing secret, so
  the rule governing how credentials reach their holders has nothing to
  bear on it. What remains local is the record's contents and the fact
  that all of them are presentable.

### Clients act as themselves, not as the admin who registered them

The legacy resolved position — creation is admin-only, no per-key scope
machinery — is carried, but what a client *is* changes. In the legacy
design a key was welded to its creator's user record and carried that
person's authority, re-checked on every request. Now a client is a principal of its
own with a recorded ceiling, and the registrar's standing is irrelevant to
it afterwards.

Two things drove that. A bearer key is a shared secret, which the platform
no longer has anywhere; and a credential that carries a person's authority
while being held by a service is precisely the arrangement that makes a
compromised integration indistinguishable from a compromised admin.
*Reversed* — the client acting as its registrar — the surface reacquires
both properties at once, and its blast radius is whatever the most senior
admin who ever registered something can do.

The property the old model bought — a key stops working when its creator
loses admin — is not lost so much as made unnecessary: there is no
inherited authority to revoke, only a registration to revoke, and
`client-management#revocation-immediate` covers that directly. What
revocation cannot do instantly is invalidate a credential already issued;
that is the standing trade of self-contained credentials, and the reason
their lifetime is minutes.

`client-capability-bounds` keeps the exclusions that are absolute — identity
creation, authentication configuration, issuing credentials for a human or a
team, Centaur state, anything inside a game — and grants everything else on
the ceiling. Team administration is squarely in the grantable set: the
motivating integration is an academy system that owns its classes, and it
must be able to create teams, name their captains and coaches, and follow
enrolment as it changes. The exclusions bound what a compromised client could
do irreversibly to authority the platform itself is the source of truth for —
who a person is, what may authenticate as them — and a system administering
the teams it created is not that. *Reversed* — team administration excluded
too — the roster automation goes back to a human clicking through the
first-party application, which is the friction this surface exists to
remove.

### The function surface is the API; there is no proxy to keep in step

The legacy design had an HTTP API in front of the platform: a route per
affordance, its own authorization, its own request and response shapes. That
is deleted rather than re-specified. A registered client calls the platform's
public functions directly, and a capability names the functions it reaches —
which is the same alignment the capability registry already requires of every
public function, so the integration surface costs nothing extra to define and
nothing at all to keep current.

What the proxy was buying was a place to put authorization for external
callers. Credentials carrying a structured capability claim put that
somewhere better: at the function, where the first-party caller's
authorization already lives. What the proxy was costing was a second surface
that has to be extended for every new affordance, that can lag, and whose
validations can drift from the ones behind them. *Reversed* — the proxy kept
— every automatable behaviour is built twice, and `first-party-parity` goes
from structurally true to a discipline someone has to maintain.

`functions-are-the-api` therefore enumerates families as a *floor* on what
must be reachable (teams, rooms, game read and start, webhooks, client
registrations) and says nothing about shapes: there are no wire shapes of
this capability's own left to specify.

### Parity as the API's one rulebook clause

The legacy parity id named the roster freeze as its example; authored
generically per the author's note, because the substance is the *general*
guarantee — the API is a second door to the same rules — and citing one
peer capability's rule would reach sideways for something the meta layer
already owns, and invite enumerating every invariant, which is exactly the
drift parity exists to prevent. The two scenarios pin both failure directions (API-permissive
and API-restrictive drift). *If reversed* into an enumerated invariant
list, every new platform rule would need a matching API-spec edit, and
any omission would read as an API exemption.

### The two-event model and the deliberate silence at creation

Webhooks fire on exactly the two status transitions game-lifecycle
defines: `game_start` at `playing`, `game_end` at `finished`. The legacy
review's resolved decision — no `game_created` or `game_will_start`
event — is encoded as `#no-creation-event`, with its rationale made
behavioural in `#start-payload-is-the-played-config`: before launch,
configuration is still editable, so a creation-time event would broadcast
a config nobody is bound to; at the `playing` transition the payload
carries the launch-frozen config an integrator can act on. *If reversed*
(adding a creation event), subscribers gain a channel that leaks
pre-launch, still-mutable state and learn of games that may never be
played — and the "first thing heard is game_start" contract external
automation was told to rely on breaks. Walkovers were considered:
`not-started → finished` is a `finished` transition, so a `game_end` for
a game with no preceding `game_start` is possible and correct — a
subscriber contract worth knowing, left as a consequence of citing
status-authority rather than restated.

### Delivery semantics: at-least-once with a stable dedup identity

At-least-once with exponential backoff and a bounded budget is carried
from legacy verbatim (the concrete retry schedule — counts, intervals —
is mechanism). The subscriber-side contract that makes at-least-once
usable is the dedup identifier, minted below. Auto-revocation of
subscriptions with their owning client lives in `webhook-subscriptions` so
the registration lifecycle and the subscription lifecycle cannot be implemented
apart; delivery's independence from the lifecycle lives in its own
requirement (`non-blocking-delivery`) because it constrains the
*lifecycle* side of the seam — it is the one clause a game-lifecycle
implementer could violate without ever touching webhook code. *If
reversed* (best-effort-once delivery, or lifecycle awaiting delivery),
either subscribers silently miss games, or an unresponsive third-party
endpoint gains the power to hold up replay persistence and teardown —
an external dependency inside the platform's own terminal handling.

## Constraint-mining (mandatory final step)

Each routed lead was judged: does a design decision's quality depend on
an invariant a future implementer could silently violate?

1. **A client's reach never tracks its registrar's standing** —
   *minted*: `integration-clients` text +
   `#a-client-is-not-its-registrar`. The natural implementation of an
   admin-created client is to let it act as its creator, which quietly
   turns every integration into a standing impersonation of a person. What
   breaks if violated: a compromised integration is indistinguishable from
   a compromised admin, and its reach grows whenever its registrar's does.
2. **Revocation immediate; revoked records retained for audit** —
   *minted*: `client-management#revocation-immediate` and
   `#revoked-records-retained`. Revocation is the only lever there is —
   there is no secret to rotate — so it must bite on the next request
   rather than at the end of some cache interval, and the record is the
   only evidence a client ever existed. What breaks: a validity cache
   extends a revoked client's reach past the decision to end it; deleting
   records destroys the audit trail of what could act, with what ceiling,
   and when.
3. **Dedup-identifier stability** — *minted*:
   `at-least-once-delivery#same-id-on-every-redelivery`, stated as
   determination solely by (game, event type, subscription) with
   cross-event uniqueness; the legacy concrete format
   (`{gameId}:{eventType}:{webhookId}`) is one valid mechanism. The
   at-least-once decision is acceptable *only because* subscribers can
   deduplicate; an implementer who mints a fresh identifier per attempt
   (e.g. per delivery-attempt row) silently turns retries into
   duplicate events. What breaks: every retry after a
   processed-but-timed-out delivery fires the subscriber's automation
   twice.

No further lead survived judgment: retry schedules, registration shapes,
algorithms, scheduler decoupling, and endpoint/payload shapes are
mechanism whose violation is caught by the minted behavioural
requirements above.
