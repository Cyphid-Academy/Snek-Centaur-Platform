// The capability registry wrapper's runtime behaviour: authentication
// required, capability decides reachability FIRST, kind is checked AFTER
// and independently, and the resolved caller reaches the handler.
// spec: identity-and-authorization/capability-registry
// spec: identity-and-authorization/principal-kind-gating
import {
  ACTING_PRINCIPAL_CLAIM,
  CAPABILITIES_CLAIM,
  GAME_CREDENTIAL_SCOPE_CLAIM,
} from "@cyphid/snek-platform-auth";
import { beforeAll, describe, expect, it } from "vitest";
import {
  TEST_CONVEX_SITE_URL,
  gameCredentialIdentity,
  gamesApi,
  humanIdentity,
  makeHuman,
  setAuthEnv,
  setup,
  tokensApi,
} from "./setup";

beforeAll(() => {
  setAuthEnv();
});

describe("authentication is required", () => {
  it("refuses an unauthenticated caller on every wrapped function", async () => {
    // spec: identity-and-authorization/authentication-required#unauthenticated-refused
    const t = setup();
    const read = await t.query(gamesApi.getGame, { gameId: "anything" });
    expect(read).toEqual({ ok: false, rejection: { kind: "unauthenticated" } });
    const write = await t.mutation(gamesApi.createGame, { roomId: null });
    expect(write).toEqual({ ok: false, rejection: { kind: "unauthenticated" } });
  });

  it("refuses a credential without the structured capabilities claim", async () => {
    // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
    const t = setup();
    const { userId } = await makeHuman(t);
    // A capability claim that is a STRING is not read — never split.
    const asStringClaims = t.withIdentity({
      subject: userId,
      issuer: TEST_CONVEX_SITE_URL,
      [CAPABILITIES_CLAIM]: "use-platform configure-games",
    });
    const result = await asStringClaims.mutation(gamesApi.createGame, { roomId: null });
    expect(result.ok).toBe(false);
    expect(result.rejection.kind).toBe("malformed-credential");
  });

  it("refuses a human credential that resolves to no persistent user record", async () => {
    // spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
    const t = setup();
    const ghost = t.withIdentity(humanIdentity("no-such-user"));
    const result = await ghost.mutation(gamesApi.createGame, { roomId: null });
    expect(result.ok).toBe(false);
    expect(result.rejection.kind).toBe("malformed-credential");
  });
});

describe("capability decides reachability first", () => {
  it("refuses a caller whose entries lack the declared capability, naming it", async () => {
    const t = setup();
    const { userId, identity } = await makeHuman(t);
    const created = await t.withIdentity(identity).mutation(gamesApi.createGame, { roomId: null });
    expect(created.ok).toBe(true);
    const narrowed = t.withIdentity({
      subject: userId,
      issuer: TEST_CONVEX_SITE_URL,
      [CAPABILITIES_CLAIM]: [{ verb: "use-platform" }],
    });
    const result = await narrowed.mutation(gamesApi.createGame, { roomId: null });
    expect(result).toEqual({
      ok: false,
      rejection: { kind: "capability-refused", required: "configure-games" },
    });
    // The narrowed credential still reaches what it IS scoped for.
    const read = await narrowed.query(gamesApi.getGame, { gameId: created.gameId });
    expect(read.gameId).toBe(created.gameId);
  });

  it("orders the checks: a barred kind WITHOUT the capability is refused on capability, not kind", async () => {
    // spec: identity-and-authorization/principal-kind-gating ("whether a
    // credential reaches a function at all is decided from its
    // capabilities first")
    const t = setup();
    const asTeam = t.withIdentity(gameCredentialIdentity("team-red", "game-1"));
    // A game credential's entries are write-centaur-state and
    // request-bot-tokens — no configure-games — so the capability check
    // refuses before the kind check is reached.
    const result = await asTeam.mutation(gamesApi.createGame, { roomId: null });
    expect(result).toEqual({
      ok: false,
      rejection: { kind: "capability-refused", required: "configure-games" },
    });
  });
});

describe("kind is checked independently of capability", () => {
  it("refuses a barred kind whose capabilities INCLUDE the operation", async () => {
    // spec: identity-and-authorization/principal-kind-gating#kind-is-checked-independently-of-capability
    const t = setup();
    // A hypothetical service credential carrying configure-games: the
    // capability check passes, and the call is STILL refused — on kind.
    const asTeam = t.withIdentity({
      subject: "team-red",
      issuer: TEST_CONVEX_SITE_URL,
      [ACTING_PRINCIPAL_CLAIM]: "team-red",
      [GAME_CREDENTIAL_SCOPE_CLAIM]: { gameId: "game-1", teamId: "team-red" },
      [CAPABILITIES_CLAIM]: [{ verb: "configure-games" }],
    });
    const result = await asTeam.mutation(gamesApi.createGame, { roomId: null });
    expect(result).toEqual({
      ok: false,
      rejection: {
        kind: "kind-refused",
        callerKind: "centaur-team",
        accepted: ["human"],
      },
    });
  });

  it("refuses an external system at a humans-only function on kind, never inferring reach from breadth", async () => {
    // spec: identity-and-authorization/principal-kind-gating#service-reach-is-declared-never-inferred
    const t = setup();
    const asSystem = t.withIdentity({
      subject: "peer-system",
      issuer: TEST_CONVEX_SITE_URL,
      [ACTING_PRINCIPAL_CLAIM]: "peer-system",
      [CAPABILITIES_CLAIM]: [{ verb: "configure-games" }, { verb: "issue-game-tokens" }],
    });
    const result = await asSystem.mutation(gamesApi.createGame, { roomId: null });
    expect(result.ok).toBe(false);
    expect(result.rejection.kind).toBe("kind-refused");
    expect(result.rejection.callerKind).toBe("external-system");
  });

  it("humans cannot reach the one centaur-team function even with the capability", async () => {
    const t = setup();
    const { userId } = await makeHuman(t);
    const asHuman = t.withIdentity({
      subject: userId,
      issuer: TEST_CONVEX_SITE_URL,
      [CAPABILITIES_CLAIM]: [{ verb: "request-bot-tokens" }],
    });
    const result = await asHuman.action(tokensApi.issueBotToken, {
      gameId: "game-1",
      teamId: "team-red",
    });
    expect(result.ok).toBe(false);
    expect(result.rejection.kind).toBe("kind-refused");
    expect(result.rejection.accepted).toEqual(["centaur-team"]);
  });
});
