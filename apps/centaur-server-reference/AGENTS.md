# Agent Context — apps/centaur-server-reference

This app is the reference implementation of the Snek Centaur Server — a Svelte 5 / SvelteKit application backed by `@cyphid/snek-centaur-server-lib`.

## Spec scope

- **Module 08** (`legacy-spec-archive/spec/08-centaur-server-app.md`) — the full Snek Centaur Server Frontend specification.

## Subtree mirror model

This directory is the **canonical** source. The `cyphid/snek-centaur-server` GitHub repository is a **generated mirror** produced by `git subtree split --prefix=apps/centaur-server-reference`. The mirror workflow (`.github/workflows/mirror-centaur-server.yml`) runs on every push to `main`.

**Do not edit the mirror directly.** All changes must be made here and flow through the mirror workflow.

Forkers fork the mirror repository. PRs from forks come back to the mirror and are cherry-picked into `apps/centaur-server-reference/` by a maintainer before the workflow re-syncs.

When the mirror workflow runs, it rewrites the `@cyphid/snek-centaur-server-lib` workspace dependency in the split output to a `github:cyphid/snek-centaur-server-lib#<latest-tag>` reference so forkers can use it without access to this monorepo.

## What goes here

- The full SvelteKit app as specified in `legacy-spec-archive/spec/08-centaur-server-app.md`.
- `/.well-known/snek-game-invite`, `/.well-known/snek-server-keys` and `/.well-known/snek-healthcheck` — the three endpoints of the enumerated fork compatibility surface. Nothing outside the `/.well-known/snek-` prefix is platform-facing; the rest of the path space belongs to the fork.
- All platform-level and team-internal pages from the spec.
- Uses `defineBot` from `@cyphid/snek-centaur-server-lib` for bot computation.

## Sign-in: this app is the party that redeems

`src/routes/sign-in/` is one address doing both ends of the platform's sign-in
handoff, because they *are* one address: it sends the browser to the platform's
entry route, and it is the address the platform returns the browser to. A
`handoff` in the query string is the difference.

Three properties are load-bearing and none of them is a style choice. Read
`migrate-identity-and-authorization`'s design before changing any of them.

- **The page redeems, not the server.** It proves itself with a verifier it
  kept, not with this server's signing key — which is why a fork holding the
  key still cannot take a human's credential out of a reference it can see in
  its own page's address bar.
- **The verifier lives in session storage** because the trip is a top-level
  navigation and memory does not survive one. A verifier confers nothing, so
  this is not the memory-only rule bending; the *credential* is memory-only and
  is never rendered, never stored, and gone on reload.
- **A reference with no verifier behind it is discarded, never redeemed.**
  Without that, anyone can navigate a human here carrying a challenge of their
  own choosing.

The two platform addresses come from this process's environment; the issuer id
and return address come from `SNEK_SERVER_ORIGIN` where set, falling back to
the request's own origin so a plainly-hosted fork keeps nothing in step by
hand. Set the variable wherever a proxy sits between browsers and this process
(a TLS-terminating edge hands this process `http://`, and an issuer that
disagrees with its registration in scheme alone is refused). The platform must
have the origin registered — an operator act, `registry:registerIssuer` on the
deployment.

## Surfaces live under `src/lib/surfaces/`, one directory per capability

A surface is a self-contained component written to the shell's mounting
contract: it takes a binding from `@cyphid/snek-app-shell` and an explicit
boolean per affordance kind, and it derives no actor and reads no session —
there is no API in the shell for doing so, and there must not be one here
either. Which affordances a mounting offers is a *presentation* decision; the
owning runtime judges every write on its own rules, so hiding one makes nothing
unreachable that was not already unreachable.

