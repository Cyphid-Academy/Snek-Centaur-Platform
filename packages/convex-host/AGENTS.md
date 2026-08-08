# Agent Context — packages/convex-host

This package is `@cyphid/snek-convex-host`: the Convex deployment that mounts both Convex Components and provides the full deployed backend.

## Spec scope

- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — `02-REQ-002` establishes that authorisation lives at the host layer.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — Google OAuth, game credentials, OIDC token issuance.
- **Module 05** (`legacy-spec-archive/spec/05-convex-platform.md`) — integration surface, game lifecycle (delegated to component).
- **Module 06** (`legacy-spec-archive/spec/06-centaur-state.md`) — Centaur state mutations (delegated to component).

## What goes here

- `convex/convex.config.ts` — mounts `convex-snek-platform` and `convex-centaur-state` components.
- Auth wrappers around component functions (auth checks at the host layer, then delegate).
- Capability declarations on public functions — external callers invoke them directly, so there is no separate HTTP API layer to route.
- Credential issuance for SpacetimeDB access tokens, Centaur Servers' per-team game credentials, and external systems.
- Game lifecycle orchestration that spans both components.

## Implementation notes

`convex/` is the deployment: `convex.config.ts` mounts both components, `schema.ts` is empty because the host owns no tables, and `platform.ts` is the public function surface. Every host function reaches its data through `components.*`, never `ctx.db` — that is what makes this the one place an invariant spanning both components can be enforced in a single transaction.

`platform.ts` holds only `platformStatus`. It is a liveness query with a purpose: each component answers with its own name, so a green response proves both components mounted *and mounted as themselves*, rather than merely that a function deployed. Other platform functions arrive with the capability changes that define them — the issued surface is `issuance.ts` (see below), not this file.

The components are imported by **relative path**, not by package name. Convex bundles a component from its `convex.config.ts` source, and resolving that through a pnpm workspace symlink lands the component root outside the package the import was written in.

`convex/` is excluded from `tsc -b` and checked by `convex/tsconfig.json` via `pnpm typecheck:convex`; `src/` stays in the composite build. `src/` exports what the rest of the workspace needs to *talk to* the deployment — record types and the environment contract in `env.ts` — without pulling the Convex runtime into every consumer. It carries no hand-written table of function names: functions are addressed through the generated `api` object, which `tsc` checks against the deployment's actual surface.

## Auth, as built

`migrate-identity-and-authorization` landed the machinery below, including the browser's own way in — read "How a browser on a Server's origin authenticates" further down, because the redirect shape it describes is forced by a constraint nothing here can lift. Read that capability's spec and `design.md` — including its "Substrate as built" section and "Which of the two shapes was built" — before changing anything below; the shape is spec-driven and most of it is a requirement rather than a preference.

**Three modules and one seam.**

- `convex/auth.ts` + `auth.config.ts` + the `/api/auth` routes in `http.ts` — **human sign-in only**. Better Auth, mounted from npm (`app.use(betterAuth)`), supplies the Google exchange and the session cookie, and nothing else. Google talks to *this deployment's* origin and only ever this one; a Snek Centaur Server holds no OAuth client. Its `account` rows are the provider linkage the spec describes — automatic linking is off explicitly, because the default is what moves silently on an upgrade.
- `convex/auth/` — `credential.ts` mints and verifies with `jose` (ES256, 15-minute lifetime, the structured capability claim — the algorithm is forced by the one SpacetimeDB accepts, see the file header), `deployment.ts` holds the signing key and the platform subject grammar, `subject.ts` the game-token subject union, `eligibility.ts` the pure who-may-get-which-token decision. **The platform signs its own credentials**: Better Auth's token endpoint is bound to the caller's session and hardcodes its audience, which cannot express a credential whose subject is a Centaur Team and whose audience is one game instance.
- `convex/issuance.ts` — every issued credential, and the only place one is issued: the assertion exchange, both ends of the sign-in handoff, per-team game credentials, and the four game access tokens. It re-derives no rule; it reads a fact, calls a decision from `auth/`, and mints. There is no auth *plugin*, which is the strongest available form of the design's "policy must not migrate into the plugin".
- `resolveCaller()` in `convex/publicFunctions.ts` is **the seam**, and it now resolves. Two ways in and only two: a platform credential arrives as an argument (`credential`) and is verified against this deployment's published material at the platform audience; a human's session arrives through `ctx.auth`. A third *entrance* exists and is not a third way in: an HTTP route reached by navigation carries the session as a cookie, which `ctx.auth` cannot see, so `publicHttpAction` resolves that caller from Better Auth and hands it to `admitCaller` — the same two checks, one function, only the lookup differs. It is an argument rather than the `Authorization` header because Convex resolves that header against the issuers in `auth.config.ts`, which do not include this deployment, so a credential of ours never reaches a handler through `ctx.auth` — and a query context exposes no raw header to verify by hand. Change that and you change the wire shape of every public call.

