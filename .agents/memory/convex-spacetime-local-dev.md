---
name: Convex & SpacetimeDB local dev
description: Installing the pinned spacetime CLI, and the two prompts that hang convex dev in a headless workflow
---

## The SpacetimeDB CLI

- SpacetimeDB is not in nixpkgs, and Nix would be the wrong lever regardless: it pins nixpkgs' version rather than the one the module declares. It ships its own version manager, so `scripts/install-spacetime.sh` (`pnpm setup:stdb`) drives that from the module's dependency pin in `packages/stdb/spacetimedb/package.json` — one source of truth, no second place to bump.
- **Never install "latest" for this tool.** Its on-disk data format is version-gated: running a newer CLI once rewrites `.stdb/data` so the pinned CLI then refuses to start, and the only way back is deleting that data. The version pin protects state, not just the API surface.
- The install lands in the repo's `.local/bin` rather than `~/.local/bin`, because `$HOME` does not survive a container rebuild — see [Replit durable paths](replit-durable-paths.md). The `SpacetimeDB` workflow runs `setup:stdb` before `dev:stdb` so a wiped container self-heals; the script is idempotent and touches the network only when the pin is unsatisfied.
- `dev:stdb`, `stdb:publish` and the demo stack all spawn a bare `spacetime`, so the script symlinks the binary into `node_modules/.bin`, which pnpm puts on `PATH` for every script. It repairs that link on every run, including the fast path, because `pnpm install` prunes and rewrites that directory.

## `convex dev` in a workflow

- `convex dev` blocks workflows with interactive prompts. Fixes: run with `CONVEX_AGENT_MODE=anonymous` (local, no account), and disable the "Set up Convex AI files?" prompt via `"aiFiles": {"enabled": false}` in `convex.json`.
- **Why:** both prompts hang headless workflows forever with status RUNNING and no error.
- **How to apply:** whenever restarting or reconfiguring the Convex Dev or SpacetimeDB workflows.

## Pointing the stack at a cloud (dev) deployment

- Prefer a **development deploy key** as a Replit Secret (`CONVEX_DEPLOY_KEY`) over `convex login`; the login device flow does not complete in a headless workflow.
- With the key set, remove any stale `packages/convex-host/.env.local` first — a leftover `CONVEX_DEPLOYMENT=anonymous:*` line keeps the CLI on the local backend and the cloud provision is skipped silently.
- A dev deploy key can `convex env set` but **not** `convex env list` (no `deployment:env:view` permission). Verify values through the Convex dashboard, not the CLI.
- **Replit is not a laptop for reachability purposes.** `docs/external-setup.md` warns that a cloud Convex deployment cannot fetch a key document from a localhost service — that warning is written for a developer's laptop and does not hold on Replit, where `.replit`'s port map publishes the app and the SpacetimeDB host on the public edge. Verified by fetching JWKS and a healthcheck from a third-party vantage. Do not repeat the laptop caveat for this environment without testing it first.
