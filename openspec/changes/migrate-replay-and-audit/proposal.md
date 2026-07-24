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
change's name. Declared dependencies: **game-engine,
identity-and-authorization, game-lifecycle, live-game-observation,
operator-control, turn-pacing, decision-transparency** — the full DAG
ceiling for this capability, and every one genuinely cited: the engine
owns event vocabulary, determinism, movement fallback, and scoring; the
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
  the team action log (fields, categories, move-staging exclusion);
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
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-replay-and-audit/specs/replay-and-audit/spec.md`
  (folded to `openspec/specs/replay-and-audit/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `replay-and-audit`
  (at archive).
- Cross-change citations: this delta cites open siblings
  `identity-and-authorization/roster-snapshot-binding`;
  `game-lifecycle/finish-notification`, `teardown-after-persistence`,
  `game-record`; `live-game-observation/observation-use-cases`,
  `invisibility-filtering`, `scoreboard-sole-aggregate-authority`,
  `spectator-live-experience`, `team-private-live-state`;
  `operator-control/staged-move-log`, `exclusive-selection`,
  `captain-boot`; `turn-pacing/turn-declaration`, `operator-tempo`;
  `decision-transparency/computed-display-state`,
  `hosting-server-sole-writer`, `worst-case-preview`,
  `decision-breakdown` — resolved by the open-change overlay while the
  train is open, and by archive order (this change archives after all its
  dependencies) at fold time.
- Code citations: record schema and resolve/export paths, the persistence
  mutation, the action-log writers, and the replay viewer gain
  `// spec: replay-and-audit/...` citations when implementation lands.

## Open Questions

None. The candidate ambiguities were pre-resolved by binding sources and
are recorded in design.md: the connect-time attribution model, null
stagedBy, hazard-damage dedup, derived canonical order, unbounded
retention, seed export, transactional log pairing, the move-staging
exclusion, terminal selection clearing, public finished-game readability,
and concurrent inspection were each settled by resolved legacy review
items; the two-log model, the dead operator-mode bullet, the 04-REQ-052
split, the 08-REQ-013/076/077 demotions, and the participants-only
team-perspective were directed by the author-resolved decisions binding
this change.
