// Game access token issuance — the four roles' eligibility rules, the
// facts every minted token carries, and MINT-TO-ADMIT COHERENCE: a token
// minted by the platform, verified with jose against the platform's own
// served JWKS, admits through the game instance's pure admission core
// (@cyphid/snek-stdb decideAdmission) with exactly the identity and
// privileges its subject encodes. The two runtimes share only the
// published verification material and the @cyphid/snek-platform-auth
// vocabulary — which is the whole point.
// spec: identity-and-authorization/participant-token-eligibility
// spec: identity-and-authorization/spectator-tokens
// spec: identity-and-authorization/coach-tokens
// spec: identity-and-authorization/game-token-contents
// spec: identity-and-authorization/live-game-issuance
import {
  decodeGameSubject,
  gameAudience,
  readCapabilityEntries,
  teamBindingOf,
} from "@cyphid/snek-platform-auth";
import { type PresentedToken, decideAdmission, mayMutateInGame } from "@cyphid/snek-stdb";
import * as jose from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { WORKING_CREDENTIAL_LIFETIME_SECONDS } from "../convex/auth";
import type { TokenResult } from "../convex/tokens";
import {
  type T,
  gameCredentialIdentity,
  launchGameAs,
  makeHuman,
  setAuthEnv,
  setup,
  testSupport,
  tokensApi,
} from "./setup";

beforeAll(() => {
  setAuthEnv();
});

/**
 * A playing game whose roster snapshot names an operator on team-red and a
 * designated coach of team-red, plus humans outside the roster entirely.
 * Issuance answers from these snapshot fields, never from current team
 * records (spec: identity-and-authorization/roster-snapshot-binding).
 */
async function scenario(t: T) {
  const configurer = await makeHuman(t, { name: "Configurer" });
  const operator = await makeHuman(t, { name: "Red Operator" });
  const coach = await makeHuman(t, { name: "Red Coach" });
  const outsider = await makeHuman(t, { name: "Outsider" });
  const admin = await makeHuman(t, { name: "Platform Admin", isAdmin: true });
  const gameId = await launchGameAs(t, configurer.identity);
  await t.mutation(testSupport.setRosterSnapshot, {
    gameId,
    entries: [
      {
        centaurTeamId: "team-red",
        memberUserIds: [operator.userId],
        coachUserIds: [coach.userId],
      },
      { centaurTeamId: "team-blue", memberUserIds: [], coachUserIds: [] },
    ],
  });
  return { gameId, operator, coach, outsider, admin };
}

const expectIssued = (result: TokenResult): { token: string; expiresAtMs: number } => {
  if (!result.ok) throw new Error(`expected issuance, got ${JSON.stringify(result)}`);
  return result;
};

describe("operator tokens", () => {
  it("refuses an authenticated human the roster snapshot does not place on a participating team", async () => {
    // spec: identity-and-authorization/participant-token-eligibility#operator-outside-roster-refused
    const t = setup();
    const { gameId, outsider } = await scenario(t);
    const result = await t
      .withIdentity(outsider.identity)
      .action(tokensApi.issueOperatorToken, { gameId });
    expect(result).toEqual({ ok: false, rejection: { kind: "not-on-roster" } });
  });

  it("issues to a roster member, subject encoding the operator role and the acting human", async () => {
    // spec: identity-and-authorization/participant-token-eligibility
    // spec: identity-and-authorization/game-token-contents
    const t = setup();
    const { gameId, operator } = await scenario(t);
    const result = await t
      .withIdentity(operator.identity)
      .action(tokensApi.issueOperatorToken, { gameId });
    const { token } = expectIssued(result);
    const subject = decodeGameSubject(jose.decodeJwt(token).sub as string);
    expect(subject).toEqual({ role: "operator", userId: operator.userId });
  });
});

describe("spectator tokens", () => {
  it("issues to ANY authenticated human — team membership is not a precondition — with NO team binding in the decoded subject", async () => {
    // spec: identity-and-authorization/spectator-tokens#any-authenticated-human-may-request
    // spec: identity-and-authorization/spectator-tokens#no-team-binding
    const t = setup();
    const { gameId, outsider } = await scenario(t);
    const result = await t
      .withIdentity(outsider.identity)
      .action(tokensApi.issueSpectatorToken, { gameId });
    const { token } = expectIssued(result);
    const subject = decodeGameSubject(jose.decodeJwt(token).sub as string);
    expect(subject).toEqual({ role: "spectator", userId: outsider.userId });
    // The absent binding is what makes the connection a spectator
    // connection — structurally, not by a checked flag.
    expect(teamBindingOf(subject!)).toBeNull();
  });
});

