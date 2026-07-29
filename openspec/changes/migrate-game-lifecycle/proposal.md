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
game-configuration, global-invariants, identity-and-authorization,
team-server-management** — the four the capability map's DAG draws for
this story, all cited, plus `global-invariants`, which several of these
requirements depend on for their soundness (declared dependencies are an
affordance, extended whenever a citation is warranted).

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
- **The invitation window is cited, not restated.** The sibling authors
  the bounded response window on the invitation contract
  (team-server-management/game-invitations); this capability owns only
  the sequencing — invitations resolve before initialization — and the
  consequences of how they resolve.
- **The roster snapshot's storage and orchestration are authored here;
  its authorization-binding half is cited** from
  identity-and-authorization/roster-snapshot-binding, per the matrix
  seam. The snapshot is authored as captured at initialization,
  consistent with the open sibling's binding requirement and with the
  restricted-roster launch path (see design.md for the reconciliation of
  the legacy creation-time wording). The snapshot captures each seated
  team's authorized *members* only: per-member roles do not exist in this
  corpus, and the legacy "and their roles" phrasing is dropped rather than
  narrowed (design.md).
- **"This team is competitively engaged right now" is published here, not
  read from here.** Every game is owned by this capability, so this
  capability derives the fact and publishes it about the team; consumers
  that must gate on it — the roster freeze among them — read it without
  declaring a dependency on games at all. The direction is inverted
  deliberately: the natural one closes a capability cycle (design.md).
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
- **The global invariants are cited where soundness depends on them, and
  never restated.** Runtime placement of the record, status machine and
  teardown; the hermetic instance the launch seeds once; the transactional
  guards behind once-only initialization, idempotent per-game state and
  atomic successor creation; the atomic turn commit that makes the
  zero-grace game-end boundary deliverable; and the pre-signed callback
  credential. Correspondingly, the delta drops the restatements those
  invariants already own — Convex holding no live gameplay subscription,
  and the instance performing no signing of its own — keeping only the
  local halves (nothing but the push advances a `playing` game's status;
  the instance presents the credential unchanged), with the integration
  pinned in design.md.
- **Orchestration step mechanics stay in code.** The seven-step legacy
  sequence is re-authored at intent grain as ordering constraints
  (freeze → starting state → provision → invitations resolve → restricted
  init → `playing`); endpoint paths, payload field lists, and the
  management-API mechanics are code-level.

## What Changes

- **New capability `game-lifecycle`** (mint delta, ADDED-only, 16
  requirements): the persistent game record; sole-authority forward-only
  status machine with the walkover; the initialization-time roster
  snapshot; the published competitive-engagement fact other capabilities
  gate on; the fresh-instance-per-started-game bracket; the no-orphans
  invariant with post-provisioning-failure cleanup; the launch
  orchestration's ordering and platform-only privilege; the launch gates
  (healthcheck block, refusal abort, the abstract competition override);
  the once-only privileged initialization contract (payload at intent
  grain, seed always forwarded, structural validation,
  nothing-before-init); fresh per-game platform state (idempotent
  initialization, identifier agreement); the game-end commit boundary
  (zero grace window); the pushed finish notification (pre-signed
  self-contained callback credential never persisted, error outcomes,
  bounded retries, and the push not being the only path to `finished`);
  stale-game recovery (the scheduled sweep, the elapsed-time bound above the
  maximum game duration, the liveness-only probe, and the two branches — pull
  and finish normally, or finish with an error outcome and reclaim);
  teardown-after-persistence (no self-teardown, prompt after
  confirmation); successor auto-creation (atomic with currency, mutable
  again, no preview carried); and the provisioning host's warm-up signal
  with the best-effort dispatch on record creation.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

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

None remaining; the six this change carried are resolved in place below.

