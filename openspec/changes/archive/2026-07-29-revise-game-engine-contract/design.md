## Context

`game-engine` is the root of the capability graph and the single shared
executable definition of game behaviour. It archived first and has stayed still
while sixteen capabilities were authored on top of it. Three of those
capabilities' requirements need engine behaviour that does not exist —
discovered while planning their implementations, because the gap is only visible
when you ask *which function computes this*.

`one-shared-engine#no-parallel-implementation` means a capability needing a rule
the engine does not expose has two honest options: extend the engine, or stop
needing the rule. Two of these are small; the third reshapes how the engine is
called, and is the reason this change is not three one-line amendments.

A fourth reshapes the calling convention again, and from the other direction: a
game needs a bound on its wall-clock length, which means the engine has to be
*told* what a turn cost. That makes this change wider than "engine affordances
the train needs" — it changes both entry points' signatures and drags two
consumer capabilities (`test-sequences`, `visual-tester`) along, because a
resolution input has to be recorded to be replayed and supplied to be
simulated.

A fifth strand runs the other way, and is what renamed the change from
`extend-game-engine` to `revise-game-engine-contract`. Once the question is
"what does the engine take?", it becomes visible that it takes too much: seven
requirements and five configuration parameters describe how a **board is
built**, and nothing in turn resolution reads any of them. Those leave for
`game-configuration`. The change is therefore not an extension at all — it
revises what the engine *is*: what it takes (declared timings, a fully specified
board), what it decides (a time-based ending), what it no longer owns
(generation), and the hypothetical-resolution affordances on top.

## Decisions

### Uncertainty is the thing being represented, not absence

The bot framework's tree search evaluates one owned snake against combinations
of what other snakes might do. For snakes whose choices cannot affect the
evaluated snake's own Drives, it explores no branch at all — and the question is
what to put in that gap.

Advancing such a snake in its last direction looks free and is not. It is a
*claim* about a snake the search declined to model, and its errors are not
symmetric: a candidate direction can be scored safe because an opponent was
assumed to continue straight, when a different opponent move would close the
escape and leave that candidate trapped. A worst-case search that can conclude
"safe" from an unmodelled assumption is broken in the one direction that
matters. Holding the snake asserts nothing about its choice; it says the search
is not modelling it, and leaves its body where it is as an obstacle.

That distinction is why the engine needs a second entry point rather than a
cleverer default. *What happens when a snake is not modelled* is not a movement
rule, and cannot be expressed as one.

What breaks if reversed: bots recommend moves that are safe only under an
assumption nothing justified, and the failure is invisible — it looks like a
heuristic tuning problem, not a simulator lie.

### One data structure, two entry points, and the seam falls where lockstep is required

The resolver already runs in eight stages. Sorting them by whether they need
every snake at the same turn puts the seam in exactly one place:

| Stages | Needs lockstep |
|---|---|
| move projection, head-to-head precedence, interaction rules, derived rules, commit | **No**, given held snakes contribute occupancy |
| item spawning | **Yes** |
| win-condition check | **Yes** |

Spawning is the hard one, and its dependence is structural rather than
incidental: eligible cells are those unoccupied by *any* alive snake's body, and
the eligible list is then shuffled — so its **contents determine where items
land**. On a board where some snakes lag, "occupied" mixes positions from
different turns, and the resulting spawn cells could not match the real game's.
The win check has the same shape: it sums aggregate body length across all
snakes at one instant, which on a mixed-turn board compares lengths from
different times.

So both stages are gated on **one condition about the state** — every alive
snake at the current turn — rather than on which entry point was called or on
what the caller passed. Advancing a turn is then genuinely *defined in terms of*
imagining moves: resolve every snake's direction by the movement rules, imagine
exactly those moves with nothing held, and the result is caught up by
construction, so spawning and the win check run and the state narrows.

Gating on the state rather than on the seed's presence is deliberate. Tying
spawning to whether a seed was supplied would make it a property of the call,
and it is a property of the world: a mixed-turn board cannot place items
correctly however much entropy it is handed. Keeping the seed as an ordinary
input that stages use when they run also leaves room for seeded work over
mixed-turn boards later — nothing about a partial state forbids randomness in
principle, only the specific stages whose inputs span turns. Today a
one-turn-ahead search supplies no seed and needs none, because the only seeded
stages are the turn-0 fallback direction (which belongs to advancing a turn) and
spawning (which is gated off anyway while a snake lags).

What breaks if reversed — spawning inside every hypothetical: the search invents
items at positions the real game will not have, and a Drive that values food
chases them.

### The turn lives in the state, at two grains

`GameState` today carries no turn; it is a parameter of `resolveTurn`. Making
per-snake turns meaningful requires a reference point, so each snake carries the
turn it has reached and the state carries a current turn defined as **the
greatest turn any snake on it has reached**. Every snake's turn is therefore ≤
the state's by construction, and a **game state** is the case where every alive
snake's equals it — what the mainline always produces and what every runtime
persists.

Defining the current turn as a maximum rather than storing it independently is
what makes holding everything a no-op rather than a special case: hold every
snake, none advances, the maximum is unchanged, and the state that comes back is
the state that went in. It also removes a denormalisation that could disagree
with the snakes it summarises.

