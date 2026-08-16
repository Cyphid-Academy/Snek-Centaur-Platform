// BUILD-TIME TOTALITY of the capability registry.
// spec: identity-and-authorization/capability-registry#unregistered-function-fails-the-build
//
// WHY THIS CONSTITUTES THE BUILD-TIME GUARANTEE HERE: `pnpm test` is a
// mandatory gate of `pnpm verify` and CI — the build this project ships
// through. This suite enumerates EVERY module under convex/ and fails on
// (a) any public Convex function that does not carry the registry's
// registration metadata, and (b) any raw Convex function constructor call
// outside the two sanctioned locations (lib/, where the registry itself
// lives, and betterAuth/, the vendored component). A public function added
// without declaring its capability therefore fails the build by
// construction, not by review — the registry is complete because an
// unregistered function cannot get past this gate, which is exactly the
// function nobody would notice in review.
import { beforeAll, describe, expect, it } from "vitest";
import { REGISTRATION_PROPERTY } from "../convex/lib/registry";
import { setAuthEnv } from "./setup";

// Every module that can define host functions. _generated is codegen
// output (no function definitions); betterAuth/ is the locally-installed
// component, whose functions live behind the component boundary and are
// not the host's public surface.
// convex.config.ts is excluded because defineApp().use() only evaluates
// inside the Convex runtime — it declares mounts, not functions.
const functionModules = import.meta.glob([
  "../convex/**/*.ts",
  "!../convex/_generated/**",
  "!../convex/convex.config.ts",
]);

// Raw sources for the constructor scan. lib/ is excluded HERE (the
// registry's own wrappers and internal helpers legitimately call the raw
// constructors) but NOT above: a public function defined in lib/ without
// registration metadata still fails check (a).
const rawSources = import.meta.glob(
  [
    "../convex/**/*.ts",
    "!../convex/_generated/**",
    "!../convex/lib/**",
    "!../convex/betterAuth/**",
  ],
  { query: "?raw", import: "default" },
);

beforeAll(() => {
  setAuthEnv();
});

interface ConvexFunctionLike {
  readonly isPublic?: boolean;
  readonly isInternal?: boolean;
  readonly isQuery?: boolean;
  readonly isMutation?: boolean;
  readonly isAction?: boolean;
  readonly isHttp?: boolean;
  readonly [key: string]: unknown;
}

const isConvexFunction = (value: unknown): value is ConvexFunctionLike => {
  if (typeof value !== "function") return false;
  const fn = value as unknown as ConvexFunctionLike;
  return (
    fn.isQuery === true || fn.isMutation === true || fn.isAction === true || fn.isHttp === true
  );
};

describe("capability registry totality", () => {
  it("every public Convex function carries the registry's registration metadata", async () => {
    const unregistered: string[] = [];
    let publicCount = 0;
    for (const [path, load] of Object.entries(functionModules)) {
      if (path.includes("/betterAuth/")) continue; // component boundary
      const module = (await load()) as Record<string, unknown>;
      for (const [exportName, value] of Object.entries(module)) {
        if (!isConvexFunction(value)) continue;
        const isPublicSurface = value.isPublic === true || value.isHttp === true;
        if (!isPublicSurface) continue; // internal functions are not client-reachable
        publicCount += 1;
        if (value[REGISTRATION_PROPERTY] === undefined) {
          unregistered.push(`${path} → ${exportName}`);
        }
      }
    }
    expect(unregistered, "public functions missing a capability/kind registration").toEqual([]);
    // Guard against the enumeration going vacuous (a broken glob would
    // otherwise pass silently): the surface currently has 6 game
    // functions + 4 token issuers + 3 http endpoints.
    expect(publicCount).toBeGreaterThanOrEqual(13);
  });

  it("no module outside lib/ and betterAuth/ calls a raw Convex function constructor", async () => {
    // spec: identity-and-authorization/capability-registry#unregistered-function-fails-the-build
    const pattern =
      /\b(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\s*\(/;
    const offenders: string[] = [];
    let scanned = 0;
    for (const [path, load] of Object.entries(rawSources)) {
      const source = (await load()) as string;
      scanned += 1;
      const lines = source.split("\n");
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i] as string;
        const withoutComments = line.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "");
        if (pattern.test(withoutComments)) {
          offenders.push(`${path}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offenders, "raw Convex constructors outside lib/ and betterAuth/").toEqual([]);
    expect(scanned).toBeGreaterThanOrEqual(6);
  });
});
