## Why

Fourteenth change of the final spec-migration train, and its widest
aggregator. The "reliving and auditing a finished game" story — record
sufficiency, once-at-end export, persistence, attribution, the team action
log, the unified viewer, public readability — is today scattered across
all seven remaining legacy modules along runtime seams: module 02 states
in-instance retention, the unified viewer, and finished-game readability;
module 03 the attribution model; module 04 the historical record, turn
events, and replay export; module 05 replay persistence; module 06 the
action log; module 07 the bot's logging obligations; module 08 the replay
viewer. Re-authoring it as one capability puts the platform's entire audit
trail in one readable place and retires 72 legacy requirement ids plus 12
review items (with 3 further ids retired note-only as mechanism).

## Carving decision

Mint **`replay-and-audit`** exactly as drawn in the author-approved
capability map and assignment matrix. The legacy requirements and review
items this change absorbs are recorded in the identifier map under this
change's name. Declared dependencies: **game-engine, global-invariants,
test-sequences, identity-and-authorization, game-lifecycle,
live-game-observation, operator-control, turn-pacing,
decision-transparency** — each declared
because the delta genuinely cites it, and the list stays extensible if a
later citation warrants another: the engine
owns event vocabulary, determinism, movement fallback, and scoring;
`test-sequences` the one canonical encoding of engine values, the
production-identical seed derivation, and the halt-at-first-divergence
replay-check the record's determinism claim is verified by;
global-invariants the cross-runtime rules this capability's guarantees rest
on — instance hermeticity and its single sanctioned egress, atomic turn
resolution, each store's in-transaction guard, identity resolution and
team-granular authorization, the live/finished privacy line for team-side
records, and the rule that no invariant is enforced by presentation; the
identity capability the roster snapshot attribution binds to; the
lifecycle story the finish notification, teardown ordering, and the
persistent game record; the live-observation story the visibility filter
the replay must honour, the scoreboard rows, and the live-surface
boundary; the operator story the staged-move log and selection clearing;
the pacing story turn declarations, tempo, and boots; the transparency
story the display-state slots the log records.

Deliberate boundaries and author-resolved directions honoured here:

- **The two-log model is load-bearing** and authored as distinct
  requirements: the game instance's **game log** (turn-keyed,
  replay-sufficient, exported once at game end) versus the platform's
  **action log** (sub-turn team-experience events, transactionally paired,
  immutable append-only), tied together by the reconstruction guarantee
  (`experience-reconstruction`: replay + log reconstruct the full team
  experience at any timestamp).
- The stale "operator mode" bullet in legacy 06-REQ-035 is dead and not
  carried — per-operator tempo is the model (turn-pacing).
- 04-REQ-052's attribution-metadata-blocking half was authored by
  identity-and-authorization; nothing of it is restated here.
- 08-REQ-013 (viewer routing), 08-REQ-076/077 (the data-source
  abstraction) are code mechanism and retire note-only; the fork-stability
  contract was authored by team-server-management. The **behavioural**
  property of the replay binding — structurally mutation-free, absence
  not guard — is this change's to own and is minted as
  `replay-binding-mutation-free` (08-REQ-078).
- Finished games are publicly readable (02-REQ-065, 08-REVIEW-003), with
  live games excluded from the replay surface entirely; team-perspective
  replay is participants-only while board-level is open to all
  authenticated users — an interface-scoping rule, not a data-readability
  narrowing.
- Team-perspective replay reveals nothing beyond the team's filtered view
  at the original time (live-game-observation cited), while board-level
  mode shows the whole truth of the finished game.

## What Changes

- **New capability `replay-and-audit`** (mint delta, ADDED-only, 22
  requirements): the turn-keyed in-instance game record and its contents;
  append-only history covering both logs; replay sufficiency with
  deterministic reproducibility; the closed, self-sufficient turn-event
  record; the derived canonical event order; connect-time agent
  attribution surviving disconnects; staged-move attribution with the
  null-fallback rule; agent-form-only persistence outliving membership;
  the once-at-end privileged unfiltered export (seed included, nothing
  for error outcomes); replay persistence and post-teardown permanence;
  the team action log (fields and categories — including operator arrivals
  and departures, with staged moves pointedly not among them);
  actors writing their own entries transactionally; the two-log
  experience-reconstruction guarantee; finished-games public readability
  with direct links; the per-team game-history listing; the unified
  viewer and its two modes; board-level and team-perspective replay; the
  replay visibility bound; the unified timeline (Per-Turn and Timeline
  scrub modes); client-local inspection; and the structurally
  mutation-free replay binding.
- **Dedupe clusters authored once**: append-only history (04-REQ-005/059/
  066 + 06-REQ-039), record sufficiency (02-REQ-013/014 + 04-REQ-012),
  connect-time attribution (03-REQ-044 + 04-REQ-020/021), the
  game-log-vs-action-log split (06-REVIEW-004 + 07-REQ-062).
- **Mechanism demotions** (rationale in design.md): 08-REQ-013, 076, 077
  note-only; exact playback-speed sets and keyboard bindings of
  08-REQ-072b–d compressed to per-mode scrub semantics.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-replay-and-audit/specs/replay-and-audit/spec.md`
  (folded to `openspec/specs/replay-and-audit/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `replay-and-audit`
  (at archive).
- The Purpose's `Depends on:` line gains `test-sequences`, so
  `openspec/capability-graph.md` must be regenerated (`pnpm spec:graph`) in
  the commit carrying that edit — the only already-folded capability this
  change depends on, and the one edge here that is not to an open sibling.
- Implementation precondition, not a spec change: the recorded-run codec,
  seed derivation, and replay-check move out of
  `apps/visual-tester/src/lib/test-sequences/` into a package the instance's
  record path can consume.
