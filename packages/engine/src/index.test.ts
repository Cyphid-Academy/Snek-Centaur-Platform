import { describe, expect, it } from "vitest";
import * as engine from "./index.js";

// Contract smoke test: the public surface promised by 02 §2.17 exists.
describe("@cyphid/snek-engine public API", () => {
  it("exports the module 01 contract surface", () => {
    expect(engine.Direction.Up).toBe(0);
    expect(engine.CellType.Wall).toBe(1);
    expect(engine.ItemType.Food).toBe(0);
    expect(typeof engine.invulnerabilityLevel).toBe("function");
    expect(typeof engine.isVisible).toBe("function");
    expect(typeof engine.fertileGroundEnabled).toBe("function");
    expect(typeof engine.rngFromSeed).toBe("function");
    expect(typeof engine.subSeed).toBe("function");
    expect(typeof engine.generateBoardAndInitialState).toBe("function");
    expect(typeof engine.resolveTurn).toBe("function");
    expect(typeof engine.initialClock).toBe("function");
    expect(typeof engine.applyTurnStart).toBe("function");
    expect(typeof engine.declareTurnOver).toBe("function");
    expect(typeof engine.isValidMove).toBe("function");
    expect(engine.DEFAULT_GAME_CONFIG.runtime.maxHealth).toBe(100);
  });

  it("plays a full seeded game end to end deterministically", () => {
    // Integration: generate a board, then resolve turns with bot-less
    // fallback moves until the game ends or 60 turns pass. Twice, same seed —
    // identical event streams (replay reproducibility, game-rules/determinism/060).
    const run = () => {
      const gameSeed = new Uint8Array(32).fill(21);
      const config: engine.GameConfig = {
        orchestration: {
          boardSize: 13,
          snakesPerTeam: 2,
          hazardPercentage: 5,
          fertileGround: { density: 25, clustering: 8 },
        },
        runtime: { ...engine.DEFAULT_GAME_CONFIG.runtime, maxTurns: 60 },
      };
      const teams = [
        { centaurTeamId: "red" as engine.CentaurTeamId, name: "Red" },
        { centaurTeamId: "blue" as engine.CentaurTeamId, name: "Blue" },
      ];
      const generated = engine.generateBoardAndInitialState(config, teams, gameSeed);
      if ("code" in generated) throw new Error(`board generation failed: ${generated.code}`);
      let state: engine.GameState = {
        board: generated.board,
        snakes: generated.snakes,
        items: engine.itemsByCell(generated.board, generated.items),
        clocks: teams.map((t) => engine.initialClock(t.centaurTeamId, config.runtime.clock)),
      };
      const allEvents: engine.TurnEvent[] = [];
      let outcome: engine.GameOutcome = { kind: "in_progress" };
      for (let t = 0; t < 60 && outcome.kind === "in_progress"; t++) {
        const turnSeed = engine.subSeed(gameSeed, `turn:${t}`);
        const result = engine.resolveTurn(
          state,
          new Map(),
          t as engine.TurnNumber,
          turnSeed,
          config.runtime,
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
