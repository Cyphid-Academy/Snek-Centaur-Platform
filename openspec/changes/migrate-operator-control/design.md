## Context

Migration change minting `operator-control` from legacy modules 02, 03, 04,
06, 07, and 08 (34 ids, 3 review items), per the author-approved capability
map, dependency DAG (game-engine + identity-and-authorization +
live-game-observation), and assignment matrix. Legacy text is binding
source material; the module-02 parked ledger's staged-move entry carried an
explicit reconciliation flag that this change discharges. This file records
the decisions a future reader cannot recover from the specs alone.

## Decisions

### The staged-move log is append-only; last-write-wins is a read rule

The legacy corpus stated two models: the platform-architecture module said
staged moves are consumed and cleared in the resolving transaction; the
runtime module — later, and unambiguous — said the log is append-only,
retained for the game's lifetime, with the effective move being the latest
entry per snake and no cancel operation. The author resolved for the
append-only model, with last-write-wins as *effective-move semantics over
the log*, never destructive overwrite. Authored as `staged-move-log`; the
clear-on-resolve legacy id retires onto it with a supersession note in its
map entry. What breaks if reversed (clearing at resolution): sub-turn
replay fidelity dies — the recorded history of who staged what, when,
including changes of mind, is exactly what the replay story reconstructs
the team's experience from — and a cancel/clear operation would create the
one thing the model deliberately excludes, a way for staging history to
lie about what happened.

### The effective move is scoped to the current turn (constraint-mined)

An append-only multi-turn log makes "latest entry per snake" dangerously
ambiguous: read naively across turns, a direction staged in turn T would
silently become the snake's move in turn T+1, T+2, … — an old exploration
acting as a standing order, and the engine's fallback rule
(game-engine/movement: repeat `lastDirection`) unreachable in practice.
The legacy Design's resolution read is turn-scoped; nothing at requirement
level said so. Minted as the `#nothing-carries-over` scenario: prior-turn
entries never carry over; an unstaged snake falls to the engine fallback.
What breaks if violated: a snake whose operator stopped steering keeps
replaying its last *staged* order instead of its last *moved* direction —
observably different the moment the two diverge — and replay of the same
log produces different games depending on the reader's scoping choice.

### No final-submission barrier; the log has a single home

Two resolved legacy reviews are kept as authored posture. First: there is
no runtime-side coordination barrier for a pre-declaration burst of staged
moves — a "final submission" is an ordinary sequence of appends, and
resolution consumes whatever the log holds at the declaration instant
(`#accepted-until-declaration`). Reversed — a freeze window or barrier —
the runtime acquires a second clock coupled to team-side submission
strategy, and last-moment human overrides (the point of the centaur design)
get raced out by their own safety mechanism. Second: staged moves live
solely in the game's SpacetimeDB instance — operator clients stage directly
there, and every consumer (display, supersession, resolution, the team's
automated player) reads the same log (`#single-home`). Reversed — a
secondary staging store or server-brokered path — the effective move and
its record can diverge, and the attribution guarantee (each entry carries
its author) loses its single point of truth.

The single-home *absolute* is not this requirement's to assert, though, and
the delta no longer does: staged moves are live game-runtime state, so
`global-invariants/state-confined-to-owning-runtime` (explicitly, its
`#convex-never-mirrors-a-live-game` scenario, which names staged moves) already
forbids any Convex mirror or client-persisted copy, and
`global-invariants/centaur-state-boundary#bot-to-game-flow-never-routes-through-convex`
already forbids a Server-side buffer between bot compute and the instance.
The integration: `staged-move-log` states positively what the instance's log
*is* — append-only, per-turn, effective-move-by-latest-entry — and the
"nowhere else" half comes from those two invariants, which `#single-home`
cites rather than re-asserts. Relax either invariant and this capability's
attribution and replay-fidelity guarantees stop following from the log alone,
which is exactly why the citation is there.

### Staging is team-granular; selection is a Convex lock the runtime never sees

The game instance accepts staging from any admitted operator or bot
connection of the owning team, for any team snake, deciding solely from the
connection-level binding established at admission — it holds no notion of
selection. Selection (the exclusive lock, the manual flag) is Convex
coordination state. This split is deliberate and already pinned from the
cross-cutting side (the instance is never authoritative for the
operator↔snake mapping); what is authored here is each half's positive
behaviour: `team-scoped-staging` for the runtime, `exclusive-selection` /
`selection-transfer` / `selection-is-view-only` for the lock. What breaks
if reversed (the runtime enforcing selection): the instance would need
per-human identity and a subscription to Convex mid-game — violating its
isolation — and legitimate team plays die: a teammate could not stage a
rescue move for an absent holder's snake, and the automated player could
not stage for unselected snakes at all.

