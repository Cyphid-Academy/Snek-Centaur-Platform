# mint-application-shell — Tasks

Planned 2026-08-07 with the author, alongside the Q-A/Q-B decisions recorded in
proposal.md. The spec work (delta, counterpart edits, maps, graph) is complete;
these tasks are the implementation. The unified web application is
`apps/centaur-server-reference` — the forkable app every Centaur Server serves
(`application-shell/unified-web-application`,
`centaur-server-runtime/forkable-reference-app`) — and the shared
infrastructure lands in a package it consumes.

## 1. The substrate package

- [x] 1.1 Mint `packages/app-shell` (`@cyphid/snek-app-shell`), a Svelte 5
  library the application consumes as built output. Register it in the
  workspace per root AGENTS.md: package map, `build:packages` chain, root
  `test` / `typecheck` scripts, `svelte-check --fail-on-warnings`
- [x] 1.2 The mounting contract: mode and affordances as explicit mount
  parameters, with no API in the package for a surface to resolve an actor,
  read a session, or consult an access rule
  (`application-shell/surface-mounting-contract`)
- [x] 1.3 The one state binding: a reactive read surface with connection
  status, a mutable extension whose mutation record is a property of the
  binding's type, and a read-only binding that has no mutation to express; a
  live implementation over the Convex reactive client and a fixture
  implementation for tests and standalone mounts
  (`application-shell/one-state-binding`)
- [x] 1.4 The one board rendering: `BoardView` and its snake-silhouette child
  move from `apps/visual-tester` into the package unchanged in behaviour, with
  editor-specific diagnostics decoupled so the tester composes them over the
  shared component rather than the component carrying them
  (`application-shell/one-board-rendering`)
- [x] 1.5 Repoint `apps/visual-tester` at the shared renderer — the Q-B plan
  item: the spec does not bind the dev tool, but exactly one rendering exists
  in the repository
- [x] 1.6 The navigation shell in `apps/centaur-server-reference` — the
  mechanism task the design deliberately kept out of the spec: a root layout
  that mounts surfaces, leaving every view's content to the capability that
  owns it (`application-shell/unified-web-application`)
- [x] 1.7 Add `// spec:` citations in the code written for this change, and
  `// design:` references where this change's design rationale warrants them
- [x] 1.8 Run `pnpm spec:check` and the full battery with the implementation
- [ ] 1.9 Author review of the implemented shell

## Archive

- [ ] 2.1 On explicit author instruction, `pnpm spec:fold mint-application-shell`
  then `openspec archive --skip-specs -y mint-application-shell` at the tail of
  the PR that completes the implementation (fold enforces capability-dependency
  order)
- [ ] 2.2 Add the minted capability to `openspec/config.yaml`'s context
  capability list
- [ ] 2.3 Run `pnpm spec:check` after archiving
