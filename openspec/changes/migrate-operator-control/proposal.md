## Why

Ninth change of the final spec-migration train. The "operating a snake"
story — exclusive selection, manual steering, staged moves, displacement,
the Captain's boot — is today scattered across five legacy modules along
runtime seams: module 02 states the staging semantics and the client
connection topology, module 03 the in-game staging authorization, module 04
the runtime's staged-move log, module 06 the selection/manual-mode
coordination state, module 08 the live operator interface. Worse, the
staged-move model is stated twice in contradiction (consumed-and-cleared
versus append-only-forever). Re-authoring it as one capability puts the
whole operator workflow in one readable place, resolves the contradiction
the way the author decided, and retires 34 legacy ids.

## Carving decision

Mint **`operator-control`** exactly as drawn in the capability map and
assignment matrix (author-approved capability set and DAG). The legacy
requirements and review items this change absorbs are recorded in the
identifier map under this change's name. (03-REQ-030, listed
beside 03-REQ-028 in the legacy authorization section, went to
global-invariants and is not touched here.) Declared dependencies:
**game-engine, game-lifecycle, global-invariants,
identity-and-authorization, live-game-observation** — the set this
capability's requirements actually
need, extended if a further citation is ever warranted. The
cross-cutting invariants this workflow's soundness rests on (team-granular
authorization, transactional guards, the Centaur/instance state boundary)
are global-invariants'. The engine owns movement's direction
precedence, the fallback rule, and the chess timer; the lifecycle
capability owns the game's status machine and the per-game instance
bracket that this capability's interface availability, end-of-game
selection clearing, and log retention are all written against; the
identity capability
owns who is admitted on what terms and the team-granular privilege rule;
the observation capability owns the filtered read surface the operator's
board renders and through which staged-move reads are delivered.

**Author-resolved model decisions binding this change:**

- **Staged moves are an append-only per-turn log**, retained for the game's
  lifetime, never cleared, with no cancel operation; the effective move for
  a snake is the latest entry for the current turn; prior-turn entries
  never carry over (the engine fallback applies instead); last-write-wins
  is *effective-move* semantics over the log, not destructive overwrite.
  This supersedes the consumed-and-cleared legacy wording; the two legacy
  staging ids from the platform-architecture module retire onto the new
  requirements, the cleared-at-resolution one with a supersession note.
- **The staged-move read policy** (own-team staged history readable in full
  — every superseded entry, all turns — cross-team never) was resolved for
  this change and authored here, and has since moved to the observation
  capability, which owns what an admitted connection may read; see the Open
  Questions decision below.
- **The boot half only** of the legacy boot requirement is authored here
  (forced disconnect, no sticky lockout, reconnect rejoins); the
  active-set/quorum/tempo consequences belong to turn-pacing.

