// The clock inside a resolution: the declared burn, the deaths it causes, the
// consumed duration, and the ending that depends on it.
// spec: game-engine/chess-timer, game-engine/game-end-conditions, game-engine/scoring
import { describe, expect, it } from "vitest";
import { standingScores } from "./resolve/win.js";
import {
  atTurn,
  doImagine,
  doResolve,
  eventsOfKind,
  makeSnake,
  makeState,
  projectionById,
  sid,
  snakeById,
  stagedMoves,
  tid,
  timings,
} from "./testkit.js";
import type { CentaurTeamClockState, GameState } from "./types.js";
import { Direction } from "./types.js";

const clock = (team: string, budgetMs: number, perTurnMs: number): CentaurTeamClockState => ({
  centaurTeamId: tid(team),
  budgetMs,
  perTurnMs,
  declaredTurnOver: false,
});

/** One snake per named team, spread far enough apart to never interact. */
function board(teams: ReadonlyArray<string>, clocks: ReadonlyArray<CentaurTeamClockState>) {
  return makeState(
    teams.map((team, i) =>
      makeSnake({
        snakeId: sid(i),
        centaurTeamId: tid(team),
        body: [{ x: 1 + i * 3, y: 1 + i * 3 }],
        lastDirection: Direction.Right,
      }),
    ),
    { clocks: [...clocks] },
  );
}

const aliveIds = (state: GameState) => state.snakes.filter((s) => s.alive).map((s) => s.snakeId);