1. **Invitation response window: ten seconds or thirty?**
   - **Context**: the sibling authors the invitation contract's bounded
     response window (team-server-management/game-invitations). The legacy
     module 03 Design says thirty seconds; the binding legacy module 05
     orchestration text, amended by a resolved review item routed to this
     change, fixes the same window at ten, with recorded rationale — the
     answer is a status code, and a long window only delays starts.
   - **Question**: which value binds? The number lives on the invitation
     contract in the sibling change, so this change's delta cites the
     window without restating a number either way.
   - **Options**: (A) thirty seconds; (B) ten seconds; (C) "bounded,
     platform-defined" with no number — rejected, because the window is a
     cross-implementation deadline both sides must agree on.
   - **Decision (author, 2026-07-24)**: Option B — ten seconds. The
     sibling's requirement carries the ten-second window; the 05 review
     decision is the later, deliberately reasoned value. A server that has
     scaled to zero must cold-start within it, which is the constraint the
     number now has to respect.

2. **Does the managed provisioning target accept a platform-issued
   credential, or gate creation on an account linked to its own web
   console?**
   - **Context**: `instance-provisioning-authority` has the platform sign
     its own credential for provisioning and store nothing target-specific.
     That is available on a self-hosted target. A managed target that binds
     billing and tier semantics to a console account may require an identity
     linked to that account, which an arbitrary platform-issued credential
     is not.
   - **Question**: does the managed target honour a platform-issued
     credential for creating a database?
   - **Options**: (A) it does — deployment target stays an operational
     preference; (B) it does not — the only route is capturing a credential
     from an interactive login and installing it on the automation host,
     which is a stored credential the invariants forbid, so deployment
     target becomes an architectural constraint rather than a preference.
   - **Decision (author, 2026-07-27)**: Option B — it does not. The managed
     target attaches the billing account an instance needs through an
     interactive browser sign-in, so no platform-issued credential can stand
     in for it, and the workaround would be a captured credential at rest —
     which the invariants forbid. Game instances are therefore provisioned
     on a self-hosted host, and that is an architectural constraint rather
     than an operational preference. `instance-provisioning-authority` drops
     its conditional framing accordingly: the host admits unauthenticated
     creation, so the boundary in front of it is not optional.

3. **Does a provisioned instance re-resolve the platform's signing keys, or
   pin what it captured?**
   - **Context**: an instance obtains token-verification material at startup
     and makes no per-connection external call, and provisioning now
     authenticates with a platform-issued credential.
   - **Question**: does the provisioning target re-resolve the platform's
     published verification material over an instance's life, or pin what it
     captured at provisioning time?
   - **Options**: (A) pinned — platform key rotation must be scheduled between
     games, or instances need a re-key path; (B) re-resolved — rotation is a
     routine background operation.
   - **Decision (author, 2026-07-27, verified against the runtime)**:
     Option B. The instance re-resolves the issuer's published material
     every time it validates a token's identity claims, so a key rotation
     reaches in-flight games without coordination. Platform key rotation is
     therefore an ordinary background operation, needing neither a window
     between games nor a re-key path for running instances — and the
     hermeticity exception this rests on is already the one the invariant
     sanctions, verification material obtained at startup rather than a
     per-connection call to Convex.

4. **Who sources "this team is competitively engaged right now" for the
   roster freeze?**
   - **Context**: `team-management/roster-freeze` must freeze a team's
     roster while the team is playing, and states that it consumes the fact
     as a freeze source and resolves none of it itself. Someone has to
     resolve it. The obvious candidate is team-management declaring
     `game-lifecycle` and reading game records — but
     `team-management → game-lifecycle → team-server-management →
     team-management` is a real cycle: this capability declares
     team-server-management for the game invitations and the launch
     healthcheck, and team-server-management declares team-management for
     the captain's server nomination.
   - **Question**: which end of that edge owns the fact?
   - **Options**: (A) team-management declares `game-lifecycle` and derives
     engagement from game records — rejected, it closes the cycle;
     (B) game-lifecycle publishes engagement as a fact about the team and
     team-management consumes it while declaring nothing; (C) leave it
     unsourced and let each consumer derive its own — rejected, "engaged"
     then has as many definitions as consumers.
   - **Decision (2026-07-28)**: Option B — invert the edge. This change
     adds `game-lifecycle/competitive-engagement`, making this capability
     the single publisher: derived from the games it owns, true from a
     game's commit to play until that game's terminal state, held open
     while any of the team's games is still in play, and readable by a
     capability that knows nothing about games — including inside the
     transaction of the write it must exclude. The scenario
     `#published-not-inferred` pins that consumers read it rather than
     re-deriving it, so there is exactly one definition of engaged. No
     dependency is added in either direction: publishing is what removes
     the need for one. Rationale and the "what breaks if reversed" note are
     in design.md.

