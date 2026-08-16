import { encodeGameSubject, gameAudience } from "@cyphid/snek-platform-auth";
import { describe, expect, it } from "vitest";
import {
  type AdmissionRejection,
  type PresentedToken,
  type SeededAdmissionContext,
  decideAdmission,
  mayMutateInGame,
} from "./admission.js";

const GAME_ID = "game-1";
const REGISTERED_TEAM = "team-red";
const NOW = 1_000_000;

const ctx: SeededAdmissionContext = {
  gameId: GAME_ID,
  registeredTeamIds: new Set([REGISTERED_TEAM]),
};

function validToken(overrides: Partial<PresentedToken> = {}): PresentedToken {
  return {
    signatureValid: true,
    audience: gameAudience(GAME_ID),
    subject: encodeGameSubject({ role: "operator", userId: "u1" }),
    expiresAtMs: NOW + 60_000,
    ...overrides,
  };
}

// spec: identity-and-authorization/admission-validation
describe("decideAdmission", () => {
  describe("all four roles admitted correctly", () => {
    it("admits an operator", () => {
      const token = validToken({ subject: encodeGameSubject({ role: "operator", userId: "u1" }) });
      const decision = decideAdmission(ctx, token, NOW);
      expect(decision).toEqual({
        admitted: true,
        identity: { role: "operator", userId: "u1", teamId: null },
      });
    });

    it("admits a bot bound to a registered team", () => {
      const token = validToken({
        subject: encodeGameSubject({ role: "bot", teamId: REGISTERED_TEAM }),
      });
      const decision = decideAdmission(ctx, token, NOW);
      expect(decision).toEqual({
        admitted: true,
        identity: { role: "bot", userId: null, teamId: REGISTERED_TEAM },
      });
    });

    it("admits a spectator", () => {
      const token = validToken({ subject: encodeGameSubject({ role: "spectator", userId: "u2" }) });
      const decision = decideAdmission(ctx, token, NOW);
      expect(decision).toEqual({
        admitted: true,
        identity: { role: "spectator", userId: "u2", teamId: null },
      });
    });

    it("admits a coach bound to a registered team", () => {
      const token = validToken({
        subject: encodeGameSubject({ role: "coach", userId: "u3", teamId: REGISTERED_TEAM }),
      });
      const decision = decideAdmission(ctx, token, NOW);
      expect(decision).toEqual({
        admitted: true,
        identity: { role: "coach", userId: "u3", teamId: REGISTERED_TEAM },
      });
    });
  });

  describe("rejection matrix — each check independently violated", () => {
    it("rejects a wrong audience", () => {
      const token = validToken({ audience: gameAudience("some-other-game") });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "wrong-audience" satisfies AdmissionRejection,
      });
    });

    it("rejects an absent audience", () => {
      const token = validToken({ audience: null });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "wrong-audience",
      });
    });

    it("rejects an invalid signature", () => {
      const token = validToken({ signatureValid: false });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "invalid-signature",
      });
    });

    it("rejects a past expiry", () => {
      const token = validToken({ expiresAtMs: NOW - 1 });
      expect(decideAdmission(ctx, token, NOW)).toEqual({ admitted: false, reason: "expired" });
    });

    it("rejects an absent expiry", () => {
      const token = validToken({ expiresAtMs: null });
      expect(decideAdmission(ctx, token, NOW)).toEqual({ admitted: false, reason: "expired" });
    });

    it("rejects a malformed subject", () => {
      const token = validToken({ subject: "not-a-real-subject" });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "malformed-subject",
      });
    });

    it("rejects an absent subject", () => {
      const token = validToken({ subject: null });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "malformed-subject",
      });
    });

    it("rejects an unregistered team for a bot subject", () => {
      const token = validToken({
        subject: encodeGameSubject({ role: "bot", teamId: "team-unregistered" }),
      });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "unregistered-team",
      });
    });

    it("rejects an unregistered team for a coach subject", () => {
      const token = validToken({
        subject: encodeGameSubject({ role: "coach", userId: "u3", teamId: "team-unregistered" }),
      });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "unregistered-team",
      });
    });

    it("does not check team registration for operator or spectator subjects", () => {
      // Neither subject binds a team at all, so an otherwise-valid token
      // for either role is admitted regardless of ctx.registeredTeamIds.
      const emptyCtx: SeededAdmissionContext = { gameId: GAME_ID, registeredTeamIds: new Set() };
      const operatorToken = validToken({
        subject: encodeGameSubject({ role: "operator", userId: "u1" }),
      });
      const spectatorToken = validToken({
        subject: encodeGameSubject({ role: "spectator", userId: "u2" }),
      });
      expect(decideAdmission(emptyCtx, operatorToken, NOW).admitted).toBe(true);
      expect(decideAdmission(emptyCtx, spectatorToken, NOW).admitted).toBe(true);
    });
  });

  describe("ordering", () => {
    it("reports wrong audience even when the signature is also invalid", () => {
      const token = validToken({
        audience: gameAudience("some-other-game"),
        signatureValid: false,
      });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "wrong-audience",
      });
    });

    it("reports invalid signature even when the token is also expired", () => {
      const token = validToken({ signatureValid: false, expiresAtMs: NOW - 1 });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "invalid-signature",
      });
    });

    it("reports expired even when the subject is also malformed", () => {
      const token = validToken({ expiresAtMs: NOW - 1, subject: "garbage" });
      expect(decideAdmission(ctx, token, NOW)).toEqual({ admitted: false, reason: "expired" });
    });

    it("reports malformed subject even when the team would be unregistered", () => {
      // Can't literally combine "malformed subject" with "unregistered team"
      // for the SAME subject (an unregistered team requires a decodable
      // one), so this shows the malformed-subject check runs, full stop,
      // before any team lookup against ctx is attempted.
      const token = validToken({ subject: "bot:" });
      expect(decideAdmission(ctx, token, NOW)).toEqual({
        admitted: false,
        reason: "malformed-subject",
      });
    });
  });

  describe("boundary expiry", () => {
    it("rejects exp === now", () => {
      const token = validToken({ expiresAtMs: NOW });
      expect(decideAdmission(ctx, token, NOW)).toEqual({ admitted: false, reason: "expired" });
    });

    it("admits exp one millisecond past now", () => {
      const token = validToken({ expiresAtMs: NOW + 1 });
      expect(decideAdmission(ctx, token, NOW).admitted).toBe(true);
    });
  });
});

describe("mayMutateInGame — full role matrix", () => {
  it.each([
    ["operator", "u1", null, true],
    ["bot", null, "t1", true],
    ["spectator", "u1", null, false],
    ["coach", "u1", "t1", false],
  ] as const)("role=%s -> %s", (role, userId, teamId, expected) => {
    expect(mayMutateInGame({ role, userId, teamId })).toBe(expected);
  });
});