`src/lib/surfaces/game-configuration/` is the first of them:
`ConfigurationSurface.svelte` plus the record shapes it reads
(`record.ts`), the widgets it derives from the two descriptor tables
(`widgets.ts`), and the binding it is mounted over — the platform's own
deployment, never a dev-only source (`convexConfigurationBinding.ts`). **No
number in `widgets.ts` is a bound** — every limit comes from
`GAMEPLAY_PARAMETER_DESCRIPTORS` (the engine) or
`GENERATION_PARAMETER_DESCRIPTORS` (`@cyphid/snek-game-configuration`), which is
the same declaration the record rejects from. Adding a hard-coded min or max
here re-creates exactly the second copy that sourcing exists to prevent.

### The standalone dev mount

`/dev/game-configuration` mounts the surface alone — every affordance offered,
nothing around it — over **a real game on the platform's own Convex
deployment**. It exists because the surface's requirement is that it needs no
surrounding application context, and this is that requirement made runnable:
`pnpm dev:convex:local`, `pnpm dev`, then open the route.

There is no dev-only record and no dev-only mutation surface. There used to be
one, polling itself over an app endpoint; what it proved was that a second
implementation of the capability's rules agrees with the real one on the day it
is written. What runs now is the workflow: a credential the page earned, the
real `createGame`/`updateConfiguration`/`setPreviewLock` mutations, and Convex's
own query subscription behind the binding.

Four properties are load-bearing:

- **Dev only, enforced.** `+page.server.ts` answers 404 when `dev` is false, so
  a fork building this app for production serves no such route and nothing the
  route reaches is imported anywhere else.
- **The auth is the platform's own.** The page takes the platform's sign-in
  handoff, exactly as `/sign-in` does and through the same
  `$lib/platform/handoff.ts`: this Server never authenticates a human itself,
  and the credential it redeems is capped by this Server's registered ceiling
  intersected with what a human's session may reach. The deployment must
  therefore hold a registration for this origin whose ceiling includes
  `configure-game` and `read-game-configuration`, and whose return addresses
  include `<origin>/dev/game-configuration` — `registry:registerIssuer`, an
  operator act. Signing in without Google is the *deployment's* affair, not this
  Server's: point it at a substitute issuer
  (`SUBSTITUTE_IDENTITY_ISSUER` / `SUBSTITUTE_IDENTITY_JWKS_URL`, the
  substituted verification step the identity capability declares), which is what
  `apps/e2e` does.
- **Nothing polls.** The binding is `convexMutableBinding`'s live subscription.
  Two tabs over one game converge because the deployment re-runs the query, not
  because either of them asked again.
- **Report, never crash.** With `CONVEX_URL` or `CONVEX_SITE_URL` unset the page
  renders which variable is missing and how to start a deployment, in the style
  of `hooks.server.ts`'s environment report. It does not 500 and does not
  half-mount.

Generation still runs platform-side, as it only ever does: the browser renders a
board it was handed and runs no board-generation algorithm at all.

The same component over the same binding is what a room will mount later.
Nothing about it changes between the two — only which host passes the affordance
booleans.

Component tests are `*.browser.test.ts` and run in the `components` project of
`vitest.config.ts` (the bare `svelte` plugin plus the `browser` resolve
condition); plain logic tests run in the `logic` project under the SvelteKit
pipeline. A component test placed in the wrong project cannot call `mount`.

## Vite / SvelteKit notes

- Dev server runs on port 5000 with `server.allowedHosts: true` so the Replit preview iframe works.
- `@sveltejs/adapter-node` is used for production builds.

## Key files

- `src/routes/+page.svelte` — landing page skeleton
- `src/routes/sign-in/` — both ends of the platform's sign-in handoff
- `src/lib/surfaces/game-configuration/` — the configuration surface
- `src/routes/dev/game-configuration/` — its standalone, dev-only mount
- `src/routes/.well-known/snek-game-invite/+server.ts` — game-start invitation endpoint
- `src/routes/.well-known/snek-server-keys/+server.ts` — published signing keys
- `src/routes/.well-known/snek-healthcheck/+server.ts` — unauthenticated liveness
- `vite.config.ts` — Vite config with allowedHosts
- `svelte.config.js` — SvelteKit config with Node adapter
- `legacy-spec-archive/spec/08-centaur-server-app.md` — binding source of truth
