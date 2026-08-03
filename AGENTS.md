# Agent Context — Implementation Work

This is the top-level agent context for **implementation work** in the Snek Centaur Platform monorepo.

> **Spec system.** The binding spec lives in `openspec/specs/` (strict
> OpenSpec; conventions in `openspec/config.yaml`, workflow and cutover
> table in `openspec/README.md`). The pre-OpenSpec corpus is quarantined in
> `legacy-spec-archive/` and remains binding for modules not yet migrated.
> Spec changes flow through `/opsx:*` change folders. Run `pnpm spec:check`
> after any change touching spec content or spec references. Changing a
> `Depends on:` declaration additionally means running `pnpm spec:graph` in the
> same commit: it regenerates `openspec/capability-graph.md`, the rendered
> dependency graph, which is generated output and never hand-edited.
> `pnpm spec:check` fails while that file is stale.

- For **package-scoped implementation**: read the `AGENTS.md` in the relevant `packages/*/` or `apps/*/` directory.
- This file covers repo-wide implementation conventions that apply everywhere.

> **Durability principle.** Conversation context is not durable. Whenever you
> propose a design, write a change (proposal/design/spec/tasks), a commit
> message, or a code comment, the artifact must stand on its own for a future
> observer who has no access to the present session — no "as we discussed," no
> reliance on a decision that lives only in chat. A decision's rationale belongs
> in a durable home (a change's `design.md`, an archived change folder, a
> `// design:` reference), not in the transcript. This is the same instinct as
> the spec's no-journey-narration rule, generalised to every artifact you write
> into the repo: write for the reader who arrives after the conversation is gone.

## Project Overview

The **Team Snek Centaur Platform** is a team-based multiplayer snake game for Cyphid Academy's Battle Bunker educational program. Players collaborate with an AI "Centaur Server" that controls their team's snakes by default; human operators selectively override individual snakes.

The platform runs across three distinct runtimes:

| Runtime | Role | Lifecycle |
|---------|------|-----------|
| SpacetimeDB | Authoritative game logic — turn resolution, RLS, chess timer | Per-game (transient) |
| Convex | User accounts, rooms, replays, bot state, game orchestration | Global (persistent) |
| Centaur Servers | Bot computation + serving the operator UI + game-invitation answering + per-team-per-game credentials | Per-team |

Full architectural detail is in `legacy-spec-archive/spec/02-platform-architecture.md` (binding until that module migrates). The spec is the binding source of truth for every behavioural and structural decision.

## Package Map

| Path | npm name | What it is | Spec module(s) |
|------|----------|------------|----------------|
| `packages/engine/` | `@cyphid/snek-engine` | Shared game engine — domain types, the two turn-resolution entry points (`advanceTurn`, `imagineMoves`), collision detection, chess-timer arithmetic, move validation. Handed a board; never builds one. Consumed by all runtimes. | 01, 02 |
| `packages/game-configuration/` | `@cyphid/snek-game-configuration` | The configuration vocabulary a game is shaped with, and the platform's one board generator. Depends on the engine. | 01, 05 |
| `packages/stdb/` | `@cyphid/snek-stdb` | SpacetimeDB TypeScript module — reducers, RLS, schema, chess timer. | 04 |
| `packages/convex-snek-platform/` | `@cyphid/convex-snek-platform` | Convex Component for platform-wide state (users, rooms, games, replays, webhooks). | 03, 05 |
| `packages/convex-centaur-state/` | `@cyphid/convex-centaur-state` | Convex Component for Centaur subsystem (snake config, drives, action log). | 06 |
| `packages/convex-host/` | `@cyphid/snek-convex-host` | Convex deployment that mounts both components, adds auth wrappers, capability declarations, game lifecycle. | 02, 03, 05, 06 |
| `packages/centaur-server-lib/` | `@cyphid/snek-centaur-server-lib` | Bot framework + invitation handler + key publication + per-team-per-game credential handling + healthcheck contract + typed Convex clients. Published via GitHub tags for forkers. | 07 |
| `apps/centaur-server-reference/` | *(app, not published)* | Svelte 5 reference implementation of the Centaur Server. Mirrored to `cyphid/snek-centaur-server` via `git subtree split`. | 08 |

## Monorepo Mirror Model