Absolute turns rather than staleness counters, because a turn is a fact about
the snake while staleness is a fact about a comparison, and the comparison's
other operand changes as a search descends. Staleness stays derivable by
subtraction, which is what
`bot-framework/frozen-snake-timestamps#head-start-compensation` asks for.

This makes `GameState` a structural subtype of the partial form rather than a
different shape, which is what lets a heuristic accept either. TypeScript
requires the field on both for that to hold: a type missing a property is not
assignable to one that has it. Hence the migration — the field is not optional,
because an optional turn with "absent means fresh" defeats the invariant and
pushes an `undefined` case into every author's analysis.

What breaks if reversed — the turn kept as a parameter: nothing carries which
snakes are stale, so the compensation rule has no input and a partial board is
indistinguishable from a complete one.

### A hold splits the snake in two, and that split is the whole of what holding means

An earlier round of this change kept **one** representation and marked it: the
snake stayed on the board carrying a flag saying it had not moved, and every
rule that cared consulted the flag. That collapsed under the first question
review asked of it — what happens when a mover enters the cell a held snake's
head is standing in. Answering it needs that cell to be a *body* segment for the
turn being resolved, and needs the *head* to stay readable as the last position
anyone modelled. One object cannot be both without an index-offset convention
read at every call site, effects mutated in place on a record that is supposed
to be frozen, and a flag whose meaning changes with how long the hold has
lasted. Two objects answer it with no convention at all:

- The **historic record** is the snake as it stood at the turn it was held from,
  and nothing ever changes it again — not a sever, not an expiry, not its team's
  collection. It is not on the board and no stage iterates it. It exists so a
  reader can take the last position anyone modelled.
- The **projection** is what stands on the board in its place, and is an
  ordinary occupant in every respect a rule reads: severable on the ordinary
  terms, carrying effects that expire and that team events reach, advancing its
  turn with the state, dying with its team's clock.

**The projection has no head, and that is the only way it differs.** A snake
vacates its head cell only by putting its own next segment there, so the
occupant of that cell next turn is certain *without knowing the choice* — while
where the head itself went is precisely the thing nobody made. The first cell a
projection stands in is therefore a body segment, and the head is in no plane
the resolution can reach. A projection held at turn T and read at T+N is missing
N leading segments, derived from the two turns rather than stored.

The payoff is that **`collisions-and-severing` needed no amendment.** Severing
is scoped to non-head segments, and every cell a projection stands in is one, so
the invulnerability comparison alone decides and no encounter is left in which
the higher level dies to the lower. The rule needs no idea which kind of
occupant it just hit — which is the test of whether the split is real or
decorative.

Both kinds extend **one declared supertype**, so the fields and the logic they
share are stated once and the difference is decided in exactly two functions:
one asking which kind an occupant is, one answering which cells it stands in.
Severing is a single helper applied at both sites. A sibling type that restates
its supertype's fields is two types that will drift, not one type with two
cases.

A sever reaching a projection's first segment takes **every** cell it has, and
it survives that — standing in nothing, holding only the head no cell could
name. An empty cell list says this without a flag, which is what keeps the
representation honest: a projection *is* its cells.

**Conservatism has one source and two consequences.** A snake nobody simulated
might have reached food on any turn since, so its projection carries the team
maximum health and its final segment does not vacate. Both follow from that one
unmodelled fact rather than from two separate judgements. Health is *set* rather
than withheld deliberately: an ordinary snake reports a health, and a projection
reporting none would be exceptional in a second way for no gain. That single
source is also the seam a later pass would narrow — reasoning about the food a
projection could actually have reached lowers both figures together — which is
why the projection owns its own cell list instead of deriving it from the record
by arithmetic.

What breaks if reversed — one flagged object: the flag has to encode how many
turns of hold have passed, every rule that reads a body needs the offset, and
the "frozen" record is mutated by the effects that must keep running. Review
found all three within one round of reading it.

### Holding changes which set each rule iterates — which is why it is not a wrapper

Three things inside stages 1–5 are structured around "every alive snake moved",
and each needs the participant/present distinction rather than a filter over the
result:

- **Occupancy must include a projection's cells, from the first.** The
  body-collision index is built from moved snakes and deliberately skips index
  0, because a mover's own head is contested through head-to-head instead. A
  projection has no head to skip, so every cell it stands in enters the index —
  and every entry in that index is then a non-head segment whichever kind it
  came from, which is what lets one comparison decide the outcome.
- **Projections must not enter head-to-head precedence.** Precedence is about
  *simultaneous entry into the same cell*, and a projection entered none. Having
  no head, it does not lose the contest — the contest does not arise.
- **The health tick and health resolution iterate participants only.** A
  projection taking the tick means a hold costs the snake health, and at health
  1 the hypothetical *kills* it — clearing an obstacle the real game keeps, and
  making the evaluated snake's candidate look safe for a reason the game will
  not supply. It reports the team maximum instead, for the reason above.

### The dividing line is what the snake's own movement could have changed

Held snakes are not sealed off from the turn, and the earlier instinct to
suspend everything about them was wrong. The line that actually holds is
narrower and easier to apply: **whatever is determined regardless of how the
snake would have moved applies; whatever its own movement could have changed
does not.**

