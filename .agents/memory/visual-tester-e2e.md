---
name: Visual tester e2e on Replit
description: The proxy's port list applies to external ports, so reach the visual tester at its published one — not its local one
---

The Replit screenshot/testing proxy reaches a fixed set of ports (3000, 3001, 3002, 3003, 4200, 5000, 5173, 6000, 6800, 8000, 8008, 8080, 8099, 9000), and those are **external** ports — the right-hand side of `.replit`'s `[[ports]]` map, not the port the server binds locally.

The visual tester binds local 5001, which is not in that list and was once treated as the blocker. It is published on **external 3000**, which is — so address the published port and there is nothing to work around. The `Visual Tester` workflow already runs it as part of `Project`.

**Why:** screenshot and Playwright test subagents can only reach ports exposed by a running workflow; a detached shell server is unreachable however it is numbered.

**How to apply:** run the `Visual Tester` workflow and target external 3000. Check `.replit`'s port map before concluding a service is unreachable — the local port being off the proxy's list says nothing on its own. Don't repoint "Start application"; it serves the reference app on 5000. A temporary console workflow on a directly-supported port (e.g. `vite dev --port 5173 --host`) remains the fallback for a service with no published mapping at all.
