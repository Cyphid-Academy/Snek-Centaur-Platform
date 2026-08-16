// Shared convex-test scaffolding for the host suites: environment, module
// globs (root app + the two locally-registered components), and identity
// helpers for the three principal kinds.
//
// Google OAuth is CONFIG-ONLY OFFLINE: no test completes a Google round
// trip (there is no Google to call), so suites assert the configuration
// (google provider present, no password path) and create user/session rows
// through internal test-support mutations as the stand-in for a completed
// sign-in. See tests/auth.test.ts.
import {
  ACTING_PRINCIPAL_CLAIM,
  CAPABILITIES_CLAIM,
  GAME_CREDENTIAL_CAPABILITIES,
  GAME_CREDENTIAL_SCOPE_CLAIM,
} from "@cyphid/snek-platform-auth";
import { convexTest } from "convex-test";
import type { FunctionReference, UserIdentity } from "convex/server";
import componentSchema from "../../convex-snek-platform/component/schema";
import { internal } from "../convex/_generated/api";
import authSchema from "../convex/betterAuth/schema";
import schema from "../convex/schema";

// Root app modules: everything under convex/ EXCEPT the locally-installed
// betterAuth component subtree (registered separately below). The glob must
// reach into _generated — that is how convex-test locates the module root.
const modules = import.meta.glob(["../convex/**/*.ts", "!../convex/betterAuth/**"]);
// The two components' module maps, globbed relative to this file.
const componentModules = import.meta.glob("../../convex-snek-platform/component/**/*.ts");
const authModules = import.meta.glob("../convex/betterAuth/**/*.ts");

export const TEST_SITE_URL = "http://localhost:3000";
export const TEST_CONVEX_SITE_URL = "http://127.0.0.1:3211";

/** Set the env Better Auth reads. Call from beforeAll in every suite. */
export function setAuthEnv(): void {
  Object.assign(process.env, {
    BETTER_AUTH_SECRET: "convex-host-test-secret-0123456789abcdef",
    SITE_URL: TEST_SITE_URL,
    CONVEX_SITE_URL: TEST_CONVEX_SITE_URL,
    // Config-only stand-ins: no test completes a Google round trip (see
    // the module header); these exist so construction is warning-free.
    GOOGLE_CLIENT_ID: "test-google-client-id",
    GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  });
}

export function setup() {
  const t = convexTest(schema, modules);
  t.registerComponent("snek-platform", componentSchema, componentModules);
  t.registerComponent("betterAuth", authSchema, authModules);
  return t;
}

export type T = ReturnType<typeof setup>;

/** The identity-attribute shape convex-test's withIdentity accepts. */
export type TestIdentity = Partial<UserIdentity>;

// ---------------------------------------------------------------------------
// Internal test-support references (untyped stub facade — see games.ts).
// ---------------------------------------------------------------------------

interface TestSupportApi {
  readonly createUser: FunctionReference<"mutation", "internal">;
  readonly setAdmin: FunctionReference<"mutation", "internal">;
  readonly createSession: FunctionReference<"mutation", "internal">;
  readonly revokeSession: FunctionReference<"mutation", "internal">;
  readonly setRosterSnapshot: FunctionReference<"mutation", "internal">;
  readonly finishGame: FunctionReference<"mutation", "internal">;
}
export const testSupport = (internal as unknown as { lib: { testSupport: TestSupportApi } }).lib
  .testSupport;

interface IssuanceInternalApi {
  readonly getRegistration: FunctionReference<"query", "internal">;
  readonly acceptJti: FunctionReference<"mutation", "internal">;
}
export const issuanceInternal = (internal as unknown as { lib: { issuance: IssuanceInternalApi } })
  .lib.issuance;

// ---------------------------------------------------------------------------
// Identity helpers
// ---------------------------------------------------------------------------

/** The capability entries every (non-admin) human working credential carries. */
export const HUMAN_CAPABILITIES = [
  { verb: "use-platform" },
  { verb: "configure-games" },
  { verb: "designate-boards" },
  { verb: "issue-game-tokens" },
] as const;

/** Create a user row and return its id plus a working-credential identity. */
export async function makeHuman(
  t: T,
  options: { readonly name?: string; readonly isAdmin?: boolean } = {},
): Promise<{ readonly userId: string; readonly identity: TestIdentity }> {
  const name = options.name ?? "Test Human";
  const user = (await t.mutation(testSupport.createUser, {
    name,
    email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
    isAdmin: options.isAdmin ?? false,
  })) as { _id: string };
  return { userId: user._id, identity: humanIdentity(user._id, options.isAdmin ?? false) };
}

/** The claim set of a human working JWT, as convex-test identity attributes. */
export function humanIdentity(userId: string, isAdmin = false): TestIdentity {
  return {
    subject: userId,
    issuer: TEST_CONVEX_SITE_URL,
    [CAPABILITIES_CLAIM]: isAdmin
      ? [...HUMAN_CAPABILITIES, { verb: "administer-platform" }]
      : [...HUMAN_CAPABILITIES],
  };
}

/** The claim set of a per-team game credential, as convex-test identity attributes. */
export function gameCredentialIdentity(teamId: string, gameId: string): TestIdentity {
  return {
    subject: teamId,
    issuer: TEST_CONVEX_SITE_URL,
    [ACTING_PRINCIPAL_CLAIM]: teamId,
    [GAME_CREDENTIAL_SCOPE_CLAIM]: { gameId, teamId },
    // Mapped to plain literals: interface-typed entries lack the implicit
    // index signature convex's JSONValue wants.
    [CAPABILITIES_CLAIM]: GAME_CREDENTIAL_CAPABILITIES.map((entry) => ({ verb: entry.verb })),
  };
}

// ---------------------------------------------------------------------------
// Game scaffolding
// ---------------------------------------------------------------------------

export const TEAMS = [
  { centaurTeamId: "team-red", name: "Red" },
  { centaurTeamId: "team-blue", name: "Blue" },
];

interface GamesApi {
  readonly createGame: FunctionReference<"mutation">;
  readonly getGame: FunctionReference<"query">;
  readonly updateConfig: FunctionReference<"mutation">;
  readonly updateRoster: FunctionReference<"mutation">;
  readonly setBoardLock: FunctionReference<"mutation">;
  readonly launchGame: FunctionReference<"mutation">;
}
import { api } from "../convex/_generated/api";
export const gamesApi = (api as unknown as { games: GamesApi }).games;

interface TokensApi {
  readonly issueOperatorToken: FunctionReference<"action">;
  readonly issueSpectatorToken: FunctionReference<"action">;
  readonly issueCoachToken: FunctionReference<"action">;
  readonly issueBotToken: FunctionReference<"action">;
}
export const tokensApi = (api as unknown as { tokens: TokensApi }).tokens;

/** Create, roster, and launch a game as the given human; returns gameId. */
export async function launchGameAs(t: T, identity: TestIdentity): Promise<string> {
  const asHuman = t.withIdentity(identity);
  const created = await asHuman.mutation(gamesApi.createGame, { roomId: null });
  if (!created.ok) throw new Error(`createGame failed: ${JSON.stringify(created)}`);
  const rostered = await asHuman.mutation(gamesApi.updateRoster, {
    gameId: created.gameId,
    teams: TEAMS,
  });
  if (!rostered.ok) throw new Error(`updateRoster failed: ${JSON.stringify(rostered)}`);
  const launched = await asHuman.mutation(gamesApi.launchGame, { gameId: created.gameId });
  if (!launched.ok) throw new Error(`launchGame failed: ${JSON.stringify(launched)}`);
  return created.gameId as string;
}
