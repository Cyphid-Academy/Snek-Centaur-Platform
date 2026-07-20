---
name: Uncommitted-file loss recovery
description: How to recover files if a platform checkpoint/rollback wipes uncommitted work mid-session
---

A platform rollback/checkpoint event can delete uncommitted files mid-session (observed: config files, routes, and tracked-file edits reverted while some newer files survived; gitignored dirs like node_modules/.svelte-kit untouched).

**Why:** Task-agent commits happen at task end, so anything written during the session exists only on disk until then.

**How to apply:** If files vanish (`?? dir/` untracked, missing package.json), don't rebuild from scratch. Recover from the pre-compression transcript JSONL at `.local/state/replit/agent/transcript/<id>/transcript.jsonl`:
- `write` tool calls contain full `content` fields (extract with a small Python/json script)
- `cat`/read observations contain config contents that were never written by you
Then re-run install/typecheck/tests to confirm, and re-check tracked files (root package.json scripts, .replit) against expectations — tracked edits may have been reverted too.
