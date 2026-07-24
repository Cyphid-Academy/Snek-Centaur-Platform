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
schedule-bound competition format MAY override both gates"), which keeps
this capability inside its dependency ceiling. Reversed — scoring
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
instance only stores and presents it — the instance performs no signing,
which keeps the sole-credential-issuer rule exception-free and keeps
cryptographic material out of the per-game runtime. Second, the platform
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
  leaning but load-bearing for the trust model (sole issuer; no signing
  material in the per-game runtime) — minted into finish-notification's
  body; encoding/claims stay code.
- **Callback validated statelessly, never persisted.** Minted into
  finish-notification's body and #forged-callback-refused.
- **Notification lost after bounded retries → stale-game polling
  fallback.** Upgraded from the legacy "can" to required behaviour —
  minted as finish-notification#lost-notification-recovered (see the
  decision above).
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

Checked, plastic (stay in code with `// design:` references when the
implementation lands): the retry count and backoff schedule of
notification delivery, the stale-game polling cadence, the callback
credential's encoding/claims/lifetime, the management-API endpoints and
the initialization payload's field list, the legacy step numbering, the
warm-up dispatch's scheduling primitive, and the initialization-order of
per-game platform state relative to the `playing` write.
