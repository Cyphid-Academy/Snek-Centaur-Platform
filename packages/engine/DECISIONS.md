# Module 01 Implementation — Decision Log

Implementation-level decisions embodied in `@cyphid/snek-engine` that are not fully pinned by spec module 01. Spec-level decisions live in the spec decision logs (`legacy-spec-archive/review/*.review.md`); this file records only choices made at the code level, so a reader can distinguish "the spec requires this" from "the implementation chose this".

---

## 1. Contract deviations from the drafted spec signatures

### 1.1 `resolveTurn` takes a `GameRuntimeConfig` parameter

The drafted signature (01 §3.8) is `resolveTurn(state, stagedMoves, turnNumber, turnSeed)`, and `GameState` is fixed to `{board, snakes, items, clocks}` by DOWNSTREAM IMPACT note 8 — yet the health, spawning, and win-check stages consume `maxHealth`, `hazardDamage`, the three spawn rates, and `maxTurns`, and the spec provides no route for them. The engine adds a fifth parameter, `config: GameRuntimeConfig`. Chosen over embedding config in `GameState` to keep the exported aggregate purely dynamic (note 8) and because module 04 holds the static config separately and can pass it trivially.

### 1.2 `generateBoardAndInitialState` takes the full `GameConfig`

The drafted signature (01 §3.8) takes `GameOrchestrationConfig` only, but snake initialization (01-REQ-021, §2.6) sets `health = maxHealth`, which lives in the **runtime** half. The Convex caller holds the full config at provisioning time (02 §2.14), so passing `GameConfig` costs nothing.

---

## 2. Interpretation calls

### 2.1 Potion spawning is not fertile-restricted

01-REQ-049 says potions use "the same probabilistic mechanism and eligible-cell criteria as food", which read literally would include 01-REQ-048's fertile restriction. Three signals scope the restriction to food: the README ("the only eligible spawn sites for **food**"), §2.8's separate food/potion eligibility, and §3.9's invariant list. The engine restricts food only; potions spawn on any eligible cell. Tested with a board whose only fertile cell is blocked: food cannot spawn, potions can. *Flagged for spec review — 01-REQ-049 could use one clarifying clause.*

### 2.2 `killerSnakeId` semantics

Body collision → the victim (body owner). Head-to-head → the unique survivor of that cell's contest, else `null`. Wall, self-collision, and health depletion → `null`.

### 2.3 Sever contact index with stacked segments

The contact index for a sever is the first (head-closest) segment of the victim's moved body matching the attacker's head cell — relevant when duplicated segments share a cell (stacked game-start bodies, doubled tails).

### 2.4 Spawn-eligibility occupancy counts alive snakes only

Dead snakes' bodies remain in state as a record but do not block food/potion spawns (01-REQ-048 "occupied by a snake" read as an alive snake). Items always block: the items map holds only present items (01-REQ-007), so map membership is exactly the occupancy test — including same-turn earlier spawns, which is what prevents the potion pass from stacking onto a cell the food pass just filled.

### 2.5 `potion_collected.affectedTeammateIds` excludes the collector

The collector is the event's subject; "affected teammates" are the other members that received rebuild entries (including any co-collectors that turn).

### 2.6 Forfeits are handled upstream

`GameState` carries no forfeit flag, so the engine treats every team present in `state.snakes` as competing (01-REQ-053a's exclusions are module 04/05's job before calling `resolveTurn`). "Alive at start of turn" for simultaneous-elimination scoring (01-REQ-055) is captured at `resolveTurn` entry — equivalent to the prior-turn scoreboard the spec mentions, with no external storage needed.

### 2.7 `isValidMove` semantics

Not part of module 01's contract; provided for 02-REQ-037 pre-validation. Returns false only for moves whose fatality is certain from the snake's own deterministic future — wall entry, or entering an own-body cell still occupied after the move (duplicated tail cells included). Other snakes' simultaneous moves are unknowable at staging time, so collisions with them are not flagged; every direction remains legal to stage (a lethal one simply kills at resolution).

---

## 3. Engineering choices

### 3.1 `const enum` rendered as `as const` objects

The spec drafts `Direction`/`CellType`/`ItemType` as `const enum`s. This workspace compiles with `isolatedModules` + `verbatimModuleSyntax`, and the engine is consumed by esbuild/Vite (per-file transpilers that cannot inline cross-module const enum members). The `as const` object + literal-union pattern preserves the spec's exact numeric values, is fully erasable, and keeps `Direction.Up` ergonomics.

### 3.2 BLAKE3 via `@noble/hashes`

