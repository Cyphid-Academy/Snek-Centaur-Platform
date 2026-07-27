## Why

Fourth change of the final spec-migration train. The "team acquires and
runs its Snek Centaur Server" story — naming a home server domain, the
hosting relationship and the consent that establishes it, the server's key
publication and whitelist, its administration API, the healthcheck, and the
forkable reference application — has no vocabulary owner today: its
substance is scattered across module 02 (nomination, the healthcheck
endpoint, the many-to-many hosting relationship, the unified app's scope),
module 03 (how a server comes to act for a team, and the no-secret rule),
module 05 (nomination mechanics and healthcheck recording), and module 08
(multi-team hosting in the app, the forkable repository). Re-authoring it as
one capability puts the whole workflow in one readable place and retires 23
legacy ids plus one review item.

## Carving decision

Mint **`team-server-management`** exactly as drawn in the capability map
and assignment matrix (author-approved with the capability set and DAG).
The legacy requirements and review items this change absorbs are recorded
in the identifier map under this change's name (08-REQ-001 retires as a
dedupe of 02-REQ-059). Declared dependencies:
**identity-and-authorization, team-management, and global-invariants** —
the last because several of this capability's requirements are sound only
while named cross-cutting invariants hold (server trust terms, credential
ephemerality and confinement, issuer-anchored trust, enforcement living
outside the served application). The declaration is an affordance extended
whenever a citation is warranted, not a fixed allowance.

Deliberate boundaries:

- **What a missing operating server means for a game is not authored
  here.** This capability authors homing, admission, and what it takes for
  a server to act for a team; whether a team without an operating server
  costs the launch, its seat, or the round is the game-lifecycle story's,
  per the author decision routing legacy 03-REQ-056 there.
- **Start-time healthcheck branching is not authored here.** The
  healthcheck requirement covers the endpoint contract and availability
  reporting only; how a game start reacts to an unhealthy server (legacy
  05-REQ-036 and its review item) is likewise the lifecycle story's.
- **The credential mechanism is cited, not re-owned.** How a service
  principal proves who it is, what its session may reach, and how
  capabilities are carried belong to identity-and-authorization. This
  capability authors what is specific to servers: the key they publish, the
  two facts that must both hold, the whitelist, and the administration
  surface.
- **Nomination gate mechanics are cited, not re-owned.** The open sibling
  mint `team-management` already authors the captain-only gate over the
  homing field (team-management/captain-authority) and its mid-game freeze
  (team-management/roster-freeze); this capability authors the *semantics*
  of naming a home and cites those gates.
- **The trust trade-off is Purpose prose, not a requirement.** Legacy
  03-REQ-067 (a malicious server can exfiltrate what its visitors can
  legitimately read; the platform accepts this) is not falsifiable
  behaviour. Its enforceable half was retired onto the global-invariants
  enforcement-model requirement by the train's extend-global-invariants
  change; the user-facing trust statement lands here as the Purpose's
  trust-model paragraph, per the author-resolved matrix question.
- **08-REQ-023f retires onto the sibling's view requirement.** Its
  substance (the Team Management view exposes no bot/heuristic/operator
  configuration) is fully authored by the open sibling's
  team-management/team-management-view; this change retires the id as a
  dedupe map entry targeting that requirement rather than double-owning
  the scope rule.
- **The static-host residue is not re-authored.** Module 02's parked
  plain-text residue (visitor data flows through visitors' own
  connections) is carried by `no-operator-state` and by the
  global-invariants credential requirements; the unified-app requirement
  here stays to the binding scope substance — one application, spanning
  both concerns, served by every server — and cites
  global-invariants/access-follows-identity for the data-sameness half
  instead of restating it.

## What Changes

- **New capability `team-server-management`** (mint delta, ADDED-only, 17
  requirements): the captain's naming of a home domain and the homing
  record it creates, the naming-to-play gate (no pure-human teams), the
  two-sided consent that alone lets a server act for a team, automatic
  keypair generation and publication with the ergonomic obligation that
  guards it, the server's own admission decision and its order-independence
  from homing, the homing inbox, the credential-free game-start invitation
  that wakes a server and the acceptance it answers with, the many-to-many
  shared-hosting relationship with hosted-team-scoped surfaces, the absence
  of any user state on a server, the Cyphid-operated Reference Centaur
  Server as a home for teams without infrastructure, the unauthenticated
  minimal healthcheck with on-demand recording, the single unified web
  application every server serves, and the forkable reference app with its
  enumerated fork-stable compatibility surface. Three requirements bind the
  implementation Cyphid ships rather than every server, because the platform
  can neither require nor detect them on a third party's: the administration
  API with its administrative issuers and idempotent admit/remove
  operations, the library's per-team credential separation, and
  reference-heuristics-only on shared hosting.
- **UI mirrors folded**: the lobby healthcheck-ping affordance
  (08-REQ-027g) becomes the #member-triggered-check scenario of the
  healthcheck requirement, phrased surface-generically so this capability
  never names downstream room vocabulary.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`. 03-REQ-067 gains no entry here —
  its map entry is authored by extend-global-invariants; this change only
  lands its Purpose prose.

## Impact

- New: `openspec/changes/migrate-team-server-management/specs/team-server-management/spec.md`
  (folded to `openspec/specs/team-server-management/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `team-server-management` (at archive).
- Code citations: homing mutations, the key-publication and healthcheck
  endpoints, the administration API, the per-team-per-game credential
  handling in the server library, and the reference-app packaging gain
  `// spec: team-server-management/...` citations when the implementation
  lands.

## Open Questions

None. The carving, the DAG position, and the boundary rulings above were
settled with the author, and nothing in re-authoring this story from the
legacy text surfaced a contradiction or gap needing a fresh decision.
