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

### Staged-move privacy: own-team full history, cross-team never

The legacy runtime module's blanket "block staged-move reads" was
contradicted by its own Design, which grants each team its own staged-move
history view; the author resolved own-team-only, and this change owns that
half of the split id (the invisibility half went to the observation story,
the attribution-metadata half to identity). Authored as
`staged-move-privacy`: complete own-team history — superseded entries
included — through the server-filtered read surface
(live-game-observation/filtered-views-are-the-only-surface); no cross-team
read, ever, including historically (`#cross-team-never-even-after-
resolution` — other teams learn committed movement outcomes, not staging
intent or changes of mind). What breaks if reversed: open cross-team reads
leak plans before resolution (staged moves are the most sensitive data in
the instance); a total block starves the team's own interface of the
staged-move markers and the replay story of sub-turn fidelity.

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

## Constraint-mining (mandatory final step)

- **Minted: the ordering-race invariant** — automation never supersedes an
  operator's current-turn move; manual entry ordered before/atomic with
  staging (`manual-mode`, `#staging-enters-manual-without-a-gap`).
- **Minted: current-turn scoping of the effective move**
  (`staged-move-log#nothing-carries-over`).
- **Minted: single home of staged moves**
  (`staged-move-log#single-home`).
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
- **Checked, owned by dependencies**: team-granular mutation privilege
  (identity-and-authorization/role-bound-privileges); staged-move reads
  through filtered views only
  (live-game-observation/filtered-views-are-the-only-surface); the board
  never inferring hidden state
  (live-game-observation/ui-honours-the-filter).
- **Checked, plastic (mechanism, doc-comment territory)**: the colour
  palette and hash, the presence library, the latency measurement method,
  click/Escape gesture bindings, the displacement confirmation dialog's
  form, and the OCC retry behaviour of the selection mutations — code
  citing this change's archive folder suffices when they land.
