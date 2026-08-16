import { describe, expect, it } from "vitest";
import {
  type GameSubject,
  decodeGameSubject,
  encodeGameSubject,
  mayMutate,
  roleOf,
  teamBindingOf,
} from "./game-subject.js";

// spec: identity-and-authorization/game-token-contents
describe("game-subject codec", () => {
  const cases: ReadonlyArray<{ readonly subject: GameSubject; readonly wire: string }> = [
    { subject: { role: "operator", userId: "u1" }, wire: "operator:u1" },
    { subject: { role: "bot", teamId: "t1" }, wire: "bot:t1" },
    { subject: { role: "spectator", userId: "u2" }, wire: "spectator:u2" },
    { subject: { role: "coach", userId: "u3", teamId: "t3" }, wire: "coach:u3:t3" },
  ];

  it.each(cases)("round-trips $subject.role", ({ subject, wire }) => {
    expect(encodeGameSubject(subject)).toBe(wire);
    expect(decodeGameSubject(wire)).toEqual(subject);
  });

  it("round-trips every role exhaustively via decode(encode(x)) === x", () => {
    for (const { subject } of cases) {
      expect(decodeGameSubject(encodeGameSubject(subject))).toEqual(subject);
    }
  });

  // #subject-alone-decides-the-role — the two roles arrive as different
  // wire forms/identities, never a shared identity plus a role flag.
  it("gives operator and spectator distinct wire forms for the same userId", () => {
    const operator = encodeGameSubject({ role: "operator", userId: "same" });
    const spectator = encodeGameSubject({ role: "spectator", userId: "same" });
    expect(operator).not.toBe(spectator);
  });

  describe("decodeGameSubject — malformed inputs decode to null", () => {
    const malformed: ReadonlyArray<[label: string, raw: string]> = [
      ["unknown role", "admin:u1"],
      ["empty string", ""],
      ["role only, no id", "operator"],
      ["role with empty id", "operator:"],
      ["spectator with empty id", "spectator:"],
      ["bot with empty id", "bot:"],
      ["operator with extra segment", "operator:u1:extra"],
      ["bot with extra segment", "bot:t1:extra"],
      ["spectator with extra segment", "spectator:u1:extra"],
      ["coach with too few segments", "coach:u1"],
      ["coach with too many segments", "coach:u1:t1:extra"],
      ["coach with empty userId", "coach::t1"],
      ["coach with empty teamId", "coach:u1:"],
      ["coach with both empty", "coach::"],
      ["trailing separator only", ":"],
      ["blank role", ":u1"],
    ];

    it.each(malformed)("%s (%s) -> null", (_label, raw) => {
      expect(decodeGameSubject(raw)).toBeNull();
    });
  });

  describe("encodeGameSubject — refuses ids containing the separator", () => {
    it("throws for an operator userId containing ':'", () => {
      expect(() => encodeGameSubject({ role: "operator", userId: "a:b" })).toThrow();
    });
    it("throws for a bot teamId containing ':'", () => {
      expect(() => encodeGameSubject({ role: "bot", teamId: "a:b" })).toThrow();
    });
    it("throws for a coach userId or teamId containing ':'", () => {
      expect(() => encodeGameSubject({ role: "coach", userId: "a:b", teamId: "t1" })).toThrow();
      expect(() => encodeGameSubject({ role: "coach", userId: "u1", teamId: "a:b" })).toThrow();
    });
  });

  describe("encodeGameSubject — refuses empty ids", () => {
    it("throws for an empty userId", () => {
      expect(() => encodeGameSubject({ role: "operator", userId: "" })).toThrow();
    });
    it("throws for an empty teamId", () => {
      expect(() => encodeGameSubject({ role: "bot", teamId: "" })).toThrow();
    });
  });

  describe("roleOf", () => {
    it.each(cases)("reads $subject.role back from the subject", ({ subject }) => {
      expect(roleOf(subject)).toBe(subject.role);
    });
  });

  describe("teamBindingOf", () => {
    it("returns null for operator and spectator", () => {
      expect(teamBindingOf({ role: "operator", userId: "u1" })).toBeNull();
      expect(teamBindingOf({ role: "spectator", userId: "u1" })).toBeNull();
    });
    it("returns the bound team for bot and coach", () => {
      expect(teamBindingOf({ role: "bot", teamId: "t1" })).toBe("t1");
      expect(teamBindingOf({ role: "coach", userId: "u1", teamId: "t2" })).toBe("t2");
    });
  });

  // spec: identity-and-authorization/role-bound-privileges#spectator-and-coach-never-mutate
  describe("mayMutate — full role matrix", () => {
    it.each([
      ["operator", true],
      ["bot", true],
      ["spectator", false],
      ["coach", false],
    ] as const)("mayMutate(%s) === %s", (role, expected) => {
      expect(mayMutate(role)).toBe(expected);
    });
  });
});