### Selection exclusivity, the null exemption, and atomic transfer

Three legacy statements of the same lock (one platform-level, two
subsystem-level) collapse into `exclusive-selection`. Two behaviours the
legacy Design carried are promoted to scenarios because implementers could
silently break them: the one-snake-per-operator guard exempts holderless
records (`#unheld-rows-are-nobodys` — naively counting null as an operator
makes "many snakes unselected" an invariant violation), and every release,
including the implicit auto-release of the caller's previous snake, is
observable as a deselection (`#previous-selection-auto-released` — silent
releases would make the activity record lie about who held what).
Displacement is explicit-request-only and atomic across all affected
records (`selection-transfer`). What breaks if reversed: without the
explicit displacement gate, selection becomes snatch-on-click and the
confirmation UX has nothing to stand on; without atomicity, readers
interleave states where two operators hold one snake — and every consumer
of selection (presence colours, control gating, the automated player's
attention) briefly acts on a violated invariant.

### The manual-mode/staging ordering race (constraint-mined, the mandatory one)

Manual mode lives in Convex; staging lives in the game's SpacetimeDB
instance; an operator's "pick a direction" gesture must touch both, and no
cross-runtime transaction exists. The legacy Design named the failure: if
the staged move lands while the manual flag has not, the snake is still
automatic and the team's automated player overwrites the operator's move —
the exact inversion of the centaur promise (the human's move loses to the
bot's). The legacy fix was a client convention ("call the Convex mutation
first"), which is precisely an invariant a future implementer could
silently violate by reordering two awaits. Minted as requirement text in
`manual-mode`: automated staging never supersedes a move an operator staged
in the current turn, and manual-mode entry is ordered before or atomic
with the operator's staging act (`#staging-enters-manual-without-a-gap`).
The requirement is minimally constraining: client-side ordering, a
server-side authorship check in the automated player, or both, all
satisfy it. What breaks if reversed: intermittent, race-timed loss of
human moves — the least debuggable and most trust-destroying defect this
platform could have.

### Staged-move privacy was resolved here and is authored elsewhere

The legacy runtime module's blanket "block staged-move reads" was
contradicted by its own Design, which grants each team its own staged-move
history view; the author resolved own-team-only — complete own-team
history, superseded entries included, no cross-team read ever, including
historically. That resolution stands and is unchanged; only its home moved.
The rule is a read rule, and the runtime carve took the staged-move log
itself out of this capability, so it is now authored in the observation
capability, which owns what an admitted connection may see and enforces
every other read boundary of a running game in the same filtered views.
Nothing here depends on it: this capability's interface reads staged moves
through that surface, exactly as it reads the board. The full rationale,
including the "what breaks if reversed" note, is in the observation
change's design.md; the decision is recorded in both changes' proposals.

### Boot is a stateless forced disconnect

The Captain's boot severs the operator's session connection exactly as a
network drop would and writes no persistent operator state: no lockout
flag, no cleared selection, no tempo write. Reconnection is always
permitted; the Captain boots again if needed. Authored as `captain-boot`
with `#boot-clears-nothing` (the booted holder's selection and manual flag
survive; teammates recover the snake by ordinary displacement). The
active-set/quorum consequences of leaving and rejoining are turn-pacing's
story and are deliberately not authored here. What breaks if reversed
(sticky lockout state): boot becomes a shadow roster mutation — a
persistent exclusion the roster-freeze rules never account for — needing
its own undo surface, cleanup at game end, and reconciliation with
reconnect semantics; as a pure disconnect it needs none of that.

### Interface behaviour authored as behaviour; decision displays left to their owner

The legacy UI module's operator-interface ids fold into three requirements
(`live-interface-availability`, `board-and-move-interface`,
`operator-presence-and-identity`) plus scenarios elsewhere, at intent
grain: what an operator can rely on, not pixel prescriptions. Three
boundary choices: (a) the stateMap score labels on direction buttons, the
candidate-cell colouring, and the worst-case preview are the
decision-transparency story's substance — the move-interface requirement
here owns the staging affordances those displays decorate, so the ids
carrying both halves retire here with split notes; (b) the
"no scheduling logic in the UI" id is authored as the
`#interface-adds-no-automation` scenario without bot vocabulary (the
automated player is named abstractly; the bot capability, which depends on
this one, will bind to it); (c) the exploration affordance is authored as
`#exploration-is-staging` plus `staging-is-unvalidated` —
lethal-discouraged-not-blocked — because "try a direction to see its
consequences" only works if staging never gatekeeps. What breaks if (a) is
reversed: this capability's spec cites downstream vocabulary, inverting
the approved DAG; if (c) is reversed: a well-meaning legality check at
staging kills both the exploration workflow and the engine's
no-steering-assistance stance.

### Deterministic operator colours (constraint-mined)

Operator identity on the board must read identically for every observer of
the same game: the colour is a pure function of (game, operator), stable
across clients, reloads, and reconnects (`#same-colour-on-every-client`).
The legacy Design fixed this with a deterministic hash into a screened
palette; the palette and hash are mechanism, the determinism is behaviour.
What breaks if reversed (per-session assignment): the same operator
renders differently on different clients, so teammates cannot talk about
"the blue operator", and replays recolour history. The latency indicator's
client-side measurement is likewise kept as behaviour (no server field to
support it) because it constrains the schema.

### Transport neutrality and the dual-connection topology

The resolved legacy review kept transport out of requirements; the
behavioural residue — an operator client holds two independently
authenticated direct connections (game instance for observe/stage, Convex
for coordination), with the team's nominated host serving the interface
but never brokering gameplay traffic — is authored as
`operator-dual-connection`. What breaks if reversed (server-brokered
gameplay): staging attribution collapses onto the server's identity,
the server becomes a live single point of failure for human moves, and the
identity story's per-connection admission model no longer describes
reality.

### The lifecycle bracket is a declared dependency, not an ambient fact

Three requirements here are written entirely against the game's status
machine and the per-game instance bracket, and the Purpose declared
neither. `live-interface-availability` *is* the playing→finished bracket
rendered as an interface — available from the moment the game is playing,
terminal the moment it finishes; `exclusive-selection#cleared-at-finish`
clears live coordination state at that same finish; and
`staged-move-log`'s "retained for the game's lifetime" is only true
because an instance's lifetime is bounded by its game's and extended by
the persistence gate on teardown. Each now cites the lifecycle
requirement it rests on — `game-lifecycle/status-authority` for
availability, `status-authority#no-backward-motion` for the clearing (a
`finished` game is never played again, which is exactly what makes
clearing safe rather than premature), `game-lifecycle/instance-per-game`
for retention — and `game-lifecycle` joins the Purpose's declared list.
Checked before declaring: game-lifecycle reaches only game-engine,
game-configuration, global-invariants, identity-and-authorization and
team-server-management transitively, none of which reaches
operator-control, so the edge is acyclic; its cost is archive order
(game-lifecycle folds before this change). What breaks if left
undeclared: the dependency graph stops being a soundness record exactly
where it is load-bearing — someone could relax the forward-only status
rule, or let an instance outlive or predecease its game, and nothing
would point at the three requirements here that quietly stop making
sense. Declaring it is also what makes the graph tell the truth about
fold order, which is otherwise discovered by a fold failure.

### One pick, one meaning: every pick on the staging affordance stages

The decision displays are specified against two different notions of
"current direction" — one the operator has *picked*, one being
*examined* — and this capability's vocabulary was ambiguous enough to let
a reader collapse them. `#exploration-is-staging` said "an operator tries
a direction to examine its consequences", which reads as a claim about
*any* act of examining, when the intended claim is narrower and stronger:
this affordance has no non-committal mode. The requirement now says so
directly — every pick on it is a staging act, it offers no inert or
preview-only nomination — and `#no-second-direction-selector` closes the
converse: a read-only lens over a direction elsewhere in the interface
carries none of this affordance's authority and can never become a move.
That leaves the transparency capability free to own a client-local
examined direction without this capability having to know it exists (it
sits downstream and cannot be named here). What breaks if reversed: if
examining and staging are one control, an auditor scrubbing a replay or a
coach comparing directions would be staging moves; if instead this
affordance ever grows a "just look" mode, `#exploration-is-staging`'s
warning to the operator becomes false and the game's most consequential
control acquires a state in which it silently does nothing.

### Enforcement locus and state placement: cited once, not per requirement

Two cross-cutting facts bear on nearly every requirement here, and the delta
deliberately states neither repeatedly.

*Enforcement locus.* The legacy text guarded each mutation with some form of
"rejected server-side, whatever the interface showed". That is
`global-invariants/security-enforced-outside-the-library` verbatim — it holds
for a hand-rolled client speaking the raw SpacetimeDB and Convex protocols,
and no requirement here can weaken or strengthen it. So the delta states *what*
is refused (staging for another team's snake, a second holder, a non-Captain's
boot) and drops the "server-side, regardless of the client" tails, citing the
invariant once, at `team-scoped-staging` — the requirement whose whole shape
depends on it, since staging is deliberately selection-blind and team-granular
and therefore has nothing but the reducer's admission-time binding standing
between a raw-protocol caller and another team's snake. `captain-boot` and
`exclusive-selection` instead cite the owner of the *authority* question,
`global-invariants/team-granularity-authorization#within-team-discipline-lives-in-convex`:
Captain-only boot and the selection lock are within-team coordination, which is
Convex's alone to arbitrate — which is also why the game instance can be
selection-blind without a hole opening.

*State placement.* Selection records and the manual-mode flag live in Convex's
Centaur subsystem because `global-invariants/centaur-state-boundary` makes it
the sole persistent home of per-game operator coordination state and bars the
game instance from reading it; their team-scoped readability is
`global-invariants/team-private-centaur-state`, not something this capability
grants. The same boundary is what makes the manual-mode ordering rule the
shape it is: with no transaction spanning the two runtimes, "ordered before,
or atomically with" is the strongest sound formulation available, and
`manual-mode` cites the boundary so a future reader sees the weak wording as
forced rather than sloppy. Relax the boundary — let one transaction span
Convex and the instance — and the right requirement would be a single atomic
commit instead.

## Constraint-mining (mandatory final step)

- **Minted: the ordering-race invariant** — automation never supersedes an
  operator's current-turn move; manual entry ordered before/atomic with
  staging (`manual-mode`, `#staging-enters-manual-without-a-gap`).
- **Minted: current-turn scoping of the effective move**
  (`staged-move-log#nothing-carries-over`).
- **Checked, owned by global-invariants: single home of staged moves** —
  `staged-move-log#single-home` now cites
  `global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game`
  (with `centaur-state-boundary` covering a Server-side buffer) instead of
  re-asserting the absolute locally.
- **Minted: null-holder exemption in the one-snake guard**
  (`exclusive-selection#unheld-rows-are-nobodys`).
- **Minted: auto-release observable as deselection**
  (`selection-transfer#previous-selection-auto-released`).
- **Minted: boot writes no persistent operator state**
  (`captain-boot`, `#no-sticky-lockout`, `#boot-clears-nothing`).
- **Minted: colour determinism in (game, operator)**
  (`operator-presence-and-identity#same-colour-on-every-client`).
- **Minted: selection cleared at game end**
  (`exclusive-selection#cleared-at-finish`) — live selection state never
  masquerades as historical record.
- **Minted: no second surface nominates a direction to the game**
  (`board-and-move-interface#no-second-direction-selector`) — the
  invariant that lets a client-local direction lens exist elsewhere in
  the interface without any risk of it reaching the instance; an
  implementer wiring a "preview this direction" control to the same
  staging call would violate it while every test still passed.
- **Checked, owned by game-lifecycle**: the playing/finished status
  machine and the per-game instance bracket — now declared, and cited at
  `live-interface-availability`, `exclusive-selection` and
  `staged-move-log` rather than assumed.
- **Checked, owned by dependencies**: team-granular mutation privilege
  (identity-and-authorization/role-bound-privileges); staged-move reads —
  both their team-privacy and their delivery through filtered views only
  (live-game-observation/staged-move-privacy,
  live-game-observation/filtered-views-are-the-only-surface); the board
  never inferring hidden state
  (live-game-observation/ui-honours-the-filter); server-side enforcement
  against a raw-protocol client and the Convex/instance state boundary
  (global-invariants — see the section above).
- **Checked, plastic (mechanism, doc-comment territory)**: the colour
  palette and hash, the presence library, the latency measurement method,
  click/Escape gesture bindings, the displacement confirmation dialog's
  form, and the OCC retry behaviour of the selection mutations — code
  citing this change's archive folder suffices when they land.
