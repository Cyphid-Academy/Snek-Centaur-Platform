import { defineConfig } from "vitest/config";

// Root vitest config — runs all package test suites via project discovery.
// The Svelte app (apps/centaur-server-reference) is intentionally excluded:
// its Vite transform pipeline conflicts with @sveltejs/kit module resolution
// during workspace runs. App tests are run in isolation via the app's own
// `pnpm test` script when needed.
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts"],
  },
});
