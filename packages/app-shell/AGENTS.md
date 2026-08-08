# Agent Context — packages/app-shell

`@cyphid/snek-app-shell` is the **application shell**: the infrastructure every
surface of the one web application shares. It holds no surface of its own.

## Spec scope

- `openspec/changes/mint-application-shell/specs/application-shell/spec.md`
  (until archived) — all four requirements are discharged here or, for
  `unified-web-application`, in the app that consumes this package.

## What belongs here, and what does not

A thing belongs in this package iff it is a promise the application makes to
**every** surface — discharged once, reading identically for a surface nobody
has designed yet. Three such promises exist today:

- `mounting.ts` — the contract a surface is written to: its mode and its
  affordances as explicit parameters. **Nothing that resolves an actor, a
  session, or an access rule may be added here**; the contract is enforced by
  what this module does not offer, so an addition is how it would be lost.
- `binding.ts` — the one state binding. `StateBinding` reads; `MutableBinding`
  is the one with mutations, so a read-only mounting is read-only by having
  nothing to call. Two implementations: `convexBinding` (a live `ConvexClient`
  subscription — the repo's one reactive read) and `fixtureBinding` (in-memory,
  for tests and standalone mounts). A third implementation belongs beside them
  in that module, not in a consumer.
- `BoardView.svelte` (+ `SnakeBody.svelte`, `snakeBodyPath.ts`) — the one board
  rendering. A surface adds to it through the `banner` and `overlay` snippets;
  a surface that renders a board of its own has forked the board. The visual
  tester's contiguity diagnostics are the worked example
  (`apps/visual-tester/src/lib/components/BoardPanel.svelte`) — tool-specific
  wording composed over a shared rendering that draws a degenerate body safely
  on its own.

A view, a workflow, or anything naming an actor belongs to the capability that
owns that story, in `apps/centaur-server-reference/src/lib/surfaces/`.

## Build and check

Not a `tsc` project — it ships `.svelte`, so `tsc -b` cannot see it:

- `pnpm --filter @cyphid/snek-app-shell build` → `svelte-package -i src/lib -o dist`.
  Chained after `tsc -b` in the root `build:packages`; consumers resolve `dist/`.
- `typecheck` is `svelte-check` with this package's own `tsconfig.json` (no
  `svelte-kit sync` — there is no SvelteKit here) and `--fail-on-warnings`.
- Tests live in `src/` **outside** `src/lib`, so `svelte-package` does not
  publish them. One vitest project, discovered by the root config; component
  tests are `*.browser.test.ts` and need the `svelte` plugin plus the `browser`
  resolve condition already in `vitest.config.ts`.
