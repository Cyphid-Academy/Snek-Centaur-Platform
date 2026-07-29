## Context

Migration change minting `game-lifecycle` from legacy modules 02, 03, 04,
05, and 06 (30 ids, 8 review items), per the author-approved capability
map, dependency DAG (game-engine, game-configuration,
identity-and-authorization, team-server-management), and assignment
matrix. Legacy module 05's game-record/orchestration sections and module
04's initialization/game-end sections are the core sources; the module-02
parked ledger's drafted "→ game-lifecycle" entries are source material.
Legacy text is binding, matrix intents are hints. This file records the
decisions a future reader cannot recover from the specs alone.

## Decisions

### Mint the capability rather than leave the lifecycle split by runtime

The alternative was to leave the record/status machine with a
Convex-platform capability, the initialization and end-boundary with a
runtime capability, and the bracket implicit. Reversed, the single thing
a user experiences — "we started a game, played it, it ended, the next
one appeared" — would have no readable home, and the bracket's paired
obligations (provision at launch / teardown after persistence; notify on
end / poll on silence) would live in different documents where their
pairing is exactly what makes them correct. The capability map's story
row and the matrix assignment were author-approved with the capability
set.

### `finished`, not `ended` (author-resolved)

The terminal status is authored as `finished`, matching the legacy status
set and the walkover language. The current code says `ended`; the
author's resolution for this train is that the code aligns to the spec
when the implementation work lands, recorded on the parked ledger and
carried here. Reversed — authoring `ended` — the walkover text and the
legacy transition vocabulary would need rewording against every binding
source that says `finished`, to preserve a code literal that is cheap to
rename.

### Forward-only status machine; abort is not a transition

Legacy module 05 permitted "the healthcheck-failure rollback" as an
exception to the closed transition set, and the abort path said the game
"returns to `not-started`". Both are re-expressed without any backward
motion: `playing` commits only when the whole orchestration succeeds, so
an aborted launch never left `not-started` and there is nothing to roll
back. This preserves every observable behaviour of the legacy text while
keeping the machine forward-only (the resolved walkover review's model:
three transitions, no reverse arrows). Reversed — a genuine
`playing → not-started` rollback — every consumer of the status would
need to tolerate un-finishing semantics, and "a finished game is
historical fact" would have an exception nobody wants.

### Walkover transitions here; walkover scoring elsewhere

