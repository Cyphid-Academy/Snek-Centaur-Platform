// The sign-in handoff, end to end over the deployed HTTP surface
// (t.fetch against POST /handoff/create and POST /handoff/redeem): the
// platform completes sign-in at its own origin and returns the browser to
// a registered Server carrying an opaque reference — accepted once,
// redeemable only with the PKCE-shaped verifier the URL never carried,
// expiring on the redirect it exists to survive, and conferring nothing
// on its own.
// spec: identity-and-authorization/sign-in-handoff
import {
  CAPABILITIES_CLAIM,
  platformAudience,
  readCapabilityEntries,
} from "@cyphid/snek-platform-auth";
import * as jose from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { sha256Hex } from "../convex/lib/sha256";
import { type T, makeHuman, setAuthEnv, setup, testSupport } from "./setup";

beforeAll(() => {
  setAuthEnv();
});

const RETURN_ADDRESS = "https://red.example/auth/return";
const SECOND_RETURN_ADDRESS = "https://red.example/auth/alt-return";
const DEFAULT_CEILING = ["write-centaur-state", "request-bot-tokens"];

/** Register a Server (a Centaur Team's registration) with return addresses on record. */
async function registerServer(
  t: T,
  issuerId: string,
  ceiling: ReadonlyArray<string> = DEFAULT_CEILING,
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert("trusted_issuers", {
      issuerId,
      principalKind: "centaur-team",
      materialUrl: `https://${issuerId}.example/.well-known/jwks.json`,
      ceiling: [...ceiling],
      // The ONLY addresses the platform will ever redirect to.
      // spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
      returnAddresses: [RETURN_ADDRESS, SECOND_RETURN_ADDRESS],
      callRateLimitPerMinute: 60,
    });
  });
}

let sessionCounter = 0;

