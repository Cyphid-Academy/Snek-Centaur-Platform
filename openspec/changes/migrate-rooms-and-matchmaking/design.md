## Context

Migration change minting `rooms-and-matchmaking` from legacy modules 05
and 08 (17 ids, 4 review items), per the author-approved capability map,
dependency DAG (game-lifecycle, game-configuration, team-management), and
assignment matrix. Legacy module 05 §5.4 and module 08 §8.6/§8.8 are the
core sources; legacy text is binding, matrix intents are hints. This file
records the decisions a future reader cannot recover from the specs
alone.

## Decisions

### Mint the capability as carved rather than scatter it

The alternatives were to push the room record into game-lifecycle (it
holds the current-game reference) and the browser/lobby into an app-pages
capability. Reversed, the one workflow a player experiences as one thing
— find a room, get your team in, say you're ready, play — would live in
three places, and game-lifecycle would grow pre-game social vocabulary
(ownership, enrolment, readiness) that its launch story never consults
except as a single gate. The room-side gate and the launch-side gates
stay cleanly separated (see below).

### The room is a dumb container; the eager game holds the state

The resolved config-on-game model is carried whole: rooms hold no
parameter state and no readiness state; both live on the current game
record, created eagerly at room creation exactly so there is always a
record to hold them. Reversed — room-level config or readiness — the two
legacy race conditions return: game turnover racing parameter edits
(which record was I editing?) and stale readiness surviving into the
next game. The eager initial game authored here and the successor
auto-creation authored in game-lifecycle are two halves of one invariant
("a room always has a current game"); the atomic install of the
successor as current is owned there and only cited here
(#currency-moves-with-the-succession), so the invariant has exactly one
enforcement owner per edge.

### Readiness is captain-only consent, cleared by succession

Three resolved reviews are encoded together. (a) Captain-only: only the
team's authorized representative commits the team to play; reversed —
any member marks ready — a team is committed by someone without
authority to commit it, and the read-only indicator the lobby shows
everyone else (#captain-only-even-for-insiders) has no definite rule to
mirror. (b) Per-game scoping with clearing-by-freshness: the delta
states "every freshly created game begins with no team ready" rather
than mandating a clearing sweep — readiness lives on the game record, so
a fresh record is the clearing; reversed — readiness carried over — a
team ready for game N silently pre-consents to game N+1 and an
unintended start fires, the exact bug the resolved review named. (c)
Read-only display for non-captains is folded as the UI-mirror half of
the same scenario, not a separate requirement.

### Enrolment is unilateral; readiness is the consent gate

The legacy lobby text says the administrative actor may "invite or
remove" teams, but no acceptance protocol exists anywhere in the binding
corpus, and the legacy platform design's enrolment surface is a direct
add/remove. The coherent reading — authored here — is that "invite"
names the affordance, not a handshake: enrolment is the actor's
unilateral act, and the team's consent lives where the corpus actually
put it, in the captain's readiness declaration (a start needs every
enrolled team ready, so no team plays without its captain's explicit
say-so). Reversed — an acceptance flow on enrolment — the platform would
carry two team-consent gates in sequence with no behaviour the second
adds, and the start gate's "every enrolled team" quantifier would need
an extra pending-enrolment state to quantify over.

### Abdication is terminal; ownership is never reassigned

Authored as stated in the binding text, with the scenario pinning the
strongest consequence: after abdication no path to ownership exists for
anyone, ever (#abdication-is-forever). Reversed — reassignable ownership
— "who controls this room" becomes contested mutable state needing a
claim/grant protocol, and the clean two-state administrative model
(owner, or open control) grows a third negotiated state. The ownerless
room's open control is deliberately authored as a defined administrative
state, not a permission gap, so implementers gate on "is administrative
actor" rather than special-casing null owners.

### Room archival edges (judged, per the task's constraint-mining brief)

- **Mid-play archival is rejected** (Open Question 1, authored per
  option A). The legacy text forbids creating or starting games in an
  archived room; a game finishing inside an archived room would force
  successor auto-creation to either violate that or leave the room
  without a current game. Rejecting archival while the current game is
  playing keeps both invariants whole with one small gate, parallels
  the team-archive freeze gate, and makes unarchival trivially safe:
  the room always resumes onto an intact not-started current game
  (#unarchive-resumes-intact). Reversed, one of two open siblings'
  invariants must be carved with an exception.
- **Archive preserves everything** (resolved room-deletion review).
  No deletion path exists because deletion would cascade to or orphan
  historical games, replays, and action logs whose attribution must
  stay stable. The scenario (#archive-preserves-everything) pins the
  observable half: history resolves identically before and after.
- **Archival does not strip state.** Enrolment, ownership state, and
  the current game survive the archive round trip; archived is a
  listing/activity flag, not a reset. An implementer who "cleans up" an
  archived room's enrolment would break resume.

### The room's gate and the launch's gates have one seam

The start requirement owns exactly what the room decides: who may
initiate (administrative actor), and the matchmaking precondition (at
least two enrolled, all enrolled ready). It hands off by citation to
game-lifecycle/launch-orchestration and launch-gates, stating explicitly
that passing the room's gate is necessary, never sufficient. Reversed —
health/invitation gates restated here — the two copies drift, and this
capability would need server-health vocabulary its dependency ceiling
(deliberately excluding team-server-management) cannot reach. The
walkover path is likewise not this capability's concern: below two
enrolled-and-ready teams there is simply no start; the walkover is a
launch-time outcome among seated teams, owned by game-lifecycle.

### UI mirrors folded; discovery scope pinned

Browser and lobby are authored as two requirements of substance (the
platform-wide discovery surface; the universally readable room detail),
and every authorization mirror folds into its owning requirement's
scenarios: actor-exclusive administrative affordances
(#non-actor-rejected-at-the-function), captain-only readiness toggling
(#captain-only-even-for-insiders), the self-explaining disabled start
(#disabled-start-explains-itself), and the outsider's read-only lobby
(#unaffiliated-viewers-see-everything-touch-nothing). The resolved
discoverability review is carried as the browser's scope sentence: the
Room Browser is the only platform-wide live-game discovery surface, and
user-scoped surfaces list own-team games only
(#live-games-found-through-the-browser) — reversed, a parallel
"live games" surface appears without a spec home and the home surface's
narrow scope (owned by the accounts story) is contradicted from below.

## Constraint-mining (mandatory final step)

- **Minted: gate checked authoritatively at initiation.** The start
  gate is a query-then-guard over two records (room enrolment, game
  readiness) that races captains retracting readiness and actors
  editing enrolment. Its quality depends on the check being atomic with
  initiation — an implementer who trusts the surface's enablement, or
  checks in a separate step, starts games whose gate no longer holds.
  Minted as
  rooms-and-matchmaking/game-start-gate#gate-checked-at-initiation-not-in-the-surface,
  minimally constraining: any mechanism making check-and-initiate
  atomic satisfies it.
- **Minted: enrolment set semantics.** Under optimistic concurrency, a
  duplicate-add race is silently violable by check-then-insert without
  atomicity — and a duplicate here double-counts toward the two-team
  gate. Minted as
  rooms-and-matchmaking/team-enrolment#enrolment-is-a-set.
- **Minted: freshness-as-clearing for readiness.** The invariant "no
  fresh game starts with anyone ready" is what makes the succession
  safe; an implementer copying game records wholesale (as successor
  creation copies configuration) could silently carry readiness.
  Minted as
  rooms-and-matchmaking/team-readiness#stale-readiness-never-survives.
- **Checked, owned elsewhere**: the atomicity of successor-install-as-
  current is game-lifecycle/successor-auto-creation#atomic-with-currency
  (cited, not re-minted); the archived-team enrolment bar's substance is
  team-management/archive-not-delete (cited; the scenario here pins the
  enrolment-side rejection).
- **Checked, plastic**: the readiness representation (an id array on
  the game record), browser pagination and search implementation,
  lobby routing, and the start-confirmation nicety are mechanism — doc
  comments citing this change suffice when the code lands.
