#!/usr/bin/env bash
# Claude Code Web — SessionStart hook.
#
# Makes a fresh web-session clone build/lint/test/validate-ready: a web session
# starts from a fresh git clone with no node_modules (they are gitignored), so
# nothing works until dependencies are installed. This is the Claude Code Web
# analogue of the Replit environment setup (.replit / replit.md) — a co-equal
# development context, its setup encoded in the repo.
#
# Synchronous and idempotent (safe to run every session). Never fails the
# session: on an install error (e.g. offline) it warns and exits 0.
# See CLAUDE.md -> "Claude Code Web".
set -uo pipefail

# Web-only. Local CLI sessions manage their own environment; this guard keeps
# the hook from running pnpm install on every local session.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# pnpm is the only supported package manager (pinned via package.json
# "packageManager": pnpm@10.26.1). corepack activates that exact version.
corepack enable >/dev/null 2>&1 || true

echo "[session-start] installing dependencies (pnpm install --frozen-lockfile)…"
if ! pnpm install --frozen-lockfile; then
  echo "[session-start] WARNING: pnpm install failed (offline, or lockfile drift)." >&2
  echo "[session-start] Run 'pnpm install' before building — do NOT treat this as a task blocker." >&2
  exit 0
fi

# Prepare the SvelteKit apps so ad-hoc \`tsc\`/editor typecheck resolves generated
# types without first invoking the typecheck script (which self-syncs anyway).
# Best-effort; a failure here never blocks the session.
for app in centaur-server-reference visual-tester; do
  pnpm --filter "@cyphid/${app}" exec svelte-kit sync >/dev/null 2>&1 || true
done

echo "[session-start] ready — pnpm lint | test | typecheck | spec:check | exec openspec validate <change> --strict"
exit 0