Module 01 mandates BLAKE3 keyed hashing for `subSeed` (DOWNSTREAM IMPACT note 4 makes it a hard cross-runtime dependency). `@noble/hashes` is pure ECMAScript (no Node/browser APIs), audited, and works in all three consumer runtimes. It is the package's only runtime dependency.

### 3.3 Xoshiro256++ over BigInt lanes

The 256-bit state maps 1:1 to the 32-byte seed as four little-endian u64s. BigInt arithmetic is slower than a 32-bit-lane implementation but RNG draws are far off the hot path (a handful per turn); clarity and provable correspondence to the reference algorithm win. The all-zero state (Xoshiro's fixed point) is guarded with golden-ratio constants — unreachable via BLAKE3-derived seeds, but cheap insurance. `nextIntExclusive` uses `floor(nextFloat() * max)`: negligible bias at game-scale ranges, and a fixed one-draw cost per call.

### 3.4 Perlin noise: classic 8-gradient, √2-normalised, one seeded stream

Improved-Perlin fade with 8 gradient directions; output divided by √2 to bound to [-1, 1] (only the score *ranking* matters downstream, so uniform scaling is harmless). The `"fertile"` sub-seed drives a single RNG stream: field offset (dx, dy) drawn first, then the permutation-table shuffle — the draw order is part of the reproducibility contract.

### 3.5 Exports beyond the minimal contract

`initialClock`/`applyTurnStart`/`declareTurnOver` (so module 04's reducers apply the exact §2.9 formulas rather than re-deriving them), `isValidMove` (§2.7 above), `DEFAULT_GAME_CONFIG` (canonical 01-REQ-063..077 defaults), `ALL_DIRECTIONS`, and board helpers (`cellIndex`, `isInner`, `parityOf`, `advance`, `cellAt`, `sameCell`, `cellKey`). Per 01 §3's contract note, non-listed exports are conveniences, not versioned contract surface.

### 3.6 Range validation is not the engine's job

01-REQ-063 (and 01-REVIEW-018) place range enforcement on user-facing surfaces (module 05 mutations, module 08 widgets). The engine accepts any structurally valid config; tests exploit this (e.g. spawn rate 1.0 for potions to force deterministic spawns).

### 3.7 Purity and cloning

`resolveTurn` never mutates its inputs: snakes and items are cloned into internal mutable work copies (`resolve/work.ts`, derived from `SnakeState` via a mapped type so new fields flow through automatically), while the board and clocks pass through by reference — both immutable within a turn; the chess timer is module 04's between-turns concern. Verified by a snapshot-equality test.

### 3.8 ID assignment

`snakeId = teamIndex × snakesPerTeam + letterIndex` (globally unique, team-major, matching letter order); initial food items are ids `0..N-1`. Both are engine-internal conventions — downstream modules must treat ids as opaque.

### 3.9 Claim collections expose canonically ordered views

01-REQ-041 guarantees interaction-rule evaluation order cannot affect outcomes, and the rule-order-shuffle property test (`resolve-properties.test.ts`) enforces it by replaying whole fuzzed games under permuted `INTERACTION_RULES` orders. For that guarantee to hold, any claim data that reaches output must be order-canonical, not insertion-ordered: `ClaimSet.damageSources()` reports in a fixed source order and `ClaimSet.cancellations()` sorts by (team, family). Future claim collections must follow the same canonical-view discipline — an insertion-ordered view that leaks into events or state re-introduces rule-order sensitivity, and the shuffle test will catch it.

### 3.10 Occupancy index: spec-pinned seam now, empirical backing deferred

`TurnContext.bodySegmentsAt(cell)` is the single lookup for 01-REQ-044c body-collision targets (non-head moved segments, head-to-head losers included, ordered by snakeId then segment index). The seam's contract is fixed by the spec; the structure behind it is deliberately the simplest correct thing (a per-call `Map`), because four questions are empirical and wait for module 07's simulation loop, measured against the `pnpm bench` baseline (`src/resolve.bench.ts`):

1. **Whether collision scanning is the hotspot at all** — per-call work-copy cloning may dominate a world-tree search, making copy-on-write state or pooling the real win.
2. **Amortization boundary** — if the bot resolves many staged-move variants from one parent snapshot, the index over bodies-minus-heads should be built once per parent and shared across children (a different API), not rebuilt per call.
3. **Backing structure** — `Map` vs flat typed-array grid vs bitsets: depends on measured allocation pressure and lookup counts under V8.
4. **Break-even** — at current game sizes (≤10 snakes, ≤32 board) a naive scan's constants are small; the index costs O(total segments) per call regardless of probe count.

When module 07 lands: profile against the bench baseline first, then choose along these axes. The seam means none of that decision touches the rules.

---

## 4. Observations for the spec authors

1. **Hazard 30% is frequently infeasible.** Uniform hazard placement at 25–30% density sits near the site-percolation threshold on mid-size boards: on a 13-board at 30%, roughly half of game seeds exhaust all four attempts on `HAZARD_CONNECTIVITY` (measured: 11/20 seeds succeed; 15-board: 3/20). The bounded-retry design absorbs this, but room-owner UX at the top of the 0–30 range will see "provisioning failed" often enough to notice. A connectivity-aware placement algorithm (e.g. carve from a spanning structure) or a tighter range cap may be worth a REVIEW item.
2. **01-REQ-049 wording** ("same eligible-cell criteria as food") vs. the food-only fertile restriction — see §2.1.
3. **The `teams[].name` parameter** of `generateBoardAndInitialState` is unused by module 01 (display names are derived downstream per 01-REQ-018); kept for signature stability.

---

## §4 The contract revision (`revise-game-engine-contract`)

Recorded here for readers of this package; the full rationale is the change's
`design.md`, and these entries point at the requirements rather than restating
them.

**§4.1 Two entry points, one stage list.** Sorting the eight stages by whether
they need every snake at the same turn puts the seam in exactly one place: item
spawning and the win check need lockstep, the rest do not. Both are therefore
gated on a condition about the STATE — every alive snake at the current turn —
never on which entry point was called or on what the caller passed. Gating
spawning on "was a seed supplied" would make it a property of the call, and it
is a property of the world: a mixed-turn board cannot place items correctly
however much entropy it is handed.

**§4.2 A hold splits a snake in two, and that is all holding is.** The snake
CRYSTALLIZES into a record frozen at the turn it was held from — carried on the
state, read for the last known position, changed by nothing ever again. Its
PROJECTION stands on the board in its place: the same snake one turn on, and an
ordinary board occupant in every respect the rules read — severable, carrying
effects that expire and that team events reach, advancing its turn with the
state, dying with its team's clock. It differs from a snake in exactly one way,
and the type says so by what it lacks: **no head.**

Keeping them as two representations rather than one record read with an offset
is what makes the rules uniform (they see occupants, not two kinds), keeps the
frozen record genuinely frozen (a projection's effects advance; a record's
cannot), and leaves the projection owning its own cell list — which is where a
later, less conservative projection would put a shorter one.

**§4.3 Severing is scoped to non-head segments, and a projection has none.**
`game-engine/collisions-and-severing` says so and this change did not touch it.
Every cell a projection stands in is therefore a severable segment, including
the one its record names as the head — because a snake vacates that cell only by
putting its own next segment there, so a body stands there whatever it chose.
The level comparison alone decides, and no encounter is left in which the higher
invulnerability level dies to the lower.

**§4.3a Conservatism has one source and two consequences.** A projection's final
segment does not vacate, and its health is the team maximum. Both rest on the
same unmodelled fact — a snake nobody simulated might have reached food — and
both are the seam a later pass reasoning about reachable food would narrow. A
sever taking every cell a projection stands in leaves it standing in nothing
while alive: an empty cell list, which needs no flag and no case of its own.

**§4.4 The clock moved into the commit.** `applyTurnStart` and `declareTurnOver`
are gone from the package surface. A runtime that kept applying them between
turns *and* passed burns to the resolution would produce two writers of one
budget, and the disagreement is unfalsifiable from inside either side. What is
left is `initialClock`, which performs turn 0's carve-out — the one carve no
resolution can, because turn 0 has no preceding commit.

**§4.5 The ordering inside the clock commit is load-bearing.** Spend the burn,
bank the remainder, judge exhaustion, *then* increment and carve. Applied the
other way round a positive `budgetIncrementMs` is a floor no team can cross and
the exhaustion rule is dead code in every default configuration — which
compiles, and passes every test that does not deliberately drain a budget.

**§4.6 The fuzzer no longer starts from a generated board.** Generation left the
package, so `resolve-properties.test.ts` draws states from `arbitraries.ts`
instead. The replacement is deliberately more adversarial than generation
(interior walls, ringless boards, disconnected hazards, snakes on hazards, mixed
head parities, bodies of length 1–5, near-empty clocks): a fuzzer for the rules
of a turn should explore harder than the thing that produces the game's boards,
not re-run it. What it deliberately keeps is body contiguity and disjointness —
shapes the movement rules themselves can only produce, so violating them is not
a harder case, it is a different game.
