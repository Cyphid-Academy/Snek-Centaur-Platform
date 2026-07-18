# Agent Context — packages/convex-snek-platform

This package is `@cyphid/convex-snek-platform`: a Convex Component that owns the platform-wide Convex tables. It is imported and mounted by `packages/convex-host`.

## Spec scope

- **Module 05** (`legacy-spec-archive/spec/05-convex-platform.md`) — platform schema, game lifecycle orchestration, HTTP API, webhooks.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — identity types, Google OAuth, game invitation flow.

## What goes here

- Convex schema for: `users`, `centaur_teams`, `centaur_team_members`, `game_teams`, `rooms`, `games`, `replays`, `api_keys`, `webhooks`.
- Convex Component configuration (`convex.config.ts`).
- Platform functions (queries, mutations, actions) for game lifecycle.
- Game invitation delivery logic.
- Webhook delivery (at-least-once).

## What does NOT go here

- Centaur-subsystem tables (`snake_config`, `drives`, etc.) — those are in `packages/convex-centaur-state`.
- Auth wrappers or HTTP API endpoint routing — those belong in `packages/convex-host`.

## Implementation notes

This is a Convex Component, not a full Convex deployment. It is mounted by `convex-host` via `convex.config.ts`. Its tables are isolated and accessed through the component's exported functions. See Convex Component docs for the isolation model.

`pnpm codegen` is a no-op stub until real `convex codegen` is wired up.

## Key files

- `src/index.ts` — exported types and component config stub
- `legacy-spec-archive/spec/05-convex-platform.md` — binding source of truth
- `legacy-spec-archive/spec/03-auth-and-identity.md` — auth and identity context
