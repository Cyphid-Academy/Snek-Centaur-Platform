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

## Vite / SvelteKit notes

- Dev server runs on port 5000 with `server.allowedHosts: true` so the Replit preview iframe works.
- `@sveltejs/adapter-node` is used for production builds.

## The identity demo lives here, and it is scaffolding

`src/routes/play/` and `src/lib/server/demo/` are the `identity-and-authorization`
demo — a two-team counter race against a live game instance, documented in
`docs/identity-demo.md`. They are **not** part of this Server's specified
surface. They exist because two capabilities this app will eventually rely on
(`team-management`'s roster, `game-lifecycle`'s game creation) have no
implementation yet, so the demo seats players itself by shelling the demo
stack's own operator script.

Two properties keep them from becoming a burden on forks. Everything is
**guarded on the demo stack's environment** (`SNEK_WORLD_FILE`,
`SNEK_REPO_ROOT`): with those unset — which is every fork — the seating routes
answer that no demo stack is running, and nothing else in the app depends on
them. And nothing here reaches the repository by import: the only repo-relative
reference is a runtime `execFile` behind `SNEK_REPO_ROOT`, so the subtree still
builds standalone.

`src/lib/game/_generated/` is `spacetime generate` output for the demo's game
module, committed so a fork typechecks without the module in reach. Regenerate
with `pnpm demo:codegen`; do not hand-edit it (the script re-stamps its
`@ts-nocheck` headers, and says there why they are needed).

## Key files

- `src/routes/+page.svelte` — landing page skeleton
- `src/routes/sign-in/` — both ends of the platform's sign-in handoff
- `src/routes/play/` — the identity demo (scaffolding; see above)
- `src/routes/.well-known/snek-game-invite/+server.ts` — game-start invitation endpoint
- `src/routes/.well-known/snek-server-keys/+server.ts` — published signing keys
- `src/routes/.well-known/snek-healthcheck/+server.ts` — unauthenticated liveness
- `vite.config.ts` — Vite config with allowedHosts
- `svelte.config.js` — SvelteKit config with Node adapter
- `legacy-spec-archive/spec/08-centaur-server-app.md` — binding source of truth
