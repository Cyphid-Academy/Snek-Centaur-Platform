// spec: identity-and-authorization/service-principal-assertions,
//       identity-and-authorization/trusted-issuer-registry,
//       identity-and-authorization/peer-capability-ceiling,
//       identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/game-credential-scope,
//       identity-and-authorization/participant-token-eligibility,
//       identity-and-authorization/live-game-issuance,
//       identity-and-authorization/mutation-authorization
// The issuance surface, exercised end to end through the real function bodies.
//
// `auth/eligibility.ts` and `auth/credential.ts` have suites of their own; what
// only this suite can establish is the wiring `issuance.ts` owns — that the
// registry is consulted before any key is fetched, that the single-use guards
// really are single-use under concurrency, that what comes out of each minting
// path is the credential the requirements describe and nothing broader. Every
// refusal asserted here sits beside a positive path differing in one respect,
// so a function that refused everything would not stay green.
//
// The component's tables are seeded through the mutations `harness.testing.ts`
// registers into the component's own module map — the component ships no
// registration or game-lifecycle writes yet (those belong to other changes),
// and reaching around the component boundary is not possible by design, so the
// seams tests need are supplied the same way the deployment would supply them:
// as component mutations, validated against the component's schema.
import { type JWK, SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "./_generated/api";
import { CREDENTIAL_LIFETIME_SECONDS, verify } from "./auth/credential";
import { PLATFORM_AUDIENCE } from "./auth/deployment";
import { challengeFor, platformSeed, seedModules, withComponents } from "./harness.testing";

const ALG = "ES256";
const ISSUER = "https://issuance-under-test.example";

// Three registered principals and one stranger. C exists so a test can hand a
// principal an over-broad registration without disturbing the two whose
// ceilings the rest of the suite depends on.
const SERVER_A = "server-a.example";
const SERVER_B = "server-b.example";
const SERVER_C = "server-c.example";
const JWKS_A = "https://server-a.example/.well-known/jwks.json";
const JWKS_B = "https://server-b.example/.well-known/jwks.json";
const JWKS_C = "https://server-c.example/.well-known/jwks.json";
const RETURN_A = "https://server-a.example/signed-in";
const RETURN_B = "https://server-b.example/signed-in";

const OPERATOR_A = "operator-of-team-a";
const COACH_A = "coach-of-team-a";
const OUTSIDER = "human-on-no-roster";
const ADMIN = "platform-admin";

let deploymentJwk: JWK;
let serverAKey: CryptoKey;
let serverAJwk: JWK;
let serverBKey: CryptoKey;
let serverBJwk: JWK;
let serverCKey: CryptoKey;
let serverCJwk: JWK;
let strangerKey: CryptoKey;
let strangerJwk: JWK;
let rotatedKey: CryptoKey;
let rotatedJwk: JWK;

beforeAll(async () => {
  const [deployment, a, b, c, stranger, rotated] = await Promise.all(
    Array.from({ length: 6 }, () => generateKeyPair(ALG, { extractable: true })),
  );
  deploymentJwk = await exportJWK(deployment.publicKey);
  serverAKey = a.privateKey;
  serverAJwk = await exportJWK(a.publicKey);
  serverBKey = b.privateKey;
  serverBJwk = await exportJWK(b.publicKey);
  serverCKey = c.privateKey;
  serverCJwk = await exportJWK(c.publicKey);
  strangerKey = stranger.privateKey;
  strangerJwk = await exportJWK(stranger.publicKey);
  rotatedKey = rotated.privateKey;
  rotatedJwk = await exportJWK(rotated.publicKey);

  // The deployment's signing identity, exactly as the Convex runtime supplies
  // it: issuance reads both from the environment at every call.
  process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(await exportJWK(deployment.privateKey));
  process.env["CONVEX_SITE_URL"] = ISSUER;
});

// ---------------------------------------------------------------------------
// The network as issuance sees it. Every fetch is recorded, because *which*
// locations were consulted is itself under test: material must come from the
// location the registration records and nowhere else.
// ---------------------------------------------------------------------------

const served = new Map<string, ReadonlyArray<JWK>>();
const fetched: string[] = [];

beforeEach(() => {
  fetched.length = 0;
  served.clear();
  served.set(JWKS_A, [serverAJwk]);
  served.set(JWKS_B, [serverBJwk]);
  served.set(JWKS_C, [serverCJwk]);
  vi.stubGlobal("fetch", async (url: string | URL) => {
    fetched.push(String(url));
    return { json: async () => ({ keys: served.get(String(url)) ?? [] }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const issuance = api.issuance;

/**
 * The shared harness with the seed mutations registered, and the world every
 * test below shares: two registered Servers, a team operated by each, and one
 * game being played with both teams on its initialization snapshot.
 */
async function setup() {
  const t = await withComponents({ platformExtras: seedModules });

  await t.mutation(platformSeed.seedIssuer, {
    issuerId: SERVER_A,
    verificationMaterialUrl: JWKS_A,
    capabilityCeiling: ["issue-game-credential", "issue-game-token"],
    returnAddresses: [RETURN_A],
  });
  await t.mutation(platformSeed.seedIssuer, {
    issuerId: SERVER_B,
    verificationMaterialUrl: JWKS_B,
    capabilityCeiling: ["issue-game-credential"],
    returnAddresses: [RETURN_B],
  });
  const teamA = await t.mutation(platformSeed.seedTeam, { serverDomain: SERVER_A });
  const teamB = await t.mutation(platformSeed.seedTeam, { serverDomain: SERVER_B });
  const gameId = await t.mutation(platformSeed.seedGame, {
    status: "playing",
    roster: [
      { teamId: teamA, memberUserIds: [OPERATOR_A], coachUserIds: [COACH_A] },
      { teamId: teamB, memberUserIds: ["operator-of-team-b"], coachUserIds: [] },
    ],
  });
  return { t, teamA, teamB, gameId };
}

/** A signed assertion, defaulting to the shape a well-behaved Server sends. */
function signAssertion(overrides?: {
  key?: CryptoKey;
  iss?: string;
  aud?: string;
  jti?: string;
  omitJti?: boolean;
  expOffsetSeconds?: number;
  header?: Record<string, unknown>;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT({})
    .setProtectedHeader({ alg: ALG, ...overrides?.header })
    .setIssuer(overrides?.iss ?? SERVER_A)
    .setAudience(overrides?.aud ?? ISSUER)
    .setIssuedAt(now - 5)
    .setExpirationTime(now + (overrides?.expOffsetSeconds ?? 300));
  if (!overrides?.omitJti) jwt = jwt.setJti(overrides?.jti ?? crypto.randomUUID());
  return jwt.sign(overrides?.key ?? serverAKey);
}

/** Verify a credential this suite's deployment minted, at the given audience. */
const verifyIssued = (token: string, audience: string) =>
  verify(token, { issuer: ISSUER, publicJwk: deploymentJwk }, audience);

/**
 * A fresh PKCE verifier, as the page that begins a sign-in would make one.
 *
 * Every call is a different value, which is what lets a test say "a party
 * holding some other verifier" simply by calling it again — the guess being
 * wrong is the assertion, and nothing about the flow has to be faked to make it
 * so.
 */
const newVerifier = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;

/** Begin a handoff toward Server A for its registered address, and take the reference out of the URL. */
async function begunHandoff(t: Awaited<ReturnType<typeof setup>>["t"], verifier: string) {
  const returnUrl = await t
    .withIdentity({ subject: OPERATOR_A })
    .mutation(issuance.beginSignInHandoff, {
      issuerId: SERVER_A,
      returnAddress: RETURN_A,
      challenge: await challengeFor(verifier),
    });
  return new URL(returnUrl).searchParams.get("handoff") as string;
}

type Setup = Awaited<ReturnType<typeof setup>>;

/** The full earning path for team A's game credential — Server A's assertion, exchanged, spent. */
async function earnGameCredential({ t, teamA, gameId }: Setup): Promise<string> {
  const platformCredential = await t.action(issuance.exchangeAssertion, {
    assertion: await signAssertion(),
    capabilities: ["issue-game-credential"],
  });
  return t.action(issuance.issueGameCredential, {
    teamId: teamA,
    gameId,
    credential: platformCredential,
  });
}

describe("exchanging a signed assertion for a credential", () => {
  // spec: identity-and-authorization/service-principal-assertions
  // spec: identity-and-authorization/anonymous-reach#assertion-exchange-proves-itself
  // spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
  // The positive path every refusal below diverges from: no platform
  // credential is presented, the signature is the proof, and what comes back
  // names the principal in both subject and actor with exactly the requested
  // capabilities — expiring on the platform-wide lifetime.
  it("exchanges a valid assertion for a credential naming the signing principal", async () => {
    const { t } = await setup();

    const credential = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion(),
      capabilities: ["issue-game-credential"],
    });

    const payload = await verifyIssued(credential, PLATFORM_AUDIENCE);
    expect(payload.sub).toBe(`system:${SERVER_A}`);
    expect(payload.act).toBe(SERVER_A);
    expect(payload.cap).toEqual([{ capability: "issue-game-credential" }]);
    expect((payload.exp as number) - (payload.iat as number)).toBe(CREDENTIAL_LIFETIME_SECONDS);
  });

  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  // The same bytes, still inside their lifetime, presented again: the first
  // exchange succeeding is what proves the second refusal is the replay guard
  // and not a broken exchange.
  it("refuses a captured assertion presented a second time within its lifetime", async () => {
    const { t } = await setup();
    const assertion = await signAssertion();

    await expect(
      t.action(issuance.exchangeAssertion, { assertion, capabilities: [] }),
    ).resolves.toBeDefined();
    await expect(
      t.action(issuance.exchangeAssertion, { assertion, capabilities: [] }),
    ).rejects.toThrow(/already been accepted/);
  });

  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  // spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
  // The race the transactional guard exists for: two presentations of one
  // assertion in flight at once. A check-then-insert split across two steps
  // would let both pass; the component's single-mutation claim must admit
  // exactly one, whichever order the two land in.
  it("admits exactly one of two concurrent presentations of one assertion", async () => {
    const { t } = await setup();
    const assertion = await signAssertion();

    const outcomes = await Promise.allSettled([
      t.action(issuance.exchangeAssertion, { assertion, capabilities: [] }),
      t.action(issuance.exchangeAssertion, { assertion, capabilities: [] }),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/already been accepted/);
  });

  // spec: identity-and-authorization/service-principal-assertions#unregistered-principal-refused
  // A flawless signature over a well-formed assertion, from a principal the
  // platform holds no registration for. Refused before any key is fetched:
  // nothing published anywhere could make this exchange sound, so consulting
  // the network would only manufacture a place for trust to leak in.
  it("refuses a validly signed assertion from a principal with no registration", async () => {
    const { t } = await setup();
    served.set("https://unregistered.example/jwks.json", [strangerJwk]);

    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: await signAssertion({ iss: "unregistered.example", key: strangerKey }),
        capabilities: [],
      }),
    ).rejects.toThrow(/no registration for issuer unregistered.example/);
    expect(fetched).toEqual([]);
  });

  // spec: identity-and-authorization/service-principal-assertions
  // The attack the registration's URL exists to defeat: an assertion whose
  // header points at the attacker's own key document, which this suite really
  // serves and which would verify the signature. Only the registered location
  // may be read — so the exchange fails, and the attacker's document is never
  // consulted at all.
  it("fetches verification material from the registered location, never one the request names", async () => {
    const { t } = await setup();
    const attackerJwks = "https://attacker.example/jwks.json";
    served.set(attackerJwks, [strangerJwk]);

    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: await signAssertion({ key: strangerKey, header: { jku: attackerJwks } }),
        capabilities: [],
      }),
    ).rejects.toThrow(/not signed by any key this principal publishes/);
    expect(fetched).toEqual([JWKS_A]);
    expect(fetched).not.toContain(attackerJwks);

    // The same claim signed with the registered principal's real key succeeds,
    // so the refusal above was about where the material came from, not the
    // assertion's shape.
    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: await signAssertion(),
        capabilities: [],
      }),
    ).resolves.toBeDefined();
  });

  // spec: identity-and-authorization/service-principal-assertions#rotation-needs-no-coordination
  // A rotation as the requirement scripts it: publish the new key beside the
  // old, switch, then retire the old — three exchanges across the three
  // states, with the registration row never touched and no other call made.
  it("accepts a rotated key with no change to the registration and no exchange with the platform", async () => {
    const { t } = await setup();
    const exchange = async (key: CryptoKey) =>
      t.action(issuance.exchangeAssertion, {
        assertion: await signAssertion({ key }),
        capabilities: [],
      });

    await expect(exchange(serverAKey)).resolves.toBeDefined();

    served.set(JWKS_A, [serverAJwk, rotatedJwk]);
    await expect(exchange(rotatedKey)).resolves.toBeDefined();

    served.set(JWKS_A, [rotatedJwk]);
    await expect(exchange(rotatedKey)).resolves.toBeDefined();
    // The registration recorded before the rotation still answers unchanged.
    const registration = await t.query(components.snekPlatform.functions.issuer, {
      issuerId: SERVER_A,
    });
    expect(registration?.verificationMaterialUrl).toBe(JWKS_A);
  });

  // spec: identity-and-authorization/service-principal-assertions
  // The remaining checks the requirement names, each on an assertion that is
  // otherwise flawless: expiry, the audience that makes a captured peer
  // assertion inert here, the identifier that makes it single-use, and the key
  // that makes the signature someone's.
  it.each([
    {
      case: "an expired assertion",
      make: () => signAssertion({ expOffsetSeconds: -10 }),
      refusal: /not signed by any key/,
    },
    {
      // The relay. A Server operates on this deployment *and* on a fork, with
      // one identity and one key published to both, so the fork holds validly
      // signed assertions from it. The audience is the only claim that stops
      // the fork presenting one here: the signature is genuine, the issuer is
      // registered, and the assertion has not expired. Were the audience a
      // platform-wide constant, every fork would demand the same value and this
      // would be accepted.
      case: "an assertion this Server minted for a different deployment",
      make: () => signAssertion({ aud: "https://a-fork-of-the-platform.example" }),
      refusal: /not signed by any key/,
    },
    {
      case: "an assertion carrying no unique identifier",
      make: () => signAssertion({ omitJti: true }),
      refusal: /no unique identifier/,
    },
    {
      case: "an assertion signed by a key the principal does not publish",
      make: () => signAssertion({ key: strangerKey }),
      refusal: /not signed by any key/,
    },
    {
      case: "a string that is not a JWT at all",
      make: () => Promise.resolve("not-a-jwt"),
      refusal: /Invalid JWT/,
    },
  ])("refuses $case", async ({ make, refusal }) => {
    const { t } = await setup();

    await expect(
      t.action(issuance.exchangeAssertion, { assertion: await make(), capabilities: [] }),
    ).rejects.toThrow(refusal);
  });

  // spec: identity-and-authorization/service-principal-assertions#replayed-assertion-refused
  // "Expired on the assertion lifetime rather than retained indefinitely": the
  // accepted-identifier record is sweepable the moment the assertion it
  // defends against can no longer be replayed, and not before.
  it("expires the accepted-identifier record on the assertion's own lifetime", async () => {
    const { t } = await setup();
    const assertion = await signAssertion({ expOffsetSeconds: 300 });
    await t.action(issuance.exchangeAssertion, { assertion, capabilities: [] });
    const expiresAt = (decodeJwt(assertion).exp as number) * 1000;

    // Still inside the assertion's lifetime the record defends; the sweep
    // must leave it.
    expect(
      await t.mutation(components.snekPlatform.functions.sweepExpired, { now: expiresAt - 1 }),
    ).toBe(0);
    // One tick past it, the record defends nothing and goes.
    expect(
      await t.mutation(components.snekPlatform.functions.sweepExpired, { now: expiresAt + 1 }),
    ).toBe(1);
  });
});

