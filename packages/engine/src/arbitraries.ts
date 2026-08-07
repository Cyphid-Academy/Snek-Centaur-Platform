// Shared fast-check arbitraries and outcome predictors for the engine's
// property suites. fast-check's reusable fixture unit is the Arbitrary —
// stateless and composable, designed to be shared across properties — so
// the domain's arbitraries live here, next to testkit.ts, and every
// property file draws from the same definitions.
//
// Configuration parameters are generated from their FULL documented ranges
// (game-engine/configuration-parameters, read via CONFIG_RANGES from the
// published descriptor table in bounds.ts):
// fast-check biases toward range boundaries, so narrowing ranges by hand
// hides exactly the extreme cases property testing is best at finding.
// Bounds that exist only to keep test wall-clock in check (turn budgets,
// run counts) are the callers' explicit harness constants — never baked
// into these arbitraries. Not part of the package's public API.
import * as fc from "fast-check";
import { advance } from "./board.js";
import { gameplayParameter } from "./bounds.js";
import { itemsByCell } from "./items.js";
import { SETUP_SPAWN_TURN } from "./items.js";
import { rngFromSeed } from "./rng.js";
import { asGameState } from "./state.js";
import { tid } from "./testkit.js";
import type {
  Board,
  Cell,
  Direction,
  GameRuntimeConfig,
  GameState,
  Item,
  SnakeId,
  SnakeState,
  TurnNumber,
  TurnTimings,
} from "./types.js";
import { ALL_DIRECTIONS, CellType, ItemType } from "./types.js";

// Full documented parameter ranges — DERIVED from the engine's published
// descriptor table, never a second copy of its numbers
// (spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree;
// the property suites are one more reader of the one declaration). Each entry
// is the range of values that ENABLE the parameter; a disable sentinel lying
// outside that range is drawn separately below, as it always was.
const range = (key: string): { min: number; max: number } => {
  const d = gameplayParameter(key);
  return { min: d.min, max: d.max };
};

export const CONFIG_RANGES = {
  maxHealth: range("maxHealth"),
  maxTurns: range("maxTurns"), // 0 is the no-limit sentinel, drawn separately
  hazardDamage: range("hazardDamage"),
  foodSpawnRate: range("foodSpawnRate"),
  // One range for both potions: the two parameters declare the same one, and
  // bounds.test.ts holds them equal so this collapse cannot go stale.
  potionSpawnRate: range("invulnPotionSpawnRate"),
  initialBudgetMs: range("clock.initialBudgetMs"),
  budgetIncrementMs: range("clock.budgetIncrementMs"),
  firstTurnTimeMs: range("clock.firstTurnTimeMs"),
  maxTurnTimeMs: range("clock.maxTurnTimeMs"),
} as const;

const int = (r: { min: number; max: number }) => fc.integer({ min: r.min, max: r.max });
const rate = (r: { min: number; max: number }) =>
  fc.double({ min: r.min, max: r.max, noNaN: true, noDefaultInfinity: true });

export const runtimeConfigArb: fc.Arbitrary<GameRuntimeConfig> = fc.record({
  maxHealth: int(CONFIG_RANGES.maxHealth),
  maxTurns: fc.oneof(fc.constant(0), int(CONFIG_RANGES.maxTurns)), // 0 = no turn limit
  // 0 = no duration limit; the live range's upper end is capped far below the
  // declared 86400000 so that fuzzed games actually reach it, which is the
  // point of generating it at all — a harness constant, per this file's
  // header, not a second declaration of the bound.
  maxGameDurationMs: fc.oneof(
    fc.constant(0),
    int({ min: gameplayParameter("maxGameDurationMs").min, max: 60000 }),
  ),
  hazardDamage: int(CONFIG_RANGES.hazardDamage),
  foodSpawnRate: rate(CONFIG_RANGES.foodSpawnRate),
  invulnPotionSpawnRate: rate(CONFIG_RANGES.potionSpawnRate),
  invisPotionSpawnRate: rate(CONFIG_RANGES.potionSpawnRate),
  clock: fc.record({
    initialBudgetMs: int(CONFIG_RANGES.initialBudgetMs),
    budgetIncrementMs: int(CONFIG_RANGES.budgetIncrementMs),
    firstTurnTimeMs: int(CONFIG_RANGES.firstTurnTimeMs),
    maxTurnTimeMs: int(CONFIG_RANGES.maxTurnTimeMs),
  }),
});

