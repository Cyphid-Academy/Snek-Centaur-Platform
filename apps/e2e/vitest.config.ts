import { defineConfig } from "vitest/config";

// The harness's own runner.
//
// Not discovered by the root config's project glob, which covers `packages/*`
// and not `apps/*` — that is why this member is under `apps/` at all. The fast
// battery must not start four processes, and the way to guarantee that is to be
// somewhere discovery does not look, rather than to rely on a name.
// design: mint-e2e
export default defineConfig({
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    // Bringing the substrate up costs tens of seconds before an assertion runs.
    testTimeout: 300_000,
    hookTimeout: 300_000,
    teardownTimeout: 60_000,
    // One file at a time. Each holds a whole substrate — four processes and a
    // browser — and the machines this runs on have four cores, so overlapping
    // files trade a real chance of timing out for a wall-clock saving that
    // never materialises.
    fileParallelism: false,
  },
});
