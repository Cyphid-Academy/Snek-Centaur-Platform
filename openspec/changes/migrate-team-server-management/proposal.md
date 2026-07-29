## Why

Fourth change of the final spec-migration train. The "team acquires and
runs its Snek Centaur Server" story — naming a home server domain, the
hosting relationship and the consent that establishes it, the server's own
admission decision, the invitation that wakes it, and the availability the
platform records for it — has no vocabulary owner today: its
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

- **What a server *is* is not authored here (added by
  `mint-centaur-server-runtime`).** This change originally carried seven
  requirements about the artifact rather than the story — key publication,
  the administration API, the library's tenant separation, the
  reference-heuristics policy, the absence of identity state, the liveness
  endpoint, and the forkable repository with its compatibility surface. Every
  one of them reads identically for a server that has been named by nobody and
  admitted nobody, so none of them is part of a team's acquisition of a
  server; they now live in `centaur-server-runtime`, which this capability
  declares. `server-healthcheck` keeps its slug and the platform's half of the
  contract — the recorded status, its timestamp, the on-demand check — while
  the endpoint itself is `centaur-server-runtime/healthcheck-endpoint`. *There
  is exactly one web application* moved likewise, to `application-shell`.

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
  connections) is carried by `centaur-server-runtime/no-operator-state` and
  by the global-invariants credential requirements; the unified-app
  requirement — now `application-shell/unified-web-application` — stays to
  the binding scope substance (one application, spanning both concerns,
  served by every server) and cites
  global-invariants/access-follows-identity for the data-sameness half
  instead of restating it.

## What Changes

- **New capability `team-server-management`** (mint delta, ADDED-only, 10
  requirements): the captain's naming of a home domain and the homing
  record it creates, the naming-to-play gate (no pure-human teams), the
  two-sided consent that alone lets a server act for a team, the server's
  own admission decision and its order-independence from homing, the homing
  inbox, the credential-free game-start invitation that wakes a server and
  the acceptance it answers with, the many-to-many shared-hosting
  relationship with hosted-team-scoped surfaces, the Cyphid-operated Reference Centaur
  Server as a home for teams without infrastructure, and the platform's
  on-demand recording of a home domain's availability. The three
  platform-facing paths (`/.well-known/snek-game-invite`,
  `/.well-known/snek-server-keys`, `/.well-known/snek-healthcheck`) are named
  by `centaur-server-runtime`'s fork-compatibility surface; this capability
  builds the platform's side of the exchanges that use them.
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
- Code citations: homing mutations, the invitation sender, the on-demand
  health check, and the per-team-per-game credential handling in the server
  library gain `// spec: team-server-management/...` citations when the
  implementation lands. The citations on the server's own endpoints, its
  packaging and its administration API now name `centaur-server-runtime`.

## Open Questions

### 1. Which path the healthcheck lives at, platform-wide — RESOLVED

**Context.** The legacy corpus left it undecided three ways: module 02's
Design said `GET /healthcheck`, module 05's said `GET
/.well-known/snek-healthcheck`, and the scaffold served `/healthcheck`. It
sits inside the fork-stable enumerated surface, so deciding late is a
breaking change to every fork.

**Decision** (author-delegated to best practice; reasoning and the norms
consulted in `design.md`, "One well-known family"). `GET
/.well-known/snek-healthcheck`. The root-path convention (`/health`,
`/healthz`) exists for self-discoverability by clients that must guess, and
nothing guesses here — the only caller is the platform, holding a domain a
captain typed and a contract this capability fixes. What the convention would
cost is the collision RFC 8615 exists to prevent: a server's origin is a
*fork's* origin, and `/healthcheck` is the obvious name a fork wants for its
own operator-facing status page.

### 2. The other two well-known paths, settled in the same pass — RESOLVED

**Context.** Deciding any one of the three late is the same breaking change,
so all three are fixed together and recorded in the enumerated surface.

**Decision.** One vendor-prefixed family, fixed platform-wide: `POST
/.well-known/snek-game-invite` (unchanged — modules 03, 05 and 08 all agreed
on it), `GET /.well-known/snek-server-keys`, and `GET
/.well-known/snek-healthcheck`. The key document is renamed off the
scaffold's `/.well-known/jwks.json`: that suffix is unregistered squatting on
a generic name, it promises an OIDC discovery surface a Centaur Server does
not publish, and the platform's own OIDC surface already serves a
`jwks.json` — two documents at one relative path with different trust
semantics. The surface additionally states the converse, which is what makes
the fork contract legible: the platform reserves nothing outside the
`/.well-known/snek-` prefix.

### 3. Naming the literal paths in the spec — RESOLVED (reverses an earlier decision)

**Context.** `design.md` previously held the paths as mechanism and spec'd
only their stability.

**Decision.** The three literals are named once, in
`forkable-reference-app`'s enumerated surface, and nowhere else in the
corpus; the endpoint requirements say only that their path is fixed
platform-wide. A path change cannot be "a deliberate breaking change, made
and communicated as such" while the path is a value no reviewer sees in a
word-diff. In code the same three live as one exported constant.

Everything else — the carving, the DAG position, and the boundary rulings
above — was settled with the author, and nothing in re-authoring this story
from the legacy text surfaced a further contradiction or gap.
