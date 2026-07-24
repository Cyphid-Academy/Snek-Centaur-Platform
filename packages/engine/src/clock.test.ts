import { describe, expect, it } from "vitest";
import { applyTurnStart, declareTurnOver, initialClock } from "./clock.js";
import { tid, turn } from "./testkit.js";

const CLOCK_CONFIG = {
  initialBudgetMs: 60000,
  budgetIncrementMs: 500,
  firstTurnTimeMs: 60000,
  maxTurnTimeMs: 10000,
};

describe("initialClock", () => {
  // spec: game-engine/chess-timer
  it("starts with the configured initial budget, no per-turn clock", () => {
    const clock = initialClock(tid("red"), CLOCK_CONFIG);
    expect(clock).toEqual({
      centaurTeamId: tid("red"),
      budgetMs: 60000,
      perTurnMs: 0,
      declaredTurnOver: false,
    });
  });
});

describe("applyTurnStart", () => {
  // spec: game-engine/chess-timer — increment budget, then carve the per-turn
  // clock out of it (budget holds what is NOT on the running clock)
  it("adds the increment and carves out a clock capped at maxTurnTime on turns > 0", () => {
    const clock = applyTurnStart(initialClock(tid("red"), CLOCK_CONFIG), turn(1), CLOCK_CONFIG);
    expect(clock.perTurnMs).toBe(10000); // min(10000, 60500)
    expect(clock.budgetMs).toBe(50500); // 60500 - 10000 carved out
    expect(clock.declaredTurnOver).toBe(false);
  });

  // spec: game-engine/chess-timer — firstTurnTime cap on turn 0
  it("uses the firstTurnTime cap on turn 0", () => {
    const clock = applyTurnStart(initialClock(tid("red"), CLOCK_CONFIG), turn(0), CLOCK_CONFIG);
    expect(clock.perTurnMs).toBe(60000); // min(60000, 60500)
    expect(clock.budgetMs).toBe(500);
  });

  // Depleted budget: per-turn clock drops to the increment alone
  it("limits the clock to the budget when the budget is below the cap", () => {
    const depleted = {
      centaurTeamId: tid("red"),
      budgetMs: 0,
      perTurnMs: 0,
      declaredTurnOver: true,
    };
    const clock = applyTurnStart(depleted, turn(5), CLOCK_CONFIG);
    expect(clock.perTurnMs).toBe(500); // min(10000, 500)
    expect(clock.budgetMs).toBe(0); // fully carved out
  });
});

describe("declareTurnOver", () => {
  // spec: game-engine/chess-timer — unused clock time returns to the budget
  it("credits remaining per-turn time back to the budget and stops the clock", () => {
    const running = {
      centaurTeamId: tid("red"),
      budgetMs: 50500,
      perTurnMs: 7300,
      declaredTurnOver: false,
    };
    const clock = declareTurnOver(running);
    expect(clock.budgetMs).toBe(57800);
    expect(clock.perTurnMs).toBe(0);
    expect(clock.declaredTurnOver).toBe(true);
  });

  // spec: game-engine/chess-timer — expiry is declare-over with a zero credit-back
  it("is a no-op credit when the clock already reached zero (auto-declare)", () => {
    const expired = {
      centaurTeamId: tid("red"),
      budgetMs: 41000,
      perTurnMs: 0,
      declaredTurnOver: false,
    };
    const clock = declareTurnOver(expired);
    expect(clock.budgetMs).toBe(41000);
    expect(clock.perTurnMs).toBe(0);
    expect(clock.declaredTurnOver).toBe(true);
  });

  it("is idempotent once declared", () => {
    const done = {
      centaurTeamId: tid("red"),
      budgetMs: 41000,
      perTurnMs: 500,
      declaredTurnOver: true,
    };
    expect(declareTurnOver(done)).toEqual(done);
  });
});

describe("budget accumulation across turns", () => {
  // spec: game-engine/chess-timer — a fast team accumulates surplus across turns
  it("accumulates surplus for a team that declares instantly every turn", () => {
    let clock = initialClock(tid("red"), CLOCK_CONFIG);
    for (let t = 0; t < 5; t++) {
      clock = applyTurnStart(clock, turn(t), CLOCK_CONFIG);
      clock = declareTurnOver(clock); // full per-turn clock returns to budget
    }
    // Nothing is ever spent: budget = initial + 5 increments
    expect(clock.budgetMs).toBe(60000 + 5 * 500);
  });
});
