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

## Auth integration (DEFERRED)

**Do not integrate the auth library until the first Convex implementation task.**

The plan is:
1. **Better Auth**, installed in **local install mode** — the component embedded in this package's Convex directory rather than consumed across a component boundary, so the schema can carry the linkage records, issuer registry, and accepted-assertion identifiers the spec requires. Forking the integration repository is explicitly rejected.
2. A **project-owned Better Auth plugin** for the protocol layer: the issuance endpoint accepting signed client assertions, assertion verification against a registered principal's published material, single-use enforcement, ceiling intersection, and minting of the structured capability claim. It reuses Better Auth's key and publication infrastructure and manages no keys of its own.
3. **Ordinary application code in this package for the policy layer** — the issuer registry and its ceilings, homing records and two-sided consent, the capability registry, principal-kind checks, per-client ceilings and attribution. Policy must not migrate into the plugin.

When implementing auth, read the `identity-and-authorization` and `team-server-management` capabilities in full first, along with the design rationale in their change folders.

## Key files

- `src/index.ts` — re-exports and placeholder host function
- `convex/convex.config.ts` — component mounting (stub)
- `legacy-spec-archive/spec/02-platform-architecture.md`
- `legacy-spec-archive/spec/03-auth-and-identity.md`