**Enforcement is in `admit()`, once** — capability against the caller's claim, then principal kind, independently and in that order. A handler receives `ctx.caller` (the decoded subject) and never the capabilities, because a capability is reachability and not authorization. Add enforcement there, not per function.

**The registry is total.** `scripts/check-public-surface.mjs` (`pnpm check:public-surface`, in `pnpm verify` and its own CI job) fails the build on any file but `publicFunctions.ts` importing `query`/`mutation`/`action`/`httpAction`, and on any exported handler not headed by a public builder — `capability-registry#unregistered-function-fails-the-build`. `publicAction` is a public builder: issuance must reach the network to read what a service principal publishes, and only an action may.

**The host still owns no tables, and auth did not change that.** Better Auth's tables live in its own Convex component; the records this capability owns (`trusted_issuers`, `accepted_assertions`, `sign_in_handoffs`, `platform_admins`, `system_actions`) are tables of `convex-snek-platform`, and the registered-system call counters are `@convex-dev/rate-limiter`'s. `convex/schema.ts` stays empty. The open question this file used to record — whether auth tables breach the no-tables rule — is settled in the negative and needs no amendment.

**Before any of it runs**, an operator must set the Google client and `BETTER_AUTH_SECRET`; `src/env.ts` names every variable and what it is for. The credential-signing key is *not* among them: the deployment generates one for itself on first use and holds it in Better Auth's key store, encrypted under `BETTER_AUTH_SECRET` — so no signing key is ever provisioned from outside, and losing the secret is the one way to lose the key.

## Game configuration, as built

