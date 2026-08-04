// spec: global-invariants/single-convex-deployment, global-invariants/centaur-state-boundary
// The host's public surface, exercised with the components `convex.config.ts`
// actually mounts. Registration is derived from the config's own child
// components, so an unmounted component is an unregistered one.
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { GenericSchema, SchemaDefinition } from "convex/server";
import { describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import { centaurModules, hostModules, platformModules } from "./harness.testing";
import schema from "./schema";

type Modules = Record<string, () => Promise<unknown>>;

/** How to bring each mounted component up, by the name it mounts under. */
const MOUNTABLE: Record<
  string,
  { schema: () => Promise<{ default: SchemaDefinition<GenericSchema, boolean> }>; modules: Modules }
> = {
  snekPlatform: {
    schema: () => import("../../convex-snek-platform/convex/schema.js"),
    modules: platformModules,
  },
  centaurState: {
    schema: () => import("../../convex-centaur-state/convex/schema.js"),
    modules: centaurModules,
  },
  // A published component that is nonetheless registrable, unlike `betterAuth`
  // below: it ships its own `register` helper, whose module glob is written
  // inside the package and so resolves where one of ours could not reach.
  rateLimiter: {
    schema: async () => ({ default: rateLimiterTest.schema }),
    modules: rateLimiterTest.modules as Modules,
  },
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

/**
 * Components that mount in production but are not brought up for these tests,
 * and why.
 *
 * Being on this list is a decision, not an omission: an `app.use(...)` for
 * anything *not* named here fails `withComponents` rather than being skipped,
 * which is the whole point of deriving registration from the config. Removing a
 * mount is still caught either way — the mounting assertion below names all
 * three.
 */
const mountedButNotRegistered: Record<string, string> = {
  // A published component, whose schema and function modules live under
  // `node_modules` behind a pnpm symlink — out of reach of the `import.meta.glob`
  // that hands convex-test a module map. Nothing here calls through it: it is
  // the sign-in substrate, reached exclusively via `auth.ts`, and the rules
  // that matter about it are covered by the sign-in suites.
  betterAuth: "published component; sign-in substrate, covered by the signIn suites",
};

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
    if (name in mountedButNotRegistered) continue;
    const entry = MOUNTABLE[name];
    if (entry === undefined) {
      // A new `app.use(...)` with no entry above. Failing here is the point:
      // skipping it silently would reopen the gap this file exists to close.
      throw new Error(
        `convex.config.ts mounts "${name}", which this test cannot register. Add it to \`MOUNTABLE\`, or to \`mountedButNotRegistered\` with the reason.`,
      );
    }
    t.registerComponent(name, (await entry.schema()).default, entry.modules);
  }
  return t;
}

describe("component mounting", () => {
  it("mounts every component the deployment needs, under their own names", async () => {
    // `platformStatus` below proves the two it reaches through are mounted and
    // working. This is the only assertion covering `betterAuth`, which these
    // tests do not bring up but the deployment does.
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
