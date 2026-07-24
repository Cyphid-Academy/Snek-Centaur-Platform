## Why

Fifth change of the final spec-migration train. The "admins shape a game
before launch" story — parameters, board preview, the freeze at launch — is
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
identifier map under this change's name. Declared dependency:
**game-engine only** (the DAG ceiling for this capability). The engine owns
the parameter vocabulary itself (game-engine/configuration-parameters);
this capability owns the user-facing configuration surface that the engine
spec delegates bounds enforcement to. Deliberate boundaries: launch
orchestration, statuses, and successor creation belong to the game-lifecycle
story; room containers and edit-permission roles to rooms-and-matchmaking;
bot parameters are excluded by requirement, phrased without naming their
owning capability.

## What Changes

- **New capability `game-configuration`** (mint delta, ADDED-only, 9
  requirements): the single config-record-on-the-game model, the closed
  parameter vocabulary with authoritative validation (UI enforcement
  UX-only), a field-for-field engine-schema mirror with an automated drift
  guard (constraint-mined), the launch freeze, the board-generation /
  dynamic-gameplay parameter boundary, conditional-parameter (zero-sentinel)
  semantics, the board-preview workflow, `boardPreviewLocked` lock-in
  semantics, and infeasibility surfacing.
- **UI-mirror requirements folded, enforcement authored once**: 08-REQ-027d
  / 027d1 / 027e become "the UI reflects / never bypasses" scenarios inside
  the owning requirements rather than parallel requirements.
- **Contradiction settled by author review (2026-07-24)**: the board
  preview is a single current-preview value on the game record,
  overwritten by each platform-side regeneration and broadcast reactively
  to all configuration clients — no archive of candidates. The lock is a
  boolean designating that platform-held value (a lock request carries no
  board data), auto-clearing on board-affecting edits; an unlocked launch
  generates fresh from current parameters and a new seed, hidden until
  gameplay delivery. This re-integrates the intent of the original
  08-REVIEW-015 decision (whose "persist on every regeneration" wording
  had read as mandating a candidate archive) with two train-era
  strengthenings: auto-clear and the no-client-board-data rule. Full
  lineage in design.md.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-game-configuration/specs/game-configuration/spec.md`
  (folded to `openspec/specs/game-configuration/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `game-configuration` (at archive).
- Code citations: the config validator / schema mirror and preview
  mutations gain `// spec: game-configuration/...` citations when the
  implementation lands.

## Open Questions

None open. The 05-REQ-032b preview-persistence question was settled by
the author in review (the shared current-preview slot model; see the
carving decision above and design.md for the full decision lineage
including the re-integrated 08-REVIEW-015 rationale), and the freeze
wording was extended
to cover a game that ends without ever launching (faithful to
05-REQ-024's "editable while awaiting launch only", which module 02's
launch-focused phrasing left implicit).
