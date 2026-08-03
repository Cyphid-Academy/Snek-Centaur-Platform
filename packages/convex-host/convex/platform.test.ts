// spec: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary
// The host's public surface, exercised with the components `convex.config.ts`
// actually mounts.
//
// Why this exists while the surface is one query: every authorization rule the
// auth work brings is server-side logic in this directory, and until now there
// was no way to run any of it without pushing to a deployment by hand — CI
// holds no deploy key. convex-test runs the real function bodies, so a rule
// about who may do what can be tested where it is written rather than checked
// by hand afterwards.
//
// The mounting itself is derived, not restated. An earlier version of this file
// called `registerComponent` twice from a hand-written list, which meant the
// test passed whether or not `convex.config.ts` mounted anything: deleting an
// `app.use(...)` in production left this green. Registration now comes from the
// config's own child components, so an unmounted component is an unregistered
// component, and `platformStatus` — which reaches through both — goes red.
import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

// `convex.config.ts` can only be *executed* by the Convex runtime: `app.use()`
// rejects a component definition carrying no `componentDefinitionPath`, because
// in a real bundle the import of a `convex.config.js` is rewritten to
// `{ componentDefinitionPath, defaultName }`. These mocks perform that same
// rewrite, and take the name from the component's own `defineComponent(...)`
// call rather than supplying one — so the name a component mounts under is
// still the component's own, and renaming one is still a visible change here.
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

const hostModules = import.meta.glob("./**/*.ts");
const platformModules = import.meta.glob("../../convex-snek-platform/convex/**/*.ts");
const centaurModules = import.meta.glob("../../convex-centaur-state/convex/**/*.ts");

/** How to bring a mounted component up under convex-test, by the name it mounts as. */
const registrable: Record<
  string,
  () => Promise<{
    schema: unknown;
    modules: Record<string, () => Promise<unknown>>;
  }>
> = {
  snekPlatform: async () => ({
    schema: (await import("../../convex-snek-platform/convex/schema.js")).default,
    modules: platformModules,
  }),
  centaurState: async () => ({
    schema: (await import("../../convex-centaur-state/convex/schema.js")).default,
    modules: centaurModules,
  }),
};

/** The component names `convex.config.ts` mounts, in mounting order. */
async function mountedComponents(): Promise<ReadonlyArray<string>> {
  const app = (await import("./convex.config.js")).default as unknown as {
    _childComponents: ReadonlyArray<readonly [string, ...unknown[]]>;
  };
  return app._childComponents.map(([name]) => name);
}

async function withComponents() {
  const t = convexTest(schema, hostModules);
  for (const name of await mountedComponents()) {
    const bring = registrable[name];
    if (bring === undefined) {
      // A new `app.use(...)` with no entry above. Failing here is the point:
      // skipping it silently would reopen the gap this file exists to close.
      throw new Error(
        `convex.config.ts mounts "${name}", which this test cannot register. Add it to \`registrable\`.`,
      );
    }
    const { schema: componentSchema, modules } = await bring();
    // biome-ignore lint/suspicious/noExplicitAny: convex-test keys registration on the component's own schema type.
    t.registerComponent(name, componentSchema as any, modules as any);
  }
  return t;
}

describe("component mounting", () => {
  it("mounts both components, under their own names", async () => {
    // What production mounts, stated once. `platformStatus` below proves the
    // mounting *works*; this proves nothing quietly stopped being mounted.
    expect(await mountedComponents()).toEqual(["snekPlatform", "centaurState"]);
  });
});

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
