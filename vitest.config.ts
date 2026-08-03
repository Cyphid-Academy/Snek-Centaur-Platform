import { defineConfig } from "vitest/config";

// Root vitest config — package test suites, by project discovery.
//
// The glob covers `packages/*` only. Both SvelteKit apps are excluded because
// their Vite transform conflicts with @sveltejs/kit resolution during a
// workspace run, so the root `test` script invokes each as its own filtered
// run. A new app needs adding there or its tests never run.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "scripts/vitest.config.ts"],
  },
});
