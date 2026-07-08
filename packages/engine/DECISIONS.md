# Module 01 Implementation — Decision Log

Decisions made while implementing `@cyphid/snek-engine` against `spec/01-game-rules.md` (with `spec/02-platform-architecture.md` §2.17 as the packaging contract). Ordered by weight: spec contradictions first, then gaps the spec left open, then interpretation calls, then engineering choices.

Precedence rule applied throughout (per `spec/SPEC-INSTRUCTIONS.md` Rule 5): **the Requirements section binds; the Design section illustrates.** Where the two disagreed, requirements won and the divergence is recorded here.

---

## A. Spec contradictions found (requirements override design pseudocode)

> **Status**: all three have since been corrected in the spec itself via Correction REVIEW items **01-REVIEW-019** (A1), **01-REVIEW-020** (A2), and **01-REVIEW-021** (A3, which also states the general reference-state resolution principle in 01 §2.8). The entries below record the divergence as found at implementation time; the spec and the engine now agree.

### A1. Chess timer: the per-turn clock must be carved out of the budget

§2.9's pseudocode reads `budgetMs += increment; perTurnMs = min(cap, budgetMs)` at turn start and `budgetMs += perTurnMs` on declare — with **no deduction anywhere**. Under those formulas the budget grows monotonically forever: a team that always times out still gains `increment` per turn, and the documented depletion behaviour ("when a team's budget depletes, their per-turn clock drops to the increment alone") is unreachable. 01-REQ-038's "remaining per-turn clock time is added **back** to its budget" only makes sense if the clock was taken *out* of the budget first.

**Decision**: `applyTurnStart` computes `perTurnMs = min(cap, budget + increment)` and deducts it from the budget; `declareTurnOver` credits the unused remainder back. Standard chess-clock accounting; all documented behaviours (fast teams accumulate, slow teams deplete to increment-only) now hold. `clock.ts`, verified by an accumulation test.

### A2. Phase 9a: pending effects survive collector-disruption cancellation

01-REQ-031 states explicitly: "Cancellation removes active effects only; pending effects scheduled by a Phase 6 rebuild in the same turn are not discarded... A same-turn re-collection therefore supersedes a disruption-triggered cancellation." But §2.7's cancellation narrative and §2.8's Phase 9a pseudocode both call `removePendingOfFamily` — discarding pending effects.

**Decision**: followed 01-REQ-031 (and 01-REQ-050(a), which also says active-only). 9a strips active effects only; a same-turn re-collection's rebuild applies in 9b and supersedes the cancellation. Tested directly ("lets a same-turn re-collection supersede the cancellation").

### A3. Head-to-head length comparison uses post-Phase-2 lengths, not post-sever lengths

01-REQ-044d: shorter snakes die, "(fewer body segments **after Phase 2**)". §2.8's pseudocode, however, runs 3b (severing, which truncates `victim.body`) before 3c and then reads live `s.body.length` — so a snake severed in 3b would fight the head-to-head at its reduced length, violating both the requirement's wording and Phase 3's single-reference-state doctrine (01-REVIEW-002).

**Decision**: snapshot lengths at Phase 3 entry (`snapLength`) and use those in 3c. Consistent with the resolved simultaneity model.

---

## B. Spec gaps (no route existed; a signature had to change)

### B1. `resolveTurn` needs the runtime config — added a fifth parameter

The drafted signature (§3.8) is `resolveTurn(state, stagedMoves, turnNumber, turnSeed)`, and `GameState` is fixed to `{board, snakes, items, clocks}` by DOWNSTREAM IMPACT note 8 — yet Phases 5/7/8/10 consume `maxHealth`, `hazardDamage`, the three spawn rates, and `maxTurns`. The design pseudocode references `config` freely without ever receiving it.

**Decision**: `resolveTurn(state, stagedMoves, turnNumber, turnSeed, config: GameRuntimeConfig)`. Chosen over stuffing config into `GameState` to keep the exported aggregate purely dynamic (note 8) and because module 04 holds the static config separately and can pass it trivially.

### B2. `generateBoardAndInitialState` takes the full `GameConfig`

