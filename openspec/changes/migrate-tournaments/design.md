## Context

Migration change minting `tournaments` from legacy modules 05 and 03
(7 ids, 4 review items, plus the scoring aspect of the refusal-branching
id retired by migrate-game-lifecycle), per the author-approved capability
map, dependency DAG (game-lifecycle, rooms-and-matchmaking,
team-server-management), and assignment matrix. Legacy module 05 §5.10
and §5.6 and module 03 §3.3 are the core sources; legacy text is
binding, matrix intents are hints. This file records the decisions a
future reader cannot recover from the specs alone.

## Decisions

### Mint the format as one capability rather than scatter it

The alternatives were to fold rounds/scheduling into game-lifecycle
(which already owns launch and succession) and forfeit scoring into a
results/leaderboard story. Reversed, game-lifecycle — deliberately
authored format-abstract, with the explicit author routing that forfeit
scoring is not its concern — would grow tournament vocabulary its launch
story never consults, and the one thing a competitor experiences as one
thing ("we entered a tournament") would live in three places. The
carving also keeps the abstraction seam honest: the lifecycle owns hooks
("a schedule-bound competition format MAY override…", "a format MAY
govern that none follows", the straight-to-finished transition), and
exactly one capability — this one — names the format that exercises
them.

### The format is the concrete instance of the lifecycle's abstractions

tournaments/scheduled-start-override cites
game-lifecycle/launch-gates rather than restating the health/invitation
gates; tournaments/walkover-and-no-contest cites the
not-started-to-finished transition of game-lifecycle/status-authority
rather than re-deriving it; #nothing-after-the-final-round is the
concrete "none follows" arm of game-lifecycle/successor-auto-creation.
Reversed — the gates or transitions restated here — the status machine
and launch story would have two owners whose copies drift, and the
reference lint's one-owner-per-requirement guard is exactly the
discipline this authoring preserves. The ordering half of the resolved
orchestration-reordering review (invitations resolve before
initialization, so forfeiters' snakes never spawn) is likewise owned by
game-lifecycle/launch-orchestration#invitations-resolve-before-init and
only relied on here.

### Forfeit is a marked zero, never a sentinel

A forfeit scores 0 as a loss, and is distinguishable from a played loss
only by the forfeit marking on the game record (the unseated-teams set
of game-lifecycle/game-record). Reversed — a sentinel outcome value, or
distinguishing by score — either the outcome shape forks (walkover
rounds carrying a "winner-by-default" token that every consumer must
special-case; the legacy corpus tried this and amended it away), or
legitimate played zeros become indistinguishable from absences. The
marking-not-value rule is minted as its own scenario because it is
silently violable: a leaderboard implementer inferring "forfeit" from
`score === 0` produces correct-looking results until the first team
plays a round to a genuine zero.

### The walkover scores par, stated abstractly

The sole acceptor of a walkover round records 1.0 — par, the value the
platform's normalised scoring yields analytically for a field of one — 
and forfeiters 0. The number is stated, not derived: game-engine is
outside this capability's dependency ceiling, so the delta phrases the
value as what it is rather than citing the engine's scoring formula,
keeping the formula single-sourced where it lives. Reversed — a
walkover-specific constant or a re-derivation here — the scoring rule
becomes double-sourced and the two sources can drift; reversed the
other way (no number at all), the walkover outcome is ill-defined and
the sentinel temptation returns. Par is also the *right* number: a team
that showed up against a field of zero held exactly its proportional
share — not more (it beat no one) and not zero (it was willing to
play).

### Rounds inherit gameplay config, never the meta-parameters

Each round copies the tournament's base configuration captured at
creation; round count, interlude, and scheduled start time are
properties of the tournament as a whole. Reversed — meta-parameters
inherited into rounds — every auto-created round would itself describe a
tournament, and finishing it would recursively spawn nested events (or
implementers would carry the fields and rely on convention to ignore
them, the exact trap the captured-base-config model closes). Capturing
at creation rather than reading the opening game live also pins
round-to-round identity: no mid-tournament edit can make round 3 a
different game than round 1.

### Whole-event roster freeze, anchored to the tournament (Open Question)

Authored per the later decided legacy source (tournament-wide freeze,
interludes included): the tournament is one coherent competitive unit,
and inter-round member swaps would be strategically abusable. The
earlier module-03 review had explicitly left the whole-event question
open, so the proposal carries it as an Open Question for author
confirmation rather than treating the corpus as settled. The
requirement is phrased as this capability's own — the tournament is an
"enclosing competitive engagement" in exactly the sense the
team-management freeze was worded to admit — because team-management is
outside this capability's DAG ceiling; the composition is by
construction, not by citation. Reversed — per-round freezing — teams
could be rebuilt between rounds of a single event, and the freeze's
enforcement would toggle on every round boundary, multiplying the race
windows the atomic-check discipline exists to close.

### First round never early; the schedule is the platform's alone

The first round begins no earlier than the scheduled start time
regardless of readiness; subsequent rounds are created and started by
the platform after finish + interlude; after the final round, nothing.
Reversed — readiness-accelerated first rounds — the scheduled start
stops being a commitment competitors can plan servers and people
around; reversed on the tail — successor auto-creation firing after the
final round — the room accumulates an unwanted ready-to-start game the
moment every tournament ends, and "the tournament ended" has no
observable difference from "the tournament continues".

## Constraint-mining (mandatory final step)

- **Minted: scheduled rounds consult no readiness gate.** The routed
  lead. An implementer who reuses the manual start path for round
  chaining silently inherits the readiness gate — and every scheduled
  round then stalls forever, since nobody re-declares readiness for an
  auto-created round. Minted as
  tournaments/round-scheduling#no-ready-check-between-rounds,
  minimally constraining: any start path that does not consult
  readiness satisfies it.
- **Minted: the freeze anchors to the tournament's in-progress state.**
  The routed lead's second half. A freeze check derived from "some game
  of this team is `playing`" is correct during rounds and silently
  wrong during every interlude — the exact gap the whole-event decision
  closed. Minted as
  tournaments/tournament-roster-freeze#anchored-to-the-tournament-not-to-a-round.
- **Minted: bounded resolution of every round.** The schedule's quality
  depends on a round never lingering unstarted awaiting a team's
  recovery; an implementer adding a retry-until-healthy loop would
  break the bracket for everyone else. Minted as
  tournaments/scheduled-start-override#bounded-resolution.
- **Minted: marking-not-value distinguishes forfeits.** See the
  forfeit decision above; silently violable by any consumer inferring
  forfeit from a zero score. Minted as
  tournaments/forfeit-scoring#marking-not-value-distinguishes.
- **Checked, owned elsewhere**: initialization deferred until
  invitations resolve (game-lifecycle/launch-orchestration
  #invitations-resolve-before-init, cited not re-minted); the walkover
  transition and its instance teardown
  (game-lifecycle/status-authority#walkover-straight-to-finished); the
  invitation window and delivery discipline
  (team-server-management/game-invitations).
- **Checked, plastic**: the tournament record's representation and
  status vocabulary, the scheduler mechanism for interlude delays and
  the scheduled first start, and interlude units are mechanism — doc
  comments citing this change suffice when the code lands.
