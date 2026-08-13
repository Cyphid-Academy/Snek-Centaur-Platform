// spec: identity-and-authorization/authentication-required#user-record-anchors-authorization
// Which issuer this deployment accepts human session tokens from: its own
// Better Auth component, and nothing else.
//
// Convex resolves `ctx.auth` against this list, so it is what makes a signed-in
// human visible to `publicFunctions.ts`'s `resolveCaller`. It holds no secret —
// only the well-known address the component publishes its verification material
// at (`verification-without-shared-secrets`) — and it is deliberately a list of
// one: every other credential the platform accepts is one the platform itself
// minted and verifies in `auth/credential.ts`, not one Convex resolves for us.

import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export default { providers: [getAuthConfigProvider()] } satisfies AuthConfig;