The `apps/centaur-server-reference/` directory is the **canonical** source of the Snek Centaur Server. The `cyphid/snek-centaur-server` GitHub repository is a generated mirror. Teams fork the mirror; PRs from forks are cherry-picked here by a maintainer and the mirror workflow re-syncs. See `docs/external-setup.md` for the setup procedure and `.github/workflows/mirror-centaur-server.yml` for the sync workflow.

## Code-to-Spec Citation Convention

Every non-trivial implementation decision that traces to a requirement must carry a comment. Spec identifiers are treated like code identifiers:

```typescript
// spec: game-engine/team-potion-effects                       (a requirement)
// spec: game-engine/team-potion-effects#sacrificial-collection (edge case pinned by a scenario)
// spec: 04-REQ-014                                            (unmigrated module — numeric legacy ID)
// design: 2026-07-18-cache-normalized-outputs                 (rationale in an archived change folder)
```

Named identifiers come from `openspec/specs/<capability>/spec.md` headers; numeric IDs are valid only for modules still pending migration (cutover table in `openspec/README.md`). All forms are lint-enforced by `pnpm spec:citations` — stale or unknown references fail, and retired numeric IDs point you to `legacy-spec-archive/maps/`.

Code cites identifiers **inline**, as above. The rule that identifiers never appear in prose is a rule about the corpus itself: inside a spec or delta file a requirement's dependencies live in its `Depends on:` declaration (`openspec/README.md` → identifier grammar), and the sentences name concepts. Code is the other direction of the relation and is unaffected.

## Tooling Conventions

**Package manager**: pnpm only. Use `pnpm add`, `pnpm install`, `pnpm remove`. Never use `npm install` or `yarn`.

**TypeScript**: strict mode throughout. Root `tsconfig.base.json` defines the baseline; each package extends it. Run `pnpm typecheck` to check the whole workspace via `tsc -b`.

**`.svelte` files are checked by `svelte-check`, not `tsc`.** `tsc` does not parse `.svelte` at all — it reads a project's `.ts` and silently skips every component, so an app whose `typecheck` script was `tsc --noEmit` had its entire UI unchecked while the script's name said otherwise. Biome cannot lint them either (`biome.json` ignores `**/*.svelte`). Both SvelteKit apps therefore run `svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`, which covers the app's `.ts` *and* its components in one program under the same `tsconfig.base.json` flags. **A new SvelteKit app copies that script**, or its components are checked by nothing.

`--fail-on-warnings` is deliberate: svelte-check's warning tier is where a11y violations, unused CSS selectors and misused runes land, and a warning nothing fails on is a warning nobody reads. Two consequences worth knowing before writing a component: a binding named `state` makes `$state(…)` parse as a store read of it rather than as the rune, and reading reactive state inside a `$state(…)` initialiser warns unless the intent to capture only the initial value is spelled with `untrack`.

**Linting / formatting**: Biome. Run `pnpm lint` (check) or `pnpm format` (write). No ESLint or Prettier.

`complexity/useLiteralKeys` is **off**, and should stay off: it forbids `env["CONVEX_URL"]` while the TypeScript baseline's `noPropertyAccessFromIndexSignature` forbids `env.CONVEX_URL`. With both on, reading an index signature has no legal spelling short of destructuring, which is a workaround rather than a style. TypeScript wins because it is the one enforcing the safety property.

**Testing**: Vitest. Run `pnpm test` across the workspace. Every package should have at least a smoke test confirming it loads. Both SvelteKit apps are excluded from workspace project discovery — their Vite transform conflicts with `@sveltejs/kit` resolution during a workspace run — so `pnpm test` invokes each as a separate filtered run after the main one. A new app needs adding there or its tests will never run.

**Pin shared tooling; never `"*"`.** `vitest` and `vite` carry the same explicit caret range in every `package.json` that declares them. `"*"` looks like "inherit the workspace version" and is not: it means *any* version, so the resolution is whatever the lockfile happens to hold. That drifted unnoticed once — one app sat on vitest 2.x while everything else ran 3.x, invisible because its suite was never invoked. When upgrading, bump every declaration in the same commit.

