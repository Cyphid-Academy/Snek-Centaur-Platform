import { describe, expect, it } from "vitest";
import * as engine from "./index.js";
import { emptyBoard, makeSnake, makeState, sid, tid } from "./testkit.js";

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
    expect(typeof engine.resolveTurn).toBe("function");
    expect(typeof engine.initialClock).toBe("function");
    expect(typeof engine.applyTurnStart).toBe("function");
    expect(typeof engine.declareTurnOver).toBe("function");
    expect(typeof engine.isValidMove).toBe("function");
    expect(engine.DEFAULT_RUNTIME_CONFIG.maxHealth).toBe(100);
  });

  // spec: game-engine/configuration-parameters#no-parameter-the-engine-does-not-read
  it("declares no parameter describing how a board is built", () => {
    expect(Object.keys(engine.DEFAULT_RUNTIME_CONFIG)).not.toContain("boardSize");
    expect(Object.keys(engine.DEFAULT_RUNTIME_CONFIG)).not.toContain("snakesPerTeam");
    expect(Object.keys(engine.DEFAULT_RUNTIME_CONFIG)).not.toContain("hazardPercentage");
    expect("generateBoardAndInitialState" in engine).toBe(false);
  });

  // spec: game-engine/determinism#reproducibility
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
        const result = engine.resolveTurn(
          state,
          new Map(),
          t as engine.TurnNumber,
          engine.subSeed(gameSeed, `turn:${t}`),
          config,
        );
        state = result.nextState;
        outcome = result.outcome;
        allEvents.push(...result.events);
      }
      return { outcome, allEvents };
    };
    const a = run();
    const b = run();
    expect(a.outcome.kind).not.toBe("in_progress"); // the game concluded
    expect(a.allEvents.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});
