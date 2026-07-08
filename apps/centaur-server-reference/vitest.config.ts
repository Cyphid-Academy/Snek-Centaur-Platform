import { defineConfig } from "vitest/config";

// Plain vitest config — deliberately no SvelteKit plugin and no DOM
// environment: app tests are pure TS (bot logic), and this file overrides
// vite.config.ts for test runs. App tests run in isolation from the root
// workspace suite; see the root vitest.config.ts note.
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