Potion expiry is on the applying side, and this is where the instinct failed.
An effect's expiry turn is fixed when the effect is granted, and no choice the
snake makes moves it — so withholding the expiry does not model uncertainty, it
invents certainty in the other direction, keeping an opponent invulnerable for
a turn the game would have ended. There is nothing to be conservative *about*.
Health is on the withholding side for exactly the complementary reason: a snake
allowed to move might have reached food, so its health at the end of a turn it
did not take is genuinely unknown, and the tick would assert one answer.

Potion *collection* is the third case and follows from the same rule: the
effects a collector confers on its teammates are a consequence of the
collector's action, not of the recipient's, so a held teammate receives them and
the collection event's affected-teammate list is unchanged. Dropping the buff
would understate an opponent team's protection.

The same line settles tails. A moving snake may follow another's vacating tail
in lockstep, and a held snake's tail plainly does not vacate — but the reason it
is impassable is stronger than "the snake did not move". Even simulated, its
tail might not have vacated, because a snake that reaches food keeps its final
segment. The vacancy was never determined, so a resolution that declines to
model the snake must not assume the convenient outcome.

### Refusal is the conservative answer, and the fence is deliberately blunt

The caller is a worst-case search, so a wrong "safe" costs far more than a
refusal. Imagining moves therefore fails rather than guesses in four families:

- **Information not supplied.** An alive snake that is neither given a direction
  nor held is a failure, not a fallback. Falling back to `lastDirection` is
  precisely the false assumption this whole change exists to avoid, and it would
  reintroduce it silently in the one place a caller is least likely to look.
  Requiring an explicit disposition per snake is also what removes the turn-0
  seeded pick from hypothetical resolution.
- **A lag the rules cannot express.** Only *held* snakes may lag: imagining
  moves refuses to advance a snake whose turn is behind the state's. This is
  bluntly conservative — one-turn-ahead search never needs to move a stale snake
  — and it fences off the cascading uncertainty that arrives with deeper
  look-ahead, where advancing a snake held for k turns would need interactions
  that already committed to be re-resolved. The fence is not relaxed later so
  much as **gone around**: the next decision supplies the missing move at the
  turn it belongs to and revises the past, rather than advancing a stale snake
  into the present.
- **A running stage's seed not supplied.** A resolution that leaves nothing
  behind runs item spawning, and spawning needs entropy; substituting some is
  the missing-direction error one step further on. This is a family of its own
  rather than a case of impossible input because it is the one refusal that is
  **about the resolution rather than about a snake** — it names none, and the
  shape of the failure a caller receives has to say so.
- **Input that could not have arisen.** Structural validity of the state itself,
  including holding a snake that is not alive, naming a projection as held, and
  timings that are not lengths of time.

What breaks if reversed — a permissive resolver that guesses: every failure mode
above becomes a silently wrong world, and the search's guarantee is gone with no
signal.

### A held move can be learned afterwards, and learning it revises the past rather than advancing the present

A hold used to be terminal: the snake was behind for good, and the only entry
point that would look at it refused to move it. But what a hold declines to
model is a fact about **one past turn**, and it can become known — a search that
held a snake as irrelevant can find its own snake crossing into that snake's
territory and become curious about it.

So the move is supplied **at the turn it was held at**, not at the turn the
board now stands at. Resolution is a function of its declared inputs alone, so
the board is resolved again from before that turn with the fact in place and
every resolution since replayed over it. That is the same computation over a
different premise, not an approximation of one — which is why this is soundly
available today, well short of the partial-board simulation that advancing a
stale snake *in place* would need.

**The state carries a rewind log** to make it possible: what each resolution was
*asked* — directions, holds, declared timings, seed — over the board as it stood
before the oldest still-standing projection was held. It exists exactly while
something is projected, so the mainline never accumulates one, no runtime
persists one, and no schema version moves. The log's base is a lockstep state by
construction, so the nesting terminates rather than recursing.

**It is its own entry point, not a direction passed to the hypothetical one.**
A revision can change which snakes are alive, so one call that both revised the
past and planned the next turn would be planning against a board it was in the
middle of rewriting. Splitting them hands the revised board back first and lets
the caller decide what to ask of it.

**Discontinuity is reported, not prevented.** The newly located head may enter a
cell another snake was allowed to pass through, so a snake that lived may die
and a game in progress may have ended; the revision names every snake whose fate
it changed. Preventing it would mean refusing the revision in exactly the cases
that motivate it. The replay adapts on the same principle — drop a direction for
a snake that is now gone, hold a snake the log is silent about — because a hold
is precisely the answer for a move nobody modelled.

One supplied move leaves the snake **one turn less historic**, not caught up,
since the log says nothing about the turns after. That is a feature for the
caller it exists for: curiosity about a frozen snake fans out over single facts
rather than over whole histories.

What breaks if reversed — a hold that stays terminal: the only way to learn
anything about a snake already held is to re-run the whole line from before the
hold under a different disposition, which is the cost holding was taken to
avoid.

### Time is a declared input, so the ending that depends on it is the engine's

The corpus currently permits a game with **no finite maximum duration**:
`game-end-conditions` treats `maxTurns` 0 as no turn limit, and the chess timer
adds `clock.budgetIncrementMs` to a team's budget every turn, so a team that
declares faster than the increment gains time as fast as it spends it — its
clock never runs out, and nothing else stops the game.
`game-lifecycle/stale-game-recovery` specifies its silence bound as generous
above "the longest game the configured clocks and turn limit can produce": a
quantity that is only well defined once every game has a finite bound, which is
why this is a soundness fix rather than a feature.

