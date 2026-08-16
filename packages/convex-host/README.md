# @cyphid/snek-convex-host

Convex deployment for the Team Snek Centaur Platform: the single persistent Convex app.

Mounts `@cyphid/convex-snek-platform` as a Convex Component and exposes the public game-configuration surface (`convex/games.ts`) as thin pass-throughs — auth wrappers arrive with the identity change, which also owns the Better Auth tables in this app's (currently empty) host schema. `@cyphid/convex-centaur-state` mounts when its stories land.

Regenerate `_generated/` with `pnpm codegen` (offline recipe — no Convex account needed). See `AGENTS.md` for layout, toolchain, and the deferred auth-integration plan.

**Spec**: `game-configuration` (open change `migrate-game-configuration`); modules 02, 03, 05, 06 of `legacy-spec-archive/` for the unmigrated remainder.
