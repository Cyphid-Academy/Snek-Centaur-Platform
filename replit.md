# Replit Agent — Pointer File

Agent context is split by concern:

- **Implementation work** (TypeScript, packages, CI, infra): read root `AGENTS.md`.
- **Spec work**: read `openspec/README.md` (workflow, conventions, cutover table) and `openspec/config.yaml`. The pre-OpenSpec corpus is quarantined in `legacy-spec-archive/` (binding for unmigrated modules).
- **Package-scoped work**: read the `AGENTS.md` inside the relevant `packages/*/` or `apps/*/` directory.

Any updates to agent context must be written to the appropriate `AGENTS.md` — not here. This file is only for context genuinely specific to the Replit environment.

## Environment Notes

This is a pnpm monorepo. The default workflow runs `pnpm dev` which starts the Centaur Server reference app (`apps/centaur-server-reference/`) on port 5000.

**Package manager**: pnpm is pre-installed (`pnpm@10.26.1`). Always use `pnpm add / install / remove` — not npm or yarn.

Run `corepack enable` once per environment to activate corepack-managed pnpm. In Replit, pnpm is already available via Nix.

## Workflow

The primary workflow (`Start application`) runs:
```
pnpm --filter @cyphid/centaur-server-reference dev
```

This starts the Vite dev server on port 5000. The Replit preview iframe connects to port 5000.

## Scripted history rewriting

OpenSpec's two-commit delta authoring (see `openspec/README.md`) requires
rewriting history — keeping the seed/edit commit pair intact after review
revisions or re-seeding after a rebase onto an advanced main — instead of
stacking correction commits. Interactive rebase needs an editor/TTY, which
Replit workflows don't have, so use the scripted-rebase tooling:

1. Write the rebase plan to `.rebase-plan.txt` (gitignored). Line 1 is the
   base ref (e.g. `HEAD~3`); the remaining lines are the rebase todo
   (`pick`/`squash`/`fixup`/`reword`/`drop` lines, same format as
   `git rebase -i`).
2. Trigger the **Scripted rebase** workflow (runs
   `scripts/run-scripted-rebase.sh`). It applies the todo non-interactively
   and, if the rebase fails (e.g. a conflict), automatically runs
   `git rebase --abort` to restore the previous state. It refuses to run if
   a rebase/merge/cherry-pick is already in progress.
3. After any rebase, run `pnpm spec:freshness`; on staleness, re-seed the
   affected seed/edit pairs and have the word-diff re-reviewed.

Note: this rewrites local branch history only — pushing the rewritten
branch afterwards requires a force-push, which is done outside these
workflows.

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

There is also a **Hard reset to origin** workflow
(`scripts/hard-reset-to-origin.sh`) that resets the current branch to its
matching `origin/` branch, failing if none exists. Both workflows are
manual-trigger only (destructive; they discard local work by design).

## Future Workflows (commented out in .replit until needed)

- `pnpm convex dev` — starts the Convex dev backend (requires Convex dashboard setup; see `docs/external-setup.md`)
- `pnpm stdb dev` — starts a local SpacetimeDB instance (requires STDB CLI; see `docs/external-setup.md`)
