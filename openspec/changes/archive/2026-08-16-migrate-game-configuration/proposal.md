## Why

Fifth change of the final spec-migration train. The "shape a game before
launch" story — parameters, board preview, the freeze at launch — is
today scattered across three legacy modules along runtime seams: module 02
states the freeze and the parameter split, module 05 the Convex
configuration record, vocabulary, validation, preview mutation, and lock-in
semantics, module 08 the editing and preview UI. Re-authoring it as one
capability puts the whole pre-launch workflow in one readable place and
retires 17 legacy ids.

## Carving decision

Mint **`game-configuration`** exactly as drawn in the capability map and
assignment matrix (author-approved capability set and DAG). The legacy
requirements and review items this change absorbs are recorded in the
identifier map under this change's name. Declared dependencies:
**game-engine** and **global-invariants** — the second added by this change
where requirements' soundness genuinely rests on named invariants, since a
capability's declared dependencies are extended when a citation is
warranted rather than treated as a fixed allowance; peer user-story
capabilities stay unreferenced, as the author-approved DAG requires. The engine owns
the parameter vocabulary itself (game-engine/configuration-parameters);
this capability owns the user-facing configuration surface that the engine
spec delegates bounds enforcement to. Deliberate boundaries: launch
orchestration, statuses, and successor creation belong to the game-lifecycle
story; room containers and the access rules over the configuration surface to
rooms-and-matchmaking; bot parameters are excluded by requirement, phrased
without naming their owning capability.

**The capability carries no notion of permissions at all** (author decision,
2026-07-28). It delivers a *self-contained configuration component* whose
affordances are grouped into three kinds — inspection, parameter editing,
board designation — and whose host states at mount time which kinds are
offered. First delivery is that component standing alone in the development
environment with every kind offered and nothing gating it; the room story
later mounts the same component in the room context and supplies the access
rules from the actors it knows about. That parameterisation is authored as a
requirement because it is the seam the later embedding needs.

## What Changes

- **New capability `game-configuration`** (mint delta, ADDED-only, **21**
  requirements — 13 migrated from the legacy corpus plus the eight of the
  board-generation move below): the single config-record-on-the-game model (including the
  minimal game record this change creates), the closed parameter vocabulary
  with authoritative validation at the record, a field-for-field
  engine-schema mirror with an automated drift guard (constraint-mined),
  bounds read from the engine rather than restated, the requirement that a
  game carry at least one limit on how long it can last, the launch freeze, the
  board-generation / dynamic-gameplay parameter boundary,
  conditional-parameter (zero-sentinel) semantics, the board-preview
  workflow, `boardPreviewLocked` lock-in semantics, infeasibility surfacing,
  the self-contained configuration surface, and its host-selected affordance
  kinds.
- **Board generation moves here from `game-engine`** (2026-07-28, the receiving
  half of a move whose removing half is `revise-game-engine-contract`). Six
  requirements arrive with their slugs unchanged — `hazards`, `fertile-ground`,
  `starting-placement`, `initial-snakes`, `initial-food`,
  `board-generation-retry` — and two are authored here because the move obliges
  them: **`generation-parameters`**, the five board-generation parameters with
  their ranges, defaults and sentinels, which the engine's table no longer
  carries and nothing else declared; and **`generated-board-shape`**, the
  complete Wall ring, which left the engine because resolution treats leaving
  the grid exactly as hitting a wall and therefore never depended on it. Five
  existing requirements are reworded around the new ownership:
  `closed-parameter-vocabulary` (two disjoint halves rather than "exactly the
  engine's"), `engine-schema-fidelity` (the gameplay half mirrors the engine;
  the generation half mirrors nothing, and the check holds the boundary in both
  directions), `parameter-bounds-sourcing` (gameplay bounds read from the
  engine, generation bounds declared here, the roster tightening derived over
  *this* declaration), `conditional-parameter-semantics`, and
  `generation-parameter-boundary` / `board-preview` / `infeasibility-surfaced`,
  which stop calling generation "the engine's". `infeasibility-surfaced` also
  loses its `Depends on: game-engine/board-generation-retry` entry, which became
  an intra-capability edge the moment the requirement arrived here. **No code
  moves**: `packages/engine/src/boardgen.ts` and `perlin.ts` stay where they
  are and are extracted to a shared package in a later PR.
