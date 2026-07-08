# Module 01 Implementation — Decision Log

Implementation-level decisions embodied in `@cyphid/snek-engine` that are not fully pinned by spec module 01. Spec-level decisions live in the spec decision logs (`spec/review/*.review.md`); this file records only choices made at the code level, so a reader can distinguish "the spec requires this" from "the implementation chose this".

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

Dead snakes' bodies remain in state as a record but do not block food/potion spawns (01-REQ-048 "occupied by a snake" read as an alive snake). Consumed items likewise stay in `items` (with `consumed: true`) as the identity record for events and replays; new item ids continue from `max(existing) + 1`.

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

## 5. First real consumer — local-game driver and convenience exports

The `/demo` page in `apps/centaur-server-reference` (two bot teams playing full games in the browser) is the first consumer of this engine outside its own test suite. Wiring it surfaced exactly the ergonomic gap left when the drafted API split bookkeeping out to module 04: every local consumer (demo, module-07 bot loops, replay tooling) re-derives the same ~40-line state machine around `resolveTurn`. That loop is now productionised as `src/driver.ts`:

- `createLocalGame(config, teams, gameSeed)` → a stepping `LocalGame` (or the `BoardGenerationFailure` passed through). It owns turn numbering, `turnSeed = subSeed(gameSeed, "turn:" + T)` derivation, clock assembly per 01-REQ-035, and outcome tracking — the same loop as the property-test fuzzer, so a driver game replays identically to a module-04 game from the same seed. Clocks pass through untouched; the driver does not simulate real time.
- `seedFromText(text)` — BLAKE3 of a human-memorable string → 32-byte game seed, so a seed shown in a UI reproduces the game anywhere.

Both are conveniences per 01 §3's contract note, NOT contract surface (§3.5). `sameCell`/`cellKey` (already listed in §3.5) plus `EFFECT_DURATION_TURNS`/`familyOfPotion` are now actually exported from the index for the same reason.

Packaging: `package.json` `exports` gained a `development` condition pointing at `src/index.ts`, so Vite/Vitest consumers in the workspace resolve engine source directly (no stale-`dist` problem in `pnpm dev`); production builds and `tsc` keep resolving `dist/`. The engine reaches the app through `@cyphid/snek-centaur-server-lib`, which re-exports the full public surface — the app never imports the (private) engine package directly, preserving the mirror/forker model.