describe("the trusted issuer registry", () => {
  // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
  // A request beyond the ceiling is refused with the excess named — for a
  // capability outside this issuer's ceiling and for one the platform does not
  // recognise at all. The subset request succeeding alongside proves the
  // refusal is about the excess, and that nothing was quietly narrowed.
  it.each([
    {
      case: "a real capability outside the ceiling",
      requested: ["issue-game-credential", "begin-sign-in-handoff"],
      named: /begin-sign-in-handoff/,
    },
    {
      case: "a capability the platform does not recognise",
      requested: ["issue-game-credential", "administer-everything"],
      named: /administer-everything/,
    },
  ])("refuses $case, naming it", async ({ requested, named }) => {
    const { t } = await setup();

    const refused = t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion(),
      capabilities: requested,
    });
    await expect(refused).rejects.toThrow(named);
    await expect(refused).rejects.toThrow(/ceiling/);

    // The permitted subset of the same request, granted in full — so the
    // refusal above cannot have been a silent narrowing to this.
    const narrowed = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion(),
      capabilities: ["issue-game-credential"],
    });
    expect((await verifyIssued(narrowed, PLATFORM_AUDIENCE)).cap).toEqual([
      { capability: "issue-game-credential" },
    ]);
  });

  // spec: identity-and-authorization/trusted-issuer-registry#registry-holds-no-secret
  // Both halves of "no field a secret could occupy": what the registry hands
  // back is exactly the four public fields, and a write that smuggles a fifth
  // is refused by the schema itself, not by reviewer vigilance.
  it("records exactly the four public fields and refuses a row carrying a secret", async () => {
    const { t } = await setup();

    const registration = await t.query(components.snekPlatform.functions.issuer, {
      issuerId: SERVER_A,
    });
    expect(Object.keys(registration ?? {}).sort()).toEqual([
      "capabilityCeiling",
      "issuerId",
      "returnAddresses",
      "verificationMaterialUrl",
    ]);

    await expect(
      t.mutation(platformSeed.seedIssuerRaw, {
        doc: {
          issuerId: "secretive.example",
          verificationMaterialUrl: "https://secretive.example/jwks.json",
          capabilityCeiling: [],
          returnAddresses: [],
          clientSecret: "hush",
        },
      }),
    ).rejects.toThrow();
  });

  // spec: identity-and-authorization/trusted-issuer-registry#the-set-is-never-assumed-singular
  // Two issuers registered side by side, each authenticated against its own
  // published material and granted its own ceiling — with no change anywhere
  // to how credentials are validated. A resolver that assumed one issuer
  // would answer one of these with the other's identity or material.
  it("resolves each of two registered issuers to its own material and ceiling", async () => {
    const { t } = await setup();

    const forA = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion(),
      capabilities: ["issue-game-token"],
    });
    const forB = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion({ iss: SERVER_B, key: serverBKey }),
      capabilities: ["issue-game-credential"],
    });

    expect((await verifyIssued(forA, PLATFORM_AUDIENCE)).sub).toBe(`system:${SERVER_A}`);
    expect((await verifyIssued(forB, PLATFORM_AUDIENCE)).sub).toBe(`system:${SERVER_B}`);
    // B's key at B's location cannot speak for A: the registry was consulted
    // per issuer, not once.
    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: await signAssertion({ iss: SERVER_A, key: serverBKey }),
        capabilities: [],
      }),
    ).rejects.toThrow(/not signed by any key/);
    // `issue-game-token` sits outside B's ceiling even though it is inside
    // A's — ceilings resolved per issuer as well.
    await expect(
      t.action(issuance.exchangeAssertion, {
        assertion: await signAssertion({ iss: SERVER_B, key: serverBKey }),
        capabilities: ["issue-game-token"],
      }),
    ).rejects.toThrow(/issue-game-token/);
  });

  // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
  // A registration row is data, not the capability enumeration: a name the
  // platform does not recognise confers nothing by appearing in a ceiling, and
  // a request for it is refused with the name called out — a credential
  // carrying an unknown entry would sail past every enforcement site that
  // checks for known ones. The known capability on the same row still granted
  // proves the row itself is honoured.
  it("refuses a capability the platform does not recognise even when a ceiling records it", async () => {
    const { t } = await setup();
    await t.mutation(platformSeed.seedIssuer, {
      issuerId: SERVER_C,
      verificationMaterialUrl: JWKS_C,
      capabilityCeiling: ["made-up-power", "issue-game-token"],
      returnAddresses: [],
    });

    const refused = t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion({ iss: SERVER_C, key: serverCKey }),
      capabilities: ["made-up-power"],
    });
    await expect(refused).rejects.toThrow(/made-up-power/);
    await expect(refused).rejects.toThrow(/ceiling/);

    const allowed = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion({ iss: SERVER_C, key: serverCKey }),
      capabilities: ["issue-game-token"],
    });
    expect((await verifyIssued(allowed, PLATFORM_AUDIENCE)).cap).toEqual([
      { capability: "issue-game-token" },
    ]);
  });
});

