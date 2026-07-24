## Context

Migration change minting `replay-and-audit` from legacy modules 02–08 (72
requirement ids, 3 note-only mechanism ids, 12 review items) — the final
train's widest aggregator — per the author-approved capability map,
dependency DAG (all seven permitted dependencies are cited), and
assignment matrix. Legacy text is binding source material; the module-02
parked ledger's drafted text for 02-REQ-013/014/065 was the starting point
for the record-sufficiency and public-readability requirements. This file
records the decisions a future reader cannot recover from the specs alone.

## Decisions

### The two-log model, authored as two records plus one guarantee

The platform deliberately keeps **two** append-only histories of a game:
the game instance's turn-keyed game log (board truth, replay-sufficient,
exported once at game end) and the platform's team action log (sub-turn
team-experience events, written transactionally with the mutations they
describe). Legacy text stated this across four modules; here it is three
requirements — `turn-keyed-game-record` / `replay-sufficiency` for the
game log, `team-action-log` for the action log — tied together by
`experience-reconstruction`: replay + log reconstruct the full team
experience at any timestamp, while the action log is never a source of
authoritative game state. Staged moves live in exactly one of the two
(the game instance's log, per the resolved legacy review): the
authoritative act and its record are the same transaction there, whereas
a Convex-side copy could fail independently and lie. What breaks if
reversed: merging the logs forces either per-turn posting of game state
off the instance (breaking instance hermeticity and the once-at-end
export) or team-experience writes into the game runtime (breaking the
team-granularity boundary); duplicating staged moves into the action log
reintroduces the exact divergence the review resolution eliminated —
a log claiming a move that was never authoritatively staged.

### The dead operator-mode bullet is not carried

Legacy 06-REQ-035 enumerated "the current operator mode (Centaur or
Automatic)" among reconstructible state. That model was dissolved by the
tempo resolutions (per-operator tempo is the model; the sibling
turn-pacing change owns it). `experience-reconstruction` therefore lists
the active-operator set and each operator's tempo instead. Reversed —
carrying the bullet verbatim — the minted spec would mandate
reconstructing state the platform no longer has, and the first
implementer would either invent a team-level mode or silently drop the
clause; both are drift.

### Attribution is resolved once, at the connection boundary

The legacy corpus's longest-argued cluster (03-REVIEW-005 superseded by
04-REVIEW-011): the connection identity is resolved to an agent value at
admission, stored per admitted connection, carried untouched through
staging, resolution, export, and persistence — never interpreted by the
runtime, never re-derived at serialization, never expressed as a raw
connection identifier in persisted data. Authored as
`connect-time-attribution` + `agent-form-persistence`, with
`staged-move-attribution` carrying the per-entry permanence and the
null-means-fallback rule (04-REVIEW-002: nullable attribution, no
sentinel value, no split event kind). Disconnect semantics are the
constraint-mined half: entries are never mutated or deleted on
disconnect, and a reconnect appends a fresh entry. What breaks if
reversed: resolving at export time requires the instance to keep raw
connection identities resolvable for the whole game (the exact fragility
the supersession removed — a turn-10 identity may belong to a connection
replaced by minute four); deleting entries on disconnect orphans every
historical attribution that flowed through the dead connection; a
sentinel "fallback agent" would leak a magic value into a field the
runtime is forbidden to interpret.

### Canonical event order is derived, never stored (constraint-mined)

A turn's events are a set; the deterministic order consumers need is
derived from event data (type class, then subject id) and must never be
materialised as a stored sequence column. This is precisely an invariant
a future implementer could silently violate — adding an "order" column is
the obvious convenience — after which the stored index and the derivation
rule can disagree, bit-exact record comparison breaks, and delivery
order starts looking load-bearing again (the posture live-game-observation
already pins for the live channel). Minted as
`canonical-event-order#derived-not-stored`.

### The export is single, privileged, unfiltered, and seeded

Four legacy ids collapse into `once-at-end-export`: nothing leaves the
instance during play; the record crosses the boundary once, bundled into
the terminal notification (game-lifecycle owns the notification
mechanics); only the platform's distinct privilege can retrieve it; the
visibility filter is bypassed for it. Two review-resolved edges ride
along: the per-game seed is hidden from every game client while the game
runs but included in the export (04-REVIEW-013 — otherwise determinism is
unverifiable downstream), and an error outcome exports no replay data and
no scores (constraint-mined from the legacy notification design: a failed
game must not masquerade as a playable replay). What breaks if reversed:
per-turn posting reintroduces a live external dependency the hermetic
instance design forbids; a filtered export bakes one team's perspective
into the permanent record and makes every other perspective
unreconstructable forever; a secret-forever seed makes
`replay-sufficiency#bit-identical-reproduction` untestable.

### Retention is unbounded, and permanence changes owner at teardown

04-REVIEW-007 resolved in-instance retention as unbounded for the
instance's life (`turn-keyed-game-record#unbounded-retention`): the
persistence contract reads the complete record in one pass at game end,
so any instance-side eviction breaks it. After persistence, permanence is
the platform's: `replay-persistence` pins persist-before-teardown,
not-before-terminal-signal, and that the replay *and* the game-scoped
team records (action log, snapshots) outlive the instance for the game
record's life. Reversed, a retention cap silently truncates early turns
from every replay of a long game, and teardown that cascades into
team-experience data deletes the audit trail the game record exists to
anchor.

### Public readability, with the perspective bound as fidelity not secrecy

