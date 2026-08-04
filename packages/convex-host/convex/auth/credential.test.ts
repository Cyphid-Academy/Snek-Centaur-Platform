// spec: identity-and-authorization/sole-credential-issuer,
//       identity-and-authorization/audience-bound-tokens,
//       identity-and-authorization/capability-claim-structure,
//       identity-and-authorization/token-lifetime-and-refresh,
//       identity-and-authorization/verification-without-shared-secrets
// The signing primitive, attacked from every side a credential can arrive from.
//
// Keys are generated fresh per run rather than fixed: a fixture keypair in the
// repo would be a private key in the repo, and nothing in these tests depends
// on which key signs — only on which key *verifies*.
import type { Auth } from "convex/server";
import { type JWK, SignJWT, decodeJwt, exportJWK, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { type Capability, SESSION_CAPABILITIES } from "../capabilities";
import { resolveCaller } from "../publicFunctions";
import {
  CREDENTIAL_LIFETIME_SECONDS,
  type CapabilityEntry,
  type PublishedMaterial,
  mint,
  verify,
} from "./credential";
import {
  PLATFORM_AUDIENCE,
  type PlatformPrincipal,
  decodePrincipal,
  encodePrincipal,
  publishedMaterial,
} from "./deployment";

const ALG = "ES256";
const ISSUER = "https://platform.example";
const GAME_AUDIENCE = "game-g1";
const CAP: ReadonlyArray<CapabilityEntry> = [{ capability: "issue-game-token" }];

/**
 * The algorithms a SpacetimeDB host will validate a token with — consumer
 * knowledge, not observable from this side. See the `credential.ts` header.
 */
const HOST_ACCEPTED_ALGORITHMS = ["RS256", "ES256"];

/**
 * Every field the published document is allowed to carry, stated here
 * independently of the list `deployment.ts` derives it with. Two spellings that
 * must agree is the point: a private field added to that list is a field this
 * one has never heard of, and the assertion below fails rather than the leak
 * shipping.
 */
const PUBLISHABLE_JWK_FIELDS = ["kty", "crv", "x", "y", "n", "e", "alg", "kid"];

// The deployment's keypair and the material it publishes, plus a second,
// equally well-formed keypair that is NOT the deployment's — the difference
// between them is the whole of what asymmetric verification establishes.
let signingKey: CryptoKey;
let material: PublishedMaterial;
let strangerKey: CryptoKey;
/** The deployment's own signing JWK, for the one case that swaps it out and back. */
let deploymentJwk: JWK;

beforeAll(async () => {
  const deployment = await generateKeyPair(ALG, { extractable: true });
  signingKey = deployment.privateKey;
  deploymentJwk = await exportJWK(deployment.privateKey);
  material = { issuer: ISSUER, publicJwk: await exportJWK(deployment.publicKey) };
  const stranger = await generateKeyPair(ALG, { extractable: true });
  strangerKey = stranger.privateKey;

  // `resolveCaller` reads the deployment's key and issuer from the environment,
  // exactly as the Convex runtime supplies them; the seam tests below exercise
  // the same env-derived path production runs.
  process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(deploymentJwk);
  process.env["CONVEX_SITE_URL"] = ISSUER;
});

const mintPlatformToken = (overrides?: {
  subject?: string;
  audience?: string;
  cap?: ReadonlyArray<CapabilityEntry>;
  act?: string;
  key?: CryptoKey;
  issuer?: string;
}) =>
  mint(overrides?.key ?? signingKey, overrides?.issuer ?? ISSUER, {
    subject: overrides?.subject ?? "user:u1",
    audience: overrides?.audience ?? PLATFORM_AUDIENCE,
    cap: overrides?.cap ?? CAP,
    act: overrides?.act,
  });

/**
 * A token built outside `mint`, for shapes `mint`'s signature cannot express —
 * absent subjects, string claims, chosen timestamps.
 */
async function craft(shape: {
  payload: Record<string, unknown>;
  sub?: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
  key?: CryptoKey;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let jwt = new SignJWT(shape.payload)
    .setProtectedHeader({ alg: ALG })
    .setIssuer(shape.iss ?? ISSUER)
    .setAudience(shape.aud ?? PLATFORM_AUDIENCE)
    .setIssuedAt(shape.iat ?? now)
    .setExpirationTime(shape.exp ?? now + CREDENTIAL_LIFETIME_SECONDS);
  if (shape.sub !== undefined) jwt = jwt.setSubject(shape.sub);
  return jwt.sign(shape.key ?? signingKey);
}

const b64uDecode = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const b64uEncode = (s: string) =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Rewrite a signed token's payload, keeping the original signature. */
function tamperedPayload(token: string, mutate: (payload: Record<string, unknown>) => void) {
  const [header, payload, signature] = token.split(".");
  const claims = JSON.parse(b64uDecode(payload)) as Record<string, unknown>;
  mutate(claims);
  return [header, b64uEncode(JSON.stringify(claims)), signature].join(".");
}

/** Destroy a token's signature while leaving everything else readable. */
const withBrokenSignature = (token: string) => {
  const [header, payload] = token.split(".");
  return [
    header,
    payload,
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ].join(".");
};

describe("minting and verification", () => {
  // spec: identity-and-authorization/sole-credential-issuer
  // spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
  // The positive path every refusal below is measured against — including the
  // service principal that obtained the credential where one did, and nothing
  // invented where none did.
  it("verifies a credential the deployment minted, returning its claims intact", async () => {
    const obtained = await verify(
      await mintPlatformToken({ act: "server.example" }),
      material,
      PLATFORM_AUDIENCE,
    );

    expect(obtained.sub).toBe("user:u1");
    expect(obtained.iss).toBe(ISSUER);
    expect(obtained.cap).toEqual([{ capability: "issue-game-token" }]);
    expect(obtained.act).toBe("server.example");

    const direct = await verify(await mintPlatformToken(), material, PLATFORM_AUDIENCE);
    expect(direct.act).toBeUndefined();
  });

  // spec: identity-and-authorization/sole-credential-issuer#app-never-self-issues
  it("refuses a token signed by a different key, however well-formed", async () => {
    const forged = await mintPlatformToken({ key: strangerKey });

    await expect(verify(forged, material, PLATFORM_AUDIENCE)).rejects.toThrow(
      /signature verification failed/,
    );
  });

  // spec: identity-and-authorization/sole-credential-issuer
  it("refuses a token whose issuer claim is not the published issuer", async () => {
    const token = await mintPlatformToken({ issuer: "https://elsewhere.example" });

    await expect(verify(token, material, PLATFORM_AUDIENCE)).rejects.toThrow(/"iss" claim/);
  });
});

describe("audience binding", () => {
  // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
  // The binding in every direction.
  it.each([
    {
      case: "a platform credential presented at a game's instance",
      mintFor: PLATFORM_AUDIENCE,
      presentedAt: GAME_AUDIENCE,
    },
    {
      case: "a game access token presented at the platform",
      mintFor: GAME_AUDIENCE,
      presentedAt: PLATFORM_AUDIENCE,
    },
    {
      case: "one game's token presented at another game's instance",
      mintFor: GAME_AUDIENCE,
      presentedAt: "game-g2",
    },
  ])("refuses $case", async ({ mintFor, presentedAt }) => {
    const token = await mintPlatformToken({ audience: mintFor });

    await expect(verify(token, material, presentedAt)).rejects.toThrow(
      /names a different audience/,
    );
    // The same token at its own audience verifies — so the refusal above is
    // the binding, not a verifier that refuses everything.
    await expect(verify(token, material, mintFor)).resolves.toBeDefined();
  });

  // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
  // The ordering is observable: a token whose signature is garbage still earns
  // the audience refusal when the audience is wrong, and the signature error
  // only once it matches. If signature ran first, both would fail on it.
  it("refuses the audience before the signature is ever considered", async () => {
    const broken = withBrokenSignature(await mintPlatformToken({ audience: GAME_AUDIENCE }));

    await expect(verify(broken, material, PLATFORM_AUDIENCE)).rejects.toThrow(
      /names a different audience/,
    );
    await expect(verify(broken, material, GAME_AUDIENCE)).rejects.toThrow(
      /signature verification failed/,
    );
  });

  // spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
  // JWT allows an array `aud`, and jose's own matcher ACCEPTS an array
  // containing the target (verified empirically), so only the strict equality
  // pre-check stands between a multi-audience credential and validity at every
  // resource it lists. This test is what fails if that check is ever relaxed
  // to jose's semantics.
  it("refuses a token naming two audiences, at each of the audiences it names", async () => {
    const now = Math.floor(Date.now() / 1000);
    const twoFaced = await new SignJWT({ cap: CAP })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setSubject("user:u1")
      .setAudience([PLATFORM_AUDIENCE, GAME_AUDIENCE])
      .setIssuedAt(now)
      .setExpirationTime(now + CREDENTIAL_LIFETIME_SECONDS)
      .sign(signingKey);

    await expect(verify(twoFaced, material, PLATFORM_AUDIENCE)).rejects.toThrow(
      /names a different audience/,
    );
    await expect(verify(twoFaced, material, GAME_AUDIENCE)).rejects.toThrow(
      /names a different audience/,
    );
  });
});

describe("lifetime", () => {
  // spec: identity-and-authorization/token-lifetime-and-refresh
  // Read off the minted token itself: the constant a holder schedules renewal
  // against must be the lifetime the token actually carries.
  it("stamps an expiry exactly fifteen minutes after issuance", async () => {
    const { iat, exp } = decodeJwt(await mintPlatformToken());

    expect(exp).toBeDefined();
    expect(iat).toBeDefined();
    expect((exp as number) - (iat as number)).toBe(CREDENTIAL_LIFETIME_SECONDS);
    expect(CREDENTIAL_LIFETIME_SECONDS).toBe(15 * 60);
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh
  // The boundary from both sides: no tolerance window, so a token whose expiry
  // is this very second is already refused. The margin on the valid side is a
  // few seconds only so a slow test run cannot cross the boundary
  // mid-assertion.
  it.each([
    { case: "one second past its expiry", offset: -1, accepted: false },
    { case: "at the very instant of expiry", offset: 0, accepted: false },
    { case: "still inside its lifetime", offset: 5, accepted: true },
  ])("$case: accepted=$accepted", async ({ offset, accepted }) => {
    const now = Math.floor(Date.now() / 1000);
    const token = await craft({
      payload: { cap: CAP },
      sub: "user:u1",
      iat: now - CREDENTIAL_LIFETIME_SECONDS + offset,
      exp: now + offset,
    });

    const verified = verify(token, material, PLATFORM_AUDIENCE);
    if (accepted) await expect(verified).resolves.toBeDefined();
    else await expect(verified).rejects.toThrow(/"exp" claim timestamp check failed/);
  });

  // spec: identity-and-authorization/token-lifetime-and-refresh
  // A JWT verifier checks an expiry only where one is present, so absence is
  // refused only because `verify` names `exp` as *required* — the lifetime is
  // not enforceable by trusting every minting site, and `verify` is also the
  // primitive peer assertions and every future verifier build on.
  it("refuses a token that carries no expiry", async () => {
    const eternal = await new SignJWT({ cap: CAP })
      .setProtectedHeader({ alg: ALG })
      .setIssuer(ISSUER)
      .setSubject("user:u1")
      .setAudience(PLATFORM_AUDIENCE)
      .setIssuedAt()
      .sign(signingKey);

    await expect(verify(eternal, material, PLATFORM_AUDIENCE)).rejects.toThrow(/exp/);
  });
});

describe("capability claim structure", () => {
  // spec: identity-and-authorization/capability-claim-structure#uniform-today-attenuable-tomorrow
  it("mints the same structured entries for every holder, each entry a bare capability", async () => {
    const gameCredentialCap: ReadonlyArray<CapabilityEntry> = [
      { capability: "write-centaur-state" },
      { capability: "issue-game-token" },
    ];
    const serverA = await mintPlatformToken({
      subject: "team:tA:g1",
      cap: gameCredentialCap,
      act: "server-a.example",
    });
    const serverB = await mintPlatformToken({
      subject: "team:tB:g1",
      cap: gameCredentialCap,
      act: "server-b.example",
    });

    const capA = (await verify(serverA, material, PLATFORM_AUDIENCE)).cap;
    const capB = (await verify(serverB, material, PLATFORM_AUDIENCE)).cap;
    expect(capA).toEqual(capB);
    for (const entry of capA) {
      expect(Object.keys(entry)).toEqual(["capability"]);
    }
  });
});

describe("verification without shared secrets", () => {
  // spec: identity-and-authorization/verification-without-shared-secrets#same-material-platform-wide
  // The same material that verified a platform credential above verifies a
  // game token here.
  it("verifies tokens for any audience against the one published material", async () => {
    const gameToken = await mintPlatformToken({ audience: GAME_AUDIENCE, cap: [] });

    await expect(verify(gameToken, material, GAME_AUDIENCE)).resolves.toBeDefined();
  });

  // spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
  // The production derivation, not a hand-built fixture. Both halves matter:
  // without the second, a function that dropped the *public* half too would
  // pass; without the first, one that dropped nothing would.
  it("publishes material stripped of the private component that still verifies", async () => {
    const published = publishedMaterial();

    expect(published.publicJwk.d).toBeUndefined();
    await expect(
      verify(await mintPlatformToken(), published, PLATFORM_AUDIENCE),
    ).resolves.toBeDefined();
  });

  // spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
  // The published key's shape, checked against what its one hermetic consumer
  // will accept. A SpacetimeDB host discards an entire key set whose entry
  // carries no `kid` (`KeyError(MissingKeyId)`) and refuses every algorithm
  // outside RS256/ES256 (`InvalidAlgorithm`) — both established by running one,
  // in `apps/e2e`. `http.test.ts` cannot hold this: the routes are pinned to
  // `publishedMaterial()`'s own output, so a shape defect passes straight
  // through.
  //
  // Asserted as an allow-list rather than a sweep for known-private names. A
  // sweep passes whenever the *test's* key happens to be one whose private
  // component is spelled `d`, so it would stay green through the migration it
  // exists to guard — a P-256 key says nothing about what an RSA one would
  // publish.
  //
  // spec: global-invariants/credential-confinement#signing-keys-never-leave-convex
  it("publishes a key in the one shape a game instance accepts, and nothing else at all", () => {
    const key = publishedMaterial().publicJwk;

    expect(key.kid).toEqual(expect.any(String));
    expect(HOST_ACCEPTED_ALGORITHMS).toContain(key.alg);
    expect(Object.keys(key).sort()).toEqual(
      Object.keys(key)
        .filter((field) => PUBLISHABLE_JWK_FIELDS.includes(field))
        .sort(),
    );
  });

  // spec: global-invariants/credential-confinement#signing-keys-never-leave-convex
  // RS256 is the only other algorithm a game instance accepts, so it is what
  // anyone reaching for a change would reach for. An RSA signing key must
  // publish `n` and `e` and nothing else — never `p`, `q`, `dp`, `dq` or `qi`,
  // from which the signing key is reconstructible.
  it("would publish nothing private from an RSA key either", async () => {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(await exportJWK(privateKey));

    const key = publishedMaterial().publicJwk;

    expect(Object.keys(key).sort()).toEqual(["alg", "e", "kid", "kty", "n"]);

    process.env["CREDENTIAL_SIGNING_JWK"] = JSON.stringify(deploymentJwk);
  });
});

describe("forgery", () => {
  // spec: identity-and-authorization/audience-bound-tokens#compromise-contained
  // Each row alters one thing about a signed token after signing; the
  // signature is the only defence, so each must fail on it.
  it.each([
    {
      case: "a capability added to the claim",
      mutate: (p: Record<string, unknown>) =>
        (p.cap as CapabilityEntry[]).push({ capability: "exchange-assertion" as Capability }),
    },
    {
      case: "the subject rewritten to another principal",
      mutate: (p: Record<string, unknown>) => {
        p.sub = "user:someone-else";
      },
    },
    {
      case: "the expiry pushed into the future",
      mutate: (p: Record<string, unknown>) => {
        p.exp = (p.exp as number) + 24 * 60 * 60;
      },
    },
  ])("refuses a signed token with $case", async ({ mutate }) => {
    const tampered = tamperedPayload(await mintPlatformToken(), mutate);

    // The tampered token still *decodes* — the alteration took. Only the
    // signature stands between it and acceptance.
    expect(decodeJwt(tampered)).toBeDefined();
    await expect(verify(tampered, material, PLATFORM_AUDIENCE)).rejects.toThrow(
      /signature verification failed/,
    );
  });

  // spec: identity-and-authorization/verification-without-shared-secrets
  // The classic downgrade: the verifier's algorithm allowlist, not the token's
  // header, decides what verification means.
  it('refuses a token whose header claims alg "none"', async () => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64uEncode(JSON.stringify({ alg: "none" }));
    const payload = b64uEncode(
      JSON.stringify({
        iss: ISSUER,
        sub: "user:u1",
        aud: PLATFORM_AUDIENCE,
        iat: now,
        exp: now + CREDENTIAL_LIFETIME_SECONDS,
        cap: CAP,
      }),
    );

    await expect(verify(`${header}.${payload}.`, material, PLATFORM_AUDIENCE)).rejects.toThrow();
  });

  // spec: identity-and-authorization/verification-without-shared-secrets
  // Key-confusion: the published material is public by design, so an attacker
  // holds it too. If a symmetric algorithm could verify, the public JWK would
  // become a shared secret anyone could sign with.
  it("refuses a token HMAC-signed with the published public material as the secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const secret = new TextEncoder().encode(JSON.stringify(material.publicJwk));
    const confused = await new SignJWT({ cap: CAP })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(ISSUER)
      .setSubject("user:u1")
      .setAudience(PLATFORM_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + CREDENTIAL_LIFETIME_SECONDS)
      .sign(secret);

    await expect(verify(confused, material, PLATFORM_AUDIENCE)).rejects.toThrow();
  });

  // spec: identity-and-authorization/sole-credential-issuer
  // A credential arrives off the wire, so the verifier meets strings that are
  // not JWTs at all. Each must be a refusal, never an acceptance and never a
  // hang.
  it.each([
    { case: "a string with no dots at all", token: "not-a-jwt" },
    { case: "only two segments", token: "eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1c2VyOnUxIn0" },
    { case: "four segments", token: "a.b.c.d" },
    {
      case: "a payload that is not JSON",
      token: `${b64uEncode('{"alg":"EdDSA"}')}.${b64uEncode("hello")}.sig`,
    },
    { case: "the empty string", token: "" },
  ])("refuses $case", async ({ token }) => {
    await expect(verify(token, material, PLATFORM_AUDIENCE)).rejects.toThrow();
  });
});

describe("the platform's own enforcement seam", () => {
  const anonymousAuth: { auth: Auth } = { auth: { getUserIdentity: async () => null } };

  /** A caller Convex resolved a session for, as the runtime hands it over. */
  const sessionAuthFor = (subject: string): { auth: Auth } => ({
    auth: {
      getUserIdentity: async () => ({
        tokenIdentifier: `${ISSUER}|${subject}`,
        issuer: ISSUER,
        subject,
      }),
    },
  });

  // spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
  // The positive path through the seam every refusal below diverges from.
  it("resolves a platform credential to its principal and capabilities", async () => {
    const caller = await resolveCaller(anonymousAuth, await mintPlatformToken());

    expect(caller).toEqual({
      principal: { kind: "human", userId: "u1" },
      capabilities: ["issue-game-token"],
    });
  });

  // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
  // The enforcement site reads entries, and a string is not entries.
  it.each([
    { case: "a space-joined string", cap: "issue-game-token write-centaur-state" },
    { case: "a bare string", cap: "issue-game-token" },
    { case: "no cap claim at all", cap: undefined },
  ])("refuses a correctly signed credential whose cap claim is $case", async ({ cap }) => {
    const token = await craft({ payload: cap === undefined ? {} : { cap }, sub: "user:u1" });

    await expect(resolveCaller(anonymousAuth, token)).rejects.toThrow();
  });

  // spec: identity-and-authorization/identity-kinds
  // That the seam refuses what `decodePrincipal` answers null for — the forms
  // themselves are enumerated in "principal subjects" below.
  it.each([
    { case: "no subject at all", sub: undefined },
    // A game token's subject vocabulary (`subject.ts`) names game-participant
    // identities, which are derived and live inside an instance — never
    // principals at this deployment's door. Even if such a token somehow got
    // past the audience check, its subject identifies nobody here.
    { case: "a game token's operator subject", sub: "operator:u1" },
  ])("refuses a correctly signed credential carrying $case", async ({ sub }) => {
    const token = await craft({ payload: { cap: CAP }, sub });

    await expect(resolveCaller(anonymousAuth, token)).rejects.toThrow(
      /no principal this platform recognises/,
    );
  });

  // spec: identity-and-authorization/sole-credential-issuer#app-never-self-issues
  // The seam must VERIFY, not merely decode. Every row decodes into a
  // plausible caller and differs only in what the signature or the clock says.
  // A seam that read claims without verifying would resolve all three, and
  // (checked by mutation) the rest of this suite would not notice: the
  // capability- and subject-shape refusals above all fail before the signature
  // matters, and the audience refusal reads an unverified claim by design.
  it.each([
    {
      case: "a credential signed by a key that is not the deployment's",
      token: () => mintPlatformToken({ key: strangerKey }),
    },
    {
      case: "a credential past its expiry",
      token: () => {
        const now = Math.floor(Date.now() / 1000);
        return craft({
          payload: { cap: CAP },
          sub: "user:u1",
          iat: now - CREDENTIAL_LIFETIME_SECONDS - 1,
          exp: now - 1,
        });
      },
    },
    {
      case: "a genuine credential whose claim was widened after signing",
      token: async () =>
        tamperedPayload(await mintPlatformToken(), (p) =>
          (p.cap as CapabilityEntry[]).push({ capability: "exchange-assertion" as Capability }),
        ),
    },
  ])("refuses $case at the seam", async ({ token }) => {
    await expect(resolveCaller(anonymousAuth, await token())).rejects.toThrow();
  });

  // spec: identity-and-authorization/capability-claim-structure#structured-from-the-first-token
  // An *array of bare strings* is not entries either. Unlike the string cases
  // above it survives `resolveCaller` today — the mapped claim is just
  // `[undefined]` — so the property to hold is that it confers nothing, by
  // refusal or by an empty grant. A reader that fell back to the string itself
  // (`entry.capability ?? entry`) is what this catches.
  it("confers no capability from a claim whose entries are bare strings", async () => {
    const token = await craft({
      payload: { cap: ["issue-game-token", "exchange-assertion"] },
      sub: "user:u1",
    });

    const conferred = await resolveCaller(anonymousAuth, token).then(
      (caller) => caller?.capabilities ?? [],
      () => [], // outright refusal confers nothing too — either outcome is sound
    );
    expect(conferred).not.toContain("issue-game-token");
    expect(conferred).not.toContain("exchange-assertion");
  });

  // spec: identity-and-authorization/identity-kinds
  // JSON lets `sub` be a number, jose verifies such a token, and a numeric
  // subject reaching `split` unguarded would be a crash deep in enforcement.
  // Whatever the mechanism, the observable contract is refusal.
  it("refuses a correctly signed credential whose subject is not a string", async () => {
    const token = await craft({ payload: { cap: CAP, sub: 123 } });

    await expect(resolveCaller(anonymousAuth, token)).rejects.toThrow();
  });

  // spec: identity-and-authorization/authentication-required#unauthenticated-refused
  // The anonymous caller (whom `admit` then holds to ANONYMOUS_CAPABILITIES),
  // never a principal and never a crash inside the verifier.
  it("resolves an empty credential string to the anonymous caller", async () => {
    await expect(resolveCaller(anonymousAuth, "")).resolves.toBeNull();
  });

  // spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
  // spec: identity-and-authorization/linked-provider-credentials#the-linkage-is-the-only-lookup
  // The session way in: the identity Convex resolved (against the Better Auth
  // linkage) holds exactly the session claim — in particular none of the
  // bootstrap capabilities a session-holder has no business re-proving.
  it("resolves a Convex-authenticated session to a human principal with the session claim", async () => {
    const sessionAuth = sessionAuthFor("u9");

    await expect(resolveCaller(sessionAuth, undefined)).resolves.toEqual({
      principal: { kind: "human", userId: "u9" },
      capabilities: SESSION_CAPABILITIES,
    });
  });

  // spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
  // Confused deputy at the seam: when a request carries both a session and a
  // credential, the credential decides who is calling — never quietly
  // inheriting the browser session's identity or its broader claim.
  it("resolves the credential, not the ambient session, when both are present", async () => {
    const sessionAuth = sessionAuthFor("session-human");
    const credential = await mintPlatformToken({
      subject: "team:t1:g1",
      cap: [{ capability: "issue-game-token" }],
      act: "server.example",
    });

    await expect(resolveCaller(sessionAuth, credential)).resolves.toEqual({
      principal: { kind: "centaur-team", teamId: "t1", gameId: "g1" },
      capabilities: ["issue-game-token"],
      actingSystem: "server.example",
    });
  });
});

describe("principal subjects", () => {
  // spec: identity-and-authorization/identity-kinds
  // A kind whose encoding did not round-trip would come back as somebody else
  // — the substitution no signature check can catch, because the platform
  // itself would have signed it.
  it.each<{ kind: string; principal: PlatformPrincipal }>([
    { kind: "human", principal: { kind: "human", userId: "u1" } },
    { kind: "external-system", principal: { kind: "external-system", issuerId: "peer-1" } },
    { kind: "centaur-team", principal: { kind: "centaur-team", teamId: "t1", gameId: "g1" } },
    // The ids a trusted issuer is actually registered under. A Server is
    // identified by the domain it is operated from, and a domain carrying a
    // port has a colon in it, as does every origin-shaped id — the reference
    // app derives one from its own request origin.
    {
      kind: "external-system registered by origin",
      principal: { kind: "external-system", issuerId: "https://team.example.com" },
    },
    {
      kind: "external-system registered with a port",
      principal: { kind: "external-system", issuerId: "127.0.0.1:34399" },
    },
  ])("round-trips a $kind principal through its encoded subject", ({ principal }) => {
    expect(decodePrincipal(encodePrincipal(principal))).toEqual(principal);
  });

  // spec: identity-and-authorization/identity-kinds
  // The round-trip above is only worth anything if it is *injective*, and what
  // makes it injective is the tag deciding how much of the rest is an id —
  // never a promise that ids carry no colon, which is not true of the ids this
  // platform registers. See `decodePrincipal` in `deployment.ts`.
  it("decodes a colon-bearing id to itself, never to a prefix of itself", () => {
    expect(decodePrincipal("user:a:b")).toEqual({ kind: "human", userId: "a:b" });
    expect(decodePrincipal("user:a:b")).not.toEqual({ kind: "human", userId: "a" });
  });

  // spec: identity-and-authorization/identity-kinds
  // A team subject is the one that still splits exactly, and it can: both ids
  // are Convex ids this platform generated, so neither carries a colon by
  // construction rather than by assumption.
  //
  // The parser sits at the platform's trust boundary, so it is total over what
  // can actually arrive rather than over what a well-behaved minter sends:
  // JSON lets `sub` be any value, and jose hands back whatever was signed.
  it.each([
    { case: "a team subject with a segment beyond its game", sub: "team:t1:g1:junk" },
    { case: "a team subject with no game", sub: "team:t1" },
    { case: "a bare tag", sub: "user" },
    { case: "a tag with nothing after it", sub: "user:" },
    { case: "a kind this platform does not name", sub: "robot:r1" },
    { case: "a number", sub: 123 },
    { case: "absent", sub: undefined },
    { case: "an object", sub: { userId: "u1" } },
  ])("answers no principal for a subject that is $case", ({ sub }) => {
    expect(decodePrincipal(sub)).toBeNull();
  });
});