describe("the peer capability ceiling", () => {
  // spec: identity-and-authorization/peer-capability-ceiling
  // spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
  // No ceiling may include credential-issuing capabilities *even if
  // registered*: a registration row that names them is a misconfiguration, and
  // a request for one is refused with the excess named rather than honoured.
  it("refuses a credential-issuing capability even when the registration's ceiling names it", async () => {
    const { t } = await setup();
    await t.mutation(platformSeed.seedIssuer, {
      issuerId: SERVER_C,
      verificationMaterialUrl: JWKS_C,
      capabilityCeiling: ["exchange-assertion", "redeem-handoff", "issue-game-token"],
      returnAddresses: [],
    });

    const refused = t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion({ iss: SERVER_C, key: serverCKey }),
      capabilities: ["exchange-assertion", "redeem-handoff"],
    });
    await expect(refused).rejects.toThrow(/exchange-assertion, redeem-handoff/);

    // The same registration's permitted capability is still granted — the
    // exclusion cut the forbidden entries out of the ceiling, not the issuer
    // out of the platform.
    const allowed = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion({ iss: SERVER_C, key: serverCKey }),
      capabilities: ["issue-game-token"],
    });
    expect((await verifyIssued(allowed, PLATFORM_AUDIENCE)).cap).toEqual([
      { capability: "issue-game-token" },
    ]);
  });

  // spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
  // spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
  // The two bounds, each demonstrated by something the other would let through.
  // The ceiling excludes what a session holds but this Server does not; the
  // session claim excludes what the Server registered but no human reaches by
  // being signed in. A credential is the intersection, so neither bound alone
  // is what is being read.
  it("caps the credential at the Server's ceiling intersected with what a session reaches", async () => {
    const { t } = await setup();
    await t.mutation(platformSeed.seedIssuer, {
      issuerId: SERVER_C,
      verificationMaterialUrl: JWKS_C,
      // Over-broad on purpose: everything a session holds, plus something no
      // session reaches, plus the forbidden pair, all "registered".
      capabilityCeiling: [
        "issue-game-token",
        "issue-game-credential",
        "exchange-assertion",
        "redeem-handoff",
        "begin-sign-in-handoff",
      ],
      returnAddresses: [RETURN_A],
    });
    const verifier = newVerifier();
    const returnUrl = await t
      .withIdentity({ subject: OPERATOR_A })
      .mutation(issuance.beginSignInHandoff, {
        issuerId: SERVER_C,
        returnAddress: RETURN_A,
        challenge: await challengeFor(verifier),
      });
    const reference = new URL(returnUrl).searchParams.get("handoff") as string;

    const credential = await t.action(issuance.redeemSignInHandoff, { reference, verifier });

    const capabilities = (await verifyIssued(credential, PLATFORM_AUDIENCE)).cap.map(
      (entry) => entry.capability,
    );
    expect(capabilities).toEqual(["issue-game-token"]);
    // Registered on the ceiling, but no session reaches it.
    expect(capabilities).not.toContain("issue-game-credential");
    // Forbidden to every peer whatever its registration says, so the ceiling
    // never carried them in the first place. `begin-sign-in-handoff` is among
    // them for what it reaches in *combination*: this credential names a human,
    // so carrying it would let the Server begin a fresh handoff in that human's
    // name, redeem it — redemption proves itself and needs no capability — and
    // renew a credential for them indefinitely, without them.
    // spec: identity-and-authorization/peer-capability-ceiling#no-chain-reaches-what-one-step-may-not
    for (const forbidden of ["exchange-assertion", "redeem-handoff", "begin-sign-in-handoff"]) {
      expect(capabilities).not.toContain(forbidden);
    }
  });
});

