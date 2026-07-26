## Context

Migration change minting `team-server-management` from legacy modules 02,
03, 05, and 08 (23 ids, 1 review item), per the author-approved capability
map, dependency DAG (identity-and-authorization + team-management), and
assignment matrix. Legacy module 03's invitation-flow sections and module
02's nomination/healthcheck requirements are the core sources; legacy text
is binding, matrix intents are hints. This file records the decisions a
future reader cannot recover from the specs alone.

## Decisions

### Mint the capability rather than scatter the server story

The alternative was to leave nomination with team-management, invitations
with the lifecycle story, and the app/fork substance with a UI capability.
Reversed, "the team's server" — one thing a captain acquires, points the
platform at, and answers for — would have no single readable home: the
invitation contract (the platform's only outward protocol to third-party
infrastructure) would be split from the endpoint that receives it, and the
fork-compatibility surface would be split from the endpoints it
enumerates. The capability map's story row and the matrix assignment were
author-approved with the capability set.

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

### Nomination semantics here; nomination gates cited from team-management

The open sibling mint already authors who may change the nomination field
(team-management/captain-authority) and when it is frozen
(team-management/roster-freeze) — the field lives on the team record that
capability owns. This change authors what nomination *means*: unilateral
declaration with no server-side acceptance, no secret exchanged, validity
proven only at delivery, clearable, and required for play. Reversed —
re-stating the captain gate or the freeze here — the same rule would live
in two open changes, exactly the double-ownership the train's overlap
tripwire exists to prevent; conversely, pulling nomination semantics into
team-management would force that capability to describe invitation
delivery it has no vocabulary for.

### The delivery/acceptance split, and where refusal consequences went

The invitation surface is authored as four requirements at one behaviour
each — delivery (game-invitations), payload (invitation-credential-
carriage), the accept/reject contract (invitation-acceptance), and the
receiving endpoint's checks (invitation-endpoint-discipline) — because
the parties differ: the first two bind the platform, the third binds any
server (custom ones included), the fourth binds the reference
application. What a refusal *causes* — abort, forfeit, walkover — is
game-lifecycle's per the author routing, so acceptance is authored here
as a participation precondition ("the team proceeds only if its server
accepts") with no branching. Reversed — consequences authored here — this
capability would need game-status and tournament vocabulary its declared
dependencies do not reach, and since it does not own those consequences,
extending the declaration to reach them would be the wrong fix; the
lifecycle story would also have a hole where its start orchestration
branches.

### The ten-second window is contract, not tuning

The response window looks like a performance number, but it is a
cross-implementation protocol deadline: custom server authors must know
how long they have to decide acceptance, and the platform must know when
it may conclude non-acceptance. A number both sides must agree on is
behaviour, not plastic tuning — so it is stated in the requirement.
Reversed — left to code — a platform-side change would silently break
every conforming custom server. (The healthcheck's five-second call
timeout, by contrast, is one-sided platform tuning and stays in code.)

### Endpoint paths and payload shapes stay in code; their stability is spec'd

The literal well-known paths and the invitation payload's field list are
mechanism — but their *existence and stability* is exactly what a fork
must be able to rely on. That is authored as the forkable-reference-app
requirement's enumerated compatibility surface (invitation endpoint
contract, healthcheck contract, published library interfaces), with
#surface-changes-are-platform-changes making drift a deliberate breaking
change. Reversed — paths hard-coded in spec — every wire-level rename
becomes a spec change; reversed the other way — no stability requirement —
the fork story collapses, because "full source ownership" is only safe
while the platform-facing surface underneath it holds still.

### Healthcheck: unauthenticated and minimal, on-demand recording

The resolved legacy review chose unauthenticated reachability-only
healthchecks (option A): they answer one question, need no identity, and
keep global-invariants/credential-confinement exception-free.
The review's guidance that the payload stay minimal is elevated into the
#unauthenticated-and-minimal scenario because it is the condition the
decision rests on — if the payload ever carries team-scoped state, the
threat model changes and the unauthenticated choice must be revisited.
Recording is on-demand with the timestamp visible (no polling
obligation), per the binding module-05 text. Start-time branching on
health is excluded (lifecycle story). Reversed — an authenticated
healthcheck — something would have to issue the server a credential
outside the invitation channel, contradicting
global-invariants/credential-confinement. That invariant is also why the
requirement can state the flat absolute "callable without any credential"
and add no credential rule of its own: outside a hosted team's active
game a server holds nothing to authenticate with
(global-invariants/ephemeral-game-credentials#no-credentials-at-rest).

### gi-overlap handling (03-REQ-049, the static-host residue, shared hosting)

Five places this capability deliberately stops short of restating
existing global-invariants substance, citing the owner instead:
- 03-REQ-049's credential-scoping half (credentials per team+game, none
  at rest, expiry at game end) is already carried by
  global-invariants/ephemeral-game-credentials and
  identity-and-authorization/game-credential-scope; what is authored here
  is the genuinely local half — no server identity, no registry,
  domain-as-team-configuration. `no-server-identity` cites the gi
  requirement rather than repeat the scope: "no identity" is only a
  coherent claim while a server's whole platform privilege *is* its
  hosted teams' per-game credentials. Grant a server standing privilege
  and the standing credential becomes a de facto server identity.
- The module-02 static-host residue (visitor data through visitors' own
  connections; no server-held credentials outside games) is the same gi
  requirement's substance; the binding 02-REQ-059 text does not state it,
  so it is not re-authored here and the parked-ledger residue note closes
  against the gi requirement.
