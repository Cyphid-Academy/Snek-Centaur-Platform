---
name: Which paths survive a container rebuild on Replit
description: $HOME is not durable but the workspace is, and the XDG variables already point into it
---

`$HOME` (`/home/runner`) is **not** durable. A container rebuild can wipe things installed there — `~/.local/bin` in particular — while leaving the git repo completely untouched. The failure looks baffling: a tool that demonstrably worked earlier in the session is simply gone, with no other sign of change.

The workspace (`/home/runner/workspace`) is durable. Anything that must outlive a rebuild belongs there.

**Replit already redirects the XDG base directories into the workspace:**

```
XDG_DATA_HOME=/home/runner/workspace/.local/share
XDG_CONFIG_HOME=/home/runner/workspace/.config
XDG_CACHE_HOME=/home/runner/workspace/.cache
XDG_BIN_HOME=<unset>
XDG_STATE_HOME=<unset>
```

**Why it matters:** any tool that follows the XDG spec already stores its state durably here, for free. Do not invent a private tools directory, and do not repoint `XDG_DATA_HOME` yourself — that has repl-wide blast radius for every other XDG-respecting tool, and it is redundant. Check the variables before designing around the problem; the interesting gap is usually just `XDG_BIN_HOME`, which is unset, so tools that look there for sibling binaries fall back to the non-durable `~/.local/bin`.

**How to apply:** install CLI tooling into the workspace (`.local/bin` inside the repo works and is git-ignored), let the tool's own state land under the existing `XDG_DATA_HOME`, and make the install script idempotent so a workflow can run it on every start and self-heal after a rebuild. To put a workspace binary on `PATH` for every pnpm script — including ones that spawn the bare command from Node — symlink it into `node_modules/.bin`, which pnpm always adds to `PATH`.
