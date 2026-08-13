# Agent Context — apps/e2e

This is `@cyphid/e2e`: the end-to-end scaffold. It brings the platform's three
runtime kinds up together on one machine and drives them as a running system.

It is a **Playwright Test** member, and the only one in the workspace — every
other suite is Vitest. Playwright is here for three things Vitest does not
give: worker fixtures that are built lazily and torn down in reverse order of
setup, an isolated browser context per test, and projects that run the same
spec file under Chromium, Firefox and WebKit without the spec knowing.

## Spec scope

None of its own. Harness lifecycle and browser selection are **testing
policy**, not platform behaviour — there is no `e2e` capability and there
should not be one. Each spec here cites the capability whose behaviour it
checks; the fixtures cite the invariants they honour (runtime ownership,
instance isolation, one Convex deployment).

## What goes here

- Worker fixtures for the runtimes: start, wait, stop.
- Scenarios that cross two or more runtimes.

## What does NOT go here

- **Anything a single runtime's own suite can check.** A rule about turn
  resolution belongs to the engine's tests; a rule about who may call a Convex
  function belongs to the host's. This member is for the defects that live
  *between* runtimes, and it costs a hundred times more per assertion.
- **Unit tests for the harness.** The lifecycle code that used to need them —
  a teardown registry, a browser wrapper, a substrate builder — is Playwright's
  now, and Playwright's is tested by Playwright.

## Layout

- `src/fixtures.ts` — the one interface a spec imports: `test`, `expect`, and
  the `runDir`, `spacetime`, `convex` and `centaurServer` fixtures.
- `src/process.ts` — spawn, capture, poll for readiness, terminate.
- `src/runtimes/` — one module per runtime kind.
- `src/*.integration.spec.ts` — runtime-only specs; no browser is launched.
- `src/*.browser.spec.ts` — specs driven through a real browser.

## Projects and commands

```bash
pnpm e2e            # integration + chromium — the default, for fast feedback
pnpm e2e:browsers   # chromium + firefox + webkit, the browser specs only
pnpm --filter @cyphid/e2e exec playwright test --project=integration
```

Four projects over **one worker**, and the worker count is a property of the
fixtures rather than a tuning choice: a worker owns a whole stack on ports it
asked the OS for, and a second worker would stand up a second stack beside it.

`e2e:browsers` carries `--pass-with-no-tests` because there is not yet a browser
spec on every branch: a scenario arrives with the capability whose behaviour it
checks, so the projects exist before their first spec does. Drop the flag once
one has landed and this member always has browser specs.

`integration` matches `*.integration.spec.ts` and launches no browser at all.
`chromium`, `firefox` and `webkit` each match `*.browser.spec.ts` — the same
files, three engines. Cross-browser coverage is therefore available and
CI-ready, while an ordinary local run stays integration plus Chromium.

## Why this is not in `pnpm verify`

`pnpm verify` is ~33s deliberately; three runtimes and a browser do not belong
in it. Root `vitest.config.ts` discovers test projects with a glob over
`packages/*` and does not look at `apps/*`, which is the other half of why this
member is under `apps/`. **Do not add it to that glob**, and do not add it to
the root `test` script's filtered runs — it is not a Vitest suite at all.

The composite build's references are likewise all under `packages/`, and exist
so consumers can resolve a package's built `dist/`. This member is a leaf —
nothing imports it and it publishes nothing — so it is typechecked by its own
`typecheck` script, chained from the root one, exactly as the two apps are.

## Prerequisites

- `spacetime` on `PATH` (`spacetime --version`).
- **Playwright's own browser binaries**, at the version matched to the
  `@playwright/test` in this package — Playwright refuses a browser build it
  did not install, so a system Chromium is not a substitute:

  ```bash
  pnpm --filter @cyphid/e2e exec playwright install chromium   # pnpm e2e
  pnpm --filter @cyphid/e2e exec playwright install            # pnpm e2e:browsers
  ```

  On a bare Linux host add `--with-deps` (it installs system libraries and
  needs root). Bump the browsers whenever `@playwright/test` is bumped.

- **The Convex local backend binary**, which is *not* pre-fetched, at the
  version pinned in `src/runtimes/convex.ts`. The error prints the exact
  `curl` command when it is missing — copy it and run it once.

  It is a `curl` and not a CLI invocation because
  `convex dev --local-backend-version` refuses unless a *local* deployment is
  already selected, which needs a Convex account. There is no account-free CLI
  route to a specific version. The cache is a plain directory of release
  artifacts and the CLI reads whatever is in it, so placing the pinned build
  there by hand is exactly what the CLI would have done.

  The version is **pinned**, not "whatever is newest in the cache". The CLI
  resolves the local backend by asking `version.convex.dev` for the latest
  build, so a developer who ran a Convex project last week has a different one
  cached from one who ran it today. Taking the newest thing present made a run's
  runtime artifact depend on what else that machine had done. Bump the pin
  deliberately, with the `convex` dependency.

## Implementation notes

**Every port is asked of the OS per run.** None of the documented defaults
(3000, 3210/3211, 5000) is used: those are where a developer's own `pnpm dev:*`
processes are, and a suite that claimed them would either fail to start or
succeed by writing to the developer's deployment.

**Fixtures are lazy, and that is load-bearing.** Playwright builds only the
fixtures a test names. A spec that asks for `convex` alone never starts a
SpacetimeDB host or waits on a Vite cold start. Do not add a fixture that
starts something on behalf of another, and do not collapse the four into one
"stack" fixture: that is exactly the substrate builder this replaced.

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
  developer's own configuration, so every CLI invocation snapshots and restores
  it. The `process.on("exit")` hook that does it is the **only** such hook in
  this member, and the comment there says why it cannot be a bare `finally`.
  Everything else is a fixture, and Playwright tears fixtures down.

**The browser is Playwright's `browser`, `context` and `page`.** There is no
wrapper and there should not be one: a context is already an isolated cookie
jar and storage partition, so two contexts are two humans in a way two tabs are
not, and Playwright gives each test its own. A wrapper's only remaining job
would be to let a spec *place* a session, which is the thing a scenario must
not be able to do.

**A new runtime the platform deploys is a runtime this member must start.** If
a fourth runtime kind ever arrives, it belongs in `src/runtimes/` and as a
fixture in `src/fixtures.ts`.
