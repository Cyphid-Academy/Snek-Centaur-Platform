## Why

Eleventh change of the final spec-migration train. The workflow by which a
team configures its automated player is scattered across three legacy
modules along runtime lines: the state contract in module 06 (§6.2–6.4,
plus the team-scoped retention rule), the framework's consumption of that
state in module 07 (§7.3, §7.12), and the editing surfaces in module 08
(§8.4–8.5, §8.13). Re-authoring it as one capability puts the whole story —
what the captain sets as team policy, what any member may change live at
the table, and how the framework derives what it consumes — in one readable
place, with the load-bearing authorization split stated once instead of
being implied by three modules' cross-references.

## Carving decision

Mint **`bot-configuration`** from modules 06, 07, and 08 exactly as drawn
in the author-approved capability map and assignment matrix. The legacy
requirements and review items this change absorbs are recorded in the
identifier map under this change's name.
Declared dependencies: **bot-framework, team-management,
identity-and-authorization, game-lifecycle, global-invariants**. The
framework defines the
vocabulary this capability configures — Drives, Preferences, the portfolio,
the opaque temperature the softmax consumes, and the satisfaction
retirement whose record consequence is authored here; team-management
supplies
structural captaincy, the roster, coaches, and archive semantics the
authority and retention rules bind to;
identity-and-authorization owns the server-side enforcement of any
authorization gate, which the captain gate cites instead of restating;
game-lifecycle owns the launch orchestration that invokes the game-start
snapshot and guarantees the fresh, idempotent, identifier-agreeing per-game
state the snapshot writes into;
global-invariants carries the Centaur-state, team-privacy, and
one-contract invariants this capability's persistence, read scope, and
no-framework-writes rule depend on. The declared set is an affordance
extended wherever a citation is warranted, not a limit fixed in advance.

**Author-resolved boundary decisions binding this change:**

- **The authorization split is the capability's spine.** Team-scoped
  defaults (heuristic default configuration, bot parameter record) are
  captain-only (enforcement per
  `identity-and-authorization/mutation-authorization`); everything
  game-scoped — per-snake portfolios and the game's own copy of the bot
  parameters — is open to every current member. This is the resolved
  legacy ambiguity about role gating, authored once as
  `captain-only-team-configuration` versus `any-member-live-editing`.
- **Defaults snapshot at game start; edits are never retroactive.**
  Portfolio initialisation, the game-scoped parameter copy, and the
  never-retroactive rule are one requirement (`game-start-snapshot`) — the
  launch capture severs team policy from the running game in both
  directions.
- **The 06-REQ-011 split**: the bot parameter record is authored here with
  the three submission-timing fields as opaque team-tunable scalars —
  stored, captain-edited, and snapshotted by this capability, their
  consumption semantics owned by the pacing story. No submission-timing
  behaviour is authored here and no pacing requirement is cited.
- **Temperature derivation lives here** (the cycle-break's counterpart):
  bot-framework authored the portfolio's temperature as an opaque scalar
  precisely so this capability could own its sources and derivation —
  override-else-team-value, reactive, no cache invalidation, plus the
  lower-is-more-deterministic calibration contract.
- **The team-config-access half of the read-scoping id**: team-scoped
  configuration is readable by members and coaches regardless of game
  state, authored here as a scenario of the captain-gate requirement. The
  id itself (06-REQ-032) retires via the live-game-observation change,
  whose map entry records this split.
- **UI mirrors fold as scenarios.** The module-08 page requirements are
  authored as two surface requirements (`team-configuration-surfaces`,
  `drive-management-interface`) whose captain-gating scenarios state what
  the surface shows, deriving enablement from server-held state
  (`global-invariants/client-truthfulness`) rather than restating the
  enforcement rule. The tab-cycle's
  exact three-key sort demotes to code with rationale in design.md; the
  binding behaviour is deterministic nearest-first cycling.

Deliberate boundaries restated from the matrix seams: 06-REQ-040a
(game-scoped live parameter record) → turn-pacing, its temperature half
consumed here via the game-scoped temperature value; 06-REQ-018–025a
(selection) → operator-control; 06-REQ-026–029 and 07-REQ-004/039
(computed display state) → decision-transparency; 07-REQ-044/045/045a
(submission passes) → turn-pacing; 06-REQ-032's live read-scoping →
live-game-observation. None are touched by this change.

## What Changes

- **New capability `bot-configuration`** (mint delta, ADDED-only, 12
  requirements): the team heuristic default configuration and its
  team-lifetime persistence (server replacement inherits, archiving
  preserves); the bot parameter record with temperature, opaque timing
  scalars, and the pinned-heuristics list; the captain-only team-scope
  gate with member/coach readability regardless of game state and reactive
  captaincy-change gating; the game-start snapshot (portfolio
  initialisation, game-scoped parameter fork, never-retroactive,
  future-games-only communication); registry∩configuration availability
  with stale rows retained-greyed-deletable; the insert-only registry sync
  on captain visit with the framework barred from writing configuration;
  the per-snake portfolio record with concrete targets, Drives omitted from
  play but never deleted — whether their target is unresolvable or the
  automated player has retired them on satisfaction — and full persistence
  across
  turns and deselection; any-member live editing, covering the game's own
  parameter values as well as portfolios, that reaches the running
  player without discarding evaluation; the effective-configuration
  overlay; the effective-temperature derivation; and the two configuration
  surfaces plus in-game Drive management, which keeps omitted Drives
  visible with their reason.
- **42 legacy ids compress to 12 requirements**; the six resolved legacy
  review items carrying behaviour are encoded as scenarios (server
  replacement inherits defaults; temperature override survives
  deselection; timing parameters team-tunable; captain-only defaults vs
  any-member game overrides; launch snapshot; stale rows greyed and
  deletable).
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-bot-configuration/specs/bot-configuration/spec.md`
  (folded to `openspec/specs/bot-configuration/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `bot-configuration`
  (at archive).
- Cross-change citations: this delta cites
  `bot-framework/heuristic-vocabulary`, `scalar-discipline`,
  `per-snake-portfolio`, `drive-satisfaction`, `reactive-inputs`,
  `turn-scoped-evaluation`, and
  `softmax-decision` from the open migrate-bot-framework change;
  `team-management/team-record`, `roster-of-operators`, `coaches`, and
  `archive-not-delete` from the open migrate-team-management change; and
  `game-lifecycle/fresh-game-state` from the open migrate-game-lifecycle
  change. It also
  cites `identity-and-authorization/mutation-authorization` (open
  migrate-identity-and-authorization) and five global-invariants
  requirements: `centaur-state-boundary`, `team-private-centaur-state`,
  `one-contract-many-surfaces`, and `client-truthfulness` from the open
  extend-global-invariants change, plus
  `team-granularity-authorization#within-team-discipline-lives-in-convex`,
  which is already in `specs/`. The
  reference lint resolves them via the open-change overlay, and the
  train's archive order (extend-global-invariants,
  identity-and-authorization, team-management, game-lifecycle, and
  bot-framework before
  this change) keeps them resolving at fold time.