describe("the declared burn moves the clocks (game-engine/chess-timer)", () => {
  // spec: game-engine/chess-timer#only-a-resolution-moves-a-budget
  it("spends, banks, and carves in the one commit", () => {
    const state = board(["red", "blue"], [clock("red", 1000, 2000), clock("blue", 1000, 2000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(
        at,
        500,
        new Map([
          [tid("red"), 500],
          [tid("blue"), 0],
        ]),
      ),
    });
    const red = result.nextState.clocks.find((c) => c.centaurTeamId === tid("red"));
    const blue = result.nextState.clocks.find((c) => c.centaurTeamId === tid("blue"));
    // red held 3000 in total and burned 500 of it, then took the increment.
    expect((red?.budgetMs ?? 0) + (red?.perTurnMs ?? 0)).toBe(3000 - 500 + 500);
    // blue burned nothing, so it keeps the whole 3000 plus the increment.
    expect((blue?.budgetMs ?? 0) + (blue?.perTurnMs ?? 0)).toBe(3000 + 500);
  });

  // spec: game-engine/chess-timer#burn-is-not-the-turns-length
  it("charges each team its own burn while the game's duration grows by the turn's", () => {
    const state = board(["red", "blue"], [clock("red", 0, 10000), clock("blue", 0, 10000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(
        at,
        10000,
        new Map([
          [tid("red"), 2000],
          [tid("blue"), 10000],
        ]),
      ),
    });
    expect(result.nextState.consumedDurationMs).toBe(10000);
    const red = result.nextState.clocks.find((c) => c.centaurTeamId === tid("red"));
    expect((red?.budgetMs ?? 0) + (red?.perTurnMs ?? 0)).toBe(8000 + 500);
  });
});

describe("exhaustion kills, it does not end (game-engine/chess-timer)", () => {
  // spec: game-engine/chess-timer#exhaustion-kills-the-teams-snakes
  it("kills every snake of a team left with no remaining time", () => {
    const state = board(
      ["red", "blue", "green"],
      [clock("red", 0, 500), clock("blue", 5000, 5000), clock("green", 5000, 5000)],
    );
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(
        at,
        500,
        new Map([
          [tid("red"), 500],
          [tid("blue"), 0],
          [tid("green"), 0],
        ]),
      ),
    });
    const death = eventsOfKind(result.events, "snake_died")[0];
    expect(death?.cause).toBe("clock_exhaustion");
    expect(death?.killerSnakeId).toBeNull();
    expect(snakeById(result.nextState, 0).alive).toBe(false);
    // Two teams are still playing, so nothing about the clock ended the game.
    // spec: game-engine/game-end-conditions#a-team-out-of-time-ends-nothing-by-itself
    expect(result.outcome.kind).toBe("in_progress");
    expect(aliveIds(result.nextState)).toEqual([sid(1), sid(2)]);
  });

  it("ends the game by last-team-standing when only one team is left", () => {
    const state = board(["red", "blue"], [clock("red", 0, 500), clock("blue", 5000, 5000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(
        at,
        500,
        new Map([
          [tid("red"), 500],
          [tid("blue"), 0],
        ]),
      ),
    });
    expect(result.outcome.kind).toBe("victory");
    if (result.outcome.kind !== "victory") return;
    expect(result.outcome.winnerCentaurTeamId).toBe(tid("blue"));
    // spec: game-engine/scoring#running-out-of-time-needs-no-adjustment — scored
    // as any other team whose snakes died, with no clock-specific rule.
    expect(result.outcome.scores.get(tid("red"))).toBe(0);
  });

  // spec: game-engine/chess-timer#the-increment-is-not-a-floor
  it("reaches zero under a positive per-turn increment", () => {
    const state = board(["red", "blue"], [clock("red", 0, 400), clock("blue", 9000, 9000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(
        at,
        400,
        new Map([
          [tid("red"), 400],
          [tid("blue"), 0],
        ]),
      ),
    });
    expect(eventsOfKind(result.events, "snake_died")[0]?.cause).toBe("clock_exhaustion");
  });

  // spec: game-engine/held-snakes#a-held-snakes-team-still-spends-its-time
  it("spends a held team's clock and kills its held snakes with the rest", () => {
    const state = board(
      ["red", "blue", "green"],
      [clock("red", 0, 500), clock("blue", 5000, 5000), clock("green", 5000, 5000)],
    );
    const at = atTurn(state, 1);
    const result = doImagine(state, [[1, Direction.Right]], [0, 2], {
      timings: timings(
        at,
        500,
        new Map([
          [tid("red"), 500],
          [tid("blue"), 0],
          [tid("green"), 0],
        ]),
      ),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Snake 0 was held, so it is a projection now — and a projection's team
    // burned its time whether or not this resolution modelled its snakes.
    expect(projectionById(result.resolution.nextState, 0).alive).toBe(false);
    expect(eventsOfKind(result.resolution.events, "snake_died")[0]?.cause).toBe("clock_exhaustion");
  });
});

describe("the duration limit (game-engine/game-end-conditions)", () => {
  // spec: #the-duration-limit-is-an-ending-like-any-other
  it("ends the game at the commit that reaches it, scored by the standing score", () => {
    const state = board(["red", "blue"], [clock("red", 5000, 5000), clock("blue", 5000, 5000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(at, 1000, 0),
      config: { maxGameDurationMs: 1000 },
    });
    expect(result.nextState.consumedDurationMs).toBe(1000);
    expect(result.outcome.kind).toBe("draw"); // equal bodies, equal share
    if (result.outcome.kind !== "draw") return;
    // spec: game-engine/scoring#the-duration-limit-faults-nobody
    expect(result.outcome.scores.get(tid("red"))).toBe(1);
    expect(result.outcome.scores.get(tid("blue"))).toBe(1);
  });

  it("is silent while the game is under the limit", () => {
    const state = board(["red", "blue"], [clock("red", 5000, 5000), clock("blue", 5000, 5000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(at, 999, 0),
      config: { maxGameDurationMs: 1000 },
    });
    expect(result.outcome.kind).toBe("in_progress");
  });

  // spec: #the-first-condition-met-ends-the-game — an elimination present at
  // the commit is the ending; the limits are silent.
  it("credits the elimination when a limit lands at the same commit", () => {
    const snakes = [
      // red sits one cell from the wall, so moving up kills it.
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 1, y: 1 }] }),
      makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 8, y: 8 }] }),
    ];
    const state = makeState(snakes, {
      clocks: [clock("red", 5000, 5000), clock("blue", 5000, 5000)],
    });
    const at = atTurn(state, 1);
    // red walks into the wall at the same commit that reaches the limit.
    const result = doResolve(state, stagedMoves([[0, Direction.Up]]), {
      timings: timings(at, 1000, 0),
      config: { maxGameDurationMs: 1000, maxHealth: 100 },
    });
    expect(result.outcome.kind).toBe("victory");
    if (result.outcome.kind !== "victory") return;
    expect(result.outcome.winnerCentaurTeamId).toBe(tid("blue"));
    // Last-team-standing scores, not the standing-score split a limit gives.
    expect(result.outcome.scores.get(tid("blue"))).toBe(2);
  });

  it("has no limit at the 0 sentinel however long the game runs", () => {
    const state = board(["red", "blue"], [clock("red", 90000, 9000), clock("blue", 90000, 9000)]);
    const at = atTurn(state, 1);
    const result = doResolve(state, new Map(), {
      timings: timings(at, 86400000, 0),
      config: { maxGameDurationMs: 0 },
    });
    expect(result.outcome.kind).toBe("in_progress");
  });
});

describe("standing scores (game-engine/scoring)", () => {
  // spec: game-engine/scoring#standing-score-at-any-turn
  it("uses the same formula the final score is built on", () => {
    const snakes = [
      makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 1, y: 1 }] }),
      makeSnake({
        snakeId: sid(1),
        centaurTeamId: tid("blue"),
        body: [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
          { x: 5, y: 7 },
        ],
      }),
    ];
    const scores = standingScores(snakes, [tid("red"), tid("blue")]);
    expect(scores.get(tid("red"))).toBeCloseTo((1 / 4) * 2);
    expect(scores.get(tid("blue"))).toBeCloseTo((3 / 4) * 2);
  });

  it("scores a team with no living segment at 0", () => {
    const snakes = [
      makeSnake({
        snakeId: sid(0),
        centaurTeamId: tid("red"),
        body: [{ x: 1, y: 1 }],
        alive: false,
      }),
      makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 5, y: 5 }] }),
    ];
    const scores = standingScores(snakes, [tid("red"), tid("blue")]);
    expect(scores.get(tid("red"))).toBe(0);
    expect(scores.get(tid("blue"))).toBe(2);
  });
});