describe("coach tokens", () => {
  it("refuses a coach token for a team that is not a participant, however valid the designation", async () => {
    // spec: identity-and-authorization/coach-tokens#coach-of-nonparticipating-team-refused
    const t = setup();
    const { gameId, coach } = await scenario(t);
    const result = await t
      .withIdentity(coach.identity)
      .action(tokensApi.issueCoachToken, { gameId, teamId: "team-green" });
    expect(result).toEqual({ ok: false, rejection: { kind: "team-not-participating" } });
  });

  it("refuses a human who is neither designated nor admin", async () => {
    // spec: identity-and-authorization/coach-tokens
    const t = setup();
    const { gameId, outsider } = await scenario(t);
    const result = await t
      .withIdentity(outsider.identity)
      .action(tokensApi.issueCoachToken, { gameId, teamId: "team-red" });
    expect(result).toEqual({ ok: false, rejection: { kind: "not-a-designated-coach" } });
  });

  it("issues to a designated coach, bound to that team", async () => {
    // spec: identity-and-authorization/coach-tokens
    const t = setup();
    const { gameId, coach } = await scenario(t);
    const result = await t
      .withIdentity(coach.identity)
      .action(tokensApi.issueCoachToken, { gameId, teamId: "team-red" });
    const { token } = expectIssued(result);
    const subject = decodeGameSubject(jose.decodeJwt(token).sub as string);
    expect(subject).toEqual({ role: "coach", userId: coach.userId, teamId: "team-red" });
  });

  it("issues to the platform admin WITHOUT designation — an implicit coach of every team", async () => {
    // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
    const t = setup();
    const { gameId, admin } = await scenario(t);
    // team-blue designates no coaches at all; admin standing alone issues.
    const result = await t
      .withIdentity(admin.identity)
      .action(tokensApi.issueCoachToken, { gameId, teamId: "team-blue" });
    const { token } = expectIssued(result);
    const subject = decodeGameSubject(jose.decodeJwt(token).sub as string);
    expect(subject).toEqual({ role: "coach", userId: admin.userId, teamId: "team-blue" });
  });
});

describe("bot tokens", () => {
  it("issues under a game credential for its own team in its own game, subject binding the team", async () => {
    // spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
    const t = setup();
    const { gameId } = await scenario(t);
    const result = await t
      .withIdentity(gameCredentialIdentity("team-red", gameId))
      .action(tokensApi.issueBotToken, { gameId, teamId: "team-red" });
    const { token } = expectIssued(result);
    const subject = decodeGameSubject(jose.decodeJwt(token).sub as string);
    expect(subject).toEqual({ role: "bot", teamId: "team-red" });
  });

  it("refuses a credential scoped to another team — possession grants nothing outside its named team", async () => {
    // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-team
    const t = setup();
    const { gameId } = await scenario(t);
    const result = await t
      .withIdentity(gameCredentialIdentity("team-red", gameId))
      .action(tokensApi.issueBotToken, { gameId, teamId: "team-blue" });
    expect(result).toEqual({ ok: false, rejection: { kind: "outside-credential-scope" } });
  });

  it("refuses a credential scoped to another game — two games mean two credentials, neither reaching the other's", async () => {
    // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-game
    const t = setup();
    const { gameId } = await scenario(t);
    const result = await t
      .withIdentity(gameCredentialIdentity("team-red", "some-other-game"))
      .action(tokensApi.issueBotToken, { gameId, teamId: "team-red" });
    expect(result).toEqual({ ok: false, rejection: { kind: "outside-credential-scope" } });
  });
});

describe("liveness is re-checked per request", () => {
  it("refuses ALL FOUR roles once the game is no longer playing", async () => {
    // spec: identity-and-authorization/live-game-issuance#no-tokens-for-finished-games
    const t = setup();
    const { gameId, operator, coach, outsider } = await scenario(t);

    // While playing, each role issues…
    expectIssued(
      await t.withIdentity(operator.identity).action(tokensApi.issueOperatorToken, { gameId }),
    );
    expectIssued(
      await t.withIdentity(outsider.identity).action(tokensApi.issueSpectatorToken, { gameId }),
    );

    await t.mutation(testSupport.finishGame, { gameId });

    // …and the very next request under every role is refused.
    const refusal = { ok: false, rejection: { kind: "game-not-playing", phase: "finished" } };
    expect(
      await t.withIdentity(operator.identity).action(tokensApi.issueOperatorToken, { gameId }),
    ).toEqual(refusal);
    expect(
      await t.withIdentity(outsider.identity).action(tokensApi.issueSpectatorToken, { gameId }),
    ).toEqual(refusal);
    expect(
      await t
        .withIdentity(coach.identity)
        .action(tokensApi.issueCoachToken, { gameId, teamId: "team-red" }),
    ).toEqual(refusal);
    expect(
      await t
        .withIdentity(gameCredentialIdentity("team-red", gameId))
        .action(tokensApi.issueBotToken, { gameId, teamId: "team-red" }),
    ).toEqual(refusal);
  });
});

