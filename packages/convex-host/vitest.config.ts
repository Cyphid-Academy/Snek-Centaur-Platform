import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `convex/` holds the deployment's own functions, so its tests live beside
    // them. Convex's bundler skips filenames containing more than one dot, so a
    // `*.test.ts` there is never deployed.
    include: ["src/**/*.{test,spec}.ts", "convex/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    // convex-test runs function bodies in the environment the deployment runs
    // them in — an isolate, not Node — so the suite runs under edge-runtime.
    environment: "edge-runtime",
  },
});
