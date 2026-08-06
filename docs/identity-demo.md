# The identity demo: a team counter race

`pnpm demo` stands the platform's three runtimes up together — the Convex
deployment, a SpacetimeDB host with the game modules published, and the
reference Snek Centaur Server app — and runs the operator acts that give them a
world to play in. The result is at the app's **`/play`**: two teams, one
counter each, and a button.

Sign in and you are seated on a team. Press **+1** and everybody watching sees
it land. That is the whole game, and every step of getting into it is the
`identity-and-authorization` capability doing its real work.

On Replit this is the Run button (`Identity Demo` workflow). Anywhere else:
`pnpm demo` from the repo root (needs `spacetime` on `PATH`).

## Hosted or local Convex

The stack targets whichever Convex the environment names:

- **Hosted (recommended on Replit)** — set a `CONVEX_DEPLOY_KEY` Secret (a
  personal **dev** deployment's key, per the repo's provisioning strategy in
  `CLAUDE.md`). The stack runs no backend of its own: functions are pushed to
  your deployment exactly as `pnpm dev:convex` would, and the platform origin
  is the deployment's stable `https://<name>.convex.site` — so the Google
  redirect URI is registered once and survives restarts, and the Convex
  dashboard shows the live tables.
- **Local** — with no deploy key, the pinned self-hosted backend runs on ports
  3210/3211 (the same binary the end-to-end harness drives, fetched once into
  `~/.cache/convex/binaries`), and its data persists in `.demo/`.
  `SNEK_DEMO_CONVEX=local` forces this mode even when a key is set.

## One-time setup: Google

Sign-in is the real Google flow — the platform maintains no credential store
for humans, so without a Google client nobody can sign in.

1. Create (or reuse) a Google OAuth **web application** client.
2. Set three environment secrets (on Replit: **Secrets**):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `BETTER_AUTH_SECRET` — any strong random string; the deployment's signing
     key store is encrypted under it, so changing it discards the key.
3. Add the callback address the stack prints at startup to the client's
   **Authorized redirect URIs**:
   - hosted Convex: `https://<deployment-name>.convex.site/api/auth/callback/google`
   - local Convex on Replit: `https://<your-repl-domain>:3003/api/auth/callback/google`
   - local Convex locally: `http://127.0.0.1:3211/api/auth/callback/google`

Open the app **in its own browser tab** (on Replit: the "open in new tab"
button on the webview). Google refuses to complete sign-in inside an iframe.

To race somebody, open `/play` as a second person — another browser, another
profile, or a private window — and sign in with a different Google account.

## What is real underneath

Nothing about the identity machinery is simulated. In the order the demo
exercises it:

- **Sign-in happens at the platform's origin, never at this server's.** The
  page sends your browser to the platform carrying a challenge; Google answers
  the platform; the platform sends you back holding a single-use handoff
  reference. This server never sees the exchange with Google, and could not
  redeem the reference itself — redeeming it takes the verifier the page kept.
- **The session lives in a cookie no page script can read**, on the platform's
  origin alone. Reload `/play` and the round trip repeats silently, because
  the session is still there; sign out and it goes through Google again.
- **Being seated is not being authorized.** Seating writes you into the game's
  roster snapshot (see the scaffolding note below). What that earns you is
  decided twice more, by two different parties.
- **The platform decides whether to issue a game token.** An operator token
  goes only to somebody the snapshot records on a participating team, and only
  while the game is being played. A spectator token goes to any signed-in
  human. Each is signed for one game and expires in fifteen minutes.
- **The game instance decides whether to admit the connection**, entirely on
  its own — checking the signature against material it was seeded with, that
  the token names *this* game, that it has not expired, and that the subject
  is somebody its roster knows. It calls nothing and nobody to do it.
- **Your team comes from the roster, not from the token.** An operator token
  binds no team at all; the instance derives it at admission from the snapshot,
  so nothing a client sends can move a point to another team's counter.
- **A spectator cannot act, structurally.** Press +1 while watching and the
  game refuses — not by checking a permission, but because a spectator's
  admitted identity carries no team to act for. The button is left enabled so
  you can see it happen.
- **An established connection survives its token's expiry.** Expiry bounds the
  window for *establishing* a connection; reconnecting fetches a fresh token.

## The scaffolding, and why it exists

Two things in this demo are not the platform, and both stand in for changes
that have not landed yet:

- **Seating.** Getting onto a team's roster is `team-management`'s story (a
  captain adds a member), and a game taking a roster snapshot is
  `game-lifecycle`'s. Neither exists, so the demo treats signing in as joining:
  the app's server asks the stack to seat you on whichever team has fewer
  players, which rewrites the platform's roster snapshot and re-seeds the
  instance. It is an operator act, run with the deployment's admin credential
  — the same trust level as registering a trusted issuer.
- **The game module.** `packages/stdb/spacetimedb` ships the platform's real
  instance, and it deliberately has no `initialize_game` and no gameplay
  reducers — so it admits nobody and there is nothing to play. `apps/demo-game`
  fills exactly those two gaps: a seeding reducer only the module's publisher
  may call, and a one-line `increment`. Its admission path is not a copy of the
  real one but a call into the same shared code (`admit`, `admissionRow`,
  `actingTeam` from `@cyphid/snek-stdb`), so what a token earns in the demo is
  what it earns in the real instance. The stack publishes both modules every
  run.

## Manual controls

Ordinary play needs none of these — `/play` seats people by itself.

```
pnpm demo:seed                      re-seed both snapshots as they stand
pnpm demo:seed --seat=<userId>      seat a human without them signing in
pnpm demo:seed --admin=<userId>     designate a platform admin
pnpm demo:codegen                   regenerate the game's client bindings
```

A **platform admin** is worth a look, because the role is deliberately
lopsided: it reads everything and holds implicit coach standing over every team
— so an admin can obtain a coach token for a team nobody designated them a
coach of — and it still cannot act inside a game, because a game instance
honours no platform-side role at all.

Everything the stack persists lives in the gitignored `.demo/`; ids are stable
across restarts, so players keep their seats.