The drafted signature takes `GameOrchestrationConfig` only, but snake initialization (§2.6, 01-REQ-021) sets `health = config.maxHealth`, which lives in the **runtime** half. The Convex caller holds the full config at provisioning time (02 §2.14), so passing `GameConfig` costs nothing.

---

## C. Ambiguities resolved by interpretation

### C1. Potions are NOT fertile-restricted

01-REQ-049 says potions use "the same probabilistic mechanism and eligible-cell criteria as food", which read literally would include 01-REQ-048's fertile restriction. Three signals point the other way: the README scopes fertile cells to food only ("the only eligible spawn sites for **food**"); §2.8's pseudocode uses a distinct `eligiblePotionCells()` while only `eligibleFoodCells()` carries the fertile note; and §3.9's invariant list scopes the fertile predicate to "Phase 7 food eligibility". **Decision**: "same criteria" refers to the base list (inner, non-Wall, non-Hazard, unoccupied); potions spawn anywhere eligible. Tested with a board whose only fertile cell is blocked: food cannot spawn, potions can. *Flagging for spec review — 01-REQ-049 could use one clarifying clause.*

### C2. One death event per snake, first cause wins

Overlapping collision classes (a head can simultaneously hit a wall cell shared with another head, or self-collide while body-colliding) could produce multiple deaths for one snake. The engine records the first applicable cause in 3a→3b→3c order, emits exactly one `snake_died` per snake, and records one death disruption (cancellation scope is unaffected: it derives from the disrupted snake's debuff families, not the disruption count).

### C3. Phase-5 death cause attribution (`hazard` vs `starvation`)

01-REQ-046d calls every Phase-5 death "starvation", but `DeathCause` includes `hazard`. **Decision**: a Phase-5 death is reported as `hazard` if the snake entered a hazard cell this turn, else `starvation`. (Both are the same disruption class, so cancellation semantics are unaffected.)

### C4. `killerSnakeId` semantics

Body collision → the victim (body owner). Head-to-head → the unique survivor of that cell's contest, else `null`. Wall/self/starvation/hazard → `null`.

### C5. Multiple simultaneous severs of one victim

All attacker-victim pairs are evaluated against the Phase-3 snapshot; each successful sever emits its own `snake_severed` event (with per-pair `segmentsLost` measured on the snapshot), and the victim's final body is truncated at the **minimum** contact index. Contact index = the first (head-closest) matching segment, relevant when stacked segments share a cell.

### C6. Spawn-eligibility occupancy counts alive snakes only

Dead snakes' bodies remain in state as a record but do not block food/potion spawns (01-REQ-048 "occupied by a snake" read as a live snake). Consumed items likewise stay in `items` (with `consumed: true`) as the identity record for events/replays; new item ids continue from `max(existing) + 1`.

### C7. Event ordering within a phase

01-REQ-052 orders "by ascending snakeId" within a phase; several kinds carry two snake ids or none. Primary-subject rule: `snake_moved`/`snake_died`/`food_eaten`/`potion_collected`/effect events → their `snakeId`; `snake_severed` → the victim; spawn events → item-id order. Stable insertion order (itself deterministic) breaks ties, which keeps a `replaced` cancellation immediately before its `effect_applied` on the same snake.

### C8. `potion_collected.affectedTeammateIds` excludes the collector

The collector is the event's subject; "affected teammates" are the other alive members receiving rebuild entries (including any co-collectors that turn).

### C9. Forfeits are handled upstream

`GameState` carries no forfeit flag, so the engine treats every team present in `state.snakes` as competing (01-REQ-053a's exclusions are module 04/05's job before/around calling `resolveTurn`). "Alive at start of turn" for simultaneous-elimination scoring (01-REQ-055) is captured at `resolveTurn` entry — equivalent to the prior-turn scoreboard the spec mentions, with no external storage needed.

### C10. Phase-1 fallback details

The turn-seeded RNG for turn-0 random directions is consumed in ascending-snakeId order (reproducibility). The random pick is over all four directions, unconstrained by lethality, per 01-REQ-042.

---

## D. Engineering decisions

### D1. `const enum` → `as const` object + literal-union type

The spec drafts `export const enum Direction {...}`. This workspace compiles with `isolatedModules` + `verbatimModuleSyntax`, and the engine is consumed by esbuild/Vite (per-file transpilers that cannot inline cross-module const enums). The `as const` object pattern preserves the spec's exact numeric values, is fully erasable, and keeps `Direction.Up` ergonomics.

### D2. BLAKE3 via `@noble/hashes` (new dependency)

Module 01 mandates BLAKE3 keyed hashing for `subSeed` (DOWNSTREAM IMPACT note 4 makes it a hard cross-runtime dependency). `@noble/hashes` is pure ECMAScript (no Node/browser APIs), audited, and works in all three consumer runtimes. This is the package's only runtime dependency.

### D3. Xoshiro256++ over BigInt lanes

256-bit state maps 1:1 to the 32-byte seed as four little-endian u64s. BigInt arithmetic is ~10× slower than a 32-bit-lane implementation but RNG draws are far off the hot path (a handful per turn); clarity and provable correspondence to the reference algorithm won. The all-zero state (Xoshiro's fixed point) is guarded with golden-ratio constants — unreachable via BLAKE3-derived seeds, but cheap insurance. `nextIntExclusive` uses `floor(nextFloat() * max)`; the modulo-free float path has negligible bias at game-scale ranges and keeps the draw count per call fixed at one.

### D4. Perlin noise: classic 8-gradient, √2-normalised, one seeded stream

Improved-Perlin fade with 8 gradient directions; output divided by √2 to bound to [-1, 1] (only the score *ranking* matters downstream, so uniform scaling is harmless). The `"fertile"` sub-seed drives a single RNG stream: field offset (dx, dy) drawn first, then the permutation-table shuffle — the draw order is part of the reproducibility contract.

### D5. Exports beyond the minimal contract

`initialClock`/`applyTurnStart`/`declareTurnOver` (so module 04 reducers apply the exact §2.9 formulas rather than re-deriving them), `isValidMove` (02-REQ-037 pre-validation; returns false only for *certainly* fatal moves — wall entry or guaranteed self-collision honouring tail movement and pending growth; other snakes' simultaneous moves are unknowable at staging time), `DEFAULT_GAME_CONFIG` (canonical 01-REQ-063..077 defaults), and board helpers (`cellIndex`, `isInner`, `parityOf`, `advance`, `cellAt`). Per §3's contract note, non-listed exports are conveniences, not versioned contract surface.

### D6. Range validation is not the engine's job

01-REQ-063 (and 01-REVIEW-018) place range enforcement on user-facing surfaces (module 05 mutations, module 08 widgets). The engine accepts any structurally valid config; tests exploit this (e.g. spawn rate 1.0 for potions to force deterministic spawns).

### D7. Purity and cloning

`resolveTurn` never mutates its inputs: snakes/items are cloned into internal mutable working types, the board and clocks pass through by reference (both immutable within a turn — the chess timer is module 04's between-turns concern). Verified by a snapshot-equality test.

### D8. ID assignment

`snakeId = teamIndex × snakesPerTeam + letterIndex` (globally unique, team-major, matches letter order); initial food items are ids 0..N-1. Both are engine-internal conventions — downstream modules must treat ids as opaque.

---

## F. Post-implementation redesign — staged parallel-rule model (01-REVIEW-022)

After the initial implementation shipped, the turn-resolution model was redesigned by human direction (recorded as Amendment **01-REVIEW-022**, with cascades 02-REVIEW-009 and 04-REVIEW-024): turn resolution is now **snapshot → move projection → head-to-head precedence → parallel interaction rules (claims) → derived rules → deterministic commit**. Consequences for this package:

- `SnakeState` lost `ateLastTurn` and `pendingEffects`; growth is a duplicated tail segment committed on the eating turn.
- Head-to-head resolution runs first and withdraws losing heads from the set every other rule consumes — items are collected by the unique winning entrant or nobody.
- Death by any non-head-to-head cause no longer blocks item collection (sacrificial collection); a collector killed in its collection turn leaves an undisruptable corpse debuff and the team keeps its buffs.
- Health resolves from parallel damage claims and a dominant heal claim; `starvation`/`hazard` death causes merged into `health_depletion` + `sources`.
- `snake_moved` lost `grew`; canonical event ordering is event-class-major.

This supersedes interpretations **C2** (death-cause precedence — now specified in 01 §2.11), **C3** (hazard-vs-starvation attribution — replaced by `health_depletion` + sources), and **C7** (event ordering — now specified class-major in 01 §2.11). The remaining sections below describe the original implementation pass and stand as history.

## E. Observations for the spec authors (no action taken)

1. **Hazard 30% is frequently infeasible.** Uniform hazard placement at 25–30% density sits near the site-percolation threshold on mid-size boards: on a 13-board at 30%, roughly half of game seeds exhaust all four attempts on `HAZARD_CONNECTIVITY` (measured: 11/20 seeds succeed; 15-board: 3/20). The bounded-retry design absorbs this, but the room-owner UX at the top of the 0–30 range will be "provisioning failed" often enough to notice. A connectivity-aware placement algorithm (e.g. carve from a spanning structure) or a tighter range cap may be worth a REVIEW item.
2. **01-REQ-049 wording** ("same eligible-cell criteria as food") vs. the fertile restriction — see C1.
3. ~~**§2.9 and §2.7/§2.8 pseudocode** should be updated to match A1/A2/A3 if these resolutions are accepted.~~ *Done — corrected via 01-REVIEW-019/020/021.*
4. **The `teams[].name` parameter** of `generateBoardAndInitialState` is unused by module 01 (display names are derived downstream per 01-REQ-018); kept for signature stability.

---

## G2. Architecture refactor — rules reified, claims canonicalised

A dedicated refactor pass (behaviour-preserving, gated on the full suite) restructured the resolver to make the 01 §2.8 model literal in code: `src/resolve/{work,claims,context,rules,events,commit,spawn,win,index}.ts`, with the seven interaction rules as named pure functions in an `INTERACTION_RULES` array, `TurnContext` carrying per-snake move projections (replacing four parallel maps and ~30 casts), `ClaimSet` as the typed claim vocabulary, and the commit as the sole writer. `WorkSnake` is derived from `SnakeState` via a mapped type so new fields flow through automatically. Board generation was likewise split into named stage functions. Test helpers were consolidated into `testkit.ts`.

Two new property suites guard the architecture: a rule-order-shuffle test that replays whole fuzzed games under permuted rule orders and asserts identical event streams (machine-checking 01-REQ-041's order-independence), and a multi-turn invariant fuzzer (≤1 effect per family, effect windows, alive-head uniqueness, health bounds, canonical event ordering, item-id uniqueness, no consumed-item resurrection). Writing the shuffle test immediately caught two real order-dependence leaks the example tests missed — `snake_died.sources` reported in damage-claim insertion order, and cancellation pairs iterated in disruption-discovery order — both fixed by giving `ClaimSet` canonically-ordered views (`damageSources` in fixed tick→hazard order; `cancellations()` sorted by team then family). Claim collections added in the future must follow the same canonical-view discipline.

## G3. Occupancy index — seam built now, backing structure deferred to real profiles

The body-collision occupancy lookup is now behind a fixed seam: `TurnContext.bodySegmentsAt(cell)` returns the non-head moved-body segments at a cell (the 01-REQ-044c collision targets, head-to-head losers included), ordered by (snakeId, segment index). `bodyCollisionRule` consumes the seam — O(heads + segments) instead of O(attackers × victims × segments) — and future cell-contact mechanics (mines, traps) should consume it too rather than scanning bodies. `src/resolve.bench.ts` (`pnpm bench`) records the throughput baseline.

The seam's *contract* is spec-pinned and safe; everything behind it is deliberately the simplest correct thing (a per-call `Map`), because four degrees of freedom are genuinely empirical and wait for module 07's simulation loop:

1. **Whether collision scanning is even the hotspot** — per-call work-copy cloning may dominate in a world-tree search, making copy-on-write state or pooling the real win.
2. **Amortization boundary** — if the bot re-resolves many staged-move variants from one parent snapshot, the index over bodies-minus-heads should be built once per parent and shared across children (a different API), not rebuilt per call.
3. **Backing structure** — Map vs flat typed-array grid vs bitsets: depends on measured allocation pressure and lookup counts under V8.
4. **Break-even** — at current game sizes (≤10 snakes, ≤32 board) the naive scan's constants are small; index costs O(total segments) per call regardless of probe count.

When module 07 lands: profile against the bench baseline first, then choose along these axes; the seam means none of that decision touches the rules.
