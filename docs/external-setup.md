# External Platform Setup Guide

This document describes how to set up each external platform dependency for the Snek Centaur Platform. It is not part of the spec — it is a practical operations guide for whoever is deploying or operating the platform.

---

## GitHub

### Create the monorepo and push

1. Create a new repository at `github.com/cyphid/snek-centaur-platform` (or your organisation's equivalent).
2. Set the default branch to `main`.
3. Push this repository:
   ```bash
   git remote add origin git@github.com:cyphid/snek-centaur-platform.git
   git push -u origin main
   ```

### GitHub Actions workflows must be configured outside Replit

> **Replit-specific constraint.** GitHub requires the `workflow` OAuth scope to create or modify any file under `.github/workflows/`. Replit's GitHub connection does **not** request that scope, so any push from this Repl that touches a workflow file will be rejected with:
>
> ```
> ! [remote rejected] main -> main (refusing to allow an OAuth App to create or
>   update workflow `.github/workflows/<file>.yml` without `workflow` scope)
> ```
>
> Because of this, **workflow YAML files are not committed from Replit**. They must be authored and maintained through one of:
>
> 1. The GitHub Actions web UI (**Actions** tab → **New workflow**), or
> 2. A local clone authenticated with a Personal Access Token (classic) that has both `repo` and `workflow` scopes, or a fine-grained PAT with **Actions: Read and write** + **Contents: Read and write**.
>
> The CI workflow described below (`ci.yml`) and the mirror workflow (`mirror-centaur-server.yml`) are part of the spec's required automation but live outside the Replit push path. When the spec changes the expected CI jobs, update the workflow file via the GitHub UI or a local clone — do not attempt to commit the change from Replit.

### Required CI workflow (`.github/workflows/ci.yml`)

Create this workflow via the GitHub UI or a local clone. It runs on `push` to `main` and on `pull_request` against `main`, and provides the four status checks referenced by branch protection below (`typecheck`, `lint`, `test`, `codegen-drift`).

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  typecheck:
    name: TypeScript typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  lint:
    name: Biome lint + format check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint

  test:
    name: Vitest
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - run: pnpm test

  codegen-drift:
    name: Codegen drift check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.26.1
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "pnpm"
      - run: pnpm install --frozen-lockfile
      - name: Run codegen scripts
        run: |
          pnpm --filter @cyphid/convex-snek-platform codegen
          pnpm --filter @cyphid/convex-centaur-state codegen
          pnpm --filter @cyphid/snek-stdb codegen
      - name: Check for drift
        run: git diff --exit-code
```

### Configure branch protection on `main`

1. Go to **Settings → Branches → Add branch protection rule**.
2. Pattern: `main`.
3. Enable:
   - **Require a pull request before merging** (no direct push except from CI).
   - **Require status checks to pass** — add `lint`, `typecheck`, `test`, `spec-check`, the `no-archive-due-changes` merge-readiness status (posted by the `archive-due-gate` job; pending while an open change is archive-due), and `codegen-drift` once that workflow lands.
   - **Require branches to be up to date before merging.**
   - Leave **Require linear history** OFF — multi-commit change PRs land as merge commits carrying their phase structure (see root `AGENTS.md` → merge policy).
4. Save the rule.

### Create the mirror repository

The Centaur Server reference implementation is published to a separately-forkable mirror at `github.com/cyphid/snek-centaur-server`. Teams fork this mirror to build their own Centaur Server.

1. Create a new empty repository at `github.com/cyphid/snek-centaur-server`.
2. Do **not** initialise it with any files.

### Add the mirror deploy key

The CI workflow at `.github/workflows/mirror-centaur-server.yml` pushes to the mirror via SSH. You need to create a deploy key with write access.

1. Generate an SSH keypair:
   ```bash
   ssh-keygen -t ed25519 -C "mirror-deploy" -f mirror_key -N ""
   ```
2. In `github.com/cyphid/snek-centaur-server` → **Settings → Deploy keys**:
   - Add the **public key** (`mirror_key.pub`).
   - Enable **Allow write access**.
3. In `github.com/cyphid/snek-centaur-platform` → **Settings → Secrets and variables → Actions**:
   - Add a secret named `MIRROR_DEPLOY_KEY` with the **private key** contents (`mirror_key`).
4. Delete both key files from your local machine.

### First-time mirror publish

After the deploy key is configured, trigger the mirror workflow manually:

```bash
gh workflow run mirror-centaur-server.yml
```

Or push any change to `apps/centaur-server-reference/` or `packages/centaur-server-lib/` on `main`.

### Release tagging convention for centaur-server-lib

`centaur-server-lib` is versioned by Git tags. External consumers use `github:cyphid/snek-centaur-server-lib#v0.1.0`.

Tag format: `centaur-server-lib@v<semver>` (e.g. `centaur-server-lib@v0.1.0`).

```bash
git tag centaur-server-lib@v0.1.0
git push origin centaur-server-lib@v0.1.0
```

The mirror workflow reads the latest `centaur-server-lib@*` tag and rewrites the workspace dependency in the mirror's `package.json` to `github:cyphid/snek-centaur-server-lib#<version>`.

---

## npm Registry

*(Future upgrade path — not required initially.)*

External consumers currently use `github:cyphid/snek-centaur-server-lib#<tag>`. When the library stabilises, you may want to publish to npm for standard `npm install` / `pnpm add` semantics.

`centaur-server-lib/package.json` already has `publishConfig.access: public` and a valid `name`. When ready:

1. Create an npm organisation `@cyphid` at npmjs.com.
2. Add a publish step to the release workflow:
   ```yaml
   - run: pnpm --filter @cyphid/snek-centaur-server-lib publish --no-git-checks
     env:
       NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
   ```
3. Add `NPM_TOKEN` as a GitHub Actions secret (generate at npmjs.com → Access Tokens → Automation).

---

## Convex Dashboard

The `convex` CLI is a dependency of `packages/convex-host`, so there is nothing to install globally — `pnpm install` provides it.

### One-time, per developer

1. Create a Convex account at [convex.dev](https://convex.dev) and a project for the Snek platform (or get added to the existing one).
2. Create a **development** deploy key: dashboard → **Settings → Deploy Keys**.
3. Set `CONVEX_DEPLOY_KEY` as an environment variable in **your own** Claude Code cloud environment, or as a Replit Secret. Not in a file, and not in a shared environment — see `CLAUDE.md` → "Secrets and third-party resources". Use a dev key only; it is stored unencrypted and gated only by who can edit the environment.

There is deliberately no `.env.example`. The authoritative list of variables is the code that reads them — `packages/convex-host/src/env.ts`, which names every unset one at once and never prints a value. It reports rather than throws: a session that is only running tests or the UI is not stopped by a credential it never uses.

### Running it

```bash
pnpm dev:convex          # convex dev — pushes on change, watches
```

The first run provisions the deployment, writes `packages/convex-host/.env.local` (gitignored), and installs both components. Expect:

```
✔ Installed component snekPlatform.
✔ Installed component centaurState.
```

Verify the mounting rather than just the deploy — `platformStatus` calls through to both components, and each answers with its own name, so a green response proves both mounted and mounted as themselves:

```bash
pnpm --filter @cyphid/snek-convex-host exec convex run platform:platformStatus '{}'
# → { ok: true, components: [ "snekPlatform", "centaurState" ] }
```

Both component schemas are currently empty, so there are no tables to list yet — a table arrives with the capability change that fixes its fields. An empty schema still pushes, so this exercises the whole deploy path regardless: component mount, schema push, function push.

### Generated files are committed

`packages/*/convex/_generated/` is checked in. CI has no deploy key, so `pnpm typecheck` must not depend on regenerating it. Re-run `pnpm dev:convex` after changing a schema or a function signature and commit the result.

### Credential rotation

- Convex deployment credentials are scoped to the deployment. Rotate via the Convex dashboard → **Settings → Deploy Key**.
- Add any required secrets (e.g. STDB provisioning credentials, OIDC signing keys) via the Convex dashboard → **Settings → Environment Variables**.

---

## SpacetimeDB on Fly.io

*(Stub — fill in when the first STDB hosting task begins.)*

The platform runs its own SpacetimeDB host process on Fly.io rather than using SpacetimeDB Maincloud. SpacetimeDB Maincloud does not expose the per-database provisioning surface Convex needs to create a fresh database per game on demand (see spec module [04] §3.4 and module [05] §2.3.1 step 4), so a self-hosted host is required.

### Hosting model

The Fly.io app is configured for **scale-to-zero**: between Battle Bunker sessions, when no provisioned database is being addressed, Fly.io suspends the host's compute to bound idle cost. The host is resumed on demand by either:

1. The per-game `POST /v1/database` provisioning call issued by Convex on game start (spec [05-REQ-032] step 3 / [04] §3.4 step 4). This call will block while Fly.io resumes the host — a visible cold-start cost on the first game launched after an idle period.
2. A best-effort `POST /v1/warmup` call issued by Convex when a new game-configuration object is created (spec [04-REQ-072] / [04] §2.13 / §3.6 and [05-REQ-074] / [05] §2.5b). This is the primary path: it amortises the cold-start cost away from the game-launch critical path by waking the host while captains are still configuring and readying up.

### Convex environment variables

Set in the Convex dashboard → **Settings → Environment Variables**:

- `STDB_MANAGEMENT_BASE_URL` — the public URL of the Fly.io-hosted STDB host (e.g. `https://snek-stdb.fly.dev`). Used as the base for both `POST /v1/database` (under the platform-management JWT of spec [03-REQ-048] / [03] §3.22) and `POST /v1/warmup`.
- `STDB_WARMUP_TOKEN` — a static shared secret presented as `Authorization: Bearer <token>` on the `POST /v1/warmup` call. Distinct from the platform-management JWT; provisioned alongside the host's management credentials.

### TODO

Fill in once the first STDB hosting task begins:
- Fly.io app name, region selection, machine size, and scale-to-zero (auto-suspend / auto-start) configuration.
- Provisioning of the host's platform-management JWT verification key and the `STDB_WARMUP_TOKEN` shared secret.
- Deployment pipeline for publishing the STDB module WASM binary to Convex file storage (consumed per spec [05-REQ-073] / [05] §2.12).
- Operational runbook: cold-start latency expectations, warm-up failure handling, log access.

### Local development

No Fly.io and no Docker: `spacetime start` runs a standalone host natively.

```bash
pnpm dev:stdb        # host on 127.0.0.1:3000, data in .stdb/ (gitignored)
pnpm stdb:publish    # build the module and publish it as `snek-local`
```

`local` is a built-in server nickname pointing at `127.0.0.1:3000`, which is why neither command needs a `spacetime server add`.

Then drive it. Reducer arguments are **positional**, and SpacetimeDB renames camelCase identifiers to snake_case on the way out — both reducer names and column names — so the exported `ping` reducer's `engineDigest` field is queried as `engine_digest`:

```bash
spacetime call --server local snek-local ping "hello"
spacetime sql  --server local snek-local "SELECT * FROM module_info"
spacetime logs --server local snek-local
```

`ping` is the module's whole surface today, and it is worth more than a health check: `engine_digest` is BLAKE3 computed by the shared engine *inside the instance's V8 isolate*. It must equal what the same call produces locally —

```bash
node -e "import('./packages/engine/dist/index.js').then(m=>console.log(Buffer.from(m.subSeed(new Uint8Array(32),'hello')).toString('hex')))"
```

— which is what makes `global-invariants/one-shared-engine` achievable for the reducers that arrive with their capability changes: no shim, no polyfill, no vendored copy of the rules.

Three things bite here:

- **The build flag is `-p` / `--module-path`**, and the path is `packages/stdb/spacetimedb` — the module project, not the package root. (`--project-path` does not exist.)
- **A database name that resolves to the wrong host fails as a connection error, not a "no such server".** If `spacetime` cannot reach the instance, check that the host is actually on `127.0.0.1:3000` before suspecting anything else — `local` is hard-wired to that port, so a host started on another one produces a misleading failure.
- **A reducer that throws aborts its transaction** and is reported as a fatal instance error by the CLI; the actual message is in `spacetime logs`, not in the response. That is the intended failure mode for turn resolution — half a turn must never commit.

The Convex host can be pointed at a local STDB URL for dev by setting `STDB_MANAGEMENT_BASE_URL` to the local instance's URL. Local instances do not scale to zero, so the warm-up dispatch of spec [05-REQ-074] is a no-op (the local host always responds immediately).
