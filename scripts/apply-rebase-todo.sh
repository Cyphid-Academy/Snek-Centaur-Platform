#!/usr/bin/env bash
set -euo pipefail

if [ -z "${REBASE_TODO_SOURCE:-}" ]; then
  echo "Error: REBASE_TODO_SOURCE is not set." >&2
  exit 1
fi

cp "$REBASE_TODO_SOURCE" "$1"
