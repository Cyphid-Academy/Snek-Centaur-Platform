# Agent Context — apps/e2e

This is `@cyphid/e2e`: the end-to-end harness. It brings the platform's three
runtime kinds up together on one machine and drives them as a running system.

## Spec scope

- **`e2e`** (`openspec/changes/mint-e2e/specs/e2e/spec.md` until it archives) —
  what the harness must *be*: real runtimes it owns the lifecycle of, nothing
  off-machine, sign-in through the platform's own path with only its external
  verification step substituted, and human-facing surfaces driven through a real
  browser.

## What goes here

- Process fixtures for the runtimes: start, wait, stop.
- The browser fixture, and whatever a scenario needs to act as a given human.
- Scenarios that cross two or more runtimes.

## What does NOT go here

- **Anything a single runtime's own suite can check.** A rule about turn
  resolution belongs to the engine's tests; a rule about who may call a Convex
  function belongs to the host's. This member is for the defects that live
  *between* runtimes, and it costs a hundred times more per assertion.
- Assertions the harness makes about itself in place of a scenario. The
  fixtures are exercised by the scenarios that use them.

## Why this is under `apps/` and not `packages/`

Root `vitest.config.ts` discovers test projects with a glob over `packages/*`
and does not look at `apps/*` — which is why both SvelteKit apps are invoked as
explicit filtered runs from the root `test` script. Under `packages/` this
member would be pulled into the fast battery automatically, and the only way to
stop it would be to misname this directory's `vitest.config.ts` so the glob
missed it.

**Do not add this member to that glob.** `pnpm verify` is ~33s deliberately;
four processes and a browser do not belong in it. The harness runs from
`pnpm e2e`.

The other half of the reason: the root composite build's references are
hand-listed and all under `packages/`, and exist so consumers can resolve a
package's built `dist/`. This member is a leaf — nothing imports it and it
publishes nothing — so it is typechecked by its own `typecheck` script, chained
from the root one, exactly as the two apps are.

## Running it

```bash
pnpm e2e                 # the whole suite
pnpm --filter @cyphid/e2e exec vitest run src/some.test.ts
```

Prerequisites, all of which the environments already satisfy except the last:

- `spacetime` on `PATH` (`spacetime --version`).
- A browser. Both development environments ship one; the fixture finds it under
  `PLAYWRIGHT_BROWSERS_PATH` because its revision is not the one this version of
  Playwright would download. Do **not** run `playwright install`.
- **The Convex local backend binary**, which is *not* pre-fetched. Run
  `pnpm dev:convex:local` once and stop it; the CLI caches the binary under
  `~/.cache/convex/binaries` and every later run finds it there. The harness
  deliberately does not download it — the CLI already knows which version it
  wants, and a second downloader would eventually disagree.

## Implementation notes

**Every port is asked of the OS per run.** None of the documented defaults
(3000, 3210/3211, 5000) is used: those are where a developer's own `pnpm dev:*`
processes are, and a suite that claimed them would either fail to start or
succeed by writing to the developer's deployment.

**Convex runs as a self-hosted backend, not `convex dev` in anonymous mode.**
Anonymous mode picks its own ports and keeps its data between invocations, so a
run would inherit the previous run's state. Driving the backend binary directly
takes explicit ports, an explicit SQLite file, and an explicit storage
directory, all per-run and discarded. Functions are still pushed with the
ordinary CLI, so what a test exercises is what `convex dev` would have deployed.

Two consequences worth knowing before changing `runtimes/convex.ts`:

- The backend writes file storage to `convex_local_storage/` **relative to its
  working directory** unless told otherwise. Started from the repository, that
  is an untracked directory appearing after every run.
- `convex dev --once` writes the deployment it targeted back to
  `packages/convex-host/.env.local` regardless of `--env-file`. That is a
  developer's own configuration, so the push snapshots and restores it.

**Teardown is a process-wide registry, not a `finally`.** A partially started
substrate has already spawned real processes, and those are precisely the ones a
per-caller cleanup misses. `stopAll()` is wired to `exit`, `SIGINT` and
`SIGTERM`.

**A new runtime the platform deploys is a runtime this harness must start.** If
a fourth runtime kind ever arrives, it belongs in `src/runtimes/` and in
`startSubstrate`; a substrate missing one is a substrate whose passing runs mean
less than they appear to.

## Key files

- `src/substrate.ts` — the one entry point a scenario uses
- `src/service.ts` — spawn, readiness, teardown registry
- `src/runtimes/` — one module per runtime kind
- `src/browser.ts` — the browser, and one session per human
