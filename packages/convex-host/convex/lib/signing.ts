// Minting platform-signed credentials INSIDE the deployment.
//
// HOW TOKENS ARE SIGNED: every credential the platform issues — human
// working JWTs, per-team game credentials, game access tokens — is signed
// with the ONE key pair Better Auth manages in the local-install
// component's `jwks` table (Ed25519 / EdDSA, private key stored encrypted
// under the deployment secret). Human working JWTs are signed by the
// Better Auth convex plugin itself; the game credentials and game access
// tokens this module mints go through Better Auth's exported `signJWT`
// against the same storage, so the private key is decrypted and used only
// inside a Convex action and NEVER leaves the deployment.
// spec: global-invariants/credential-confinement ("signing keys never
//   leave Convex")
// spec: identity-and-authorization/verification-without-shared-secrets —
//   one platform-wide published JWKS covers every credential; no new
//   verification arrangement per credential type. Containment comes from
//   audience binding, not from separated signing material.
// design: openspec/changes/migrate-identity-and-authorization/design.md
//        ("Audience binding rather than separated signing material")
import { signJWT } from "better-auth/plugins/jwt";
import type { GenericActionCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel.js";
import { WORKING_CREDENTIAL_LIFETIME_SECONDS, createAuth } from "../auth.js";

type ActionCtx = GenericActionCtx<DataModel>;

/**
 * The jwks adapter overrides Better Auth's convex integration uses: the
 * component adapter stores `createdAt` as a number, while the jwt plugin
 * expects Dates. Mirrored from @convex-dev/better-auth's own plugin so a
 * directly-invoked signJWT reads and creates keys identically.
 */
const jwksAdapterOverrides = {
  // biome-ignore lint/suspicious/noExplicitAny: better-auth's endpoint ctx type is not exported.
  getJwks: async (ctx: any) => {
    const keys = await ctx.context.adapter.findMany({
      model: "jwks",
      sortBy: { field: "createdAt", direction: "desc" },
    });
    // biome-ignore lint/suspicious/noExplicitAny: raw jwks rows.
    return keys.map((key: any) => ({
      ...key,
      createdAt: new Date(key.createdAt),
      ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt) } : {}),
    }));
  },
  // biome-ignore lint/suspicious/noExplicitAny: better-auth's endpoint ctx type is not exported.
  createJwk: async (webKey: any, ctx: any) => {
    return await ctx.context.adapter.create({
      model: "jwks",
      data: { ...webKey, createdAt: new Date() },
    });
  },
};

/**
 * Sign a self-contained platform credential: EdDSA over the Better Auth
 * key, issuer = this deployment, expiry FIFTEEN MINUTES after issuance —
 * the bound every self-contained credential dies within; only the
 * stateful session outlives it.
 * spec: identity-and-authorization/token-lifetime-and-refresh#only-the-stateful-session-outlives-the-bound
 *
 * The caller supplies subject, audience, and any structured claims;
 * nothing here can lengthen the lifetime.
 */
export async function mintPlatformCredential(
  ctx: ActionCtx,
  fields: {
    readonly subject: string;
    /** The exact resource this credential may be used at — checked first by every resource. */
    // spec: identity-and-authorization/audience-bound-tokens
    readonly audience: string;
    readonly claims: Record<string, unknown>;
  },
): Promise<{ readonly credential: string; readonly expiresAtMs: number }> {
  const auth = createAuth(ctx);
  const authContext = await auth.$context;
  const { CONVEX_SITE_URL } = process.env;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + WORKING_CREDENTIAL_LIFETIME_SECONDS;
  const credential = await signJWT(
    // signJWT reads only ctx.context (adapter, secret) from the endpoint
    // ctx shape, which is exactly the resolved auth context.
    // biome-ignore lint/suspicious/noExplicitAny: better-auth's endpoint ctx type is not exported.
    { context: authContext } as any,
    {
      options: {
        jwt: {
          issuer: CONVEX_SITE_URL ?? "http://127.0.0.1:3211",
          audience: fields.audience,
        },
        jwks: { keyPairConfig: { alg: "EdDSA" } },
        adapter: jwksAdapterOverrides,
        // biome-ignore lint/suspicious/noExplicitAny: jwt plugin options type is structurally satisfied.
      } as any,
      payload: {
        ...fields.claims,
        sub: fields.subject,
        aud: fields.audience,
        iat: nowSeconds,
        exp,
      },
    },
  );
  return { credential, expiresAtMs: exp * 1000 };
}
