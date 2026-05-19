import { describe, expect, it } from "vitest";
import { createCentaurStateClient, createPlatformClient, defineBot } from "./index.js";

describe("@cyphid/snek-centaur-server-lib smoke test", () => {
  it("package loads", () => {
    expect(typeof defineBot).toBe("function");
    expect(typeof createPlatformClient).toBe("function");
    expect(typeof createCentaurStateClient).toBe("function");
  });

  it("defineBot throws 'not implemented'", () => {
    expect(() => defineBot({ drives: [], preferences: [] })).toThrow("not implemented");
  });
});
