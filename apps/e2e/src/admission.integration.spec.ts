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
// migrate-game-lifecycle, so the instance's pinned issuer is `""` and every
// token in the world is `untrusted-issuer`. What carries the requirement is that
// different presentations are refused *differently, in different places, by
// different parties*. A connection carrying nothing is passed through by the
// host and refused by the module; a platform-signed token is passed through and
// refused with a different word — reaching the module at all is the marker for
// "the host fetched the platform's document and verified a signature it did not
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
//     `untrusted-issuer` is the blanket refusal of an unbound instance, and the
//     scenarios below that read it say so.
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
import { type GameSubject, encodeGameSubject } from "@cyphid/snek-stdb/subject";
import { type JWK, SignJWT, decodeJwt, importJWK } from "jose";
import { expect, test } from "./fixtures";
import {
  type ModuleLog,
  attemptConnection,
  exchangedForWebsocketToken,
  moduleLog,
} from "./game-instance";

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

/**
 * One subject stands for every role below, deliberately: the issuer pin and the
 * audience gate both answer before a subject is read, so a second role's token
 * would traverse the same bytes end to end.
 */
const SPECTATOR: GameSubject = { role: "spectator", userId: "u-ada" };

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
// **What it does not yet establish.** `untrusted-issuer` has two sufficient
// causes today and the log cannot separate them — the instance holds no pinned
// issuer at all (`initialize_game`, migrate-game-lifecycle), and the token's
// issuer is not it. So this is the reachability, not yet the issuer comparison.
// Both readings refuse identically, which is why the assertion survives
// initialisation unchanged: once the instance is bound, a token from any other
// issuer is refused for the narrower reason as well.
test("verifies a platform-signed token and refuses it against what it was bound to", async ({
  spacetime,
}) => {
  const mark = await log.mark();

  const attempt = await attemptConnection(
    spacetime,
    DATABASE,
    await platformSigned({ sub: SPECTATOR, aud: ANOTHER_GAME }),
  );

  expect(attempt.status).toBe(101);
  expect((await log.after(mark)).join("\n")).toContain("admission refused: untrusted-issuer");
});

// spec: identity-and-authorization/connect-time-validation#re-issuance-preserves-the-binding
// **The only assertion here about the path a browser actually takes.** Every
// other scenario in this file presents its credential on the upgrade's
// `Authorization` header, which Node can do and a browser cannot: a browser
// connects through `spacetimedb/sdk`, which first trades the presented token at
// `/v1/identity/websocket-token` for one the host re-mints under its own key.
// The requirement is satisfiable two ways — that exchange carries issuer, game
// binding and subject through unaltered, or the platform credential reaches
// admission by a path that performs no re-issuance — and which way holds is a
// fact about this host rather than a thing to reason out.
//
// It is the first: the exchange rewrites only the lifetime, shortening it to
// about a minute, and leaves `iss`, `aud` and `sub` exactly as the platform
// signed them. So the SDK's default path is admissible and a browser needs no
// hand-built socket. That is a *dependency* of this design rather than a
// property of it, which is the whole reason it is pinned: should a host release
// begin re-issuing under its own issuer, admission would refuse every browser
// in the world with `untrusted-issuer`, and this scenario is what says so
// before the game does.
test("carries the platform's claims through the host's own token exchange", async ({
  spacetime,
}) => {
  const platform = await platformSigned({ sub: SPECTATOR, aud: ANOTHER_GAME });

  const exchanged = decodeJwt(await exchangedForWebsocketToken(spacetime, platform));

  // The three the decision reads, and nothing about the fourth: `exp` is the
  // host's own and deliberately not asserted on.
  expect(exchanged.iss).toBe(issuer);
  expect(exchanged.sub).toBe(encodeGameSubject(SPECTATOR));
  expect(exchanged.aud).toContain(ANOTHER_GAME);
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
    await platformSigned({ sub: SPECTATOR, aud: ANOTHER_GAME }, stranger.privateKey),
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
 * The *envelope* is restated — `mint` lives in `packages/convex-host/convex/`,
 * which this member cannot reach, since that package exports its built `src/`
 * and the Convex function directory is not in it. The *subject* is not: it comes
 * from `@cyphid/snek-stdb/subject`, the same codec the platform writes with and
 * the module reads with, so a scenario here cannot quietly encode a subject the
 * platform would never mint. The module reads only `iss`, `aud`, `sub` and
 * `exp`; `cap` is carried because every credential the platform issues has one,
 * and no admission decision reads it.
 */
function platformSigned(
  claims: { sub: GameSubject; aud: string },
  key: CryptoKey = platformKey,
): Promise<string> {
  return new SignJWT({ cap: [] })
    .setProtectedHeader({ alg: ALG })
    .setIssuer(issuer)
    .setSubject(encodeGameSubject(claims.sub))
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(key);
}
