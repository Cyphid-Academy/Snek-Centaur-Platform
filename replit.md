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

**Arming requirement:** Replit automatically includes every workflow in the
"Project" run group, so pressing Run would otherwise trigger these
destructive workflows. Each script therefore refuses to do anything unless
its own gitignored arming file exists — `.git-workflow-armed-rebase` for
Scripted rebase, `.git-workflow-armed-reset` for Hard reset to origin. The
token is claimed atomically (via `mv`) and consumed on start, so each
arming permits exactly one run of exactly that workflow, even if both start
in parallel. Unarmed invocations (e.g. via the Run button) exit harmlessly
with a "Not armed" message.

1. Write the rebase plan to `.rebase-plan.txt` (gitignored). Line 1 is the
   base ref (e.g. `HEAD~3`); the remaining lines are the rebase todo
   (`pick`/`squash`/`fixup`/`reword`/`drop` lines, same format as
   `git rebase -i`).
2. Arm the workflow: `touch .git-workflow-armed-rebase`.
3. Trigger the **Scripted rebase** workflow (runs
   `scripts/run-scripted-rebase.sh`). It applies the todo non-interactively
   and, if the rebase fails (e.g. a conflict), automatically runs
   `git rebase --abort` to restore the previous state. It refuses to run if
   a rebase/merge/cherry-pick is already in progress. On success it deletes
   `.rebase-plan.txt` so a stale plan can never be replayed.
4. After any rebase, run `pnpm spec:freshness`; on staleness, re-seed the
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
matching `origin/` branch, failing if none exists. It requires its own
arming file, `.git-workflow-armed-reset`. Both workflows are destructive by
design and only act when explicitly armed and triggered.

### Rewriting messages and file contents with `exec`

A plain `reword` in the todo is a **no-op** here: the tool runs with
`GIT_EDITOR=true`, so `reword`/`squash` keep the original message instead of
prompting. To rewrite a commit's **message** *or* its **file contents**, use
`exec` todo lines. An `exec` runs immediately after the preceding `pick`, in
the worktree with that commit checked out as `HEAD`, so `git commit --amend`
inside it rewrites exactly that commit; the following `pick` lines then replay
on top of the amended commit.

Prepare any replacement content (message bodies, file bodies) **outside the
repo** first — e.g. a scratch dir — with the file-write tool, so the working
tree is clean before the rebase starts. An `exec` that exits non-zero stops
the rebase and the tool aborts, so each `exec` must fully succeed or fail
cleanly.

**Rewrite a message** — prepare `msg.txt`, then:
```
pick <sha> Old subject
exec git commit --amend -F /abs/scratch/msg.txt
```
(`-m "New subject"` for a one-liner; a prepared `-F` file for a full body.)

**Rewrite a file inside a commit** — prepare the replacement file, then:
```
pick <sha> Some commit
exec cp /abs/scratch/new-body path/in/repo && git add path/in/repo && git commit --amend --no-edit
```
`--no-edit` keeps the existing message. (This is how a stray workflow was
folded out of the visual-tester `.replit` in its Implement commit.)

**Create or update the requirements seed commit.** OpenSpec's two-commit
authoring (see `openspec/README.md`) introduces a MODIFIED delta as a *seed*
commit — the affected `### Requirement:` blocks copied **verbatim** from
`openspec/specs/<capability>/spec.md` — followed by an *edit* commit that
changes them, so the edit commit's diff is a clean word-level review.
`pnpm spec:freshness` passes only while the seed's blocks still match `specs/`
exactly; a rebase onto an advanced `main` that touched those requirements makes
the seed stale, and the convention is to **re-seed** (regenerate verbatim from
the new base) rather than stack a correction commit. Do that with an `exec`
that regenerates the seed delta and amends the seed commit:

1. Copy the affected requirement blocks verbatim from the **current**
   `openspec/specs/<capability>/spec.md` into a fresh delta file at a scratch
   path (its `## MODIFIED Requirements` section holds the blocks unchanged),
   written with the file tool.
2. Plan:
   ```
   <new-base>
   pick <seed-sha>  Seed <change> deltas verbatim
   exec cp /abs/scratch/seed-delta.md openspec/changes/<change>/specs/<cap>/spec.md && git add -A && git commit --amend --no-edit
   pick <edit-sha>  Edit <change> deltas: ...
   ```
   The `exec` overwrites the seed commit's delta file with the freshly-copied
   blocks and amends the seed commit; `pick <edit-sha>` then replays the edits
   on top. If the edits no longer apply cleanly against the new blocks, resolve
   the conflict — or, for a substantive re-edit, follow the edit `pick` with a
   second `exec … --amend` that writes the updated edited delta.
3. Run `pnpm spec:freshness` (passes once the seed matches `specs/`) and have
   the edit commit's word-diff re-reviewed.

To create a seed/edit pair from scratch, two ordinary commits (seed verbatim,
then edit) are simplest; reach for this `exec` recipe when you need to
**re-seed** an existing pair after the base moves.

## Future Workflows (commented out in .replit until needed)

- `pnpm convex dev` — starts the Convex dev backend (requires Convex dashboard setup; see `docs/external-setup.md`)
- `pnpm stdb dev` — starts a local SpacetimeDB instance (requires STDB CLI; see `docs/external-setup.md`)
