// Chess-timer arithmetic. spec: 01 §2.9 (game-rules/chess-timer..040).
//
// Module 01 specifies only the arithmetic; the physical mechanism by which
// real-time elapsing drains `perTurnMs` — and the trigger that invokes turn
// resolution when every team has declared (game-rules/chess-timer) — is module 04's
// concern (module 01 DOWNSTREAM IMPACT note 5). These helpers are exported
// so module 04's reducers apply the exact formulas, including the
// easy-to-miss credit-back on early declare.
import type {
  CentaurTeamClockState,
  CentaurTeamId,
  GameRuntimeConfig,
  TurnNumber,
} from "./types.js";

type ClockConfig = GameRuntimeConfig["clock"];

// spec: game-rules/chess-timer
export function initialClock(
  centaurTeamId: CentaurTeamId,
  config: ClockConfig,
): CentaurTeamClockState {
  return {
    centaurTeamId,
    budgetMs: config.initialBudgetMs,
    perTurnMs: 0,
    declaredTurnOver: false,
  };
}

// spec: game-rules/chess-timer#carve-out-arithmetic
//
// The per-turn clock is carved out of the budget: after computing
// `perTurnMs = min(cap, budget)`, that amount is deducted from the budget and
// held by the running clock. The invariant `totalRemainingTime = budgetMs +
// perTurnMs` holds at every instant; declareTurnOver credits the unspent
// remainder back.
export function applyTurnStart(
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

// spec: game-rules/chess-timer (explicit declare) and game-rules/chess-timer (clock expiry invokes the
// same sequence with perTurnMs already 0, making the credit-back a no-op).
export function declareTurnOver(clock: CentaurTeamClockState): CentaurTeamClockState {
  if (clock.declaredTurnOver) return clock;
  return {
    centaurTeamId: clock.centaurTeamId,
    budgetMs: clock.budgetMs + clock.perTurnMs,
    perTurnMs: 0,
    declaredTurnOver: true,
  };
}
