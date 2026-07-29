# revise-game-engine-contract — Tasks

The engine's contract changes in four independent directions at once — what a
turn is (two grains), how it is entered (two entry points), what it is told
(declared timings), and what it no longer owns (generation). Sections 1–6 land
them inside `packages/engine/`, section 7 covers the suites, and sections 8–10
carry the calling-convention change out to every consumer. Section 12 moves the
board-generation *code* out of the engine package, landing the half of
`migrate-game-configuration` this change creates the need for.

## 1. The turn, at two grains

- [x] 1.1 `SnakeState` gains a non-optional `turn` (`game-engine/domain-vocabulary`) — the turn this snake has advanced to. Not optional: an "absent means fresh" encoding defeats the invariant and pushes an `undefined` case into every heuristic author's analysis
- [x] 1.2 `PartialGameState` becomes the base state shape and `GameState` a branded narrowing of it, so a state with a lagging snake is not assignable where the persisted form is required (`game-engine/domain-vocabulary#lockstep-is-the-game-state-invariant`). Export `currentTurn` (the greatest turn any snake has reached — derived, never stored, which is what makes holding everything a no-op rather than a special case) and the narrowing `narrowToGameState` / `asGameState`
- [x] 1.3 `GameState` gains `consumedDurationMs` — the wall-clock duration the game has consumed, committed state like the clocks beside it (`game-engine/chess-timer`)
- [x] 1.4 Drop `turnNumber` from the resolver's parameter list: the turn being resolved is the state's own (`game-engine/turn-resolution-model`). Callers still derive the turn seed from it, so nothing loses access to the number

## 2. Two entry points over one stage list

- [x] 2.1 Factor direction resolution out of `buildTurnContext` so stages 1–5 are reached identically by both entry points: staged move → `lastDirection` → seeded turn-0 pick belongs to advancing a turn, and imagining moves applies no fallback at all (`game-engine/movement#fallback-belongs-to-advancing-a-turn`)
- [x] 2.2 `imagineMoves(state, directions, held, timings, config, turnSeed?)` over a partial state, returning a partial state with its events, or a failure — never a partial answer beside one (`game-engine/turn-resolution-model`, `game-engine/hypothetical-resolution-failure`)
- [x] 2.3 `advanceTurn(state, stagedMoves, turnSeed, timings, config)` over a game state: resolve every alive snake's direction by the movement rules, imagine exactly those moves with nothing held, and narrow the result (`game-engine/turn-resolution-model#advancing-is-imagining-with-nothing-held`). Rename from `resolveTurn`, whose name no longer distinguishes it from the other entry point
- [x] 2.4 Gate item spawning and the win check on the state alone — every alive snake at the state's current turn — rather than on which entry point was called or on whether a seed was supplied (`game-engine/turn-resolution-model#spawning-and-outcome-need-lockstep`)
- [x] 2.5 The failure fence, in four families: an alive snake with neither a direction nor a hold; a projection asked to move; a running stage without the turn seed it needs, which names no snake because it is about the resolution; and impossible input — a direction for a held snake, a held snake that is not alive, a projection named as held, timings that are not non-negative lengths of time, a structurally invalid state (`game-engine/hypothetical-resolution-failure`, `#a-running-stage-needs-its-seed`)
- [x] 2.6 Holding every alive snake succeeds and returns the state unchanged, with no special case in the code: nothing advanced, so the current turn did not move either (`game-engine/hypothetical-resolution-failure#holding-everything-is-a-no-op-not-a-failure`)

## 3. Held snakes

- [x] 3.1 Split participant from present in the turn context: move projections, head-to-head precedence, the health tick and health resolution iterate participants; occupancy and the rules that read the board see every alive snake (`game-engine/held-snakes`)
- [x] 3.2 A held snake CRYSTALLIZES into a frozen record and a headless PROJECTION, and the projection is what stands on the board: every cell it occupies is a non-head segment, so the collision rule reaches it with no case of its own and no encounter is left in which the higher invulnerability level dies to the lower (`game-engine/held-snakes#a-projection-has-no-head`). Severing stays scoped to non-head segments, which `game-engine/collisions-and-severing` already says and this change does not touch
- [x] 3.3 A projection's final segment does not vacate and its health is its team maximum — both conservative on the same unmodelled fact, that a snake nobody simulated might have reached food (`game-engine/held-snakes#a-projected-tail-is-impassable`, `#a-projection-cannot-be-starved-by-a-hold`)
- [x] 3.4 What reaches a projection: potion effects expire against the state's current turn, teammate collections and their affected-teammate list are unchanged, severs and disruptions from other snakes' actions apply, its team's clock still kills it. What reaches the historic record: nothing at all (`game-engine/held-snakes#a-projection-carries-its-own-effects`, `#a-hold-does-not-shield-the-snake`, `#a-held-snakes-team-still-spends-its-time`)

- [x] 3.5 A sever reaching a projection's first segment leaves it standing in nothing while alive — an empty segment list rather than a flag, so the case needs no representation of its own (`game-engine/held-snakes#a-severed-projection-locates-nothing`)

## 4. Declared timings and the clock commit