- Cross-change citations: this delta cites open siblings
  `identity-and-authorization/roster-snapshot-binding`;
  `game-lifecycle/finish-notification`, `teardown-after-persistence`,
  `game-record`; `live-game-observation/observation-use-cases`,
  `invisibility-filtering`, `scoreboard-sole-aggregate-authority`,
  `spectator-live-experience`, `team-private-live-state`;
  `game-runtime/staged-move-log`, `exclusive-selection`,
  `captain-boot`; `game-runtime/turn-declaration`, `operator-tempo`;
  `decision-transparency/computed-display-state`,
  `hosting-server-sole-writer`, `worst-case-preview`,
  `decision-breakdown` — resolved by the open-change overlay while the
  train is open, and by archive order (this change archives after all its
  dependencies) at fold time.
- Global-invariants citations: the delta's soundness dependencies on
  `global-invariants/game-instance-hermeticity`,
  `authoritative-turn-resolution`, `transactional-invariant-enforcement`,
  `state-confined-to-owning-runtime`, `one-shared-engine`,
  `authenticated-unambiguous-identity`, `team-granularity-authorization`,
  `one-contract-many-surfaces`, `centaur-state-boundary`,
  `team-private-centaur-state`, `access-follows-identity`, and
  `security-enforced-outside-the-library` — resolved against `specs/`
  overlaid with the open `extend-global-invariants` change.
- Code citations: record schema and resolve/export paths, the persistence
  mutation, the action-log writers, and the replay viewer gain
  `// spec: replay-and-audit/...` citations when implementation lands.

## Open Questions

None open. The candidate ambiguities were pre-resolved by binding sources and
are recorded in design.md: the connect-time attribution model, null
stagedBy, hazard-damage dedup, derived canonical order, unbounded
retention, seed export, transactional log pairing, the move-staging
exclusion, terminal selection clearing, public finished-game readability,
and concurrent inspection were each settled by resolved legacy review
items; the two-log model, the dead operator-mode bullet, the 04-REQ-052
split, the 08-REQ-013/076/077 demotions, and the participants-only
team-perspective were directed by the author-resolved decisions binding
this change. Five gaps found during review of this change's artifacts were
resolved by author direction and are recorded below (rationale and the
"what breaks if reversed" notes in design.md).

- **Decision — the active-operator set gains a producer.** No capability
  recorded operator disconnects: connects were inferable from the tempo
  write and the attribution entry, Captain boots are a logged category, but
  a plain network drop wrote nothing anywhere. A **connection-event
  category is added to `team-action-log`** (arrivals, and departures
  carrying their cause) rather than a new presence store, because the
  action log is already the reconstruction source, already clock-stamped
  below turn granularity, and already carries a category vocabulary.
  **Convex writes the departures**, not the game instance: the log is
  Centaur state and the instance may not egress before game end, while
  Convex already holds the operator's own coordination connection and can
  observe it end. That makes the departure the single exemption to
  `actors-write-own-entries` — the one entry its actor cannot write —
  and `experience-reconstruction` now says the active-operator set is
  folded from those entries.
- **Decision — reuse the recorded-run encoding; do not ship a second one.**
  `replay-and-audit` declares **`test-sequences`** in its Purpose and
  `replay-sufficiency` adopts its canonical encoding, production-identical
  seed derivation, and halt-at-first-divergence replay-check, which is
  exactly the harness `#bit-identical-reproduction` describes. The
  requirement no longer implies a record-local encoding; the legacy
  row-oriented shape with JSON-string bodies would have left two canonical
  encodings of the same engine values in one repo. Extracting the codec and
  replay-check out of `apps/visual-tester/src/lib/test-sequences/` into a
  shared package is implementation and sits in `tasks.md`, not in a
  requirement.
- **Decision — scoreboard rows are enumerated where they are consumed.**
  `board-level-replay` renders the recorded rows from the persisted replay
  alone, but they appeared in neither `turn-keyed-game-record`'s
  enumeration nor `once-at-end-export`'s list. Both now name them, and the
  producing requirement in the sibling `migrate-live-game-observation`
  change gains the matching durability obligation.
- **Decision — every turn gets a timeline marker.** `unified-timeline`
  marked turn boundaries "at their actual declaration times", but only
  explicit declarations are stamped and declaration is per team, not per
  turn. The marker is now the latest declaration timestamp the record holds
  for the turn when every team's declaration for it was stamped, and the
  turn's recorded resolution start otherwise — which the record already
  guarantees per turn — so Timeline mode is implementable for clock-expiry
  and snakeless turns. Recommended upstream follow-up (not this change's to
  make): have `turn-pacing` stamp every declaration kind, after which the
  fallback becomes unnecessary.
- **Decision — the inspection lens has one owner, and this capability
  depends on it.** `replay-inspection` restated the general primitive
  (purely client-local, writes nothing, no selection shadow, at most one per
  client) that `decision-transparency/examined-subject` now owns. The
  restatement is removed and the requirement declares that identifier —
  legitimate here because `decision-transparency` is already in this
  capability's Purpose — keeping only what replay adds: the subject is free
  of the game's history (a snake someone else held at the scrubbed moment is
  still inspectable) and the reconstructed shadows keep rendering beside it.
  Relatedly, team-perspective replay is confirmed to need no read of a
  team's live portfolio configuration, since the contributing heuristics'
  weights and labels travel inside the published snapshot — which is what
  keeps this mode clear of
  `global-invariants/team-private-centaur-state#finished-games-release-only-what-is-published`.
  Both are recorded in design.md with their "what breaks if reversed" notes.
