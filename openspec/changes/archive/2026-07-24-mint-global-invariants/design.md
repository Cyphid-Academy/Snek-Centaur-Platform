## Context

Migration of legacy module 02 into strict OpenSpec — and, decided during
that migration's review, the pivot of the whole migration plan from
module-at-a-time to **capability-at-a-time carving by user-story
locality**. Every decision below was settled with the project author. It is
recorded here in full because that exploration is not durable: a future
reader has only these artifacts, the specs, the staging folder, and the
code — not the conversation.

## Decisions

### Carving grain: user-story capabilities + one cross-cutting capability

The legacy modules were carved by runtime/artifact — a sequencing device
for authoring and implementation, not a semantic decomposition. A survey of
the legacy corpus showed the cost systematically: single user-facing
workflows sawn along runtime seams (game end split between the SpacetimeDB
module's detect-and-notify and the Convex module's bookkeep-and-teardown;
replay split between "who builds the bytes" and "who keeps the bytes";
authorization split between token issuance and connection-level
enforcement; snake selection described three times from three artifacts),
and unrelated stories bundled only by shared substrate (the Convex module
holding accounts, rooms, tournaments, webhooks, and the SpacetimeDB
module's compiled WASM artifact alike). Where a concept was split, the
legacy spec had to spend design prose stitching the halves back together —
complexity manufactured by the carving itself.

The adopted grain: **capabilities own user stories** (a workflow the user
experiences as one thing), and the prospective set is maintained in
`docs/spec-migration/capability-map.md`. This also matches OpenSpec's own
framing of a spec as a behavior contract organized by feature area or
bounded context rather than by component.

Alternatives considered: (i) continuing module-at-a-time with each module
contributing deltas to user-story capabilities — workable and closest to
the prior plan, but it perpetuates carving decisions being driven by
module boundaries; (ii) a broad `platform-architecture` capability
carrying module 02 whole — drafted and reviewed, rejected because most of
its requirements sat below architecture altitude (application mechanics
owned by concrete user stories) while the genuinely architectural residue
was precisely the cross-cutting invariants. What breaks if this decision
is reversed: capabilities re-fragment along implementation seams, and
every cross-runtime workflow again needs prose to reassemble itself.

### `global-invariants`: membership by admission test

Cross-cutting rules that no user story owns still need a requirements-level
home — they are exactly the invariants downstream implementers could
silently violate. The capability's Purpose carries the admission test: a
requirement belongs iff **(a)** it constrains implementers of two or more
other capabilities or runtimes, **(b)** no single user-story capability
owns it, and **(c)** it is falsifiable. (c) is the requirement-vs-design
line: topology narrative ("Convex is the persistent runtime") fails it and
lives in design docs; "no runtime but the game's SpacetimeDB instance
produces committed game state" passes.

The name was weighed against `security-invariants` (too narrow — the
one-shared-engine and single-deployment rules are not security) and
`platform-architecture` (invites exactly the topology narration and
altitude drift the review struck). The known risk of `global-invariants`
is dumping-ground drift ("this feels important → global"); the admission
test in the Purpose is the guard, and extracting a `security-invariants`
capability later remains open if the security cluster grows.

Membership consequences worth recording:

- `team-granularity-authorization` **merges** what the first draft stated
  twice (once as a staged-move rule, once inside selection authority): the
  single invariant is "SpacetimeDB authorises at team granularity and no
  finer; Convex owns all within-team coordination." The within-team rules
  themselves (one operator per snake, etc.) are application discipline and
  parked to `operator-control`.
- `ephemeral-game-credentials` **extracts** the credential-scoping
  invariant from the server-lifecycle draft; the static-web-host residue
  parks to `team-server-management`.
- `access-follows-identity` keeps the identity-not-server principle and
  no-privileged-deployment; the finished-games-readable-by-all policy is a
  replay-surface story and parks to `replay-and-audit`.

### Per-identifier bindingness (partial module migration)

Capability-at-a-time migration means a module's ids retire in waves, so
bindingness moves from per-module to **per identifier**: an id is retired
iff it has an identifier-map entry; parked ids have none and stay binding
in the frozen legacy file. This needed no lint change — the reference lint
already tombstones per map entry and only uses its whole-module set for
fully-retired modules — which is itself evidence the mechanism is the
natural grain. The migration audit gains the complementary check: every id
defined by the module must be **mapped or parked** (parked = listed in
backticks in the module's parked ledger under `docs/spec-migration/`), the
two sets must not overlap, and stale-code-reference flagging applies only
to retired ids. What breaks if reversed (whole-module cutover kept): every
capability migration would have to finish entire modules to land, which
recreates module-at-a-time in disguise.

The parked ledger lives under `docs/` deliberately: it cites numeric legacy
ids, which spec bodies are forbidden to do — the staging folder is planning
material, not spec.

### Prerequisite rename: `game-rules → game-engine`

The rules of the game and the single shared executable engine that defines
them are one semantic unit; naming the capability `game-engine` reflects
that and lets engine *interface* contracts live in the root capability
(determinism, snapshot purity, cross-runtime type expressibility, and —
added by this change's delta — `runtime-portability`: no ambient
clock/randomness/IO, no runtime-specific API) while engine *ecosystem*
rules (one shared build, no reimplementation, pluggability) live in
`global-invariants/one-shared-engine`.

The rename is a first-class part of *this* change, expressed with the
capability-rename tooling introduced in PR #17: the `game-engine` delta
opens with `## RENAMES CAPABILITY: game-rules`, carries the source's
Purpose, and adds `game-engine/runtime-portability`. While the change is
open, `specs/game-rules/` remains binding and the open-change overlay
resolves the `game-engine/*` names; the reference sweep across code, the
other capabilities' specs, and docs happens in the Implement phase; and
`pnpm spec:fold` performs the folder move and re-prefix at archive.
(Neither stock OpenSpec nor this repo's fold could rename a capability
before #17 — a capability rename could only be a direct `specs/` sweep
outside the change lifecycle, which is why the tooling was built first.)

Because the rename retargets named identifiers (`game-rules/* →
game-engine/*`) and archived change folders still cite the old names, a
new `openspec/maps/identifier-lineage.json` records the capability rename.
This map is distinct from the legacy numeric map (which bridges the
`MM-REQ-NNN` era); it bridges *structural refactors of named identifiers* —
renames now, merges or splits in the future — so an identifier appearing in
any archived change can be computationally traced to its present semantic
target.

### Omit-redundant with machine-checked re-homing

Requirements whose substance a later module's own rules already state
(024–028, 030, 032, 032a, 056's bot-compute half) are omitted, not
migrated, to avoid two authorities for one invariant. Each still receives a
note-only tombstone in the legacy map carrying a `pendingRehome` marker
naming the owning module. The audit fails a module's disposition while any
entry still pends re-homing onto it — turning "remember to re-home this"
from human memory into a checked precondition.

### `GameStatus` terminal term: `finished`

The specs (legacy 02 and 05) use `finished`; the code
(`convex-snek-platform`) uses `ended`. This change authors `finished` and
aligns the code in the same change. There is no persisted Convex data yet,
so this is a type-literal change, not a data migration.

## Constraint-mining

Per the mandatory design rule, each decision was checked for an invariant a
future implementer could silently violate. For this change the mined
invariants *are* the capability — every `global-invariants` requirement is
one (instance isolation as a security boundary; enforcement outside the
library; the team-granularity authorization split; credential scoping; the
trust boundary; single transactional home; one shared engine; sole
authoritative executor; access following identity; one runtime home per
behaviour). One mined invariant is deliberately parked rather than minted:
the extensible Centaur-state slots (bounded schema slots so team innovation
needs no per-team schema change) belongs to the story that will own
decision recording (`decision-transparency`), and its draft is preserved in
the parked ledger.

## Semantic corners to review with care

Re-authoring compresses the owned legacy assertions into 10 requirements,
and there is no behavioural test net for this module — review is the sole
fidelity check. The corners most at risk of silent drift:

- **Team-granularity vs within-team authority.** The SpacetimeDB instance
  authorises at team granularity and has no operator concept; every
  within-team rule lives in Convex. Neither half may leak across
  (`team-granularity-authorization`); the specific within-team rules are
  parked, not lost.
- **Trust boundary vs isolation feature.** `server-trust-boundary` says
  co-tenant isolation is *never* a security guarantee; nothing downstream
  may promise it, even though the reference Server implements best-effort
  isolation.
- **Credential scoping.** Per-team, per-game, expiring — and co-tenancy
  never merges privileges (`ephemeral-game-credentials`). The bot-compute
  behaviour that *uses* those credentials is module 07's substance, not
  re-stated here.
- **Authoritative execution vs simulation.** Servers and clients run the
  same engine freely; only the game instance's execution commits
  (`authoritative-turn-resolution`).

## Deliberate drops (recorded so they are not silent)

- **Captain-only write authority over bot parameters / heuristic defaults**
  (legacy 02-REQ-045/046, already removed from the frozen corpus and
  cleaned up earlier in this PR). Intentionally **not** re-minted at
  invariant grain: the invariant lives at the data layer in module 06
  (`06-REQ-008/010/012`). If a future migration wants it, it mints fresh;
  nothing here claims it.
- **Open-source licensing** (061) — a project/governance stance, not a
  falsifiable system requirement. Recorded here; its architectural half (no
  privileged deployment, independent deployments supported) *is* a
  requirement (`access-follows-identity`).
- **Malicious-server trust trade-off** (063) — an accepted risk statement,
  not a system behaviour: a malicious Server a user logs into can
  exfiltrate that user's readable data; users should only visit Servers
  they trust. Documented as rationale; the mechanism it concerns is
  `access-follows-identity`.
- **The legacy Exported-Interfaces pseudo-types** (RuntimeKind, the
  connection and security "models", the lifecycle interfaces) do not
  migrate. Real runtime types (`GameStatus`) stay canonical in code; the
  architectural-constraint pseudo-types are captured as the requirements
  above, and their tabular form is archived here as rationale rather than
  carried as spec or code.

## Risks / Trade-offs

- **Re-authoring drifts semantics** → mitigated only by author review (no
  test net); the semantic-corner list above is the review checklist, and
  parked drafts keep unreviewed text out of the binding spec entirely.
- **`global-invariants` becomes a dumping ground** → the admission test in
  its Purpose; later extraction (e.g. `security-invariants`) stays open.
- **Parked requirements stall indefinitely** → the parked ledger is
  machine-read by the audit, the cutover row stays Partial (visibly
  unfinished), and each entry names its prospective capability.
- **Per-id bindingness confuses readers used to per-module cutover** →
  stated in the cutover table's preamble, the staging README, and the
  config migration note; the lint makes the retired/citable distinction
  mechanical either way.
