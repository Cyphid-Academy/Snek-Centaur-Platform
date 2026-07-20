#!/usr/bin/env bash
set -euo pipefail

plan_file=".rebase-plan.txt"
git_dir=$(git rev-parse --git-dir)

if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
  echo "Error: a rebase is already in progress. Resolve or abort it first." >&2
  exit 1
fi
if [ -f "$git_dir/MERGE_HEAD" ] || [ -f "$git_dir/CHERRY_PICK_HEAD" ]; then
  echo "Error: another git operation (merge/cherry-pick) is in progress. Resolve it first." >&2
  exit 1
fi

if [ ! -f "$plan_file" ]; then
  echo "Error: $plan_file not found. Create it first." >&2
  echo "Format: first line is the rebase base ref (e.g. HEAD~3)," >&2
  echo "remaining lines are the rebase todo (pick/squash/fixup/reword/drop ...)." >&2
  exit 1
fi

base=$(head -n 1 "$plan_file" | tr -d '[:space:]')
if [ -z "$base" ]; then
  echo "Error: first line of $plan_file must be the base ref (e.g. HEAD~3)." >&2
  exit 1
fi

todo_file=$(mktemp)
trap 'rm -f "$todo_file"' EXIT
tail -n +2 "$plan_file" > "$todo_file"

if ! grep -q '[^[:space:]]' "$todo_file"; then
  echo "Error: $plan_file contains no todo lines after the base ref." >&2
  exit 1
fi

echo "Rebasing onto $base with the following todo:"
cat "$todo_file"
echo "---"

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

if ! REBASE_TODO_SOURCE="$todo_file" \
     GIT_SEQUENCE_EDITOR="$script_dir/apply-rebase-todo.sh" \
     GIT_EDITOR=true \
     git rebase -i "$base"; then
  if [ -d "$git_dir/rebase-merge" ] || [ -d "$git_dir/rebase-apply" ]; then
    echo "Rebase failed (likely a conflict). Aborting..." >&2
    git rebase --abort || true
    echo "Rebase aborted; repository restored to its previous state." >&2
  else
    echo "Rebase failed before starting; nothing to abort." >&2
  fi
  exit 1
fi

echo "Rebase completed successfully."
