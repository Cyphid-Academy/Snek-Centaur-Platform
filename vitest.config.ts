import { defineConfig } from "vitest/config";

// Root vitest config — runs all package test suites via project discovery.
//
// The glob covers `packages/*` and deliberately does NOT cover `apps/*`, so
// every member under `apps/` is invoked instead by an explicit filtered run
// from the root `test` script. Two different reasons converge on that:
//
//   * both SvelteKit apps' Vite transform pipeline conflicts with
//     @sveltejs/kit module resolution during a workspace run;
//   * `apps/e2e` starts four processes and a browser, which must never happen
//     inside the fast battery.
//
// Adding `apps/*` here would silently undo both. Adding a member's tests to the
// battery is a decision about what the battery is for, not a glob tidy-up.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "scripts/vitest.config.ts"],
  },
});