**Apps consume the packages' built `dist/`, not their source.** `packages/*/package.json` export `./dist/index.js`, and `dist/` is gitignored — so a package that has never been built is a *resolve failure* in every consumer, which surfaces as an HTTP 500 from a dev server rather than as a compile error. Every script that needs them (`dev`, `dev:tester`, `test`, `typecheck`, `build`, `smoke`, `stdb:publish`, and each app's own `dev`/`test`/`build` via a `pre*` hook) therefore runs `build:packages` first. That script is `tsc -b` over the root project references, so **a new package that typechecks is a new package this builds** — do not replace it with a hand-listed set, which is what silently broke when the second package arrived. Do not add a separate `pnpm --filter @cyphid/snek-engine build` step to a script, a workflow, or the SessionStart hook — chain `build:packages` instead, so the dependency is expressed once and stays true. (Explicit chaining rather than a `pretest` hook: pnpm does not run npm-style pre/post scripts by default, so such a hook would look correct and silently do nothing.)

**Dev server**: `pnpm dev` starts the Centaur Server reference app on port 5000 via Vite; `pnpm dev:tester` starts the visual tester on 5001. The Replit preview iframe connects to port 5000.

**Apps consume the packages' built `dist/`, not their source.** `packages/*/package.json` export `./dist/index.js`, and `dist/` is gitignored — so a package that has never been built is a *resolve failure* in every consumer, which surfaces as an HTTP 500 from a dev server rather than as a compile error. Every script that needs them (`dev`, `dev:tester`, `test`, `build`, `smoke`, and each app's own `dev`/`test`/`build` via a `pre*` hook) therefore runs `build:packages` first. That script is `tsc -b` over the root project references, so **a new package that typechecks is a new package this builds** — do not replace it with a hand-listed set, which is what silently broke when the second package arrived.

**Changes under `apps/` must be run, not only tested.** `lint`, `typecheck`, `test` and `spec:check` never start a server; `pnpm smoke` is what does, and it is deliberately shallow (boots, renders, answers its own API). Run it before pushing, and for anything a reviewer would click — a new panel, a changed flow, an edited persisted format — open the app as well. A schema change additionally needs a thought the suites cannot have for you: **the documents already on disk were written by the previous version.** `apps/visual-tester/sequences/scratch/` is gitignored, so it survives branch switches and outlives the version that wrote it; every ingest path owes such a document a readable rejection rather than a crash (see `routes.test.ts` and `downgradeToPreviousVersion` in `test-sequences/fixtures.ts`).

## Validation at Two Densities

The battery is ~33s. Running all of it at every commit of a phase-structured branch costs minutes and answers the same question ten times, so validation is split by **what each density is for**.

**Tier 1 — `pnpm check:commit`, ~2–7s.** Is *this commit* green standing alone? That is a narrow question with a narrow answer: a boundary defect is a commit referencing something that only exists in a later one, and every such defect is **static**. So tier 1 is `tsc -b`, `svelte-check` over any app whose `.svelte` sources the commit touched, `biome` over the commit's own files, `spec:citations`, the touched change's own validation and freshness, the graph when a declaration moved, and `vitest related` over the changed sources. It runs against **the commit**, not the working tree — it refuses a dirty tree rather than answering a question you did not ask, since the divergence between the two is the bug it exists to catch.

Scope comes from the diff: any path under `openspec/changes/<name>/` names a change, so a commit carved at a change boundary scopes itself. `--change <name>` (repeatable) adds to that set for a commit that moves responsibilities between changes without touching both folders; a commit touching no change folder skips the four change-scoped gates entirely.

```
pnpm check:commit                       # the HEAD commit
pnpm check:commit origin/main..HEAD     # every commit on the branch
pnpm check:commit --no-tests            # static gates only, ~1.5s
```

**Tier 2 — `pnpm verify`, the full battery.** Is the *code* right? Lint, typecheck, both suites, `smoke`, `spec:check`. Run it at the tip before pushing. **CI runs the same named scripts** — its jobs are `pnpm verify` decomposed for wall-clock, never their own inlined steps. That is not a style preference: the `test` job once carried an inline build step local `pnpm test` did not have, and it was red for a week while every local check agreed the branch was fine.

The division follows from what discriminates. On the branch that motivated this, four boundary defects were caught — a `tasks.md` citing a scenario renamed in a later commit (twice, one of which forced a commit reorder), a type field added without its construction sites, and a section renumbering. Every one fell to a static gate costing under 1.5s combined. The two test suites — half the battery's wall clock — caught none of them; they caught *semantic* errors, which is tier 2's job.