5. **Is the roster snapshot's "and their roles" clause live, or a fossil?**
   - **Context**: `roster-snapshot` captured each seated team's "authorized
     members **and their roles**", inherited from legacy wording.
     `team-management/roster-of-operators` is emphatic that membership
     carries no role distinctions of any kind and that every member is an
     operator; per-member roles were removed corpus-wide with the
     timekeeper elimination, and captaincy was made structural for exactly
     that reason.
   - **Question**: does "roles" point at something still live — the
     coach/operator distinction being the one candidate — or is it a fossil
     of the dead role model?
   - **Options**: (A) live, and the clause should be narrowed to name the
     surviving distinction; (B) fossil, and the clause is dropped.
   - **Decision (2026-07-28)**: Option B — fossil, dropped. The
     coach/operator distinction is real but sits outside the snapshot
     entirely: a coach is not a member (`team-management/coaches` keeps
     designations on the team record, distinct from the roster), coach
     eligibility is answered from the live designation, and what the
     snapshot binds is operator-token eligibility plus which team
     identities participate, per
     `identity-and-authorization/roster-snapshot-binding`. Nothing in the
     corpus can populate a per-member role, so the clause is removed rather
     than narrowed; the sibling change had already declined to carry the
     same phrase forward in its own view text.

6. **What is a "stale game", and what does recovering one do?**
   - **Context**: `finish-notification` raised the legacy "Convex *can*
     detect stale games via polling as a fallback" to required behaviour
     (`#lost-notification-recovered`) without defining any of it. Three
     things were undefined: what makes a game count as silent, what a probe
     of a still-`playing` record may read, and what recovery actually does.
     The constraint is tight from both sides: Convex is the sole status
     authority and deliberately watches nothing live
     (`global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game`),
     so a scheduled sweep is the only channel it has; and
     `teardown-after-persistence#no-teardown-before-persistence` forbids
     reclaiming an instance that still holds an unpersisted record, so
     "just tear it down" is not available either.
   - **Question**: which signal marks a game stale, what may the probe read,
     and what does recovery do with each answer?
   - **Options**: (A) pull-then-finish always — best fidelity, but it has no
     answer when the instance is already gone; (B) timeout-to-error always —
     cheapest, but every false positive silently costs a replay;
     (C) hybrid — probe for a live instance, pull and finish normally when
     one answers, error-finish and reclaim when none does; (D) operator-driven
     recovery only — leaves `#lost-notification-recovered` unbacked;
     (E) revert the scenario to a MAY — reinstates the liveness hole, and
     requires deleting the scenario rather than deferring it.
   - **Decision (author, 2026-07-28)**: Option C — the hybrid probe, minted
     as `game-lifecycle/stale-game-recovery`. Silence is elapsed time: a
     record still `playing` with no finish notification past a bound set
     above the longest game the configured clocks and turn limit can produce,
     found by a recurring Convex sweep, which is the only channel a runtime
     that watches nothing live has. The probe establishes only whether a live
     instance stands behind the record and consumes no gameplay state.
     Alive ⇒ retrieve the completed record and run the ordinary terminal
     handling (persist → `finished` → teardown), which is the architecture's
     existing once-only arrival initiated from the other side rather than a
     new mirroring channel; gone or unreachable ⇒ finish with an error
     outcome (already permitted by `#error-outcome-still-finishes`) and
     reclaim the residue, where the persistence gate is vacuous because
     nothing retrievable remains. The sweep cadence and the bound's literal
     value stay plastic. Rationale and the "what breaks if reversed" note are
     in design.md.
