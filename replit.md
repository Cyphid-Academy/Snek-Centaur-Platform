# Replit Agent — Pointer File

Agent context is split by concern:

- **Implementation work** (TypeScript, packages, CI, infra): read root `AGENTS.md`.
- **Spec authoring** (editing `spec/` module files, REVIEW items): read `spec/AGENTS.md`.
- **Package-scoped work**: read the `AGENTS.md` inside the relevant `packages/*/` or `apps/*/` directory.

Any updates to agent context must be written to the appropriate `AGENTS.md` — not here. This file is only for context genuinely specific to the Replit environment.

## Environment Notes

This is a pnpm monorepo. The default workflow runs `pnpm dev` which starts the Centaur Server reference app (`apps/centaur-server-reference/`) on port 5000.

**Package manager**: pnpm is pre-installed (`pnpm@10.26.1`). Always use `pnpm add / install / remove` — not npm or yarn.

Run `corepack enable` once per environment to activate corepack-managed pnpm. In Replit, pnpm is already available via Nix.

## Workflow

The primary workflow (`Start application`) runs:
```
pnpm --filter @cyphid/centaur-server-reference dev
```

This starts the Vite dev server on port 5000. The Replit preview iframe connects to port 5000.

## Future Workflows (commented out in .replit until needed)

- `pnpm convex dev` — starts the Convex dev backend (requires Convex dashboard setup; see `docs/external-setup.md`)
- `pnpm stdb dev` — starts a local SpacetimeDB instance (requires STDB CLI; see `docs/external-setup.md`)
