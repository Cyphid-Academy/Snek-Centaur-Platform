import { defineConfig } from "vitest/config";

// Tests for the repo's spec tooling (scripts/*.mjs). Discovered by the root
// vitest config's `projects` list, so they run as part of `pnpm test`.
export default defineConfig({
  test: {
    name: "spec-tooling",
    include: ["**/*.test.mjs"],
  },
});
