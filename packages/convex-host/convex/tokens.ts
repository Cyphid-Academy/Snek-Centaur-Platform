// Game access token issuance: the platform functions that mint the tokens
// under which a game's SpacetimeDB instance admits operators, spectators,
// coaches, and bots. Actions (not mutations) because minting signs with
// Web Crypto, which Convex affords to actions.
//
// Every issuance here:
//   - re-checks the game is CURRENTLY being played, at the moment of the
//     request — a finished (or not-yet-started) game refuses every role,
//     whatever the requester's remaining credential validity
//     (spec: identity-and-authorization/live-game-issuance);
//   - answers eligibility from the game record's roster snapshot fields,
//     never from current team records
//     (spec: identity-and-authorization/roster-snapshot-binding);
//   - mints a token whose SUBJECT encodes role + identity binding with the
//     platform's own durable ids, whose AUDIENCE is the one game instance
//     it may be used at, whose capabilities travel as a structured claim,
//     and which expires fifteen minutes after issuance
//     (spec: identity-and-authorization/game-token-contents,
//      identity-and-authorization/audience-bound-tokens,
//      identity-and-authorization/token-lifetime-and-refresh).
import {
  CAPABILITIES_CLAIM,
  type GameSubject,
  encodeGameSubject,
  gameAudience,
} from "@cyphid/snek-platform-auth";
import type { FunctionReference } from "convex/server";
import { v } from "convex/values";
import { components } from "./_generated/api.js";
import { type ResolvedCaller, platformAction } from "./lib/registry.js";
import { mintPlatformCredential } from "./lib/signing.js";

interface ComponentGamesInternalApi {
  readonly getGameInternal: FunctionReference<"query", "internal">;
}

const games = (components["snek-platform"] as unknown as { games: ComponentGamesInternalApi })
  .games;

/** The unredacted game doc's issuance-relevant shape. */
interface GameDocForIssuance {
  readonly phase: "configuring" | "playing" | "finished";
  readonly teams: ReadonlyArray<{
    readonly centaurTeamId: string;
    readonly name: string;
    readonly memberUserIds?: ReadonlyArray<string>;
    readonly coachUserIds?: ReadonlyArray<string>;
  }>;
}

export type TokenRejection =
  | { readonly kind: "game-not-found" }
  // spec: identity-and-authorization/live-game-issuance#no-tokens-for-finished-games
  | { readonly kind: "game-not-playing"; readonly phase: "configuring" | "finished" }
  // spec: identity-and-authorization/participant-token-eligibility#operator-outside-roster-refused
  | { readonly kind: "not-on-roster" }
  // spec: identity-and-authorization/coach-tokens#coach-of-nonparticipating-team-refused
  | { readonly kind: "team-not-participating" }
  | { readonly kind: "not-a-designated-coach" }
  // spec: identity-and-authorization/game-credential-scope
  | { readonly kind: "outside-credential-scope" };

export type TokenResult =
  | { readonly ok: true; readonly token: string; readonly expiresAtMs: number }
  | { readonly ok: false; readonly rejection: TokenRejection };

type IssuanceCtx = Parameters<typeof mintPlatformCredential>[0];

async function loadPlayingGame(
  ctx: IssuanceCtx,
  gameId: string,
): Promise<
  | { readonly ok: true; readonly game: GameDocForIssuance }
  | { readonly ok: false; readonly rejection: TokenRejection }
> {
  const game = (await ctx.runQuery(games.getGameInternal, {
    gameId,
  })) as GameDocForIssuance | null;
  if (game === null) {
    return { ok: false, rejection: { kind: "game-not-found" } };
  }
  // Liveness is re-checked per request; remaining cryptographic validity of
  // anything the requester holds confers nothing toward a game that has
  // ended (or not begun).
  // spec: identity-and-authorization/live-game-issuance#credential-dead-at-finish
  if (game.phase !== "playing") {
    return { ok: false, rejection: { kind: "game-not-playing", phase: game.phase } };
  }
  return { ok: true, game };
}

async function mintGameToken(
  ctx: IssuanceCtx,
  gameId: string,
  subject: GameSubject,
): Promise<TokenResult> {
  const minted = await mintPlatformCredential(ctx, {
    subject: encodeGameSubject(subject),
    // The audience IS the game binding: the instance checks it before
    // anything else about the token is considered.
    // spec: identity-and-authorization/game-token-contents#token-names-its-game
    audience: gameAudience(gameId),
    claims: {
      // Present and structured from the first token; EMPTY deliberately —
      // a game token's in-game privilege derives from the role its
      // subject encodes and from nothing else, so its capability claim
      // grants nothing. Attenuating later is a change to minting alone.
      // spec: identity-and-authorization/capability-claim-structure
      // spec: identity-and-authorization/game-token-contents#subject-alone-decides-the-role
      [CAPABILITIES_CLAIM]: [],
    },
  });
  return { ok: true, token: minted.credential, expiresAtMs: minted.expiresAtMs };
}

