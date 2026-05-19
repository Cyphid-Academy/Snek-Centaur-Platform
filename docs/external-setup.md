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

### Configure branch protection on `main`

1. Go to **Settings → Branches → Add branch protection rule**.
2. Pattern: `main`.
3. Enable:
   - **Require a pull request before merging** (no direct push except from CI).
   - **Require status checks to pass** — add `typecheck`, `lint`, `test`, `codegen-drift`.
   - **Require linear history** (squash or rebase merge only; this is important for subtree split).
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

*(Placeholder — fill in when the first Convex implementation task begins.)*

### Prerequisites

- A Convex account at [convex.dev](https://convex.dev).
- The Convex CLI: `pnpm add -g convex`.

### Steps

1. Log in: `npx convex login`.
2. Create a new Convex project for the Snek platform.
3. Note the deployment URL (e.g. `https://steady-hedgehog-123.convex.cloud`).
4. Configure your local environment:
   ```bash
   echo "CONVEX_DEPLOYMENT=<your-deployment>" >> packages/convex-host/.env.local
   ```
5. Push the schema and functions: `npx convex deploy --cmd 'pnpm build'`.

### Credential rotation

- Convex deployment credentials are scoped to the deployment. Rotate via the Convex dashboard → **Settings → Deploy Key**.
- Add any required secrets (e.g. STDB provisioning credentials, OIDC signing keys) via the Convex dashboard → **Settings → Environment Variables**.

---

## SpacetimeDB Maincloud

*(Placeholder — fill in when the first STDB implementation task begins.)*

### Prerequisites

- The SpacetimeDB CLI: follow instructions at [spacetimedb.com/install](https://spacetimedb.com/install).
- A SpacetimeDB Maincloud account.

### Steps

1. Log in: `spacetime login`.
2. Publish the STDB module: `spacetime publish <module-name> --project-path packages/stdb`.
3. Note the module address for use as the `stdbInstanceUrl` in game invitations.

### Local development

For local STDB development without Maincloud:
```bash
spacetime start    # start local STDB instance
spacetime publish snek-local --project-path packages/stdb
```

The Convex host can be pointed at a local STDB URL for dev by setting `STDB_LOCAL_URL` in your environment.
