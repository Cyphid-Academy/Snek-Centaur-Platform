import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    // Scoped to src for the same reason as `include` above: `tsc -b` emits a
    // compiled copy of every bench into dist/, and the default benchmark glob
    // would then run each one twice and report the two halves as rivals.
    benchmark: { include: ["src/**/*.bench.ts"] },
  },
});
