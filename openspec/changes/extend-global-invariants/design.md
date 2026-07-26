# Design — extend-global-invariants

## Context

The atlas pass over modules 03–08 assigned 27 legacy ids to
`global-invariants`; the carving checkpoint bound all gi additions and
modifications to this single change (train precondition: one owner per
requirement). Every decision below was settled against the binding legacy
text of those ids, with the assignment matrix as the routing hint. The
admission test in the gi Purpose was applied to each id; the ids that
failed it were routed by the matrix to user-story capabilities and are not
touched here.

Compression: the 27 ids yield 9 new requirements and 2 extensions of
existing ones — dedupe fell mostly along the legacy modules' habit of
restating the same topology rule once per runtime (module 04's "no
platform-wide state", module 05's "no live-game mirror", and module 08's
"no client persistence" are one confinement rule seen from three sides).

## Cluster 1 — State ownership and authority placement

### One confinement rule, not three per-runtime rules
(`state-confined-to-owning-runtime`)

The legacy corpus states runtime-scoped negatives separately: the game
instance holds nothing platform-wide, Convex holds no live-game mirror
(post-game replay import excepted), the web client persists nothing
authoritative. These are one invariant — state lives only in its owning
runtime — and authoring them as one requirement keeps the exception
inventory (exactly one: the finished-record import) in a single place.
**If reversed** (per-runtime restatements, or dropping the rule): shadow
copies appear — a Convex mirror of live turns, a client cache that
survives sessions — and the platform re-acquires the classic split-brain
bugs the single-authority topology exists to prevent; worse, each
restatement drifts its own exception list.

### The Centaur boundary is its own requirement (`centaur-state-boundary`)

The bot-side subsystem's placement could have been folded into the general
confinement rule, but it carries two extra falsifiable edges: Centaur state
is never authoritative for game outcome, and the bot↔game channel is
exclusively the instance's own contract (staged moves in, filtered
subscriptions out — never through Convex). Both edges constrain three
runtimes at once and are exactly what a future implementer would "helpfully"
violate (e.g. having the instance read bot temperature from Convex, or
letting a Convex mutation reach into instance state). **If reversed**: the
game's outcome grows a dependency on a runtime outside its ACID boundary,
and replay determinism (which assumes the instance's inputs are its seeds
and its staged moves) silently breaks.

### Guards live inside the transaction
(`transactional-invariant-enforcement`)

Convex holds no declarative unique indexes; every uniqueness/exclusivity/
freeze rule is enforced application-side by a guard that is sound only
because it runs inside the same serializable mutation as the write. That
soundness condition is invisible in any one capability's spec — selection
exclusivity, roster freeze, email uniqueness are owned by three different
capabilities — which is why the atlas routed the lead here, and why it is a
requirement rather than design prose: it is precisely a rule a future
implementer could silently violate (a pre-check in a query, a guard split
across two mutations) while every test that doesn't race still passes.
**If reversed**: concurrent mutations interleave past the guard and commit
states every downstream capability assumes impossible (two operators on one
snake, roster edits during a live game), with no error ever surfaced.
Alternative considered: extending `single-convex-deployment` (its
transactional scenario gestures at this) — rejected because deployment
cardinality and enforcement discipline are different behaviours; a reader
hunting for "why must the guard be in the mutation" should find a
requirement saying exactly that.

## Cluster 2 — Game-instance hermeticity

### Seeded at init, silent until game end (`game-instance-hermeticity`)

Two legacy negatives (no external consultation during gameplay; no
spontaneous outbound transmission) are two halves of one seal, so they are
one requirement with one exception inventory: startup fetch of token
verification keys, and the game-end notification/record delivery. Serving
the instance's own authorized subscribers is its contract, not egress —
the requirement says so explicitly, because "no outbound data" read
naively would outlaw subscriptions. **If reversed**: mid-game
dependencies on Convex or a Server make gameplay availability hostage to
external systems, let mid-game record edits or config drift reach a
running game, and open an exfiltration channel during play; determinism
and the "instance is the sole authority during play" model both rot.

## Cluster 3 — Cross-team information security

### Observation joins action in team-granularity authorization
(MODIFIED `team-granularity-authorization`)

