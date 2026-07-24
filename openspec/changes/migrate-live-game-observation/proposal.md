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
identifier map under this change's name. Declared dependencies: **game-engine and
identity-and-authorization** (the DAG ceiling for this capability). The
engine owns invisibility's game semantics, the turn-resolution commit, the
chess timer, and scoring; the identity capability owns who obtains
admission and on what terms (spectator tokens, coach tokens, role-bound
privileges). This capability owns what an admitted connection may then
*see* and how it arrives.

Deliberate boundaries: acting in a game (selection, staging, own-team
staged-move reads) belongs to the operator story; turn pacing to its own
story; replay of finished games and record retention to the replay story;
coach *designation* to the team story; token issuance mechanics to the
identity dependency. Three ids are split or abstracted as directed by the
matrix: 04-REQ-052 (its invisibility/server-side-filtering half is authored
here; its staged-move read policy and attribution-metadata blocking are
other capabilities' substance), 06-REQ-032 (live read-scoping here; the
finished-game/replay half and team-configuration-access half live
elsewhere), and 05-REQ-067 (authored abstractly as "team-private live
state" so the requirement never cites bot-side vocabulary outside this
capability's dependency ceiling).

## What Changes

- **New capability `live-game-observation`** (mint delta, ADDED-only, 13
  requirements): real-time committed delivery with atomic turn updates,
  the supported observation use cases (live view, scrubbing, animation,
  mid-game catch-up), filtered views as the sole client read surface
  (constraint-mined), invisibility filtering with
  spectators-as-opponents-of-every-team intersection semantics, filter
  behaviour across time (boundary transitions, scrub-safety), historical
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
  `legacy-spec-archive/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-live-game-observation/specs/live-game-observation/spec.md`
  (folded to `openspec/specs/live-game-observation/spec.md` at archive).
- `openspec/config.yaml` context capability list gains
  `live-game-observation` (at archive).
- Cross-change citations: this delta cites
  `identity-and-authorization/spectator-tokens`, `coach-tokens`,
  `role-bound-privileges`, and `platform-admin-role` from the open
  `migrate-identity-and-authorization` change; the reference lint resolves
  them via the open-change overlay, and the train's archive order
  (identity-and-authorization before this change) keeps them resolving at
  fold time.
- Code citations: view definitions, scoreboard materialisation, the
  spectating and coach-mode UI, and the read-scoping checks gain
  `// spec: live-game-observation/...` citations when the implementation
  lands.

## Open Questions

None. The candidate ambiguities were all pre-resolved by binding sources
and are recorded in design.md: spectator intersection semantics, turn-0
publicity, the scoreboard's aggregate authority and as-if-ended score, the
no-delivery-order-guarantee posture, and the up-front history subscription
were each settled by resolved legacy review items; the spectator
eligibility gap is a *deliberate* deferral (kept as such, per the author's
direction), not an open question; and the splits of 04-REQ-052 and
06-REQ-032 and the abstract authoring of 05-REQ-067 were directed by the
author-approved assignment matrix.
