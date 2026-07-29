# Implementation plan — add-generated-board-sessions

Scope: one requirement and a Purpose amendment on `visual-tester`, plus the
code work that closes the gap between the requirement and the generation path
the tool already has. Nothing here builds a generator — the point of the
requirement is that the tool never grows one.

## 1. Spec

- [ ] 1.1 Confirm the delta is Purpose-plus-ADDED only and needs no seed/edit pair for its requirement, while the `## MODIFIED Purpose` does: `pnpm exec openspec validate add-generated-board-sessions --strict` and `pnpm spec:freshness` (visual-tester/generated-board-sessions)
- [ ] 1.2 Confirm `revise-game-engine-contract`'s `visual-tester` delta stays `## MODIFIED Requirements` only, since the two-open-changes-one-Purpose rule is what makes this change's Purpose amendment ordinary — a Purpose block reappearing there breaks both changes at once (visual-tester/generated-board-sessions)
- [ ] 1.3 Confirm the fold order this change assumes, and that the engine change is unaffected by it: `visual-tester` moves to depth 4 only through *this* folder, so `revise-game-engine-contract` still folds first and the board-generation move stays remove-then-add with no interval in which generation is specified twice (seams: `migrate-game-configuration`, `mint-platform-persistence`)

## 2. Generation as a second board source in the tool (`apps/visual-tester/`)

The tool's two ways of obtaining a starting board are both first class: hand-authoring, which it has always had, and running the platform's own generator over parameters and a seed, which it has quietly had in code and never in spec.

- [ ] 2.1 Confirm before touching anything that the existing path calls the one shared implementation rather than a copy of it: `apps/visual-tester/src/lib/factory.ts` invokes the generator the engine package exports and `store.svelte.ts` starts a session on what it returns, so this section states a contract the code partly satisfies already and closes the gaps below (visual-tester/generated-board-sessions, global-invariants/one-shared-generation, global-invariants/one-shared-generation#preview-and-launch-are-one-implementation)
- [ ] 2.2 Let the seed be supplied, not only drawn: the generation path draws a fresh random seed on every invocation today, so the same parameters and seed can never be re-run and the determinism this requirement promises is unobservable from inside the tool — which is the one place a tester would go to check it. Show the seed that produced the board on screen, accept one back, and test that a re-run reproduces the board rather than merely a board of the same shape (visual-tester/generated-board-sessions#same-parameters-and-seed-same-board, game-configuration/board-generation-retry#reproducible-retries)
- [ ] 2.3 Read the generation parameters' ranges and defaults from the declaration that owns them instead of re-typing them in the tool's panel — `game-configuration/generation-parameters` is the sole declaration and `game-configuration/parameter-bounds-sourcing` is the rule that a bound is never a second set of numbers; a tester's widget disagreeing with the platform's is exactly the drift this tool exists to catch, so it must not be a drift the tool itself introduces (visual-tester/generated-board-sessions, game-configuration/generation-parameters)
- [ ] 2.4 Reconcile the teams a generated board is produced for with the teams the session is configured with: the generation path names two default teams of its own today, so a board generated for a differently configured roster arrives needing reconciliation the tool then has to perform. Decide with the author whether the configured teams drive generation or generation's teams adopt the configuration, and make one of them true (visual-tester/generated-board-sessions#generation-is-a-session-source, visual-tester/team-configuration)
- [ ] 2.5 Cover the decline path as a first-class outcome rather than a UI nicety — an infeasible parameter set leaves the current session exactly as it was, names the constraint that failed, and never substitutes a board — since a tool that silently swapped in a board of its own would be reporting on something other than what the tester asked for (visual-tester/generated-board-sessions#declined-generation-changes-nothing, game-configuration/board-generation-retry#infeasible-configuration)

**Deferred, and stated here so the end state is not lost** (not this change's work):

- [ ] 2.6 Aim at a common board-generation component — configuration parameters and a seed in, a deterministic board out — that every surface needing a board embeds, this tool included, so the tester's generation panel and the platform's board preview are one component rather than two callers that happen to agree today. The requirement is deliberately worded to be satisfied by calling the shared implementation however it is packaged now, so this lands whenever the generation extraction planned in `revise-game-engine-contract` §12 does, and re-opens no spec (visual-tester/generated-board-sessions, global-invariants/one-shared-generation#a-local-preview-is-a-second-implementation, game-configuration/board-preview)

## 3. Verification

- [ ] 3.1 Test the parity claim directly rather than assuming it: a generated board and a hand-authored one produce sessions that behave identically under staging, simulation, scrubbing, autosave and promotion to a fixture, and a generated board survives being edited into a state generation would never produce (visual-tester/generated-board-sessions#generation-is-a-session-source, visual-tester/generated-board-sessions#a-generated-board-is-editable, visual-tester/generated-board-sessions#hand-authoring-needs-no-generator, visual-tester/board-editor#arbitrary-states-allowed)
- [ ] 3.2 Add `// spec:` citations on the generation path in `apps/visual-tester/`, and a `// design:` reference where the one-implementation instinct is easiest to reverse — the moment someone reaches for a local generator to drop the dependency
- [ ] 3.3 Run `pnpm spec:check` and the full battery (`pnpm lint`, `pnpm typecheck`, `pnpm test`) with the implementation

## Archive

- [ ] 4.1 On explicit author instruction, `pnpm spec:fold add-generated-board-sessions` then `openspec archive --skip-specs -y add-generated-board-sessions`. This change folds **last** of the board-generation set: `migrate-game-configuration` and `mint-platform-persistence` must archive before it, and `migrate-game-configuration` in turn follows `mint-application-shell`. It folds only `visual-tester`, so no other change waits on it
- [ ] 4.2 Re-run `pnpm spec:freshness` for the Purpose seed/edit pair immediately before folding
- [ ] 4.3 Run `pnpm spec:check` after archiving — no `openspec/config.yaml` capability-list edit is owed, since `visual-tester` is already in it
