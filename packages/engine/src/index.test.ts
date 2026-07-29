import { describe, expect, it } from "vitest";
import * as engine from "./index.js";
import { emptyBoard, makeSnake, makeState, seed, sid, tid, timings } from "./testkit.js";

// Contract smoke test: the public surface exists — and does NOT offer what
// left it. Board generation is game-configuration's, and the clock has one
// writer (a resolution), so the between-turns helpers are gone with it.
describe("@cyphid/snek-engine public API", () => {
  it("exports the engine contract surface", () => {
    expect(engine.Direction.Up).toBe(0);
    expect(engine.CellType.Wall).toBe(1);
    expect(engine.ItemType.Food).toBe(0);
    expect(typeof engine.invulnerabilityLevel).toBe("function");
    expect(typeof engine.isVisible).toBe("function");
    expect(typeof engine.fertileGroundEnabled).toBe("function");
    expect(typeof engine.rngFromSeed).toBe("function");
    expect(typeof engine.subSeed).toBe("function");
    expect(typeof engine.advanceTurn).toBe("function");
    expect(typeof engine.imagineMoves).toBe("function");
    expect(typeof engine.initialClock).toBe("function");
    expect(typeof engine.currentTurn).toBe("function");
    expect(typeof engine.narrowToGameState).toBe("function");
    expect(typeof engine.standingScores).toBe("function");
    expect(typeof engine.isValidMove).toBe("function");
    expect(engine.DEFAULT_RUNTIME_CONFIG.maxHealth).toBe(100);
    expect(engine.DEFAULT_RUNTIME_CONFIG.maxGameDurationMs).toBe(0);
  });

  // spec: game-engine/configuration-parameters#no-parameter-the-engine-does-not-read
  it("declares no parameter describing how a board is built", () => {
    expect(Object.keys(engine.DEFAULT_RUNTIME_CONFIG)).not.toContain("boardSize");
    expect(Object.keys(engine.DEFAULT_RUNTIME_CONFIG)).not.toContain("snakesPerTeam");
    expect(Object.keys(engine.DEFAULT_RUNTIME_CONFIG)).not.toContain("hazardPercentage");
    expect("generateBoardAndInitialState" in engine).toBe(false);
  });

  // spec: game-engine/determinism#reproducibility — same state, staged moves,
  // seed AND declared timings give the same outcome, every turn.
  it("plays a full seeded game end to end deterministically", () => {
    const run = () => {
      const gameSeed = new Uint8Array(32).fill(21);
      const config = { ...engine.DEFAULT_RUNTIME_CONFIG, maxTurns: 60 };
      const board = emptyBoard(13);
      const red = tid("red");
      const blue = tid("blue");
      const teams = [red, blue];
      let state = makeState(
        [
          makeSnake({
            snakeId: sid(0),
            centaurTeamId: red,
            body: [{ x: 3, y: 3 }],
            lastDirection: engine.Direction.Right,
          }),
          makeSnake({
            snakeId: sid(1),
            centaurTeamId: blue,
            body: [{ x: 9, y: 9 }],
            lastDirection: engine.Direction.Left,
          }),
        ],
        {
          board,
          clocks: teams.map((t) => engine.initialClock(t, config.clock)),
        },
      );
      const allEvents: engine.TurnEvent[] = [];
      let outcome: engine.GameOutcome = { kind: "in_progress" };
      for (let t = 0; t < 60 && outcome.kind === "in_progress"; t++) {
        const result = engine.advanceTurn(
          state,
          new Map(),
          engine.subSeed(gameSeed, `turn:${t}`),
          timings(state, 250, 100),
          config,
        );
        state = result.nextState;
        outcome = result.outcome;
        allEvents.push(...result.events);
      }
      return { outcome, allEvents, consumed: state.consumedDurationMs };
    };
    const a = run();
    const b = run();
    expect(a.outcome.kind).not.toBe("in_progress"); // the game concluded
    expect(a.allEvents.length).toBeGreaterThan(0);
    expect(a.consumed).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  // spec: game-engine/determinism#time-is-an-input-not-a-reading — the same
  // turn resolved twice from identical inputs agrees in every respect, and a
  // different declared duration is a different input rather than noise.
  it("treats time as an input, not a reading", () => {
    const config = { ...engine.DEFAULT_RUNTIME_CONFIG, maxGameDurationMs: 1000 };
    const clock = (team: string) => ({
      centaurTeamId: tid(team),
      budgetMs: 5000,
      perTurnMs: 5000,
      declaredTurnOver: false,
    });
    const state = makeState(
      [
        makeSnake({ snakeId: sid(0), centaurTeamId: tid("red"), body: [{ x: 3, y: 3 }] }),
        makeSnake({ snakeId: sid(1), centaurTeamId: tid("blue"), body: [{ x: 7, y: 7 }] }),
      ],
      { clocks: [clock("red"), clock("blue")] },
    );
    const short = engine.advanceTurn(state, new Map(), seed(3), timings(state, 100, 100), config);
    const long = engine.advanceTurn(state, new Map(), seed(3), timings(state, 1000, 100), config);
    expect(short.nextState.consumedDurationMs).toBe(100);
    expect(long.nextState.consumedDurationMs).toBe(1000);
    expect(short.outcome.kind).toBe("in_progress");
    expect(long.outcome.kind).not.toBe("in_progress"); // reached the duration limit
  });
});
