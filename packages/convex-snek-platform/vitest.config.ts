import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `convex/` holds the component's own schema and functions, so the suites
    // that read them live beside them. Convex's bundler skips filenames
    // containing more than one dot, so a `*.test.ts` there is never deployed.
    include: ["src/**/*.{test,spec}.ts", "convex/**/*.{test,spec}.ts"],
    passWithNoTests: true,
  },
});
