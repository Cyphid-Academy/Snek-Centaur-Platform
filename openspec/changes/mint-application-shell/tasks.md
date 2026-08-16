# mint-application-shell — Tasks

## 1. The one state binding

- [x] 1.1 `apps/centaur-server-reference/src/lib/shell/binding.svelte.ts` —
      `StateBinding`/`MutableBinding`, `fixtureBinding`, `bindingFromSource`,
      `mutableBinding` (`application-shell/one-state-binding`,
      `#a-surface-does-not-know-its-source`, `#absence-not-refusal`,
      `#loss-is-the-bindings-to-report`)
- [x] 1.2 Unit tests: a fixture binding delivers its value and stays
      connected; a source-backed binding updates reactively and reports loss
      through `status` rather than clearing `value`; a type-level check that
      a plain `StateBinding` has no `mutations` member
      (`src/lib/shell/binding.test.ts`)

## 2. The one board rendering

- [x] 2.1 `apps/centaur-server-reference/src/lib/board/BoardView.svelte` —
      terrain from `CellType`, items from `state.items`, snakes from
      `state.snakes` drawn as a stroked centerline path with a distinct head
      marker, respecting `alive`; an `overlay` snippet composing above the
      board in the same coordinate frame
      (`application-shell/one-board-rendering`, `#one-board-everywhere`,
      `#a-rendering-rule-is-stated-once`, `#composition-not-replacement`)
- [x] 2.2 Add `@cyphid/snek-engine` and `@cyphid/snek-game-configuration` as
      workspace dependencies of `apps/centaur-server-reference`; note both in
      the app's `AGENTS.md` as dependencies the (future) mirror workflow's
      rewrite step must handle, alongside `snek-centaur-server-lib`
- [x] 2.3 Component tests: cell count and terrain classes for an
      engine-built `GameState` fixture, a path drawn for a live snake and
      none for a dead one, click-through to `onCellClick`, and overlay-snippet
      composition (`src/lib/board/BoardView.browser.test.ts`)

## 3. The surface mounting contract

- [x] 3.1 `apps/centaur-server-reference/src/lib/shell/mounting.ts` —
      `SurfaceMount<A>`, documented as the convention every surface (starting
      with the game-configuration surface) is written to: mode and
      affordances as explicit mounting parameters, no derived actor, no held
      access rule, no consulted notion of who is present
      (`application-shell/surface-mounting-contract`,
      `#one-surface-every-mode`, `#the-host-states-what-is-offered`,
      `#hiding-is-not-enforcing`)
- [x] 3.2 Publish the shell's and board's public surface
      (`src/lib/shell/index.ts`, `src/lib/board/index.ts`)

## 4. Unified web application

- [x] 4.1 No new mechanism: `apps/centaur-server-reference` already is the
      one application every server serves. Update the landing page to state
      the fact and point at where the shared infrastructure lives
      (`application-shell/unified-web-application`)

## 5. Test harness and validation

- [x] 5.1 Fix `apps/centaur-server-reference/vitest.config.ts`, which
      imported a non-existent `sveltekit` export from
      `@sveltejs/vite-plugin-svelte`: replaced with the visual-tester
      two-project pattern (a `logic` project on `sveltekit()` + jsdom, a
      `components` project on bare `svelte()` with the `browser` resolve
      condition); added `jsdom` to the app's devDependencies
- [x] 5.2 Pin the app's `vitest` devDependency to `^3.2.4` (matching root and
      `visual-tester`) — the prior `"*"` specifier let pnpm resolve a stray
      `2.1.9` for this importer alone, under which `$state` in `.svelte.ts`
      and `.svelte` component parsing both silently failed
- [x] 5.3 Extend the root `test` script to run
      `pnpm --filter @cyphid/centaur-server-reference test` after the
      `visual-tester` run, so the app's suite is part of the workspace
      battery
- [x] 5.4 Run `pnpm install`, `pnpm build:packages`,
      `pnpm --filter @cyphid/centaur-server-reference test`, `pnpm lint`,
      `pnpm typecheck`, `pnpm test`, `pnpm spec:check`, `pnpm smoke`

The dev tool's reuse of the shared renderer (design.md decision 6, Open
Question Q-B) is deliberately not a task of this change: `visual-tester` is a
separate application outside this capability's scope, and sharing the
component would first mean extracting it into a package — a change of its
own, to be proposed once someone wants it. The under-reach stays recorded in
design.md rather than as a task this plan can never complete.

## Archive

- [ ] 6.1 On explicit author instruction, `pnpm spec:fold
      mint-application-shell` then `openspec archive --skip-specs -y
      mint-application-shell` at the tail of the PR that completes the
      implementation (fold enforces capability-dependency order)
- [ ] 6.2 Add the minted capability to `openspec/config.yaml`'s context
      capability list
- [ ] 6.3 Run `pnpm spec:check` after archiving
