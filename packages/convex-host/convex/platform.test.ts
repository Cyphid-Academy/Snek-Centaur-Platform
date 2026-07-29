// spec: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary
// The host's public surface, exercised with both components mounted.
//
// Why this exists while the surface is one query: every authorization rule the
// auth work brings is server-side logic in this directory, and until now there
// was no way to run any of it without pushing to a deployment by hand — CI
// holds no deploy key. convex-test runs the real function bodies, with the
// components registered the way `convex.config.ts` mounts them, so a rule about
// who may do what can be tested where it is written rather than checked by
// hand afterwards.
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const hostModules = import.meta.glob("./**/*.ts");
const platformModules = import.meta.glob("../../convex-snek-platform/convex/**/*.ts");
const centaurModules = import.meta.glob("../../convex-centaur-state/convex/**/*.ts");

async function withComponents() {
  const platformSchema = (await import("../../convex-snek-platform/convex/schema.js")).default;
  const centaurSchema = (await import("../../convex-centaur-state/convex/schema.js")).default;
  const t = convexTest(schema, hostModules);
  t.registerComponent("snekPlatform", platformSchema, platformModules);
  t.registerComponent("centaurState", centaurSchema, centaurModules);
  return t;
}

describe("platformStatus", () => {
  it("answers through both components, each naming itself", async () => {
    // The names are the assertion, not the `ok`: they are unobtainable except
    // by calling through each component, and each component answers with its
    // own name — so a mounting that resolved to the wrong component is visible
    // rather than merely green.
    const t = await withComponents();

    expect(await t.query(api.platform.platformStatus, {})).toEqual({
      ok: true,
      components: ["snekPlatform", "centaurState"],
    });
  });

  it("still reaches a component whose schema holds no tables", async () => {
    // Both component schemas are empty until the capability changes that own
    // their tables land. That must not be the reason a mounting appears to
    // work: this pins that the call path is real while the tables are absent,
    // so the first table to arrive changes storage and not the boundary.
    const t = await withComponents();
    const status = await t.query(api.platform.platformStatus, {});

    expect(status.components).toHaveLength(2);
  });
});
