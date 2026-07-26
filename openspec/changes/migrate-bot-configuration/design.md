## Context

Migration change minting `bot-configuration` from legacy modules 06, 07,
and 08 (42 requirement ids, 6 review items), per the author-approved
capability map, dependency DAG (bot-framework + team-management, extended
here with identity-and-authorization and global-invariants where a citation
is warranted), and assignment matrix. Legacy text is binding source
material. This file records the decisions a future reader cannot recover
from the specs alone: where the authority lines were drawn and why, which
runtime holds the records, which halves of split ids land here, and which
legacy detail was demoted to mechanism.

## Decisions

### Every record here lives in the Centaur subsystem within Convex

The requirements name no runtime — `per-snake-portfolio-record` says "the
platform SHALL persist a portfolio record" — because the runtime assignment
is a design decision, not a behaviour a reader of the capability needs
restated: all four record kinds are held by the **Centaur subsystem within
Convex**. The team-scoped records (`team-heuristic-defaults`,
`team-bot-parameters`) persist for the lifetime of the team; the game's
captured defaults and game-scoped parameter values
(`game-start-snapshot`) and the per-snake portfolio records
(`per-snake-portfolio-record`) are per-game Centaur state, living for the
game and whatever of it the platform retains afterwards.

The motivation is `global-invariants/centaur-state-boundary`: the Centaur
subsystem is the sole persistent home of bot-side state — per-team
configuration and per-game bot and operator coordination state — and the
game's SpacetimeDB instance never reads or writes it. Two consequences that
would otherwise look like unexplained choices follow directly:

- `team-heuristic-defaults` cites that invariant because its guarantee is
  only achievable under it. "Team-scoped, persisting for the lifetime of the
  team", and `#server-replacement-inherits-defaults` in particular, hold
  precisely because no hosting Server is a home for the configuration — so
  the requirement no longer says "not by any server that hosts it", which
  merely repeated the invariant's own words, and cites the owner instead.
- `effective-configuration`'s "computable from persisted state alone" is
  deliverable because the captured defaults and the portfolio record are
  records of one authoritative store, readable in a single transaction — not
  two systems to reconcile.

What breaks if reversed: holding portfolio records in the game's instance
would make bot-side state instance-owned and outcome-adjacent, would die
with the game, and would violate the boundary from the other side by giving
the instance Centaur state to read; holding them on the hosting Server would
make configuration server-owned, contradicting the inheritance rule above,
and would put a team's private configuration behind an operator-controlled
boundary rather than the platform's own function contract.

### The authorization split: captain-only team scope, any-member game scope

The resolved legacy role-gating ambiguity produced the two-grain rule this
capability is built around: only the captain writes team-scoped
configuration (heuristic defaults and bot parameters), while every current
member edits game-scoped portfolios live. Authored as two requirements so
each grain has a home — `captain-only-team-configuration` (who may write
team policy) and `any-member-live-editing`
(explicitly broader, with a scenario pinning that an ordinary member's
mid-game edit succeeds). What breaks if reversed: making live editing
captain-only reduces the centaur to a one-human bottleneck at the moment
of maximum time pressure — the product's whole premise is the roster
steering the bot together; making team defaults member-writable dissolves
the captain's policy role and lets any member silently rewrite the
standing configuration every future game inherits. The timekeeper role
considered in the legacy review no longer exists; nothing here reintroduces
role vocabulary beyond structural captaincy.