/**
 * Operator token: an authenticated human who is, per the roster snapshot,
 * a member of a participating team.
 * spec: identity-and-authorization/participant-token-eligibility
 */
export const issueOperatorToken = platformAction({
  capability: "issue-game-tokens",
  args: { gameId: v.string() },
  handler: async (ctx, args, caller): Promise<TokenResult> => {
    if (caller.kind !== "human") throw new Error("unreachable: kinds gate admits humans only");
    const loaded = await loadPlayingGame(ctx, args.gameId);
    if (!loaded.ok) return loaded;
    const member = loaded.game.teams.some((team) =>
      (team.memberUserIds ?? []).includes(caller.userId),
    );
    if (!member) {
      // spec: identity-and-authorization/participant-token-eligibility#operator-outside-roster-refused
      return { ok: false, rejection: { kind: "not-on-roster" } };
    }
    return await mintGameToken(ctx, args.gameId, {
      role: "operator",
      userId: caller.userId,
    });
  },
});

/**
 * Spectator token: ANY authenticated human, for a game being played. The
 * token binds the spectating human and the game only — no team binding is
 * ever attached, on request or by default; the absent binding is what
 * makes the connection a spectator connection.
 * spec: identity-and-authorization/spectator-tokens#no-team-binding
 */
export const issueSpectatorToken = platformAction({
  capability: "issue-game-tokens",
  args: { gameId: v.string() },
  handler: async (ctx, args, caller): Promise<TokenResult> => {
    if (caller.kind !== "human") throw new Error("unreachable: kinds gate admits humans only");
    const loaded = await loadPlayingGame(ctx, args.gameId);
    if (!loaded.ok) return loaded;
    // Team membership is not a precondition.
    // spec: identity-and-authorization/spectator-tokens#any-authenticated-human-may-request
    return await mintGameToken(ctx, args.gameId, {
      role: "spectator",
      userId: caller.userId,
    });
  },
});

/**
 * Coach token: a designated coach of a participating team — the platform
 * admin counting as an implicit coach of every team — bound to that team,
 * read-only by role.
 * spec: identity-and-authorization/coach-tokens
 */
export const issueCoachToken = platformAction({
  capability: "issue-game-tokens",
  args: { gameId: v.string(), teamId: v.string() },
  handler: async (ctx, args, caller): Promise<TokenResult> => {
    if (caller.kind !== "human") throw new Error("unreachable: kinds gate admits humans only");
    const loaded = await loadPlayingGame(ctx, args.gameId);
    if (!loaded.ok) return loaded;
    const team = loaded.game.teams.find((entry) => entry.centaurTeamId === args.teamId);
    if (team === undefined) {
      // Refused however valid the coach designation.
      // spec: identity-and-authorization/coach-tokens#coach-of-nonparticipating-team-refused
      return { ok: false, rejection: { kind: "team-not-participating" } };
    }
    const designated = (team.coachUserIds ?? []).includes(caller.userId);
    // The admin is an implicit coach of every team — read from the user
    // record's current value at resolution.
    // spec: identity-and-authorization/platform-admin-role#implicit-coach-everywhere
    if (!designated && !caller.isAdmin) {
      return { ok: false, rejection: { kind: "not-a-designated-coach" } };
    }
    return await mintGameToken(ctx, args.gameId, {
      role: "coach",
      userId: caller.userId,
      teamId: args.teamId,
    });
  },
});

/**
 * Bot token: issued only under a valid per-team game credential, for that
 * credential's OWN team, in that credential's OWN game — the one function
 * on this surface that departs from the humans-only default, declaring
 * the centaur-team kind.
 * spec: identity-and-authorization/participant-token-eligibility#bot-token-requires-team-credential
 * spec: identity-and-authorization/principal-kind-gating#service-reach-is-declared-never-inferred
 */
export const issueBotToken = platformAction({
  capability: "request-bot-tokens",
  kinds: ["centaur-team"],
  args: { gameId: v.string(), teamId: v.string() },
  handler: async (ctx, args, caller: ResolvedCaller): Promise<TokenResult> => {
    if (caller.kind !== "centaur-team") {
      throw new Error("unreachable: kinds gate admits centaur-team only");
    }
    // Scope enforcement: possession of a credential grants nothing outside
    // its named team and game.
    // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-team
    // spec: identity-and-authorization/game-credential-scope#not-valid-for-another-game
    if (caller.gameScope.gameId !== args.gameId || caller.gameScope.teamId !== args.teamId) {
      return { ok: false, rejection: { kind: "outside-credential-scope" } };
    }
    const loaded = await loadPlayingGame(ctx, args.gameId);
    if (!loaded.ok) return loaded;
    const registered = loaded.game.teams.some((entry) => entry.centaurTeamId === args.teamId);
    if (!registered) {
      return { ok: false, rejection: { kind: "team-not-participating" } };
    }
    return await mintGameToken(ctx, args.gameId, {
      role: "bot",
      teamId: args.teamId,
    });
  },
});
