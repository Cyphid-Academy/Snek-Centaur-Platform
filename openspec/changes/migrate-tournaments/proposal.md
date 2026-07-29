## Why

Sixteenth change of the final spec-migration train. The "multi-round
competitive play" story — rounds, scheduling, forfeits, walkovers — has
no vocabulary owner today: the tournament mode lifecycle lives in module
05 (§5.10, plus the forfeit-scoring field of §5.6), while the refusal
branches that give forfeits their meaning live in module 03 (§3.3).
Its lifecycle *transitions* were re-authored by the open
migrate-game-lifecycle change as deliberately format-abstract hooks
("a competition format may override the abort", "a format may govern
that none follows", the straight-to-finished transition); nothing yet
names the format that exercises them. Re-authoring the tournament as one
capability puts the whole format in one readable place and retires 7
legacy ids.

## Carving decision

Mint **`tournaments`** exactly as drawn in the capability map and
assignment matrix (author-approved with the capability set and DAG).
The legacy requirements and review items this change absorbs are
recorded in the identifier map under this change's name; the scope also
includes the forfeit/walkover/no-contest **scoring** aspect of
03-REQ-056 (that id itself was retired by
migrate-game-lifecycle, which covers the refusal *transitions*; the
scoring and round semantics are authored here per the author routing).
Declared dependencies: **game-engine, game-lifecycle,
rooms-and-matchmaking, team-management, team-server-management,
live-game-observation, replay-and-audit, accounts-and-profiles,
global-invariants** (all nine actually cited; the list is an affordance
extended whenever a citation is genuinely warranted, never a budget
that forces a restatement). `game-engine` and `team-management` were
added by author review — the first so the forfeiter's score can be
cited instead of restated, the second so excluding an archived team from
a tournament's participant set rests on the archive semantics that make
it correct. The last three were added when the forfeit-reporting
obligation was restored: they own the presentation surfaces that
obligation reaches, and declaring them is what makes the obligation
legible at both grains instead of shrinking it to fit an undeclared
list.

Deliberate boundaries:

- **The format composes the lifecycle's abstractions; it never restates
  them.** game-lifecycle authored the abstract hooks — the launch-gate
  override for schedule-bound formats, the walkover transition in the
  status machine, the "a format may govern that none follows" arm of
  successor auto-creation. This capability is their one concrete
  instance: tournaments/scheduled-start-override,
  tournaments/walkover-and-no-contest, and
  tournaments/round-scheduling#nothing-after-the-final-round cite those
  hooks rather than re-deriving any transition or gate.
- **The engine owns what a forfeiter scores; this capability owns the
  marking.** A forfeit's *score* is not a tournament concept —
  game-engine/scoring already defines the exclusion and the zero — so
  this capability cites it rather than restating it, and states only
  what is genuinely its own: that a team which does not take its seat is
  marked as a forfeiter on the game record, that the marking — never the
  value — is the discriminator, and that the marking is reported *as a
  forfeit* everywhere a round's result is shown. That last part is a
  requirement this capability imposes on presentation surfaces three
  sibling capabilities primarily own, which is legitimate and
  deliberate: a capability is not a section of code, and the surface
  owners must not restate a rule whose concept they do not define. The
  walkover's par (1.0) is likewise
  stated *and* sourced: cited to the engine's scoring rule for where the
  number comes from, and to global-invariants/one-shared-engine for why
  there can only be one place it comes from.
- **The tournament is created, not stumbled into.** A tournament is a
  distinctly created object carrying the three meta-parameters
  (round count, interlude, scheduled start) that had no configuration
  home anywhere in the corpus — game configuration's vocabulary being
  closed to exactly the engine's parameters — and it creates the rooms
  its contests are played in rather than attaching to somebody else's.
  Its object model is tournament → round → match → room → game; this
  format produces one match per round and one game per match, and the
  records are required to carry the full structure so parallel matches
  need no reshaping.
- **The roster-freeze extension composes without a cross-DAG citation.**
  team-management is not a declared dependency of this capability. Its freeze was
  deliberately phrased as holdable longer "by enclosing competitive
  engagements"; tournaments/tournament-roster-freeze is authored as this
  capability's own requirement — the tournament *is* such an enclosing
  engagement — so the two compose by construction, with no cross-DAG
  reference. The requirement does cite global-invariants for what its
  soundness rests on: a freeze is only a freeze if its guard runs inside
  the transaction of the mutation it rejects
  (global-invariants/transactional-invariant-enforcement).
- **Every round bypasses the room gate, the first one included.**
  No game of a tournament is user-initiated: the room's readiness gate
  governs manual starts and exempts a schedule-bound format's, and this
  capability states positively that the platform alone starts every
  round. The deliberate absence of a readiness check is authored
  explicitly (#no-ready-check-between-rounds), not left for an
  implementer to infer.
- **The event's own failure modes are authored, not left as gaps.** A
  team's absence forfeits a seat; the platform's own inability to launch
  a round stalls the tournament gracefully and leaves its outcome
  indeterminate. Both are requirements here rather than the space
  between two others.

## What Changes

- **New capability `tournaments`** (mint delta, ADDED-only, 11
  requirements): the creation act and its three required, ranged
  meta-parameters, creating the tournament together with the rooms of
  its opening contests; the round → match → room → game structure (every
  game a full game on a fresh instance, meta-parameters
  tournament-level, participant set fixed at the start and excluding
  archived teams, records shaped for parallel matches); config
  inheritance from a base captured at the start, minus the
  meta-parameters; platform-sole scheduling (never before the scheduled
  start, never waiting past it, interlude chaining, no ready check,
  nothing after the final round); the concrete schedule-bound override
  of the launch gates (unhealthy ignored, refusal forfeits the seat,
  resolution bounded over what servers do); the graceful stall when the
  platform itself cannot launch a round, leaving the event
  indeterminate; forfeit marking on the record with the score cited to
  the engine and the marking required to be reported semantically as a
  forfeit on all four surfaces a round's result is shown on (the event's
  standings, a finished game's result and the listings carrying it, the
  running scoreboard in play, and the round's replay); the walkover (sole acceptor at par 1.0) and no-contest (no
  winner) resolutions; the event's running standing and its winner at
  the end; the tournament-wide roster freeze anchored to the
  tournament's own state and lifting on conclusion or halt; and the
  in-room view of where the event stands.
- **Retirements**: this change's legacy absorptions are recorded in the
  identifier map (completed with the corpus retirement in this PR); the
  migration planning artifacts are archived under
  `docs/spec-migration/`.

## Impact

- New: `openspec/changes/migrate-tournaments/specs/tournaments/spec.md`
  (folded to `openspec/specs/tournaments/spec.md` at archive).
- `openspec/config.yaml` context capability list gains `tournaments`
  (at archive).
- Code citations: the tournament record and chaining scheduler, the
  invitation-resolution branching, the outcome/forfeit recording, and
  the freeze check gain `// spec: tournaments/...` citations when the
  implementation lands.
- Code diffs to sibling-owned surfaces: the forfeit-reporting obligation
  is implemented as diffs to the running scoreboard, the replay viewer,
  the game-history listings, the profile histories and the leaderboard
  entries, each carrying a `// spec: tournaments/forfeit-scoring...`
  citation. No spec of the owning capabilities is amended — that would be
  the duplication the obligation exists to avoid.

## Open Questions

1. **Roster freeze: whole-event, or mutable between rounds?**
   - **Context**: the legacy sources took two passes at this and never
     converged in one place. The module-03 review that minted the
     mid-game freeze (03-REVIEW-006, retired by migrate-team-management)
     explicitly surfaced — and left **unresolved** — the sub-question:
     as written there ("in progress" = a game in `playing`), roster
     mutations would be *permitted* between tournament rounds, and the
     item flags that a whole-event freeze would need its own decision.
     The later module-05 review 05-REVIEW-003 then decided exactly that
     question — Option B, tournament-wide freeze from first-round start
     to final-round end, interludes included — and 05-REQ-064 was
     amended to match, reasoning that a tournament is one coherent
     competitive unit and inter-round member swaps would be confusing
     and strategically abusable.
   - **Question**: is the whole-event freeze (rosters frozen across
     rounds AND interludes) the confirmed intent, or should rosters be
     mutable between rounds?
   - **Options**: (A) whole-event freeze per 05-REVIEW-003 — the later,
     decided source; the delta is authored this way
     (tournaments/tournament-roster-freeze, with
     #frozen-through-the-interlude and the anchoring scenario). (B)
     per-round freeze with mutable interludes — the reading the 03
     review's unresolved sub-question would leave standing; choosing it
     would rewrite the freeze requirement to anchor on round play and
     drop both interlude scenarios.
   - The delta is authored per option A, since 05-REVIEW-003 is the
     later decided source; author confirmation is requested because the
     03 review deliberately declined to decide this and the corpus never
     reconciled the two in one place.
   - **Decision (author, 2026-07-24)**: Option A confirmed. The whole-event freeze per 05-REVIEW-003 stands as authored. Two endpoints were subsequently tightened in review: the freeze starts when the tournament *begins* rather than when its first round enters play (so a first round resolving as a no-contest cannot leave the event unfrozen), and it lifts on a halt as well as on the final round's finish (so a stalled event does not hold rosters forever).

2. **The start gate and scheduled rounds were jointly unsatisfiable.**
   - **Context**: the room's gate permitted a start only on the
     administrative actor's initiation with every enrolled team ready,
     while every round here starts on the platform's act with no
     readiness declared — and a round's game *is* the room's current
     game.
   - **Decision (author)**: non-tournament games require unanimous
     readiness; tournament games begin strictly as scheduled. The room's
     gate is re-authored as governing user-initiated starts with an
     abstract exemption for a schedule-bound competition format; this
     capability states positively that the platform alone starts every
     game of a tournament, first round included, and declares the room's
     gate as a soundness dependency of that claim.

3. **A round that fails to launch for platform reasons.**
   - **Context**: bounded resolution promised every round reaches a
     resolved state within its own start orchestration, while
     game-lifecycle/no-orphans answers a post-provisioning launch
     failure by tearing the instance down and leaving the game
     not-started. Two requirements said opposite things about the same
     event, and no recovery path was authored anywhere.
   - **Decision (author)**: it is appropriate for the tournament to
     stall on infrastructure failure. Bounded resolution is narrowed to
     the failure modes it genuinely bounds — invitation decline and
     timeout — and the stall is authored explicitly as
     tournaments/round-launch-failure: a clear error is recorded and
     surfaced, the stall is graceful, no round is skipped, and the
     tournament's outcome stays **indeterminate** because the event
     never completed. Recovery in practice is an operator repairing the
     infrastructure and creating a new tournament; there is deliberately
     no resume path.

4. **Room archival during an interlude.**
   - **Context**: archival was barred only while the room's current game
     was `playing`, which is false during every interlude — so a room
     could be archived mid-event and the remaining schedule stranded.
   - **Decision (author)**: generalised on the room side — archival is
     refused while a competition format governs the room. Nothing is
     restated here; the room story owns the bar.

5. **"All enrolled teams are not archived" at start time.**
   - **Context**: enrolment rejects an archived team but nothing
     re-checked a team archived afterwards, and no capability owned the
     legacy start precondition.
   - **Decision (author delegated; taken here)**: an archived team is
     never a participant. This capability excludes teams archived by the
     moment the tournament begins from its participant set — exclusion
     rather than forfeiture, since a forfeiter is re-invited every
     round — and the room's own gate rejects a user-initiated start
     whose enrolled set contains one. Reasoning in design.md, "An
     archived team is never a participant".

6. **Tournament meta-parameters had no configuration home.**
   - **Context**: round count, interlude and scheduled start were
     described as properties of the tournament, but nothing authored
     where they are entered, validated, or required — and game
     configuration's vocabulary is closed to exactly the engine's
     parameters.
   - **Decision (author)**: structural. A tournament is a distinctly
     created object that spawns the rooms it fully controls; each round
     contains one or more matches, each match is played in its own room
     and comprises one or more games among the same teams. Only a single
     match per round is specified for now, but the records must plan
     ahead for parallel matches. Authored as
     tournaments/tournament-creation (the act, its actor, the three
     required parameters and their ranges) with the structure reflected
     in tournaments/round-structure.

7. **No view of a tournament existed anywhere.**
   - **Context**: a competitor had no specified way to see which round
     is running, when the next one starts, or how the event stands.
   - **Decision (author)**: add a dedicated requirement for displaying
     orienting information about the state of its tournament within the
     room interface; shape delegated. Authored as
     tournaments/tournament-view — in the room rather than on a separate
     page, covering round and match identity, completed results,
     standings, and what comes next including the concluded/halted
     distinction. Defining the standing and the winner it shows required
     tournaments/event-outcome, minted alongside it (see design.md, "The
     event has a defined outcome, so the view has something to show").

8. **"A forfeiter scores 0" was double-authored, and its downstream
   obligation was unreachable.**
   - **Context**: game-engine/scoring already defines forfeit exclusion
     and the zero score, while tournaments/forfeit-scoring restated it
     and could not cite it. Separately,
     #forfeit-visible-downstream obliged ranking, leaderboard and replay
     surfaces owned by accounts-and-profiles and replay-and-audit —
     capabilities this one neither declares nor may reference.
   - **Decision (author), part one**: the forfeit outcome of a game is
     independent of tournaments. `game-engine` joins this capability's
     declared dependencies so the scoring rule is cited, and the
     restatement is removed. This half stands unchanged.
   - **Decision (author), part two — reversing an intermediate
     narrowing**: an intermediate authoring also *dropped*
     #forfeit-visible-downstream's display obligation, reasoning that a
     requirement obliging capabilities this one neither declared nor may
     reference is unenforceable, and moved a forfeit-at-zero note into
     `accounts-and-profiles/leaderboard`. The author has overruled that.
     **A capability does not exclusively own a section of code**: a
     downstream capability may impose requirements on what information
     appears in UI contexts another capability primarily owns; the owning
     capability must NOT duplicate them (that is the DRY failure); and
     implementation arrives as a diff to those contexts, citing the
     imposing requirement. Accordingly the obligation is restored and
     broadened: a forfeit is reported *semantically as a forfeit* on the
     event's own standings, in a finished game's result presentation and
     the histories and rankings listing it, on the running scoreboard
     while the game is in play, and in a replay of the round — the last
     two given their own scenarios
     (`#live-scoreboard-names-the-absence`, `#the-replay-shows-the-forfeit`)
     because they are the arms the narrowing lost. It stays inside
     `tournaments/forfeit-scoring` rather than becoming its own
     requirement, because `#forfeit-visible-downstream` is an
     identifier-map anchor under that slug and because recording the
     marking and reporting it are one behaviour (reasoning in design.md,
     "Where forfeit-scoring's boundary now sits").
     `live-game-observation`, `replay-and-audit` and
     `accounts-and-profiles` join the declared dependencies at both
     grains; acyclicity was verified before the shape was fixed — nothing
     in their transitive closure declares `tournaments` — at the cost
     that this change now folds after all three. The forfeit-at-zero
     *ranking* rule stays in `accounts-and-profiles/leaderboard` (it
     cites the engine's scoring rule and is not a copy of this display
     rule); nothing there states anything about presenting or marking
     forfeits, so nothing had to be removed, and that requirement's
     closed criteria set was clarified to close over ranking criteria and
     time windows only — not over what a ranked entry may display — so
     this obligation is satisfiable without amending it again.