**How the two gates integrate with the rules that own enforcement.** Neither
requirement restates that authorization is enforced server-side at the
mutating function contract with interface gating as presentation only: that
rule is `identity-and-authorization/mutation-authorization`, and this change
declares `identity-and-authorization` as a dependency in order to cite it.
An earlier draft duplicated the rule locally on the grounds that
identity-and-authorization sat outside this capability's declared
dependencies — that reasoning is void. A declared dependency set is an
affordance extended whenever a citation is warranted, never a budget that
justifies re-authoring another capability's constraint; the duplicate
carried no authority and could only drift from the original. The division of
labour is therefore: `identity-and-authorization/mutation-authorization`
fixes *how* any gate is enforced; `team-management/captain-authority` owns
the captain gate over the team record itself, which this capability neither
widens nor re-derives; `bot-configuration` owns only *what* is captain-only
here (the heuristic default configuration and the bot parameter record) and
*who reads it* — every current member plus the team's coaches, at all times.
That read grant is the team-private read scope of
`global-invariants/team-private-centaur-state` instantiated for bot
configuration: coaches are exactly the "identities the platform grants a
team's read scope", and stating the grant as unconditional in game state is
safe only because that invariant keeps a competing team out regardless of
game state. Relax the invariant and the readability clause becomes a leak,
which is why the requirement cites it rather than re-describing the
boundary.

Both grains are member-level rules, and a member-level rule is only
expressible at all because
`global-invariants/team-granularity-authorization#within-team-discipline-lives-in-convex`
places every within-team coordination decision in Convex — SpacetimeDB
authorises at team granularity and holds no notion of an individual
operator. `any-member-live-editing` cites that scenario for exactly this
reason: were within-team authority to move to the game instance, "which
member may edit this snake's portfolio" would cease to be a question this
capability could answer, and the two-grain split would have nowhere to live.

### Defaults snapshot at launch; edits never retroactive (either direction)

`game-start-snapshot` merges three legacy strands into one requirement:
portfolio initialisation (active-by-default Preferences at default weight,
no Drives, no overrides), the copy of bot parameters into independently
mutable game-scoped values, and the never-retroactive rule with its
future-games-only surface communication. The capture severs team policy
from the running game in both directions
(`#game-scoped-values-fork-from-defaults`). What breaks if reversed: live
propagation of default edits would let a captain mutate a running game
from outside it — retuning mid-game under the guise of policy editing,
bypassing the game's own any-member editing surface and confusing the
audit story of who changed what during play; conversely, game-scoped edits
leaking back into defaults would make every game rewrite team policy as a
side effect of playing it.

### The 06-REQ-011 split: timing fields stored here as opaque scalars

