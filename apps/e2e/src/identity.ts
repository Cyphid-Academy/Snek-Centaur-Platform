// spec: identity-and-authorization/substituted-provider-verification
// A signed-in human, without Google.
//
// The material is served over loopback from this process. It is genuinely
// fetched by the deployment across a socket, which is the point: the platform
// exercises its ordinary remote-key-set path rather than a branch that only
// exists under test.
// spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
import { type Server, createServer } from "node:http";
import type { BrowserContext } from "@playwright/test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";
import { loopbackOrigin } from "./process";

/** What the substituted provider asserts about a human. */
export interface Human {
  /** The provider's immutable subject — what the platform links an account to. */
  readonly subject: string;
  readonly email: string;
  readonly name?: string | undefined;
}

export interface IdentityProvider {
  /** The `iss` of every assertion, and where the key set is published. */
  readonly issuer: string;
  readonly jwksUrl: string;
  /** The audience assertions name: the OAuth client the deployment is configured with. */
  readonly audience: string;
  /** An identity assertion for one human, as the provider would have signed it. */
  assert(human: Human): Promise<string>;
  stop(): Promise<void>;
}

/**
 * Google's own assertions are RS256, and this stands in for Google — so a
 * deployment that verifies these verifies the same shape it verifies in
 * production.
 */
const ALG = "RS256";

/** Long enough for a run, short enough that a leaked one is worth nothing. */
const ASSERTION_LIFETIME = "10m";

const JWKS_PATH = "/jwks.json";

export async function startIdentityProvider(audience: string): Promise<IdentityProvider> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
  const publicJwk = { ...(await exportJWK(publicKey)), alg: ALG, use: "sig", kid: "substitute" };

  const server: Server = createServer((request, response) => {
    if (request.url !== JWKS_PATH) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  const issuer = await loopbackOrigin(server);

  return {
    issuer,
    jwksUrl: `${issuer}${JWKS_PATH}`,
    audience,
    async assert(human: Human): Promise<string> {
      return await new SignJWT({
        email: human.email,
        email_verified: true,
        name: human.name ?? human.email,
      })
        .setProtectedHeader({ alg: ALG, kid: "substitute" })
        .setIssuer(issuer)
        .setSubject(human.subject)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime(ASSERTION_LIFETIME)
        .sign(privateKey);
    },
    // A listening socket is as effective at holding a port as a child process
    // is, and as effective at keeping the runner from exiting.
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Sign a human in, inside `context`, leaving the session wherever the platform
 * put it.
 *
 * The request is issued through the browser context's own request client, which
 * shares that context's cookie jar with the pages in it. So the `Set-Cookie`
 * headers the platform returns are stored by the browser, under the browser's
 * rules, with every attribute the platform asked for — and a `Set-Cookie` that
 * clears a cookie clears it, because that is also the browser's rule.
 *
 * Deliberately not `context.addCookies` with a session reconstructed here: that
 * is cookie *placement*, which the requirement leaves to the platform, and a
 * reconstruction drops `Secure`, `Domain` and `Expires` and guesses at
 * `SameSite`. A context that can be handed a session is a context a scenario
 * can give a session the platform never issued.
 *
 * spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
 */
export async function signIn(
  context: BrowserContext,
  siteUrl: string,
  provider: IdentityProvider,
  human: Human,
): Promise<void> {
  const response = await context.request.post(`${siteUrl}/api/auth/sign-in/social`, {
    headers: { "content-type": "application/json" },
    data: { provider: "google", idToken: { token: await provider.assert(human) } },
  });
  if (!response.ok()) {
    throw new Error(
      `sign-in refused ${human.email}: ${response.status()} ${await response.text()}`,
    );
  }
}
