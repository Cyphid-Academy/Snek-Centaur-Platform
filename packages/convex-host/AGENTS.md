# Agent Context — packages/convex-host

This package is `@cyphid/snek-convex-host`: the Convex app (the single persistent deployment) that mounts the Convex Components and provides the full deployed backend.

## Spec scope

- **`game-configuration`** (open change `migrate-game-configuration`) — the public game-configuration function surface. Implemented as thin pass-throughs.
- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — `02-REQ-002` establishes that authorisation lives at the host layer.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — Google OAuth, game credentials, OIDC token issuance.
- **Module 05** (`legacy-spec-archive/spec/05-convex-platform.md`) — integration surface, game lifecycle (delegated to component).
- **Module 06** (`legacy-spec-archive/spec/06-centaur-state.md`) — Centaur state mutations (delegated to component).

## Layout

| Path | What it is |
|------|------------|
| `convex/convex.config.ts` | `defineApp()` mounting `@cyphid/convex-snek-platform/convex.config`. (`convex-centaur-state` is still a stub and mounts when its stories land.) |
| `convex/schema.ts` | Host schema — **deliberately empty**. The identity change adds the Better Auth tables here (local install mode; see "Auth integration" below). All other tables live inside the components. |
| `convex/games.ts` | Public pass-throughs to the component: `createGame`, `getGame` (a Convex query IS the reactive subscription), `updateConfig`, `updateRoster`, `setBoardLock`, `launchGame`. **No auth yet** — each carries a `TODO(migrate-identity-and-authorization)` marking where the capability registry wraps it. The component's `getGameInternal` and `concludeWithoutLaunch` are deliberately not exposed publicly (lifecycle orchestration calls the component directly). |
| `convex/_generated/` | **Committed** codegen output (regenerate with `pnpm codegen`). |
| `convex/tsconfig.json` | Typechecks `convex/` + `tests/` (noEmit); run via `pnpm typecheck:convex`, covered by root `pnpm typecheck`. |
| `tests/games.test.ts` | convex-test suite exercising host → component wiring (component registered via `t.registerComponent("snek-platform", ...)` with a cross-package module glob — convex-test never reads convex.config.ts). |
| `src/index.ts` | Typed re-exports and skeletons for downstream packages. |

## Toolchain

- `pnpm codegen` — the offline codegen recipe (no Convex account needed): `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:6790 CONVEX_SELF_HOSTED_ADMIN_KEY=fake convex codegen --typecheck disable || true`. It writes `convex/_generated` **and** the mounted component's `_generated`, then fails at a network step — the `|| true` is expected. Commit the output. The generated `api.d.ts` is the untyped AnyApi stub (fine); `dataModel.d.ts` is fully typed from schema.
- `pnpm test` — vitest, `environment: "edge-runtime"`, `server.deps.inline: ["convex-test"]`; module globs must include `_generated`.

## Auth integration (DEFERRED)

**Do not integrate the auth library until the identity change's implementation task.**

The plan is:
1. **Better Auth**, installed in **local install mode** — the component embedded in this package's Convex directory rather than consumed across a component boundary, so the HOST schema can carry the linkage records, issuer registry, and accepted-assertion identifiers the spec requires. Forking the integration repository is explicitly rejected.
2. A **project-owned Better Auth plugin** for the protocol layer: the issuance endpoint accepting signed client assertions, assertion verification against a registered principal's published material, single-use enforcement, ceiling intersection, and minting of the structured capability claim. It reuses Better Auth's key and publication infrastructure and manages no keys of its own.
3. **Ordinary application code in this package for the policy layer** — the issuer registry and its ceilings, homing records and two-sided consent, the capability registry, principal-kind checks, per-client ceilings and attribution. Policy must not migrate into the plugin.

The identity change also wraps the public functions in `convex/games.ts` with the capability registry — the `TODO(migrate-identity-and-authorization)` comments mark every seam.

When implementing auth, read the `identity-and-authorization` and `team-server-management` capabilities in full first, along with the design rationale in their change folders.

## Key files

- `convex/games.ts` — the public game-configuration surface
- `convex/convex.config.ts` — component mounting
- `legacy-spec-archive/spec/02-platform-architecture.md`
- `legacy-spec-archive/spec/03-auth-and-identity.md`