The legacy bot parameter record bundles the softmax temperature (this
capability's to derive) with three submission-timing fields whose meaning
lives in the pacing story. Authored per the author's split ruling:
`team-bot-parameters` names the three fields — automatic submission time
allocation, scheduled-submission interval, imminent-deadline threshold —
as opaque team-tunable scalars this capability stores, captain-edits, and
snapshots, with consumption semantics owned elsewhere; no submission
behaviour is authored and no pacing requirement is cited (the DAG places
turn-pacing above this capability). The resolved timing-parameters review
is carried as `#timing-parameters-are-tunable-not-constants` — the
parameters exist precisely so hosting-topology differences are tuned in
configuration, not code. The legacy default values (100 ms interval, 50 ms
threshold) are seed values, mechanism territory: they live in code with a
`// design:` reference here. What breaks if reversed (authoring
consumption here): this capability would need the deadline formula and the
chess-clock vocabulary, inverting the DAG, and every pacing change would
ripple into the configuration spec despite changing nothing about storage
or authority.

### Temperature derivation lives here (the cycle-break's counterpart)

bot-framework authored the portfolio's effective temperature as a single
opaque scalar precisely so this capability could own its sources:
`effective-temperature` states the derivation (per-snake override else the
team's game-scoped value), its reactivity (next sampling decision, no
cache invalidation, no restart), and the calibration contract
(lower-is-more-deterministic — the operator-facing meaning of the knob,
kept as spec because operators tune against its sign). The team-side
source is the *game-scoped* temperature value, not the team default
directly — the launch snapshot (`game-start-snapshot`) forks the two, and
the game-scoped value is any-member-adjustable during play per the
authorization split. What breaks if reversed: deriving in bot-framework
recreates the dependency cycle the author broke; leaving derivation
unspecified lets an implementation cache the derived value, and a cleared
override would then keep sampling at the stale temperature —
`#override-else-team-value` pins that clearing restores the derivation.

### Registry∩configuration availability, and the insert-only sync
### (constraint-mined — the routed leads)

Two requirements carry the resolved registry-drift review:

- `registry-defines-availability` — the operable set is the intersection
  of the team's configuration with the build-time registry. Stale rows
  (configured but no longer registered) are retained, inert, surfaced
  greyed with a captain-only delete affordance; unconfigured registry
  entries are not offered until a row exists; no affordance offers a Drive
  outside the intersection. What breaks if reversed: offering an
  unregistered Drive stages motivations the server cannot evaluate;
  auto-deleting stale rows destroys captain-authored tuning on every
  server swap — exactly the value `team-heuristic-defaults`' inheritance
  rule exists to preserve.
- `registry-sync-insert-only` — new rows enter via the sync on a captain's
  visit to the configuration surface, insert-only, never overwriting; the
  framework never writes configuration. The captain's visit is the consent
  event: registry defaults become team policy only when the trust anchor
  for team configuration shows up to see them. What breaks if reversed: an
  upserting sync silently reverts captain-edited weights to registry
  defaults on every visit (the precise failure the legacy design's
  insert-only-never-overwrite clause forbids); a framework write path to
  configuration would let a running game mutate team policy, breaching
  both the authorization split and the snapshot rule. The no-write claim is
  enforceable rather than aspirational only because every mutation of
  Centaur state, from any surface including a Server acting under its game
  credentials, is dispatched against the subsystem's own function contract
  with no private bypass — hence the requirement's citation of
  `global-invariants/one-contract-many-surfaces`. Relax that and "the
  framework never writes configuration" becomes an unenforceable convention.

The build-time-shared registry module itself (one TypeScript source
imported by framework and frontend, making render/simulate drift
structurally impossible within a build) is mechanism — code with a
`// design:` reference here.

### Unresolvable Drive targets: omitted, never deleted
### (constraint-mined — the routed lead)

`per-snake-portfolio-record` mints the legacy design's handling of Drives
whose target no longer resolves (a dead target snake, a mutated-away
cell): the Drive contributes nothing while unresolvable but its record
survives, and it re-enters automatically if the target resolves again —
deletion is exclusively an operator's act. Paired with the
concrete-target rule (`#no-drive-without-a-target`): targets are chosen at
add time; no pending-target Drive exists. What breaks if reversed:
auto-deleting on unresolvability destroys operator work behind their back
mid-game (a cell target obscured for one turn would vanish permanently),
and permitting targetless Drives would force the framework to invent
resolution semantics the vocabulary deliberately lacks.

### Live edits reach the running player without loss

`any-member-live-editing` carries the legacy live-edit guarantee at intent
grain: portfolio mutations take effect reactively on the running player,
never restart it, never discard accumulated evaluation, and a weight
change is pure rescoring of already-evaluated worlds. The cheap-rescan
mechanism that delivers this (weights applied at scoring time over cached
normalised outputs) is bot-framework's demoted machinery; what this
capability binds is the operator experience — editing is safe mid-turn.
What breaks if reversed: if edits discarded evaluation, operators would
learn that touching a weight mid-turn costs the team its computed
progress, and the live-editing affordance would be self-defeating at
exactly the moment it matters.

### UI mirrors folded as scenarios; the tab-cycle sort demoted

The module-08 page ids are authored as two surface requirements.
Captain-gating mirrors are scenarios (`#read-only-below-captain`,
`#captaincy-change-applies-without-reload`) whose content is what the
surface *shows*, not what enforces anything: that a non-captain sees the
configuration read-only and that the affordances follow a captaincy transfer
reactively. They no longer add "never substituting for it" — presentation is
never enforcement is `identity-and-authorization/mutation-authorization`'s
rule, cited once on the gate itself, and the reason a disabled affordance is
trustworthy is `global-invariants/client-truthfulness`, which requires an
invariant-gated affordance's enabled state to derive from server-held state
rather than client optimism. `#read-only-below-captain` cites that instead of
restating the mirror relationship. The Drive-management interaction
grammar keeps its binding behavioural content — pinned-first-then-
lexicographic ordering (identical on every client because it is stored
team configuration), eligibility-predicate-filtered targeting,
deterministic nearest-first keyboard cycling, single-click add at default
weight, cancel without side effects — while the legacy three-key sort
specification (A*-distance, clockwise angle from head direction, identity
tiebreak) demotes to code with this design.md as rationale: the promise
operators rely on is determinism and nearest-first, not the tiebreak
algebra. What breaks if determinism is dropped: keyboard targeting under
time pressure becomes a lottery — the same Tab sequence lands on
different targets from the same board, and muscle memory is worthless.

### Halves owned elsewhere, consumed here

- **06-REQ-032**: retired by the live-game-observation change (the
  matrix's owning row). Its team-config-access half — team-scoped
  configuration readable by members and coaches regardless of game state —
  is authored here as
  `captain-only-team-configuration#members-and-coaches-read-regardless-of-game-state`;
  that change's map entry records the split.
- **06-REQ-040a**: retired by the turn-pacing change. This capability
  consumes its temperature half abstractly ("the team's game-scoped
  temperature value") via the fork minted in `game-start-snapshot`,
  without authoring the live parameter record's shape.
- **08-REQ-008** is retired here as the matrix's owning row; the reactive
  captain-gating scenario is authored generically (captain-gated
  affordances follow a captaincy transfer without reload), so the
  Captain-control surfaces other capabilities own inherit the same
  contract by pattern, not by citation.

## Constraint-mining (mandatory final step)

- **Minted: the registry sync is insert-only, never overwriting**
  (`registry-sync-insert-only#sync-never-overwrites`) — the routed lead;
  a future "helpful" upsert silently reverts captain-authored values.
- **Minted: the operable set is the registry∩configuration intersection,
  stale rows retained-inert-deletable, nothing offered outside it**
  (`registry-defines-availability`, all three scenarios) — the routed
  lead.
- **Minted: unresolvable targets are omitted, never deleted, and re-enter
  automatically** (`per-snake-portfolio-record#dead-target-omits-never-deletes`)
  — the routed lead.
- **Minted: the framework never writes team-scoped configuration**
  (`registry-sync-insert-only#framework-never-writes-configuration`).
- **Minted: the lazy insert runs on the captain's visit — consent, not
  background sync** (`registry-sync-insert-only#captain-visit-adopts-new-heuristics`)
  — the routed lead.
- **Minted: the launch capture severs defaults from game values in both
  directions** (`game-start-snapshot#in-progress-game-unaffected`,
  `#game-scoped-values-fork-from-defaults`).
- **Minted: temperature override persistence is symmetric with every
  other override** (`per-snake-portfolio-record#temperature-override-survives-deselection`).
- **Minted: clearing an override restores the derivation**
  (`effective-temperature#override-else-team-value`).
- **Minted: live edits never cost evaluated work**
  (`any-member-live-editing#weight-edit-keeps-evaluated-work`).
- **Checked, owned by dependencies or siblings**: the server-side
  enforcement of any authorization gate, and the rule that interface gating
  is presentation only (`identity-and-authorization/mutation-authorization`
  — declared as a dependency by this change and cited, not restated;
  `team-management/captain-authority` applies the same rule to the team
  record, and this capability neither widens nor duplicates it); the
  persistence home of bot-side state and its team-privacy
  (`global-invariants/centaur-state-boundary`,
  `global-invariants/team-private-centaur-state`, cited where soundness
  rests on them); the no-bypass property of the Centaur function contract
  (`global-invariants/one-contract-many-surfaces`); evaluation-lifecycle and
  reactivity invariants (bot-framework); read scoping of live game-scoped
  state (live-game-observation).
- **Checked, plastic (mechanism, doc-comment territory)**: the timing
  parameters' seed defaults, the shared-registry module layout and its
  serialisable-registration payload, the tab-cycle tiebreak keys and
  their caching, the sync mutation's return shape and toast, and the
  page-level widget choices — code citing this change's archive folder
  suffices when they land.