Deliberate boundaries: turn pacing (tempo toggles, declaration quorum,
Captain turn-submit, header clock display) belongs to the pacing story;
decision-score labelling of direction buttons, candidate-cell colouring,
and the worst-case preview belong to the decision-transparency story (the
move-interface requirement here owns the staging affordance semantics those
displays decorate); automated-play decision logic and compute scheduling
belong to the bot story (authored here only as "the team's automated
player", which the bot capability will cite); client-local inspection
(coach mode, replay) belongs to the observation and replay stories —
selection here is the exclusive *lock*, a Convex concern; interface hosting
mechanics belong to team-server-management (the nominated-host scenario
here states only the behavioural topology: served by the team's host,
gameplay traffic direct). UI-mirror ids fold in as scenarios of the
requirement whose behaviour they mirrored.

## What Changes

- **New capability `operator-control`** (mint delta, ADDED-only, 9
  requirements): the operator's dual direct-connection topology
  (transport-neutral per the resolved legacy review); the exclusive
  selection lock (one operator per
  snake, one snake per operator, null-holder exemption, server-side
  enforcement, cleared at game end); atomic displacement and auto-release;
  selection as view-only; manual mode (default automatic, holder-only
  entry/exit, staging auto-sets manual with the ordering-race invariant,
  automation never touches manual snakes); live-interface availability
  bracketed by playing→finished; the board and move interface (live
  staged-move markers, lethal-discouraged-not-blocked, no commit step);
  deterministic per-operator identity colours and client-measured latency;
  and the Captain's stateless boot.
- **The staged-move contradiction resolved**: the append-only model is
  authored as the single truth; the superseded clear-on-resolve wording
  retires onto it with a note recording the supersession.
- **The manual-mode/staging ordering race closed by a minted invariant**:
  automated staging never supersedes an operator's current-turn move; the
  manual transition is ordered before or atomic with the operator's
  staging act.
- **Dedupe clusters authored once**: selection exclusivity (three legacy
  statements, one requirement), the staged-move model (per the author's
  decision), team-scoped staging (authorization + runtime acceptance).
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-operator-control/specs/operator-control/spec.md`
  (folded to `openspec/specs/operator-control/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `operator-control`
  (at archive).
- Cross-change citations: this delta cites
  `identity-and-authorization/role-bound-privileges`,
  `live-game-observation/filtered-views-are-the-only-surface` /
  `ui-honours-the-filter`, and
  `game-lifecycle/status-authority` / `instance-per-game` from open
  sibling changes; the reference lint
  resolves them via the open-change overlay, and the train's archive order
  (identity-and-authorization, live-game-observation and **game-lifecycle**
  before this change) keeps them resolving at fold time. The newly
  declared lifecycle dependency tightens that order — game-lifecycle now
  has to fold before operator-control, which in turn still gates
  bot-framework, turn-pacing, decision-transparency and replay-and-audit.
- Downstream train changes cite this capability: bot-framework (manual-mode
  exclusion, the automated player named here), turn-pacing (boot's
  active-set seam, declaration timing over the staged-move log),
  decision-transparency (selection drives display), replay-and-audit
  (staged-move attribution entries, selection history reconstruction).
- Code citations: the staging reducer and staged-move views, the selection
  and manual-mode mutations, the live-interface routes, board renderer,
  presence/colour assignment, and the boot mutation gain
  `// spec: operator-control/...` citations when the implementation lands.

## Open Questions

The three candidate ambiguities present at authoring were all resolved by
the author before authoring and are recorded in design.md: the staged-move
model
(append-only log supersedes clear-on-resolve), the staged-move read policy
(own-team full history, cross-team never — since rehomed in the observation
capability, per the first decision below), and the
manual-mode/staging ordering race (closed by the minted
never-overwrite-the-operator invariant rather than left as a client
convention). The transport question was already settled by the resolved
legacy review (transport is mechanism; the direct-connection topology is
the behavioural requirement).

Three gaps found in review of the drafted delta are now closed.

- **Decision — the staged-move privacy rule moves to
  `live-game-observation`.** It is a read rule: it governs what a
  connection may *see* of another team's staging, not what any transaction
  commits or what any operator does. The runtime carve took the staged-move
  log itself out of this capability, leaving this requirement describing the
  privacy of state its own capability no longer owns, and stranded from the
  filtered-view rules that enforce every other read boundary — a reader
  asking "what may a connection see" had to know to look in the operator
  story to find one of the answers. It is removed here and authored in the
  observation capability alongside its natural sibling, the filtered-views
  rule it already declared, with both scenario slugs preserved. Nothing here
  cited it, so no dependency is left dangling; the delta keeps
  `live-game-observation` in its declared list for the board's filtered
  render surface, and `game-runtime` for the log the staging affordance and
  manual mode are written against. This capability's Purpose now says
  explicitly that which staged moves a connection may read is the
  observation story's. Rationale and the "what breaks if reversed" note are
  in the observation change's design.md.

- **Decision — `game-lifecycle` is a declared dependency.** This
  capability is written throughout against the playing/finished status
  machine — the live interface exists exactly while the game is playing
  and turns terminal at finish, selection is cleared at game end, and the
  staged-move log is retained "for the game's lifetime" — yet the Purpose
  declared no lifecycle dependency, leaving three requirements' soundness
  resting on an undeclared capability. It is now declared, and cited at
  the three requirements that rest on it. Verified acyclic: game-lifecycle
  reaches only game-engine, game-configuration, global-invariants,
  identity-and-authorization, team-server-management and their
  transitive closure, none of which reaches operator-control.
- **Decision — "picked" is sharpened to mean "staged".** The decision
  displays are specified against a *picked* direction and against an
  *examined* one, and the two were being read as the same control — which
  would make idly comparing directions a sequence of real staged moves.
  This capability's half of the fix: `board-and-move-interface` now states
  that every pick on the staging affordance is a staging act, that the
  affordance offers no non-committal way to nominate a direction, and that
  no other surface's direction selection reaches the game
  (`#no-second-direction-selector`). The client-local examined selection
  itself is authored in the transparency capability, which is where the
  displays that consume it live.
