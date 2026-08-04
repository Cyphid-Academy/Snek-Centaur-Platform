// The convex-test harness the suites beside these functions share: the host
// deployment with its components registered, the component-side seed mutations,
// and the `runInComponent` escape hatch.
//
// The double-dotted filename keeps it out of both the Convex bundle and
// vitest's `convex/**/*.{test,spec}.ts` collection.
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { base64url } from "jose";
import { mutation as platformComponentMutation } from "../../convex-snek-platform/convex/_generated/server";
import { components } from "./_generated/api";
import schema from "./schema";

export const hostModules = import.meta.glob("./**/*.ts");
export const platformModules = import.meta.glob("../../convex-snek-platform/convex/**/*.ts");
export const centaurModules = import.meta.glob("../../convex-centaur-state/convex/**/*.ts");

type ModuleMap = Record<string, () => Promise<unknown>>;

function hostHarness() {
  return convexTest(schema, hostModules);
}
/** The object `convexTest` returns, as these suites hold it. */
export type Harness = ReturnType<typeof hostHarness>;

export interface HarnessOptions {
  /** Extra modules registered into the platform component's own module map. */
  platformExtras?: ModuleMap;
  /** Registers anything else the suite needs on the harness — Better Auth's test helper, say. */
  register?: (t: Harness) => void;
}

/** The host deployment with `snekPlatform`, `centaurState` and `rateLimiter` registered. */
export async function withComponents({
  platformExtras,
  register,
}: HarnessOptions = {}): Promise<Harness> {
  const platformSchema = (await import("../../convex-snek-platform/convex/schema.js")).default;
  const centaurSchema = (await import("../../convex-centaur-state/convex/schema.js")).default;
  const t = hostHarness();
  t.registerComponent(
    "snekPlatform",
    platformSchema,
    platformExtras ? { ...platformModules, ...platformExtras } : platformModules,
  );
  t.registerComponent("centaurState", centaurSchema, centaurModules);
  // Through the component's own helper rather than a module glob of our own: a
  // published component's sources sit behind a pnpm symlink that `import.meta.glob`
  // will not follow, and the helper's glob is written relative to a file inside
  // the package, where it resolves.
  registerRateLimiter(t);
  register?.(t);
  return t;
}

// ---------------------------------------------------------------------------
// Seeding the platform component. It owns these tables and ships no
// registration or game-lifecycle writes yet, so the suites register their own
// mutations into its module map — they run inside the component, against its
// schema, exactly as the eventual owning changes' mutations will.
// ---------------------------------------------------------------------------

const GAME_STATUS = v.union(v.literal("not-started"), v.literal("playing"), v.literal("finished"));

const seedModule = {
  seedIssuer: platformComponentMutation({
    args: {
      issuerId: v.string(),
      verificationMaterialUrl: v.string(),
      capabilityCeiling: v.array(v.string()),
      returnAddresses: v.array(v.string()),
    },
    returns: v.null(),
    handler: async (ctx, args) => {
      await ctx.db.insert("trusted_issuers", args);
      return null;
    },
  }),
  // Takes the whole document unvalidated, so a test can attempt to store what
  // the schema must refuse — the refusal is the assertion.
  seedIssuerRaw: platformComponentMutation({
    args: { doc: v.any() },
    returns: v.null(),
    handler: async (ctx, args) => {
      await ctx.db.insert("trusted_issuers", args.doc);
      return null;
    },
  }),
  seedTeam: platformComponentMutation({
    args: { serverDomain: v.union(v.string(), v.null()) },
    returns: v.string(),
    handler: async (ctx, args) => await ctx.db.insert("centaur_teams", args),
  }),
  seedGame: platformComponentMutation({
    args: {
      status: GAME_STATUS,
      roster: v.array(
        v.object({
          teamId: v.string(),
          memberUserIds: v.array(v.string()),
          coachUserIds: v.array(v.string()),
        }),
      ),
    },
    returns: v.string(),
    handler: async (ctx, args) => await ctx.db.insert("games", args),
  }),
  seedAdmin: platformComponentMutation({
    args: { userId: v.string() },
    returns: v.null(),
    handler: async (ctx, args) => {
      await ctx.db.insert("platform_admins", args);
      return null;
    },
  }),
  setGameStatus: platformComponentMutation({
    args: { gameId: v.string(), status: GAME_STATUS },
    returns: v.null(),
    handler: async (ctx, args) => {
      const id = ctx.db.normalizeId("games", args.gameId);
      if (!id) throw new Error(`no game ${args.gameId}`);
      await ctx.db.patch(id, { status: args.status });
      return null;
    },
  }),
};

/** Pass as `platformExtras` to make `platformSeed` callable on the harness. */
export const seedModules: ModuleMap = {
  "../../convex-snek-platform/convex/testSeed.ts": async () => seedModule,
};

type SeedMutation<Args extends Record<string, unknown>, Ret> = FunctionReference<
  "mutation",
  "public",
  Args,
  Ret
>;
type GameStatus = "not-started" | "playing" | "finished";

// The generated `components` type predates this module; the runtime object is a
// generic proxy, so the cast only widens the type to what the proxy supports.
export const platformSeed = (
  components as unknown as {
    snekPlatform: {
      testSeed: {
        seedIssuer: SeedMutation<
          {
            issuerId: string;
            verificationMaterialUrl: string;
            capabilityCeiling: string[];
            returnAddresses: string[];
          },
          null
        >;
        seedIssuerRaw: SeedMutation<{ doc: unknown }, null>;
        seedTeam: SeedMutation<{ serverDomain: string | null }, string>;
        seedGame: SeedMutation<
          {
            status: GameStatus;
            roster: { teamId: string; memberUserIds: string[]; coachUserIds: string[] }[];
          },
          string
        >;
        seedAdmin: SeedMutation<{ userId: string }, null>;
        setGameStatus: SeedMutation<{ gameId: string; status: GameStatus }, null>;
      };
    };
  }
).snekPlatform.testSeed;

// ---------------------------------------------------------------------------
// Reaching the component's tables directly.
// ---------------------------------------------------------------------------

export interface ComponentDb {
  insert(table: string, value: Record<string, unknown>): Promise<string>;
  query(table: string): { collect(): Promise<Array<Record<string, unknown>>> };
}

// convex-test exposes `runInComponent` at runtime without declaring it in its
// types, and the component's tables have no other path — they are unreachable
// from the host's `t.run`, which is the same isolation these tests rely on.
export const inPlatformComponent = <T>(t: Harness, fn: (ctx: { db: ComponentDb }) => Promise<T>) =>
  (t as unknown as { runInComponent: (path: string, f: typeof fn) => Promise<T> }).runInComponent(
    "snekPlatform",
    fn,
  );

/**
 * The challenge a PKCE verifier answers to, computed the way the page that
 * begins a sign-in would rather than by importing issuance's own helper — so
 * the two agreeing is a result rather than a tautology.
 */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}