The legacy read-side rule (no unfiltered observation of another team's
state; spectators see no team's private state) is the observation half of
the authorization invariant this capability already owns — same boundary,
same enforcement point (the instance's data layer). Extending the existing
requirement rather than minting a peer keeps one identifier for "the team
boundary in the game instance". The *mechanics* of invisibility filtering
(which rows, ally views, history scrubbing) stay with the observation
capability that owns them; the invariant here is only that the boundary is
team-granular and data-layer-enforced. **If reversed** (kept action-only):
a compliant implementer could expose an unfiltered read path — e.g. raw
staged-move or private-state reads for spectators — while honouring every
action check, and nothing in the specs would forbid it.

### Bot compute is confined to its team's view
(`bot-compute-view-confinement`)

Row-level security cannot enforce this one: a Server hosting two teams in
one game legitimately holds both teams' filtered views under two
credentials. The invariant that compute acting *for* a team consumes only
*that team's* view is therefore a platform obligation on the compute
implementation, distinct from (and within the limits of)
`server-trust-boundary` — the operator can still cheat, which is exactly
why the shipped implementation must not. It also covers the own-view
masking edge: masked state is not recovered through any side channel.
**If reversed**: co-hosted play becomes structurally unfair (the reference
stack itself would peek), and the trust-boundary story collapses from
"operators could cheat, software doesn't" to "the software cheats".

### Client presentation is never an enforcement point
(MODIFIED `security-enforced-outside-the-library`)

The existing requirement bars enforcement-by-library; the legacy corpus
also bars enforcement-by-customisation — a team's forked application may
present or hide anything without weakening an invariant. Same principle,
broadened from "the library" to "any client surface", so the requirement is
extended, not duplicated. The accepted-risk residue (a malicious Server
can exfiltrate what its visitors can read) retires here as a map note:
it is a documented trade-off qualifying this enforcement model, not a
falsifiable behaviour; its user-facing prose belongs to the
team-server-management trust paragraph (authored by that change).
**If reversed**: any invariant "enforced" by UI absence is an invariant
that a fork deletes; the open-source, fully-forkable application model
becomes incompatible with security.

## Cluster 4 — Identity and credential discipline

### Authenticated, kind-unambiguous, uniquely resolvable
(`authenticated-unambiguous-identity`)

Three legacy rules fuse into one identity-hygiene requirement: no anonymous
state-mutating participant on any runtime; identity kind decidable wherever
platform code observes an identity; a team identifier inside a game
instance denotes exactly one persistent team record for the game's
lifetime. They fuse because they are the same guarantee at three grains —
every mutation has an attributable principal whose kind and referent are
unambiguous. The identifier-resolution clause was weighed against
code-mechanism (the matrix's `alt:`) and kept as spec: it is falsifiable
cross-runtime behaviour (attribution and replay both die if a game's team
ids dangle or become ambiguous), while *how* ids are allocated stays in
code. **If reversed**: unattributable or ambiguously-attributed mutations
enter the record, and the append-only attribution story downstream is built
on sand.

### Credentials reach only their intended holder (`credential-confinement`)

One requirement carries the two falsifiable edges of credential handling:
signing private keys never leave the issuing Convex deployment (validation
everywhere uses only published public keys), and a team's per-game
credential travels over exactly one channel — the invitation to the
nominated Server. Scoping/lifetime of those credentials is already owned by
`ephemeral-game-credentials`; this requirement is about *transport and
custody*, which no existing requirement states. **If reversed**: a leaked
signing key forges arbitrary game admissions (invisible to audit, since
tokens verify), and a second delivery channel for game credentials becomes
the phishing/exfiltration surface the invitation design deliberately
avoided.

## Cluster 5 — Client truthfulness

### One contract behind every surface (`one-contract-many-surfaces`)

Mutation parity (web app, programmatic API, Server-under-game-credential
all hit the same server-side contract under identical invariants) and the
operator's direct channel (operators act under their own identity, never
proxied or impersonated by their team's Server) are one authority
statement: the contract is the only door, and each principal walks through
it as itself. The integrator-facing half of parity (what the API exposes)
stays with the integrations capability; the invariant here is that no
surface gets a private bypass. **If reversed**: invariants become
per-surface (enforced in the UI here, the API there), drift is guaranteed,
and a Server that proxies operator actions erases the operator/bot
attribution distinction every audit surface relies on.

### Clients render server truth (`client-truthfulness`)

Four legacy rules — surface rejections, derive affordance enablement from
server-held state, surface subscription loss instead of fabricating from
stale caches, render archived/historical entities from persisted snapshots
— are one posture: a client never presents a world-state the owning
runtimes did not assert. Authored as one requirement with four scenarios
because each clause alone is trivially narrow, but the posture is exactly
what a fork or rewrite silently degrades. This binds any client of the
platform (reference app, forks, future clients), which is what lifts it
out of the app's own capability. **If reversed**: optimistic UIs invent
state the server later contradicts, invariant rejections vanish into
consoles, and archived teams break every historical view that references
them.

## Constraint-mining check

Per the mandatory rule, each decision above was asked: does its quality
depend on an invariant a future implementer could silently violate?

- The mined-lead case *is* one of the additions
  (`transactional-invariant-enforcement`) — see Cluster 1.
- The hermeticity exception inventory is inside the requirement text
  itself; no separate invariant needed.
- The decision to keep invisibility-filter mechanics out of gi depends on
  the observation capability owning them — enforced by the train's
  assignment, not mintable here without trampling that owner.
- No other decision yielded a new invariant that is not already one of
  this change's requirements: this change, like the mint before it, is
  made *of* mined invariants.

## Risks / Trade-offs

- **Dumping-ground drift** remains gi's standing risk; every addition here
  was checked against the Purpose's three-prong admission test, and the
  two MODIFIEDs extend existing identifiers rather than minting near-twins.
- **Seam fidelity** — several ids split across changes (observation
  mechanics, API parity, trust prose). The map entries name the seams so
  the sibling changes' reviews can verify both halves landed.
- **Compression drift** — re-authoring 27 assertions into 11 blocks has no
  test net; the per-cluster "what breaks if reversed" notes double as the
  review checklist.
