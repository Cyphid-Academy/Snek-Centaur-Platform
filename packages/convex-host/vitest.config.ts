import { defineConfig } from "vitest/config";

// convex-test needs to be inlined so its import.meta.glob module maps resolve
// against this package's files; the edge-runtime environment approximates the
// Convex isolate (crypto.getRandomValues included).
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    passWithNoTests: true,
  },
});