`convex/gameConfiguration.ts` is the whole of the pre-launch shaping surface, and everything its requirements bind happens in **one transaction of the update mutation**: authoritative validation (`validateGameConfig`, the capability's own pure module — the host restates no bound), the edit-window guard on the game's status, and, when the write changed what a board is generated from, the regeneration of the preview and the clearing of the lock together. The last is why they are one mutation rather than three: a lock cleared in a later write leaves a window in which a standing lock designates a preview its own parameters no longer produce.

Three things about it are easy to get wrong and worth reading before changing any of them.

- **Boards are only ever generated here.** `generateBoardAndInitialState` runs inside the mutation, so the preview a surface renders is produced by the same generation a launch will use, and no client runs a board-generation algorithm at all. The seed is drawn from `Math.random`, which is Convex's own seeded randomness inside a mutation: unpredictable to a caller, and reproduced rather than re-drawn if the transaction retries — so a retried write cannot commit a different board than the one it computed.
- **The two capabilities carry no access rule, deliberately.** `read-game-configuration` and `configure-game` declare the deployment's uniform admission and nothing else; `game-configuration` holds no permission of its own, because the room story owns who exists and what they may do. Which affordances a mounted surface offers is a presentation parameter its host passes it, never a capability.
- **The two halves' validators are imported from the component's `convex/schema.ts` by relative path**, not spelled again here. The stored shape and the wire shape are one document, and a second copy in the host is exactly the drift the component's mirror guard exists to make impossible.

## How a browser on a Server's origin authenticates

This was a known gap and is now the shape of the thing. It is written down because every piece of it looks arbitrary in isolation, and because the constraint it is built around is easy to forget and expensive to rediscover.

**The constraint.** Better Auth's session cookie is `sameSite: "lax"` on this deployment's origin. That blocks it on a cross-site *fetch* and permits it on a top-level *GET navigation*. So a page served from a team's fork can never present the session to a function call — the `ctx.auth` branch of `resolveCaller` is unreachable from any origin but this one, and always will be — while a browser *navigating* here always can. **Sign-in is therefore redirects, not function calls**, and the cookie is read inside this deployment's own HTTP routes and nowhere else. Do not try to fix this with a client library; that is the road that ends at `trustedOrigins`, CORS-with-credentials, and the `cross-domain` plugin, none of which is in use and none of which is needed.

**The flow**, in `convex/signIn.ts`:

- `GET /sign-in?issuer&return&challenge` — a Server links a signed-out human here. It validates the issuer is registered and the return address is one *that issuer* registered **before** the provider is involved (`#return-address-is-registered-not-requested`), so the platform never becomes a trusted-looking bounce and nobody is walked through Google only to be refused on the way back. If a platform session is already live it skips Google entirely, which is the silent reload round trip `design.md` commits to. Otherwise it calls `auth.api.signInSocial()` **in process** — that route is a JSON POST answering 200, so its `Location` is not one a browser follows — and issues its own 302, carrying Better Auth's `Set-Cookie` headers via `returnHeaders`. Dropping those loses the signed `state` cookie and fails the return leg inside Better Auth as a state mismatch, which reads like a Google problem and is not one.
- `GET /sign-in/return?issuer&return&challenge` — Better Auth's callback lands here with the session cookie set. It reads the session, mints the handoff bound to `(userId, issuerId, challenge)`, and 302s to `return?handoff=<ref>`.

**The return context rides in the `callbackURL`**, which Better Auth stores server-side keyed by a `state` it generates itself and will not accept from a caller. Nothing of ours is signed, stored, or swept. Do not add a state token; the library is already doing the job.

**Redemption is keyless.** `redeemSignInHandoff` takes the verifier behind the challenge — PKCE — and **not** a service-principal assertion, which is removed rather than kept alongside. That is a security property: the return leg puts the reference in the address bar of the Server's own page, so a reference the Server could also open with its key is one it can take for itself. `challenge` is required on every row, so no such reference exists. The proof is compared inside the component's `redeemHandoff`, which deletes only on a match — the challenge lives on the row, so nothing outside that transaction can check it first, and this is what keeps "accepted once" and "a failed proof spends nothing" true together.

**Two builders, not one.** `publicHttpAction` resolves its caller from Better Auth's session rather than `ctx.auth` (which Convex fills from an `Authorization` JWT, never a cookie — as do `authComponent`'s own `getAuthUser`/`getHeaders`, so they are no help either), then runs `admitCaller`, the same two checks every other public function runs. `begin-sign-in` is a **fourth** anonymously reachable capability; `anonymous-reach` was revised to name it, which is what that requirement demands of a fourth entry.

**What is proven, and by what.** `convex/signIn.test.ts` covers the refusals a
browser can be given with no session. `convex/signIn.session.test.ts` covers the
entry route reached *with* one — a real sign-in through the deployment's own
provider, then the already-signed-in branch answering off the session alone.
That second file exists because the first one's header was wrong about what was
reachable in process: establishing a session needs Better Auth's component
registered in the harness, and `@convex-dev/better-auth/test` exports a
`register` helper that does it in one line. **Register it before concluding that
anything about sign-in needs a deployment.**

One end-to-end scenario covers what is genuinely left —
`apps/e2e/src/sign-in.test.ts`, a real browser against a real deployment: the
session cookie riding a top-level navigation to *another origin*, a page holding
a verifier in session storage across that navigation, and the redeemed
credential being one the platform then answers to. Deliberately one scenario.
Everything decided inside one runtime is unit-tested there; an end-to-end
assertion costs a hundred times more and is owed only to a fact no in-process
test can reach.

Establishing a signed-in human there costs one substituted step — the deployment
verifies an identity assertion against material the harness publishes, switched
on by two environment variables and absent by default. That the absence is the
production path is `convex/auth.test.ts`, not an end-to-end test: it is a
ten-line branch in one runtime, and the end-to-end form of it could only clear
the variables and assert that *something* failed.

**One thing remains unproven and is not reachable from here.** The leg through
Google — that a browser stores the provider library's signed `state` cookie and
replays it on the way back, landing on `/sign-in/return` — needs Google, and the
provider library hard-codes its endpoints. Nothing on a machine with no route
off it can establish it.

