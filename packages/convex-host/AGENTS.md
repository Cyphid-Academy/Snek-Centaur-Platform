# Agent Context — packages/convex-host

This package is `@cyphid/snek-convex-host`: the Convex deployment that mounts both Convex Components and provides the full deployed backend.

## Spec scope

- **Module 02** (`legacy-spec-archive/spec/02-platform-architecture.md`) — `02-REQ-002` establishes that authorisation lives at the host layer.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — Google OAuth, game credentials, OIDC token issuance.
- **Module 05** (`legacy-spec-archive/spec/05-convex-platform.md`) — HTTP API, game lifecycle (delegated to component).
- **Module 06** (`legacy-spec-archive/spec/06-centaur-state.md`) — Centaur state mutations (delegated to component).

## What goes here

- `convex/convex.config.ts` — mounts `convex-snek-platform` and `convex-centaur-state` components.
- Auth wrappers around component functions (auth checks at the host layer, then delegate).
- HTTP API endpoint routing (Bearer token via `api_keys` table).
- OIDC token issuance for SpacetimeDB access tokens.
- Game lifecycle orchestration that spans both components.

## Auth integration (DEFERRED)

**Do not integrate `@convex-dev/auth` until the first Convex implementation task.**

The recommended plan is:
1. `@convex-dev/auth` for Google OAuth (the standard Convex auth integration).
2. Bespoke logic in this host package for:
   - Per-Centaur-Team game credential generation and validation (spec: `03-REQ-050`).
   - STDB OIDC token issuance (Convex acts as OIDC issuer; SpacetimeDB validates via OIDC discovery).

When implementing auth, read `legacy-spec-archive/spec/03-auth-and-identity.md` in full first.

## Key files

- `src/index.ts` — re-exports and placeholder host function
- `convex/convex.config.ts` — component mounting (stub)
- `legacy-spec-archive/spec/02-platform-architecture.md`
- `legacy-spec-archive/spec/03-auth-and-identity.md`
