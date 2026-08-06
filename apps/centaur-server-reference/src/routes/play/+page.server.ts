// What the play page needs of the server it is served from.
//
// The two platform addresses come from this process's environment; this
// Server's issuer id and the address the platform returns a human to are
// derived from the request's own origin, exactly as `/sign-in` derives them —
// so a fork keeps nothing in step by hand. The game instance's address is the
// one a *browser* can reach, which on a hosted setup is not the one this
// process uses.
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = ({ url }) => ({
  /** Where a client calls the platform's functions. */
  convexUrl: process.env["CONVEX_URL"] ?? "",
  /** The platform's HTTP origin, where the sign-in entry route lives. */
  convexSiteUrl: process.env["CONVEX_SITE_URL"] ?? "",
  /** This Server, as its registration with the platform names it. */
  issuerId: url.origin,
  /**
   * Where the platform is asked to return the browser. It must be one the
   * registration records — the platform refuses any other.
   *
   * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
   */
  returnAddress: `${url.origin}/play`,
  /** Where a browser reaches the game instance, and which database it is. */
  stdbUrl: process.env["SNEK_STDB_URL"] ?? "http://127.0.0.1:3000",
  stdbDatabase: process.env["SNEK_STDB_DATABASE"] ?? "snek-demo-game",
});
