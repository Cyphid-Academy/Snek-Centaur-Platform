// The convex-test harness the suites beside these functions share: the host
// deployment with its components registered, the component-side seed mutations,
// and the `runInComponent` escape hatch.
//
// The double-dotted filename keeps it out of both the Convex bundle and
// vitest's `convex/**/*.{test,spec}.ts` collection.
import betterAuthTest from "@convex-dev/better-auth/test";
import { register as registerRateLimiter } from "@convex-dev/rate-limiter/test";
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-game-configuration";
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { type JWK, base64url, createLocalJWKSet } from "jose";
import { mutation as platformComponentMutation } from "../../convex-snek-platform/convex/_generated/server";
import {
  gameStatus,
  issuerRegistration,
  participantSnapshot,
} from "../../convex-snek-platform/convex/schema";
import { components } from "./_generated/api";
import { type CredentialPayload, verify } from "./auth/credential";
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

/** The host deployment with `snekPlatform`, `centaurState`, `rateLimiter` and `betterAuth` registered. */
export async function withComponents({
  platformExtras,
  register,
}: HarnessOptions = {}): Promise<Harness> {
  const platformSchema = (await import("../../convex-snek-platform/convex/schema.js")).default;
  const centaurSchema = (await import("../../convex-centaur-state/convex/schema.js")).default;
  // The signing key the deployment generates for itself is stored encrypted
  // under this secret, so every suite that mints needs one set — a value, not
  // a real secret, exactly as a developer's dev deployment holds one.
  process.env["BETTER_AUTH_SECRET"] ??= "a-secret-long-enough-for-better-auth-validation";
  const t = hostHarness();
  t.registerComponent(
    "snekPlatform",
    platformSchema,
    platformExtras ? { ...platformModules, ...platformExtras } : platformModules,
  );
  t.registerComponent("centaurState", centaurSchema, centaurModules);
  // Through the components' own helpers rather than module globs of our own: a
  // published component's sources sit behind a pnpm symlink that `import.meta.glob`
  // will not follow, and the helpers' globs are written relative to a file inside
  // each package, where they resolve. `betterAuth` is core here, not sign-in
  // plumbing: the deployment's credential-signing key lives in its `jwks`
  // table, so minting and verifying both read through it.
  registerRateLimiter(t);
  betterAuthTest.register(t as never, "betterAuth");
  register?.(t);
  return t;
}

/**
 * The deployment's published verification keys, exactly as a validating party
 * obtains them: fetched from the well-known address the platform serves.
 */
export async function publishedKeys(t: Harness): Promise<ReturnType<typeof createLocalJWKSet>> {
  const served = await (await t.fetch("/.well-known/jwks.json")).json();
  return createLocalJWKSet(served);
}

/**
 * Verify a credential the harnessed deployment minted, at `audience`, against
 * the keys it actually publishes — so what these suites assert is the full
 * arrangement a game instance or a Server relies on, not a mirror of it.
 */
export async function verifyIssued(
  t: Harness,
  token: string,
  expected: { issuer: string; audience: string },
): Promise<CredentialPayload> {
  return verify(token, await publishedKeys(t), expected);
}

// ---------------------------------------------------------------------------
// Seeding the platform component. It owns these tables and ships no
// registration or game-lifecycle writes yet, so the suites register their own
// mutations into its module map — they run inside the component, against its
// schema, exactly as the eventual owning changes' mutations will.
// ---------------------------------------------------------------------------

const seedModule = {
  seedIssuer: platformComponentMutation({
    args: issuerRegistration,
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
  // The status and snapshot validators are the schema's own, so a seeded game
  // is one the schema accepts by construction. The configuration half is filled
  // in here rather than asked of every caller: a game record carries a complete
  // configuration from the moment it exists, so a suite that is asking about
  // issuance should not have to say so
  // (spec: game-configuration/generation-parameters#a-default-for-every-generation-parameter).
  seedGame: platformComponentMutation({
    args: { status: gameStatus, roster: v.array(participantSnapshot) },
    returns: v.string(),
    handler: async (ctx, args) =>
      await ctx.db.insert("games", {
        ...args,
        config: DEFAULT_GAME_CONFIG,
        boardPreview: null,
        boardPreviewLocked: false,
      }),
  }),
  setGameStatus: platformComponentMutation({
    args: { gameId: v.string(), status: gameStatus },
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
// types, and a component's tables have no other path — they are unreachable
// from the host's `t.run`, which is the same isolation these tests rely on.
export const inComponent = <T>(
  t: Harness,
  component: string,
  fn: (ctx: { db: ComponentDb }) => Promise<T>,
) =>
  (t as unknown as { runInComponent: (path: string, f: typeof fn) => Promise<T> }).runInComponent(
    component,
    fn,
  );

export const inPlatformComponent = <T>(t: Harness, fn: (ctx: { db: ComponentDb }) => Promise<T>) =>
  inComponent(t, "snekPlatform", fn);

/**
 * Publish a keypair as the deployment's, stored exactly the way the `jwt`
 * plugin stores one — for suites that hold a keypair of their own and need
 * both halves of the arrangement: the seam accepting what the suite signed,
 * and the deployment's own minting signing with a key the suite can name.
 */
export const seedDeploymentKey = async (
  t: Harness,
  keypair: { publicJwk: JWK; privateJwk: JWK },
): Promise<void> => {
  const { symmetricEncrypt } = await import("better-auth/crypto");
  const privateKey = JSON.stringify(
    await symmetricEncrypt({
      key: process.env["BETTER_AUTH_SECRET"] ?? "",
      data: JSON.stringify(keypair.privateJwk),
    }),
  );
  const publicKey = JSON.stringify(keypair.publicJwk);
  await inComponent(t, "betterAuth", async (ctx) => {
    await ctx.db.insert("jwks", { publicKey, privateKey, createdAt: Date.now() });
  });
};

/**
 * The challenge a PKCE verifier answers to, computed the way the page that
 * begins a sign-in would rather than by importing issuance's own helper — so
 * the two agreeing is a result rather than a tautology.
 */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url.encode(new Uint8Array(digest));
}
