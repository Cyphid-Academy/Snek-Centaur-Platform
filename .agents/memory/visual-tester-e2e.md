---
name: Visual tester e2e on Replit
description: How to screenshot/e2e-test the visual tester app (port 5001) despite proxy port limits
---

The visual tester dev server runs on port 5001, which is not in the Replit screenshot/testing proxy's supported port list (3000, 3001, 3002, 3003, 4200, 5000, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000).

**Why:** Screenshot and Playwright test subagents can only reach ports exposed by a running workflow on a supported port; detached shell servers are unreachable.

**How to apply:** For visual verification or e2e tests, configure a temporary console workflow, e.g. `pnpm --filter @cyphid/visual-tester exec vite dev --port 5173 --host` with waitForPort 5173, run the screenshot/test against port 5173, then remove the workflow. Don't repoint "Start application" (it serves the reference app on 5000).