describe("the sign-in handoff", () => {
  // spec: identity-and-authorization/sign-in-handoff
  // spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself
  // spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
  // The whole hop: a human begins a handoff toward a registered Server, the
  // browser carries an opaque reference to the registered address, and the page
  // that kept the verifier receives — in that exchange and no other — a
  // credential naming the human, capped at the Server's ceiling, with the
  // Server on record as the actor.
  it("returns the browser to the registered address and yields the credential to whoever holds the verifier", async () => {
    const { t } = await setup();
    const asHuman = t.withIdentity({ subject: OPERATOR_A });
    const verifier = newVerifier();

    const returnUrl = await asHuman.mutation(issuance.beginSignInHandoff, {
      issuerId: SERVER_A,
      returnAddress: RETURN_A,
      challenge: await challengeFor(verifier),
    });
    expect(returnUrl.startsWith(`${RETURN_A}?handoff=`)).toBe(true);
    const reference = new URL(returnUrl).searchParams.get("handoff") as string;

    const credential = await t.action(issuance.redeemSignInHandoff, { reference, verifier });

    const payload = await verifyIssued(credential, PLATFORM_AUDIENCE);
    expect(payload.sub).toBe(`user:${OPERATOR_A}`);
    expect(payload.act).toBe(SERVER_A);
    // Server A's ceiling is `issue-game-credential` and `issue-game-token`;
    // only the second is also something a session reaches, and the credential
    // carries the intersection.
    expect(payload.cap.map((entry) => entry.capability)).toEqual(["issue-game-token"]);
  });

  // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
  // A value that travelled in a URL is assumed seen; whatever its remaining
  // lifetime, its second presentation finds nothing.
  it("refuses a handoff reference presented a second time, whatever its remaining lifetime", async () => {
    const { t } = await setup();
    const verifier = newVerifier();
    const reference = await begunHandoff(t, verifier);

    await expect(
      t.action(issuance.redeemSignInHandoff, { reference, verifier }),
    ).resolves.toBeDefined();
    await expect(t.action(issuance.redeemSignInHandoff, { reference, verifier })).rejects.toThrow(
      /no such handoff reference/,
    );
  });

  // spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
  // Taking the target from the request would make the platform a
  // trusted-looking bounce to anywhere — including to another Server's
  // perfectly registered address, which is registered to *it*, not to the
  // Server this handoff names.
  it.each([
    { case: "an address no registration records", address: "https://attacker.example/collect" },
    { case: "another Server's registered address", address: RETURN_B },
  ])("refuses to send the browser to $case", async ({ address }) => {
    const { t } = await setup();

    await expect(
      t.withIdentity({ subject: OPERATOR_A }).mutation(issuance.beginSignInHandoff, {
        issuerId: SERVER_A,
        returnAddress: address,
        challenge: await challengeFor(newVerifier()),
      }),
    ).rejects.toThrow(/not a return address this issuer registered/);
  });

  // spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
  // The property the whole shape exists for. The return leg puts the reference
  // in the address bar of the Server's own page, so the Server sees every
  // reference it is sent — and can still do nothing with one, because what
  // opens it is a verifier that never left the browser. A Server's own signing
  // key, the thing that used to redeem, is now no help at all: there is no
  // argument to present it as.
  it("refuses redemption by a party holding everything but the verifier", async () => {
    const { t } = await setup();
    const reference = await begunHandoff(t, newVerifier());

    await expect(
      t.action(issuance.redeemSignInHandoff, { reference, verifier: newVerifier() }),
    ).rejects.toThrow(/no such handoff reference/);
  });

  // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
  // The proof is checked inside the same mutation that would spend the
  // reference, and a wrong one leaves the row alone — so an attacker who
  // captured the reference from the URL but cannot answer the challenge does
  // not burn the human's one chance to arrive. This is the assertion path's old
  // verify-first-call-second property, kept under a proof that cannot be
  // checked before the row is read.
  it("does not consume the reference on a redemption that fails to prove itself", async () => {
    const { t } = await setup();
    const verifier = newVerifier();
    const reference = await begunHandoff(t, verifier);

    await expect(
      t.action(issuance.redeemSignInHandoff, { reference, verifier: newVerifier() }),
    ).rejects.toThrow(/no such handoff reference/);
    // The page that kept the verifier still redeems: the failed proof spent
    // nothing.
    await expect(
      t.action(issuance.redeemSignInHandoff, { reference, verifier }),
    ).resolves.toBeDefined();
  });

  // spec: identity-and-authorization/sign-in-handoff
  // "Expiring on the redirect it exists to survive": a reference is not a
  // credential, so its life is the hop's — one minute — and a redemption after
  // that is refused however prompt the proof. The edge is pinned exactly,
  // because an off-by-one would be invisible to a coarser clock and the
  // boundary is the code's one chance to pick the wrong comparison.
  it("refuses a reference at the exact moment its redirect lifetime ends", async () => {
    const { t } = await setup();
    const verifier = newVerifier();
    const challenge = await challengeFor(verifier);
    vi.useFakeTimers();
    const begunAt = Date.now();
    vi.setSystemTime(begunAt);
    const returnUrl = await t
      .withIdentity({ subject: OPERATOR_A })
      .mutation(issuance.beginSignInHandoff, {
        issuerId: SERVER_A,
        returnAddress: RETURN_A,
        challenge,
      });
    const reference = new URL(returnUrl).searchParams.get("handoff") as string;

    vi.setSystemTime(begunAt + 60_000);
    await expect(t.action(issuance.redeemSignInHandoff, { reference, verifier })).rejects.toThrow(
      /expired/,
    );
  });

  // spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
  // A handoff toward an issuer the platform holds no registration for cannot
  // begin at all — there is no registered address set for the request's address
  // to be checked against, so refusing the issuer is what keeps "registered,
  // not requested" from degenerating into "whatever the request said".
  it("refuses to begin a handoff toward an unregistered issuer", async () => {
    const { t } = await setup();

    await expect(
      t.withIdentity({ subject: OPERATOR_A }).mutation(issuance.beginSignInHandoff, {
        issuerId: "unregistered.example",
        returnAddress: "https://unregistered.example/signed-in",
        challenge: await challengeFor(newVerifier()),
      }),
    ).rejects.toThrow(/no registration for issuer unregistered.example/);
  });

  // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
  // spec: global-invariants/transactional-invariant-enforcement#concurrent-mutations-cannot-race-past-a-guard
  // The single-use guard under the same concurrency the assertion guard is
  // tested under: two correct redemptions of one reference in flight at once.
  // The component's check-and-delete is one mutation, so exactly one finds the
  // row, whichever order they land in.
  it("admits exactly one of two concurrent redemptions of one reference", async () => {
    const { t } = await setup();
    const verifier = newVerifier();
    const reference = await begunHandoff(t, verifier);

    const outcomes = await Promise.allSettled([
      t.action(issuance.redeemSignInHandoff, { reference, verifier }),
      t.action(issuance.redeemSignInHandoff, { reference, verifier }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === "rejected",
    );
    expect(rejected).toHaveLength(1);
    expect(String(rejected[0].reason)).toMatch(/no such handoff reference/);
  });
});

describe("the per-team game credential", () => {
  // spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
  // spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
  // The credential a Server earns for its team, read back in full: scoped in
  // its subject to exactly one team and one game, the operating Server on
  // record as actor, and the claim EXACTLY the two capabilities — asserted as
  // the whole claim, so a third capability arriving is a red test rather than
  // a broader credential nobody noticed.
  it("mints a credential scoped to one team and one game, granting exactly the two capabilities", async () => {
    const world = await setup();

    const credential = await earnGameCredential(world);

    const payload = await verifyIssued(credential, PLATFORM_AUDIENCE);
    expect(payload.sub).toBe(`team:${world.teamA}:${world.gameId}`);
    expect(payload.act).toBe(SERVER_A);
    expect(payload.cap).toEqual([
      { capability: "write-centaur-state" },
      { capability: "issue-game-token" },
    ]);
  });

  // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-team
  // spec: identity-and-authorization/live-game-issuance
  // Every fact minting must establish, each row breaking exactly one of them
  // against a Server that is registered, authenticated, and in good standing:
  // the requesting Server operates the named team, the team exists at all, the
  // team is on the target game's snapshot, and the game is being played right
  // now. The positive above is the control — a Server holding a valid platform
  // credential is not the reason any of these fail.
  it.each<{
    case: string;
    /** Server B is registered too; team A's record nominates A, never B. */
    asServerB?: boolean;
    world: (w: Setup) => Promise<{ teamId: string; gameId: string }>;
    refusal: RegExp;
  }>([
    {
      case: "a Server asking for a team it does not operate",
      asServerB: true,
      world: async (w) => ({ teamId: w.teamA, gameId: w.gameId }),
      refusal: /does not operate team/,
    },
    {
      case: "a team that nominates no operating server",
      world: async (w) => ({
        teamId: await w.t.mutation(platformSeed.seedTeam, { serverDomain: null }),
        gameId: w.gameId,
      }),
      refusal: /does not operate team/,
    },
    {
      // An id from another deployment or another table earns the same refusal,
      // never a crash the caller can probe.
      case: "a team id that denotes no team",
      world: async (w) => ({ teamId: "not-a-team-id", gameId: w.gameId }),
      refusal: /does not operate team/,
    },
    {
      case: "a game the team is not a participant of",
      world: async (w) => ({
        teamId: w.teamA,
        gameId: await w.t.mutation(platformSeed.seedGame, {
          status: "playing",
          roster: [{ teamId: "some-other-team", memberUserIds: [], coachUserIds: [] }],
        }),
      }),
      refusal: /not a participant of game/,
    },
    {
      case: "a game that has not started",
      world: async (w) => {
        await w.t.mutation(platformSeed.setGameStatus, { gameId: w.gameId, status: "not-started" });
        return { teamId: w.teamA, gameId: w.gameId };
      },
      refusal: /is not-started/,
    },
    {
      case: "a game that has finished",
      world: async (w) => {
        await w.t.mutation(platformSeed.setGameStatus, { gameId: w.gameId, status: "finished" });
        return { teamId: w.teamA, gameId: w.gameId };
      },
      refusal: /is finished/,
    },
  ])("refuses a credential for $case", async ({ asServerB, world, refusal }) => {
    const w = await setup();
    const { teamId, gameId } = await world(w);
    const platformCredential = await w.t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion(asServerB ? { iss: SERVER_B, key: serverBKey } : undefined),
      capabilities: ["issue-game-credential"],
    });

    await expect(
      w.t.action(issuance.issueGameCredential, {
        teamId,
        gameId,
        credential: platformCredential,
      }),
    ).rejects.toThrow(refusal);
  });
});

