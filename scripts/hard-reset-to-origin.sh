#!/usr/bin/env bash
set -euo pipefail

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
