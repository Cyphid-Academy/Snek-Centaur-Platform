// What the play page needs of the server it is served from.
//
// The two platform addresses come from this process's environment; this
// Server's own identity comes from `SNEK_SERVER_ORIGIN` where set, falling
// back to the request's origin, exactly as `/sign-in` resolves it — the
// identity is what the registration records, and a request arriving through a
// TLS-terminating proxy misstates its scheme (the sign-in loader says why in
// full). The game instance's address is the one a *browser* can reach, which
// on a hosted setup is not the one this process uses.
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => {
  const serverOrigin = process.env["SNEK_SERVER_ORIGIN"] ?? url.origin;
  return {
    /** Where a client calls the platform's functions. */
    convexUrl: process.env["CONVEX_URL"] ?? "",
    /** The platform's HTTP origin, where the sign-in entry route lives. */
    convexSiteUrl: process.env["CONVEX_SITE_URL"] ?? "",
    /** This Server, as its registration with the platform names it. */
    issuerId: serverOrigin,
    /**
     * Where the platform is asked to return the browser. It must be one the
     * registration records — the platform refuses any other.
     *
     * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
     */
    returnAddress: `${serverOrigin}/play`,
    /** Where a browser reaches the game instance, and which database it is. */
    stdbUrl: process.env["SNEK_STDB_URL"] ?? "http://127.0.0.1:3000",
    stdbDatabase: process.env["SNEK_STDB_DATABASE"] ?? "snek-demo-game",
  };
};