describe("what a game credential reaches", () => {
  // spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
  // The claim's exactness, exercised: the surface's other affordances refuse
  // the credential on capability, so "nothing else" is enforced by the claim
  // it carries rather than promised by the minting site.
  it.each([
    {
      case: "minting another game credential",
      call: (t: Setup["t"], world: Setup, credential: string) =>
        t.action(issuance.issueGameCredential, {
          teamId: world.teamA,
          gameId: world.gameId,
          credential,
        }),
      refusal: /no capability issue-game-credential/,
    },
    {
      case: "beginning a sign-in handoff",
      call: (t: Setup["t"], _world: Setup, credential: string) =>
        t.mutation(issuance.beginSignInHandoff, {
          issuerId: SERVER_A,
          returnAddress: RETURN_A,
          challenge: "any-challenge",
          credential,
        }),
      refusal: /no capability begin-sign-in-handoff/,
    },
    {
      case: "exchanging an assertion under it",
      call: async (t: Setup["t"], _world: Setup, credential: string) =>
        t.action(issuance.exchangeAssertion, {
          assertion: await signAssertion(),
          capabilities: [],
          credential,
        }),
      refusal: /no capability exchange-assertion/,
    },
  ])("refuses the credential holder $case", async ({ call, refusal }) => {
    const world = await setup();
    const credential = await earnGameCredential(world);

    await expect(call(world.t, world, credential)).rejects.toThrow(refusal);
  });

  // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-team
  // spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
  // The bot token comes from the credential's own subject, so asking for
  // another team's is not refused so much as impossible: the request's teamId
  // is not consulted, and what is minted binds the credential's team.
  it("binds a bot token to the credential's own team even when the request names another", async () => {
    const world = await setup();
    const credential = await earnGameCredential(world);

    const token = await world.t.action(issuance.issueGameToken, {
      gameId: world.gameId,
      role: "bot",
      teamId: world.teamB,
      credential,
    });

    const payload = await verifyIssued(token, world.gameId);
    expect(payload.sub).toBe(`bot:${world.teamA}`);
  });

  // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-game
  // A server operating a team in two games holds two credentials; the first
  // game's credential presented in the second game's context earns nothing,
  // even though the team participates in both.
  it("refuses a credential presented in the context of another game", async () => {
    const world = await setup();
    const credential = await earnGameCredential(world);
    const secondGame = await world.t.mutation(platformSeed.seedGame, {
      status: "playing",
      roster: [{ teamId: world.teamA, memberUserIds: [OPERATOR_A], coachUserIds: [] }],
    });

    await expect(
      world.t.action(issuance.issueGameToken, {
        gameId: secondGame,
        role: "bot",
        credential,
      }),
    ).rejects.toThrow(/credential-not-for-this-game/);
  });

  // spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
  // The credential's kind fixes what is even expressible: a Centaur Team
  // principal asks for bot tokens and nothing else.
  it.each([
    { role: "operator" as const },
    { role: "spectator" as const },
    { role: "coach" as const },
  ])("refuses a game credential asking for a $role token", async ({ role }) => {
    const world = await setup();
    const credential = await earnGameCredential(world);

    await expect(
      world.t.action(issuance.issueGameToken, {
        gameId: world.gameId,
        role,
        teamId: world.teamA,
        credential,
      }),
    ).rejects.toThrow(/a game credential obtains bot tokens alone/);
  });
});

