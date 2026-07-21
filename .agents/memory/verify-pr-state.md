---
name: Verify PR state before acting
description: Re-check a PR's live open/merged state before any action that depends on it; humans merge out of band
---

# Verify a PR's live state before acting on it

**Rule:** Before any step whose correctness depends on a PR being open or
merged — pushing to its branch, adding an archive/"final" commit, rebasing it,
merging, or telling the user to merge — re-verify the current state first
(`git fetch` and look for the PR's merge commit on the base branch, or the
GitHub API `pull_request_read get`). See the "Verify a PR's live state before
acting on it" rule in root `AGENTS.md`.

**Why:** Humans merge and close PRs in the web UI, out of band. There is no
signal to the session unless you look or `subscribe_pr_activity`. Assuming a PR
is still open from an earlier check in the same session leads to consequential
wrong moves — most importantly, pushing new commits onto a **merged** branch
(which is finished and must not be reused).

**How to apply:**
- A merged PR is done: start follow-up work as a fresh branch off the updated
  base (`git fetch origin <base> && git checkout -B <new-branch> origin/<base>`),
  never on the merged branch.
- When handing a PR off as "ready to merge," either `subscribe_pr_activity` to
  it or re-verify its state at the start of the next PR-related action.
