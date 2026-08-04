# Agent Context — packages/convex-snek-platform

This package is `@cyphid/convex-snek-platform`: a Convex Component that owns the platform-wide Convex tables. It is imported and mounted by `packages/convex-host`.

## Spec scope

- **Module 05** (`legacy-spec-archive/spec/05-convex-platform.md`) — platform schema, game lifecycle orchestration, HTTP API, webhooks.
- **Module 03** (`legacy-spec-archive/spec/03-auth-and-identity.md`) — identity types, Google sign-in, credential issuance.

## What goes here

- Convex schema for: `users`, `user_credential_links`, `centaur_teams`, `centaur_team_members`, `team_homing`, `game_teams`, `rooms`, `games`, `replays`, `trusted_issuers`, `accepted_assertions`, `webhooks`.
- Convex Component configuration (`convex/convex.config.ts`).
- Platform functions (queries, mutations, actions) for game lifecycle.
- Game-invitation delivery (a bare wake notification carrying no credential).
- The homing inbox query, scoped to the authenticated server's own domain.
- Webhook delivery (at-least-once).

## What does NOT go here

- Centaur-subsystem tables (`snake_config`, `drives`, etc.) — those are in `packages/convex-centaur-state`.
- Auth wrappers or HTTP API endpoint routing — those belong in `packages/convex-host`.

## Implementation notes

This is a Convex Component, not a full Convex deployment. It is mounted by `convex-host` via `convex/convex.config.ts`. Its tables are isolated and accessed through the component's exported functions. See Convex Component docs for the isolation model.

The component name in `convex/convex.config.ts` is **camelCase** (`snekPlatform`) even though the package and directory are hyphenated: the name becomes a property on the host's `components` object in generated code and has to be a valid JS identifier.

**Two halves, and only one is in `tsc -b`.** `src/` holds the hand-authored record interfaces and compiles under the workspace's strict settings. `convex/` — `convex.config.ts`, `schema.ts`, `functions.ts`, `_generated/` — is bundled by Convex and checked separately via `tsconfig.convex.json` (`pnpm typecheck:convex`), because Convex's generated code is not written for `exactOptionalPropertyTypes` / `noUncheckedIndexedAccess` / `verbatimModuleSyntax`.

**Everything Convex is under `convex/`, and it has to stay that way.** A component's root is wherever its `convex.config.ts` sits, and Convex treats *every* JS/TS module below that root as part of the component's function surface — it does not skip build output. With these files at the package root, `dist/` was picked up too, so `_generated/api.ts` gained `dist/index` and `dist/componentConfig` entries whenever someone ran `tsc -b` before `pnpm dev:convex`, and lost them otherwise: a committed generated file that changed depending on build order. The subdirectory is what makes it deterministic. Do not move a Convex file up to the package root, and do not point an `outDir` inside `convex/`.

The interfaces in `src/index.ts` and the validators in `convex/schema.ts` are two halves of one contract — compile-time and runtime. Change them together.

**A table arrives with the capability change that fixes its fields, never in advance.** A `defineTable` is not a note about intended state; it is a schema the deployment agrees to and validates every write against. `convex/schema.ts` was empty until `migrate-identity-and-authorization` landed, and what it holds now is exactly that change's own records — `trusted_issuers`, `accepted_assertions`, `sign_in_handoffs`, `platform_admins`, and `system_actions`, the attribution a user is shown — plus a deliberately partial `games` and `centaur_teams` carrying **only the fields identity reads** (`status`, `roster`, `serverDomain`). Those two are commented as owned elsewhere: `migrate-game-lifecycle` and `migrate-team-management` grow them, they do not replace them, and no behaviour on top of them belongs here yet. `users` still does not exist; it arrives with `migrate-accounts-and-profiles`.

The same discipline governs `functions.ts`. Its functions are thin — read an index, write a row — and carry **no authorization logic**: a rule about who may call something is the host's, stated at the public function. The two single-use guards (`claimAssertionId`, `redeemHandoff`) read their index and write in the *same* mutation on purpose, so the read joins the transaction's read set and a concurrent claim invalidates one of the two rather than both succeeding.

**A registered system's call bound is no longer counted here.** It was `recordSystemCall`, the same read-and-write-in-one-mutation shape over a count instead of a uniqueness; it is now `@convex-dev/rate-limiter`, a component the host mounts, and `system_call_windows` is gone with it. What stayed is `recordAttribution`, which is not a count but a record a human is later shown — the host calls it only on the path the bound admits, so a refused call still leaves no record of an action nobody took. Should a future bound want counting of its own, the argument for putting it in a mutation beside the thing it guards is unchanged; what changed is that this particular count had a maintained component behind it.

Better Auth's tables are **not** here. They live in that component's own component, mounted alongside this one by the host.

`convex/_generated/` is **committed**: CI has no deploy key and `pnpm typecheck` must not depend on regenerating it. Re-run `pnpm dev:convex` after a schema or signature change and commit the result.

## Key files

- `src/index.ts` — hand-authored record interfaces (the compile-time contract)
- `convex/schema.ts` — table definitions (the runtime contract; a table lands with the change that fixes its fields)
- `convex/functions.ts` — the component's function surface, reachable only via the host, and carrying no authorization rule of its own
- `legacy-spec-archive/spec/05-convex-platform.md` — binding source of truth
- `legacy-spec-archive/spec/03-auth-and-identity.md` — auth and identity context
