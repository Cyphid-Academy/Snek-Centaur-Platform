// spec: identity-and-authorization/sign-in-handoff
// What the sign-in page needs of the server it is served from.
//
// The two addresses come from this process's environment; the two identities
// come from the request's own origin, which is the only honest source for them
// — this Server's issuer id *is* the domain it is operated from, and the address
// the platform returns a human to is a path on that same origin. Deriving them
// rather than configuring them separately is what keeps a fork from having to
// keep three values in step across every environment it runs in.
// `process.env` rather than `$env/dynamic/private`, as `hooks.server.ts` reads
// it: this app's tsconfig excludes `.svelte-kit`, where the ambient declaration
// for that module lives.
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
   * registration records — the platform refuses any other, which is what stops
   * it being a trusted-looking bounce to anywhere.
   *
   * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
   */
  returnAddress: `${url.origin}/sign-in`,
});