describe("game access tokens", () => {
  // spec: identity-and-authorization/participant-token-eligibility
  // spec: identity-and-authorization/game-token-contents
  // spec: identity-and-authorization/spectator-tokens
  // spec: identity-and-authorization/coach-tokens
  // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
  // Every request below is a signed-in human's session against the same live
  // game, so the only things separating them are the roster snapshot and the
  // platform-admin row. The subject is the whole content assertion — the token
  // is minted for the game's own id, and what it binds is the role's business.
  // The rows whose request names a team it must not get are the ones that would
  // survive an implementation reading `teamId` straight off the request.
  type Role = "operator" | "bot" | "spectator" | "coach";
  type TeamKey = "teamA" | "teamB";

  it.each<{
    name: string;
    as: string;
    admin?: boolean;
    role: Role;
    requestTeam?: TeamKey;
    subject: (world: Setup) => string;
  }>([
    {
      name: "an operator on the snapshot, bound to the human and no team",
      as: OPERATOR_A,
      role: "operator",
      subject: () => `operator:${OPERATOR_A}`,
    },
    {
      // The roster snapshot the instance was seeded with is the single
      // statement of who plays for whom; a team smuggled in from the request
      // would be a second statement that could disagree with it.
      name: "an operator whose request volunteers another team, ignored",
      as: OPERATOR_A,
      role: "operator",
      requestTeam: "teamB",
      subject: () => `operator:${OPERATOR_A}`,
    },
    {
      // spec: identity-and-authorization/spectator-tokens#no-team-binding
      // A human on no roster at all, and the team the request attached is
      // dropped: a spectator binds none, on request or by default.
      name: "any authenticated human spectating, with no team binding on request",
      as: OUTSIDER,
      role: "spectator",
      requestTeam: "teamA",
      subject: () => `spectator:${OUTSIDER}`,
    },
    {
      name: "a designated coach of a participating team, bound to human and team",
      as: COACH_A,
      role: "coach",
      requestTeam: "teamA",
      subject: (world) => `coach:${COACH_A}:${world.teamA}`,
    },
    {
      // The admin holds coach standing for every team without designation, read
      // from current state — so the row seeded here takes effect on the very
      // next request, with no fresh session.
      // spec: identity-and-authorization/platform-admin-role#role-effective-without-reload
      name: "a platform admin as implicit coach of a participating team",
      as: ADMIN,
      admin: true,
      role: "coach",
      requestTeam: "teamA",
      subject: (world) => `coach:${ADMIN}:${world.teamA}`,
    },
  ])("issues to $name", async ({ as, admin, role, requestTeam, subject }) => {
    const world = await setup();
    // Through the deployment's own designation path, not a seed of the suite's:
    // it is the only writer of that table, so a suite seeding rows behind it
    // would pass while the designation remained unreachable in production.
    // spec: identity-and-authorization/platform-admin-role#a-deployment-can-designate-its-first-admin
    if (admin) {
      await world.t.mutation(internal.registry.designateAdmin, { userId: as, designated: true });
    }

    const token = await world.t.withIdentity({ subject: as }).action(issuance.issueGameToken, {
      gameId: world.gameId,
      role,
      teamId: requestTeam === undefined ? undefined : world[requestTeam],
    });

    const payload = await verifyIssued(token, world.gameId);
    expect(payload.sub).toBe(subject(world));
    // A game access token is admission to one instance and nothing else: it
    // carries no platform capability for a holder to present back here.
    expect(payload.cap).toEqual([]);
  });

  // The refusals. Which request each role's rules refuse is decided in
  // `auth/eligibility.ts` and pinned there over every role, team and admin
  // standing; one row per distinct refusal is what shows issuance consults that
  // decision and surfaces it rather than inventing its own.
  it.each<{
    name: string;
    as: string;
    admin?: boolean;
    role: Role;
    requestTeam?: TeamKey | "nonParticipant";
    refusal: RegExp;
  }>([
    {
      // spec: identity-and-authorization/participant-token-eligibility#operator-outside-roster-refused
      name: "an operator token to a human the snapshot records on no participating team",
      as: OUTSIDER,
      role: "operator",
      refusal: /not-on-a-participating-team/,
    },
    {
      name: "a coach token for the participating team the requester does not coach",
      as: COACH_A,
      role: "coach",
      requestTeam: "teamB",
      refusal: /not-a-coach-of-a-participating-team/,
    },
    {
      // spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
      // The bot role exists for Centaur Teams; a human — even one on the roster
      // — cannot request it, because a bot token is issued against a game
      // credential and a human holds none.
      name: "a bot token to a human, who holds no game credential",
      as: OPERATOR_A,
      role: "bot",
      requestTeam: "teamA",
      refusal: /issued against a game credential/,
    },
  ])("refuses $name", async ({ as, admin, role, requestTeam, refusal }) => {
    const world = await setup();
    // Through the deployment's own designation path, not a seed of the suite's:
    // it is the only writer of that table, so a suite seeding rows behind it
    // would pass while the designation remained unreachable in production.
    // spec: identity-and-authorization/platform-admin-role#a-deployment-can-designate-its-first-admin
    if (admin) {
      await world.t.mutation(internal.registry.designateAdmin, { userId: as, designated: true });
    }
    const teamId =
      requestTeam === undefined
        ? undefined
        : requestTeam === "nonParticipant"
          ? await world.t.mutation(platformSeed.seedTeam, { serverDomain: null })
          : world[requestTeam];

    await expect(
      world.t
        .withIdentity({ subject: as })
        .action(issuance.issueGameToken, { gameId: world.gameId, role, teamId }),
    ).rejects.toThrow(refusal);
  });

  // spec: identity-and-authorization/principal-kind-gating#service-reach-is-declared-never-inferred
  // spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
  // The same Server, two credentials, opposite answers. Acting as *itself* —
  // its ceiling naming issue-game-token and its credential carrying it — it is
  // refused on kind, because game tokens belong to humans and Centaur Teams.
  // Acting *for a human* through a redeemed handoff, the same capability in
  // hand earns the human's operator token. Kind, not capability, is what
  // separated the two.
  it("refuses a Server's own credential a game token while its redeemed human credential earns one", async () => {
    const { t, gameId } = await setup();
    const own = await t.action(issuance.exchangeAssertion, {
      assertion: await signAssertion(),
      capabilities: ["issue-game-token"],
    });
    await expect(
      t.action(issuance.issueGameToken, { gameId, role: "spectator", credential: own }),
    ).rejects.toThrow(/does not accept a external-system principal/);

    const verifier = newVerifier();
    const reference = await begunHandoff(t, verifier);
    const redeemed = await t.action(issuance.redeemSignInHandoff, { reference, verifier });
    const token = await t.action(issuance.issueGameToken, {
      gameId,
      role: "operator",
      credential: redeemed,
    });

    expect((await verifyIssued(token, gameId)).sub).toBe(`operator:${OPERATOR_A}`);
  });
});

