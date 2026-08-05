// spec: identity-and-authorization/verification-without-shared-secrets,
//       identity-and-authorization/audience-bound-tokens,
//       identity-and-authorization/identity-kinds
// Who this deployment is when it signs, and how it names the party it signs
// for.
//
// Key custody is Better Auth's `jwt` plugin, not an environment variable: the
// signing key is generated inside the deployment on first use — never
// provisioned from outside, which is the direction
// `global-invariants/credential-confinement#every-party-keeps-its-own-key`
// asks for — held encrypted in the auth component's `jwks` table, and
// published from that same store, so signing and publication cannot drift.
// What is deliberately NOT the plugin's is minting: its token endpoint is
// bound to the caller's own session and hardcodes its audience, so it cannot
// express a token whose subject is a Centaur Team and whose audience is one
// game instance. `auth/credential.ts` assembles the claims; the signer below
// carries them to the plugin's stored key.
import type { GenericCtx } from "@convex-dev/better-auth";
import { type JwtOptions, signJWT } from "better-auth/plugins/jwt";
import { type JWK, createLocalJWKSet } from "jose";
import type { DataModel } from "../_generated/dataModel";
import { createAuth } from "../auth";
import { CREDENTIAL_ALG as ALG, type CredentialSigner } from "./credential";

/**
 * The audience of every credential *this deployment mints* for its own function
 * surface.
 *
 * A constant rather than the deployment URL, and the reasoning does **not**
 * carry to assertions (see `assertionAudience` below). A credential minted here
 * is verified against `deploymentKeys()` — this deployment's own `iss` and
 * its own signing key — so a credential from another deployment is refused on
 * issuer and key before its audience is ever compared. The audience is a second
 * fence behind a first one that already holds, and making it a constant means a
 * credential is not made inert by this environment being reached under another
 * name.
 *
 * spec: identity-and-authorization/audience-bound-tokens
 */
export const PLATFORM_AUDIENCE = "snek-platform";

/**
 * The issuer this deployment stamps on everything it signs.
 *
 * Absent configuration throws rather than answering the empty string, which is
 * the direction this file argues for twice elsewhere and used to break here.
 * An empty issuer is not a harmless placeholder: it is stamped on every
 * credential minted, compared against by every verifier, and — since
 * `assertionAudience()` is this value — it is the audience a Snek Centaur
 * Server's assertion must name, so an unconfigured deployment would accept an
 * assertion minted for *any* deployment that was also unconfigured. It also
 * reaches a game instance's pinned issuer, where an empty string matches
 * nothing and refuses every connection. Every Convex deployment sets this
 * variable; a process where it is missing is misconfigured, and saying so at
 * the first signature is cheaper than any of the above.
 *
 * spec: identity-and-authorization/verification-without-shared-secrets
 */
export const issuer = (): string => {
  const siteUrl = process.env["CONVEX_SITE_URL"];
  if (!siteUrl) throw new Error("CONVEX_SITE_URL is unset: this deployment cannot name itself");
  return siteUrl;
};

/**
 * The audience a Snek Centaur Server's assertion must name to be accepted here:
 * *this deployment*, by the identifier it publishes for itself.
 *
 * **Deployment-scoped, where `PLATFORM_AUDIENCE` is platform-wide, and the
 * difference is the whole security property.** An assertion is verified against
 * the *Server's* key, taken from the JWKS its registration records — and a
 * Server that operates on more than one deployment publishes the same key to
 * all of them. This library is published to forks, so more than one deployment
 * is the expected case, not an exotic one.
 *
 * With a platform-wide constant, every deployment would demand the same
 * audience, and so every deployment would accept an assertion minted for any
 * other. A fork that a Server authenticates to holds a valid, signed, unexpired
 * assertion, and could relay it here within its sixty-second life and obtain a
 * credential as that Server. Neither of the other two controls touches that:
 * the lifetime is irrelevant to a relay that completes in milliseconds, and the
 * single-use `jti` record is per-deployment, so a `jti` this deployment has
 * never seen reads as fresh. The audience is the only claim that can tell this
 * deployment's issuance path from a fork's, and it can only do so by naming
 * something a fork cannot also name.
 *
 * The value is `issuer()` — the deployment identifier already published at
 * `/.well-known/openid-configuration`, so a Server operator can discover the
 * audience to configure rather than being told it out of band, and there is no
 * second variable to hold in sync with the first. This is also what RFC 7523
 * prescribes for a JWT client assertion: an identifier for the authorization
 * server it is intended for.
 *
 * spec: identity-and-authorization/service-principal-assertions
 * spec: identity-and-authorization/audience-bound-tokens#wrong-audience-refused
 */
export const assertionAudience = (): string => issuer();

/**
 * The `jwt`-plugin options the credential signer runs under. They restate what
 * `@convex-dev/better-auth`'s `convex()` plugin configures its embedded `jwt`
 * instance with, because the two share one `jwks` table and that table is
 * single-algorithm: `alg` is not a stored column, so every reader patches it
 * in from configuration, and a second configuration would be a second answer.
 *
 * RS256, therefore, is not chosen here — it is fixed by the `customJwt`
 * provider in `auth.config.ts`, which `@convex-dev/better-auth` accepts with
 * RS256 alone. A game's SpacetimeDB instance accepts RS256 and ES256 and
 * refuses everything else, so the constraint from below and the constraint
 * from above happen to meet.
 *
 * The `adapter` override mirrors `@convex-dev/better-auth`'s own, comment and
 * all ("remove when date parsing for jwks adapter is fixed upstream"): rows
 * come back with numeric dates and the plugin sorts by `createdAt.getTime()`.
 */
