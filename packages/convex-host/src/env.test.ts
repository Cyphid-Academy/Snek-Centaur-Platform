// spec: global-invariants/no-shared-secrets
import { describe, expect, it } from "vitest";
import { CONVEX_CLIENT_ENV, type EnvRequirement, describeMissing, missingEnv } from "./env.js";

// Fixtures, not the real rosters: what is under test is how a requirement is
// satisfied, and a suite pinned to the roster fails whenever a variable is added
// rather than when the rule changes.
const PLAIN: EnvRequirement = { name: "PRIMARY", why: "the primary" };
const WITH_ALT: EnvRequirement = { name: "PRIMARY", why: "the primary", alternatives: ["OTHER"] };
const names = (reqs: ReadonlyArray<EnvRequirement>, env: Record<string, string | undefined>) =>
  missingEnv(reqs, env).map((req) => req.name);

describe("missingEnv", () => {
  it("counts a variable set to the empty string as missing", () => {
    // A shell that exports a name with no value is the common way this goes
    // wrong, and a presence check calls it satisfied.
    expect(names([PLAIN], { PRIMARY: "" })).toEqual(["PRIMARY"]);
    expect(names([PLAIN], { PRIMARY: "x" })).toEqual([]);
  });

  it("accepts an alternative in place of the primary name", () => {
    expect(names([WITH_ALT], { OTHER: "x" })).toEqual([]);
    expect(names([WITH_ALT], { OTHER: "" })).toEqual(["PRIMARY"]);
  });

  it("reports every unsatisfied requirement at once, not just the first", () => {
    expect(names([PLAIN, { name: "SECOND", why: "the second" }], {})).toEqual([
      "PRIMARY",
      "SECOND",
    ]);
  });

  it("gives the client URL no alternative, so a CLI variable cannot satisfy it", () => {
    // The case the report exists to catch: `CONVEX_DEPLOY_KEY` addresses a
    // deployment for the CLI and is not a URL a `ConvexClient` accepts, so
    // accepting it here would go quiet in exactly the setup that later fails to
    // connect.
    const url = CONVEX_CLIENT_ENV.find((req) => req.name === "CONVEX_URL");

    expect(url?.alternatives ?? []).toEqual([]);
    expect(names([...CONVEX_CLIENT_ENV], { CONVEX_DEPLOY_KEY: "k" })).toContain("CONVEX_URL");
  });
});

describe("describeMissing", () => {
  it("names the alternative beside the primary, and prints no value", () => {
    const report = describeMissing(missingEnv([WITH_ALT], { PRIMARY: "", SECRET: "hunter2" }));

    expect(report).toContain("PRIMARY (or OTHER)");
    expect(report).not.toContain("hunter2");
  });
});
