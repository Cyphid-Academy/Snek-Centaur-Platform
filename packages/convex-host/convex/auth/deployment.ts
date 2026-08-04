// spec: identity-and-authorization/verification-without-shared-secrets,
//       identity-and-authorization/audience-bound-tokens,
//       identity-and-authorization/identity-kinds
// Who this deployment is when it signs, and how it names the party it signs
// for.
//
// The signing key arrives as a deployment environment variable and is read
// nowhere else — `global-invariants/credential-confinement#signing-keys-never-leave-convex`.
// The published material is derived from that same variable, so the two cannot
// drift and a rotation is one variable.
import { type JWK, importJWK } from "jose";
import type { PublishedMaterial } from "./credential";

const ALG = "ES256";

/**
 * The name the published key set gives this deployment's one signing key.
 *
 * A `kid` is not optional in practice, whatever the JWK specification says: a
 * SpacetimeDB instance discards an entire key set whose entry carries none
 * (`KeyError(MissingKeyId)`), so a document without one is a document no game
 * instance can validate against.
 *
 * Constant rather than derived, because a `kid` disambiguates among keys
 * published *together* and this platform never publishes two. The name
 * identifies the role, which does not change, rather than the key material,
 * which may.
 */
const KEY_ID = "platform";

/**
 * The audience of every credential *this deployment mints* for its own function
 * surface.
 *
 * A constant rather than the deployment URL, and the reasoning does **not**
 * carry to assertions (see `assertionAudience` below). A credential minted here
 * is verified against `publishedMaterial()` — this deployment's own `iss` and
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

const signingJwk = (): JWK => JSON.parse(process.env["CREDENTIAL_SIGNING_JWK"] ?? "{}") as JWK;

export const signingKey = async (): Promise<CryptoKey> =>
  (await importJWK(signingJwk(), ALG)) as CryptoKey;

/**
 * Every field of a JWK that is safe to publish, across the key kinds a JWK can
 * be — `kty` and `crv` naming it, `x`/`y` for an elliptic curve key, `n`/`e`
 * for RSA.
 *
 * **An allow-list, because the deny-list version of this is a trap.** Deriving
 * the public document by dropping `d` is correct for P-256, where `d` is the
 * whole private component, and catastrophic for RSA, where `p`, `q`, `dp`, `dq`
 * and `qi` remain — the signing key served at a well-known address under other
 * names. Since RS256 is the other algorithm a game instance accepts, and
 * therefore the obvious thing to reach for if this one ever has to change, the
 * failure is one edit away at all times. Naming what may go out rather than
 * what may not means a key kind this list has never heard of publishes too
 * little rather than too much.
 */
const PUBLIC_JWK_FIELDS = ["kty", "crv", "x", "y", "n", "e"] as const;

/**
 * What anyone validating this platform's credentials needs, and all they need.
 * Derived here rather than at the publication site so that no caller can serve
 * the wrong half by omission.
 *
 * `alg` and `kid` are stated here rather than taken from the signing variable,
 * so that a key provisioned without either still publishes a document a game
 * instance can use.
 *
 * spec: identity-and-authorization/verification-without-shared-secrets#same-material-platform-wide
 * spec: global-invariants/credential-confinement#signing-keys-never-leave-convex
 */
export function publishedMaterial(): PublishedMaterial {
  const signing = signingJwk();
  const publicJwk: JWK = { alg: ALG, kid: KEY_ID };
  for (const field of PUBLIC_JWK_FIELDS) {
    if (signing[field] !== undefined) publicJwk[field] = signing[field];
  }
  return { issuer: issuer(), publicJwk };
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
