// spec: identity-and-authorization/sign-in-handoff,
//       identity-and-authorization/google-sign-in,
//       identity-and-authorization/anonymous-reach
// The browser's way in: the two addresses a browser *navigates* to rather than
// calls.
//
// design: the second shape of "Where sign-in happens" — a client that redeems
// for itself, leaving the Server holding nothing of the human's.
import { components } from "./_generated/api";
import { createAuth } from "./auth";
import { type HandoffMinter, mintHandoff } from "./issuance";
import { publicHttpAction } from "./publicFunctions";

/** Where Better Auth is told to send the browser once Google has answered. */
const RETURN_PATH = "/sign-in/return";

/**
 * Begin a sign-in that will return the browser to a registered Server.
 *
 * `GET /sign-in?issuer&return&challenge` — the address a Server links a
 * signed-out human to.
 *
 * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
 * spec: identity-and-authorization/google-sign-in#session-survives-reload
 * spec: identity-and-authorization/anonymous-reach#sign-in-entry-exposes-no-principal
 */
export const begin = publicHttpAction(
  { capability: "begin-sign-in" },
  {
    handler: async (ctx, request) => {
      const asked = new URL(request.url).searchParams;
      const issuerId = asked.get("issuer");
      const returnAddress = asked.get("return");
      const challenge = asked.get("challenge");
      if (!issuerId || !returnAddress || !challenge) {
        return refusal(400, "sign-in needs an issuer, a return address, and a challenge");
      }

      const caller = ctx.caller;
      if (caller?.kind === "human") {
        return await completed(ctx, {
          userId: caller.userId,
          issuerId,
          returnAddress,
          challenge,
        });
      }

      // `mintHandoff` checks both of these again on the way back. Both ends
      // check deliberately, not by oversight.
      const registration = await registrationFor(ctx, issuerId);
      if (!registration) return refusal(403, `no registration for issuer ${issuerId}`);
      if (!registration.returnAddresses.includes(returnAddress)) {
        return refusal(403, `${returnAddress} is not a return address this issuer registered`);
      }

      const returnUrl = new URL(RETURN_PATH, process.env["CONVEX_SITE_URL"] ?? "");
      returnUrl.searchParams.set("issuer", issuerId);
      returnUrl.searchParams.set("return", returnAddress);
      returnUrl.searchParams.set("challenge", challenge);

      // Better Auth's social sign-in is a JSON POST that answers 200 with the
      // provider URL in its body, so it is called in process and the redirect
      // is ours. `returnHeaders` carries the signed `state` cookie it sets;
      // dropping it fails the return leg inside Better Auth as a state
      // mismatch rather than anywhere legible.
      const { headers, response } = await createAuth(ctx).api.signInSocial({
        body: { provider: "google", callbackURL: returnUrl.toString(), disableRedirect: true },
        // The headers, not the request: passing a request makes better-call
        // answer with a `Response` instead of the pair destructured above.
        headers: request.headers,
        returnHeaders: true,
      });
      const providerUrl = response.url;
      if (!providerUrl) return refusal(502, "the provider offered no address to send the browser");
      return redirect(providerUrl, headers);
    },
  },
);

/**
 * Receive the browser back from Google and hand it on to the Server.
 *
 * `GET /sign-in/return?issuer&return&challenge`. Better Auth's own callback has
 * by now completed the code exchange, set the session cookie for this origin,
 * and redirected here — same origin, top-level, so the cookie rides.
 *
 * spec: identity-and-authorization/sign-in-handoff
 * spec: identity-and-authorization/sign-in-handoff#server-never-holds-the-provider-exchange
 */
export const complete = publicHttpAction(
  { capability: "begin-sign-in-handoff" },
  {
    handler: async (ctx, request) => {
      const asked = new URL(request.url).searchParams;
      const issuerId = asked.get("issuer");
      const returnAddress = asked.get("return");
      const challenge = asked.get("challenge");
      if (!issuerId || !returnAddress || !challenge) {
        return refusal(400, "the return leg lost its issuer, return address, or challenge");
      }
      const caller = ctx.caller;
      if (caller?.kind !== "human") return refusal(401, "a handoff names one authenticated human");

      return await completed(ctx, { userId: caller.userId, issuerId, returnAddress, challenge });
    },
  },
);

/**
 * Mint the handoff and send the browser home, shared by the two ways of getting
 * here: a return from Google, and an entry that found a session already live.
 *
 * Only the minting step is shared. What the two routes do when there is *no*
 * session is what distinguishes them, so a single function spanning both would
 * join two different failure modes under one name.
 */
async function completed(
  ctx: HandoffMinter,
  args: { userId: string; issuerId: string; returnAddress: string; challenge: string },
): Promise<Response> {
  try {
    return redirect(await mintHandoff(ctx, args));
  } catch (refused) {
    // `mintHandoff` refuses an unregistered issuer or address — the caller's
    // fault rather than this deployment's.
    return refusal(403, refused instanceof Error ? refused.message : "refused");
  }
}

/** One registered issuer, or `null`. Typed at the call site the same way `issuance.ts` types it. */
async function registrationFor(
  ctx: HandoffMinter,
  issuerId: string,
): Promise<{ returnAddresses: ReadonlyArray<string> } | null> {
  return await ctx.runQuery(components.snekPlatform.functions.issuer, { issuerId });
}

/**
 * A 302, carrying whatever cookies the call that produced it set.
 *
 * `getSetCookie` rather than `get("set-cookie")`: the latter folds several
 * cookies into one comma-joined string that no browser parses back apart, and
 * this leg can carry more than one.
 */
function redirect(location: string, from?: Headers): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const cookie of from?.getSetCookie() ?? []) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

/** A refusal a human might actually read, since these addresses are reached by a browser. */
const refusal = (status: number, why: string): Response =>
  new Response(why, { status, headers: { "Cache-Control": "no-store" } });
