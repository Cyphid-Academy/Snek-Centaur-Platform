import { defineConfig } from "vitest/config";

// Root vitest config — package test suites, by project discovery.
//
// The glob covers `packages/*` only, and nothing under `apps/` is discovered.
// The two SvelteKit apps are invoked as filtered runs from the root `test`
// script, because their Vite transform conflicts with @sveltejs/kit resolution
// during a workspace run; a new app needs adding there or its tests never run.
// `apps/e2e` is not a Vitest suite at all — it is Playwright Test, invoked from
// `pnpm e2e` and from nothing in `verify`, because it starts three runtimes and
// a browser.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "scripts/vitest.config.ts"],
  },
});
