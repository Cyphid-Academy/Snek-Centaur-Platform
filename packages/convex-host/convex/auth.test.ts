// spec: identity-and-authorization/substituted-provider-verification#absence-of-configuration-is-production-behaviour
// The one property of the harness's identity substitution that has to hold in
// production: that it is not there.
//
// A test backdoor is the kind of thing that is safe until the day the condition
// gating it drifts, and this is the whole of that condition — two environment
// variables, read once. Asserted here rather than end to end because the branch
// is ten lines inside one runtime, and an end-to-end version of it can only
// clear the variables on a running deployment and then assert that *something*
// failed, which any network fault also satisfies.
import { afterEach, describe, expect, it, vi } from "vitest";
import { substitutedVerification } from "./auth";

const CLIENT_ID = "a-client.apps.googleusercontent.test";

const ISSUER = "SUBSTITUTE_IDENTITY_ISSUER";
const JWKS_URL = "SUBSTITUTE_IDENTITY_JWKS_URL";

// `vi.stubEnv` rather than assignment, because assignment cannot express the
// case under test: Node coerces an assigned value to a string, so
// `process.env["X"] = undefined` leaves the truthy string "undefined" behind and
// every "not configured" case below would silently be testing a configured
// deployment.
const configure = (env: Readonly<Record<string, string | undefined>>) => {
  for (const name of [ISSUER, JWKS_URL]) vi.stubEnv(name, env[name]);
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the substituted verification step", () => {
  it.each([
    { configured: "nothing", env: {} },
    { configured: "only an issuer", env: { [ISSUER]: "https://substitute.test" } },
    { configured: "only a key set", env: { [JWKS_URL]: "https://substitute.test/jwks.json" } },
  ])("overrides nothing when a deployment configures $configured", ({ env }) => {
    configure(env);

    // An empty object spreads no `verifyIdToken` into the provider's options, so
    // the provider verifies against Google exactly as it always did. Asserted as
    // the absence of the key rather than as a falsy value: spreading
    // `{ verifyIdToken: undefined }` would override the provider's own.
    expect(substitutedVerification(CLIENT_ID)).not.toHaveProperty("verifyIdToken");
  });

  it("overrides verification only when both are configured", () => {
    configure({
      [ISSUER]: "https://substitute.test",
      [JWKS_URL]: "https://substitute.test/jwks.json",
    });

    expect(substitutedVerification(CLIENT_ID)).toHaveProperty("verifyIdToken");
  });
});