**The reversal.** This change first answered the "where can a time limit live"
question with *not here*: the engine would declare `maxGameDurationMs` and never
read it, `game-runtime` would evaluate the limit inside its resolving
transaction, and `game-end-conditions` would carry a scenario
(`#an-ending-the-engine-does-not-derive`) stating that taking elapsed real time
as an input "would make two resolutions of the same snapshot, staged moves, and
turn seed disagree". That reasoning has one flaw and it is fatal to it: it
assumes the engine would **read** a clock. It does not. The timings become
**declared inputs of the call**, alongside the state, the directions and the
turn seed. Determinism is the property that identical inputs give identical
outcomes, and it survives exactly as before — the tuple grew by two quantities
and stayed closed. So that scenario is not merely too broad, it is wrong, and it
is removed rather than narrowed.

**What the reversal buys, which the first answer could not.** A bot's tree
search can see what the clock is about to do. A simulated resolution declares its
own duration for the turn and its own burn for each team, so the projected board
it produces carries drained clocks, an advanced consumed duration, and — where a
team has run itself dry — that team's snakes already dead. A search can read an
impending loss (its own clock about to empty) or an impending opening (an
opponent's) turns before it lands. Under the first answer the engine could never
derive any of it and never move a clock inside a resolution, so no search could
anticipate it however cleverly written: the game's real termination condition
lived outside the thing that defines termination. That is the motivation, and it
is what the migration cost buys.

**What breaks if reversed** (back to the limit living outside the engine): the
engine can never report a clock-driven ending, so no tree search can anticipate
one — a bot plays into a lost clock exactly as confidently as into a won
position — and a game's real termination condition sits outside the capability
that defines termination, leaving every consumer to bolt a second notion of "the
game ended" onto the engine's.

### One channel for time, not two

The engine already owns the timer's arithmetic (`chess-timer`, and `clock.ts`'s
`initialClock` / `applyTurnStart` / `declareTurnOver`, exported precisely so a
runtime applies the formulas rather than re-deriving them), and `GameState`
already carries the per-team clocks — the first answer's claim that the budgets
"are not part of `GameState`" was simply false. What the engine did not have was
the **drain**: real elapsed time reducing a running clock, which the runtime did
between turns.

Leaving that split in place while adding timings as resolution inputs would give
time two channels into committed state: the runtime moving clocks between turns,
and the engine deciding endings from values it was handed. Those can disagree,
and the disagreement is unfalsifiable from inside either side. So the application
moves into the resolution: the declared burn is spent from the clock, the
remainder banks, the next turn's increment and carve-out follow, and the game's
consumed duration advances — all at the one commit, all from one declared pair.
The runtime's job becomes *measure and supply*; the engine's is *decide*.
`game-runtime/in-game-clock` keeps what is genuinely the instance's: observing
elapsed time against a running clock and auto-declaring on expiry, which is a
mid-turn reading that commits nothing.

**Why the two quantities do not collapse.** The turn's duration and a team's
burn are different measurements and either can be the larger surprise: a team
that declares two seconds into a ten-second turn burned two, and a turn whose
last declaration lands at ten seconds cost the game ten however little anyone
else spent. The burns cannot be summed into the turn's length (the clocks run
concurrently) and the turn's length cannot be charged to each team (it would
bill a fast team for a slow one's deliberation). Each quantity has exactly one
consumer: the burns move the team clocks, the duration moves the game's total.

**What breaks if reversed** (one number for both, or clocks still moved outside a
resolution): with one number a chess timer stops distinguishing the team that
thinks fast, which is the whole economy the timer exists to create; with two
channels `#the-duration-limit-is-an-ending-like-any-other` becomes
unimplementable, because the ending would be decided against a total another
writer is free to have already changed.

### The gate on the clock movements is the gate holding already needed

Time is charged when the state's current turn advances — not when the caller
happens to supply a timing, and not only in lockstep. Three reasons, each one
this change already established:

- **Not gated on lockstep.** A team burned its time whether or not the search
  chose to model its snakes, so the burn falls on the *applies regardless of how
  the snake would have moved* side of the held-snake line, exactly as potion
  expiry does. Gating it on lockstep would hand a search a free reprieve from the
  deaths it exists to see coming — a team's held snakes die to an emptied clock
  exactly as its moving ones do.
- **Gated on the turn advancing.** Hold every snake and the current turn — the
  greatest turn any snake has reached — does not move, so no turn was taken and
  nothing is charged. That keeps `#holding-everything-is-a-no-op-not-a-failure`
  literally true rather than needing an exception, and it is the same shape as
  the spawning gate: a condition on the state, never on the call.
- **The outcome stays gated on lockstep**, so a partial hypothetical still
  reports no ending. The search's early warning does not come from the ending
  being *reported* — at a one-turn horizon it could only ever be reported one
  turn out — it comes from the projected clocks and consumed duration being
  present on the returned board, and from the exhaustion deaths themselves,
  which are committed state on that board rather than an outcome the
  hypothetical withholds.

### `configuration-parameters`, `scoring`, and what the reversal leaves alone

