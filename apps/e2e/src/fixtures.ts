// spec: global-invariants/runtime-ownership
// What a spec imports: `test`, `expect`, and one fixture per runtime.
//
// Every runtime is a **worker** fixture, so a stack is stood up once for the
// worker rather than once per test, and **lazy**, because Playwright only
// builds a fixture a test actually asks for. A spec that names `convex` and
// nothing else pays for Convex and for the run directory it needs, and never
// starts a SpacetimeDB host or a Vite server. Teardown is Playwright's, in
// reverse order of setup, on a pass, a failure and an interrupt alike.
//
// Ordering falls out of the dependencies rather than being written down: the
// Centaur Server is told where Convex is, so Convex is built first and torn
// down last. Nothing is told about anything it does not address.
//
// The browser is *not* here. `browser`, `context` and `page` are Playwright's
// own fixtures, and a context is already an isolated cookie jar and storage
// partition per test — which is what a wrapper around them would have been for.
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test as base } from "@playwright/test";
import { type IdentityProvider, startIdentityProvider } from "./identity";
import { freePort, freePortPair } from "./process";
import { type CentaurServer, startCentaurServer } from "./runtimes/centaur-server";
import { type ConvexDeployment, startConvex } from "./runtimes/convex";
import { type SpacetimeHost, startSpacetime } from "./runtimes/spacetimedb";

export interface Runtimes {
  /** This worker's scratch directory. Removed when the worker finishes. */
  runDir: string;
  spacetime: SpacetimeHost;
  convex: ConvexDeployment;
  centaurServer: CentaurServer;
  /** Who a scenario signs in as. See `identity.ts`. */
  identityProvider: IdentityProvider;
}

/**
 * The OAuth client the deployment is configured with, and so the audience the
 * substitute provider's assertions name. Fixed rather than random: it is not a
 * secret, and a stable value makes a mismatch legible in a refusal.
 */
const OAUTH_CLIENT_ID = "snek-e2e.apps.googleusercontent.test";

export const test = base.extend<Record<never, never>, Runtimes>({
  runDir: [
    // Playwright reads the destructuring pattern to discover what a fixture
    // depends on, and rejects a named parameter at load. This one depends on
    // nothing, so `{}` is the only spelling available.
    // biome-ignore lint/correctness/noEmptyPattern: see above
    async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), "snek-e2e-"));
      await use(dir);
      rmSync(dir, { recursive: true, force: true });
    },
    { scope: "worker" },
  ],

  spacetime: [
    async ({ runDir }, use) => {
      // Each runtime's directory is created before it is started: a process
      // handed a working directory that does not exist fails with an ENOENT
      // naming the executable, which reads as "the binary is missing" and sends
      // the reader looking in entirely the wrong place.
      const dataDir = join(runDir, "spacetime");
      mkdirSync(dataDir, { recursive: true });
      const host = await startSpacetime({ port: await freePort(), dataDir });
      await use(host);
      await host.stop();
    },
    { scope: "worker" },
  ],

  identityProvider: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads the pattern
    async ({}, use) => {
      const provider = await startIdentityProvider(OAUTH_CLIENT_ID);
      await use(provider);
      await provider.stop();
    },
    { scope: "worker" },
  ],

  convex: [
    async ({ runDir, identityProvider }, use) => {
      const [port, siteProxyPort] = await freePortPair();
      const dataDir = join(runDir, "convex");
      mkdirSync(dataDir, { recursive: true });
      const deployment = await startConvex({ port, siteProxyPort, dataDir });
      // Everything the deployment needs of its environment, in one place. Two
      // kinds of thing are here and the difference matters:
      //
      //   * addresses of what this worker started — the substitute identity
      //     provider, and the deployment's own site origin;
      //   * credentials the deployment would otherwise have from an operator,
      //     generated per run and thrown away with it. Nothing is read from a
      //     developer's environment, so a run holds no secret of anyone's and
      //     cannot pass because of one.
      // No signing key is among them: the deployment generates its own on
      // first use and holds it in its own store, encrypted under the secret
      // below — so nothing outside the deployment ever holds it.
      // spec: identity-and-authorization/substituted-provider-verification
      await deployment.setEnv({
        SITE_URL: deployment.siteUrl,
        BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
        GOOGLE_CLIENT_ID: identityProvider.audience,
        GOOGLE_CLIENT_SECRET: randomBytes(16).toString("hex"),
        SUBSTITUTE_IDENTITY_ISSUER: identityProvider.issuer,
        SUBSTITUTE_IDENTITY_JWKS_URL: identityProvider.jwksUrl,
      });
      await use(deployment);
      await deployment.stop();
    },
    { scope: "worker" },
  ],

  centaurServer: [
    async ({ convex }, use) => {
      const server = await startCentaurServer({
        port: await freePort(),
        env: { CONVEX_URL: convex.url, CONVEX_SITE_URL: convex.siteUrl },
      });
      await use(server);
      await server.stop();
    },
    { scope: "worker" },
  ],
});

export { expect } from "@playwright/test";