- **UI-mirror requirements folded, enforcement authored once**: 08-REQ-027d
  / 027d1 / 027e become "the UI reflects / never bypasses" scenarios inside
  the owning requirements rather than parallel requirements. The general
  rule they hedged against — client-side behaviour is never the enforcement
  point — is not restated here at all; it belongs to global-invariants, and
  the requirements cite it where their soundness depends on it (see
  design.md for the integration).
- **Contradiction settled by author review (2026-07-24)**: the board
  preview is a single current-preview value on the game record,
  overwritten by each platform-side regeneration and broadcast reactively
  to all configuration clients — no archive of candidates. The lock is a
  boolean designating that platform-held value (a lock request carries no
  board data), auto-clearing on any change to the board's generation
  inputs; an unlocked launch generates fresh from current parameters and a
  new seed, hidden until gameplay delivery. This re-integrates the intent of
  the original 08-REVIEW-015 decision (whose "persist on every
  regeneration" wording had read as mandating a candidate archive) with two
  train-era strengthenings: auto-clear and the no-client-board-data rule.
  Full lineage in design.md.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-game-configuration/specs/game-configuration/spec.md`
  (folded to `openspec/specs/game-configuration/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `game-configuration` (at archive).
- This change creates the minimal `games` table (game identity +
  configuration) and installs the Convex SDK behind it; the lifecycle story
  extends that same table later.
- Requested of `game-engine` (not applied here): promote the engine's
  **gameplay** parameter bounds from comments and the test-only `CONFIG_RANGES`
  table to a public, reflectable data export, so this capability can read them
  instead of restating them. The board-generation bounds are no longer part of
  that request — the engine declares none, and this capability declares them
  itself. See design.md and the change report.
- The eight board-generation requirements describe `packages/engine/src/boardgen.ts`
  and `perlin.ts` as they already stand, stage for stage. Implementing them is a
  citation sweep plus the generation-parameter declaration, not new algorithm
  work; the code's eventual relocation is planned in
  `revise-game-engine-contract`'s tasks.md §12 and is a later PR.
- Code citations: the config validator / schema mirror and preview
  mutations gain `// spec: game-configuration/...` citations when the
  implementation lands.

## Open Questions

None open. Ten resolved:

- **Does board generation belong to the engine?** *Decision (author,
  2026-07-28):* no. The engine is handed a fully specified board — cells with
  their terrain, snakes with their teams and bodies, the items — whose
  dimensions state its size and whose placed snakes state the per-team count. It
  should not know about fertile-ground density or clustering, and it does not:
  no resolver code reads a generation parameter today, and whether fertile
  ground is on is already derived from the board's cells. Seven requirements
  move (six whole, `board-geometry` split), and this capability is the receiving
  home because it already owns the parameters, the preview, the lock and the
  platform-side boundary. Rationale and the "what breaks if reversed" note are
  in design.md.
- **What does the move oblige this capability to author itself?** *Decision:*
  two requirements the engine used to supply by accident —
  `generation-parameters` (with `boardSize` gaining the default `21` the shipped
  configuration already uses; the engine's table deliberately left it blank
  because the engine never needed one) and `generated-board-shape`. Plus the
  re-authoring of `parameter-bounds-sourcing`, whose roster-tightening rule was
  built on an engine-declared outer range that no longer exists.
- **Who forbids a second implementation of board generation, now that it has
  left the engine?** *Decision (author, 2026-07-28):* `global-invariants`, in a
  new requirement minted by `mint-platform-persistence` — the one open change
  that may carry a delta against the folded invariants capability. While
  generation was the engine's, the one-shared-engine invariant covered it;
  after the move nothing did, and the rule binds more than this capability (the
  launch path generates too, and the visual tester seeds sessions from the
  production generator — and `visual-tester` declares this capability for
  exactly that reason, in `add-generated-board-sessions`, so the invariant
  binds capabilities on both sides of that edge). It
  forbids a second *implementation*, not a second *definition* — the rules
  already have exactly one owner here — and says nothing about *where*
  generation runs, which stays this capability's platform-side rule. Two
  requirements declare it, `generation-parameter-boundary` (which drops its own
  now-duplicated one-implementation clause) and `board-preview`; four candidates
  were considered and declined. Rationale in design.md and in
  `mint-platform-persistence`'s design.md §2b–2c.
- **Is the ownership split of the earlier bounds decision reversed?** *Decision:*
  simplified, not reversed. The 2026-07-28 split said generation bounds were
  *additionally* this capability's, tightening an engine-declared outer limit
  against the roster. The outer limit is gone, so the tightening now derives over
  this capability's own declaration and there is nothing to reconcile. The
  gameplay half of that decision — bounds read from the engine, never restated —
  is untouched and is the half that carried the load.


- **A game with no finite maximum duration is configurable.** *Decision
  (author, 2026-07-28):* a game SHALL carry at least one of a turn limit or a
  limit on wall-clock duration, and the wall-clock limit is added to the
  vocabulary as an affordance. Authored into
  game-configuration/bounded-game-duration; the parameter itself is declared by
  the engine (`revise-game-engine-contract`) so this capability can source its bound
  rather than restate it. **Where the limit is evaluated was reversed later the
  same day** and this capability's own requirements were re-checked against the
  reversal: the engine takes each turn's clock duration and each team's burn as
  *declared inputs* of its resolution entry points, so it never reads a clock and
  stays replayable, and the limit is an ordinary engine end condition evaluated
  at a turn commit. The game runtime's part shrank to measuring what a turn cost
  and supplying it (`mint-game-runtime`, `game-runtime/turn-timing-measurement`).
  Nothing in this capability's delta changed: validation, bounds sourcing, the
  preview trigger and the launch freeze all turn on the limit being an ordinary
  member of the vocabulary, which it is either way. Rationale, and the sentences
  in design.md that the reversal falsified, are recorded there.

- **Preview persistence (05-REQ-032b).** *Decision (author, 2026-07-24):*
  one shared current-preview slot on the game record, overwritten by each
  platform-side regeneration and delivered reactively — no candidate
  archive. Lineage in design.md, including the re-integrated 08-REVIEW-015
  rationale.
- **Freeze wording for a game that never launches.** *Decision:* the freeze
  is stated as an edit window (editable only while awaiting launch), so a
  game that ends without launching also stops being editable — faithful to
  05-REQ-024's "editable while awaiting launch only", which module 02's
  launch-focused phrasing left implicit.
- **Who creates the `games` table.** *Decision (author, 2026-07-28):* this
  capability creates it, minimally — the game's identity plus this
  configuration — because it archives first in capability-dependency order.
  The lifecycle story extends the same record rather than introducing a
  second one. Authored into game-configuration/config-lives-on-the-game and
  its `#the-game-record-starts-minimal` scenario; the prerequisite is now a
  definite task rather than an open ownership question.
- **Permissions over the configuration surface.** *Decision (author,
  2026-07-28):* this capability references permissions nowhere. It delivers
  a self-contained component, dev-environment-standalone first, with the
  three affordance kinds named in its own vocabulary and offered or withheld
  by a mount-time parameter per kind. All "permitted administrative user"
  phrasing is removed. Authored into
  game-configuration/self-contained-configuration-surface and
  game-configuration/host-selected-affordances.
- **Parameter bounds ownership.** *Decision (author, 2026-07-28):* bounds on
  parameters that only shape a game already under way belong to the engine
  and are reflected here unchanged; bounds on board-generation parameters
  are additionally this capability's, because the tight ones depend on the
  roster the engine cannot see. The engine currently declares no bounds as
  usable data — an investigation finding recorded in design.md — so the
  authored rule is *read them from the engine*, with the engine-side export
  requested rather than the numbers duplicated. Authored into
  game-configuration/parameter-bounds-sourcing.
