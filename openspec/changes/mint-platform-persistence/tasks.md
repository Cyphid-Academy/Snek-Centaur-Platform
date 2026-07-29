# mint-platform-persistence — Tasks

## 1. Pre-implementation & seam gates

- [ ] 1.1 Review this change's artifacts with the author immediately before implementation begins, and refine this task breakdown then. Q-A — whether a three-requirement capability is worth minting at all — is the first thing to settle, and its cost has moved since it was written: declining now means re-seeding `migrate-platform-integrations`' Purpose and the `platform-persistence` declaration on `platform-integrations/functions-are-the-api`, regenerating the graph, and re-homing §2's bootstrap in a capability that folds after some of the capabilities needing it. Both `global-invariants` requirements survive either answer, so §6 is unaffected either way
- [ ] 1.2 Seam gate — nothing needs to archive before this change: `global-invariants` alone is declared and it is folded. What is blocked *on* it: `migrate-game-configuration` and `add-generated-board-sessions` (both declare the two `global-invariants` requirements minted here) and `migrate-platform-integrations` (declares the capability). Note that the ordering which actually binds is §2's and the graph does not express it — every Convex-hosted capability needs the bootstrap whether or not it declares this one
- [ ] 1.3 Confirm the runtime home this plan assumes: §2–§5 are realised in the one Convex deployment — `packages/convex-host`, `packages/convex-snek-platform`, `packages/convex-centaur-state` — with no SpacetimeDB and no hosting-server code in scope. §6 is the exception and is deliberately outside it: one of the two `global-invariants` requirements binds every runtime holding a mirror of an engine type, the other every place a board is generated — including the visual tester, which is not a runtime at all

## 2. Bootstrap (the deliverable no capability owned)

Contested, so settle it before writing code: `migrate-game-configuration` §1.2, `migrate-identity-and-authorization` §1.3 and `migrate-game-lifecycle` §1.5 each currently claim the Convex SDK install, and `migrate-bot-configuration`, `migrate-team-management`, `migrate-operator-control` and `migrate-tournaments` each open with a task asking who owns it. Folding before every Convex consumer is the whole practical argument for this capability, so the bootstrap lands here and those plans consume it rather than re-land it. What it deliberately does **not** include: any table — every table arrives with the capability that owns the record — and any choice of auth library, which is `migrate-identity-and-authorization`'s even though the host is where its wrappers sit.

- [ ] 2.1 Install the Convex SDK and stand the deployment up: real `convex.config.ts` mounting both components under `convex-host`, the three placeholder `schema.ts` replaced by real but table-free definitions, and the Convex packages' `codegen` no-op scripts replaced by real generation — with `pnpm dev` and a deploy path that work from a clean clone. `packages/stdb`'s `codegen` no-op is not this change's
- [ ] 2.2 Record the durable setup in `.claude/hooks/session-start.sh` and the relevant `AGENTS.md` if anything beyond a plain `pnpm install` is needed — a build-script approval, a generated-file step, a local dev deployment
- [ ] 2.3 Document the environment variables the deployment reads as a startup validation step that fails loudly and names any missing variable — the project's stated substitute for a `.env.example` (see `CLAUDE.md`)

## 3. Component boundaries

- [ ] 3.1 Define each component's own function surface and make its tables unreachable from outside it: no query, mutation, scheduled job, or migration outside a component touches its tables. What lands here is the boundary and the check that catches a violation; the tables it bounds arrive with their owning capabilities (`platform-persistence/component-boundaries`, `#a-table-has-one-reachable-owner`)
- [ ] 3.2 Keep the host to the public surface, the authentication wrappers and the capability declarations, holding no table that restates a component's (`platform-persistence/component-boundaries#the-host-adds-authority-not-storage`)
- [ ] 3.3 Add a test that a rule relating records in two components is enforced inside one transaction, so the boundary is demonstrably an access rule rather than a consistency boundary. It needs a record on each side, which this change does not create — decide whether it carries a fixture table for the test alone or hands the test to the first change holding records in both components (`platform-persistence/component-boundaries#the-boundary-costs-no-atomicity`)

## 4. The access path

- [ ] 4.1 Make the generated path the only way in: generation part of the build rather than a checked-in artifact a repository can hold stale, and the references exported so every caller arriving later has exactly one way to reach the deployment. Wiring the callers is not this change's — the reference app holds no Convex client today and gains one with `identity-and-authorization` and the capabilities after it (`platform-persistence/generated-access-path`)
- [ ] 4.2 Add a test that changing a function's arguments breaks a consuming build — a fixture consumer suffices until real ones exist — and a lint that no string-addressed call path exists alongside the generated one (`platform-persistence/generated-access-path#a-broken-caller-fails-to-build`, `#no-second-call-path`)

