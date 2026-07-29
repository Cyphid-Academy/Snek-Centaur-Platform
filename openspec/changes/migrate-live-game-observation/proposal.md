## Why

Eighth change of the final spec-migration train. The "watching a live game"
story — real-time delivery, invisibility filtering, spectating, coach read
access, the scoreboard — is today scattered across six legacy modules along
runtime seams: module 02 states real-time sync and the filtering principle,
module 03 the spectator/coach admission terms, module 04 the delivery,
filtering, reconstruction, and scoreboard semantics, modules 05 and 06 the
coach role's read boundary, module 08 the spectating and coach-mode UI.
Re-authoring it as one capability puts the whole observation surface of a
running game in one readable place and retires 39 legacy ids.

## Carving decision

Mint **`live-game-observation`** exactly as drawn in the capability map and
assignment matrix (author-approved capability set and DAG). The legacy
requirements and review items this change absorbs are recorded in the
identifier map under this change's name. Declared dependencies:
**game-engine, game-runtime, global-invariants, and
identity-and-authorization**. The
engine owns invisibility's game semantics, the turn-resolution commit, the
chess timer, and scoring; the runtime capability owns the records these
surfaces read — the turn-keyed game record, the aggregate rows, and the
staged-move log; global-invariants owns the cross-cutting rules
this capability's soundness rests on (atomic turn resolution, enforcement
outside any client library, live game state confined to the game's own
instance, team-granular authorization, in-transaction invariant guards, a
team's Centaur state being team-private while the game is live, and client
truthfulness); the identity capability owns who obtains admission and on
what terms (spectator tokens, coach tokens, role-bound privileges). This
capability owns what an admitted connection may then *see* and how it
arrives.

Deliberate boundaries: acting in a game (selection, staging a move)
belongs to the operator story, while what any connection may *read* of a
staged move is authored here; turn pacing to its own
story; replay of finished games and record retention to the replay story;
coach *designation* to the team story; token issuance mechanics to the
identity dependency. Three ids are split or abstracted as directed by the
matrix: 04-REQ-052 (its invisibility/server-side-filtering half is authored
here, as — since the staged-move privacy rule moved in from the operator
story — is its staged-move read policy; only its attribution-metadata
blocking is another capability's substance), 06-REQ-032 (live read-scoping here; the
finished-game/replay half and team-configuration-access half live
elsewhere), and 05-REQ-067 (authored abstractly as "team-private live
state" so the requirement never reaches for bot-side vocabulary this
capability's declared dependencies do not include — the bot stories own that
vocabulary, so the fix is abstraction here, not a wider dependency list).

## What Changes

- **New capability `live-game-observation`** (mint delta, ADDED-only, 14
  requirements): real-time committed delivery with atomic turn updates,
  the supported observation use cases (live view, scrubbing, animation,
  mid-game catch-up), filtered views as the sole client read surface
  (constraint-mined), invisibility filtering with
  spectators-as-opponents-of-every-team intersection semantics, filter
  behaviour across time (boundary transitions, scrub-safety), staged-move
  privacy at team granularity (own-team history complete, cross-team never
  — moved in from the operator story), historical
  reconstruction without rule re-execution, the scoreboard as the sole
  aggregate authority (true alive set, zero-filled rows, as-if-ended
  normalised score, same-transaction write), the UI honouring the filter
  and never inferring hidden state, spectator access/experience/timeline,
  team-private live state with coach read parity, and the coach-mode
  read-only interface.
- **Dedupe clusters authored once**, scenarios carrying the constituent
  edge cases: invisibility filtering (spectator intersection, ally sees
  visible-false, history scrub cannot reveal, transitions at turn
  boundaries), atomic turn delivery (no partial state, snapshot and events
  together, no pre-commit delivery), real-time sync (no polling), and
  no-client-aggregation (scoreboard as sole channel).
- **Cross-cutting rules cited, never copied**: the requirements state their
  local content and cite `global-invariants` for the invariants their
  soundness rests on — atomic turn resolution under
  `real-time-committed-delivery`, enforcement-outside-the-client and
  Convex-holds-no-live-game under `filtered-views-are-the-only-surface`,
  team-granular binding under `invisibility-filtering`, in-transaction
  guards under `scoreboard-sole-aggregate-authority`, team-private Centaur
  state under `team-private-live-state`, and client truthfulness under
  `ui-honours-the-filter`. The generic halves those citations replace were
  removed from the delta rather than kept alongside them, with the
  integration reasoning in design.md.
- **UI-mirror requirements re-authored** as "the UI honours / never
  infers": the client-side halves of the filtering and scoreboard rules
  become honouring requirements and scenarios, never a second copy of the
  server-side enforcement.
