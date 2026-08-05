// spec: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary
// The host's public surface, exercised with the components `convex.config.ts`
// actually mounts. Registration is derived from the config's own child
// components, so an unmounted component is an unregistered one.
import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { type Harness, centaurModules, hostModules, platformModules } from "./harness.testing";
import schema from "./schema";

/**
 * How to bring each mounted component up, by the name it mounts under. The
 * published components register through their own helpers, whose module globs
 * are written inside each package and so resolve where one of ours could not
 * reach.
 */
const MOUNTABLE: Record<string, (t: Harness) => Promise<void>> = {
  snekPlatform: async (t) =>
    t.registerComponent(
      "snekPlatform",
      (await import("../../convex-snek-platform/convex/schema.js")).default,
      platformModules,
    ),
  centaurState: async (t) =>
    t.registerComponent(
      "centaurState",
      (await import("../../convex-centaur-state/convex/schema.js")).default,
      centaurModules,
    ),
  rateLimiter: async (t) => rateLimiterTest.register(t),
  betterAuth: async (t) => betterAuthTest.register(t as never, "betterAuth"),
};

// `convex.config.ts` can only be *executed* by the Convex runtime: `app.use()`
// rejects a component definition carrying no `componentDefinitionPath`, because
// in a real bundle the import of a `convex.config.js` is rewritten to
// `{ componentDefinitionPath, defaultName }`. These mocks perform that rewrite,
// taking the name from the component's own `defineComponent(...)` call — so
// renaming one is still a visible change here.
const { asImported } = vi.hoisted(() => ({
  asImported: (actual: unknown) => {
    const definition = (actual as { default: { _name: string } }).default;
    return {
      default: {
        componentDefinitionPath: definition._name,
        defaultName: definition._name,
      },
    };
  },
}));

vi.mock("../../convex-snek-platform/convex/convex.config.js", async () =>
  asImported(await vi.importActual("../../convex-snek-platform/convex/convex.config.js")),
);
vi.mock("../../convex-centaur-state/convex/convex.config.js", async () =>
  asImported(await vi.importActual("../../convex-centaur-state/convex/convex.config.js")),
);
// The published components mount by package name, and are rewritten the same way.
vi.mock("@convex-dev/better-auth/convex.config.js", async () =>
  asImported(await vi.importActual("@convex-dev/better-auth/convex.config.js")),
);
vi.mock("@convex-dev/rate-limiter/convex.config.js", async () =>
  asImported(await vi.importActual("@convex-dev/rate-limiter/convex.config.js")),
);

/** The component names `convex.config.ts` mounts. */
async function mountedComponents(): Promise<ReadonlyArray<string>> {
  const app = (await import("./convex.config.js")).default as unknown as {
    _childComponents: ReadonlyArray<readonly [string, ...unknown[]]>;
  };
  return app._childComponents.map(([name]) => name);
}

async function withComponents() {
  const t = convexTest(schema, hostModules);
  for (const name of await mountedComponents()) {
    const register = MOUNTABLE[name];
    if (register === undefined) {
      // A new `app.use(...)` with no entry above. Failing here is the point:
      // skipping it silently would reopen the gap this file exists to close.
      throw new Error(
        `convex.config.ts mounts "${name}", which this test cannot register. Add it to \`MOUNTABLE\`.`,
      );
    }
    await register(t);
  }
  return t;
}

describe("component mounting", () => {
  it("mounts every component the deployment needs, under their own names", async () => {
    // `platformStatus` below proves the two it reaches through are mounted and
    // working.
    expect(await mountedComponents()).toEqual([
      "snekPlatform",
      "centaurState",
      "betterAuth",
      "rateLimiter",
    ]);
  });
});

describe("platformStatus", () => {
  it("answers through both components, each naming itself", async () => {
    const t = await withComponents();

    // The names are unobtainable except by calling through each component, so a
    // mounting that resolved to the wrong one is visible rather than green.
    expect(await t.query(api.platform.platformStatus, {})).toEqual({
      ok: true,
      components: ["snekPlatform", "centaurState"],
    });
  });
});