`maxGameDurationMs` still belongs in the engine's vocabulary, and the four
reasons are untouched by the reversal:
`game-configuration/closed-parameter-vocabulary` admits exactly the engine's
gameplay parameters, `game-configuration/engine-schema-fidelity` mirrors the
engine's config types field-for-field,
`game-configuration/parameter-bounds-sourcing` requires every gameplay bound to
be read from the engine's declaration rather than restated, and
`game-configuration/generation-parameter-boundary` forwards the gameplay subtree
to whatever plays the game. One clause changes: the engine evaluates it. The
scenario asserting it never would is gone. It is worth noticing that the same
four reasons, read in the other direction, are the argument for the generation
parameters *leaving*: a vocabulary defined as "exactly the engine's" only works
while the engine's vocabulary is exactly what a turn's resolution reads.

`scoring` needs **no** timed adjustment at all — this is the second thing the
clock-exhaustion correction simplified. A duration-limit ending scores by the
plain standing score, which the standing/final split already covers without
naming the ending, and a team that ran out of time is scored by the ordinary
elimination rules because running out of time is now a way of dying rather than
a way of ending. The requirement states both (`#the-duration-limit-faults-nobody`
and `#running-out-of-time-needs-no-adjustment`) adjacently, precisely because
both read as "time ran out" to a careless reader while neither is a special
case.

### Running out of time kills a team; it does not end the game

This change first authored clock exhaustion as an **ending**: a competing team
left with no remaining time at all ended the game there and then. That is
wrong, and the reason it is wrong is the same reason the forfeit alternative it
rejected was also wrong — both answer a question about *the game* when the fact
in hand is a question about *a team*. A team with no time cannot take another
turn. Everything that follows from that is already specified: a team whose
snakes are gone is a team out of the game, and the corpus has had rules for
what that means to the game since before the clock existed.

So: **a competing team left with no remaining time at all loses every snake
still alive at that commit** (`clock_exhaustion`), and the ordinary end
conditions then look at the state that leaves. With four teams the game
continues with three. With two it ends by last-team-standing, on that ending's
terms and with that ending's scores. Nothing about the clock appears in
`game-end-conditions` at all, and `scoring` needs no adjustment: an exhausted
team is scored as any other team whose snakes died, which is `0` either way —
as an eliminated team where its own removal ended the game, and as a plain
standing score with no living segments while the game runs on.

**Where it is authored, and why not the other two candidates.** In
`chess-timer`. Death causes in this corpus belong to the requirement that owns
the cause: `wall` and `body_collision` to collisions and severing,
`head_to_head` to precedence, `health_depletion` to health. `chess-timer` is
the requirement that holds the budgets, applies the declared burn and is the
only place that can say what "no remaining time at all" means, so putting the
death anywhere else would split one rule across two requirements.
`collisions-and-severing` was never a candidate on inspection — it is about
what a moved head meets on the board, and a clock is not on the board.
`game-end-conditions` is the requirement that must now be *silent* here, since
its saying anything is precisely the mistake.

**The ordering is the load-bearing part.** Exhaustion is judged after the burn
is spent and the remainder banked, and **before** the next turn's increment and
carve-out. That is what makes zero reachable at all: a team that spends its
entire remaining budget without declaring early lands at zero, and the
increment that would have rescued it has not arrived yet. Applied in the other
order — increment first — a positive `clock.budgetIncrementMs` is a floor no
team can ever cross, and the rule is dead code in every default configuration.
An implementer who does not see the ordering stated will write the harmless
version, and every test that does not deliberately drain a budget will pass.

**What breaks if reversed** (back to an ending): the two-team case is
indistinguishable, which is what made the mistake easy — but with three or more
teams an ending stops a game two teams are still playing, on account of a third
that merely ran out of clock. It also forces `scoring` to carry an adjustment
for an ending that is not about the board, and forces a tree search to model a
second, differently-shaped termination rule alongside the elimination rules it
already models. A hold makes this concrete: the search that holds a team's
snakes still watches them die when the clock empties, because the burn falls on
the *applies regardless of how the snake would have moved* side of the
held-snake line — and that is a death it can reason about with the machinery it
already has.

A consequence worth flagging either way: with `clock.initialBudgetMs` at its 0
sentinel a team's entire allowance is the per-turn increment, so spending all of
it now kills the team's snakes where before it merely ended the turn. The
default budget is 60000 ms, so no default configuration is anywhere near this.

**Simultaneity.** The turn limit and the duration limit cannot disagree — both
score by the standing score, so which one is credited is unobservable — and the
author's reading that there is nothing to work out between them is correct. The
case that *is* now more reachable is an elimination landing at the same commit
as a limit, because a clock can produce the elimination. One clause settles it:
the game ends once, and the elimination is the ending. An elimination says what
became of the game; a limit only says a game still in progress may run no
further, and a game that has just ended is not in progress.

### The engine takes a board, not a recipe for one

The question that renamed this change was "what does the engine take?", and the
honest answer was: too much. Seven of its requirements described how a board is
*built* — the wall ring, the hazard proportion, the fertile patches and their
noise parameters, the angular starting territories, the snakes and food placed
in them, and a bounded retry over all of it — and five of its sixteen
configuration parameters existed only to feed them. None of it is read by a
turn. `resolve/` imports nothing from generation, `snakesPerTeam` appears
nowhere inside it, and whether fertile ground is in play is already derived from
the board's cells rather than from configuration.

