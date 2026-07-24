## Why

Sixth change of the final spec-migration train. The "a game is created,
launched (or walks over), played, finishes, and spawns its successor"
story — including the per-game SpacetimeDB instance's provision/teardown
bracket — has no vocabulary owner today: its substance is scattered across
module 02 (the instance-per-game bracket, the pushed game-end
notification, successor auto-creation), module 03 (platform
authentication for privileged instance operations, invitation-refusal
consequences), module 04 (the initialization contract, the game-end
commit boundary, the notification mechanism, teardown availability, the
host warm-up signal), module 05 (the game record, the status machine, the
roster snapshot, the start orchestration, the orphan invariant,
teardown-after-persistence, successor creation, the warm-up dispatch),
and module 06 (fresh games start with zero per-game state). Re-authoring
it as one capability puts the whole lifecycle in one readable place and
retires 30 legacy ids plus 8 review items.

## Carving decision

Mint **`game-lifecycle`** exactly as drawn in the capability map and
assignment matrix (author-approved with the capability set and DAG). The
legacy requirements and review items this change absorbs are recorded in
the identifier map under this change's name. Declared dependencies: **game-engine,
game-configuration, identity-and-authorization, team-server-management**
(the DAG ceiling for this capability, all four cited).

Deliberate boundaries:

- **The terminal state is authored as `finished`** (author-resolved for
  the train): the code's `ended` vocabulary is aligned to the spec as
  part of this train's implementation work, not the other way round.
- **The status machine is forward-only, with the walkover path.** Per the
  resolved walkover review and the legacy refusal-branching text, the
  only transitions are `not-started → playing`, `playing → finished`, and
  the direct `not-started → finished` walkover. The legacy "healthcheck
  rollback" exception is re-expressed without a backward transition: an
  aborted launch never committed `playing`, so the game simply remains
  `not-started`.
- **Forfeit and walkover *scoring* is not authored here.** The lifecycle
  transitions (proceed with the seated teams; walk over below the
  minimum) are this capability's; what score a forfeiter or a walkover
  winner records is the competition format's, per the author routing of
  the forfeit-scoring id to tournaments. The tournament arm is phrased
  abstractly ("a schedule-bound competition format MAY override the
  abort") so this capability never cites downstream vocabulary.
- **Start-time healthcheck branching is authored here**; the healthcheck
  endpoint contract and availability recording are cited from
  team-server-management/server-healthcheck, per the sibling's explicit
  exclusion of the branching.
- **The invitation window is cited, not restated.** The sibling authored
  the bounded response window on the invitation contract
  (team-server-management/game-invitations); this capability owns only
  the sequencing — invitations resolve before initialization — and the
  consequences of how they resolve. (See Open Question 1 on the window's
  value.)
- **The roster snapshot's storage and orchestration are authored here;
  its authorization-binding half is cited** from
  identity-and-authorization/roster-snapshot-binding, per the matrix
  seam. The snapshot is authored as captured at initialization,
  consistent with the open sibling's binding requirement and with the
  restricted-roster launch path (see design.md for the reconciliation of
  the legacy creation-time wording).
- **The record-sufficiency half of persistence is not authored here.**
  Teardown waits for confirmed persistence of the complete record (the
  bracket is this capability's); what the record must contain to be
  sufficient for replay, and the shape of the bundled replay data
  (including its absence on error outcomes), are replay-and-audit's.
- **06-REQ-042 is re-authored generically** ("a fresh game begins with no
  pre-existing per-game platform state") without enumerating downstream
  Centaur-state concepts, per the author decision — plus the launch's
  initialization of that state (idempotent, keyed by the board
  generation's snake identifiers).
- **04-REQ-072's warm-up is the SpacetimeDB host's**, distinct from any
  Snek Centaur Server warm-up; it is authored here as the provisioning
  host's contract together with module 05's best-effort dispatch on
  record creation.
- **Orchestration step mechanics stay in code.** The seven-step legacy
  sequence is re-authored at intent grain as ordering constraints
  (freeze → starting state → provision → invitations resolve → restricted
  init → `playing`); endpoint paths, payload field lists, and the
  management-API mechanics are code-level.

## What Changes

- **New capability `game-lifecycle`** (mint delta, ADDED-only, 14
  requirements): the persistent game record; sole-authority forward-only
  status machine with the walkover; the initialization-time roster
  snapshot; the fresh-instance-per-started-game bracket; the no-orphans
  invariant with post-provisioning-failure cleanup; the launch
  orchestration's ordering and platform-only privilege; the launch gates
  (healthcheck block, refusal abort, the abstract competition override);
  the once-only privileged initialization contract (payload at intent
  grain, seed always forwarded, structural validation,
  nothing-before-init); fresh per-game platform state (idempotent
  initialization, identifier agreement); the game-end commit boundary
  (zero grace window); the pushed finish notification (pre-signed
  self-contained callback credential never persisted, error outcomes,
  bounded retries with required stale-game polling fallback);
  teardown-after-persistence (no self-teardown, prompt after
  confirmation); successor auto-creation (atomic with currency, mutable
  again, no preview carried); and the provisioning host's warm-up signal
  with the best-effort dispatch on record creation.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-game-lifecycle/specs/game-lifecycle/spec.md`
  (folded to `openspec/specs/game-lifecycle/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `game-lifecycle`
  (at archive).
- Code citations: the game schema and status mutations, the start
  orchestration action, the initialization reducer, the game-end HTTP
  action and teardown call, the successor auto-create mutation, and the
  warm-up dispatch gain `// spec: game-lifecycle/...` citations when the
  implementation lands (including aligning the code's `ended` status
  literal to `finished`).

## Open Questions

1. **Invitation response window: ten seconds or thirty?**
   - **Context**: the open sibling authored the invitation contract's
     bounded response window as **thirty seconds**
     (team-server-management/game-invitations, from the legacy module 03
     Design's "waits up to 30 seconds"). But the binding legacy module 05
     orchestration text — amended by a resolved review item routed to
     this change — fixes the same window at **10 seconds**, with recorded
     rationale (acceptance is a trivial store-and-return; a long window
     only delays starts). The two binding legacy sources contradict each
     other, and the train currently carries the 30-second value.
   - **Question**: which value binds? The number lives on the invitation
     contract requirement in the sibling change, so if ten seconds wins,
     the fix is an edit there — this change's delta cites the window
     without restating a number either way, and this change's map entry
     for the routed review item records the resolution.
   - **Options**: (A) thirty seconds — keep the sibling's authored value;
     the later 05 review decision is treated as superseded by the 03
     Design contract. (B) ten seconds — the 05 review decision is the
     later, deliberately-reasoned value; amend the sibling's requirement
     and its design rationale. (C) author the window as "bounded,
     platform-defined" with no number — rejected by the sibling's
     design rationale (the window is a cross-implementation protocol
     deadline both sides must agree on).
   - This change is authored to be correct under any resolution; a human
     decision is required before the train archives.
   - **Decision (author, 2026-07-24)**: Option B — ten seconds. The sibling's game-invitations requirement and design rationale are amended to the ten-second window; the 05 review decision is the later, deliberately reasoned value.
