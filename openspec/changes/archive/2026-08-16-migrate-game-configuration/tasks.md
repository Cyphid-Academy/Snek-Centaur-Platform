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

- [x] 2.1 Task breakdown refined at implementation start, under the author's standing instruction for this branch to proceed without per-step review; the refined structure is tasks 2.2–2.7 below
- [x] 2.2 Both halves of the parameter vocabulary published as one reflectable descriptor declaration each — the engine's gameplay descriptors (the export this change's design requests of the engine) and this capability's generation descriptors — with the test-suite range tables deriving from them (`parameter-bounds-sourcing`, `generation-parameters`)
- [x] 2.3 The configuration record's rules as one pure state machine in `packages/game-configuration/src/record.ts` — descriptor-sourced validation, the bounded-duration record condition, the edit window with the never-launched ending, the one preview slot, the lock with its generation-inputs clearing trigger, and launch (`closed-parameter-vocabulary`, `bounded-game-duration`, `launch-freeze`, `conditional-parameter-semantics`, `board-generation-retry`)
- [x] 2.4 The record in the single persistent deployment: the Convex SDK installed, `packages/convex-snek-platform` a real component holding the minimal `games` table, mutations applying the pure state machine inside the serializable transaction, the one-game-per-room exclusivity guard, the engine-schema mirror guard via the shared assertion, and seed plus hidden starting state stripped from every client read (`config-lives-on-the-game`, `engine-schema-fidelity`, `generation-parameter-boundary`, `board-preview`, `board-preview-lock-in`, `infeasibility-surfaced`)
- [x] 2.5 The self-contained configuration surface in the one application, mounted per the shell's contract with the three independently selectable affordance kinds, widgets driven by the descriptor tables, the preview rendered through the one board rendering, and the standalone dev delivery behind a binding backed by the pure state machine (`self-contained-configuration-surface`, `host-selected-affordances`, `board-preview`)
- [x] 2.6 `// spec:` citations across the code written for the platform half
- [x] 2.7 `pnpm spec:check` and the full battery green with the implementation

## Archive

- [x] 3.1 On explicit author instruction, `pnpm spec:fold migrate-game-configuration` then `openspec archive --skip-specs -y migrate-game-configuration` at the tail of the PR that completes the implementation (fold enforces capability-dependency order)
- [x] 3.2 Add the minted capability to `openspec/config.yaml`'s context capability list
- [x] 3.3 Run `pnpm spec:check` after archiving
