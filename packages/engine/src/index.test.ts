import { describe, expect, it } from "vitest";
import type { Direction, GameState } from "./index.js";
import { isValidMove, resolveTurn } from "./index.js";

describe("@cyphid/snek-engine smoke test", () => {
  it("package loads and exports the expected types", () => {
    const direction: Direction = "Up";
    expect(direction).toBe("Up");
  });

  it("resolveTurn throws 'not implemented'", () => {
    const fakeState = {} as GameState;
    expect(() => resolveTurn(fakeState, {})).toThrow("not implemented");
  });

  it("isValidMove throws 'not implemented'", () => {
    const fakeState = {} as GameState;
    expect(() => isValidMove(fakeState, "snake-1", "Up")).toThrow("not implemented");
  });
});
