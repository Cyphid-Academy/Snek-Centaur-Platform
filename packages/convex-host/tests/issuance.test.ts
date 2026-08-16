// The service-principal assertion exchange, end to end over the deployed
// HTTP surface (t.fetch against POST /issuance/game-credential): a
// registered principal signs a short-lived assertion with ITS OWN key,
// the platform verifies it against the material published at the
// registration's location, enforces single use and the issuer's ceiling,
// re-checks the game is being played, and mints the per-team game
// credential.
// spec: identity-and-authorization/service-principal-assertions
// spec: identity-and-authorization/trusted-issuer-registry
// spec: identity-and-authorization/live-game-issuance
// spec: identity-and-authorization/game-credential-scope
import {
  ACTING_PRINCIPAL_CLAIM,
  GAME_CREDENTIAL_CAPABILITIES,
  GAME_CREDENTIAL_SCOPE_CLAIM,
  platformAudience,
  readCapabilityEntries,
} from "@cyphid/snek-platform-auth";
import * as jose from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WORKING_CREDENTIAL_LIFETIME_SECONDS } from "../convex/auth";
import {
  __clearMaterialCacheForTests,
  __setMaterialFetchForTests,
  issuanceEndpointAudience,
} from "../convex/lib/issuance";
import { type T, launchGameAs, makeHuman, setAuthEnv, setup, testSupport } from "./setup";

beforeAll(() => {
  setAuthEnv();
});

// ---------------------------------------------------------------------------
// A principal with its own key pair, publishing its material at a URL the
// test serves — the registry holds only the identifier and that location,
// never a secret.
// spec: identity-and-authorization/trusted-issuer-registry#registry-holds-no-secret
// ---------------------------------------------------------------------------

interface Principal {
  readonly issuerId: string;
  readonly privateKey: jose.CryptoKey;
  readonly jwks: jose.JSONWebKeySet;
  readonly kid: string;
}

async function makePrincipal(issuerId: string): Promise<Principal> {
  const { publicKey, privateKey } = await jose.generateKeyPair("EdDSA", {
    extractable: true,
  });
  const jwk = await jose.exportJWK(publicKey);
  const kid = `${issuerId}-key-1`;
  return {
    issuerId,
    privateKey,
    jwks: { keys: [{ ...jwk, alg: "EdDSA", use: "sig", kid }] },
    kid,
  };
}

function materialUrlOf(principal: Principal): string {
  return `https://${principal.issuerId}.example/.well-known/jwks.json`;
}

/** Serve each principal's published material from its registered URL. */
function serveMaterial(...principals: Principal[]): void {
  const byUrl = new Map(principals.map((p) => [materialUrlOf(p), p.jwks]));
  __setMaterialFetchForTests((async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const jwks = byUrl.get(url);
    if (jwks === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(jwks), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch);
}

async function registerIssuer(
  t: T,
  principal: Principal,
  options: {
    readonly principalKind?: "centaur-team" | "external-system";
    readonly ceiling?: ReadonlyArray<string>;
  } = {},
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("trusted_issuers", {
      issuerId: principal.issuerId,
      principalKind: options.principalKind ?? "centaur-team",
      materialUrl: materialUrlOf(principal),
      ceiling: [...(options.ceiling ?? GAME_CREDENTIAL_CAPABILITIES.map((entry) => entry.verb))],
      returnAddresses: [],
      callRateLimitPerMinute: 60,
    });
  });
}

let jtiCounter = 0;
const nextJti = (): string => {
  jtiCounter += 1;
  return `jti-${jtiCounter}`;
};

/** Sign a short-lived assertion as a principal: iss = itself, aud = the issuance endpoint, unique jti. */
async function signAssertion(
  principal: Principal,
  overrides: {
    readonly audience?: string;
    readonly jti?: string;
    readonly expiresInSeconds?: number;
  } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const lifetime = overrides.expiresInSeconds ?? 60;
  return await new jose.SignJWT({})
    .setProtectedHeader({ alg: "EdDSA", kid: principal.kid })
    .setIssuer(principal.issuerId)
    .setSubject(principal.issuerId)
    .setAudience(overrides.audience ?? issuanceEndpointAudience())
    .setJti(overrides.jti ?? nextJti())
    .setIssuedAt(now - 5)
    .setExpirationTime(now + lifetime)
    .sign(principal.privateKey);
}

/** The exchange's response body, typed for both arms. */
interface ExchangeResponseBody {
  readonly ok?: boolean;
  readonly credential?: string;
  readonly expiresAtMs?: number;
  readonly rejection?: unknown;
}

async function requestCredential(
  t: T,
  body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: ExchangeResponseBody }> {
  const response = await t.fetch("/issuance/game-credential", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as ExchangeResponseBody };
}

/** A playing game rostered with team-red and team-blue (see setup TEAMS). */
async function playingGame(t: T): Promise<string> {
  const { identity } = await makeHuman(t, { name: "Configurer" });
  return await launchGameAs(t, identity);
}

beforeEach(() => {
  __clearMaterialCacheForTests();
});

afterEach(() => {
  __setMaterialFetchForTests(null);
});