describe("token facts", () => {
  it("mints game tokens with exp − iat = 15 minutes, aud = gameAudience(gameId), and a structured capability claim the shared reader parses", async () => {
    // spec: identity-and-authorization/token-lifetime-and-refresh#only-the-stateful-session-outlives-the-bound
    // spec: identity-and-authorization/audience-bound-tokens
    // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
    const t = setup();
    const { gameId, operator } = await scenario(t);
    const { token, expiresAtMs } = expectIssued(
      await t.withIdentity(operator.identity).action(tokensApi.issueOperatorToken, { gameId }),
    );
    const claims = jose.decodeJwt(token) as Record<string, unknown> & jose.JWTPayload;
    expect(claims.exp! - claims.iat!).toBe(WORKING_CREDENTIAL_LIFETIME_SECONDS);
    expect(expiresAtMs).toBe(claims.exp! * 1000);
    expect(claims.aud).toBe(gameAudience(gameId));
    // Present and parseable from the first token — and EMPTY: a game
    // token's in-game privilege derives from its subject's role alone.
    // spec: identity-and-authorization/game-token-contents#subject-alone-decides-the-role
    expect(readCapabilityEntries(claims)).toEqual([]);
  });

  it("verifies end to end against the served JWKS with jose alone", async () => {
    // spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
    const t = setup();
    const { gameId, operator } = await scenario(t);
    const { token } = expectIssued(
      await t.withIdentity(operator.identity).action(tokensApi.issueOperatorToken, { gameId }),
    );
    const jwksResponse = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const keySet = jose.createLocalJWKSet((await jwksResponse.json()) as jose.JSONWebKeySet);
    const { payload } = await jose.jwtVerify(token, keySet, { audience: gameAudience(gameId) });
    expect(decodeGameSubject(payload.sub as string)).toEqual({
      role: "operator",
      userId: operator.userId,
    });
  });
});

// ---------------------------------------------------------------------------
// Mint-to-admit coherence across runtimes
// ---------------------------------------------------------------------------

describe("end to end with the instance's admission core", () => {
  /**
   * What the instance's own startup-seeded validation would yield for a
   * platform-minted token: verify with jose against the platform's served
   * JWKS — consulting nothing and no one else — and surface the verified
   * claims as the admission core's PresentedToken.
   * spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
   */
  async function validateAsInstance(t: T, token: string): Promise<PresentedToken> {
    const jwksResponse = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const keySet = jose.createLocalJWKSet((await jwksResponse.json()) as jose.JSONWebKeySet);
    const { payload } = await jose.jwtVerify(token, keySet);
    return {
      signatureValid: true,
      audience: typeof payload.aud === "string" ? payload.aud : null,
      subject: typeof payload.sub === "string" ? payload.sub : null,
      expiresAtMs: typeof payload.exp === "number" ? payload.exp * 1000 : null,
    };
  }

  it("admits a platform-minted operator token as a mutating operator identity", async () => {
    // spec: identity-and-authorization/admission-validation
    // spec: identity-and-authorization/role-bound-privileges
    const t = setup();
    const { gameId, operator } = await scenario(t);
    const { token } = expectIssued(
      await t.withIdentity(operator.identity).action(tokensApi.issueOperatorToken, { gameId }),
    );
    const decision = decideAdmission(
      { gameId, registeredTeamIds: new Set(["team-red", "team-blue"]) },
      await validateAsInstance(t, token),
      Date.now(),
    );
    expect(decision).toEqual({
      admitted: true,
      identity: { role: "operator", userId: operator.userId, teamId: null },
    });
    if (!decision.admitted) throw new Error("unreachable");
    expect(mayMutateInGame(decision.identity)).toBe(true);
  });

  it("admits a platform-minted spectator token as a read-only identity — structurally, from the subject alone", async () => {
    // spec: identity-and-authorization/game-token-contents#subject-alone-decides-the-role
    // spec: identity-and-authorization/role-bound-privileges#spectator-and-coach-never-mutate
    const t = setup();
    const { gameId, outsider } = await scenario(t);
    const { token } = expectIssued(
      await t.withIdentity(outsider.identity).action(tokensApi.issueSpectatorToken, { gameId }),
    );
    const decision = decideAdmission(
      { gameId, registeredTeamIds: new Set(["team-red", "team-blue"]) },
      await validateAsInstance(t, token),
      Date.now(),
    );
    expect(decision).toEqual({
      admitted: true,
      identity: { role: "spectator", userId: outsider.userId, teamId: null },
    });
    if (!decision.admitted) throw new Error("unreachable");
    expect(mayMutateInGame(decision.identity)).toBe(false);
  });

  it("rejects a token minted for a different game on wrong-audience — the binding is checked before anything else", async () => {
    // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
    // spec: identity-and-authorization/game-token-contents#token-names-its-game
    const t = setup();
    const { gameId, operator } = await scenario(t);
    const { token } = expectIssued(
      await t.withIdentity(operator.identity).action(tokensApi.issueOperatorToken, { gameId }),
    );
    // The same cryptographically valid token, presented to another game's
    // instance: refused on the binding alone.
    const decision = decideAdmission(
      { gameId: "a-different-game", registeredTeamIds: new Set(["team-red", "team-blue"]) },
      await validateAsInstance(t, token),
      Date.now(),
    );
    expect(decision).toEqual({ admitted: false, reason: "wrong-audience" });
  });
});