**This is packaging, not intent, and that distinction decides the shape.** The
boundary that keeps generation platform-side is an old, argued decision: the
per-game runtime receives a precomputed board and never generates one, and its
own rationale names hand-authored puzzle states as a motivation. That decision
is on this change's side and is already implemented at the boundary that governs
gameplay. What never caught up is that the *algorithm's contract* was written
into the capability that plays the game. So this is a **move**, not a redesign:
nothing about how a board is generated changes, and no resolver behaviour
changes at all.

**What the engine keeps, and why `board-geometry` did not simply move.** The
board requirement splits along the line between how a board is made and what the
engine may assume about one it is handed. The engine keeps: the flat row-major
`y × boardSize + x` encoding (every runtime holds a board this way), the inner
`(boardSize − 2)²` playable area (item spawning is defined over it), off-board
resolving exactly as a `Wall` cell does, and terrain being fixed for the whole
game. That last clause is where `hazards#permanence` and
`fertile-ground#stable-designation` went: they are one fact about a board in
play, they were duplicated across two requirements, and they belong to the
capability that plays the board rather than to the one that made it.

**The wall ring left because resolution does not depend on it, which was checked
rather than assumed.** `resolve/rules.ts` treats an off-board cell identically to
a `Wall` cell, and `resolve/spawn.ts` excludes the border by *index* rather than
by cell type — so a board handed in with no ring resolves correctly and
identically. The ring is therefore a convention of the boards produced, not a
validity precondition the engine states, and it is now
`game-configuration/generated-board-shape`. Had it stayed, `game-engine` would
have carried a rule its own rules do not need, and the next reader would have
had to work out which of the two board requirements was binding.

**Two capabilities describing "the board" is the failure mode here**, so the
split is by distinct names and distinct facts rather than by a mirrored pair:
there is no `game-configuration/board-geometry`, and no sentence appears in both
places. The engine's requirement says what a board *is* to a resolution; the
configuration capability's requirements say what generation *produces*. The one
declared edge runs in the imposing direction, from generation to the engine's
geometry.

**Why `game-configuration` and not somewhere new.** It already owns the
parameters that drive generation, the preview that renders its output, the lock
that designates it and the boundary that keeps it platform-side. A capability
does not own a section of code, so the requirements living here while the
algorithm ships in a shared package is the arrangement to aim at, and it is the
only one that keeps a single implementation for the four surfaces that need a
board.

**What the move obliges the receiving capability to author itself.** Two things
the engine used to supply by accident. First, `generation-parameters`: with the
five rows gone from the engine's table, nothing declared their ranges, defaults
or sentinels — and `parameter-bounds-sourcing`'s "read them from the engine"
would have pointed at nothing. It now declares them outright, which is also what
re-authors the roster-tightening rule the engine's departure invalidated: there
is no engine-declared outer range for the tightening to sit inside any more, and
that is a simplification rather than a loss. Second, `generated-board-shape`,
the wall ring. `boardSize` additionally needed a default, which the engine's
table deliberately left blank because the engine never needed one; a
configuration record must initialise, so `21` is declared here — the value the
shipped `DEFAULT_GAME_CONFIG` already uses.

**The code moves with the requirements**, into `@cyphid/snek-game-configuration`
— planned in §12 of `tasks.md`. An earlier round of this change deferred the
extraction to a later PR, and the deferral is what created the awkwardness it
was meant to avoid: `boardgen.ts` and `perlin.ts` citing `game-configuration/*`
from inside the engine package is correct (a capability does not own a section
of code) and reads as a mistake, which makes it a standing invitation to "fix"
the citations back. Moving the 448 production lines and their 475 test lines
costs one package and no behaviour change, so the invitation is cheaper to close
than to document.

The reason the extraction looked expensive is concentrated in one place:
`resolve-properties.test.ts` built every initial state by **calling** generation
across the full documented parameter ranges, and once generation lives
downstream of the engine it cannot. The replacement is **dedicated arbitraries,
deliberately more adversarial than board generation** — a fuzzer for game rules
should be harsher than the thing that produces the game's boards, not a re-run
of it: interior walls, boards with no wall ring at all, disconnected hazard
fields, bodies of length 1–5 stacked or walked, mixed head parities, snakes on
hazards, clocks near exhaustion. What it deliberately keeps is body contiguity
and disjointness, which are shapes the movement rules alone can produce — a
state violating them is not a harder case, it is a different game.

