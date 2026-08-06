#!/usr/bin/env bash
# Replit [postMerge] hook: refresh node_modules after a pull or merge moves the
# lockfile. Failures are reported rather than swallowed — a half-installed
# workspace is worth knowing about here, not three commands later.
set -euo pipefail

pnpm install --prefer-offline
echo "Post-merge setup complete."
