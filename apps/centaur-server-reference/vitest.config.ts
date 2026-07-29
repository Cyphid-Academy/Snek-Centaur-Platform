import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// Run by root `pnpm test` as a separate filtered invocation: both SvelteKit
// apps are excluded from workspace project discovery because their Vite
// transform conflicts with @sveltejs/kit resolution during a workspace run.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    // Matches the packages' convention: an app with no tests yet is not a
    // failure. Remove nothing here when the first test lands.
    passWithNoTests: true,
  },
});