- [x] 4.1 `TurnTimings` — the turn's duration and each team's burn, required by both entry points and the sole channel by which elapsed time reaches committed state (`game-engine/turn-resolution-model#time-enters-a-turn-once`). The two quantities stay distinct because a team that declared early burned less than the turn lasted
- [x] 4.2 Move the clock arithmetic from the `clock.ts` helpers a runtime called between turns into the commit stage, in the stated order: spend the declared burn from the per-turn clock, bank the remainder, judge exhaustion, then increment and carve for the next turn (`game-engine/chess-timer`). The order is what makes zero reachable under a positive per-turn mint
- [x] 4.3 `initialClock` absorbs turn 0's carve-out (the `firstTurnTime` cap), since every later carve now happens inside a resolution; withdraw `applyTurnStart` and `declareTurnOver` from the package's surface so no second writer of a budget exists (`game-engine/chess-timer#only-a-resolution-moves-a-budget`)
- [x] 4.4 `clock_exhaustion` joins the death-cause set: a competing team left with no remaining time at all loses every snake still alive at that commit — a cause of death, not an ending (`game-engine/chess-timer#exhaustion-kills-the-teams-snakes`)
- [x] 4.5 Advance the game's consumed duration by the turn's declared duration at that same commit, and charge nothing at all when the state's current turn does not advance (`game-engine/turn-resolution-model#a-turn-nobody-took-charges-nothing`) — a burn is spent whether or not a search chose to model the team's snakes (`game-engine/held-snakes#a-held-snakes-team-still-spends-its-time`)

## 5. The timed ending, scoring, and events

- [x] 5.1 The duration limit joins the end conditions, evaluated against committed state at the same commit as every other; where an elimination is present at that commit the elimination is the ending (`game-engine/game-end-conditions`)
- [x] 5.2 Expose the standing score at any turn — the same formula the final score is built on, so a mid-game figure and the figure the game is decided by are never two calculations (`game-engine/scoring#standing-score-at-any-turn`). No timed adjustment is added: a team that ran out of time is scored as any other team whose snakes died, and the duration limit faults nobody
- [x] 5.3 A hazard-damage event for a snake that survives the turn, carrying the snake, the damage applied and the cell; a snake the damage kills keeps reporting through its death event (`game-engine/turn-events#hazard-damage-is-announced`). Place it in the canonical event-class order

## 6. Configuration and the generation boundary

- [x] 6.1 `maxGameDurationMs` joins the gameplay configuration subtree with its range, default and disable sentinel, declared once so every surface and every runtime reads one declaration (`game-engine/configuration-parameters`)
- [x] 6.2 Retarget the citations on board generation — `boardgen.ts`, `perlin.ts`, the generation configuration type, the generation-failure type and their suites — onto the `game-configuration/*` identifiers that now own them, and move the code with them (§12)

## 7. The engine's suites

- [x] 7.1 Carry the shared harness (`testkit.ts`) across the new shape: snakes at a turn, states that narrow, and default timings that leave a clockless test state exactly as it is today
- [x] 7.2 The additive-change property: imagining moves with nothing held over a lockstep state is exactly the old resolution — same next state, same events, same outcome — which is what keeps the blast radius to new surface rather than altered results
- [x] 7.3 Held-snake behaviour: head and tail impassable, no head-to-head with a stationary head, no tick and no health resolution, effects expiring on schedule, teammate buffs arriving, severs landing
- [x] 7.4 The failure fence, case by case, including that holding everything succeeds unchanged
- [x] 7.5 The clock commit: the carve-out invariant across a resolution, a team driven to zero on one turn under a positive increment, exhaustion killing a team's snakes with the game continuing where a third team is still playing, and a held snake dying with the rest of its team
- [x] 7.6 The duration limit as an ending, the elimination tie-break at one commit, and the standing score agreeing with the final score's formula
- [x] 7.7 The hazard-damage event, present on survival and absent on death

## 8. Recording the timings

- [x] 8.1 The recorded turn carries its declared timings among its inputs, beside its staged moves rather than beside its outputs (`test-sequences/sequence-format#timings-are-inputs-not-metadata`); the state encoding carries the per-snake turn and the game's consumed duration. Increment the schema version — a document that predates the timings cannot be replayed, only rejected
- [x] 8.2 Validation requires a burn for exactly the teams present in that turn's pre-state, naming the turn and the team on either failure (`test-sequences/validation#a-turn-declares-every-teams-burn`), and rejects a state whose alive snakes are not in lockstep
- [x] 8.3 The replay-check resolves each turn from the timings the recording holds, so a replay on a slower machine computes the same clocks, the same consumed duration and the same ending (`test-sequences/replay-check#recorded-time-is-replayed-not-remeasured`)

## 9. Supplying the timings

