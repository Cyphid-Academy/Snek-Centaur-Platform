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

`platform.ts` holds only `platformStatus` so far. It is a liveness query with a purpose: each component answers with its own name, so a green response proves both components mounted *and mounted as themselves*, rather than merely that a function deployed. Real platform functions arrive with the capability changes that define them.

The components are imported by **relative path**, not by package name. Convex bundles a component from its `convex.config.ts` source, and resolving that through a pnpm workspace symlink lands the component root outside the package the import was written in.

`convex/` is excluded from `tsc -b` and checked by `convex/tsconfig.json` via `pnpm typecheck:convex`; `src/` stays in the composite build. `src/` exports what the rest of the workspace needs to *talk to* the deployment — record types, the environment contract in `env.ts`, and the function names — without pulling the Convex runtime into every consumer.

## Auth integration (STILL DEFERRED)

Wiring the runtimes up was the "first Convex implementation task" this section originally waited for, and auth is deliberately **not** part of it. The reason is unchanged and is about sequencing, not effort: the auth model is spec-heavy — federated issuance, linked credentials, two-sided consent, capability ceilings — and belongs with the `migrate-identity-and-authorization` change that owns those requirements, not with runtime plumbing. Implementing it alongside the wiring would mean inventing policy ahead of the spec it has to match.

The plan is:
1. **Better Auth**, installed in **local install mode** — the component embedded in this package's Convex directory rather than consumed across a component boundary, so the schema can carry the linkage records, issuer registry, and accepted-assertion identifiers the spec requires. Forking the integration repository is explicitly rejected.
2. A **project-owned Better Auth plugin** for the protocol layer: the issuance endpoint accepting signed client assertions, assertion verification against a registered principal's published material, single-use enforcement, ceiling intersection, and minting of the structured capability claim. It reuses Better Auth's key and publication infrastructure and manages no keys of its own.
3. **Ordinary application code in this package for the policy layer** — the issuer registry and its ceilings, homing records and two-sided consent, the capability registry, principal-kind checks, per-client ceilings and attribution. Policy must not migrate into the plugin.

When implementing auth, read the `identity-and-authorization` and `team-server-management` capabilities in full first, along with the design rationale in their change folders.

## Key files

- `convex/convex.config.ts` — mounts both components
- `convex/platform.ts` — the public function surface
- `src/env.ts` — the environment contract (this project ships no `.env.example` on purpose)
- `src/index.ts` — record-type re-exports and the published function names
- `legacy-spec-archive/spec/02-platform-architecture.md`
- `legacy-spec-archive/spec/03-auth-and-identity.md`