The risk that plan is really managing is that the loss would be *silent*: a
narrower source of states passes the entire suite, and a green run is not
evidence. So the branch coverage of `resolve/` is recorded on both sides of the
swap rather than argued about — and recorded around **the swap alone**, which is
why the extraction lands as its own commit ahead of the contract revision. A
measurement taken across both at once cannot distinguish reach that was lost
from reach that never existed, because the revision adds code (the failure
fence's defensive branches, the lockstep gating, the duration limit) whose own
coverage moves the aggregate. Isolated, the answer is unambiguous: the drawn
states reach *strictly more* than generated boards did — aggregate 95.65 →
96.48, `claims.ts` 90.24 → 95.34, `spawn.ts` 96.96 → 97.05, and no file losing
anything. `pnpm coverage` is wired into the workspace so the next person to
widen or narrow the arbitraries re-runs the comparison instead of re-arguing it.

**What breaks if reversed** (generation stays in the engine's spec): the engine
declares five parameters no resolution reads, so every consumer that mirrors its
configuration types carries them, every bounds descriptor enumerates them, and
`game-configuration` keeps owning a "tightening" of an outer range whose owner
cannot see the roster it depends on. Worse, the engine's contract stays
ambiguous in the one place a new reader looks first: it appears to require a
wall ring, a hazard proportion and a snakes-per-team count, none of which it
reads — so the hand-authored and generated boards that the corpus insists are
the same kind of input keep looking like two kinds.

### The two consumer capabilities are not collateral damage, they are the proof

A resolution input that is not recorded cannot be replayed, and one that is not
supplied cannot be simulated. So `test-sequences` records the timings per turn
and replays from them, and `visual-tester` supplies them.

The first answer counted "forcing a wall-clock value into the canonical
encoding" among this design's costs. It is the opposite: it is what keeps the
replay-check honest. `test-sequences/sequence-format#self-contained` already
promises that "every input to every turn's resolution is contained in or
derivable from the document" — a promise the timings either satisfy or falsify,
with no third option. A recording without them would be replayed against
invented values, and `replay-check`, whose entire job is to detect divergence,
would become the thing manufacturing it.

`visual-tester` needs no invented clock states, which was the other alleged
cost. It needs one configurable number: a default duration used for the turn's
length and for every team's burn, with per-advance overrides for the cases a
tester cares about. 500 ms is a shipped default and deliberately not a spec'd
constant — nothing depends on the value, only on there being one. The overrides
are also what makes the timed endings reachable in the tool at all: a large burn
on one advance runs a team's clock down, so no clock-editing surface has to be
added to the board editor to exercise the new rules. And `session-history` keeps
each turn's timings because the tool's own guarantee is that scrubbing changes
nothing: re-simulating a scrubbed-to turn against the *current* default would
silently produce a different outcome for an untouched turn — exactly the class of
phantom discrepancy the tool exists to expose.

**What breaks if reversed** (timings left out of the recorded format): every
committed fixture becomes unreplayable the moment a clock matters, and the
failure presents as a resolver bug in the replay-check rather than as the missing
field it is.

## Constraint-mining

Per `config.yaml`'s design rules, each decision was checked for an invariant a
future implementer could silently violate.

- The standing score and the hazard event both rest on
  `one-shared-engine#no-parallel-implementation`, which is already folded.
  Restating it as a new invariant would be the DRY problem.
- The participant/present separation, the failure fence, and holding's semantics
  constrain *this capability's own* implementation, so they fail prong (a) of
  gi's admission test — they bind one capability, not two — and belong in
  requirement text, where they are.
- The lockstep invariant on a game state is a property of the data structure
  this capability owns, and is stated in `domain-vocabulary` rather than as a
  cross-runtime invariant, even though every runtime must maintain it: the
  obligation follows from consuming the type.
- The duration limit's decision rests on an invariant a future implementer could
  silently violate — that a game always has a finite maximum duration — and that
  invariant is minted outside this change as
  `game-configuration/bounded-game-duration` (no configuration may lack both
  limits), because a configuration is validated where it is written. It does not
  belong in `global-invariants`: it binds one capability's validation, failing
  prong (a) of gi's admission test. What this change owes is the *evaluation*,
  and that is not a separate invariant — it is `game-end-conditions` itself.
- Time-as-a-declared-input **is** an invariant a future implementer could
  silently violate, and the way to violate it is the obvious convenience: read
  the host clock inside the resolver instead of using the value passed in. The
  code compiles, the tests mostly pass, and determinism is gone. It is minted as
  `determinism#time-is-an-input-not-a-reading` — inside the requirement that
  already owns "the outcome is a function of these inputs" rather than as a new
  requirement, since a second requirement saying the same thing is the DRY
  problem. `runtime-portability#no-ambient-nondeterminism` is the same invariant
  seen from the portability side and already existed; it gains the timings in its
  enumeration so it cannot be read as "the engine never needs time".
- One-channel-for-time is likewise silently violable — a runtime that keeps
  applying `applyTurnStart` between turns *and* passes burns to the resolution
  produces two writers of one budget — and is minted as
  `chess-timer#only-a-resolution-moves-a-budget`. Its counterpart obligation on
  the runtime side (measure and supply, never decide) is
  `game-runtime/turn-timing-measurement`, where the measuring happens.
- Charging time only when the turn advances is minted as
  `turn-resolution-model#a-turn-nobody-took-charges-nothing`, because the
  implementation that charges unconditionally passes every test that does not
  hold every snake, and then a deep search burns a team's clock down for free.

- The board-generation move mints nothing in `global-invariants`, and that is a
  deliberate gap worth naming. `one-shared-engine#no-parallel-implementation`
  binds "domain types or turn-resolution algorithm" and never named generation,
  so once generation is not the engine there is no invariant forbidding a second
  implementation of it. `game-configuration/generation-parameter-boundary` now
  carries "exactly one home and one implementation" in its own prose, which is
  sufficient while generation has one consumer — but the right long-term home is
  a `global-invariants` requirement, and that belongs to a change that may amend
  `global-invariants`, which this one may not.
- The ordering inside the clock commit — burn, bank, judge exhaustion, *then*
  increment — is silently violable in the classic way: the wrong order compiles,
  passes every test that does not deliberately drain a budget, and makes the
  rule unreachable in every configuration with a positive increment. It is
  minted as `chess-timer#the-increment-is-not-a-floor`, inside the requirement
  that owns the arithmetic rather than as a new one.

Five invariants minted, all inside requirements this change already amends.

## Risks / Trade-offs

- **The engine is the most-consumed package in the repo.** Adding fields to the
  game-state types reaches four runtimes plus committed fixtures. The rule
  changes are additive — no existing outcome changes for a lockstep board with
  nothing held — which keeps the blast radius to new surface rather than altered
  results, and makes "imagine with nothing held is exactly the old resolution" a
  testable property.
- **The migration lands before the engine-schema drift guard exists.**
  `game-configuration/engine-schema-fidelity` mints a build-breaking mirror
  check that is not built yet, so nothing structurally catches a runtime whose
  mirror of the state shape was not updated. The `test-sequences` schema is a
  strict object and its fixtures are committed, so that one fails loudly; the
  Convex and SpacetimeDB mirrors do not exist yet, which is the reason this is
  survivable rather than the reason it is safe.
- **A new event kind is a fixture migration.** Hazard-damage rows appear in any
  fixture whose snake survives a hazard cell.
- **The calling convention changes, so this is no longer only an engine change.**
  Two required parameters on both entry points reach every caller, and two
  consumer capabilities gain deltas to record and supply them. That is the cost
  of the reversal, paid once, and it is visible rather than deferred: the recorded
  format's schema version increments in the same pass as the hazard event and
  the state-shape fields, and a version-1 document is rejected rather than
  migrated — it is missing inputs its turns were resolved from.
- **Nothing forces a truthful measurement.** The engine believes whatever burn it
  is told, so a runtime that supplied a constant would produce a game whose
  clocks are fiction, and every check in the engine would still pass. That is
  irreducible — a value the engine cannot observe is a value it must trust — and
  it is why the obligation is stated on the measuring side
  (`game-runtime/turn-timing-measurement`) rather than hoped for here.
- **The engine now decides an ending that depends on values the record must
  carry.** Committed state does explain the ending (the consumed duration is in
  it), so this is strictly better than the rejected shape, where the ending was
  unrecomputable. The residual risk is a runtime that records the outcome but not
  the timings that produced it, which the record's own sufficiency requirement is
  what catches.
- **The move is packaged across two change folders and reviewed as one.** The
  removal half is here and the ADDED half is in `migrate-game-configuration`,
  because a delta for a capability with no `specs/` entry must open with a
  `## Purpose` preamble and a preamble means *mint* — a second folder carrying
  `game-configuration` requirements would be a second mint of one capability.
  The residual risk is ordinary review risk: the two halves must land together
  or `specs/` momentarily loses seven requirements. The reference lint's
  overlay resolves both capabilities' identifiers while both changes are open,
  and `pnpm spec:audit` fails the moment a legacy home stops resolving, so the
  failure is loud rather than silent.
- **Seven frozen identifiers change capability, and that is the one-way door.**
  Slugs are frozen API; a cross-capability move is recorded permanently in
  `identifier-lineage.json` and in every archived change that cites the old
  name. Reversing means a second rename pair and a second lineage entry, and
  the history keeps both. It is cheap in effort and expensive in legibility,
  which is the argument for doing it once and now rather than later.
- **The engine's property suite loses its source of initial states**, and the
  replacement's adequacy is not self-evident. Drawn states are harsher than
  generated ones in every dimension that was checked, but "harsher" is a
  judgement about the dimensions someone thought of. The branch-coverage
  baseline bounds it — reach on the pre-existing resolver did not fall — and
  `pnpm coverage` is committed so the next person to widen or narrow the
  arbitraries can re-run the same comparison rather than re-argue it.
- **A new package is a new place for the boundary to blur.** `game-configuration`
  now holds the generator and the parameter vocabulary, and the pull will be to
  put the next not-quite-engine thing there too. The test is the one the
  requirements state: if a turn's resolution reads it, it is the engine's. The
  engine's own suite asserts the negative half — that its configuration
  declares no board-building parameter and exports no generator — so the drift
  fails a test rather than passing review.
- **A revision can invalidate work a caller has already done.** Supplying a held
  move rewrites the board from before that turn, so anything a search computed
  against the pre-revision board — scores, a partial tree, a recorded line — may
  describe a game that no longer happened. The reported discontinuities bound
  it, but they are a report rather than a guard: a caller that ignores them is
  reading a board it did not compute. The alternative was refusing revisions
  that change a fate, which refuses them exactly when they matter.
- **The rewind log is state that exists only while a hold does.** It is carried
  on the partial state and absent from every lockstep one, so no runtime
  persists it and no schema version moves — but that is an invariant held by
  construction rather than by a type, and a future entry point that produced a
  partial state without recording what it was asked would break replay silently.
  The log's presence is tied to the projections it explains, which is the
  cheapest place to notice the drift.
- **Two entry points is a surface a caller can misuse.** Nothing stops a
  mainline caller reaching for the hypothetical resolver and skipping spawning.
  The narrowing back to a game state is the guard: only a lockstep result
  narrows, so a caller that holds anything cannot obtain the type the runtimes
  persist.
