// spec: identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/anonymous-reach,
//       identity-and-authorization/google-sign-in
// The two sign-in routes, at everything they decide before a provider is
// involved: which requests are refused, and with what status. Nothing here may
// reach the network — a fetch at all is a failure of that claim.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { type Harness, inPlatformComponent, withComponents } from "./harness.testing";

const ISSUER = "https://platform.example";
const SERVER_ID = "server.example";
const RETURN_ADDRESS = "https://server.example/auth/callback";
const CHALLENGE = "a-challenge-the-page-kept-the-verifier-for";

// The component owns `trusted_issuers` and ships no registration write yet.
const registerServer = (t: Harness) =>
  inPlatformComponent(t, (ctx) =>
    ctx.db.insert("trusted_issuers", {
      issuerId: SERVER_ID,
      verificationMaterialUrl: "https://server.example/.well-known/jwks.json",
      capabilityCeiling: ["issue-game-token"],
      returnAddresses: [RETURN_ADDRESS],
    }),
  );

const entry = (params: Record<string, string>) =>
  `/sign-in?${new URLSearchParams(params).toString()}`;

const registered = { issuer: SERVER_ID, return: RETURN_ADDRESS, challenge: CHALLENGE };

beforeAll(() => {
  process.env["CONVEX_SITE_URL"] = ISSUER;
  vi.stubGlobal("fetch", async (url: RequestInfo | URL) => {
    throw new Error(`the entry route reached the network at ${String(url)}`);
  });
});

describe("beginning a sign-in", () => {
  // spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
  // Both rows assert the refusal AND that no provider was reached: the stubbed
  // fetch throws, so a route that checked late would fail loudly.
  it.each([
    {
      case: "an issuer no registration records",
      params: { ...registered, issuer: "nobody.example" },
      refusal: /no registration for issuer nobody.example/,
    },
    {
      case: "an address the issuer did not register",
      params: { ...registered, return: "https://attacker.example/collect" },
      refusal: /not a return address this issuer registered/,
    },
  ])("refuses $case before reaching the provider", async ({ params, refusal }) => {
    const t = await withComponents();
    await registerServer(t);

    const response = await t.fetch(entry(params));

    expect(response.status).toBe(403);
    expect(await response.text()).toMatch(refusal);
  });

  // A browser is the caller, so an incomplete request gets a status it can be
  // shown rather than an exception surfacing as a 500.
  it.each<{ missing: string; params: Record<string, string> }>([
    { missing: "issuer", params: { return: RETURN_ADDRESS, challenge: CHALLENGE } },
    { missing: "return address", params: { issuer: SERVER_ID, challenge: CHALLENGE } },
    { missing: "challenge", params: { issuer: SERVER_ID, return: RETURN_ADDRESS } },
  ])("refuses a request with no $missing", async ({ params }) => {
    const t = await withComponents();
    await registerServer(t);

    const response = await t.fetch(entry(params));

    expect(response.status).toBe(400);
  });

  // A route that refused the request but wrote a reference anyway would leave a
  // redeemable row nobody asked for.
  it("writes no handoff when it refuses", async () => {
    const t = await withComponents();
    await registerServer(t);

    await t.fetch(entry({ ...registered, return: "https://attacker.example/collect" }));

    const rows = await inPlatformComponent(t, (ctx) => ctx.db.query("sign_in_handoffs").collect());
    expect(rows).toHaveLength(0);
  });
});

describe("returning from the provider", () => {
  // spec: identity-and-authorization/authentication-required#unauthenticated-refused
  // The refusal comes from the shared `admitCaller` on `begin-sign-in-handoff`,
  // which is what pins that the HTTP builder routes through the gate rather
  // than around it.
  it("refuses a browser arriving with no session", async () => {
    const t = await withComponents();
    await registerServer(t);

    const response = await t.fetch(`/sign-in/return?${new URLSearchParams(registered)}`);

    expect(response.status).toBe(401);
    expect(await response.text()).toMatch(/no capability begin-sign-in-handoff/);
  });
});
