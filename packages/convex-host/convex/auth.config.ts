// The Convex deployment's auth configuration: which token issuers this
// deployment's function transport accepts. Both entries name the SAME
// issuer — this deployment's own Better Auth install — because the platform
// is the sole issuer of every credential its runtimes accept as authority.
// spec: identity-and-authorization/sole-credential-issuer
import { platformAudience } from "@cyphid/snek-platform-auth";
import type { AuthConfig } from "convex/server";

const { CONVEX_SITE_URL } = process.env;

export default {
  providers: [
    // Human working JWTs minted by the Better Auth convex plugin
    // (aud "convex" is the plugin's fixed audience for them).
    {
      applicationID: "convex",
      domain: CONVEX_SITE_URL ?? "http://127.0.0.1:3211",
    },
    // Service credentials this deployment mints itself (per-team game
    // credentials): same issuer and signing material, audience bound to
    // the platform's own functions.
    // spec: identity-and-authorization/audience-bound-tokens
    {
      applicationID: platformAudience(),
      domain: CONVEX_SITE_URL ?? "http://127.0.0.1:3211",
    },
  ],
} satisfies AuthConfig;