describe("assertion exchange — happy path", () => {
  it("issues a per-team game credential: subject is the team, audience the platform, exactly the two capabilities, fifteen-minute expiry", async () => {
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    const result = await requestCredential(t, {
      assertion: await signAssertion(red),
      gameId,
      teamId: "team-red",
    });
    expect(result.status).toBe(200);
    expect(result.body.ok).toBe(true);

    const credential = result.body.credential as string;
    const claims = jose.decodeJwt(credential) as Record<string, unknown> & jose.JWTPayload;
    expect(claims.sub).toBe("team-red");
    // Audience-bound to the platform's own functions.
    // spec: identity-and-authorization/audience-bound-tokens
    expect(claims.aud).toBe(platformAudience());
    // Scoped to exactly one team and one game.
    // spec: identity-and-authorization/game-credential-scope
    expect(claims[GAME_CREDENTIAL_SCOPE_CLAIM]).toEqual({ gameId, teamId: "team-red" });
    // The acting principal is recorded on the credential.
    // spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
    expect(claims[ACTING_PRINCIPAL_CLAIM]).toBe("team-red");
    // Exactly the two grants, structured, parsed by the shared reader —
    // the same value for every Server today.
    // spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
    // spec: identity-and-authorization/capability-claim-structure#uniform-today-attenuable-tomorrow
    expect(readCapabilityEntries(claims)).toEqual([
      { verb: "write-centaur-state" },
      { verb: "request-bot-tokens" },
    ]);
    // Self-contained → dead within the fifteen-minute bound.
    // spec: identity-and-authorization/token-lifetime-and-refresh#only-the-stateful-session-outlives-the-bound
    expect(claims.exp! - claims.iat!).toBe(WORKING_CREDENTIAL_LIFETIME_SECONDS);
    expect(result.body.expiresAtMs).toBe(claims.exp! * 1000);

    // Verifiable against the platform's own published material alone.
    // spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
    const jwksResponse = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const keySet = jose.createLocalJWKSet((await jwksResponse.json()) as jose.JSONWebKeySet);
    const { payload } = await jose.jwtVerify(credential, keySet, {
      audience: platformAudience(),
    });
    expect(payload.sub).toBe("team-red");
  });
});

describe("assertion exchange — refusals", () => {
  it("refuses an unregistered principal, however valid its signature", async () => {
    // spec: identity-and-authorization/service-principal-assertions#unregistered-principal-refused
    const t = setup();
    const gameId = await playingGame(t);
    const stranger = await makePrincipal("team-red");
    serveMaterial(stranger); // material is served — but no registration exists
    const result = await requestCredential(t, {
      assertion: await signAssertion(stranger),
      gameId,
      teamId: "team-red",
    });
    expect(result.status).toBe(403);
    expect(result.body.rejection).toEqual({ kind: "unregistered-principal" });
  });

  it("refuses a replayed assertion within its lifetime — each jti is accepted once", async () => {
    // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    const assertion = await signAssertion(red, { expiresInSeconds: 300 });
    const first = await requestCredential(t, { assertion, gameId, teamId: "team-red" });
    expect(first.status).toBe(200);

    // Captured and presented a second time, still well within its lifetime.
    const second = await requestCredential(t, { assertion, gameId, teamId: "team-red" });
    expect(second.status).toBe(403);
    expect(second.body.rejection).toEqual({ kind: "replayed-assertion" });
  });

  it("refuses an assertion naming any audience but the issuance endpoint", async () => {
    // The assertion names the platform's issuance endpoint as the only
    // place it may be used; one naming anywhere else is refused.
    // spec: identity-and-authorization/service-principal-assertions
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    const result = await requestCredential(t, {
      assertion: await signAssertion(red, { audience: "https://somewhere-else.example/" }),
      gameId,
      teamId: "team-red",
    });
    expect(result.status).toBe(403);
    expect(result.body.rejection).toEqual({ kind: "wrong-audience" });
  });

  it("refuses an expired assertion", async () => {
    // spec: identity-and-authorization/service-principal-assertions
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    const result = await requestCredential(t, {
      assertion: await signAssertion(red, { expiresInSeconds: -60 }),
      gameId,
      teamId: "team-red",
    });
    expect(result.status).toBe(403);
    expect(result.body.rejection).toEqual({ kind: "expired-assertion" });
  });

  it("refuses a capability request beyond the issuer's ceiling, NAMING the excess — never quietly narrowing", async () => {
    // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    const result = await requestCredential(t, {
      assertion: await signAssertion(red),
      gameId,
      teamId: "team-red",
      requestedCapabilities: [
        "write-centaur-state",
        "request-bot-tokens",
        "configure-games",
        "administer-platform",
      ],
    });
    expect(result.status).toBe(403);
    expect(result.body.rejection).toEqual({
      kind: "capability-excess",
      excess: ["configure-games", "administer-platform"],
    });
  });

  it("issues while the game is playing, then refuses the very next request once it finishes", async () => {
    // The liveness flip: status is re-checked at the moment of each
    // request, so remaining cryptographic validity of anything the
    // requester holds confers nothing toward a game that has ended.
    // spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    const whilePlaying = await requestCredential(t, {
      assertion: await signAssertion(red),
      gameId,
      teamId: "team-red",
    });
    expect(whilePlaying.status).toBe(200);

    await t.mutation(testSupport.finishGame, { gameId });

    const afterFinish = await requestCredential(t, {
      assertion: await signAssertion(red),
      gameId,
      teamId: "team-red",
    });
    expect(afterFinish.status).toBe(403);
    expect(afterFinish.body.rejection).toEqual({ kind: "game-not-playing", phase: "finished" });
  });

  it("refuses team A's registration anything for team B — the registration is the team's own", async () => {
    // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-team
    const t = setup();
    const gameId = await playingGame(t);
    const red = await makePrincipal("team-red");
    serveMaterial(red);
    await registerIssuer(t, red);

    // team-blue IS a registered participant of the game — what fails is
    // that the presenting registration is not team-blue's.
    const result = await requestCredential(t, {
      assertion: await signAssertion(red),
      gameId,
      teamId: "team-blue",
    });
    expect(result.status).toBe(403);
    expect(result.body.rejection).toEqual({ kind: "not-the-teams-registration" });
  });
});
