import { describe, expect, it } from "vitest";

describe("@cyphid/snek-convex-host smoke test", () => {
  it("package loads", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
