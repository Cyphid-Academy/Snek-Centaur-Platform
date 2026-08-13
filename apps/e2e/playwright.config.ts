import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// An environment that pre-installs a Chromium of its own (the cloud
// development container does, at a browsers path this Playwright version will
// not resolve) names it in `.claude/settings.json`; anywhere the named binary
// does not exist — a local machine with ordinary Playwright browsers — the
// variable is ignored rather than trusted.
const preinstalledChromium = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
const chromiumLaunch =
  preinstalledChromium && existsSync(preinstalledChromium)
    ? { launchOptions: { executablePath: preinstalledChromium } }
    : {};

// The harness's runner.
//
// Four projects over one worker. `integration` runs the runtime-only specs and
// launches no browser at all; `chromium`, `firefox` and `webkit` run the
// browser specs, the same files under three engines, because a project is how
// Playwright says "these tests again, elsewhere" without the tests knowing.
//
// One worker, and that is a property of the fixtures rather than a tuning
// choice: a worker owns a whole stack — three runtimes on ports it asked the OS
// for — and a second worker would stand up a second stack beside it on a
// machine that has room for neither.
export default defineConfig({
  testDir: "./src",
  // Bringing the stack up costs tens of seconds before an assertion runs, and
  // publishing the SpacetimeDB module compiles it.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  forbidOnly: Boolean(process.env["CI"]),
  workers: 1,
  reporter: [["list"]],
  projects: [
    {
      name: "integration",
      testMatch: /.*\.integration\.spec\.ts$/,
    },
    {
      name: "chromium",
      testMatch: /.*\.browser\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"], ...chromiumLaunch },
    },
    {
      name: "firefox",
      testMatch: /.*\.browser\.spec\.ts$/,
      use: devices["Desktop Firefox"],
    },
    {
      name: "webkit",
      testMatch: /.*\.browser\.spec\.ts$/,
      use: devices["Desktop Safari"],
    },
  ],
});
