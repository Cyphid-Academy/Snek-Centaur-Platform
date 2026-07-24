## Why

Thirteenth change of the final spec-migration train. The "bot explains
itself" story is scattered across three legacy modules at three altitudes:
the persistent slot and its write rules in the Centaur-state module, the
snapshot-triggering and sole-writership duplicated in the bot-framework
module, and the operator-facing displays (score-coloured candidates,
worst-case preview, decision breakdown) in the server-app module — plus
one id-less constraint-mined ledger entry from the module-02 migration
(the extensible recorded-output slots). Re-authoring them as one
capability puts the entire transparency contract — what gets recorded,
who writes it, what a snapshot means, and what the operator sees — in one
readable place, with the record as the single source every display and
every future replay renders from.

## Carving decision

Mint **`decision-transparency`** from the author-approved capability map
and assignment matrix. The legacy requirements and review items this
change absorbs are recorded in the identifier map under this change's
name; the scope also includes the module-02 parked ledger's id-less
constraint-mined entry "Extensible Centaur state slots". Declared
dependencies: **bot-framework, operator-control** (the DAG ceiling for
this capability). The framework produces the decision state this
capability records and renders (stateMap, worst-case worlds, timestamps,
the dirty flag); operator control owns the held-snake concept and the
staging affordance the score displays decorate.

**Author-resolved boundary decisions binding this change:**

- **06-REQ-027 is re-authored as "the team's hosting server is the sole
  writer".** The legacy text authenticates that writer via the
  per-team game credential — credential issuance and game-lifecycle
  vocabulary sit outside this capability's dependency ceiling, so the
  requirement here names the writer (the hosting server process the
  team's automated player runs in, via bot-framework), and the
  credential mechanics stay with the identity story that owns them.
  07-REQ-004 (the framework-side statement of the same sole-writership)
  dedupes onto the same requirement.
- **No rate limit on snapshot writes** (06-REQ-029, author-resolved): the
  platform imposes no per-turn or per-second throttle; the writing
  framework alone owns cadence.
- **08-REQ-049 is already dropped** (documented MVP deferral of the
  annotations layer, per the resolved legacy review) — not authored
  here; the surviving posture (the published slots are the whole
  operator-visible decision surface, violations server-log-only) is
  authored in `published-slots-only`.
- **08-REQ-044/045 are split with operator-control** (which retires the
  ids): the staging affordance, lethal-but-selectable semantics, and the
  stage-and-set-manual behaviour were authored there; their
  decision-display halves — the score labels and consistent colouring on
  the direction buttons, and the direction pick triggering the
  worst-case preview — are authored here, decorating the affordance
  operator-control minted.
- **UI-mirrors fold as scenarios**: the reactive-update ids (08-REQ-050,
  08-REQ-060) and the neutral-state rendering clause of 08-REQ-040
  become scenarios on the display requirements they qualify, not
  standalone requirements.

## What Changes

- **New capability `decision-transparency`** (mint delta, ADDED-only, 8
  requirements): the computed display state record and its per-direction
  contents with deterministic worst-case selection and travelling
  per-snake turn timestamps; hosting-server sole-writership with
  unthrottled, writer-owned cadence; full-snapshot replacement semantics
  triggered by the dirty flag, with consumers forbidden to diff-merge;
  the published-slots-only rendering rule (no client recomputation,
  absent renders absent, violations server-log-only); the score-coloured
  candidate cells and direction-button labels; the worst-case world
  preview (pick-triggered, reactive, never rendered without a record);
  the per-direction decision breakdown table; and the extensible
  recorded-output slots.
- **~13 source items compress to 8 requirements**; the two resolved
  legacy review items are encoded as scenarios (deterministic worst-case
  tie-break → `computed-display-state#worst-case-world-is-deterministic`;
  annotations excised with violations server-log-only →
  `published-slots-only#violations-stay-in-the-server-log`).
- **The module-02 ledger entry graduates**: the id-less "Extensible
  Centaur state slots" entry (the final section of the module-02 parked
  ledger) is authored as `decision-transparency/extensible-state-slots`.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

## Impact

- New:
  `openspec/changes/migrate-decision-transparency/specs/decision-transparency/spec.md`
  (folded to `openspec/specs/decision-transparency/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `decision-transparency` (at archive).
- Cross-change citations: this delta cites
  `bot-framework/worst-case-statemap`, `frozen-snake-timestamps`,
  `score-composition`, `selection-promotion`, `embedded-team-player`,
  and `author-fault-containment`, plus
  `operator-control/exclusive-selection` and
  `board-and-move-interface`, all from open sibling changes; the
  reference lint resolves them via the open-change overlay, and the
  train's archive order (operator-control and bot-framework before this
  change) keeps them resolving at fold time.
- Downstream train change: replay-and-audit cites this capability (the
  recorded snapshots and slots its replay reconstruction consumes).
- Code citations: the Centaur-state schema/mutation for the display
  record, the framework's snapshot writer, and the operator UI's
  candidate-colouring, preview, and breakdown components gain
  `// spec: decision-transparency/...` citations when the implementation
  lands.

## Open Questions

None. The candidate ambiguities were resolved by the author before
authoring and are recorded in design.md: the 06-REQ-027 re-authoring
ceiling (writer named without credential vocabulary), the no-rate-limit
decision (cadence owned by the bot), 08-REQ-049's drop (annotations
deferral, with the violations-server-log-only posture carried), the
08-REQ-044/045 display/staging split with operator-control, and the
ledger entry's graduation path.
