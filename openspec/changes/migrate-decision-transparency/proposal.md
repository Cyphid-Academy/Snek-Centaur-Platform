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
dependencies: **bot-framework, operator-control, global-invariants**.
The framework produces the decision state this
capability records and renders (stateMap, worst-case worlds, timestamps,
the dirty flag); operator control owns the held-snake concept and the
staging affordance the score displays decorate; global-invariants owns
the cross-cutting rules this capability's soundness rests on (where
Centaur state lives, who may read a team's deliberation, where
write authorization is enforced). Dependencies are declared, not
capped — the list is extended whenever a citation is warranted.

**Author-resolved boundary decisions binding this change:**

- **06-REQ-027 is re-authored as "the team's hosting server is the sole
  writer".** The legacy text authenticates that writer via the
  per-team game credential — credential issuance and game-lifecycle
  vocabulary belong to capabilities this one does not declare as
  dependencies, so the
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

- **New capability `decision-transparency`** (mint delta, ADDED-only, 9
  requirements): the computed display state record and its per-direction
  contents with deterministic worst-case selection, travelling
  per-snake turn timestamps, and the scoring-time portfolio weight and
  display label of every contributing heuristic; hosting-server
  sole-writership with
  unthrottled, writer-owned cadence; full-snapshot replacement semantics
  triggered by the dirty flag, with consumers forbidden to diff-merge;
  the published-slots-only rendering rule (no client recomputation,
  absent renders absent, violations server-log-only); the client-local
  examined selection of (snake, direction) that the displays key off; the
  score-coloured
  candidate cells and direction-button labels; the worst-case world
  preview (reactive, never rendered without a record);
  the per-direction decision breakdown table; and the extensible
  recorded-output slots.
- **~13 source items compress to 9 requirements**; the two resolved
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
  `docs/spec-migration/`.

## Impact

- New:
  `openspec/changes/migrate-decision-transparency/specs/decision-transparency/spec.md`
  (folded to `openspec/specs/decision-transparency/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `decision-transparency` (at archive).
- Cross-change citations: this delta cites
  `bot-framework/worst-case-statemap`, `frozen-snake-timestamps`,
  `per-snake-portfolio`, `score-composition`, `total-heuristic-coverage`,
  `selection-promotion`, `embedded-team-player`,
  and `author-fault-containment`, plus
  `operator-control/board-and-move-interface` and
  `selection-is-view-only#no-affordances-without-holding`, all from open
  sibling changes; the
  reference lint resolves them via the open-change overlay, and the
  train's archive order (operator-control and bot-framework before this
  change) keeps them resolving at fold time. It also cites
  `global-invariants/team-private-centaur-state`,
  `centaur-state-boundary`,
  `security-enforced-outside-the-library`,
  `one-contract-many-surfaces`,
  `authenticated-unambiguous-identity`, and `client-truthfulness` —
  the invariants this capability's soundness depends on.
- Downstream train change: replay-and-audit cites this capability (the
  recorded snapshots and slots its replay reconstruction consumes).
- Code citations: the Centaur-state schema/mutation for the display
  record, the framework's snapshot writer, and the operator UI's
  candidate-colouring, preview, and breakdown components gain
  `// spec: decision-transparency/...` citations when the implementation
  lands.

## Open Questions

The candidate ambiguities present at authoring were resolved by the author
beforehand and are recorded in design.md: the 06-REQ-027 re-authoring
within this capability's declared dependencies (writer named without
credential vocabulary), the no-rate-limit
decision (cadence owned by the bot), 08-REQ-049's drop (annotations
deferral, with the violations-server-log-only posture carried), the
08-REQ-044/045 display/staging split with operator-control, and the
ledger entry's graduation path.

Five items found in review of the drafted delta are now closed.

