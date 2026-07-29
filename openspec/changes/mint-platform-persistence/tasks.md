# mint-platform-persistence — Tasks

## 1. Pre-implementation & seam gates

- [ ] 1.1 Review this change's artifacts with the author immediately before implementation begins, and refine this task breakdown then. Q-A — whether a three-requirement capability is worth minting at all — is the first thing to settle, since declining it retains only the `global-invariants` delta
- [ ] 1.2 Seam gate — capabilities that must be implemented or agreed first, and which archive before this change: `global-invariants` alone. This capability is deliberately upstream of every capability that stores anything
- [ ] 1.3 Confirm the runtime home this plan assumes: every requirement here is realised in the one Convex deployment — `packages/convex-host`, `packages/convex-snek-platform`, `packages/convex-centaur-state` — with no SpacetimeDB and no hosting-server code in scope. The two `global-invariants` requirements this change mints are the exception: one binds every runtime holding a mirror of an engine type, the other every place a board is generated — including the visual tester, which is not a runtime at all

## 2. Bootstrap (the deliverable no capability owned)

- [ ] 2.1 Install the Convex SDK and stand the deployment up: `convex-host` mounting both components, replacing the three placeholder `schema.ts` with real definitions, with `pnpm dev` and a deploy path that work from a clean clone
- [ ] 2.2 Record the durable setup in `.claude/hooks/session-start.sh` and the relevant `AGENTS.md` if anything beyond a plain `pnpm install` is needed — a build-script approval, a generated-file step, a local dev deployment
- [ ] 2.3 Document the environment variables the deployment reads as a startup validation step that fails loudly and names any missing variable — the project's stated substitute for a `.env.example` (see `CLAUDE.md`)

## 3. Component boundaries

- [ ] 3.1 Define each component's own function surface and make its tables unreachable from outside it: no query, mutation, scheduled job, or migration outside a component touches its tables (`platform-persistence/component-boundaries`, `#a-table-has-one-reachable-owner`)
- [ ] 3.2 Keep the host to the public surface, the authentication wrappers and the capability declarations, holding no table that restates a component's (`platform-persistence/component-boundaries#the-host-adds-authority-not-storage`)
- [ ] 3.3 Add a test that a rule relating records in two components is enforced inside one transaction, so the boundary is demonstrably an access rule rather than a consistency boundary (`platform-persistence/component-boundaries#the-boundary-costs-no-atomicity`)

## 4. The access path

- [ ] 4.1 Wire generated function references into every caller — the web application, the server library, and any test harness — and make the generation part of the build rather than a checked-in artifact (`platform-persistence/generated-access-path`)
- [ ] 4.2 Add a test that changing a function's arguments breaks the callers' build, and a lint that no string-addressed call path exists alongside the generated one (`platform-persistence/generated-access-path#a-broken-caller-fails-to-build`, `#no-second-call-path`)

## 5. Schema change

- [ ] 5.1 Adopt and document the expand-migrate-contract rollout: add before write, write before read, remove only once nothing reads (`platform-persistence/schema-change-rollout`)
- [ ] 5.2 Exercise it once for real on a non-trivial shape and test the midway state — some records old, some new — with every deployed reader handling both (`platform-persistence/schema-change-rollout#no-step-breaks-a-reader`, `#removal-is-the-last-step`)

## 6. The two `global-invariants` requirements this change mints

- [ ] 6.1 Write the one shared exact-type-equality assertion — the conditional-type identity trick, **not** mutual `extends`, which is blind to `readonly` modifiers and to the excess-field direction — and place it where every mirror site can consume it. **Seam:** if `revise-game-engine-contract` needs it before this change lands, that plan takes this task and this one drops it (`global-invariants/engine-mirrors-are-guarded#one-assertion-every-site`)
- [ ] 6.2 Apply it at every existing mirror site: the Convex configuration validator, the Zod schema and field-by-field encoder in `apps/visual-tester/src/lib/test-sequences/`, and the type in `packages/stdb` (`global-invariants/engine-mirrors-are-guarded`)
- [ ] 6.3 Prove the guard bites in the way the naive idiom does not: a mirror differing from the engine's type only in `readonly`-ness must fail, and so must a field added, renamed, retyped, or moved (`global-invariants/engine-mirrors-are-guarded#drift-fails-the-build`, `#modifier-only-divergence-is-divergence`)

- [ ] 6.4 Give board generation exactly one reachable entry point and route every caller through it: the preview regeneration, the launch path that produces the board an unlocked game starts on, and the visual tester's session seeding (`apps/visual-tester/src/lib/factory.ts`, which already calls the production generator). The algorithm ships today from `packages/engine/src/boardgen.ts` and relocates to a shared package in a later PR — nothing here depends on which package hosts it, only on there being one (`global-invariants/one-shared-generation`, `global-invariants/one-shared-generation#preview-and-launch-are-one-implementation`)
- [ ] 6.5 Add the check that bites on the tempting violation rather than on the obvious one: no surface bundles or reimplements a generation stage of its own, including for a preview that redraws without a round trip — a location rule alone would miss a second generator that runs server-side. In the same pass pin the carve-out with a test, so the guard cannot be tightened later into one that fails an editor, a fixture, or a board arbitrary (`global-invariants/one-shared-generation#a-local-preview-is-a-second-implementation`, `global-invariants/one-shared-generation#authoring-a-board-is-not-generating-one`)

## 7. Spec hygiene and verification

- [ ] 7.1 Add `// spec:` citations across the deployment as the placeholders become definitions, and `// design:` references where this change's rationale warrants them (why the boundary costs no atomicity, why the mirror assertion is not mutual `extends`)
- [ ] 7.2 Run `pnpm spec:check` and the full battery (`pnpm lint`, `pnpm typecheck`, `pnpm test`)
- [ ] 7.3 Verification specific to this change: the cross-component transaction test, the broken-caller build failure, the midway-rollout read test, and the `readonly`-divergence guard test

## Archive

- [ ] 8.1 On explicit author instruction, `pnpm spec:fold mint-platform-persistence` then `openspec archive --skip-specs -y mint-platform-persistence` at the tail of the PR that completes the implementation (fold enforces capability-dependency order: this change archives before `migrate-game-configuration` and `migrate-platform-integrations`)
- [ ] 8.2 Add `platform-persistence` to `openspec/config.yaml`'s context capability list
- [ ] 8.3 Run `pnpm spec:check` after archiving
