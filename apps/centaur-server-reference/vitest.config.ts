import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// Run by root `pnpm test` as a separate filtered invocation — see the root
// vitest.config.ts for why.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "jsdom",
    // An app with no tests yet is not a failure.
    passWithNoTests: true,
  },
});
