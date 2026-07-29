# migrate-game-configuration — Tasks

The capability spans a runtime-agnostic core (the parameter vocabulary and the
board generator) and a platform half (the configuration record, its
authoritative validation, the preview workflow, the launch freeze) that rests
on capabilities not yet built. Section 1 is the core, landed alongside
`revise-game-engine-contract` because that change is what took generation out of
the engine's contract: the requirements moving with no code to receive them
would leave the corpus describing a package layout that does not exist.

## 1. The capability's runtime-agnostic core

- [ ] 1.1 Mint `packages/game-configuration/` (`@cyphid/snek-game-configuration`), depending on the engine — the direction the capability graph already runs. Join the root `typecheck` / `lint` / `test` projects
- [ ] 1.2 Move the generator and its noise field out of `packages/engine/`, unchanged in behaviour: `boardgen.ts`, `perlin.ts` and their three suites, with every citation retargeted from `game-engine/*` to the `game-configuration/*` identifiers that now own them (`game-configuration/hazards`, `fertile-ground`, `starting-placement`, `initial-snakes`, `initial-food`, `board-generation-retry`, `generated-board-shape`)
- [ ] 1.3 Declare the configuration vocabulary as **exactly two disjoint halves**: this capability's generation parameters (`BoardGenerationConfig`, named for what they are rather than "orchestration"), and the engine's gameplay half by reference — `DEFAULT_GAME_CONFIG` reads `DEFAULT_RUNTIME_CONFIG` rather than restating a single bound (`game-configuration/closed-parameter-vocabulary`, `parameter-bounds-sourcing`)
- [ ] 1.4 `BoardGenerationFailure` moves with the generator: generation stays all-or-nothing, and an infeasible parameter set yields the failure rather than a board of the generator's own choosing (`game-configuration/board-generation-retry`, `infeasibility-surfaced`)
- [ ] 1.5 Point every consumer at the one shared generator — the visual tester's session factory is the only caller today, and it calls rather than copies (`global-invariants/one-shared-generation`)
- [ ] 1.6 Replace the engine property suite's dependency on generation with drawn initial states, deliberately harsher than a generated board, and record why in `packages/engine/src/arbitraries.ts` (a green run over a *narrower* generator is not evidence)
- [ ] 1.7 An integration test that generates a board and plays it to a deterministic conclusion through the engine — the seam this package exists to hold

## 2. The platform half

- [ ] 2.1 Review this change's artifacts with the author immediately before the platform half begins, and refine this task breakdown then
- [ ] 2.2 The configuration record on the game, in the single persistent deployment, with authoritative validation at the record and the mirror guard over the gameplay half (`config-lives-on-the-game`, `closed-parameter-vocabulary`, `engine-schema-fidelity`, `bounded-game-duration`)
- [ ] 2.3 The board-preview workflow, its lock-in, the launch freeze, and the self-contained configuration surface (`board-preview`, `board-preview-lock-in`, `launch-freeze`, `self-contained-configuration-surface`, `host-selected-affordances`)
- [ ] 2.4 Add `// spec:` citations in the code written for it, and `// design:` references where this change's design rationale warrants them
- [ ] 2.5 Run `pnpm spec:check` and the full battery with the implementation

## Archive

- [ ] 3.1 On explicit author instruction, `pnpm spec:fold migrate-game-configuration` then `openspec archive --skip-specs -y migrate-game-configuration` at the tail of the PR that completes the implementation (fold enforces capability-dependency order)
- [ ] 3.2 Add the minted capability to `openspec/config.yaml`'s context capability list
- [ ] 3.3 Run `pnpm spec:check` after archiving
