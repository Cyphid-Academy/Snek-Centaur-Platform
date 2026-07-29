// Chess-timer arithmetic. spec: game-engine/chess-timer
//
// The engine owns the whole of the timer now, not just its formulas. A turn's
// resolution applies the time the turn is DECLARED to have cost, and nothing
// outside a resolution ever moves a budget: the arithmetic runs once, at a
// commit, from a declared burn, so no separately ticked copy of a budget
// exists to disagree with the committed one
// (game-engine/chess-timer#only-a-resolution-moves-a-budget). What stays with
// the per-game runtime is the mid-turn reading that commits nothing —
// watching elapsed time against a running clock and auto-declaring on expiry.
import type {
  CentaurTeamClockState,
  CentaurTeamId,
  GameRuntimeConfig,
  TurnNumber,
} from "./types.js";

type ClockConfig = GameRuntimeConfig["clock"];

/**
 * A team's clock at game start, already carved out for turn 0.
 *
 * Every later carve-out happens inside a resolution, so this is the one that
 * cannot: turn 0 has no preceding commit to perform it. It is the ordinary
 * per-turn arithmetic with turn 0's `firstTurnTime` cap.
 */
// spec: game-engine/chess-timer
export function initialClock(
  centaurTeamId: CentaurTeamId,
  config: ClockConfig,
): CentaurTeamClockState {
  return carveOutFor(
    { centaurTeamId, budgetMs: config.initialBudgetMs, perTurnMs: 0, declaredTurnOver: false },
    0 as TurnNumber,
    config,
  );
}

// spec: game-engine/chess-timer#carve-out-arithmetic
//
// The turn about to start takes its increment and then carves its per-turn
// clock out of the budget: after computing `perTurnMs = min(cap, budget)`,
// that amount is deducted from the budget and held by the running clock. The
// invariant `totalRemainingTime = budgetMs + perTurnMs` holds at every
// instant. Package-internal: only `initialClock` and the commit stage carve.
export function carveOutFor(
  clock: CentaurTeamClockState,
  turnNumber: TurnNumber,
  config: ClockConfig,
): CentaurTeamClockState {
  const budgetMs = clock.budgetMs + config.budgetIncrementMs;
  const cap = turnNumber === 0 ? config.firstTurnTimeMs : config.maxTurnTimeMs;
  const perTurnMs = Math.min(cap, budgetMs);
  return {
    centaurTeamId: clock.centaurTeamId,
    budgetMs: budgetMs - perTurnMs,
    perTurnMs,
    declaredTurnOver: false,
  };
}

export interface ClockCommit {
  readonly clocks: ReadonlyArray<CentaurTeamClockState>;
  /** Teams left with no remaining time at all once their burn was spent. */
  readonly exhausted: ReadonlySet<CentaurTeamId>;
}

/**
 * Apply one turn's declared burns, in the order the requirement states and
 * all within the one commit: spend each team's burn from its per-turn clock,
 * bank the unspent remainder, judge exhaustion, and only then take the next
 * turn's increment and carve-out.
 *
 * The order is load-bearing. Judging exhaustion BEFORE the increment is what
 * makes zero reachable at all: a team that burns the whole of its remaining
 * time without declaring early lands at zero, and the increment that would
 * have rescued it has not arrived yet. Applied the other way round a positive
 * `budgetIncrementMs` is a floor no team can cross, and the rule is dead code
 * in every default configuration — which compiles, and passes every test that
 * does not deliberately drain a budget.
 */
// spec: game-engine/chess-timer#the-increment-is-not-a-floor
export function applyDeclaredBurns(
  clocks: ReadonlyArray<CentaurTeamClockState>,
  burnMs: ReadonlyMap<CentaurTeamId, number>,
  nextTurnNumber: TurnNumber,
  config: ClockConfig,
): ClockCommit {
  const exhausted = new Set<CentaurTeamId>();
  const committed = clocks.map((clock) => {
    // Spend: a burn exceeding what the clock holds spends the clock and no
    // more — the engine believes the measurement it is given, but a team
    // cannot spend time it never had.
    const burn = burnMs.get(clock.centaurTeamId) ?? 0;
    const perTurnMs = Math.max(0, clock.perTurnMs - Math.max(0, burn));
    // Bank: the unspent remainder returns to the budget.
    const banked = clock.budgetMs + perTurnMs;
    // Judge: no remaining time at all, before any of next turn's arrives.
    if (banked <= 0) exhausted.add(clock.centaurTeamId);
    return carveOutFor(
      {
        centaurTeamId: clock.centaurTeamId,
        budgetMs: banked,
        perTurnMs: 0,
        declaredTurnOver: false,
      },
      nextTurnNumber,
      config,
    );
  });
  return { clocks: committed, exhausted };
}