So: **tier 1 over every commit, tier 2 once at the tip.** For a ten-commit branch that is ~50s rather than ~6 minutes.

**Backend runtimes**: `pnpm dev:stdb` runs a local SpacetimeDB host on port 3000 (natively — no Docker), `pnpm stdb:publish` builds and publishes the game module to it, and `pnpm dev:convex:local` runs a Convex deployment on loopback — no account, no deploy key — while `pnpm dev:convex` pushes to a cloud dev deployment. **Prefer the local one while developing**: the platform can then reach a Centaur Server or a SpacetimeDB host running beside it, which a cloud deployment cannot do without a public tunnel, and `convex env set` against it needs no cloud permission. Each is one command against a binary on `PATH`; nothing resolves binaries by path. Convex credentials come from your own cloud-environment variables — see `CLAUDE.md` → "Secrets and third-party resources", and `docs/external-setup.md` for the full procedure and the one flag worth knowing (`-p` takes the module project, not the package root).

## Root Scripts

| Script | What it does |
|--------|-------------|
| `pnpm check:commit` | **Tier 1** — is each commit green standing alone (see above) |
| `pnpm verify` | **Tier 2** — the full battery, what CI runs |
| `pnpm typecheck` | `build:packages` plus the two foreign TS regimes and both apps (the apps via `svelte-check`, which reads their `.svelte` files as well as their `.ts`) |
| `pnpm typecheck:convex` | Convex component/host files — separate because Convex's generated code is not written for the workspace's strict flags |
| `pnpm typecheck:stdb-module` | The SpacetimeDB module project, whose tsconfig options SpacetimeDB mandates |
| `pnpm lint` | `biome check .` |
| `pnpm format` | `biome check --write .` |
| `pnpm test` | Builds the packages, then `vitest run` across the workspace |
| `pnpm smoke` | Boots each app and checks it serves — the only check that runs the app |
| `pnpm coverage` | Branch coverage over the engine's resolver |
| `pnpm build:packages` | `tsc -b` over the workspace packages (their gitignored `dist/`) |
| `pnpm dev` | Starts the Centaur Server reference app |
| `pnpm dev:convex` | `convex dev` against your personal cloud dev deployment |
| `pnpm dev:convex:local` | `convex dev` against a loopback deployment — no Convex account required |
| `pnpm codegen` | Regenerates the host's and both components' `_generated/` |
| `pnpm dev:stdb` | Local SpacetimeDB host on 127.0.0.1:3000 |
| `pnpm stdb:publish` | Builds and publishes the game module as `snek-local` |
| `pnpm build` | Builds all packages |

Three TypeScript regimes coexist, and they are kept apart on purpose: `tsc -b` (the strict composite build, source of truth for `packages/*/src`), the Convex regime, and the SpacetimeDB module regime. The latter two do not extend `tsconfig.base.json` — their code is bundled by their own toolchain rather than emitted by tsc, and neither Convex's generated files nor SpacetimeDB's mandated options survive `exactOptionalPropertyTypes` / `noUncheckedIndexedAccess` / `verbatimModuleSyntax`. Do not try to unify them; add to the right one. `pnpm typecheck` runs all three, and `tsc -b` must run first because it emits `packages/engine/dist`, which the other two resolve through.

The apps are a fourth, and the only one that is not a `tsc` invocation: each extends `tsconfig.base.json` *and* its generated `.svelte-kit/tsconfig.json`, and is checked by `svelte-check` because `tsc` cannot read a `.svelte` file. The same ordering rule binds it — components resolve `@cyphid/snek-engine` through its gitignored `dist/`, so `build:packages` runs first there too.

## Commit History & Message Grammar

`main` is **semi-linear**, and how a PR lands depends on its shape:

- **Multi-commit PR** (a phase-structured change, or a seed/edit pair) → **Create a merge commit**. The merge node carries the clickable `#<PR>` link while the PR's **phase commits are preserved intact** beneath it (its second parent). Read PR-level history with `git log --first-parent` (one line per merged PR); expand a PR with `git show <merge>` or `git log <merge>^1..<merge>^2`.
- **Single-commit PR** → **Squash and merge**. A merge commit would wrap the lone commit in a redundant second node (the same change appearing twice on `main`), so squash lands exactly one commit, subject `… (#<PR>)`, carrying the link without the extra node.

