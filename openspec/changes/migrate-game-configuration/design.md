## Context

Migration change minting `game-configuration` from legacy modules 02, 05,
and 08 (17 ids, 3 review items), per the author-approved capability map,
dependency DAG (game-engine only), and assignment matrix. Legacy text is
binding source material; the module-02 parked ledger's drafted text for
02-REQ-050 was used as a starting point. This file records the decisions
a future reader cannot recover from the specs alone.

## Decisions

### Preview persistence: the shared current-preview slot (author-settled, 2026-07-24)

Module 05 carried two divergent renderings of the board preview: the
requirement text of 05-REQ-032b (persist the starting state on every
regeneration; a `boardPreviewLocked` boolean governs launch reuse) and the
never-reconciled pre-decision Design §2.4 (candidates not auto-persisted; a
client-supplied lock-in payload). A forensic pass established the
chronology: the requirement text was the author's deliberate 2026-04-17
decision (08-REVIEW-015), whose cascade never updated the two-days-older
Design section. During train review the author first read
"persist on every regeneration" as mandating an archive of every candidate
and reversed it; the forensic findings then surfaced the original
decision's actual intent, which the author re-integrated and settled as:

- **One current-preview slot** on the game record, overwritten by each
  platform-side regeneration — never an archive of candidates.
- **Broadcast, not private**: the slot is delivered reactively to every
  configuration client, so concurrent admins and rejoining clients all
  render the same candidate (the property the 2026-04-17 decision was
  buying with "trivially reactive").
- **Boards only ever come from the platform**: generation runs in a
  platform mutation/action; a lock request carries no board data — the
  boolean designates the platform-held value, which structurally closes
  both the fabrication hole of the stale Design (client-supplied payload)
  and the WYSIWYG race (the flag designates the exact value every viewer
  is rendering).
- **Auto-clear on board-affecting edits** (new, this train): the lock
  cannot survive a change to its generation inputs, so a frozen
  configuration and a launched board always agree; re-locking is a
  deliberate act on the new candidate.
- **Unlocked launch generates out of sight**: fresh parameters + fresh
  seed at launch, persisted as the starting state, first visible through
  gameplay delivery (board surprise, per 08-REVIEW-015's unlocked arm).

What breaks if reversed to fully ephemeral candidates: shared visibility
and refresh-survivability of the candidate need a bespoke delivery channel
that the slot provides for free, and the lock reacquires a capture race.
What breaks if the slot is read as an archive: candidate exploration
writes game data the product never wanted recorded. Whether the slot and
the designated starting state are one field or two is mechanism.

### Config on the game record, one live editable game (05-REVIEW-008)

The room holds no configuration state; every game carries its own record,
and at most one game per room is open for configuration at a time. This is
the resolved 05-REVIEW-008 architecture: with no room-level parameter set,
game turnover (a finished game being succeeded by a fresh editable one)
has nothing to race against, and "which values govern this game" always
has exactly one answer — the game's own record. Reversed, config edits and
game turnover race, and historical games could display values they never
ran under. The display half (08-REQ-102's "snapshotted params, never
defaults") folds into the same requirement as
#views-read-the-games-own-record: under config-on-the-game it is not a
separate rule but the observable consequence of the single record plus the
launch freeze.

### UI-mirror requirements folded; enforcement authored once

08-REQ-027d (client range checks are UX-only), 027d1 (board-size widget),
and 027e (visual gating of conditional parameters) each mirrored an
authoritative Convex-side rule. Per the author's instruction, enforcement
is authored once, in the owning requirement, and the UI's obligations
appear as reflect/never-bypass scenarios
(#out-of-range-rejected-regardless-of-client, #board-size-round-trip,
#ui-communicates-without-blocking). Reversed — parallel UI requirements
restating the server rules — the two copies drift and the spec re-imports
the legacy corpus's stitching problem.

Within that fold, 08-REQ-027d1 was deliberately demoted to its intent
grain: the spec keeps the round-trip discipline (the raw integer is the
only persisted value; the widget derives its display from the stored
integer), because that is the invariant a future implementer could
silently violate (persisting a preset token would corrupt the schema
mirror). The preset list itself — four named options, their labels and
values — is presentation mechanism and stays in code; the legacy text
never enumerated the presets, so nothing binding is lost.

### The parameter boundary is authored from the configuration side

02-REQ-050's parameter split and 05-REQ-032d's subtree partition become
game-configuration/generation-parameter-boundary: board-generation
parameters are consumed platform-side into a precomputed initial state;
the per-game runtime receives only dynamic gameplay parameters plus that
state, and never generates a board (the generation-locality half of
08-REVIEW-014; its no-client-generation half lands in
game-configuration/board-preview#clients-render-never-generate). The
launch orchestration that performs the handoff belongs to the
game-lifecycle story; what is authored here is the shape of the boundary,
which is configuration's contract. Reversed — generation allowed in the
runtime or the client — board secrecy (the unlocked fresh-seed path) and
the single-authority determinism story both collapse.

### Boundary phrasing without naming sibling capabilities

05-REQ-026's bot-parameter exclusion is a boundary with the
bot-configuration story, and 08-REQ-102's display rule borders
game-lifecycle. Both are phrased self-containedly ("bot behaviour
parameters are owned elsewhere"; "that game's own record") because this
capability may only reference game-engine — the dependency ceiling is
part of the author-approved DAG, and citing peers would invert it.

### Freeze wording covers the never-launched ending

02-REQ-050 ties the freeze to launch; 05-REQ-024 ties editability to the
awaiting-launch state. A game can end without ever launching (a walkover),
which the launch-anchored phrasing alone would leave editable forever.
game-configuration/launch-freeze therefore says: editable only while the
game awaits launch; frozen at launch; a game that ends without launching
likewise stops being editable. This is 05-REQ-024's model stated
completely, not new policy.

### Mechanism deliberately left in code

Regeneration cadence (debouncing of rapid parameter edits) is
design-level per the legacy text and stays that way; the reactive delivery
channel's implementation, the mutation names, and the preset widget's
option list are all code mechanism. None carries an invariant beyond what
the authored requirements already pin.

## Constraint-mining (mandatory final step)

- **Minted: game-configuration/engine-schema-fidelity.** The whole design
  assumes the stored configuration and the engine's `GameConfig` are the
  same shape — the no-translation handoff, the closed vocabulary, and the
  parameter boundary all silently depend on it. Module 05's Design carried
  this as a compile-time `AssertEqual` drift guard; that is exactly an
  invariant a future implementer could silently violate (add an engine
  field, forget the mirror, ship a validator that drops it). It is
  therefore a requirement with a build-breaking scenario, minimally
  constraining: any automated check that fails on divergence satisfies it.
- **Checked, already requirements**: persist-on-every-regeneration and
  no-client-generation (the other two invariants the preview design's
  quality depends on) are authored directly in
  game-configuration/board-preview; authoritative-validation-at-the-record
  is authored in game-configuration/closed-parameter-vocabulary.
- **Checked, plastic**: debounce cadence and the preview warm-up-style
  optimisations are performance-motivated mechanism — doc comments citing
  this change suffice when they land.