/** Any 32-byte game seed — not just the fill-byte seeds of testkit's seed(). */
export const gameSeedArb: fc.Arbitrary<Uint8Array> = fc.uint8Array({
  minLength: 32,
  maxLength: 32,
});

// Team count is not a configuration parameter (teams are registrations);
// the supported range exercised by the suites is 2-6 teams.
export const TEAM_POOL = ["red", "blue", "green", "gold", "violet", "cyan"].map((name) => ({
  centaurTeamId: tid(name),
  name: name[0]?.toUpperCase() + name.slice(1),
}));
export const teamsArb = fc
  .integer({ min: 2, max: TEAM_POOL.length })
  .map((n) => TEAM_POOL.slice(0, n));

/** Derived invulnerability levels (game-engine/collisions-and-severing). */
export const invulnLevelArb = fc.constantFrom(-1, 0, 1);

// ---------------------------------------------------------------------------
// Outcome predictors — independent re-statements of spec'd outcomes that
// properties compare the resolver against.
// ---------------------------------------------------------------------------

/**
 * game-engine/head-to-head-precedence#level-then-length-then-mutual-destruction:
 * occupants below max level die; among the rest, below max length die; two
 * or more finalists all die. Returns the indices of survivors (0 or 1 of
 * them).
 */
export function headToHeadSurvivors(
  occupants: ReadonlyArray<{ level: number; length: number }>,
): number[] {
  const maxLevel = Math.max(...occupants.map((o) => o.level));
  const candidates = occupants.flatMap((o, i) => (o.level === maxLevel ? [i] : []));
  const maxLen = Math.max(...candidates.map((i) => (occupants[i] as { length: number }).length));
  const finalists = candidates.filter((i) => occupants[i]?.length === maxLen);
  return finalists.length === 1 ? finalists : [];
}

/**
 * game-engine/health-and-starvation: a heal claim resolves to maxHealth;
 * otherwise snapshot health minus tick and any hazard damage, dead at <= 0.
 */
export function predictedHealth(input: {
  health: number;
  ate: boolean;
  onHazard: boolean;
  hazardDamage: number;
  maxHealth: number;
}): { health: number; alive: boolean } {
  if (input.ate) return { health: input.maxHealth, alive: true };
  const resolved = input.health - 1 - (input.onHazard ? input.hazardDamage : 0);
  return { health: resolved, alive: resolved > 0 };
}

/** Effect expiry turn for a rebuild at turn T (game-engine/team-potion-effects). */
export function expiryFor(collectionTurn: TurnNumber): TurnNumber {
  return (collectionTurn + 3) as TurnNumber;
}

// ---------------------------------------------------------------------------
// Initial states, drawn directly
// ---------------------------------------------------------------------------
//
// The engine's fuzz games used to start from a GENERATED board. Generation is
// no longer the engine's, and a property suite that reached downstream for its
// inputs would invert the dependency — so states are drawn here instead.
//
// This replacement is deliberately MORE ADVERSARIAL than generation, not a
// re-run of it: a fuzzer for the rules of a turn should explore harder than
// the thing that produces the game's boards. Generation guarantees a complete
// wall ring, no interior walls, connected non-hazard ground, snakes on a
// shared head parity in disjoint angular territories, uniform 3-segment
// stacked bodies at full health, and food only on eligible cells. Every one of
// those guarantees is a case the engine must not depend on, so every one of
// them is dropped here:
//
//   - interior Wall cells, and boards with NO wall ring at all (off-board
//     resolves exactly as a Wall cell does — game-engine/board-geometry#off-board-is-wall)
//   - hazard fields that disconnect the board, and all-hazard interiors
//   - snake bodies of length 1-5, stacked or walked, at any health
//   - heads on mixed parities, so heads can pass through each other's cells
//   - snakes that start on Hazard or Fertile ground
//   - clocks near exhaustion, so the burn commit is exercised rather than
//     merely present
//
// What is NOT dropped: snake bodies stay contiguous and disjoint, and items
// stay off alive bodies. Those are shapes the movement rules themselves can
// only produce, so a state violating them is not a harder case, it is a
// different game.
// design: revise-game-engine-contract