Both squash and merge-commit are enabled; **rebase-merge stays off** (it drops the PR link). Never squash a multi-commit PR — it destroys the phase commits. A spec-affecting change lands as a small **ordered set of phase commits** rather than one squash, so each phase is reviewable on its own and the history reads as the change's shape (the phases may span PRs: `Open change` in a spec-authoring PR, `Implement` + `Archive` in the PR that completes the work — the archive-due gate ties them together):

- **`Open change <name>: …`** — the proposal artifacts (proposal, design, tasks, spec deltas).
- **`Seed <name> deltas verbatim` → `Edit <name> deltas: …`** — the two-commit seed/edit pair, required only when the change **modifies** existing requirements (ADDED-only deltas skip it; see `openspec/README.md`).
- **`Implement <name>: …`** — the code, tests, and any design/spec refinements found while building.
- **`Archive <name>: …`** — the terminal fold into `specs/`, on explicit human instruction.

**Subject grammar:** sentence-case imperative, led by a phase verb from that fixed vocabulary — `Open change` / `Seed` / `Edit` / `Implement` / `Archive` for the change lifecycle, plus `Propose`, `Migrate`, `Document`, `Adopt`, and similar for non-lifecycle work. This is a domain vocabulary tuned to the OpenSpec workflow, and it is deliberately **not** Conventional Commits (`feat:` / `fix:` / …): the automation those prefixes exist for (semantic-release, commitlint) is not in use, and the semantic layer already lives in `specs/`, archived change folders, and `// spec:` citations. No type prefixes.

**Body:** explain **what and why**. The `Implement` commit is where the whole-task description belongs — every file changed, every decision made, every cascade, not just the last edit; re-read the change scope before writing it. Decisions that were explored and abandoned (a swapped library, a reversed approach) live as rationale in `design.md`, not as dead-end commits — clean history carries the final tree, and provenance stays in the design record.

**Merging:** the PR branch MUST be up to date with `main` before merge — rebase it onto the latest `main` (re-seed any stale delta per the two-commit rule; run `pnpm spec:freshness`), push, then merge (merge commit for multi-commit, squash for single-commit). Never bring `main` *into* the branch with a plain merge (it injects a merge commit and pollutes the phase structure) — rebase, or use GitHub's "Update with rebase". Repo settings and the `main` ruleset allow **squash and merge-commit** (not rebase-merge), require the branch to be up to date, and require CI (`lint`, `typecheck`, `test`, `spec-check`) to pass; "Require linear history" is deliberately **off** (it would forbid the merge commit that carries the PR link).

**No archive-due changes on `main`.** Open changes are a first-class state on `main` — approved spec work whose implementation hasn't landed — and any number may exist. The ruleset instead requires the `no-archive-due-changes` status, posted by the CI `archive-due-gate` job: **`pending`** (yellow — blocks merge but is *not* a failure; the archive step is simply not done yet) while any open change is **archive-due** — zero unchecked tasks outside its final `## Archive` section in `tasks.md` — and **`success`** otherwise. The PR that completes a change's implementation must therefore carry its `Archive` commit; a spec-authoring PR merges with its change open. This is a merge-readiness condition in the spirit of the built-in "branch up to date" gate, not a red verdict on any commit. `scripts/check-open-changes.mjs` runs the same check locally, and `spec:fold` refuses archives out of capability-dependency order.

**Verify a PR's live state before acting on it.** Before any step whose correctness depends on a PR being open or merged — pushing to its branch, adding an archive or "final" commit, rebasing it, merging, or telling the user to merge — re-check the current state first (`git fetch` and look for the PR's merge commit on the base branch, or the GitHub API `pull_request_read get`). **Never assume a PR is still open from an earlier check in the same session** — humans merge and close out of band, and there is no signal unless you look or `subscribe_pr_activity`. A merged PR is finished: its branch MUST NOT receive new commits — do follow-up work as a **fresh branch off the updated base**. When handing a PR off as "ready to merge," either subscribe to its activity or re-verify its state at the start of the next PR-related action.

## Auth Library Note

`convex-host` has a `TODO` comment for Better Auth integration (local install mode, plus the project-owned capability plugin that issues credentials to service principals). Do not integrate it until the first Convex implementation task. See `packages/convex-host/AGENTS.md` for details.