**A registered system's calls are bounded and attributed, as of 1.11.** The bound is per issuer — the constants are in `publicFunctions.ts` rather than a registration column, because the credentialed path knows only the issuer named in `act` and would otherwise read the registry on every call for a number that is the same for everyone. It is charged at **both** points such a call is authenticated: the credentialed one, in the `declared()` builder every public function shares, and the assertion exchange in `issuance.ts`, which carries no credential and would otherwise leave the way credentials are obtained unbounded. Reading and spending are one component mutation, since a count the host checks and then increments is one two concurrent callers walk past together.

The counting itself is **`@convex-dev/rate-limiter`**, not ours: a token bucket named `systemCall` on the `rateLimiter` instance in `publicFunctions.ts`. It replaced a hand-rolled fixed window, which admitted its whole allowance in the last instant of one window and again in the first instant of the next — the burst a ceiling exists to bound. Three things follow that are worth not rediscovering. It is deliberately **unsharded**, because sharding divides the capacity and spends a random shard, buying write throughput by making the ceiling approximate; `shards:` on that object is the lever if per-issuer contention is ever *measured* (`design.md` explains why it might be — every signed-in page on a Server shares that Server's bucket). A refusal is a **`ConvexError`** carrying `issuerId` and `retryAfter`, because a production deployment reveals a thrown plain `Error`'s message to no caller, so the previous carefully-worded refusal reached only the logs. And its tables are the component's, so a test spends a bucket through the exported `rateLimiter` rather than seeding a row.

**Attribution is a separate component mutation** (`recordAttribution`), called only on the admitting path, so a refused call still leaves no record of an action nobody took. `ResolvedCaller` gained `actingSystem` from the credential's `act`, `Principal` deliberately still did not, and no handler records anything itself. Mutations and actions only — a query takes no action on anyone's behalf, and could not write one down if it did. `platform:attributedActions` is the reading end, and takes no argument, so whose records come back is the caller's own credential.

**`convex/crons.ts` is what makes every retention in this deployment real.** Convex has no row-level TTL, so an `expiresAt` column is a number nothing acts on until something sweeps it. The hourly job chains `sweepExpired` batches while any batch deletes anything — accepted assertion ids, handoff references, attribution records. Without it those three tables grow one row per authenticated call forever, which is the permanent account of who authenticated when, and who acted through whom, that each retention was chosen to avoid keeping.

`convex/platform.test.ts` (convex-test, both components registered, no deployment or deploy key) is where an authorization rule is tested; a **local Convex deployment** (`pnpm dev:convex:local`, `docs/external-setup.md`) is what makes the federated half testable at all, since only a loopback deployment can fetch from a Snek Centaur Server running beside it.

**A dependency footnote worth keeping.** `@convex-dev/better-auth` declares a required `react` peer. Auto-installed, it made `convex-host` resolve a peer-suffixed copy of `convex` while the two components resolved the plain one, and every `app.use(component)` failed to typecheck with "two different types with this name exist". The root `package.json` marks that peer optional under `pnpm.packageExtensions`, which collapses them back to one copy. Do not remove it without re-running `pnpm typecheck`.

## Key files

- `convex/convex.config.ts` — mounts both components plus Better Auth
- `convex/platform.ts` — the public function surface
- `convex/capabilities.ts`, `convex/publicFunctions.ts` — what may reach a public function, and the builders that make every one declare it
- `convex/auth.ts`, `convex/auth.config.ts` — human sign-in, and the one issuer this deployment trusts
- `convex/auth/` — minting, verification, the token subject grammar, and the eligibility decision
- `convex/issuance.ts` — everything the platform issues
- `convex/gameConfiguration.ts` — a game's configuration, its board preview, and the lock
- `convex/http.ts` — the auth routes and the published verification material
- `convex/platform.test.ts` — the surface under test with both components registered, no deployment involved
- `src/env.ts` — the environment contract (this project ships no `.env.example` on purpose)
- `src/index.ts` — record-type re-exports and the environment contract
- `legacy-spec-archive/spec/02-platform-architecture.md`
- `legacy-spec-archive/spec/03-auth-and-identity.md`
