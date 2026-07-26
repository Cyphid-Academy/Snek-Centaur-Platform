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
and forfeiters 0. The number is stated, not derived: what this
requirement actually depends on is not the engine's formula but that the
formula have exactly one implementation, which is
`global-invariants/one-shared-engine` — cited in the requirement, so the
stated literal cannot silently diverge from a second scoring copy. The
formula itself stays single-sourced where it lives, and game-engine is
therefore not among this capability's declared dependencies (which are
extended when a citation is warranted, not held to a fixed list).
Reversed — a
walkover-specific constant or a re-derivation here — the scoring rule
becomes double-sourced and the two sources can drift; reversed the
other way (no number at all), the walkover outcome is ill-defined and
the sentinel temptation returns. Par is also the *right* number: a team
that showed up against a field of zero held exactly its proportional
share — not more (it beat no one) and not zero (it was willing to
play).

Integration, since a walkover finishes a round no turn ever resolved:
the outcome is authored in Convex without contradicting
`global-invariants/authoritative-turn-resolution` or
`global-invariants/state-confined-to-owning-runtime` — there is no
committed gameplay for an instance to be the authority over and no live
game-runtime state to mirror, so this round's record is Convex's from
the start rather than an imported finished record.

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

Integration with the invariants bearing on a round boundary. Equality of
the *recorded* configuration only buys equality of *play* because a
round's instance is seeded once at initialisation and never refreshes
(`global-invariants/game-instance-hermeticity#seeded-once-never-refreshed`,
cited in the requirement) — otherwise a configuration edit could reach a
round already in flight and the captured base would guarantee nothing.
In the other direction, what crosses a round boundary is only the
tournament record: per-game state is confined to its own instance and
dies with it
(`global-invariants/state-confined-to-owning-runtime#game-instance-holds-only-its-games-state`),
so the delta cites that invariant in
tournaments/round-structure#every-round-a-real-game instead of restating
"nothing of one round's state survives into the next" as a rule of its
own. Only the tournament-level record — meta-parameters, participant
set, captured base configuration — spans the rounds, which is why
round-structure cites `global-invariants/single-convex-deployment`: a
cross-round entity presupposes one persistent home for state that
outlives a game.

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
not among this capability's declared dependencies; the composition is by
construction, not by citation. Reversed — per-round freezing — teams
could be rebuilt between rounds of a single event, and the freeze's
enforcement would toggle on every round boundary, multiplying the race
windows the atomic-check discipline exists to close. That discipline is
`global-invariants/transactional-invariant-enforcement`, which the
requirement cites: a freeze is exactly the shape of rule it names
(uniqueness, exclusivity, and freeze rules alike), and a freeze checked
outside the transaction of the mutation it rejects is not a freeze — a
membership write racing the tournament's entry into play would commit.
Integration of the "every mutation" absolute: it is safe to state
without enumerating surfaces because
`global-invariants/one-contract-many-surfaces` already makes every
surface's mutations pass the same server-side contract, so the freeze
cannot be honoured by the web application alone while a programmatic
surface walks past it.

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

Naming Convex as the scheduling authority is the one runtime commitment
this otherwise runtime-neutral capability makes, and it rests on
`global-invariants/runtime-ownership` (cited in the requirement): round
chaining is a single behaviour with a single home, so it cannot be split
between the platform and a finishing round's instance. Were ownership
splittable, "the platform's act alone" would be satisfiable by an
instance that starts its own successor — and a round that failed to
finish cleanly would take the rest of the schedule with it.

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
