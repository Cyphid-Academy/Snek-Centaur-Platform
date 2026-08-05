import { serverKeys } from "$lib/server/serverKeys";
import {
  claimsOf,
  holdPlatformCredential,
  platformClient,
  platformCredentialClaims,
  serverIdentity,
} from "$lib/server/serverPrincipal";
import { signAssertion } from "@cyphid/snek-centaur-server-lib";
// spec: identity-and-authorization/service-principal-assertions
// The console's service-principal surface: this server proving who it is.
//
// GET answers the identity this server presents — its domain, the one
// issuance endpoint its assertions name, its published keys — and the claims
// of the platform credential it currently holds, if any. POST signs a fresh
// assertion and exchanges it for a platform credential carrying the requested
// capabilities; a refusal (unregistered issuer, a request beyond the
// registered ceiling) comes back as the platform's own message. The raw
// credential stays in this process — the page sees decoded claims alone.
// spec: identity-and-authorization/trusted-issuer-registry#excess-fails-loudly
import { api } from "@cyphid/snek-convex-host/api";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url }) => {
  const identity = await serverIdentity(url.origin);
  const { publishedKeySet } = await serverKeys();
  return json({
    domain: identity.domain,
    issuanceEndpoint: identity.issuanceEndpoint,
    publishedKeySet,
    held: platformCredentialClaims(),
  });
};

export const POST: RequestHandler = async ({ url, request }) => {
  const { capabilities } = (await request.json()) as { capabilities: string[] };
  const identity = await serverIdentity(url.origin);
  try {
    const credential: string = await platformClient().action(api.issuance.exchangeAssertion, {
      assertion: await signAssertion(identity),
      capabilities,
    });
    holdPlatformCredential(credential);
    return json({ ok: true, claims: claimsOf(credential) });
  } catch (refused) {
    return json({ ok: false, refused: refused instanceof Error ? refused.message : "refused" });
  }
};
