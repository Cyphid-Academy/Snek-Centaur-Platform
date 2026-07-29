import { describe, expect, it } from "vitest";
import { applyDeclaredBurns, initialClock } from "./clock.js";
import { tid, turn } from "./testkit.js";

const CLOCK_CONFIG = {
  initialBudgetMs: 60000,
  budgetIncrementMs: 500,
  firstTurnTimeMs: 60000,
  maxTurnTimeMs: 10000,
};

const clock = (budgetMs: number, perTurnMs: number, team = "red") => ({
  centaurTeamId: tid(team),
  budgetMs,
  perTurnMs,
  declaredTurnOver: false,
});

const burns = (entries: Array<[string, number]>) =>
  new Map(entries.map(([team, ms]) => [tid(team), ms]));

describe("initialClock", () => {
  // spec: game-engine/chess-timer — game start carves turn 0's clock, with the
  // firstTurnTime cap. Every later carve happens inside a resolution, so this
  // is the one the engine cannot perform there.
  it("carves turn 0's clock out of the initial budget under the firstTurnTime cap", () => {
    expect(initialClock(tid("red"), CLOCK_CONFIG)).toEqual({
      centaurTeamId: tid("red"),
      perTurnMs: 60000, // min(firstTurnTime 60000, 60000 + 500 increment)
      budgetMs: 500,
      declaredTurnOver: false,
    });
  });

  // spec: game-engine/chess-timer#carve-out-arithmetic
  it("keeps total remaining time equal to budget + clock", () => {
    const c = initialClock(tid("red"), CLOCK_CONFIG);
    expect(c.budgetMs + c.perTurnMs).toBe(60000 + CLOCK_CONFIG.budgetIncrementMs);
  });
});

describe("applyDeclaredBurns", () => {
  // spec: game-engine/chess-timer — spend the burn, bank the remainder, then
  // take the next turn's increment and carve-out.
  it("spends the declared burn, banks the remainder, and carves the next clock", () => {
    const { clocks } = applyDeclaredBurns(
      [clock(50500, 10000)],
      burns([["red", 3000]]),
      turn(2),
      CLOCK_CONFIG,
    );
    // 10000 - 3000 = 7000 unspent, banked onto 50500 = 57500; +500 increment
    // = 58000; carve min(10000, 58000) = 10000.
    expect(clocks[0]).toEqual({
      centaurTeamId: tid("red"),
      budgetMs: 48000,
      perTurnMs: 10000,
      declaredTurnOver: false,
    });
  });

  // spec: game-engine/chess-timer — a burn cannot spend time the clock never held.
  it("spends the clock and no more when the declared burn exceeds it", () => {
    const { clocks, exhausted } = applyDeclaredBurns(
      [clock(0, 400)],
      burns([["red", 99999]]),
      turn(3),
      CLOCK_CONFIG,
    );
    expect(exhausted.has(tid("red"))).toBe(true);
    // Nothing left to bank, so the team is judged at zero; the increment that
    // would have rescued it arrives only afterwards.
    expect(clocks[0]?.perTurnMs).toBe(500);
    expect(clocks[0]?.budgetMs).toBe(0);
  });

  // spec: game-engine/chess-timer#the-increment-is-not-a-floor
  it("judges exhaustion before the increment, so zero is reachable", () => {
    const { exhausted } = applyDeclaredBurns(
      [clock(0, 2000), clock(0, 2000, "blue")],
      burns([
        ["red", 2000], // spends everything
        ["blue", 1500], // banks 500
      ]),
      turn(4),
      CLOCK_CONFIG,
    );
    expect([...exhausted]).toEqual([tid("red")]);
  });

  // spec: game-engine/chess-timer#declaration-banks-the-remainder
  it("banks the whole clock for a team that burned nothing", () => {
    const { clocks, exhausted } = applyDeclaredBurns(
      [clock(1000, 2000)],
      burns([["red", 0]]),
      turn(1),
      CLOCK_CONFIG,
    );
    expect(exhausted.size).toBe(0);
    expect((clocks[0]?.budgetMs ?? 0) + (clocks[0]?.perTurnMs ?? 0)).toBe(3000 + 500);
  });

  // spec: game-engine/chess-timer#only-a-resolution-moves-a-budget — the
  // arithmetic runs once per turn, at a commit, so a fast team's surplus
  // accumulates exactly as it did when a runtime applied the formulas.
  it("accumulates surplus for a team that burns nothing every turn", () => {
    let c = initialClock(tid("red"), CLOCK_CONFIG);
    for (let t = 1; t <= 5; t++) {
      c = applyDeclaredBurns([c], burns([["red", 0]]), turn(t), CLOCK_CONFIG).clocks[0] as typeof c;
    }
    // Nothing spent: total remaining is the initial budget plus six increments
    // (turn 0's at game start, then one per resolution).
    expect(c.budgetMs + c.perTurnMs).toBe(60000 + 6 * 500);
  });
});