- [x] 9.1 A configurable default turn duration — 500 ms out of the box — supplied as both the turn's length and every team's burn, so a tester who does not care about time never performs a step (`visual-tester/turn-simulation#a-default-that-needs-no-attention`)
- [x] 9.2 Per-advance overrides for duration and per-team burn, which is what makes the timed endings reachable in the tool without a clock-editing surface (`visual-tester/turn-simulation#per-advance-values-reach-the-timed-endings`)
- [x] 9.3 The session keeps each turn's timings, and re-simulating a scrubbed-to turn re-supplies the ones that turn recorded rather than the current default (`visual-tester/session-history#a-re-simulated-turn-reuses-its-timings`); a saved fixture records them among its inputs (`visual-tester/sequence-management#save-from-session`)
- [x] 9.4 The editor's parity rule drops its declared dependency on the departing starting-placement requirement: it rests on movement preserving parity every turn, not on how the first parity was chosen (`visual-tester/board-editor#head-parity-enforced`)

- [ ] 9.5 The sequence listing marks what this build cannot read, naming the version that wrote it, with load and run unavailable and copy still offered — the affordance a version rejection needs to be usable rather than merely correct (`visual-tester/sequence-management#unreadable-sequences-are-listed-not-hidden`)

## 10. The rest of the workspace

- [x] 10.1 Update every other call site and mirror of the engine's state and entry points — `packages/stdb/`, `packages/centaur-server-lib/`, the benchmark — to the new shape
- [x] 10.2 Refresh the agent context that names the old surface (`packages/engine/AGENTS.md`, `README.md`, `DECISIONS.md`, root `AGENTS.md`'s package map) so a future session reads the contract that exists

## 11. Verification

- [x] 11.1 `pnpm spec:check` (validation, reference lint, seed freshness, graph, audits), `pnpm typecheck`, `pnpm lint`, `pnpm test` all clean
- [x] 11.2 Add or update `// spec:` citations for every non-trivial decision this change lands, and `// design:` references where the archived rationale is what a future reader needs (finalize the archive folder name at archive time)

## 12. Board generation leaves `packages/engine/`

The requirements move in this change, and the code moves with them. Leaving it
behind would have meant `boardgen.ts` citing `game-configuration/*` from inside
the engine package — correct (a capability does not own a section of code), odd
to read, and a standing invitation to "fix" the citations back.

- [x] 12.1 `boardgen.ts`, `perlin.ts` and their three suites move to
  `@cyphid/snek-game-configuration`, behaviour untouched, along with the
  generation configuration type and `BoardGenerationFailure`. Planned as
  §1 of that change, which this section discharges
- [x] 12.2 The blocker was `resolve-properties.test.ts`, which built every
  initial state by *calling* generation across the full documented parameter
  ranges — impossible once generation lives downstream. It now draws states
  from arbitraries **deliberately harsher than generation**: interior walls,
  boards with no wall ring, disconnected hazard fields, bodies of length 1-5
  stacked or walked, mixed head parities, snakes on hazards, clocks near
  exhaustion. A fuzzer for the rules of a turn should explore harder than the
  thing that produces the game's boards, not re-run it
- [x] 12.3 What the replacement deliberately keeps: contiguous, disjoint snake
  bodies and items off alive bodies. Those are shapes the movement rules
  themselves can only produce, so a state violating them is not a harder case,
  it is a different game
- [x] 12.4 The risk being managed is that the loss would be **silent**: a
  narrower source of states passes the entire suite, and a green run is not
  evidence. So the branch coverage of `packages/engine/src/resolve/` was
  recorded on both sides of the swap alone, before the contract revision could
  confound it (`pnpm coverage`, wired into the workspace with the v8 provider so
  the comparison can be re-run rather than re-argued). The drawn states reach
  **strictly more** than generated boards did: aggregate branch coverage 95.65 →
  96.48, with `claims.ts` 90.24 → 95.34 and `spawn.ts` 96.96 → 97.05 and no file
  losing anything. What the contract revision then adds — the failure fence's
  defensive branches, the lockstep gating, the duration limit — moves the
  aggregate to 93.49, and separating the two measurements is what makes that
  second movement attributable rather than alarming

## 13. Advancing a historic snake

- [ ] 13.1 A partial state carries what each of its resolutions was asked — directions, holds, timings, turn seed — over the board as it stood before the oldest still-standing projection was held. The log exists exactly while something is projected, so the mainline never accumulates one and no runtime persists one (`game-engine/historic-advance`)
- [ ] 13.2 Supplying a projection's move at the turn it was held resolves the board again from before that turn and replays every resolution since, leaving the snake one turn less historic rather than caught up (`game-engine/historic-advance#a-learned-move-settles-the-turn-it-was-made-at`)
- [ ] 13.3 The revision may rewrite what already happened, and reports which snakes' fates it changed; the replay adapts the record to the board it produces rather than refusing (`game-engine/historic-advance#a-revision-can-rewrite-what-already-happened`, `#a-revision-adapts-the-record-it-replays`)
- [ ] 13.4 A move for a snake that is not projected is refused, and the next turn's resolution points a projection's move at the other entry point rather than merely rejecting it (`game-engine/historic-advance#only-a-projection-has-a-move-to-learn`)

## Archive

- [ ] 14.1 On explicit author instruction, at the tail of the PR that completes this implementation: `pnpm spec:fold revise-game-engine-contract` then `openspec archive --skip-specs -y revise-game-engine-contract`
