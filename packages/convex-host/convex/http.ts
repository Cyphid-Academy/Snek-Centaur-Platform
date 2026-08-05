// spec: identity-and-authorization/google-sign-in,
//       identity-and-authorization/sole-credential-issuer
// The deployment's HTTP surface. Sign-in, sign-out, the Google redirect, and
// the well-known verification material all live under `/api/auth` here — at the
// platform's own origin, which is the point (see `auth.ts`).
//
// These are the only unauthenticated routes the platform has, and they are the
// exception `authentication-required` names. `#sign-out-clears-client-state` is
// served by the sign-out route: it deletes the session row and clears the
// cookie, so nothing the client retains keeps authenticating.
import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { issuer } from "./auth/deployment";
import { publishedDocument, publishedKeySet } from "./publicFunctions";
import { begin, complete } from "./signIn";

const http = httpRouter();

// The verification material for everything this platform signs, at the two
// addresses a party already knows how to look for: OIDC discovery from the
// issuer, and the key set it points at. Standard addresses rather than an
// endpoint of our own is the point — a game's SpacetimeDB instance is
// configured with the issuer at initialisation and finds the rest by itself,
// consulting nothing else and no one else afterwards.
//
// One document covers every game, so a new instance negotiates no new
// verification arrangement; it comes into existence already covered.
//
// **Registered before `registerRoutes`, and that order is load-bearing.** Better
// Auth publishes a discovery document of its own and would claim this same path;
// it yields where one is already routed, and Convex rejects a deployment that
// routes one path twice — so with the calls the other way round the whole
// deployment fails to start, which is how this ordering was found. Ours wins
// because the party that resolves discovery from the issuer is a game instance
// looking for the key that signs its admission tokens. Nothing is lost: Convex
// resolves `ctx.auth` against the explicit JWKS address in `auth.config.ts`
// (`/api/auth/convex/jwks`) rather than by discovery, and Better Auth's own
// document remains at its `/api/auth/convex/` address for anything that wants it.
// spec: identity-and-authorization/verification-without-shared-secrets#instance-validates-alone
// spec: identity-and-authorization/verification-without-shared-secrets#same-material-platform-wide
http.route({
  path: "/.well-known/openid-configuration",
  method: "GET",
  handler: publishedDocument(() => ({
    issuer: issuer(),
    jwks_uri: `${issuer()}/.well-known/jwks.json`,
  })),
});

// The key set that document points at, served by Better Auth's `jwt` plugin
// from the same store everything is signed with — here at the root well-known
// address rather than the plugin's own `/api/auth/jwks`, because a game
// instance resolves it from the issuer and consults nothing else.
http.route({
  path: "/.well-known/jwks.json",
  method: "GET",
  handler: publishedKeySet(),
});

// The browser's way in, and the only two addresses on this surface a human
// navigates to rather than calls. A Snek Centaur Server links a signed-out
// person at `/sign-in`; Better Auth's own callback sends them back through
// `/sign-in/return` once Google has answered and the session cookie is set.
// `signIn.ts` has the whole shape and why it is redirects rather than function
// calls.
//
// Neither path collides with what `registerRoutes` claims below — that is
// `/api/auth/` and the discovery document already routed above.
// spec: identity-and-authorization/sign-in-handoff
http.route({ path: "/sign-in", method: "GET", handler: begin });
http.route({ path: "/sign-in/return", method: "GET", handler: complete });

authComponent.registerRoutes(http, createAuth);

export default http;
