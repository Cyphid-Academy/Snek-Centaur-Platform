import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// One project, unlike `apps/visual-tester`'s two: that app splits its suite
// because its logic tests need the SvelteKit pipeline's server resolution while
// its component tests need the client build. This package has no SvelteKit in
// it, so the client build serves every test here — the bare `svelte` plugin
// plus the "browser" resolve condition, which is what makes `mount` available
// to the `*.browser.test.ts` component tests.
//
// A single project also keeps this config discoverable from the root
// `vitest.config.ts` glob (`packages/*/vitest.config.ts`): nested projects are
// not a thing, so a two-project config here would have to be invoked as a
// separate filtered run the way the apps are.
export default defineConfig({
  plugins: [svelte()],
  resolve: { conditions: ["browser"] },
  test: {
    name: "@cyphid/snek-app-shell",
    include: ["src/**/*.{test,spec}.{js,ts}", "src/**/*.browser.{test,spec}.{js,ts}"],
    environment: "jsdom",
  },
});
