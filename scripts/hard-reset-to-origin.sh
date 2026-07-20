#!/usr/bin/env bash
set -euo pipefail

arm_file=".git-workflow-armed-reset"
claim="$arm_file.claimed.$$"
if ! mv "$arm_file" "$claim" 2>/dev/null; then
  echo "Not armed: this destructive workflow only runs when $arm_file exists." >&2
  echo "It was likely triggered indirectly (e.g. via the Run button). Doing nothing." >&2
  exit 0
fi
rm -f "$claim"

branch=$(git symbolic-ref --short -q HEAD) || {
  echo "Error: not on a branch (detached HEAD)." >&2
  exit 1
}

git fetch origin

if ! git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
  echo "Error: branch '$branch' does not exist on origin." >&2
  exit 1
fi

git reset --hard "origin/$branch"
echo "Hard reset '$branch' to origin/$branch."