- The operator-trust half of shared hosting (the server operator sees
  hosted teams' strategies; co-tenant isolation is best-effort) is
  global-invariants/server-trust-boundary, which `shared-hosting` now
  cites where it permits opponents to share a server. The integration:
  shared-hosting's presentation contract (hosted-team context, refusal
  for unhosted teams, cross-server links resolving the nomination) is a
  *coherence* contract, not a security boundary — the refusal of an
  unhosted team's surface keeps users off a server with no session for
  them, and under the gi requirement it may never be read as isolating
  co-hosted teams from an operator who can bypass it anyway.
- `unified-web-application` originally restated gi
  access-follows-identity's "same data on every server" claim almost
  verbatim, scenario included. Its requirement text is thinned to the
  local substance — exactly one application, spanning platform-level and
  team-internal concerns, served by every server, with no separate
  platform application — and cites the gi requirement for what makes that
  shape workable: if data access ever depended on the serving server, one
  interchangeable app everywhere would be untenable and a privileged
  platform application would have to exist. `#same-data-any-server` is
  kept (an identifier-map anchor points at it) but re-pointed at the local
  half it can own: the serving server decides only where the application
  came from. Same argument one level up, in the Purpose's
  trust-model paragraph, which cites
  global-invariants/security-enforced-outside-the-library as the reason a
  hostile server's blast radius is bounded to what its own visitors could
  already read.
- `invitation-credential-carriage` originally carried a
  `#sole-secret-channel` scenario asserting invitations are the only
  platform-to-server message bearing a secret. That assertion is owned by
  global-invariants/credential-confinement
  (`#game-credential-has-one-delivery-path`), so the requirement drops it
  from its own text and the scenario — kept, since an identifier-map anchor
  points at it — now states the *consequence* an implementer needs instead:
  the nomination and healthcheck paths require no secret-handling
  discipline whatsoever. `invitation-endpoint-discipline` cites the same requirement's
  #signing-keys-never-leave-convex for a different reason: a third-party
  server can perform the forged-invitation check at all only because
  signing stays in Convex and the verification half is published.
Reversed in any of the five — the same invariant stated in two
capabilities — later modification would have to find and edit both, the
drift the per-identifier map exists to end.

### DNS-as-ownership-proof leans on the credential's blast radius

`game-invitations#dns-is-the-proof` accepts an unusually weak ownership
proof: resolve the domain, POST, no challenge. It is tolerable only
because of what a mis-delivery can yield —
global-invariants/ephemeral-game-credentials bounds it to one team's one
game, expiring at that game's end, never merging into broader privilege.
The scenario now cites that invariant rather than leaving the bounding
argument to be reconstructed. Relax the invariant to anything standing or
cross-game and DNS-only delivery would need a real challenge-response
handshake — which would in turn break nomination's secretlessness.

### 08-REQ-023f retires by dedupe onto the sibling's view requirement

The matrix assigned the id here, but its substance — the Team Management
view exposes no bot/heuristic/operator configuration — is fully authored
by the open sibling's team-management/team-management-view
(#management-is-not-play-configuration), which this capability may cite
as a dependency. The id retires with a map entry targeting that
requirement. Reversed — a parallel scope requirement here — two
capabilities would own one page's negative space, and the sibling's
"management is not play configuration" line would have a competing
authority.

## Constraint-mining (mandatory final step)

The five routed leads, each judged:

- **10s timeout + concurrent sends + one POST per team + HTTPS-only.**
  All four are invariants a future implementer could silently violate
  (sequential delivery stalls starts; a shared-server batch POST breaks
  the self-contained handler; plain HTTP leaks the credential in
  transit). Minted as team-server-management/game-invitations and its
  #one-invitation-per-team, #https-only, #bounded-concurrent-delivery
  scenarios.
- **Invite endpoint signature check / hosted-team check / idempotency.**
  DNS protects delivery but nothing else authenticates an inbound POST —
  an endpoint that skips the signature check will boot hosting sessions
  for forged invitations, and one that is not idempotent double-boots on
  Convex redelivery. Minted as
  team-server-management/invitation-endpoint-discipline
  (#forged-invitation-refused, #unhosted-team-refused,
  #duplicate-delivery-idempotent).
- **Credential handed in-process to the bot session manager.** The
  quality of the credential-custody story depends on the credential never
  crossing a process or storage boundary on the server; an implementer
  who persists it or exposes it over an internal HTTP hop widens the
  leak surface silently. Minted as #credential-stays-in-process, with
  identity-and-authorization/client-credential-custody cited for the
  memory-only discipline.
- **Hosted-teams-only routes vs cross-server deep links.** The unified-
  app decision only works if the two route families are kept distinct: a
  fork that renders team-internal live surfaces for unhosted teams shows
  a server that has no session for them, and one that links locally
  instead of resolving the nomination strands users on the wrong server.
  Minted as shared-hosting's #unhosted-team-surface-refused and
  #cross-server-links-resolve-the-nomination.
- **Fork-stable surface enumeration.** The fork model is safe only while
  the platform-facing surface is enumerated and stable — this is the
  requirement the whole forkable story hangs on. Minted as
  team-server-management/forkable-reference-app
  (#enumerated-surface-is-the-contract,
  #surface-changes-are-platform-changes).

Checked, plastic (stay in code with `// design:` references when the
implementation lands): the literal well-known paths and HTTP verbs, the
invitation payload's field list, the healthcheck call's five-second
timeout and 200-is-healthy convention, the whitelist config file format,
and the server-local in-memory store for accepted invitations.
