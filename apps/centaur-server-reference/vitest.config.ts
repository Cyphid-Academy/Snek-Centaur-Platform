import { sveltekit } from "@sveltejs/kit/vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// Run by root `pnpm test` as a separate filtered invocation — see the root
// vitest.config.ts for why.
//
// Two projects, the same split `apps/visual-tester` makes and for the same
// reason. Plain logic tests run under the SvelteKit pipeline (its server
// resolution, and its `$lib`/`$app` aliases). Component tests
// (`*.browser.test.ts`) mount real Svelte components, which needs the client
// build — so they use the bare `svelte` plugin with the "browser" resolve
// condition, because sveltekit()'s SSR conditions would pull the server build
// and make `mount` unavailable.
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        plugins: [sveltekit()],
        test: {
          name: "logic",
          include: ["src/**/*.{test,spec}.{js,ts}"],
          exclude: ["src/**/*.browser.{test,spec}.{js,ts}"],
          environment: "jsdom",
          // An app with no tests of a kind is not a failure.
          passWithNoTests: true,
        },
      },
      {
        extends: true,
        plugins: [svelte()],
        resolve: { conditions: ["browser"] },
        test: {
          name: "components",
          include: ["src/**/*.browser.{test,spec}.{js,ts}"],
          environment: "jsdom",
          passWithNoTests: true,
        },
      },
    ],
  },
});
