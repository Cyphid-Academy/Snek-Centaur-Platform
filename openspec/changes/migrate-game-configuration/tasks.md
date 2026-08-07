# migrate-game-configuration — Tasks

The capability spans a runtime-agnostic core (the parameter vocabulary and the
board generator) and a platform half (the configuration record, its
authoritative validation, the preview workflow, the launch freeze) that rests
on capabilities not yet built. Section 1 is the core, landed alongside
`revise-game-engine-contract` because that change is what took generation out of
the engine's contract: the requirements moving with no code to receive them
would leave the corpus describing a package layout that does not exist.

## 1. The capability's runtime-agnostic core

- [x] 1.1 Mint `packages/game-configuration/` (`@cyphid/snek-game-configuration`), depending on the engine — the direction the capability graph already runs. Join the root `typecheck` / `lint` / `test` projects
- [x] 1.2 Move the generator and its noise field out of `packages/engine/`, unchanged in behaviour: `boardgen.ts`, `perlin.ts` and their three suites, with every citation retargeted from `game-engine/*` to the `game-configuration/*` identifiers that now own them (`game-configuration/hazards`, `fertile-ground`, `starting-placement`, `initial-snakes`, `initial-food`, `board-generation-retry`, `generated-board-shape`)
- [x] 1.3 Declare the configuration vocabulary as **exactly two disjoint halves**: this capability's generation parameters (`BoardGenerationConfig`, named for what they are rather than "orchestration"), and the engine's gameplay half by reference — `DEFAULT_GAME_CONFIG` reads `DEFAULT_RUNTIME_CONFIG` rather than restating a single bound (`game-configuration/closed-parameter-vocabulary`, `parameter-bounds-sourcing`)
- [x] 1.4 `BoardGenerationFailure` moves with the generator: generation stays all-or-nothing, and an infeasible parameter set yields the failure rather than a board of the generator's own choosing (`game-configuration/board-generation-retry`, `infeasibility-surfaced`)
- [x] 1.5 Point every consumer at the one shared generator — the visual tester's session factory is the only caller today, and it calls rather than copies (`global-invariants/one-shared-generation`)
- [x] 1.6 Replace the engine property suite's dependency on generation with drawn initial states, deliberately harsher than a generated board, and record why in `packages/engine/src/arbitraries.ts` (a green run over a *narrower* generator is not evidence)
- [x] 1.7 An integration test that generates a board and plays it to a deterministic conclusion through the engine — the seam this package exists to hold

## 2. The platform half

- [x] 2.1 Review this change's artifacts with the author immediately before the platform half begins, and refine this task breakdown then (done 2026-08-07, in the planning round that also settled `mint-application-shell`'s Q-A/Q-B; the refinement is tasks 2.2–2.8 below)
- [ ] 2.2 The engine-side gameplay parameter descriptor the bounds decision requested: a public, reflectable data export in `packages/engine` — per parameter its path in the config tree, range, default and disable sentinel — with the test-only ranges table derived from it rather than kept beside it (`parameter-bounds-sourcing`)
- [ ] 2.3 The configuration record on the game, in the single persistent deployment: the minimal record established with identity plus the two config subtrees, authoritative validation at the record sourcing gameplay bounds from the engine descriptor and generation bounds from this capability's own declaration, the mirror guard over the gameplay half, and the in-transaction duration cross-field check (`config-lives-on-the-game`, `closed-parameter-vocabulary`, `engine-schema-fidelity`, `parameter-bounds-sourcing`, `bounded-game-duration`, `conditional-parameter-semantics`)
- [ ] 2.4 The board-preview workflow platform-side: the single current-preview slot overwritten by each regeneration and delivered reactively, the seed reaching no client, the boolean lock cleared in the same transaction as any change to generation inputs, structured infeasibility on the record, and the launch freeze as an edit-window guard on the game's status (`board-preview`, `board-preview-lock-in`, `launch-freeze`, `infeasibility-surfaced`, `generation-parameter-boundary`)
- [ ] 2.5 The self-contained configuration surface in the unified application: the three affordance kinds as independent mount parameters, widget limits read from the same declarations the validator reads, the preview rendered through the shared board rendering, and a standalone development mount offering every kind with nothing gating it (`self-contained-configuration-surface`, `host-selected-affordances`)
- [ ] 2.6 Add `// spec:` citations in the code written for it, and `// design:` references where this change's design rationale warrants them
- [ ] 2.7 Run `pnpm spec:check` and the full battery with the implementation
- [ ] 2.8 Author review of the implemented platform half

## Archive

- [ ] 3.1 On explicit author instruction, `pnpm spec:fold migrate-game-configuration` then `openspec archive --skip-specs -y migrate-game-configuration` at the tail of the PR that completes the implementation (fold enforces capability-dependency order)
- [ ] 3.2 Add the minted capability to `openspec/config.yaml`'s context capability list
- [ ] 3.3 Run `pnpm spec:check` after archiving