The refusal-branching id gives the non-tournament abort and the
tournament forfeit/walkover/no-contest ladder. The lifecycle halves —
abort cleanly; proceed with the seated teams; go straight to `finished`
below the minimum — are authored here. The scores recorded (walkover
winner, forfeiter zeros, no-contest) are the competition format's, per
the author routing of forfeit scoring to the tournaments story. The
tournament arm is therefore phrased as an abstract override ("a
schedule-bound competition format MAY override both gates"), so this
capability never reaches for vocabulary outside its declared dependencies
— a list extended whenever a citation is genuinely warranted, but never
extended downstream. Reversed — scoring
authored here — game-lifecycle would cite scoring vocabulary owned by a
downstream capability, inverting the DAG; reversed the other way —
transitions authored in tournaments — the status machine's sole
authority would have a second author.

### Roster snapshot at initialization (legacy wording reconciled)

Legacy module 05 said the member snapshot is taken "at the moment the
game was created"; legacy module 03 — and the open
identity-and-authorization sibling that re-authored it — bind
authorization to "the roster snapshot taken when the game is
initialized". Creation-time capture cannot be right under the rest of the
binding corpus: rosters are editable until launch (the freeze starts at
`playing`), and the restricted-roster launch path requires the snapshot
to reflect invitation resolution, which happens during launch. This
change follows the initialization-time model the sibling already authored
(the train's human review covers both texts together). Reversed —
creation-time capture — admission would honour a stale roster and the
restricted-participant snapshot would be impossible to express.

### The snapshot captures members, not "members and their roles"

The legacy phrasing this requirement inherited had the snapshot capture each
seated team's "authorized members **and their roles**". There is no such
thing to capture. Per-member roles were removed corpus-wide with the
timekeeper elimination: `team-management/roster-of-operators` says
membership carries no role distinctions of any kind, every member is an
operator, and `team-management/team-record` makes captaincy structural
precisely so it is not a role on a membership record — the sibling change's
design already records that it deliberately declines to carry the same
stale "members with their roles" phrase forward from the legacy view text.
The one live distinction worth checking was coach vs operator, and it does
not rescue the phrase: a coach is not a member at all
(`team-management/coaches` stores designations on the team record, distinct
from the roster), coach eligibility is answered from the live designation
rather than from the snapshot, and what the snapshot binds is exactly what
`identity-and-authorization/roster-snapshot-binding` names — operator-token
eligibility and which team identities participate. So "and their roles" is
dropped as a fossil of a dead model, not narrowed. Reversed — carrying the
phrase — the snapshot's storage shape acquires a role column with no source
to populate it, and the dead role model has a place to respawn in the one
record that outlives every roster edit.

### Engagement is published downward, against the natural reading

`team-management/roster-freeze` must hold a team's roster frozen while the
team is playing. The natural reading is that team-management sources that
fact — it is the party that needs it — by declaring `game-lifecycle`. It
cannot: `team-management → game-lifecycle → team-server-management →
team-management` is a real cycle, and every edge in it is load-bearing.
game-lifecycle declares team-server-management for the game invitations and
the launch healthcheck gate; team-server-management declares team-management
for the captain's server nomination and the team record it hangs on. Neither
of those can be inverted without a worse distortion, so the *third* edge is
the one that gives.

The edge is therefore inverted: game-lifecycle **publishes** "this team is
competitively engaged right now" as a fact about the team
(`competitive-engagement`), and team-management consumes it as a freeze
source while declaring nothing. That is why `roster-freeze` reads "facts the
capabilities that run those engagements own — this capability consumes them
as freeze sources and resolves none of them itself": the consumer is
deliberately blind to games. It also composes with the other publisher of an
enclosing engagement, `tournaments/tournament-roster-freeze`, which anchors
its own longer hold to the tournament's state rather than to any game — two
publishers of freeze sources, one consumer, no edge pointing up.

Reversed — the natural direction, team-management reaching down to game
records — the declared graph closes a cycle, and to escape it every consumer
that needs the fact instead re-derives it from game status joined to
participation. "Engaged" then has as many definitions as it has consumers,
each free to disagree at the edges that matter most: whether a walkover
counted, whether a second concurrent game holds the freeze open, whether an
aborted launch ever engaged anyone. Publishing it makes those three answers
the same answer everywhere, and makes them this capability's to get right.

### The orchestration is authored as ordering, not steps

The legacy seven-step start sequence is mechanism-shaped; what future
implementers can silently break are its ordering constraints: freeze
before anything else reads config; starting state obtained before
provisioning (so generation failure provisions nothing); invitations
resolve before initialization (so the roster can be restricted and no
forfeited snake ever spawns); initialization before any connection;
`playing` only on full success. Those orderings are the requirement; the
step list, endpoint paths, payload field shapes, and management-API
mechanics stay in code. Reversed — steps in spec — every mechanical
re-plumbing (e.g. the resolved bundling change that collapsed
notification/retrieval/teardown into one handler) would be a spec edit.

### The callback credential is pre-signed, validated statelessly, never persisted

Two legacy design resolutions are load-bearing behaviour, not mechanism.
First, the platform pre-signs the callback credential at launch and the
instance only stores and presents it. The *reason* the instance cannot
sign is not restated in the requirement: signing material never leaves
Convex (global-invariants/credential-confinement#signing-keys-never-leave-convex)
and Convex is the sole issuer (identity-and-authorization/sole-credential-issuer),
so "stores and presents unchanged" is the only behaviour left for this
capability to state, and it states it with both owners cited. Second, the platform
validates the presented credential as a self-contained proof and never
persists it — there is no stored copy to compare, leak, or drift. Both
are authored into finish-notification because an implementer could
silently violate either (mint a signing key into the instance; add a
stored-token comparison "for safety") and the trust model would quietly
change. What stays mechanism: the credential's encoding, claim names,
algorithm, and lifetime.

### Lost notifications: the polling fallback is REQUIRED

The legacy design says delivery retries a bounded number of times and, if
all fail, "the notification is lost but Convex *can* detect stale games
via polling as a fallback". Authored as a MAY, this is a liveness hole: a
lost notification would leave a game `playing` forever, its instance
running unattended, its successor never created. The fallback is
therefore minted as required behaviour (#lost-notification-recovered) —
the notification is the fast path, not the only path to `finished`.
Reversed — fallback left optional — the lifecycle's terminal guarantee
would silently depend on HTTP delivery never failing four times.

The cost of the hole is worth spelling out, because it is what makes
recovery required rather than nice to have. A game wedged at `playing`
freezes everything downstream of its finish: its room can never start
another game (a successor is created only on finish), its configuration
stays frozen for "the remainder of the game's life" — which never ends —
its room cannot be archived while its current game is `playing`, a
tournament's round chaining stalls because it fires on `finished`, the
replay is lost the moment the abandoned instance is reaped, and the
instance itself keeps running unattended at cost and exposure. Every one
of those is a permanent consequence of one dropped HTTP request.

### A stale game is an elapsed-time judgement, and recovery is a hybrid probe

`#lost-notification-recovered` names an obligation without defining it, so
this change mints `stale-game-recovery` to define all three of its
undefined parts — the silence signal, what may be read, and what recovery
does (author-approved 2026-07-28; the options weighed are in proposal.md
Open Question 6).

**Detection is a scheduled sweep, because nothing else is available.**
Convex is the sole status authority and deliberately mirrors nothing live
(global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game),
so there is no subscription that could notice an instance going quiet. A
recurring sweep over records still marked `playing` is the only channel
the architecture leaves, and elapsed time is the only signal such a sweep
can read: the record's own `playing` timestamp against the clock, with no
notification arrived.

**The bound is generous by construction, not tuned.** A false positive is
the expensive direction — it error-finishes a game that was still being
played, losing its replay — so the threshold is set above the longest game
the configured clocks and turn limit can produce rather than above a
typical game. That is why `chess-timer` and `game-end-conditions` are
cited: the requirement's soundness rests on a game's wall-clock length
being bounded by its configured budgets, increments and turn limit. The
legacy corpus's only anchor is mechanism — the callback token expired at
two hours, described as "well in excess of the maximum expected game
duration" — so no literal is authored here; the bound's value and the
sweep's cadence stay plastic, and the requirement carries only the
property the value must have. Reversed — a bound tuned to typical
durations — a long, legitimately slow game gets reaped mid-play and its
replay destroyed by the very mechanism meant to protect against data
loss.

**The probe reads liveness and nothing else.** It answers one question:
does a live instance still stand behind this record? No turn log, no
staged moves, no board. That is what keeps recovery inside the
confinement invariant rather than smuggling a second channel past it.
Reversed — a probe that reads game state to decide whether the game
"looks finished" — Convex acquires exactly the live mirror the invariant
forbids, and it acquires it on the code path least likely to be reviewed
for that.

**Recovery branches on the probe.** Alive: retrieve the completed record
and run the ordinary terminal handling — persist, flip to `finished`,
tear down. This is not a new mirroring channel. The architecture already
permits the complete record to arrive exactly once, at the end; recovery
changes only who initiates that one arrival, because the side that should
have pushed it could not. Gone or unreachable: finish with an error
outcome — a disposition #error-outcome-still-finishes already permits —
and reclaim whatever of the instance remains. A third case is authored as
a no-op rather than a branch: a retrieval that yields no completed record
(a live instance whose game genuinely has not ended, under a
configuration that admits an unbounded game) leaves the status untouched
for a later sweep, so even a false positive costs nothing but a repeated
sweep. Reversed — one branch only — pull-always has no answer when the
instance is already gone and wedges those games forever, while
error-always throws away the record of every game whose instance is still
sitting there holding it.

**Both invariants are honoured, and the requirement says how.** The
persistence gate (#no-teardown-before-persistence) binds normally on the
alive branch: the order is pull, persist, then tear down, identical to
the pushed path, which is what #live-instance-yields-the-record pins. On
the dead branch the gate is *vacuous* rather than bypassed — there is no
retrievable record left for reclamation to destroy, so reclaiming loses
nothing the gate exists to protect — and #nothing-left-to-persist-when-the-instance-is-gone
states that outright, so a reader never has to wonder whether recovery
violates the gate or is quietly exempt from it. Against
#convex-never-mirrors-a-live-game, the retrieval is authored as narrowly
as the behaviour allows: once, at the end, on a record already stale, for
that record alone, and #probing-is-not-licence-to-watch-a-game exists
precisely so the pull cannot be read as licence to poll a healthy game's
state. Finally, both branches commit their transition under the same
guard the pushed path uses
(global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard),
so a notification that arrives late — mid-sweep — cannot finish a game
twice or tear an instance down under an in-flight persistence.

`finish-notification` is correspondingly trimmed rather than extended:
its opening "only from a notification" became "from a notification …
never from any observation of the game in progress", which keeps the
prohibition that mattered (nothing live advances a status) without
contradicting the recovery path it always implied, and its closing
sentence now hands off to recovery instead of half-defining it. The
split is deliberate: `finish-notification` is about the push, and
`stale-game-recovery` is about its absence, which is a different
behaviour with a different trigger, a different actor and a different
failure mode. Reversed — folding recovery into `finish-notification` —
one requirement carries a callback credential contract, a retry policy, a
scheduled sweep, a liveness probe and two recovery branches, which is
well past what an author can vet at a read.

### Teardown discipline: persistence-gated, prompt, Convex-only

Three obligations pair up across the runtime boundary and are authored as
one requirement: the instance stays available until the record's
persistence is confirmed (so nothing unread is ever destroyed), teardown
follows immediately once it is (so finished games do not leak running
instances — the legacy bundled-notification resolution), and only Convex
ever tears down (the instance has no self-teardown, so a confused
instance cannot destroy an unpersisted record). What the persisted record
must *contain* is replay-and-audit's; the bracket is ours. Reversed on
any leg: data loss (early teardown), cost leak (late teardown), or an
instance that can destroy evidence of its own game (self-teardown).

### Successor auto-creation is atomic with currency

The legacy design makes successor creation a single mutation that also
repoints the finished game's setting at the new record. That atomicity is
behaviour, not mechanism: without it there is an observable window with
no current game (or, under concurrent finish handling, two successors).
It is authored abstractly ("its installation as the current game in the
finished game's setting") because the venue vocabulary belongs to a
downstream capability. The cleared ready flags of the legacy text are
that downstream story's to author; the cleared preview lock is cited from
game-configuration. Reversed — creation and currency as separate steps —
every reader of "the current game" would need to handle the gap this
atomicity exists to prevent.

### The warm-up is the provisioning host's, and best-effort by construction

The warm-up signal is the SpacetimeDB *host's* contract (distinct from
any Snek Centaur Server warm-up, per the author note): suspended → ready
within ten seconds, provisioning nothing, mutating nothing, under a
deliberately light check because resuming the host is its only effect.
The ten-second budget and the light-auth allowance are cross-boundary
contract (the host implementer and the platform must agree on both), so
they stay in the requirement; the dispatch is best-effort and decoupled
because game-record creation must never fail on an optimization. The
hosting target and scale-to-zero mechanics stay in code. Reversed —
warm-up required, or full management auth demanded — record creation
would couple to host availability, or the management credential would be
spent on a call whose worst abuse is resuming a host.

### 06-REQ-042 re-authored generically

"Fresh games start with zero game-scoped state" is authored without
enumerating the downstream Centaur-state concepts the legacy text lists
(portfolios, selections, display state, action log), per the author
decision — the enumeration would forward-reference capabilities this one
may not cite, and any new per-game state kind would need this text
edited. The generic form ("no per-game platform state of any kind exists
before launch orchestration creates it") covers the enumeration and its
future extensions. The initialization-order detail in legacy module 06's
design (before vs after the `playing` transition) is mechanism and stays
in code.

### How the lifecycle integrates with the global invariants

The requirements cite `global-invariants` where their soundness depends on
an invariant staying true; this is where the *integration* is pinned, so
the requirements need not restate any of it.

- **Which runtime holds what.** The record, the status machine and the
  roster snapshot are Convex's because everything outliving one game lives
  in the single deployment (global-invariants/single-convex-deployment) and
  no behaviour is split across runtimes
  (global-invariants/runtime-ownership) — that is what "sole authority" and
  "exclusively Convex's act" mean here, and neither claim would survive
  relaxing those invariants. The instance holds only its own game
  (global-invariants/state-confined-to-owning-runtime), which is why the
  roster must be *seeded* into it rather than looked up
  (global-invariants/game-instance-hermeticity), and why the snapshot's
  member detail stays Convex-side to be consulted there
  (global-invariants/team-granularity-authorization). The engagement fact
  is Convex's on the same grounds — it spans a team's records and its
  games' records, which is one transaction only because they share one
  deployment
  (global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction),
  and a consumer freezing on it needs the read inside its own write's
  transaction
  (global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard);
  a published fact a consumer can only read *before* its write is not a
  freeze, it is a race.
- **Why the terminal notification is push-only.** The delta no longer says
  "Convex holds no live gameplay subscription": that is
  global-invariants/state-confined-to-owning-runtime#convex-never-mirrors-a-live-game
  plus global-invariants/game-instance-hermeticity#no-egress-before-game-end,
  which together already give both halves (Convex mirrors nothing live; the
  instance's first outward transmission is the game-end notification). What
  is ours is the notification's *content and consequences* — outcome plus
  the complete record, and what Convex does on receipt — which is what
  #pushed-never-polled-live now pins: nothing but the push (or the
  fallback) advances a `playing` game's status. Stale-game recovery is
  consistent with that confinement: it probes whether a record still marked
  `playing` has a live instance behind it, and consumes no gameplay state —
  the complete record still arrives exactly once, via the notification or via
  recovery's terminal handling (see the stale-game decision above for how
  both halves of that are pinned).
- **Why the persistence gate exists at all.** Because Convex mirrors
  nothing while the game runs, the instance is the *sole* holder of the
  record until the import lands; that is the whole reason teardown waits
  for confirmed persistence, and it is why the gate is stated as an
  absolute rather than a best practice.
- **Why the zero-grace window is safe.** An absolute "no operation lands
  after the final commit" is only deliverable because turn resolution is
  one ACID transaction in the instance
  (global-invariants/authoritative-turn-resolution#turn-resolution-is-atomic)
  and the game-over guard runs in that same store's transactions
  (global-invariants/transactional-invariant-enforcement#both-stores-guard-their-own-invariants):
  there is no interval between the commit and enforcement for a grace
  window to bound. Under a non-atomic resolution the requirement would have
  to define one.
- **The transactional guards behind three local absolutes.** Once-only
  initialization, idempotent per-game state creation, and successor
  creation being atomic with currency are all guards that must run inside
  the write's own transaction — instance-side for the first, Convex-side
  for the other two (global-invariants/transactional-invariant-enforcement,
  and global-invariants/single-convex-deployment#cross-record-invariants-are-one-transaction
  for the cross-record successor step). Stated as "exactly once" /
  "harmless no-op" / "single atomic step", they are unachievable if a guard
  may be evaluated ahead of its write.
- **Why the warm-up signal may take light auth.** The signal provisions
  nothing and mutates no game, platform, or Centaur state, so it is outside
  the mutation surface global-invariants/authenticated-unambiguous-identity
  governs — the allowance is a boundary judgement, not an exemption.
  Provisioning itself stays platform-authenticated, and the light check is
  the only thing this capability had to state.

## Constraint-mining (mandatory final step)

The routed leads, each judged:

- **Invitations resolve before init + restricted roster.** Silently
  violable (init concurrently with invitation delivery would spawn
  snakes for teams that then refuse). Minted as
  launch-orchestration#invitations-resolve-before-init.
- **Init before connections + clock starts after init.** Violable by an
  implementer admitting early connections or starting the clock at
  provisioning. Minted as instance-initialization#nothing-before-init.
- **Callback token pre-signed, no crypto in WASM.** Judged: mechanism-
  leaning but load-bearing for the trust model — minted into
  finish-notification's body as the instance's "stores and presents it
  unchanged" obligation, with the prohibition on signing left to its
  owners (global-invariants/credential-confinement,
  identity-and-authorization/sole-credential-issuer) rather than copied;
  encoding/claims stay code.
- **Callback validated statelessly, never persisted.** Minted into
  finish-notification's body and #forged-callback-refused.
- **Notification lost after bounded retries → stale-game polling
  fallback.** Upgraded from the legacy "can" to required behaviour —
  minted as finish-notification#lost-notification-recovered (see the
  decision above).
- **What "stale" means, what may be probed, and what recovery does.** The
  obligation above is silently violable in three separate ways an
  implementer would not notice: a threshold tuned to typical durations
  (reaps live games and destroys their replays), a probe that reads game
  state to guess whether the game ended (reintroduces the live mirror the
  confinement invariant forbids), and a recovery that reclaims first and
  persists second (destroys the record it was sent to rescue). All three are
  minted as stale-game-recovery, with the branch behaviours and both
  invariant interactions pinned as their own scenarios —
  #stale-only-past-the-maximum-game-duration, #live-instance-yields-the-record,
  #vanished-instance-finishes-with-an-error,
  #nothing-left-to-persist-when-the-instance-is-gone and
  #probing-is-not-licence-to-watch-a-game.
- **gameSeed always forwarded.** Violable silently (a payload without
  the seed initializes fine but breaks determinism and export later) —
  minted as the "always forwarded" clause of instance-initialization.
- **Post-provisioning failure tears down the instance.** The orphan
  invariant's active half — minted as
  no-orphans#post-provisioning-failure-cleans-up.
- **Auto-create atomic with the setting's current game.** Minted as
  successor-auto-creation#atomic-with-currency.
- **Game-end callback JWT-validated, never persisted.** Same mint as the
  stateless-validation lead above.
- **Init idempotent (per-game platform state).** Violable by an
  insert-without-check retry — minted as
  fresh-game-state#idempotent-initialization.
- **Init snakeIds match board generation.** Violable by independently
  numbering platform state — minted as
  fresh-game-state#identifiers-agree.
- **No self-teardown; only Convex tears down after acknowledgement.**
  Minted as teardown-after-persistence#no-self-teardown.
- **Engagement is published, never inferred.** The inverted-edge decision
  above is only worth taking if consumers actually consume: an implementer
  who answers "is this team busy?" with a local join over game status and
  participation reintroduces the second definition the inversion exists to
  prevent, and does so invisibly. Minted as
  competitive-engagement#published-not-inferred, with the two behaviours a
  local re-derivation gets wrong most easily pinned as their own scenarios
  — #engaged-while-any-of-its-games-plays and
  #a-game-that-never-played-engages-nobody.

Checked, plastic (stay in code with `// design:` references when the
implementation lands): the retry count and backoff schedule of
notification delivery, the stale-game sweep's cadence and the transport its
liveness probe uses, the literal value of the elapsed-time bound past which a
`playing` record is stale (only the property that value must have —
comfortably above the maximum game duration — is authored), the callback
credential's encoding/claims/lifetime, the management-API endpoints and
the initialization payload's field list, the legacy step numbering, the
warm-up dispatch's scheduling primitive, and the initialization-order of
per-game platform state relative to the `playing` write.