## 5. Schema change

- [ ] 5.1 Adopt and document the expand-migrate-contract rollout: add before write, write before read, remove only once nothing reads (`platform-persistence/schema-change-rollout`)
- [ ] 5.2 Make the discipline testable rather than exercising it for real: this change creates no tables, so the first genuine rollout belongs to a downstream capability. A fixture shape carried through add-write-read-remove pins both the midway state — some records old, some new, every deployed reader handling both — and that removal is the last step (`platform-persistence/schema-change-rollout#no-step-breaks-a-reader`, `#removal-is-the-last-step`)

## 6. The two `global-invariants` requirements this change mints

- [ ] 6.1 Write the one shared exact-type-equality assertion — the conditional-type identity trick, **not** mutual `extends`, which is blind to `readonly` modifiers and to the excess-field direction — and place it where every mirror site can consume it. The seam is settled rather than open: `revise-game-engine-contract` §1.4 records that this change owns writing it and that the engine change proceeds without it, so expect the mirror sites to have been churned by that change's state-shape migration before the guard reaches them (`global-invariants/engine-mirrors-are-guarded#one-assertion-every-site`)
- [ ] 6.2 Apply it at the mirror sites that exist when this lands — the Zod schema and the field-by-field encoder in `apps/visual-tester/src/lib/test-sequences/`. The other two sites this change's design enumerates are not this change's to guard: `migrate-game-configuration` §2.2 creates the Convex configuration validator and already commits to using this assertion, and its §4.2 deletes `packages/stdb`'s parallel configuration type in favour of re-exporting the engine's. Ship that as the rule the assertion comes with — a site that can import the engine's type should, and the assertion is for sites that genuinely must hold a declaration of their own (`global-invariants/engine-mirrors-are-guarded`)
- [ ] 6.3 Prove the guard bites in the way the naive idiom does not: a mirror differing from the engine's type only in `readonly`-ness must fail, and so must a field added, renamed, retyped, or moved (`global-invariants/engine-mirrors-are-guarded#drift-fails-the-build`, `#modifier-only-divergence-is-divergence`)

- [ ] 6.4 Establish that board generation has exactly one implementation behind one reachable entry point. The algorithm ships today from `packages/engine/src/boardgen.ts` and relocates to a shared package in a later PR (`revise-game-engine-contract` §12.6) — nothing here depends on which package hosts it, only on there being one. Routing the call sites belongs to the capabilities that own them: preview and unlocked launch to `migrate-game-configuration` §4.4, the tester's session seeding to `add-generated-board-sessions` §2.1 (`global-invariants/one-shared-generation`, `#preview-and-launch-are-one-implementation`)
- [ ] 6.5 Add the check that bites on the tempting violation rather than on the obvious one: no surface bundles or reimplements a generation stage of its own, including for a preview that redraws without a round trip — a location rule alone would miss a second generator that runs server-side. In the same pass pin the carve-out with a test, so the guard cannot be tightened later into one that fails an editor, a fixture, or a board arbitrary (`global-invariants/one-shared-generation#a-local-preview-is-a-second-implementation`, `#authoring-a-board-is-not-generating-one`)

## 7. Spec hygiene and verification

- [ ] 7.1 Add `// spec:` citations across the deployment as the placeholders become definitions, and `// design:` references where this change's rationale warrants them (why the boundary costs no atomicity, why the mirror assertion is not mutual `extends`)
- [ ] 7.2 Run `pnpm spec:check` and the full battery (`pnpm lint`, `pnpm typecheck`, `pnpm test`)
- [ ] 7.3 Verification specific to this change: the cross-component transaction test, the broken-caller build failure, the midway-rollout read test, and the `readonly`-divergence guard test

## Archive

- [ ] 8.1 On explicit author instruction, `pnpm spec:fold mint-platform-persistence` then `openspec archive --skip-specs -y mint-platform-persistence` at the tail of the PR that completes the implementation (fold enforces capability-dependency order: this change archives before `migrate-game-configuration`, `migrate-platform-integrations` and `add-generated-board-sessions`)
- [ ] 8.2 Add `platform-persistence` to `openspec/config.yaml`'s context capability list
- [ ] 8.3 Run `pnpm spec:check` after archiving
