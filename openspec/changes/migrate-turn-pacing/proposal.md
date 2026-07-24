## Why

Twelfth change of the final spec-migration train. The "when does the turn
resolve" story — the chess clock's runtime realization, turn-over
declaration, the exactly-once resolution trigger, per-operator tempo, the
unanimous-flow precondition, the bot's submission timing, and the Captain's
override — is today spread across four legacy modules along runtime seams:
module 04 states the in-runtime clock and declaration machinery, module 06
the durable tempo record and the live pacing-parameter record, module 07
the automated player's submission passes, module 08 the tempo/quorum
model, the Captain controls, and the header discipline. The corpus also
still carries the fossil of a superseded model (the team-level
Centaur/Automatic "operator mode", replaced twice over by per-operator
tempo). Re-authoring the workflow as one capability puts the whole pacing
story in one readable place, on the current tempo model only, and retires
24 legacy ids (one as a documented drop) and 5 review items.

## Carving decision

Mint **`turn-pacing`** exactly as drawn in the capability map and
assignment matrix (author-approved capability set and DAG). The legacy
requirements and review items this change absorbs are recorded in the
identifier map under this change's name. Declared
dependencies: **game-engine, operator-control, bot-framework,
bot-configuration** (the DAG ceiling for this capability). The engine owns
the chess timer's arithmetic RULES — budget, increment, carve-out, cap,
banking, expiry-declares; this capability owns their runtime REALIZATION
(implemented in-instance, invariant at every instant, declaration and
resolution triggering as behaviour) and the team's pacing workflow above
them, citing the engine rather than restating them. The operator story
owns staging, manual mode, and the boot act; the framework story owns how
a move is decided (softmax, dirty flag); the configuration story owns
where the submission-timing parameters are stored and captured — this
capability owns their consumption SEMANTICS, which the configuration
change deliberately left opaque.

**Author-resolved model decisions binding this change:**

- **The stale "operator mode (Centaur/Automatic)" concept is dead.**
  Per-operator tempo (`thinking`/`flow`) is the model: durable across
  turns, flow-on-(re)connect as the ONLY automatic write, toggleable at
  any time, the clock running regardless. Nothing of the old mode model is
  authored.
- **08-REQ-034 is a documented drop** (removed in legacy review, number
  reserved): it retires with a note-only map entry and no authored
  requirement.
- **The unanimous-flow precondition is passive**, with three carve-outs
  authored explicitly: Captain submit bypasses, clock expiry bypasses, and
  zero active operators defers automated declaration (the clock still
  running, so an unattended team cannot stall the game).
- **Boot's quorum half only** is authored here (leaves the active set as a
  disconnect, rejoins in flow); the boot act itself was authored by the
  operator-control change and is cited.
- **06-REQ-040a/040b split**: the live game-scoped parameter record is
  authored here for the timing fields (its temperature half went to
  bot-configuration's game-start capture); 040b's tempo substance is
  authored here (its boot half went to operator-control).

Deliberate boundaries: the per-turn record of budgets, declaration kinds,
and timestamps — and the action-log entries tempo/boot/submit events emit —
belong to the replay-and-audit story (04-REQ-009 and 08-REQ-068 are its
rows; this change authors the declaration-kind distinction as observable
behaviour, not the record); the dirty flag's meaning and the sampling rule
belong to the framework story (cited); parameter storage, captaincy
gating, and snapshot capture belong to the configuration story (cited);
presence colours and latency belong to the operator story (cited from the
header requirement). UI-mirror ids (the header composite, the tempo
toggle, the Captain-control gating) fold in as scenarios of the
requirements whose behaviour they mirror.

## What Changes

- **New capability `turn-pacing`** (mint delta, ADDED-only, 11
  requirements): the in-instance clock realization (no external
  timekeeper, budget+clock invariant at every instant, clocks running
  from the moment the game becomes playable); turn declaration (team-only,
  banking, idempotent, autonomous expiry detection, snakeless
  auto-declaration, kinds distinguishable); exactly-once resolution
  triggering on all-declared and nothing else; the no-late-reordering /
  next-turn bracket; the live game-scoped pacing-parameter record (direct
  reads, mid-game retuning, defaults untouched); durable per-operator
  tempo (flow-on-rejoin as the only automatic write, restating accepted
  as an act, gates nothing but automated declaration); the unanimous-flow
  passive precondition with the Captain/expiry bypasses, the
  zero-operator deferral, and observer exclusion; the scheduled
  submission pass (news-gated, ack-gated clearing); the dynamic-deadline
  final flush (re-arming on shrinking time, flush-before-expiry,
  quorum-withheld defers declaration only); the Captain's immediate
  turn-submit (flush suppression, observation-only coordination,
  keyboard-bindable, non-Captains rejected server-side); and the pacing
  header discipline (sub-second countdown with warning, flicker-free
  submitted indicator, tempo from the durable record).
- **The superseded operator-mode model is buried**: every requirement is
  authored on the per-operator tempo model; the mode-era fossils retire
  through the review-item map entries recording the supersession chain.
- **Constraint-mined invariants promoted to spec text**: budget+clock
  invariant at every instant; turn-0 clocks start at playability; dirty
  news cleared only on staging acknowledgement; the final-flush deadline
  re-arms when observed time shrinks; declaration coordination happens
  exclusively by observing the game instance's declared state; a
  restated tempo write is accepted as an operator act; presence proves
  connectedness only, tempo is read from the durable record.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-turn-pacing/specs/turn-pacing/spec.md`
  (folded to `openspec/specs/turn-pacing/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `turn-pacing`
  (at archive).
- Cross-change citations: this delta cites `operator-control/
  staged-move-log`, `manual-mode`, `captain-boot`, and
  `operator-presence-and-identity`; `bot-framework/softmax-decision` and
  `score-composition`; `bot-configuration/team-bot-parameters` and
  `game-start-snapshot` — all from open sibling changes, resolved by the
  reference lint's open-change overlay; the train's archive order
  (operator-control, bot-framework, and bot-configuration before this
  change) keeps them resolving at fold time.
- Downstream train changes cite this capability: replay-and-audit (the
  per-turn record of budgets and declaration kinds, the tempo/boot/submit
  log events, sub-turn reconstruction against the clock).
- Code citations: the clock/declaration/resolution reducers and the
  expiry scheduler, the tempo and pacing-parameter mutations and tables,
  the automated player's submission coordinator, the Captain-control
  mutations, and the header components gain `// spec: turn-pacing/...`
  citations when the implementation lands.

## Open Questions

None. The candidate ambiguities were all resolved before authoring and are
recorded in design.md: the tempo model supersedes the operator-mode model
(resolved twice over in the legacy reviews, author-confirmed); the
deadline formula and the flush-versus-suppress split between the expiry
and Captain paths (resolved legacy review, carried at intent grain); the
zero-active-operators case (defers automated declaration, clock still
runs — resolved legacy review); and the quorum-withheld-at-deadline case,
where the legacy "proceeds on its own schedule once permitted" wording is
authored as declaration deferred to the player's own schedule within the
turn, which is the minimally constraining reading of the passive
precondition.