- The new `game-lifecycle` dependency moves the capability graph:
  `openspec/capability-graph.md` is regenerated in the same commit
  (`pnpm spec:graph`).
- Downstream train changes cite this capability: turn-pacing (the
  game-scoped parameter values its submission cadence consumes, snapshotted
  by `game-start-snapshot`), decision-transparency (rendering the
  portfolios and effective configuration edited here).
- Code citations: the Centaur-state configuration tables and mutations,
  the registry-sync mutation, the framework's portfolio mirror and
  temperature derivation, and the configuration pages and Drive-management
  components gain `// spec: bot-configuration/...` citations when the
  implementation lands.

## Open Questions

None. The candidate ambiguities were resolved by the author before
authoring and are recorded in design.md: the authorization split
(captain-only team scope, any-member game scope), the launch-snapshot
semantics (edits never retroactive in either direction), the 06-REQ-011
timing-fields split (opaque scalars here, consumption in the pacing
story), the temperature-derivation ownership (the bot-framework
cycle-break's counterpart), and the fold of the module-08 UI mirrors into
scenarios.

Four further questions raised during review are resolved in this revision,
with rationale in design.md:

1. **Who may adjust a game-scoped parameter value mid-game?** — **Decision**:
   every current member, on the same footing as portfolio editing
   (`any-member-live-editing#game-scoped-parameters-need-no-captain`). The
   captain gate's axis is durability, not breadth: it governs standing
   configuration that future games inherit, never values that die with the
   game. This closes what was an unassigned authority shared with the pacing
   story's live parameter record.
2. **Does a satisfied Drive's retirement delete or deactivate?** —
   **Decision**: the framework deactivates it in its own working portfolio
   and writes nothing, so from this capability's side a retired Drive joins
   the existing omitted-from-play category: inert, listed, reversible,
   deletable only by an operator
   (`per-snake-portfolio-record#satisfied-drive-keeps-its-record`,
   `drive-management-interface#omitted-drives-stay-visible`). The framework
   story states the matching half.
3. **May this capability bind "nothing is re-simulated"?** — **Decision**:
   no. That is machinery the framework story deliberately demoted, so
   `#weight-edit-keeps-evaluated-work` now binds the observable property —
   the turn's accumulated evaluation is not discarded and the operator sees
   updated scores without a fresh evaluation cycle.
4. **The snapshot's caller was undeclared.** — **Decision**:
   `game-start-snapshot` declares `game-lifecycle/fresh-game-state` and the
   capability declares `game-lifecycle`, so the caller/callee pairing is in
   the dependency graph rather than only in the task seams.

A fifth, from the author's 2026-07-28 corrections:

5. **What is a submission-timing parameter's default when a team never sets
   one?** — **Decision**: the author has fixed the automatic submission time
   allocation's default as exactly the clock time the game accrues to the
   team each turn, and that rule is authored in the **pacing** story
   (`turn-pacing/live-pacing-parameters`), not here: it is stated in
   chess-clock vocabulary this capability does not declare, and this
   capability holds the three timing fields as opaque scalars whose
   consumption semantics are explicitly owned elsewhere. What lands here is
   only the shape that makes the default reachable — a submission-timing
   parameter **may be unset**, and an unset parameter is stored and captured
   as unset rather than as a placeholder
   (`team-bot-parameters#unset-timing-parameter-stays-unset`), so the
   substitution happens in exactly one place and "nobody set it" stays
   distinguishable from "the team chose this". `game-start-snapshot` is
   unchanged: capture copies the absence like any other value.