- **Deliberate deferral recorded, not faked**: spectator eligibility
  policy (private games, visibility, rate limits) stays deliberately
  unspecified, encoded as the #eligibility-deliberately-open scenario
  rather than an invented requirement.
- **Transport neutrality**: the real-time guarantee is authored as
  behaviour (push on commit, no polling); the wire transport is mechanism
  and stays in code.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-live-game-observation/specs/live-game-observation/spec.md`
  (folded to `openspec/specs/live-game-observation/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `live-game-observation` (at archive).
- Cross-change citations: this delta cites
  `identity-and-authorization/spectator-tokens`, `coach-tokens`,
  `role-bound-privileges`, and `platform-admin-role` from the open
  `migrate-identity-and-authorization` change, and
  `global-invariants/state-confined-to-owning-runtime`,
  `transactional-invariant-enforcement`, `team-private-centaur-state`,
  `client-truthfulness`, and
  `team-granularity-authorization#spectators-hold-no-private-state` from the
  open `extend-global-invariants` change, and `game-runtime/staged-move-log`,
  `resolving-transaction`, `turn-keyed-game-record`, `canonical-event-order`
  and `per-turn-scoreboard` from the open `mint-game-runtime` change; the
  reference lint resolves them
  via the open-change overlay, and the train's archive order
  (extend-global-invariants, identity-and-authorization and game-runtime
  before this change) keeps them resolving at fold time.
- Code citations: view definitions, scoreboard materialisation, the
  spectating and coach-mode UI, and the read-scoping checks gain
  `// spec: live-game-observation/...` citations when the implementation
  lands.

## Open Questions

- **Decision — the staged-move privacy rule is authored here, moved in from
  `operator-control`.** It is a read rule over runtime state — what one
  team's connections may see of another team's staging — and every other
  read boundary of a running game is enforced by this capability's filtered
  views. It sat in the operator story only because it arrived with the
  staged-move log, and the runtime carve has since taken that log to
  `game-runtime`, leaving a privacy rule describing state its own capability
  no longer owned. It is now `staged-move-privacy`, sitting with the
  filtering cluster, declaring `game-runtime/staged-move-log` for the log
  whose contents it governs; the citation of this capability's own
  filtered-views rule that it carried as an import is dropped, because a
  requirement never declares a dependency inside its own capability and
  because that rule already covers every read here. Both scenario slugs are
  preserved unchanged. The Purpose now names the responsibility, and the
  operator capability's Purpose defers it explicitly. Rationale and the
  "what breaks if reversed" note are in design.md.
- **Decision — scoreboard rows are durable record rows, not a live-only
  channel.** `scoreboard-sole-aggregate-authority` is the rows' only
  producer, yet the sibling replay story must render "the rows recorded from
  the game's sole aggregate authority" from a persisted replay long after
  the instance is gone, and this requirement obliged nothing beyond
  publishing them for subscribers. The requirement now states that a
  published row is a durable per-turn fact of the game's own record rather
  than a projection assembled for a live subscription, with
  `#rows-outlive-the-live-audience` carrying the case; the replay capability
  correspondingly enumerates the rows among the game record's contents and
  among what the game-end export carries. The alternative — letting the
  replay recompute aggregates from persisted snapshots — was rejected as a
  second implementation of the scoring rule inside a viewer. Rationale and
  the "what breaks if reversed" note are in design.md.
- **Decision — coach mode keeps only its coach-specific inspection
  increment.** The general inspection primitive — a client-local,
  never-persisted examination lens, independent of who holds a snake, that
  stages nothing — is now owned by `decision-transparency/examined-subject`,
  and `coach-mode-interface` restated it. The restatement is removed; what
  the requirement keeps is coach-shaped: the read-only member interface, a
  coach's inspection rendering alongside the operators' real selection
  shadows rather than in place of them, and its gestural/visual
  distinctness from operator selection. No dependency is declared on the
  owning requirement, because this capability cannot depend on
  `decision-transparency` without closing the cycle
  `live-game-observation → decision-transparency → operator-control →
  live-game-observation`; the reuse is code-level and is pinned in tasks.md
  §6.8. Rationale and the "what breaks if reversed" note are in design.md.

Otherwise none. The candidate ambiguities were all pre-resolved by binding sources
and are recorded in design.md: spectator intersection semantics, turn-0
publicity, the scoreboard's aggregate authority and as-if-ended score, the
no-delivery-order-guarantee posture, and the up-front history subscription
were each settled by resolved legacy review items; the spectator
eligibility gap is a *deliberate* deferral (kept as such, per the author's
direction), not an open question; and the splits of 04-REQ-052 and
06-REQ-032 and the abstract authoring of 05-REQ-067 were directed by the
author-approved assignment matrix.