const CREDENTIAL_KEYS: JwtOptions = {
  jwks: { keyPairConfig: { alg: ALG } },
  adapter: {
    getJwks: async (ctx) => {
      const keys = await ctx.context.adapter.findMany<{ createdAt: number; expiresAt?: number }>({
        model: "jwks",
        sortBy: { field: "createdAt", direction: "desc" },
      });
      return keys.map((key) => ({
        ...key,
        createdAt: new Date(key.createdAt),
        ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt) } : {}),
      })) as unknown as ReturnType<NonNullable<NonNullable<JwtOptions["adapter"]>["getJwks"]>>;
    },
  },
};

/**
 * Sign a credential payload with the deployment's stored key, generating one
 * inside the deployment on first use. The same store and the same algorithm
 * sign the session JWTs, so what is signed with is always what
 * `/api/auth/convex/jwks` — and the well-known address that proxies it —
 * publishes.
 *
 * spec: global-invariants/credential-confinement#signing-keys-never-leave-convex
 * spec: identity-and-authorization/verification-without-shared-secrets#same-material-platform-wide
 */
export async function deploymentSigner(ctx: GenericCtx<DataModel>): Promise<CredentialSigner> {
  const context = await createAuth(ctx).$context;
  // The cast narrows honestly: `signJWT` reads `ctx.context` alone — adapter,
  // secret, options — and never the endpoint half of the type it declares.
  return (payload) =>
    signJWT({ context } as unknown as Parameters<typeof signJWT>[0], {
      options: CREDENTIAL_KEYS,
      payload: { ...payload },
    });
}

/**
 * The deployment's published verification keys, as a jose key resolver — read
 * through the same endpoint that publishes them, so verification can never
 * disagree with publication.
 */
export async function deploymentKeys(
  ctx: GenericCtx<DataModel>,
): Promise<ReturnType<typeof createLocalJWKSet>> {
  const served = (await createAuth(ctx).api.getJwks()) as { keys: JWK[] };
  return createLocalJWKSet(served);
}

/**
 * A caller of this deployment, as the subject of the credential it presented.
 *
 * A game credential's scope lives here, in the subject: `capability-claim-structure`
 * fixes that no capability entry carries a constraint today, so a Centaur Team
 * principal is *unable* to name another team or another game
 * (`game-credential-scope#not-valid-for-another-team`, `#not-valid-for-another-game`)
 * rather than refused when it does.
 */
export type PlatformPrincipal =
  | { readonly kind: "human"; readonly userId: string }
  | { readonly kind: "external-system"; readonly issuerId: string }
  | { readonly kind: "centaur-team"; readonly teamId: string; readonly gameId: string };

/**
 * Render a principal as a credential's `sub`. Colon-delimited, like the game
 * token subjects of `subject.ts`: the tag makes the kind decidable from the
 * subject alone, so no reader has to consult a claim a later minting path could
 * forget to set.
 */
export function encodePrincipal(principal: PlatformPrincipal): string {
  if (principal.kind === "human") return `user:${principal.userId}`;
  if (principal.kind === "external-system") return `system:${principal.issuerId}`;
  return `team:${principal.teamId}:${principal.gameId}`;
}

/**
 * Read a subject back. Unlike `subject.ts` this direction is needed, because
 * these credentials come *back* to the platform: the subject is the only thing
 * enforcement learns about the caller. `null` for anything else.
 *
 * It takes `unknown` because this is the platform's own trust boundary, and a
 * parser at one has to be total over whatever arrives: JSON lets `sub` be a
 * number, so the type guard is the difference between a refusal and a crash
 * inside enforcement.
 *
 * **The tag, not an arity check, is what makes decoding invert encoding.** A
 * trusted issuer is identified by the domain it is operated from, and a domain
 * carrying a port has a colon in it, as does every origin-shaped id; an exact
 * three-way split refuses all of them, so `exchangeAssertion` mints a perfectly
 * good credential whose subject then decodes to `null` at every call that
 * presents it. So the tag is read first and decides how much of the rest is an
 * id: for the two single-id kinds the id is *everything* after the first colon,
 * so `user:a:b` decodes to the human `a:b` — a different human from `a` rather
 * than a substitution for them. Only `centaur-team` carries two ids and still
 * splits exactly, and it can: both are Convex ids this platform generated, so
 * neither contains a colon by construction.
 *
 * spec: identity-and-authorization/identity-kinds
 * spec: global-invariants/authenticated-unambiguous-identity
 */
export function decodePrincipal(sub: unknown): PlatformPrincipal | null {
  if (typeof sub !== "string") return null;
  const tagged = sub.indexOf(":");
  if (tagged < 0) return null;
  const tag = sub.slice(0, tagged);
  const rest = sub.slice(tagged + 1);
  if (rest === "") return null;
  if (tag === "user") return { kind: "human", userId: rest };
  if (tag === "system") return { kind: "external-system", issuerId: rest };
  if (tag === "team") {
    const [teamId, gameId, ...beyond] = rest.split(":");
    if (!teamId || !gameId || beyond.length > 0) return null;
    return { kind: "centaur-team", teamId, gameId };
  }
  return null;
}
