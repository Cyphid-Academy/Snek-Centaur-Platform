// spec: identity-and-authorization/google-sign-in,
//       identity-and-authorization/linked-provider-credentials,
//       identity-and-authorization/client-credential-custody,
//       identity-and-authorization/sole-credential-issuer
// Human sign-in. Better Auth supplies the Google OAuth exchange, the session
// cookie that survives a reload, and (through its embedded `jwt` plugin) the
// deployment's key store — and mints nothing of ours; see `auth/deployment.ts`.
// Google talks to this deployment's origin and only ever this one, never a
// Server's — the whole argument is design.md's "Where sign-in happens". The
// component mounts in npm mode, a departure design.md also records.

import { type GenericCtx, createClient } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

export const authComponent = createClient<DataModel>(components.betterAuth);

/**
 * The Better Auth instance behind this deployment's `/api/auth` routes.
 *
 * Its `account` rows ARE the linkage records `linked-provider-credentials`
 * describes: one per (provider, provider subject), created with the user record
 * at first sign-in, and the only thing authentication resolves a session
 * through. Nothing in this module — and no function anywhere in `convex/` —
 * affords repointing, replacing, or detaching one, which is the whole of what
 * that requirement asks for beyond the defaults taken below.
 */
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  const siteUrl = process.env["SITE_URL"];
  const deploymentOrigin = process.env["CONVEX_SITE_URL"];
  return betterAuth({
    // The platform's own origin: sign-in completes here, and the session cookie
    // is issued for here. It is the one credential a reload recovers
    // (`#the-session-is-the-only-thing-a-reload-recovers`); every other
    // credential the page needs is obtained afresh under it.
    //
    // Omitted rather than passed as `undefined` when unset: Better Auth's option
    // is optional, and an absent `baseURL` is the documented "derive it from the
    // request" case, while a present-but-undefined one is a value it would have
    // to defend against. Every Convex deployment sets `CONVEX_SITE_URL`, so the
    // absent branch is a type-level honesty, not a mode this runs in.
    ...(deploymentOrigin === undefined ? {} : { baseURL: deploymentOrigin }),
    // Listed only when there is one to list. An empty string here is not an
    // empty allow-list: Better Auth compares a non-http(s) callback with
    // `url.startsWith(pattern)`, and every string starts with `""` — so a
    // deployment nobody had configured would trust `myapp://anywhere`, which is
    // the one direction this codebase's own doctrine says absent configuration
    // must never fail in.
    trustedOrigins: siteUrl ? [siteUrl] : [],
    // **Two cookie attributes stated rather than inherited, because the design
    // rests on them.** `httpOnly` is what `client-credential-custody` asks for
    // directly — no page script can read the session. `sameSite: "lax"` is
    // load-bearing for the whole redirect design: the sign-in entry route is
    // reached by a *top-level cross-origin navigation* from a Server's page, and
    // the browser sends this cookie on one only under `lax`. Under `strict` the
    // already-signed-in branch silently stops working — the browser arrives
    // looking anonymous — and under `none` the cookie rides every cross-site
    // request there is. Both happen to be Better Auth's defaults today, which is
    // exactly why they are written down: a default that changes takes a security
    // property or a whole route with it, and neither failure announces itself.
    //
    // `secure` is deliberately *not* pinned. Better Auth derives it from the
    // deployment's own scheme, so it is on wherever it can be and off on the
    // loopback http origins the end-to-end harness runs against — where forcing
    // it would mean no browser stored the cookie at all.
    //
    // spec: identity-and-authorization/client-credential-custody
    // spec: identity-and-authorization/google-sign-in#session-survives-reload
    advanced: { defaultCookieAttributes: { httpOnly: true, sameSite: "lax" } },
    database: authComponent.adapter(ctx),
    // Google, specifically. `google-sign-in#google-account-specifically` makes
    // the binding deliberate: adding a second provider here is a revision of
    // that requirement, not a configuration change. No email/password provider
    // is enabled, which is what leaves the platform holding no secret capable
    // of authenticating a human (`#no-human-shared-secrets`).
    socialProviders: {
      google: {
        clientId: process.env["GOOGLE_CLIENT_ID"] ?? "",
        clientSecret: process.env["GOOGLE_CLIENT_SECRET"] ?? "",
        ...substitutedVerification(process.env["GOOGLE_CLIENT_ID"] ?? ""),
      },
    },
    // Off explicitly rather than by default, because the default is the thing
    // most likely to move underneath us and the failure is silent: linking on a
    // matching email claim is a known account-takeover route, and whom an
    // account belongs to is settled by Google's immutable subject alone
    // (`linked-provider-credentials#no-auto-linking-by-email`).
    account: { accountLinking: { enabled: false } },
    // `convex()` embeds Better Auth's `jwt` plugin: one key store, one
    // algorithm (RS256, fixed by the `customJwt` provider in `auth.config.ts`),
    // serving `/api/auth/convex/jwks`. That same store signs every credential
    // the platform mints — `auth/deployment.ts` is where that arrangement, and
    // why the plugin's own session-bound minting is not used, are recorded.
    plugins: [convex({ authConfig })],
  });
};

/** What Google signs its identity assertions with, and so the only thing accepted here. */
const ALG = "RS256";

/**
 * Where the end-to-end harness substitutes the one step it cannot perform —
 * the provider's own verification — and nothing else; what that means and why
 * absence must be production behaviour is the cited requirement's own text.
 * The cost is bounded to two environment variables naming a substitute issuer
 * and its key set; with neither set this spreads nothing into the provider's
 * options, so there is no branch to switch off.
 *
 * spec: identity-and-authorization/substituted-provider-verification
 * spec: identity-and-authorization/substituted-provider-verification#absence-of-configuration-is-production-behaviour
 * spec: identity-and-authorization/substituted-provider-verification#only-the-verification-step-is-substituted
 */
export function substitutedVerification(clientId: string): {
  verifyIdToken?: (token: string) => Promise<boolean>;
} {
  const issuer = process.env["SUBSTITUTE_IDENTITY_ISSUER"];
  const jwksUrl = process.env["SUBSTITUTE_IDENTITY_JWKS_URL"];
  if (!issuer || !jwksUrl) return {};
  // Fetched from the substitute over the wire, exactly as the material behind a
  // real provider is: the path exercised under test is the path that runs.
  const keys = createRemoteJWKSet(new URL(jwksUrl));
  return {
    verifyIdToken: async (token: string): Promise<boolean> => {
      // Audience is the client this deployment is configured with, so an
      // assertion minted for another deployment's client is inert here — the
      // same binding the production path checks.
      try {
        // The algorithm is pinned, as the production credential verifier pins
        // its own: what a key set says a key may be used for is not a decision
        // this deployment should be delegating.
        await jwtVerify(token, keys, { issuer, audience: clientId, algorithms: [ALG] });
        return true;
      } catch {
        return false;
      }
    },
  };
}
