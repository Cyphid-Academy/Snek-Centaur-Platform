import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  CAPABILITIES_CLAIM,
  type Capability,
  GAME_CREDENTIAL_CAPABILITIES,
  hasCapability,
  readCapabilityEntries,
} from "./capabilities.js";

// spec: identity-and-authorization/capability-claim-structure
describe("capability vocabulary", () => {
  it("includes every capability the spec names at minimum", () => {
    const required: ReadonlyArray<Capability> = [
      "use-platform",
      "configure-games",
      "designate-boards",
      "issue-game-tokens",
      "write-centaur-state",
      "request-bot-tokens",
      "administer-platform",
    ];
    for (const verb of required) {
      expect(CAPABILITIES).toContain(verb);
    }
  });
});

describe("readCapabilityEntries — structural parse, never a string split", () => {
  it("parses a well-formed entries array", () => {
    const entries = readCapabilityEntries({
      [CAPABILITIES_CLAIM]: [{ verb: "use-platform" }, { verb: "configure-games" }],
    });
    expect(entries).toEqual([{ verb: "use-platform" }, { verb: "configure-games" }]);
  });

  it("parses an empty entries array", () => {
    expect(readCapabilityEntries({ [CAPABILITIES_CLAIM]: [] })).toEqual([]);
  });

  it("returns null when the claim is missing", () => {
    expect(readCapabilityEntries({})).toBeNull();
  });

  it("returns null when the claim is a string rather than an array — #structured-from-the-first-token", () => {
    expect(
      readCapabilityEntries({ [CAPABILITIES_CLAIM]: "use-platform,configure-games" }),
    ).toBeNull();
  });

  it("returns null when the claim is an array of bare strings", () => {
    expect(readCapabilityEntries({ [CAPABILITIES_CLAIM]: ["use-platform"] })).toBeNull();
  });

  it("returns null for a heterogeneous array (some entries, some strings)", () => {
    expect(
      readCapabilityEntries({
        [CAPABILITIES_CLAIM]: [{ verb: "use-platform" }, "configure-games"],
      }),
    ).toBeNull();
  });

  it("returns null when an entry names a verb outside the closed union", () => {
    expect(
      readCapabilityEntries({ [CAPABILITIES_CLAIM]: [{ verb: "delete-everything" }] }),
    ).toBeNull();
  });

  it("returns null when an entry's verb is not a string", () => {
    expect(readCapabilityEntries({ [CAPABILITIES_CLAIM]: [{ verb: 1 }] })).toBeNull();
  });

  it("returns null when an entry is null or an array rather than an object", () => {
    expect(readCapabilityEntries({ [CAPABILITIES_CLAIM]: [null] })).toBeNull();
    expect(readCapabilityEntries({ [CAPABILITIES_CLAIM]: [["use-platform"]] })).toBeNull();
  });

  it("tolerates fields on an entry beyond verb — forward-compatible with a later constraint", () => {
    expect(
      readCapabilityEntries({
        [CAPABILITIES_CLAIM]: [{ verb: "write-centaur-state", scope: "team-1" }],
      }),
    ).toEqual([{ verb: "write-centaur-state" }]);
  });
});

describe("hasCapability", () => {
  it("finds a granted verb", () => {
    expect(hasCapability([{ verb: "use-platform" }], "use-platform")).toBe(true);
  });
  it("misses an ungranted verb", () => {
    expect(hasCapability([{ verb: "use-platform" }], "administer-platform")).toBe(false);
  });
  it("misses on an empty entry list", () => {
    expect(hasCapability([], "use-platform")).toBe(false);
  });
});

// spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
describe("GAME_CREDENTIAL_CAPABILITIES", () => {
  it("grants exactly write-centaur-state and request-bot-tokens", () => {
    expect(GAME_CREDENTIAL_CAPABILITIES).toEqual([
      { verb: "write-centaur-state" },
      { verb: "request-bot-tokens" },
    ]);
  });

  it("parses back through readCapabilityEntries unchanged", () => {
    const claims = { [CAPABILITIES_CLAIM]: GAME_CREDENTIAL_CAPABILITIES };
    expect(readCapabilityEntries(claims)).toEqual(GAME_CREDENTIAL_CAPABILITIES);
  });
});
