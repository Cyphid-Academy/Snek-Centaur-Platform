import { defineConfig } from "vitest/config";

// convex-test needs to be inlined so its import.meta.glob module maps resolve
// against this package's files; the edge-runtime environment approximates the
// Convex isolate (crypto.getRandomValues included).
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    environment: "edge-runtime",
    // @convex-dev/better-auth must be inlined too: its module code runs
    // inside the simulated isolate alongside our convex/ modules.
    server: { deps: { inline: ["convex-test", "@convex-dev/better-auth"] } },
    passWithNoTests: true,
  },
});