describe("issuance against a live game only", () => {
  // spec: identity-and-authorization/live-game-issuance#no-tokens-for-finished-games
  // Which role a status refuses is decided in `auth/eligibility.ts` and pinned
  // there over every role and status. What only this suite can say is that
  // issuance consults that decision on both routes into it — the caller's
  // identity, and a game credential still cryptographically valid.
  it("refuses a finished game's token on both routes in", async () => {
    const world = await setup();
    const { t, gameId } = world;
    const credential = await earnGameCredential(world);
    await t.mutation(platformSeed.setGameStatus, { gameId, status: "finished" });

    await expect(
      t.withIdentity({ subject: OPERATOR_A }).action(issuance.issueGameToken, {
        gameId,
        role: "operator",
      }),
    ).rejects.toThrow(/is finished/);
    // spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
    await expect(
      t.action(issuance.issueGameToken, { gameId, role: "bot", credential }),
    ).rejects.toThrow(/is finished/);
  });

  // spec: identity-and-authorization/live-game-issuance
  it("refuses a token for a game that does not exist", async () => {
    const { t } = await setup();

    await expect(
      t.withIdentity({ subject: OPERATOR_A }).action(issuance.issueGameToken, {
        gameId: "no-such-game",
        role: "operator",
      }),
    ).rejects.toThrow(/no game/);
  });
});

