// Better Auth, local install: human sign-in, sessions, working-JWT minting,
// and the deployment's signing material. The library supplies key
// management, signing, publication of verification material, and human
// authentication; everything beyond that — the issuer registry, the
// assertion exchange, the capability registry, kind gating — is this
// package's own application code (see lib/ and http.ts). Policy must not
// migrate into the auth layer.
// design: openspec/changes/migrate-identity-and-authorization/design.md
//        ("Implementation substrate, and the boundary policy must not cross")
import { type GenericCtx, createClient } from "@convex-dev/better-auth";
import type { ComponentApi } from "@convex-dev/better-auth/_generated/component.js";
import { convex } from "@convex-dev/better-auth/plugins";
import { CAPABILITIES_CLAIM, platformAudience } from "@cyphid/snek-platform-auth";
import { type BetterAuthOptions, betterAuth } from "better-auth/minimal";
import { components } from "./_generated/api.js";
import type { DataModel } from "./_generated/dataModel.js";
import authConfig from "./auth.config.js";
import authSchema from "./betterAuth/schema.js";
import { humanCapabilityEntries } from "./lib/grants.js";
import { sessionLifetimeSeconds } from "./lib/sessionLifetime.js";

/**
 * Every self-contained credential the platform issues expires fifteen
 * minutes after issuance — asserted here explicitly rather than relying on
 * the library default staying 15 minutes.
 * spec: identity-and-authorization/token-lifetime-and-refresh#only-the-stateful-session-outlives-the-bound
 */
export const WORKING_CREDENTIAL_LIFETIME_SECONDS = 15 * 60;

// Local-install mode: the component schema lives in convex/betterAuth/.
// The cast is needed because offline codegen produces the untyped
// AnyComponents stub; with a real deployment codegen this is fully typed.
const { betterAuth: betterAuthComponent } = components as unknown as {
  betterAuth: ComponentApi;
};
export const authComponent = createClient<DataModel, typeof authSchema>(betterAuthComponent, {
  local: { schema: authSchema },
});

export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  const { SITE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
  return {
    baseURL: SITE_URL ?? "http://localhost:3000",
    secret: BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    // Humans sign in exclusively with a Google account: the ONLY human
    // authentication path configured is the Google social provider. The
    // binding to Google specifically is DELIBERATE requirement text —
    // supporting any other provider means revising the requirement, never
    // provider-neutral drift — so no second provider may be added here
    // without that revision.
    // spec: identity-and-authorization/google-sign-in#google-account-specifically
    //
    // No `emailAndPassword` block, deliberately: the platform maintains no
    // independent credential store for humans, and its stored state holds
    // no password, password hash, or other secret capable of
    // authenticating a human directly.
    // spec: identity-and-authorization/google-sign-in#no-human-shared-secrets
    //
    // The Google client secret is a PERMITTED third-party secret: it
    // authenticates this deployment to Google's protocol, not any human to
    // the platform.
    // spec: global-invariants/no-shared-secrets#third-party-protocols-may-require-a-secret
    socialProviders: {
      google: {
        clientId: GOOGLE_CLIENT_ID ?? "",
        clientSecret: GOOGLE_CLIENT_SECRET ?? "",
      },
    },
    // Account linking is left OFF — Better Auth's default — deliberately:
    // an account is keyed on the provider's immutable subject, and nothing
    // is ever linked by matching email claims (unverified-email
    // auto-linking is a known account-takeover route). Whom an account
    // belongs to is settled once, at first sign-in, by the subject alone.
    // spec: identity-and-authorization/linked-provider-credentials#no-auto-linking-by-email
    // design: openspec/changes/migrate-identity-and-authorization/design.md
    //        ("What this asks of the substrate is Better Auth's default
    //         behaviour, and that is deliberate.")
    session: {
      // Deployment-configured, floored at four hours in code:
      // sessionLifetimeSeconds() THROWS on a lifetime below the floor, so
      // constructing the auth instance against a bad configuration fails
      // loudly rather than shipping a session that lapses mid-sitting.
      // spec: identity-and-authorization/google-sign-in#session-lifetime-is-configured-above-a-floor
      expiresIn: sessionLifetimeSeconds(),
    },
    user: {
      // The platform admin role: a platform-level designation ON THE USER
      // RECORD — never per-team, never per-server. `input: false` keeps it
      // out of every client-writable surface; designation is an
      // operational act against the record itself. Because Convex queries
      // are reactive subscriptions, any read answered from this field
      // re-renders the moment the designation changes — no reload and no
      // fresh session is needed for admin affordances to appear or
      // disappear.
      // spec: identity-and-authorization/platform-admin-role#role-effective-without-reload
      additionalFields: {
        isAdmin: {
          type: "boolean",
          defaultValue: false,
          input: false,
        },
      },
    },
    plugins: [
      // The convex plugin bundles jwt + oidc discovery + bearer: working
      // JWTs, the JWKS route, and bearer session transport.
      convex({
        authConfig,
        jwt: {
          // 15 minutes — the library's own default, pinned so a config
          // drift upstream cannot silently lengthen the bound.
          // spec: identity-and-authorization/token-lifetime-and-refresh
          expirationSeconds: WORKING_CREDENTIAL_LIFETIME_SECONDS,
          // Every credential the platform issues carries its capabilities
          // as a STRUCTURED claim, minted here for human working JWTs from
          // the user record's current admin designation.
          // spec: identity-and-authorization/capability-claim-structure
          definePayload: ({ user }) => ({
            [CAPABILITIES_CLAIM]: humanCapabilityEntries(
              (user as { isAdmin?: unknown }).isAdmin === true,
            ),
          }),
        },
      }),
    ],
  } satisfies BetterAuthOptions;
};

export const createAuth = (ctx: GenericCtx<DataModel>) => betterAuth(createAuthOptions(ctx));

/** The audience a game credential names: the platform's own functions. */
export const PLATFORM_AUDIENCE = platformAudience();
