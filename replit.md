# Replit Agent — Pointer File

## User preferences

- **Never autonomously create workflows as workarounds for obstacles.** When
  you hit an obstacle where a new workflow looks like the right solution
  (e.g. to get around agent-shell restrictions), you may propose the
  strategy — then stop and wait for explicit consent before creating each
  such workflow.

Agent context is split by concern:

- **Implementation work** (TypeScript, packages, CI, infra): read root `AGENTS.md`.
- **Spec work**: read `openspec/README.md` (workflow, conventions, cutover table) and `openspec/config.yaml`. The pre-OpenSpec corpus is quarantined in `legacy-spec-archive/` (binding for unmigrated modules).
- **Package-scoped work**: read the `AGENTS.md` inside the relevant `packages/*/` or `apps/*/` directory.

Any updates to agent context must be written to the appropriate `AGENTS.md` — not here. This file is only for context genuinely specific to the Replit environment.

## Environment Notes

This is a pnpm monorepo. The default workflow runs `pnpm dev` which starts the Centaur Server reference app (`apps/centaur-server-reference/`) on port 5000.

**Package manager**: pnpm is pre-installed via Nix (`pnpm@10.26.1`); no `corepack enable` needed here. Always use `pnpm add / install / remove` — not npm or yarn.

## Workflow

The primary workflow (`Start application`) runs:
```
pnpm --filter @cyphid/centaur-server-reference dev
```

This starts the Vite dev server on port 5000. The Replit preview iframe connects to port 5000.

## Scripted history rewriting

The procedure — the plan format, the `exec` recipes, re-seeding a stale seed
commit — is environment-agnostic and lives in `AGENTS.md` → "Scripted history
rewriting". No agent shell has a TTY for an interactive rebase; Replit's is
not special in that respect. Two things here are:

**Why the arming files exist.** Replit automatically includes every workflow
in the "Project" run group, so pressing Run would otherwise trigger the
destructive **Scripted rebase** and **Hard reset to origin** workflows. Each
script refuses to do anything unless its own gitignored arming file exists,
which is what makes them safe to leave exposed.

**Setup requirement (per Replit environment): mirror git identity to
`~/.gitconfig`.** Workflow shells do not inherit `GIT_CONFIG_GLOBAL`, the
env var through which Replit exposes its managed git config, so git run
from a workflow has no committer identity and the rebase fails with
"Committer identity unknown" (the script then safely aborts). Git falls
back to `~/.gitconfig` when `GIT_CONFIG_GLOBAL` is unset, so before first
use in a fresh environment, mirror the identity there:

```
printf '[user]\n\temail = %s\n\tname = %s\n' \
  "$(git config user.email)" "$(git config user.name)" > ~/.gitconfig
```

Run this from the agent/workspace shell (where the managed config is
visible). `~/.gitconfig` is outside the repo, so it persists per
environment, never dirties the working tree, and must be re-created
whenever this repo is loaded into a new Replit environment.

## Backend runtime workflows

Both are live `.replit` workflows and run as part of the parallel `Project` workflow.

- **Convex Dev** — `pnpm dev:convex`. Pushes schema and functions to your personal Convex dev deployment. Requires `CONVEX_DEPLOY_KEY` as a Replit Secret (never committed, never in a shared environment). See `CLAUDE.md` → "Secrets and third-party resources".
- **SpacetimeDB** — `pnpm dev:stdb`, a standalone host on local port 3000 (mapped to external 3001), no Docker involved. `pnpm stdb:publish` builds and publishes the game module to it. Requires the `spacetime` CLI on `PATH`.

Full setup is in `docs/external-setup.md`.
