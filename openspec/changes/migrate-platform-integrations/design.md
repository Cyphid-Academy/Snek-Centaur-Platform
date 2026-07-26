# Design — migrate-platform-integrations

## Context

This change mints the train's last capability from 22 legacy ids across
modules 03 (API-key authorization), 05 (HTTP API and webhooks — the core),
and 08 (the key-management view), plus one resolved review decision.
Legacy text was binding throughout; the assignment matrix supplied routing
only. The decisions below record how the substance compressed to 10
requirements at intent grain, where the boundaries fall, and the
reconciliations performed.

## Decisions

### Leaf of the DAG: peer stories cited sparingly, the meta layer where soundness needs it

The capability declares **Depends on: identity-and-authorization,
game-lifecycle, global-invariants**. It cites six requirements of the two
story capabilities: `platform-admin-role` (the role keys are gated on and
the observational bound keys must respect), `client-credential-custody` (key
plaintext hygiene), `mutation-authorization` (parity is enforced at the
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
  invariants as the equivalent first-party action" is satisfiable by an
  HTTP layer that re-implements the validations itself and drifts — which
  is the failure parity exists to prevent. The requirement therefore no
  longer restates "subject to the same invariants, enforced server-side";
  it cites the owner (alongside `mutation-authorization`, the
  server-side-at-the-function-contract rule for platform state) and keeps
  only what is local to a key-authorized surface: a key's global scope
  widens *who* may act, never *what* the rules permit, and the API
  dispatches against the one contract rather than a copy of it. Both
  scenarios stay: `#no-privileged-bypass` and `#two-doors-one-rulebook`
  pin the two drift directions on this surface concretely, which gi's
  general scenario does not.
- **`admin-api-keys` → `global-invariants/authenticated-unambiguous-identity`.**
  A key is welded to its creator's user record rather than being a
  principal in its own right, and that shape is available only because gi
  closes the kinds of identity platform code may meet at human, Centaur
  Team, and derived game participant. Relax that closure and "API client"
  becomes an admissible fourth kind — at which point binding a key to its
  creator, and re-checking the creator's role on every request, read as
  arbitrary self-restraint rather than the only shape the platform's
  identity model affords.
- **`key-capability-bounds` → `global-invariants/credential-confinement`.**
  The bound "no key issues game access tokens" depends on a per-team game
  credential having exactly one delivery channel: an API able to mint one
  would be a second channel, so relaxing the confinement rule dissolves
  the prohibition's point. The requirement's other exclusion — Centaur
  state — holds `global-invariants/team-private-centaur-state` at this
  surface: a globally scoped bearer credential reading a team's
  configuration or recorded deliberation would be precisely a surface
  widening a team-private read scope, which is why the exclusion is
  absolute here rather than deferred to the admin role's read breadth.
- **`non-blocking-delivery` → `global-invariants/game-instance-hermeticity`.**
  Webhook delivery is Convex's act, never a game instance's: the
  instance's only sanctioned egress is its game-end notification with the
  finished record, so a third-party subscriber cannot be inside the
  instance's own terminal path. That placement is what makes "lifecycle
  handling completes on its own terms, deliveries proceed after it"
  deliverable rather than aspirational — with hermeticity relaxed,
  delivery could legitimately be implemented as instance egress and an
  unresponsive endpoint would sit directly between game end and teardown.
- **Declined.** `key-custody` → `credential-confinement` was weighed and
  not taken: the ground key-custody depends on is the *designed one-time
  disclosure*, owned by `identity-and-authorization/client-credential-custody`,
  which it cites; gi's confinement rule governs channels this requirement
  forecloses outright rather than depends on. Its "never stored,
  displayed, or transmitted afterwards" clause was a verbatim restatement
  of that cited peer and is gone; what remains local is digest-only
  storage, the per-key record's contents, and the copy affordance.

### Admin-only keys, reconciled with the observational admin

The legacy corpus's own resolved review position (admin-only
simplification) is carried as binding: keys are created only by admins,
bound to their creator, global in scope. Two reconciliations follow:

- **The module 08 view text predates the resolution** ("accessible to
  every authenticated user", scope "bounded by the user's own current
  authorization scope"). Re-authored admin-only: the management surface
  is an admin affordance, and the scope communication becomes "the key
  carries its creator's global admin authority and dies with it" —
  which is the same user-facing lesson the legacy id taught (losing the
  role reduces what your keys can do), specialized to the admin-only
  model.
- **"Full platform access equivalent to the admin role" is not restated
  verbatim.** The identity capability's admin role extends *read* access
  only and is strictly observational over game and Centaur state; an
  unqualified "equivalent to admin" scope for a *mutating* API would
  contradict it. The spec instead states the scope as: global (never
  scoped down), with the API's mutating reach being exactly its
  management surface, and gameplay/Centaur state unreachable
  (`key-capability-bounds`). This preserves the legacy intent — no
  per-key scope machinery, no partial keys — without minting a mutation
  power the admin role was deliberately denied. *If reversed* (scope
  stated as "everything an admin is plus mutations"), the admin role's
  safety story — grantable casually because it cannot act — silently
  breaks the moment a role-holder mints a key.

### Endpoint families are scope, not endpoint specs

Per the author decision, `http-api-surface` enumerates the families that
must be administrable programmatically (teams, rooms, game read/start,
webhooks, keys) and nothing about URL shapes, payload schemas, HTTP
methods, or status codes — the legacy design's `/api/v1/*` tables are
mechanism, owned by code. The scenario `#the-families-are-a-floor` pins
the behavioural substance: an integrator never needs the first-party app
for these families. *If reversed* (endpoint shapes in spec), every
routing or schema refactor reads falsely as a behavioural spec change,
and the spec competes with code as the source of truth for the wire
format. The key-generation format (prefix, encoding) and digest algorithm
are likewise mechanism behind `key-custody`'s "form from which the key
material cannot be recovered".

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
subscriptions with their owning key lives in `webhook-subscriptions` so
the key lifecycle and the subscription lifecycle cannot be implemented
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

1. **Key validation re-checks the creator is still an admin on every
   request** — *minted*: `admin-api-keys` text +
   `#creator-no-longer-admin`. The admin-only model is safe *only
   because* a key's authority tracks its creator's current standing; an
   implementer who checks admin-ness at creation time only leaves orphan
   keys with global scope after a role removal. What breaks if violated:
   removing an admin no longer removes their automation's power — the
   exact event revocation-by-role-loss exists for.
2. **Revocation immediate; revoked records retained for audit** —
   *minted*: `key-management#revocation-immediate` and
   `#revoked-records-retained`. Hash-only storage means a leaked key can
   only be killed, never rotated in place — so the kill must be
   instantaneous; and because plaintext is unrecoverable, the record is
   the only evidence a key ever existed. What breaks: a validity cache
   gives a leaked key a live window after its revocation; deleting
   records destroys the audit trail of what could have acted as admin,
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

No further lead survived judgment: retry schedules, key formats, digest
algorithms, scheduler decoupling, and endpoint/payload shapes are
mechanism whose violation is caught by the minted behavioural
requirements above.
