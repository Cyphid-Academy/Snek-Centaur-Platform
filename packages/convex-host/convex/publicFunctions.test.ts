// spec: identity-and-authorization/principal-kind-gating,
//       identity-and-authorization/anonymous-reach,
//       identity-and-authorization/capability-registry,
//       identity-and-authorization/authentication-required
// The enforcement site, exercised through the real public surface.
//
// `capabilities.ts` declares what reaches each function and `publicFunctions.ts`
// enforces it once, before any handler runs. These tests therefore go through
// `convexTest` and the deployment's actual functions rather than exercising the
// checks' pieces in isolation: what is pinned is the surface a caller meets, so
// a regression in the builders' wiring — not just in a check's logic — fails
// here. Every refusal asserted sits beside a positive path that differs from it
// in exactly one respect, so no test stays green against a gate that refuses
// everything.
//
// `_generated/api.d.ts` predates `issuance.ts` (its module list has no
// `issuance` entry), so the typed `api` cannot name those functions; `anyApi`
// resolves the same paths untyped and convex-test still validates arguments
// against the real validators.
import { anyApi } from "convex/server";
import { type JWK, SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { type CapabilityEntry, mint } from "./auth/credential";
import { PLATFORM_AUDIENCE, type PlatformPrincipal, encodePrincipal } from "./auth/deployment";
import {
  ANONYMOUS_CAPABILITIES,
  CAPABILITIES,
  type Capability,
  GAME_CREDENTIAL_CAPABILITIES,
} from "./capabilities";
import { type Harness, challengeFor, inPlatformComponent, withComponents } from "./harness.testing";
import { CALLS_PER_WINDOW, CALL_WINDOW_MS } from "./publicFunctions";

const ALG = "ES256";
const ISSUER = "https://platform.example";
// A registered Snek Centaur Server: its issuer id, where it publishes its
// verification material, and where signed-in humans may be returned to.
const SERVER_ID = "server.example";
const JWKS_URL = "https://server.example/.well-known/jwks.json";
const RETURN_ADDRESS = "https://server.example/auth/callback";

// One verifier for the whole suite. Nothing here tests PKCE itself — that is
// `issuance.test.ts`'s job — so what these cases need of a handoff is only that
// it can be begun and redeemed, and a fixed pair keeps the gate under test in
// view rather than the proof.
const VERIFIER = "verifier-for-the-gate-tests";

// The deployment's signing key, supplied through the environment exactly as the
// Convex runtime supplies it, and a Server's own keypair — a different key,
// because a Server proves itself with material it published, never ours.
let deploymentKey: CryptoKey;
let serverKey: CryptoKey;
let serverPublicJwk: JWK;

beforeAll(async () => {
  const deployment = await generateKeyPair(ALG, { extractable: true });
  deploymentKey = deployment.privateKey;
  process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(await exportJWK(deployment.privateKey));
  process.env["CONVEX_SITE_URL"] = ISSUER;

  const server = await generateKeyPair(ALG, { extractable: true });
  serverKey = server.privateKey;
  serverPublicJwk = await exportJWK(server.publicKey);

  // The one network call issuance makes is reading the JWKS a principal's
  // registration records; serve it from the test so the suite needs no network.
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    if (String(url) !== JWKS_URL) throw new Error(`unexpected fetch of ${String(url)}`);
    return new Response(JSON.stringify({ keys: [serverPublicJwk] }));
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const registerServer = (
  t: Harness,
  capabilityCeiling: ReadonlyArray<Capability> = ["issue-game-credential"],
) =>
  inPlatformComponent(t, (ctx) =>
    ctx.db.insert("trusted_issuers", {
      issuerId: SERVER_ID,
      verificationMaterialUrl: JWKS_URL,
      capabilityCeiling: [...capabilityCeiling],
      returnAddresses: [RETURN_ADDRESS],
    }),
  );

const seedTeam = (t: Harness, serverDomain: string | null = SERVER_ID) =>
  inPlatformComponent(t, (ctx) => ctx.db.insert("centaur_teams", { serverDomain }));

const seedPlayingGame = (
  t: Harness,
  teamIds: ReadonlyArray<string>,
  memberUserIds: ReadonlyArray<string> = [],
) =>
  inPlatformComponent(t, (ctx) =>
    ctx.db.insert("games", {
      status: "playing",
      roster: teamIds.map((teamId) => ({
        teamId,
        memberUserIds: [...memberUserIds],
        coachUserIds: [],
      })),
    }),
  );

const entries = (capabilities: ReadonlyArray<Capability>): ReadonlyArray<CapabilityEntry> =>
  capabilities.map((capability) => ({ capability }));

/**
 * A credential of this deployment's own minting, for whatever principal and
 * claim a case needs. `act` names the registered system the call comes through,
 * exactly as issuance stamps it — the only thing that tells a call made through
 * a system from one the same principal made directly.
 */
const credentialFor = (
  principal: PlatformPrincipal,
  capabilities: ReadonlyArray<Capability>,
  act?: string,
) =>
  mint(deploymentKey, ISSUER, {
    subject: encodePrincipal(principal),
    audience: PLATFORM_AUDIENCE,
    cap: entries(capabilities),
    act,
  });

const SYSTEM: PlatformPrincipal = { kind: "external-system", issuerId: SERVER_ID };
const HUMAN: PlatformPrincipal = { kind: "human", userId: "user-1" };
const team = (teamId: string, gameId: string): PlatformPrincipal => ({
  kind: "centaur-team",
  teamId,
  gameId,
});

/**
 * A fresh assertion the registered Server signed with its own key, one `jti`
 * each.
 *
 * The audience is this *deployment* — `ISSUER`, the identifier it publishes for
 * itself — and not `PLATFORM_AUDIENCE`, which is the audience of credentials the
 * deployment *mints*. The two are different values for a reason: an assertion is
 * verified against the Server's key, which the Server publishes to every
 * deployment it operates on, so only a deployment-scoped audience stops one of
 * them relaying an assertion to another. See `assertionAudience` in
 * `auth/deployment.ts`.
 */
const signedAssertion = () =>
  new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setIssuer(SERVER_ID)
    .setSubject(SERVER_ID)
    .setAudience(ISSUER)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(serverKey);

/** The refusal's message, or `null` when the call succeeded. */
const refusalOf = (call: Promise<unknown>) =>
  call.then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  );

describe("the ordered pair: capability first, kind second", () => {
  // spec: identity-and-authorization/principal-kind-gating#kind-is-checked-independently-of-capability
  // A barred kind carrying the exact capability the function requires is still
  // refused, and refused on kind: the capability decided only that the function
  // was reachable. `beginSignInHandoff` accepts humans alone, so both service
  // kinds must bounce however their claim was minted.
  it.each([
    { caller: "an external system's credential", principal: SYSTEM, kind: "external-system" },
    { caller: "a per-team game credential", principal: team("t1", "g1"), kind: "centaur-team" },
  ])(
    "refuses $caller at a humans-only function despite it holding the capability",
    async ({ principal, kind }) => {
      const t = await withComponents();
      const credential = await credentialFor(principal, ["begin-sign-in-handoff"]);

      await expect(
        t.mutation(anyApi.issuance.beginSignInHandoff, {
          credential,
          issuerId: SERVER_ID,
          returnAddress: RETURN_ADDRESS,
          challenge: await challengeFor(VERIFIER),
        }),
      ).rejects.toThrow(new RegExp(`does not accept a ${kind} principal`));
    },
  );

  // spec: identity-and-authorization/principal-kind-gating#kind-is-checked-independently-of-capability
  // Departing from the humans-only default replaces it rather than widening it:
  // `issueGameCredential` declares external systems alone, so a human carrying
  // the capability is refused there on kind.
  it("refuses a human credential where only the external-system kind is declared", async () => {
    const t = await withComponents();
    const credential = await credentialFor(HUMAN, ["issue-game-credential"]);

    await expect(
      t.action(anyApi.issuance.issueGameCredential, { credential, teamId: "t1", gameId: "g1" }),
    ).rejects.toThrow(/does not accept a human principal/);
  });

  // spec: identity-and-authorization/principal-kind-gating#service-reach-is-declared-never-inferred
  // `platformStatus` declares no principals, so the default applies: a service
  // principal is refused however it came by the capability, while a human
  // session is answered through the same gate. Service reach is a declaration
  // a function makes, never a consequence of the caller's claim.
  it("refuses a service principal at a function that declares nothing, which a human reaches", async () => {
    const t = await withComponents();
    const credential = await credentialFor(SYSTEM, ["read-platform-status"]);

    await expect(t.query(api.platform.platformStatus, { credential })).rejects.toThrow(
      /does not accept a external-system principal/,
    );
    await expect(
      t.withIdentity({ subject: "user-1" }).query(api.platform.platformStatus, {}),
    ).resolves.toMatchObject({ ok: true });
  });

  // spec: identity-and-authorization/principal-kind-gating
  // The pair's other refusal: a caller of exactly the declared kind gets
  // nowhere without the capability, so acceptance of kind never implies reach.
  it("refuses the declared kind when its claim lacks the capability", async () => {
    const t = await withComponents();
    const credential = await credentialFor(SYSTEM, ["issue-game-token"]);

    await expect(
      t.action(anyApi.issuance.issueGameCredential, { credential, teamId: "t1", gameId: "g1" }),
    ).rejects.toThrow(/no capability issue-game-credential in the caller's claim/);
  });

  // spec: identity-and-authorization/principal-kind-gating
  // The fixed order is observable on a caller that fails both checks: the
  // refusal names the missing capability, never the barred kind, so capability
  // was decided first and kind after — not merged, not reversed.
  it("refuses on capability when a caller fails both checks", async () => {
    const t = await withComponents();
    const credential = await credentialFor(HUMAN, []);

    const message = await refusalOf(
      t.action(anyApi.issuance.issueGameCredential, { credential, teamId: "t1", gameId: "g1" }),
    );
    expect(message).toMatch(/no capability issue-game-credential/);
    expect(message).not.toMatch(/does not accept/);
  });

  // spec: identity-and-authorization/principal-kind-gating
  // spec: identity-and-authorization/game-credential-scope
  // The positive path every refusal above is measured against: the declared
  // kind with the declared capability passes both checks and the handler runs
  // to completion, minting the credential scoped exactly as the requirement
  // fixes — one team, one game, the two capabilities, the acting Server named.
  it("admits the declared service kind carrying the declared capability, end to end", async () => {
    const t = await withComponents();
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await credentialFor(SYSTEM, ["issue-game-credential"]);

    const issued = (await t.action(anyApi.issuance.issueGameCredential, {
      credential,
      teamId,
      gameId,
    })) as string;

    const payload = decodeJwt(issued);
    expect(payload.sub).toBe(`team:${teamId}:${gameId}`);
    expect(payload.aud).toBe(PLATFORM_AUDIENCE);
    expect(payload.cap).toEqual(entries(GAME_CREDENTIAL_CAPABILITIES));
    expect(payload.act).toBe(SERVER_ID);
  });

  // spec: identity-and-authorization/principal-kind-gating#service-reach-is-declared-never-inferred
  // spec: identity-and-authorization/principal-kind-gating#kind-is-checked-independently-of-capability
  // A departure admits exactly the kinds it names, not "services generally":
  // `issueGameToken` declares human and centaur-team, so a registered external
  // system carrying the exact capability — which every Server's ceiling
  // legitimately includes, for redeemed-handoff use on a human's behalf under a
  // human-subject credential — is still refused when it presents *its own*
  // system credential. Widening a declaration to a third kind must fail here.
  it("refuses an external system's own credential at issueGameToken despite the capability", async () => {
    const t = await withComponents();
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await credentialFor(SYSTEM, ["issue-game-token"]);

    await expect(
      t.action(anyApi.issuance.issueGameToken, { credential, gameId, role: "spectator" }),
    ).rejects.toThrow(/does not accept a external-system principal/);
  });

  // spec: identity-and-authorization/principal-kind-gating
  // A departure may declare more than one kind. `issueGameToken` names the
  // centaur-team principal, so a game credential earns its bot token there —
  // proving the declaration is what admits, not a second hardcoded default.
  it("admits a centaur-team principal where that kind is declared", async () => {
    const t = await withComponents();
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await credentialFor(team(teamId, gameId), GAME_CREDENTIAL_CAPABILITIES);

    const token = (await t.action(anyApi.issuance.issueGameToken, {
      credential,
      gameId,
      role: "bot",
    })) as string;

    const payload = decodeJwt(token);
    expect(payload.sub).toBe(`bot:${teamId}`);
    expect(payload.aud).toBe(gameId);
  });
});

describe("reachability is not authorization", () => {
  // spec: identity-and-authorization/capability-registry#reachability-is-not-authorization
  // A claim that reaches the function has not answered the function's own
  // question. The Server's credential carries the exact capability, both gate
  // checks pass — and the handler still refuses a team this Server does not
  // operate. (A handler could not read the capability even if it wanted to:
  // `Principal`, the whole of what a handler is given, has no field for one.)
  it("still refuses an authorized-looking caller the handler's own check rejects", async () => {
    const t = await withComponents();
    const teamId = await seedTeam(t, "somebody-else.example");
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await credentialFor(SYSTEM, ["issue-game-credential"]);

    await expect(
      t.action(anyApi.issuance.issueGameCredential, { credential, teamId, gameId }),
    ).rejects.toThrow(/does not operate team/);
  });
});

describe("anonymous reach", () => {
  // spec: identity-and-authorization/anonymous-reach#liveness-exposes-no-principal
  it("answers liveness to a caller presenting nothing at all", async () => {
    const t = await withComponents();

    await expect(t.query(api.platform.platformStatus, {})).resolves.toEqual({
      ok: true,
      components: ["snekPlatform", "centaurState"],
    });
  });

  // spec: identity-and-authorization/anonymous-reach#assertion-exchange-proves-itself
  // The exchange runs to completion with no credential argument at all: what
  // stood in for one is the signature over the assertion, checked against the
  // material this principal's registration records.
  it("exchanges a signed assertion for a first credential with no prior credential", async () => {
    const t = await withComponents();
    await registerServer(t);

    const issued = (await t.action(anyApi.issuance.exchangeAssertion, {
      assertion: await signedAssertion(),
      capabilities: ["issue-game-credential"],
    })) as string;

    const payload = decodeJwt(issued);
    expect(payload.sub).toBe(`system:${SERVER_ID}`);
    expect(payload.act).toBe(SERVER_ID);
    expect(payload.cap).toEqual(entries(["issue-game-credential"]));
  });

  // spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself
  // spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
  // Redemption is likewise credential-less — the credential is what it exists
  // to obtain; the reference plus the verifier behind its challenge stand in.
  // What comes back is anchored to the user record the human's session resolved
  // to when the handoff was begun, which is attribution surviving the whole
  // handoff.
  it("redeems a handoff with no credential, yielding a credential naming the signed-in user", async () => {
    const t = await withComponents();
    await registerServer(t);
    const url = (await t
      .withIdentity({ subject: "user-42" })
      .mutation(anyApi.issuance.beginSignInHandoff, {
        issuerId: SERVER_ID,
        returnAddress: RETURN_ADDRESS,
        challenge: await challengeFor(VERIFIER),
      })) as string;
    const reference = new URL(url).searchParams.get("handoff");
    expect(reference).toBeTruthy();

    const issued = (await t.action(anyApi.issuance.redeemSignInHandoff, {
      reference,
      verifier: VERIFIER,
    })) as string;

    const payload = decodeJwt(issued);
    expect(payload.sub).toBe("user:user-42");
    expect(payload.act).toBe(SERVER_ID);
  });

  // spec: identity-and-authorization/anonymous-reach#anonymous-caller-has-no-kind
  // `exchangeAssertion` declares no principals, so every credentialed service
  // kind is refused there on kind — yet the anonymous caller passes, because it
  // is not a principal and there is no identity for a kind to be a property of.
  // The refusal is the control: the pass is the absence of the check applying,
  // not the absence of checking.
  it("applies no kind check to the anonymous caller where a credentialed service kind is refused", async () => {
    const t = await withComponents();
    await registerServer(t);
    const credential = await credentialFor(SYSTEM, ["exchange-assertion"]);

    await expect(
      t.action(anyApi.issuance.exchangeAssertion, {
        credential,
        assertion: await signedAssertion(),
        capabilities: [],
      }),
    ).rejects.toThrow(/does not accept a external-system principal/);
    await expect(
      t.action(anyApi.issuance.exchangeAssertion, {
        assertion: await signedAssertion(),
        capabilities: [],
      }),
    ).resolves.toBeDefined();
  });
});

describe("credentialed by default", () => {
  // One probe per registered capability, total by construction: the `Record`
  // stops compiling when a capability is added without a row here, and the keys
  // assertion below fails if the two diverge at runtime — so a new capability
  // is covered the moment it exists, not when someone remembers this file.
  const probes: Record<Capability, ((t: Harness) => Promise<unknown>) | null> = {
    "read-platform-status": (t) => t.query(api.platform.platformStatus, {}),
    "exchange-assertion": (t) =>
      t.action(anyApi.issuance.exchangeAssertion, { assertion: "not-a-jwt", capabilities: [] }),
    "redeem-handoff": (t) =>
      t.action(anyApi.issuance.redeemSignInHandoff, { reference: "r", verifier: "not-the-one" }),
    // Navigated to rather than invoked, so the probe is a fetch. An
    // unregistered issuer is refused before Better Auth is reached, which keeps
    // this probe about the gate rather than about the provider.
    "begin-sign-in": (t) =>
      t.fetch("/sign-in?issuer=nobody.example&return=https%3A%2F%2Fx.example&challenge=c"),
    "begin-sign-in-handoff": (t) =>
      t.mutation(anyApi.issuance.beginSignInHandoff, {
        issuerId: SERVER_ID,
        returnAddress: RETURN_ADDRESS,
        challenge: "any-challenge",
      }),
    "issue-game-credential": (t) =>
      t.action(anyApi.issuance.issueGameCredential, { teamId: "t1", gameId: "g1" }),
    "issue-game-token": (t) =>
      t.action(anyApi.issuance.issueGameToken, { gameId: "g1", role: "spectator" }),
    "review-attributed-actions": (t) => t.query(api.platform.attributedActions, {}),
    // Granted by game credentials ahead of the functions it will reach; until
    // one exists there is nothing to call, and the registry assertion below is
    // the whole testable statement of its reach.
    "write-centaur-state": null,
  };

  it("probes every capability the registry declares", () => {
    expect(Object.keys(probes).sort()).toEqual(Object.keys(CAPABILITIES).sort());
  });

  for (const [capability, probe] of Object.entries(probes) as Array<
    [Capability, ((t: Harness) => Promise<unknown>) | null]
  >) {
    if (probe === null) {
      // spec: identity-and-authorization/anonymous-reach#credentialed-by-default
      it(`keeps ${capability} out of the anonymous claim while it reaches no function`, () => {
        expect(ANONYMOUS_CAPABILITIES).not.toContain(capability);
      });
      continue;
    }
    if (ANONYMOUS_CAPABILITIES.includes(capability)) {
      // spec: identity-and-authorization/anonymous-reach
      // The declared-anonymous capabilities pass the gate without a credential;
      // whatever then happens in the handler, the refusal is never the gate's.
      // (Their full anonymous positives are asserted in "anonymous reach".)
      it(`lets an anonymous caller through the gate for ${capability}`, async () => {
        const message = await refusalOf(probe(await withComponents()));

        expect(message ?? "").not.toMatch(/no capability/);
      });
      continue;
    }
    // spec: identity-and-authorization/anonymous-reach#credentialed-by-default
    // spec: identity-and-authorization/authentication-required#unauthenticated-refused
    it(`refuses an anonymous caller at the gate for ${capability}`, async () => {
      const message = await refusalOf(probe(await withComponents()));

      expect(message).toMatch(new RegExp(`no capability ${capability} in the caller's claim`));
    });
  }
});

describe("no anonymous mutation path", () => {
  // spec: global-invariants/authenticated-unambiguous-identity#no-anonymous-mutation-path
  // spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
  // spec: identity-and-authorization/mutation-authorization#ui-gating-is-not-enforcement
  // The surface's one mutation, invoked directly with no interface in the way,
  // from both sides of the same arguments: with no credential and no session it
  // is refused before the handler runs, and under a session it commits —
  // writing a handoff attributed to the caller's resolved user record, which is
  // the anchor every action is attributed to.
  it("refuses the anonymous caller the very mutation a session commits", async () => {
    const t = await withComponents();
    await registerServer(t);
    const args = {
      issuerId: SERVER_ID,
      returnAddress: RETURN_ADDRESS,
      challenge: await challengeFor(VERIFIER),
    };

    await expect(t.mutation(anyApi.issuance.beginSignInHandoff, args)).rejects.toThrow(
      /no capability begin-sign-in-handoff/,
    );

    const url = (await t
      .withIdentity({ subject: "user-7" })
      .mutation(anyApi.issuance.beginSignInHandoff, args)) as string;
    expect(url.startsWith(`${RETURN_ADDRESS}?handoff=`)).toBe(true);

    const rows = await inPlatformComponent(t, (ctx) => ctx.db.query("sign_in_handoffs").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe("user-7");
  });
});

describe("a session's claim stops at the bootstrap pair", () => {
  // spec: identity-and-authorization/sign-in-handoff
  // spec: identity-and-authorization/service-principal-assertions
  // The two anonymously reachable issuance functions authenticate their caller
  // by proof a session does not carry — a reference plus the Server's own
  // assertion, or the assertion alone — so a signed-in human's session claim
  // must not reach them: the handoff's two ends are held by different parties,
  // and an assertion exchange authenticates non-human principals only. The
  // refusal must be the gate's, on capability, which is what pins
  // SESSION_CAPABILITIES against quietly widening into the bootstrap pair —
  // the anonymous positives above are the controls proving the same calls
  // succeed for the party the proof actually names.
  it.each([
    {
      end: "redeeming a handoff",
      capability: "redeem-handoff",
      call: (t: Harness) =>
        t
          .withIdentity({ subject: "user-9" })
          .action(anyApi.issuance.redeemSignInHandoff, { reference: "r", verifier: "not-the-one" }),
    },
    {
      end: "exchanging an assertion",
      capability: "exchange-assertion",
      call: (t: Harness) =>
        t
          .withIdentity({ subject: "user-9" })
          .action(anyApi.issuance.exchangeAssertion, { assertion: "not-a-jwt", capabilities: [] }),
    },
  ])("refuses a signed-in session $end, on capability", async ({ capability, call }) => {
    const t = await withComponents();
    await registerServer(t);

    await expect(call(t)).rejects.toThrow(
      new RegExp(`no capability ${capability} in the caller's claim`),
    );
    // The same session's claim does reach its own end of the handoff — so the
    // refusals above are the claim's content, not a session-wide refusal.
    await expect(
      t.withIdentity({ subject: "user-9" }).mutation(anyApi.issuance.beginSignInHandoff, {
        issuerId: SERVER_ID,
        returnAddress: RETURN_ADDRESS,
        challenge: await challengeFor(VERIFIER),
      }),
    ).resolves.toBeDefined();
  });
});

describe("audience binding at the platform's door", () => {
  // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
  // The round trip: a real game access token this same deployment just issued —
  // same signing arrangement, same issuer — confers nothing back at the
  // platform, because it names the game. The platform-audience credential
  // beside it is accepted through the same argument, so the refusal is the
  // binding and not the presentation channel.
  it("refuses a freshly issued game access token presented back at the platform", async () => {
    const t = await withComponents();
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const gameToken = (await t
      .withIdentity({ subject: "user-1" })
      .action(anyApi.issuance.issueGameToken, { gameId, role: "spectator" })) as string;
    expect(decodeJwt(gameToken).aud).toBe(gameId);
    expect(decodeJwt(gameToken).sub).toBe("spectator:user-1");

    await expect(t.query(api.platform.platformStatus, { credential: gameToken })).rejects.toThrow(
      /names a different audience/,
    );
    const platformCredential = await credentialFor(HUMAN, ["read-platform-status"]);
    await expect(
      t.query(api.platform.platformStatus, { credential: platformCredential }),
    ).resolves.toMatchObject({ ok: true });
  });
});

describe("a registered system's call rate is bounded", () => {
  // spec: identity-and-authorization/peer-capability-ceiling
  // The window is a fixed one, so the whole suite runs at a fixed instant
  // inside a single window: what is under test is the count, and a test that
  // straddled a rollover would be measuring the clock instead.
  const NOW = Date.UTC(2026, 0, 1, 12, 0, 30);
  const WINDOW_START = Math.floor(NOW / CALL_WINDOW_MS) * CALL_WINDOW_MS;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /** The Server's window, already this far spent when the call under test arrives. */
  const alreadySpent = (t: Harness, calls: number) =>
    inPlatformComponent(t, (ctx) =>
      ctx.db.insert("system_call_windows", {
        issuerId: SERVER_ID,
        windowStart: WINDOW_START,
        calls,
      }),
    );

  /** A call the Server makes with its own credential, on a team it really operates. */
  const systemCall = async (t: Harness) => {
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await credentialFor(SYSTEM, ["issue-game-credential"], SERVER_ID);
    return () =>
      t.action(anyApi.issuance.issueGameCredential, {
        credential,
        teamId,
        gameId,
      }) as Promise<string>;
  };

  // spec: identity-and-authorization/peer-capability-ceiling
  // The boundary, from both sides of one call. The same request, the same
  // credential, the same handler — the only difference is what the system has
  // already spent of this window, so the refusal is the bound and nothing else.
  it("admits the call that fits in the window and refuses the one past it", async () => {
    const under = await withComponents();
    await alreadySpent(under, CALLS_PER_WINDOW - 1);
    await expect((await systemCall(under))()).resolves.toBeDefined();

    const over = await withComponents();
    await alreadySpent(over, CALLS_PER_WINDOW);
    await expect((await systemCall(over))()).rejects.toThrow(
      new RegExp(`${SERVER_ID} is over its bound of ${CALLS_PER_WINDOW} calls per 60s`),
    );
  });

  // spec: identity-and-authorization/peer-capability-ceiling
  // spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
  // The race a bound exists to survive: two calls in flight with one call left
  // in the window. A count read by the host and incremented afterwards would
  // let both through — the component's single mutation must admit exactly one,
  // whichever order they land in.
  it("admits exactly one of two concurrent calls with one call left in the window", async () => {
    const t = await withComponents();
    await alreadySpent(t, CALLS_PER_WINDOW - 1);
    const call = await systemCall(t);

    const outcomes = await Promise.allSettled([call(), call()]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0]?.reason)).toMatch(/over its bound/);
  });

  // spec: identity-and-authorization/peer-capability-ceiling
  // The other authenticated entry point, which holds no credential at all: an
  // assertion exchange is a call by the system that signed it, and a bound that
  // only watched credentialed calls would leave the way credentials are
  // obtained unbounded.
  it("bounds an assertion exchange, which presents no credential to bound", async () => {
    const t = await withComponents();
    await registerServer(t);
    await alreadySpent(t, CALLS_PER_WINDOW);

    await expect(
      t.action(anyApi.issuance.exchangeAssertion, {
        assertion: await signedAssertion(),
        capabilities: [],
      }),
    ).rejects.toThrow(/over its bound/);
  });
});

describe("attribution is user-visible", () => {
  // The full path a Server takes to act for a human: the human begins the
  // handoff under their session, the Server proves itself and redeems it, and
  // what it holds afterwards names the human as subject and itself as actor.
  const actingForHuman = async (t: Harness, userId: string) => {
    const url = (await t
      .withIdentity({ subject: userId })
      .mutation(anyApi.issuance.beginSignInHandoff, {
        issuerId: SERVER_ID,
        returnAddress: RETURN_ADDRESS,
        challenge: await challengeFor(VERIFIER),
      })) as string;
    return (await t.action(anyApi.issuance.redeemSignInHandoff, {
      reference: new URL(url).searchParams.get("handoff"),
      verifier: VERIFIER,
    })) as string;
  };

  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  // End to end, through the surface a Server really uses: the token issued
  // under a redeemed handoff is an action taken on the human's account, and the
  // human — with nothing but their own session — is shown that it happened and
  // which system it came through.
  it("shows a user the action a system took on their behalf, and which system", async () => {
    const t = await withComponents();
    await registerServer(t, ["issue-game-token"]);
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await actingForHuman(t, "user-42");

    await t.action(anyApi.issuance.issueGameToken, { credential, gameId, role: "spectator" });

    const seen = await t
      .withIdentity({ subject: "user-42" })
      .query(api.platform.attributedActions, {});
    expect(seen).toEqual([
      { issuerId: SERVER_ID, capability: "issue-game-token", at: expect.any(Number) },
    ]);
  });

  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  // The control the test above is meaningless without: the *same* action, taken
  // by the human themselves under their own session, is attributed to no
  // system. Attribution marks what came through a system, so a record with no
  // system to name would say something false about how the action was taken.
  it("attributes nothing to a system when the human acted directly", async () => {
    const t = await withComponents();
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const asUser = t.withIdentity({ subject: "user-42" });

    await asUser.action(anyApi.issuance.issueGameToken, { gameId, role: "spectator" });

    expect(await asUser.query(api.platform.attributedActions, {})).toEqual([]);
  });

  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  // "A user reviews the actions taken on *their* account": the query takes no
  // argument, so whose records come back is the caller's credential and there
  // is nothing to pass to ask for someone else's.
  it("shows each user their own records and no one else's", async () => {
    const t = await withComponents();
    await registerServer(t, ["issue-game-token"]);
    const teamId = await seedTeam(t);
    const gameId = await seedPlayingGame(t, [teamId]);
    const credential = await actingForHuman(t, "user-42");
    await t.action(anyApi.issuance.issueGameToken, { credential, gameId, role: "spectator" });

    expect(
      await t.withIdentity({ subject: "user-99" }).query(api.platform.attributedActions, {}),
    ).toEqual([]);
    expect(
      await t.withIdentity({ subject: "user-42" }).query(api.platform.attributedActions, {}),
    ).toHaveLength(1);
  });
});
