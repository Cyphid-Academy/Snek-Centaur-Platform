// spec: identity-and-authorization/sign-in-handoff
// What the sign-in page needs of the server it is served from.
//
// The two platform addresses come from this process's environment. This
// Server's own identity — the issuer id, and the return address that is a
// path on it — comes from `SNEK_SERVER_ORIGIN` where set: the identity is
// whatever string this Server's *registration* records, and configuration is
// the only source that can be made to match the registration everywhere. The
// request's own origin remains the fallback, so a plainly-hosted fork still
// configures nothing — but it is a guess, and it guesses wrong exactly where
// a proxy terminates TLS ahead of this process: the request then arrives as
// http://, the derived issuer disagrees with its https:// registration in
// scheme alone, and the platform's refusal reads as a credentials problem.
// Set the variable wherever the address a browser uses is not the address
// this process sees.
// `process.env` rather than `$env/dynamic/private`, as `hooks.server.ts` reads
// it: this app's tsconfig excludes `.svelte-kit`, where the ambient declaration
// for that module lives.
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
     * registration records — the platform refuses any other, which is what stops
     * it being a trusted-looking bounce to anywhere.
     *
     * spec: identity-and-authorization/sign-in-handoff#return-address-is-registered-not-requested
     */
    returnAddress: `${serverOrigin}/sign-in`,
  };
};
