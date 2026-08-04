// spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone,
//       identity-and-authorization/sole-credential-issuer#no-alternative-admission,
//       identity-and-authorization/admission-validation
// A real SpacetimeDB instance, deciding on a real platform credential.
//
// The platform signs its own tokens and publishes the material to verify them
// at two well-known addresses; a game's instance must fetch that material and
// validate on it entirely alone, because a hermetic instance has nobody to ask.
// Every part of that arrangement is checked somewhere cheaper — `admit()` is a
// unit-tested pure function, the publication routes and the published
// document's shape have their tests beside `publishedMaterial()`, the module
// loads in `stack.integration.spec.ts` — and none of those establish that the
// two ends fit. They are two runtimes, one signing and one verifying, and the
// fit between them is exactly what this member is for: it cost the platform an
// algorithm nothing on its own side objected to, and a missing `kid`, both of
// which every unit test passed straight through.
//
// **The contrast is the assertion.** No single refusal here means much on its
// own, because an instance with empty seed tables refuses everything: nothing
// writes `game_binding` until `initialize_game` arrives with
// migrate-game-lifecycle, so `ctx.gameId` is `""` and every token in the world
// is `wrong-game`. What carries the requirement is that different presentations
// are refused *differently, in different places, by different parties*. A
// connection carrying nothing is passed through by the host and refused by the
// module; a platform-signed token is passed through and refused with a
// different word — reaching the module at all is the marker for "the host
// fetched the platform's document and verified a signature it did not
// produce"; and the same claims under a key the platform never published are
// refused by the host itself, before the module, which is the half that tells
// verification from transport. All three stay legible after the seed tables
// acquire a writer.
//
// **The token is signed with the deployment's own key, and issuance is not
// exercised.** `issuance:issueGameToken` cannot be reached yet — it requires a
// game in `playing` status and no function anywhere writes one, which is
// migrate-game-lifecycle's again — so the credential here is minted from the
// `credentialSigningJwk` fixture, the very key the deployment holds and
// publishes the public half of. What stays real is the platform's publication
// and the host's verification of it, and those are the whole of the
// requirement cited. What is skipped is who may *have* such a token: the
// eligibility decision, the caller's session, the roster check. Nothing here
// establishes anything about entitlement, and no assertion below is phrased as
// though it did.
//
// **What a scenario here cannot reach yet, recorded rather than stubbed:**
//
//   * The audience comparison itself, and every admission success. Both need
//     an instance bound to a game and seeded with a roster, and the only
//     writer of those tables is `initialize_game`. Until it exists,
//     `wrong-game` is the blanket refusal of an unbound instance, and the one
//     scenario below that reads it says so.
//   * `admission-validation#reject-before-touching-state`. The obvious form of
//     it is to read `admitted_connection` and find nothing, and no caller can:
//     every read path — `/sql`, a subscription, the SDK — opens a client
//     connection and so runs `onConnect`, which refuses it. The table is
//     unreadable by anybody by any means, and remains so after
//     `initialize_game` unless the operator holds an admissible game token.
//     The guarantee is structural instead — `admit()` cannot write — and
//     `packages/stdb/src/admission.test.ts` is where that is checked.
//   * The `expired` refusal. The host refuses an expired token itself, before
//     the module runs, so `admit()`'s expiry branch is unreachable from
//     outside; over the SDK's token-exchange path the presented `exp` is
//     replaced by the host's own anyway. It stays a unit-test fact.
//   * What a refused client is told. Nothing: the upgrade succeeds, the socket
//     closes with no close frame and no bytes. Every reason read below comes
//     from the module log, which is the database owner's surface and not a
//     client's — see `game-instance.ts`.
//
// No Centaur Server and no browser: nothing here is reached from a Server's
// page, and the fixtures this names are the whole of what it starts.
import { type JWK, SignJWT, importJWK } from "jose";
import { expect, test } from "./fixtures";
import { type ModuleLog, attemptConnection, moduleLog } from "./game-instance";

/** This run's game, as a database name. One instance is one game. */
const DATABASE = "snek-e2e-admission";

/**
 * A game id this instance is certainly not bound to. It stays certain after
 * `initialize_game` lands: whatever id a game is initialised with, it is one
 * this constant does not spell.
 */
const ANOTHER_GAME = "game-this-instance-is-not";

/** The platform's algorithm — `convex/auth/credential.ts`, restated. */
const ALG = "ES256";

let log: ModuleLog;
/** The private half of the deployment's signing key, ready to sign with. */
let platformKey: CryptoKey;
/** What the deployment says it is, taken from the document it publishes. */
let issuer: string;