08-REVIEW-003's resolution is carried whole: once finished, a game's full
record — including both teams' within-turn operational data — is readable
by every authenticated user; the history listing scopes discovery only,
and a direct link grants any finished replay. Live games are excluded
from the replay surface entirely (the live boundary belongs to
live-game-observation). The team-perspective mode stays participants-only
(08-REQ-069/071a) — an interface-scoping rule, not a data-access rule —
and `replay-visibility-bound` pins that the team perspective replays
exactly what the team could see at the time, with the deliberate contrast
scenario that board-level mode shows the whole truth. What breaks if
reversed: gating finished-game data reintroduces the cross-module
privacy machinery the author deliberately eliminated; dropping the
perspective bound makes "team-perspective" a lie (it would replay a view
the team never had, and incidentally normalise rendering opponents'
invisible-at-the-time snakes inside an experience-fidelity mode);
dropping the participants-only scoping erases a deliberate product
boundary the author reconfirmed for this change.

### Timeline semantics kept; exact speeds and key bindings demoted

The unified timeline's load-bearing behaviour is authored: one control
for both modes; Per-Turn snapping to end-of-turn states (what the team
saw while declaring); Timeline mode on the real wall-clock axis with
markers at actual declaration times and proportional spacing; per-mode
speed units; client-local mode/speed; keyboard scrubbing matching the
mode's granularity. The legacy-pinned literal speed sets ({0.25…8}
turns/s and ×) and the exact key/modifier table (08-REQ-072b–d) are
mechanism at this grain and stay in code, with this section as the
citable record that they were deliberate choices (08-REVIEW-010 lineage),
not accidents. Reversed — pinning the literals — every UX tuning of a
speed step becomes a spec revision; dropping the *semantics* instead
(snap-to-boundary, real-time axis) would let an implementer flatten the
two modes into one scrubber and lose the "what the team actually saw /
when it actually happened" distinction both modes exist to preserve.

### Inspection is client-local; concurrent auditors share nothing

08-REVIEW-008's resolution: replay inspection is a distinct, purely
client-local affordance (at most one inspected snake per client, no
writes, no shadows, no displacement), never the exclusive-lock selection
mechanic — whose semantics would be actively wrong for replay, where two
viewers inspecting the same snake must not displace each other.
`replay-inspection#concurrent-inspectors-never-conflict` pins the
no-shared-state property. Reversed — reusing the selection record — the
first two simultaneous auditors of a popular game would fight over a
lock that means nothing, and replay viewing would write state into a
finished game's records, violating append-only history.

### Mechanism demotions: 08-REQ-013, 08-REQ-076, 08-REQ-077

- **08-REQ-013** (replay viewer reached from the history page or direct
  link, not a top-level nav target): navigation topology is mechanism.
  Its behavioural residue — listings open the viewer, direct links reach
  it — is authored in `team-game-history` and
  `finished-games-public#direct-link-grants-any-finished-replay`.
- **08-REQ-076** (the data-source abstraction, live vs replay bindings):
  the abstraction is code architecture; its fork-stability contract was
  authored by team-server-management. What is behaviour — the replay
  binding exposing no mutation surface — is minted here as
  `replay-binding-mutation-free`.
- **08-REQ-077** (components need not distinguish live from replay;
  read-only enforced at the source, not per component): the
  per-component-uniformity half is mechanism (it prescribes *where in
  the code* the property lives); its observable core — read-only-ness
  comes from the binding offering no writes, never from per-component
  branches — is the `#read-only-is-not-per-component` scenario.

What breaks if the demotions are reversed: three requirements would pin a
specific client architecture (routing tables, an abstraction layer's
shape) that any fork may legitimately restructure, while the properties
that actually protect the record — no mutation path from replay — are
already held structurally by `replay-binding-mutation-free`.

## Constraint-mining (mandatory final step)

The leads routed to this change, each now a requirement or scenario:

- **Attribution records never deleted or mutated on disconnect; reconnect
  appends fresh** → `connect-time-attribution#disconnect-erases-nothing`,
  `#reconnect-appends-fresh`.
- **`weight_changed` carries full before/after values** →
  `team-action-log#weight-change-carries-before-and-after` (an entry is
  self-sufficient evidence of its transition; deltas would make
  reconstruction depend on a complete, gapless fold).
- **Canonical event order fully derived from event data, never stored** →
  `canonical-event-order#derived-not-stored`.
- **Replay data null for error outcomes; error outcomes carry no
  scores** → `once-at-end-export#error-outcome-exports-nothing`
  (with game-lifecycle/finish-notification owning the no-scores half of
  the terminal handling).
- **Replay/coach data-source bindings structurally mutation-free —
  type-level absence, not a runtime guard** →
  `replay-binding-mutation-free#absence-not-guard` (the coach-side
  binding was authored by live-game-observation; the replay binding is
  this capability's).
- **Tempo/boot/submit events' log half** →
  `team-action-log#tempo-and-boot-are-clock-anchored` (time-based, not
  turn-keyed, so the active-operator set is reconstructible at any
  wall-clock moment).
- **Transactional log pairing (06-REQ-037)** →
  `actors-write-own-entries#dropped-entry-means-no-mutation`.

Swept once more over this change's own decisions: the derived-order,
absence-not-guard, unbounded-retention, and single-stamp
(`append-only-history#the-single-stamp`) invariants are the ones whose
quality depends on future implementers not "improving" them; each carries
a scenario above. No further unminted invariants found.
