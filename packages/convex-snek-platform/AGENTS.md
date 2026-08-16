# Agent Context — packages/convex-snek-platform

This package is `@cyphid/convex-snek-platform`: a real Convex Component that owns the platform-wide Convex tables. It is mounted by `packages/convex-host` via the `"./convex.config"` package export.

## Spec scope

- **`game-configuration`** (open change `migrate-game-configuration`) — the `games` table, its validation, preview/lock workflow, and launch freeze. Implemented.
- **Module 05** (`legacy-spec-archive/spec/05-convex-platform.md`) — the remaining platform schema, lifecycle orchestration, HTTP API, webhooks. Not yet implemented; binding until migrated.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — identity types. NOTE: per the identity change's local-install decision, the **auth tables live in the HOST schema** (`packages/convex-host/convex/schema.ts`), not in this component.

## Layout

| Path | What it is |
|------|------------|
| `component/convex.config.ts` | The component declaration (`defineComponent("snek-platform")`). Exported as `@cyphid/convex-snek-platform/convex.config`. |
| `component/schema.ts` | The component schema. Tables: **`games` only so far** — the record starts minimal (game-configuration/config-lives-on-the-game#the-game-record-starts-minimal); users, centaur_teams, rooms, replays, webhooks, etc. arrive with their own stories and extend this same component. |
| `component/games.ts` | The games function surface: `createGame`, `getGame` (redacted public read), `getGameInternal` (unredacted, platform orchestration only), `updateConfig`, `updateRoster`, `setBoardLock`, `launchGame`, `concludeWithoutLaunch`. Each loads the record, calls the pure state machine from `@cyphid/snek-game-configuration`, and persists the transition in the same transaction. Rejections are returned as `{ ok: false, rejection }` data, never thrown. |
| `component/_generated/` | **Committed** codegen output (regenerate with `pnpm codegen`). |
| `src/validators.ts` | Shape-only Convex validators (no ranges — bounds live in the pure layer's descriptors, per game-configuration/parameter-bounds-sourcing). Shared by the component schema and the host's arg declarations. |
| `src/mirror-guard.ts` | The mandatory mirror guard: `AssertExact` (engine's single assertion) over every validator-inferred type vs. `MirrorShape<engine type>`. Drift fails `tsc -b`. |
| `src/game-doc.ts` | Doc ↔ `ConfigRecordState` codec, the redacted `GamePublicView`, and the structured result types. |
| `src/hex.ts` | Seed bytes ↔ hex codec (seeds are stored hex-encoded and never returned publicly). |
| `src/index.ts` | Package exports plus typed skeletons for later stories' tables. |
| `tests/games.test.ts` | convex-test suite over the component functions (kept OUT of `component/` so the Convex bundler never ships tests). |

## Toolchain

- `pnpm typecheck` = `tsc -b` (src, builds `dist/`) + `tsc -p tsconfig.convex.json` (component/ + tests/, noEmit). Both are covered by root `pnpm typecheck`.
- `pnpm test` = vitest with `environment: "edge-runtime"` and `server.deps.inline: ["convex-test"]`. The convex-test module glob must include `component/_generated/` — that is how convex-test finds the module root.
- `pnpm codegen` delegates to the host's codegen (the offline recipe there regenerates this component's `_generated/` too). `_generated/` is committed; Biome ignores it (`**/_generated` in root `biome.json`).
- Component tests treat the component as a standalone app (`convexTest(schema, modules)`); host tests mount it with `t.registerComponent("snek-platform", ...)`.

## What does NOT go here

- Centaur-subsystem tables (`snake_config`, `drives`, etc.) — `packages/convex-centaur-state`.
- Auth wrappers, capability checks, HTTP endpoint routing, Better Auth tables — `packages/convex-host`.
- Parameter bounds as literal numbers — read the descriptor tables from `@cyphid/snek-engine` / `@cyphid/snek-game-configuration`; never restate a range in a validator.