/** A signed-in human: user row + live Better Auth session (stand-in for a completed Google round trip). */
async function signedInHuman(
  t: T,
  options: { readonly isAdmin?: boolean } = {},
): Promise<{ readonly userId: string; readonly sessionToken: string }> {
  sessionCounter += 1;
  const { userId } = await makeHuman(t, {
    name: `Handoff Human ${sessionCounter}`,
    ...(options.isAdmin !== undefined ? { isAdmin: options.isAdmin } : {}),
  });
  const sessionToken = `handoff-session-${sessionCounter}`;
  await t.mutation(testSupport.createSession, {
    userId,
    token: sessionToken,
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  return { userId, sessionToken };
}

/** The handoff's dedicated working-credential mint, under a renewal credential. */
async function mintWorkingCredential(
  t: T,
  renewalCredential: string,
): Promise<{ readonly status: number; readonly body: HandoffResponseBody }> {
  const response = await t.fetch("/handoff/working-credential", {
    method: "POST",
    headers: { authorization: `Bearer ${renewalCredential}` },
  });
  return { status: response.status, body: (await response.json()) as HandoffResponseBody };
}

/** Either handoff route's response body, typed for both arms. */
interface HandoffResponseBody {
  readonly ok?: boolean;
  readonly reference?: string;
  readonly returnAddress?: string;
  readonly renewalCredential?: string;
  readonly workingCredential?: string;
  readonly expiresAtMs?: number;
  readonly rejection?: unknown;
}

async function createHandoff(
  t: T,
  sessionToken: string,
  body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: HandoffResponseBody }> {
  const response = await t.fetch("/handoff/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as HandoffResponseBody };
}

async function redeemHandoff(
  t: T,
  body: Record<string, unknown>,
): Promise<{ readonly status: number; readonly body: HandoffResponseBody }> {
  const response = await t.fetch("/handoff/redeem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as HandoffResponseBody };
}

describe("sign-in handoff", () => {
  it("create→redeem happy path: the redeemer earns a renewal credential working credentials are minted under — bounded by the Server's ceiling", async () => {
    // spec: identity-and-authorization/sign-in-handoff#the-redeemer-keeps-what-it-earns
    const t = setup();
    // A ceiling that overlaps the human's own capabilities in exactly one verb,
    // so the intersection is visibly non-trivial.
    await registerServer(t, "team-red", ["write-centaur-state", "configure-games"]);
    const { sessionToken } = await signedInHuman(t);

    const verifier = "verifier-high-entropy-value-0001";
    const created = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex(verifier),
    });
    expect(created.status).toBe(200);
    // The redirect target comes from the registration, never the request.
    expect(created.body.returnAddress).toBe(RETURN_ADDRESS);
    const reference = created.body.reference as string;
    expect(reference).toBeTypeOf("string");

    const redeemed = await redeemHandoff(t, { reference, verifier });
    expect(redeemed.status).toBe(200);
    const renewalCredential = redeemed.body.renewalCredential as string;
    expect(renewalCredential).toBeTypeOf("string");

    // The reference itself conferred nothing; what redemption earned is the
    // stateful renewal anchor, under which a working credential is now mintable
    // without interactive re-authentication.
    // spec: identity-and-authorization/token-lifetime-and-refresh#refresh-without-reauth
    const minted = await mintWorkingCredential(t, renewalCredential);
    expect(minted.status).toBe(200);
    const workingCredential = minted.body.workingCredential as string;
    expect(workingCredential).toBeTypeOf("string");

    // The working credential verifies against the platform's own material and
    // is audience-bound to the platform's functions.
    const jwksResponse = await t.fetch("/api/auth/convex/jwks", { method: "GET" });
    const keySet = jose.createLocalJWKSet((await jwksResponse.json()) as jose.JSONWebKeySet);
    const { payload } = await jose.jwtVerify(workingCredential, keySet, {
      audience: platformAudience(),
    });

    // Capabilities are the human's set INTERSECTED with the Server's ceiling —
    // configure-games survives (in both); write-centaur-state is not a human
    // verb and the other human verbs are outside the ceiling, so neither leaks.
    // spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
    // spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
    expect(readCapabilityEntries(payload as Record<string, unknown>)).toEqual([
      { verb: "configure-games" },
    ]);
  });

  it("the handed-off credential of an ADMIN carries only the intersection — never administer-platform or the human-only verbs the ceiling omits", async () => {
    // A Server whose ceiling excludes administer-platform (and every other
    // human verb) cannot obtain a human-admin working credential even when
    // redeeming for an admin: the exclusion is a property of the Server.
    // spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
    // spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
    const t = setup();
    await registerServer(t, "team-red", ["write-centaur-state"]);
    const { sessionToken } = await signedInHuman(t, { isAdmin: true });

    const verifier = "verifier-high-entropy-value-admin";
    const created = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex(verifier),
    });
    const redeemed = await redeemHandoff(t, {
      reference: created.body.reference as string,
      verifier,
    });
    const minted = await mintWorkingCredential(t, redeemed.body.renewalCredential as string);
    expect(minted.status).toBe(200);

    const claims = jose.decodeJwt(minted.body.workingCredential as string) as Record<
      string,
      unknown
    >;
    // The intersection of the admin's capabilities with a ceiling of only
    // write-centaur-state (not a human verb) is empty — no administer-platform,
    // no use-platform, nothing.
    expect(readCapabilityEntries(claims)).toEqual([]);
    expect((claims[CAPABILITIES_CLAIM] as unknown[]).length).toBe(0);
  });

  it("refuses a second redeem of the same reference, whatever its remaining lifetime", async () => {
    // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
    const t = setup();
    await registerServer(t, "team-red");
    const { sessionToken } = await signedInHuman(t);

    const verifier = "verifier-high-entropy-value-0002";
    const created = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex(verifier),
    });
    const reference = created.body.reference as string;

    const first = await redeemHandoff(t, { reference, verifier });
    expect(first.status).toBe(200);

    const second = await redeemHandoff(t, { reference, verifier });
    expect(second.status).toBe(403);
    expect(second.body.rejection).toEqual({ kind: "already-redeemed" });
  });

  it("refuses a wrong verifier — a reference seen in a URL is worthless without what the URL did not carry", async () => {
    // spec: identity-and-authorization/sign-in-handoff#reference-is-accepted-once
    //   ("its defence is that redeeming it takes something the URL did
    //    not carry")
    const t = setup();
    await registerServer(t, "team-red");
    const { sessionToken } = await signedInHuman(t);

    const verifier = "verifier-high-entropy-value-0003";
    const created = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex(verifier),
    });
    const reference = created.body.reference as string;

    const stolen = await redeemHandoff(t, { reference, verifier: "guessed-wrong" });
    expect(stolen.status).toBe(403);
    expect(stolen.body.rejection).toEqual({ kind: "verifier-mismatch" });

    // A wrong verifier did not consume the reference: the legitimate
    // holder's redemption still succeeds.
    const legitimate = await redeemHandoff(t, { reference, verifier });
    expect(legitimate.status).toBe(200);
  });

  it("refuses a requested return address the registration does not record", async () => {
    // spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
    const t = setup();
    await registerServer(t, "team-red");
    const { sessionToken } = await signedInHuman(t);

    const refused = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex("verifier-high-entropy-value-0004"),
      returnAddress: "https://evil.example/collect",
    });
    expect(refused.status).toBe(403);
    expect(refused.body.rejection).toEqual({ kind: "unregistered-return-address" });

    // A registered non-default address IS honoured — the refusal above is
    // about registration, not about requesting.
    const alternate = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex("verifier-high-entropy-value-0005"),
      returnAddress: SECOND_RETURN_ADDRESS,
    });
    expect(alternate.status).toBe(200);
    expect(alternate.body.returnAddress).toBe(SECOND_RETURN_ADDRESS);
  });

  it("refuses an expired reference — it expires on the redirect it exists to survive", async () => {
    // spec: identity-and-authorization/sign-in-handoff ("expiring on the
    //   redirect it exists to survive rather than on a credential's
    //   lifetime")
    const t = setup();
    await registerServer(t, "team-red");
    const { sessionToken } = await signedInHuman(t);

    const verifier = "verifier-high-entropy-value-0006";
    const created = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex(verifier),
    });
    const reference = created.body.reference as string;

    // Age the pending reference past its lifetime.
    const refHash = await sha256Hex(reference);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("handoff_references")
        .withIndex("by_refHash", (q) => q.eq("refHash", refHash))
        .unique();
      if (row === null) throw new Error("reference row not found");
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 });
    });

    const expired = await redeemHandoff(t, { reference, verifier });
    expect(expired.status).toBe(403);
    expect(expired.body.rejection).toEqual({ kind: "expired-reference" });
  });

  it("refuses working-credential renewal once the human's ORIGINATING session is revoked", async () => {
    // The handoff credential is anchored to the human's originating session,
    // not to a second independent one: renewal re-reads that session's liveness
    // each time, so revoking it ends renewal under the handoff credential —
    // a human's absence ends what is minted in their name, whatever the
    // Server's registration still permits.
    // spec: identity-and-authorization/token-lifetime-and-refresh#renewal-re-reads-the-session
    const t = setup();
    await registerServer(t, "team-red");
    const { sessionToken } = await signedInHuman(t);

    const verifier = "verifier-high-entropy-value-0007";
    const created = await createHandoff(t, sessionToken, {
      serverId: "team-red",
      challengeS256: await sha256Hex(verifier),
    });
    const redeemed = await redeemHandoff(t, {
      reference: created.body.reference as string,
      verifier,
    });
    const renewalCredential = redeemed.body.renewalCredential as string;

    // Renewal works while the ORIGINATING session lives…
    const before = await mintWorkingCredential(t, renewalCredential);
    expect(before.status).toBe(200);

    // …and is refused the moment that ORIGINATING session is revoked — note we
    // revoke the sign-in session (`sessionToken`), not the renewal credential.
    await t.mutation(testSupport.revokeSession, { token: sessionToken });
    const after = await mintWorkingCredential(t, renewalCredential);
    expect(after.status).toBe(401);
    expect(after.body.rejection).toEqual({ kind: "renewal-refused" });
  });
});