- **Decision (author, 2026-07-28) — the coverage obligation behind relative
  impact belongs to the heuristics, not to the record.** The centred column
  needs each heuristic's weighted contribution for *every* candidate direction
  the snapshot carries, and the first pass secured that by requiring the
  *record's* heuristic set to be uniform across its directions — a constraint
  the record invented about a producer it does not own, and one it could not
  discharge, since a record can only write down what it is handed. The author's
  version puts it where it belongs: every heuristic produces a concrete value
  for every candidate move, cheaply, by evaluating over a partial state in
  which only the perspective snake has advanced when it cares nothing for the
  replies (`bot-framework/total-heuristic-coverage`, authored in that
  capability's own change). This capability **cites** it — the declared edge
  already runs `decision-transparency` → `bot-framework`, and
  `computed-display-state` and `decision-breakdown` now name it in their
  dependencies — and keeps only a recording clause of its own: the record keeps
  every heuristic it was handed for a direction, at one scoring-time weight per
  heuristic for the snapshot. Uniformity across directions is stated as the
  consequence it is, and `#the-same-heuristics-under-every-direction` survives
  as a recording-fidelity check rather than as an independent rule, so the same
  constraint is not authored in two places. The relative-impact definition
  itself is unchanged. Rationale and the reversal consequences are in design.md.

- **Decision (author, 2026-07-28) — relative impact is a centred
  contribution, not a ratio.** The breakdown's relative-impact column was
  left as mechanism because two candidate denominators disagreed. Neither
  was right: a heuristic's relative impact for a candidate move is its
  weighted score for that move **minus its mean weighted score across all
  the candidate moves** the snapshot records — signed and centred, so a
  heuristic that scores every candidate identically has zero relative impact
  everywhere, carrying no information about which move is best
  (`decision-breakdown#uniform-heuristic-has-zero-relative-impact`).
  Checking the recording side: `computed-display-state` already records
  **per candidate direction**, so every term of the mean is inside the one
  snapshot and the column needs no new recorded quantity — the live view and
  a later replay of that snapshot compute it identically, as
  `published-slots-only#no-client-recomputation` requires. One gap did have
  to be closed — that every candidate carries a value from every heuristic, so
  the mean is over a complete set rather than one with holes — and the item
  below records where it was finally closed: on the producer, not on the
  record. Capturing the *weights* at composition time still needs no amendment
  to `bot-framework`: it is what "the portfolio weight in force at the moment
  the score was computed" already demands of whoever writes the record, and
  restating it there would be the DRY failure the spec rules forbid. Rationale
  and the reversal consequences are in design.md.

- **Decision — the record carries the weights it scored with.** The delta
  recorded per-heuristic outputs but no weights, while
  `decision-breakdown` demanded each row's *current* portfolio weight and
  its weighted contribution; the only source of a current weight is
  `bot-configuration`'s live portfolio record, which drifts under the
  snapshot. `computed-display-state` now records, per contributing
  heuristic, the portfolio weight in force at scoring time and the display
  label as it then stood, and `decision-breakdown` reads those. The
  breakdown therefore joins nothing, its contributions provably sum to the
  recorded score, a live view and a later replay of one snapshot agree,
  post-game replay never has to read team-scoped configuration, and this
  capability needs no `bot-configuration` dependency — none is declared.
  Rationale and the reversal consequences are in design.md.
- **Decision — the displays are parameterised by (snake, direction,
  snapshot), not by holding.** All three display requirements scoped to
  "the operator's held snake", excluding the coach who holds nothing and
  the replay auditor inspecting any snake on the viewed team, both of
  which other capabilities require of these same panels. A new
  requirement, `decision-transparency/examined-subject`, restores legacy
  module 08's inspection layer as this capability's own concept, and the
  three displays now key off it — so coach mode and replay inspection are
  in scope by construction.
- **Decision — the examined direction and the staged direction are two
  concepts, both now named.** `worst-case-preview` keyed off the direction
  the operator had *picked* (which operator-control defines as immediately
  staged) while `decision-breakdown` keyed off the direction *examined*.
  They are distinct: `examined-subject` is explicitly client-local and
  never persisted — it could not be persisted without a third recorded
  slot, which `extensible-state-slots` forbids — and examining never
  stages. The operator's single gesture is preserved: a pick on the
  staging affordance stages the direction *and* makes it the examined one.
  operator-control's side is sharpened in its own change (every pick on
  the staging affordance is a staging act; no other surface nominates a
  direction to the game).
