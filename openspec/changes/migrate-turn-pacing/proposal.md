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
dependencies: **game-engine, global-invariants, operator-control,
bot-framework, bot-configuration** — the capabilities this delta may cite,
per the approved DAG. `global-invariants` is declared because several
requirements here depend on cross-cutting invariants remaining true;
declared dependencies are an affordance, extended whenever a citation is
genuinely warranted. The engine owns
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
  keyboard-bindable, offered to the Captain alone as the reference
  application's affordance allocation and expressly not an access
  control); and the pacing header discipline (sub-second countdown with
  warning, flicker-free submitted indicator, tempo from the durable
  record).
- **The superseded operator-mode model is buried**: every requirement is
  authored on the per-operator tempo model; the mode-era fossils retire
  through the review-item map entries recording the supersession chain.
- **Constraint-mined invariants promoted to spec text**: budget+clock
  invariant at every instant; turn-0 clocks start at playability; dirty
  news cleared only on staging acknowledgement and never by the same
  pass's decision-state publication; the final-flush deadline
  re-arms when observed time shrinks; declaration coordination happens
  exclusively by observing the game instance's declared state; a
  restated tempo write is accepted as an operator act; presence proves
  connectedness only, tempo is read from the durable record; and
  team-granular authorization never produces an anonymous act — the
  instance records the authenticated identity behind every command it
  accepts.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-turn-pacing/specs/turn-pacing/spec.md`
  (folded to `openspec/specs/turn-pacing/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `turn-pacing`
  (at archive).
- Cross-change citations: this delta cites `global-invariants/
  game-instance-hermeticity`, `transactional-invariant-enforcement`,
  `authoritative-turn-resolution`, `team-granularity-authorization`,
  `authenticated-unambiguous-identity`, and `centaur-state-boundary` —
  some of them requirements the open `extend-global-invariants` change adds
  or amends, so that change archives before this one; `operator-control/
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

None open. The candidate ambiguities present at authoring were all resolved
before the deltas were written and are recorded in design.md: the tempo
model supersedes the operator-mode model
(resolved twice over in the legacy reviews, author-confirmed); the
deadline formula and the flush-versus-suppress split between the expiry
and Captain paths (resolved legacy review, carried at intent grain); the
zero-active-operators case (defers automated declaration, clock still
runs — resolved legacy review); and the quorum-withheld-at-deadline case,
where the legacy "proceeds on its own schedule once permitted" wording is
authored as declaration deferred to the player's own schedule within the
turn, which is the minimally constraining reading of the passive
precondition.

Three questions were raised in review after authoring and are now closed:

1. **Is a non-Captain turn submission rejected server-side?**
   - **Context**: `captain-submit` demanded server-side rejection of a
     non-Captain turn-submit, but the declaration is a game-instance
     operation and the instance authorizes at team granularity with no
     notion of an individual operator, so a member operator holding a game
     connection can declare directly and the instance must accept it.
   - **Decision (author, 2026-07-28)**: the requirement is unimplementable
     and is withdrawn. The `#non-captain-rejected-server-side` scenario is
     removed and `captain-submit` is reworded: the reference application
     offers turn-submit to the Captain alone, that is an allocation of an
     affordance and expressly **not** an access control, and a custom
     Centaur Server may implement its own rules about who may submit. The
     requirement says so in as many words, because "Captain-only" reads as
     a security control to every reader who has not been told otherwise.
     `#captain-only-is-allocation-not-enforcement` carries the point, and
     the `security-enforced-outside-the-library` declaration goes with the
     withdrawn claim.
2. **Does the instance record who acted, given it does not check who
   acted?**
   - **Context**: `turn-declaration` stated the missing within-team check
     and left attribution implied, which reads as licence to accept
     commands anonymously within a team.
   - **Decision (author, 2026-07-28)**: both halves are kept and both are
     now stated. The instance does not care which operator issues an
     instruction, **and** it always records the specific authenticated
     identity that sent the command
     (`turn-declaration#team-granular-but-never-anonymous`, with a new
     `global-invariants/authenticated-unambiguous-identity` declaration).
3. **Who clears the automated player's dirty flag?**
   - **Context**: `bot-framework` mints the setting side of the flag; the
     clearing side sat implied in this capability's ack-gating sentence,
     leaving the lifecycle stated in neither capability end to end.
   - **Decision (author, pre-authored, recorded 2026-07-28)**: this
     capability authors the clearing — the workflow that stages the decided
     move clears the flag, and only on the staging acknowledgement. It
     explicitly does **not** clear on a decision-state publication, even
     though the same pass performs one
     (`scheduled-submission#publishing-is-not-staging`).

A fourth review item — the `flow-quorum` ↔ `final-flush` requirement-grain
dependency cycle — is dissolved by the author's corpus-wide rule that no
requirement declares a dependency on a requirement in its own capability.
All nine of this delta's intra-capability entries are removed; see
design.md.

Two author corrections landed on 2026-07-28, both about the **automatic
submission time allocation** this capability already carries:

- **Decision — its default is the turn's own clock accrual.**
  `live-pacing-parameters` initialised the live values from the team's
  captured defaults but nothing said what a team's default *default* was.
  Absent a team setting, the automatic submission time allocation is exactly
  the clock time the game accrues to the team each turn — "as long as the
  game gives you, and no longer", so a team at the default spends its accrual
  and its remaining time neither drains nor banks
  (`live-pacing-parameters#unset-allocation-defaults-to-the-turns-accrual`).
  **It is authored here, not on `bot-configuration/team-bot-parameters`**,
  for two reasons: that requirement deliberately holds the timing parameters
  as opaque scalars "whose consumption semantics are owned elsewhere", and
  this rule *is* consumption semantics; and it is stated in game-clock
  vocabulary, which this capability declares and `bot-configuration` does
  not. This requirement now declares `game-engine/chess-timer` to match. The
  configuration story's only change is its own: its record must be able to
  hold a timing parameter as unset rather than storing a placeholder.
- **Decision — the allocation is the value the bot framework's simulations
  declare** as the turn's duration and every team's burn, replacing what had
  been framed as a private framework constant. Nothing in this capability
  changes for it: `live-pacing-parameters` already says the live record is
  "the operative source that every consumer reads directly", and the
  framework is one more consumer. The declared dependency runs from the
  framework's side of the graph — except that it cannot, since
  `bot-framework` is upstream of this capability, so that requirement names
  the concept in prose and declares nothing.
- **No narrowing to captain-only.** The author's phrasing has the captain
  able to modify the allocation in real time during games; "independently
  adjustable during play" already delivers that, and the settled decision
  that game-scoped bot parameters are adjustable by *any* current member
  (the captain gate's axis being durability, not breadth —
  `bot-configuration/any-member-live-editing#game-scoped-parameters-need-no-captain`)
  satisfies it, the captain being a member. Nothing is narrowed, and no
  contradiction with that decision was found anywhere in this capability.