describe("refresh without re-authentication", () => {
  // spec: identity-and-authorization/token-lifetime-and-refresh#refresh-without-reauth
  // A holder mid-game needs a fresh token on the strength of what it already
  // has: the human's still-valid session, and the Server's still-valid
  // registration plus a fresh self-signed assertion. Neither path involves
  // any interactive step — the same session object and the same key produce
  // the replacement, each fresh token full-lifetime.
  it("issues replacements on the still-valid session and registration alone", async () => {
    const world = await setup();
    const session = world.t.withIdentity({ subject: OPERATOR_A });

    for (const _attempt of [1, 2]) {
      const token = await session.action(issuance.issueGameToken, {
        gameId: world.gameId,
        role: "operator",
      });
      const payload = await verifyIssued(token, world.gameId);
      expect(payload.sub).toBe(`operator:${OPERATOR_A}`);
      // Each replacement is full-lifetime, not the remainder of the last one.
      expect((payload.exp as number) - (payload.iat as number)).toBe(CREDENTIAL_LIFETIME_SECONDS);

      // The Server's half: same key, same registration, only the assertion it
      // signs for itself is new. Nothing here re-authenticates with anyone.
      const credential = await earnGameCredential(world);
      expect((await verifyIssued(credential, PLATFORM_AUDIENCE)).sub).toBe(
        `team:${world.teamA}:${world.gameId}`,
      );
    }
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
  // spec: identity-and-authorization/peer-capability-ceiling#no-chain-reaches-what-one-step-may-not
  // **What the Server's half of that refresh may NOT do.** A handoff is the only
  // path that mints a credential naming a human, so beginning one is the whole
  // of renewing one — and a credential that could begin a handoff for the human
  // it names would renew itself forever, outliving the session it came from and
  // the human's decision to leave. So the redeemed credential cannot reach the
  // step, and what remains is `ctx.auth` and the sign-in routes' cookie: the
  // human's own session, read at the moment of the call.
  it("cannot begin a fresh handoff with the credential a redemption produced", async () => {
    const { t } = await setup();
    const verifier = newVerifier();
    const redeemed = await t.action(issuance.redeemSignInHandoff, {
      reference: await begunHandoff(t, verifier),
      verifier,
    });

    await expect(
      t.mutation(issuance.beginSignInHandoff, {
        credential: redeemed,
        issuerId: SERVER_A,
        returnAddress: RETURN_A,
        challenge: await challengeFor(newVerifier()),
      }),
    ).rejects.toThrow(/no capability begin-sign-in-handoff/);

    // And the same human's live session still does, so what was refused is the
    // renewal chain rather than the capability itself.
    const returnUrl = await t
      .withIdentity({ subject: OPERATOR_A })
      .mutation(issuance.beginSignInHandoff, {
        issuerId: SERVER_A,
        returnAddress: RETURN_A,
        challenge: await challengeFor(newVerifier()),
      });
    expect(returnUrl).toContain(`${RETURN_A}?handoff=`);
  });
});

describe("what the platform's own seam accepts as a credential", () => {
  // spec: identity-and-authorization/sole-credential-issuer#peer-tokens-carry-no-platform-authority
  // A registered Server signs a byte-for-byte imitation of a platform
  // credential with its own key — the key the platform genuinely trusts for
  // *assertions*. Recognition is not authorization: nothing any peer signs is
  // authority here, however perfectly shaped. The genuine earning path
  // succeeding right after is what proves the seam refused provenance, not
  // shape.
  it("refuses a platform-shaped credential a registered Server signed with its own trusted key", async () => {
    const world = await setup();
    const forged = await new SignJWT({ cap: [{ capability: "issue-game-credential" }] })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setSubject(`system:${SERVER_A}`)
      .setAudience(PLATFORM_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${CREDENTIAL_LIFETIME_SECONDS}s`)
      .sign(serverAKey);

    await expect(
      world.t.action(issuance.issueGameCredential, {
        teamId: world.teamA,
        gameId: world.gameId,
        credential: forged,
      }),
    ).rejects.toThrow(/signature verification failed/);
    await expect(earnGameCredential(world)).resolves.toBeDefined();
  });
});
