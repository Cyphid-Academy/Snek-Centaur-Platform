import { describe, expect, it } from "vitest";
import { gameAudience, parseGameAudience, platformAudience } from "./audience.js";

// spec: identity-and-authorization/audience-bound-tokens
describe("platformAudience", () => {
  it("names the fixed platform audience", () => {
    expect(platformAudience()).toBe("cyphid-platform");
  });
});

describe("gameAudience / parseGameAudience — round trip", () => {
  it("round-trips a game id", () => {
    const aud = gameAudience("game-123");
    expect(aud).toBe("game:game-123");
    expect(parseGameAudience(aud)).toBe("game-123");
  });

  it("throws for an empty game id", () => {
    expect(() => gameAudience("")).toThrow();
  });

  it("parses null for a non-game audience", () => {
    expect(parseGameAudience(platformAudience())).toBeNull();
  });

  it("parses null for a malformed game audience (empty id segment)", () => {
    expect(parseGameAudience("game:")).toBeNull();
  });

  it("parses null for an audience with no recognisable prefix", () => {
    expect(parseGameAudience("not-a-game-audience")).toBeNull();
    expect(parseGameAudience("")).toBeNull();
  });

  it("keeps a game id containing further colons intact (game ids are not subject to the subject-codec separator rule)", () => {
    // gameAudience/parseGameAudience only ever splits on the first "game:"
    // prefix, so this is a distinct, more permissive contract from
    // game-subject's separator-refusal — documented rather than assumed.
    expect(parseGameAudience(gameAudience("g:1"))).toBe("g:1");
  });
});
