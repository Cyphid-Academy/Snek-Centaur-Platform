import { describe, expect, it } from "vitest";
import { invulnerabilityLevel, isVisible } from "./effects.js";
import { effect, makeSnake } from "./testkit.js";

describe("invulnerabilityLevel", () => {
  // spec: 01-REQ-022
  it("is 0 with no active effects", () => {
    expect(invulnerabilityLevel(makeSnake())).toBe(0);
  });

  it("is +1 with an active (invulnerability, buff)", () => {
    const snake = makeSnake({ activeEffects: [effect("invulnerability", "buff", 5)] });
    expect(invulnerabilityLevel(snake)).toBe(1);
  });

  it("is -1 with an active (invulnerability, debuff)", () => {
    const snake = makeSnake({ activeEffects: [effect("invulnerability", "debuff", 5)] });
    expect(invulnerabilityLevel(snake)).toBe(-1);
  });

  it("ignores invisibility-family effects", () => {
    const snake = makeSnake({ activeEffects: [effect("invisibility", "buff", 5)] });
    expect(invulnerabilityLevel(snake)).toBe(0);
  });
});

describe("isVisible", () => {
  // spec: 01-REQ-023
  it("is true with no active effects", () => {
    expect(isVisible(makeSnake())).toBe(true);
  });

  it("is false with an active (invisibility, buff)", () => {
    const snake = makeSnake({ activeEffects: [effect("invisibility", "buff", 5)] });
    expect(isVisible(snake)).toBe(false);
  });

  it("is true for the invisibility collector — (invisibility, debuff) stays visible", () => {
    const snake = makeSnake({ activeEffects: [effect("invisibility", "debuff", 5)] });
    expect(isVisible(snake)).toBe(true);
  });

  it("ignores invulnerability-family effects", () => {
    const snake = makeSnake({ activeEffects: [effect("invulnerability", "buff", 5)] });
    expect(isVisible(snake)).toBe(true);
  });
});
