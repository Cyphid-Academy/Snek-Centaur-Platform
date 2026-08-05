# Identity & Authorization demo

`pnpm demo` stands the platform's three runtimes up on one machine — the
self-hosted Convex deployment, a SpacetimeDB host with the game module
published, and the reference Snek Centaur Server app — and runs the documented
operator acts against them (issuer registration, world seeding). The result is
the `identity-and-authorization` capability running end to end, driven from a
browser at the app's **`/console`** page.

On Replit this is the Run button (`Identity Demo` workflow). Anywhere else:
`pnpm demo` from the repo root (needs `spacetime` on `PATH`; the Convex backend
binary is fetched once into `~/.cache/convex/binaries`).

## One-time setup: Google

Sign-in is the real Google flow — the platform maintains no credential store
for humans, so without a Google client nothing can sign in.

1. Create (or reuse) a Google OAuth **web application** client.
2. Set three environment secrets (on Replit: **Secrets**):
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `BETTER_AUTH_SECRET` — any strong random string; the deployment's signing
     key store is encrypted under it, so changing it discards the key.
3. Add the callback address the stack prints at startup to the client's
   **Authorized redirect URIs**:
   - Replit: `https://<your-repl-domain>:3003/api/auth/callback/google`
   - locally: `http://127.0.0.1:3211/api/auth/callback/google`

Open the app **in its own browser tab** (on Replit: the "open in new tab"
button on the webview). Google refuses to complete sign-in inside an iframe,
and the platform's session cookie rides on top-level navigations.

## What the console demonstrates

- **Liveness & published verification material** — the anonymous
  `platformStatus` query, and the `/.well-known/openid-configuration` +
  `/.well-known/jwks.json` documents any party validates the platform's
  credentials against, alone.
- **Google sign-in and the session** — the real redirect chain: the app sends
  the browser to the platform's `/sign-in` entry with a PKCE challenge, Google
  answers at the platform's origin (never the app's), and the browser returns
  carrying a single-use handoff reference. The session cookie is httpOnly, on
  the platform's origin alone; reloading the console and signing in again is
  the silent round trip.
- **The sign-in handoff** — the reference is redeemed with the page's own
  verifier; a reference arriving with no verifier behind it is discarded; a
  spent reference redeems nothing.
- **Credential custody** — the page holds its credential in memory only,
  shows only decoded claims (subject, audience, the structured capability
  claim, the `act` naming this server), and counts down the fifteen-minute
  lifetime. Renewal is another silent round trip: a credential cannot renew
  itself, because `begin-sign-in-handoff` is outside every peer ceiling.
- **Game access tokens** — operator / spectator / coach issuance against the
  seeded games, with the real refusals: not on a roster, not a designated
  coach, game finished. A platform admin (seed with `--admin`) is an implicit
  coach of every team. Token subjects encode the role; audiences name the one
  game.
- **Instance admission** — the console knocks on the published game instance
  with and without tokens. The shipped module's seed tables have no writer
  until `migrate-game-lifecycle` lands `initialize_game`, so every knock shows
  the fail-closed refusal — decided by the same `admit()` the unit and
  end-to-end suites drive.
- **Attribution & the call bound** — every call the page makes under its
  credential carries `act`, is charged against this server's call bound, and
  appears in the "actions taken through a server" list.
- **The server as a service principal** — the app signs short-lived assertions
  with its own key (published at `/.well-known/snek-server-keys`, generated on
  first boot), exchanges them for platform credentials, and shows the loud
  refusal for capabilities beyond its registered ceiling. It holds a per-team
  game credential with proactive renewal, obtains bot tokens under it, and
  presents them at the instance — including the check that the host's
  websocket-token exchange preserves the platform's issuer, game binding and
  subject.

## Seeding

The tables behind games and teams have no production writer yet (they belong
to `migrate-game-lifecycle` / `migrate-team-management`), so the stack seeds a
demo world as an operator act — `registrySeeding.ts` in the host, reachable
only with the deployment's admin key.

The initial world holds team **Alpha** (operated by the app), team **Beta**
(no server), a **playing** game and a **finished** one, with empty rosters.
After signing in, the console shows your platform user id and the command that
puts you on the roster:

```
pnpm demo:seed --member=<userId>            # operator eligibility, team Alpha
pnpm demo:seed --member=<id> --coach=<id>   # also a designated coach of Alpha
pnpm demo:seed --admin=<id>                 # platform admin (implicit coach)
```

Ids are stable across re-seeds and stack restarts; everything the stack
persists lives in the gitignored `.demo/` directory.