/** Board edge lengths worth fuzzing: tiny enough to crowd, big enough to roam. */
export const BOARD_SIZE_RANGE = { min: 7, max: 24 } as const;

const cellTypeArb: fc.Arbitrary<CellType> = fc.oneof(
  { arbitrary: fc.constant(CellType.Normal), weight: 10 },
  { arbitrary: fc.constant(CellType.Fertile), weight: 5 },
  { arbitrary: fc.constant(CellType.Hazard), weight: 4 },
  // Generation never puts a Wall inside the playable area. Nothing in the
  // rules forbids one, so the suite insists on trying.
  { arbitrary: fc.constant(CellType.Wall), weight: 1 },
);

/** A board whose interior is arbitrary terrain, with the ring itself optional. */
export const boardArb: fc.Arbitrary<Board> = fc
  .record({
    boardSize: fc.integer(BOARD_SIZE_RANGE),
    ring: fc.oneof(
      { arbitrary: fc.constant(true), weight: 4 },
      { arbitrary: fc.constant(false), weight: 1 },
    ),
    interior: fc.array(cellTypeArb, { minLength: 24 * 24, maxLength: 24 * 24 }),
  })
  .map(({ boardSize, ring, interior }) => {
    const cells: CellType[] = [];
    for (let y = 0; y < boardSize; y++) {
      for (let x = 0; x < boardSize; x++) {
        const border = x === 0 || y === 0 || x === boardSize - 1 || y === boardSize - 1;
        cells.push(
          border && ring
            ? CellType.Wall
            : ((interior[y * boardSize + x] ?? CellType.Normal) as CellType),
        );
      }
    }
    return { boardSize, cells };
  });

interface SnakePlan {
  readonly length: number;
  readonly stacked: boolean;
  readonly health: number;
  readonly lastDirection: Direction | null;
}

const snakePlanArb: fc.Arbitrary<SnakePlan> = fc.record({
  length: fc.integer({ min: 1, max: 5 }),
  stacked: fc.boolean(),
  health: fc.integer({ min: 1, max: 100 }),
  lastDirection: fc.option(fc.constantFrom(...ALL_DIRECTIONS), { nil: null }),
});

/** Walk a contiguous body from `head`, staying on the board and off `taken`. */
function walkBody(
  board: Board,
  head: Cell,
  plan: SnakePlan,
  taken: Set<number>,
  rng: { pick: <T>(xs: ReadonlyArray<T>) => T },
): Cell[] | null {
  if (plan.stacked) return new Array<Cell>(plan.length).fill(head);
  const body: Cell[] = [head];
  let at = head;
  for (let i = 1; i < plan.length; i++) {
    const options = ALL_DIRECTIONS.map((d) => advance(at, d)).filter((c) => {
      const inside = c.x >= 0 && c.y >= 0 && c.x < board.boardSize && c.y < board.boardSize;
      return inside && !taken.has(c.y * board.boardSize + c.x);
    });
    if (options.length === 0) return null;
    at = rng.pick(options);
    taken.add(at.y * board.boardSize + at.x);
    body.push(at);
  }
  return body;
}

