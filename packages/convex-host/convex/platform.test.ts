// spec: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary
// The host's public surface, exercised with the components `convex.config.ts`
// actually mounts. Registration is derived from the config's own child
// components, so an unmounted component is an unregistered one.
import { convexTest } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

/** The components the host mounts, and where each one's convex directory is. */
const MOUNTABLE = [
  { name: "snekPlatform", dir: "convex-snek-platform" },
  { name: "centaurState", dir: "convex-centaur-state" },
] as const;

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

const hostModules = import.meta.glob("./**/*.ts");
const componentModules: Record<string, Record<string, () => Promise<unknown>>> = {
  "convex-snek-platform": import.meta.glob("../../convex-snek-platform/convex/**/*.ts"),
  "convex-centaur-state": import.meta.glob("../../convex-centaur-state/convex/**/*.ts"),
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
    const entry = MOUNTABLE.find((c) => c.name === name);
    if (entry === undefined) {
      // A new `app.use(...)` with no entry above. Failing here is the point:
      // skipping it silently would reopen the gap this file exists to close.
      throw new Error(
        `convex.config.ts mounts "${name}", which this test cannot register. Add it to \`MOUNTABLE\`.`,
      );
    }
    const componentSchema: SchemaDefinition<GenericSchema, boolean> = (
      entry.dir === "convex-snek-platform"
        ? await import("../../convex-snek-platform/convex/schema.js")
        : await import("../../convex-centaur-state/convex/schema.js")
    ).default;
    t.registerComponent(name, componentSchema, componentModules[entry.dir]);
  }
  return t;
}

describe("platformStatus", () => {
  it("answers through both components, each naming itself", async () => {
    const t = await withComponents();

    // Both component schemas are empty until the changes that own their tables
    // land; the names are unobtainable except by calling through each component,
    // so this pins that the call path is real while the tables are absent.
    expect(await t.query(api.platform.platformStatus, {})).toEqual({
      ok: true,
      components: ["snekPlatform", "centaurState"],
    });
  });
});
