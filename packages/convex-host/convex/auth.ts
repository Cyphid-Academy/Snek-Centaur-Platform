// spec: identity-and-authorization/google-sign-in,
//       identity-and-authorization/linked-provider-credentials,
//       identity-and-authorization/client-credential-custody,
//       identity-and-authorization/sole-credential-issuer
// Human sign-in. Better Auth supplies exactly two things here — the Google
// OAuth exchange and the session cookie that survives a reload — and nothing
// else. Every credential the platform *issues* is minted by our own code in
// `auth/credential.ts`, because Better Auth's token endpoint is bound to the
// caller's own session and hardcodes its audience, which cannot express a token
// whose subject is a Centaur Team and whose audience is one game instance.
//
// The component is mounted in npm mode rather than installed locally: its
// tables live in their own component either way, so a local install would buy
// only the ability to edit a generated schema we have no reason to edit.
//
// **Where sign-in happens.** Google talks to this deployment's origin and only
// ever this one. A single OAuth client is registered to Cyphid, its redirect
// URIs naming platform *environments* — never a team, never a developer. The
// human-facing application is the artifact every team forks and runs on an
// origin it controls, so wiring Google into a Server is the obvious
// implementation and the forbidden one: it would hand a student-modified fork
// the authorization code of everyone who signs in through it. A Server that
// needs a human's identity gets it through `sign-in-handoff`, never by holding
// a client of its own (`sole-credential-issuer`).

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
    // is issued for here. Better Auth's cookie defaults are what
    // `client-credential-custody` requires — httpOnly, so no page script can
    // read it; secure and same-site, so it travels only to this deployment over
    // HTTPS — and it is the one credential a reload recovers
    // (`#the-session-is-the-only-thing-a-reload-recovers`). Every other
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
    plugins: [convex({ authConfig })],
  });
};

/** What Google signs its identity assertions with, and so the only thing accepted here. */
const ALG = "RS256";

/**
 * Where the end-to-end harness substitutes the one step it cannot perform, and
 * nothing else.
 *
 * A test machine has no route to Google and no human to click through a consent
 * screen, so an identity assertion has to come from somewhere the harness
 * controls. What that costs is bounded here: two environment variables name a
 * substitute issuer and where it publishes its keys, and finding them the
 * provider verifies an assertion against those instead of Google's. Everything
 * after verification — which account this resolves to, the linking policy above,
 * issuing the session, setting the cookie — is untouched, because a session the
 * harness assembled by hand would prove nothing about signing in.
 *
 * **Absence is production behaviour.** With neither variable set this spreads
 * nothing into the provider's options, so the provider verifies against Google
 * exactly as it always did and a harness-signed assertion is refused like any
 * other unverifiable one. That direction is the requirement: a deployment
 * nobody configured is a deployment that is safe, rather than one an operator
 * must remember to switch something off on.
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