export interface StateDraw {
  readonly board: Board;
  readonly teamCount: number;
  readonly snakesPerTeam: number;
  readonly plans: ReadonlyArray<SnakePlan>;
  readonly itemCount: number;
  readonly clockBudgetMs: number;
  readonly placementSeed: Uint8Array;
}

export const stateDrawArb: fc.Arbitrary<StateDraw> = fc.record({
  board: boardArb,
  teamCount: fc.integer({ min: 2, max: TEAM_POOL.length }),
  snakesPerTeam: fc.integer({ min: 1, max: 4 }),
  plans: fc.array(snakePlanArb, { minLength: 24, maxLength: 24 }),
  itemCount: fc.integer({ min: 0, max: 8 }),
  // Deliberately reaches 0: a team with no time at all is the case the clock
  // commit exists for (game-engine/chess-timer#exhaustion-kills-the-teams-snakes).
  clockBudgetMs: fc.integer({ min: 0, max: 4000 }),
  placementSeed: gameSeedArb,
});

/**
 * Build a lockstep initial state from a draw, or `null` when the draw cannot
 * be seated (a tiny board crowded with long snakes). Callers discard those
 * with `fc.pre`, exactly as they discarded infeasible generation attempts.
 */
export function initialStateFrom(draw: StateDraw, config: GameRuntimeConfig): GameState | null {
  const { board } = draw;
  const rng = rngFromSeed(draw.placementSeed);
  const free: Cell[] = [];
  for (let y = 0; y < board.boardSize; y++) {
    for (let x = 0; x < board.boardSize; x++) {
      if (board.cells[y * board.boardSize + x] !== CellType.Wall) free.push({ x, y });
    }
  }
  rng.shuffle(free);
  const taken = new Set<number>();
  const snakes: SnakeState[] = [];
  const teams = TEAM_POOL.slice(0, draw.teamCount);
  let planIndex = 0;
  let cursor = 0;
  for (const [teamIdx, team] of teams.entries()) {
    for (let i = 0; i < draw.snakesPerTeam; i++) {
      const plan = draw.plans[planIndex++ % draw.plans.length] as SnakePlan;
      let body: Cell[] | null = null;
      while (body === null && cursor < free.length) {
        const head = free[cursor++] as Cell;
        const key = head.y * board.boardSize + head.x;
        if (taken.has(key)) continue;
        taken.add(key);
        body = walkBody(board, head, plan, taken, rng);
      }
      if (body === null) return null; // board too crowded for this draw
      snakes.push({
        snakeId: (teamIdx * draw.snakesPerTeam + i) as SnakeId,
        letter: String.fromCharCode(65 + i),
        centaurTeamId: team.centaurTeamId,
        body,
        health: Math.min(plan.health, config.maxHealth),
        activeEffects: [],
        lastDirection: plan.lastDirection,
        alive: true,
        turn: 0 as TurnNumber,
      });
    }
  }
  const items: Item[] = [];
  for (let i = 0; i < draw.itemCount && cursor < free.length; i++) {
    const cell = free[cursor++] as Cell;
    if (taken.has(cell.y * board.boardSize + cell.x)) continue;
    const itemType = rng.pick([ItemType.Food, ItemType.InvulnPotion, ItemType.InvisPotion]);
    items.push({ spawnTurn: SETUP_SPAWN_TURN, spawnIndex: i, itemType, cell } as Item);
  }
  return asGameState({
    board,
    snakes,
    projections: [],
    rewind: null,
    items: itemsByCell(board, items),
    clocks: teams.map((t) => ({
      centaurTeamId: t.centaurTeamId,
      budgetMs: 0,
      perTurnMs: draw.clockBudgetMs,
      declaredTurnOver: false,
    })),
    consumedDurationMs: 0,
  });
}

/** Per-turn timings for a fuzzed game: every clocked team declares a burn. */
export function timingsFor(state: GameState, durationMs: number, burnMs: number): TurnTimings {
  return {
    durationMs,
    burnMs: new Map(state.clocks.map((c) => [c.centaurTeamId, burnMs])),
  };
}