// A worker-scoped hook, so the module is published and the deployment's
// identity read once for the file rather than once per scenario. The fixtures
// it names are built here and torn down after the last test in the worker.
test.beforeAll(async ({ spacetime, convex, credentialSigningJwk }) => {
  await spacetime.publish(DATABASE);
  log = await moduleLog(spacetime, DATABASE);
  platformKey = (await importJWK(credentialSigningJwk as JWK, ALG)) as CryptoKey;

  // Named rather than taken off an `any`: `fetch` answers `unknown` from
  // `.json()`, which is the honest type for a document this test did not write.
  const discovery = (await (
    await fetch(`${convex.siteUrl}/.well-known/openid-configuration`)
  ).json()) as { issuer: string };
  issuer = discovery.issuer;
});

// spec: identity-and-authorization/sole-credential-issuer#no-alternative-admission
// The floor, and the other half of the contrasts below: a connection
// presenting nothing is passed through by the host — `101`, there was no
// credential to object to — and refused by the module, so there is no
// anonymous door and no secondary admission path either party provides on its
// own. True of an instance with no game and true of one in play, so it never
// needs revisiting.
test("refuses a connection presenting no credential at all", async ({ spacetime }) => {
  const mark = await log.mark();

  const attempt = await attemptConnection(spacetime, DATABASE);

  expect(attempt.status).toBe(101);
  expect((await log.after(mark)).join("\n")).toContain("admission refused: unverified");
});

// spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
// **The scenario this file exists for.** A token the platform signed, presented
// to a runtime that has never held the platform's private key and was told
// nothing about the platform beyond the issuer inside the token, reaches the
// module. To do that the host had to resolve the issuer, fetch
// `/.well-known/openid-configuration` and then `/.well-known/jwks.json` from
// the deployment across a socket, and check a signature against what it found.
// The refusal that follows is the module's, and its being a *different* refusal
// from the tokenless one above is what says the claims arrived: an instance
// that had ignored the credential would have answered `unverified` here too.
//
// One subject stands for every role, deliberately: the audience gate answers
// before the subject is ever read, so a second role's token would traverse the
// same bytes end to end. The roles become distinguishable only at admission
// successes, which need an initialised game; what the subject spells here is
// not part of what this asserts.
//
// **What it does not yet establish.** `wrong-game` has two sufficient causes
// today and the log cannot separate them — the instance has no game id at all
// (`initialize_game`, migrate-game-lifecycle), and the token names a game that
// is not this one. So this is the reachability, not yet the audience
// comparison. Both readings refuse identically, which is why the assertion
// survives initialisation unchanged: once the instance is bound to a game, the
// same token for `ANOTHER_GAME` is refused for the narrower reason as well.
test("verifies a platform-signed token and refuses it on the game it names", async ({
  spacetime,
}) => {
  const mark = await log.mark();

  const attempt = await attemptConnection(
    spacetime,
    DATABASE,
    await platformSigned({ sub: "spectator:u-ada", aud: ANOTHER_GAME }),
  );

  expect(attempt.status).toBe(101);
  expect((await log.after(mark)).join("\n")).toContain("admission refused: wrong-game");
});

// spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
// spec: identity-and-authorization/admission-validation
// The signature, isolated. Every claim is identical to the token the module
// refused as `wrong-game` above — same issuer, same subject, same audience,
// same algorithm — and only the key differs. This one does not reach the module
// at all: the host refuses it itself, and says so, because the key that signed
// it is not the key the platform published.
//
// This is the assertion that a host merely *pretending* to verify would fail,
// and the one `wrong-game` on its own cannot make: a host that accepted any
// signature would have produced `wrong-game` there just the same. The pair is
// what establishes verification rather than transport.
test("refuses a token signed by a key that is not the platform's, before the module runs", async ({
  spacetime,
}) => {
  const stranger = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const mark = await log.mark();

  const attempt = await attemptConnection(
    spacetime,
    DATABASE,
    await platformSigned({ sub: "spectator:u-ada", aud: ANOTHER_GAME }, stranger.privateKey),
  );

  expect(attempt.status).toBe(401);
  expect(attempt.reason).toContain("InvalidSignature");
  // Refused by the host means refused before the module — so there is no
  // decision to read, and nothing was asked of the instance's state.
  expect(await log.after(mark)).toEqual([]);
});

/**
 * A game access token as the platform signs one.
 *
 * The claim shape is restated here rather than imported: `mint` and
 * `encodeGameSubject` live in `packages/convex-host/convex/`, which this
 * member cannot reach — that package exports its built `src/`, and the Convex
 * function directory is not in it. So this is a second spelling of the grammar
 * `convex/auth/subject.ts` writes and `packages/stdb/src/admission.ts` reads,
 * and it is the one place a drift between the platform's minting and these
 * scenarios could hide. The module reads only `aud`, `sub` and `exp`, so what
 * is restated is small; `cap` is carried because every credential the platform
 * issues has one, and no admission decision reads it.
 */
function platformSigned(
  claims: { sub: string; aud: string },
  key: CryptoKey = platformKey,
): Promise<string> {
  return new SignJWT({ cap: [] })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(issuer)
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);
}
