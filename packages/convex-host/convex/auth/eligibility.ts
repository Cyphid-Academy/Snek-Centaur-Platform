// spec: identity-and-authorization/participant-token-eligibility,
//       identity-and-authorization/spectator-tokens,
//       identity-and-authorization/coach-tokens,
//       identity-and-authorization/live-game-issuance,
//       identity-and-authorization/roster-snapshot-binding
// Who may obtain which game access token — decided from values, never from the
// database.
//
// One function rather than one per role: three of the four roles share the
// liveness gate and the same participating-team set, so four entry points
// would repeat the `live-game-issuance` check four times and give it four
// places to be forgotten. The refusal reason is returned rather than thrown
// because the caller — the issuance mutation — owns how a refusal surfaces.
//
// Purity is the point. Every input arrives as an argument, so the rule this
// capability owns is decidable without a game record in hand and stays
// answerable from the initialization snapshot rather than from whatever the
// team records happen to say now (`roster-snapshot-binding`).
import type { GameSubject } from "@cyphid/snek-stdb/subject";
// The snapshot shape is the component schema's, inferred from its validator —
// one spelling, so a roster field renamed there fails to compile here rather
// than silently ceasing to match.
import type { ParticipantSnapshot } from "../../../convex-snek-platform/convex/schema";

export type { ParticipantSnapshot };

/**
 * The target game as issuance sees it: its identity, its status read *now*,
 * and the snapshot. Status is separate from the snapshot because it is the one
 * fact that must be current — `live-game-issuance` re-checks it per request,
 * while everything else is frozen at initialization.
 */
export interface GameForIssuance {
  readonly gameId: string;
  readonly status: "not-started" | "playing" | "finished";
  readonly roster: ReadonlyArray<ParticipantSnapshot>;
}

/**
 * What is being asked for, and by whom. A bot request carries the game
 * credential's own team and game — already verified as a credential by the
 * caller; what remains a *policy* question, and so lives here, is that it is
 * used for its own team in its own game.
 */
export type TokenRequest =
  | { readonly role: "operator" | "spectator"; readonly userId: string }
  | { readonly role: "coach"; readonly userId: string; readonly teamId: string }
  | { readonly role: "bot"; readonly credentialTeamId: string; readonly credentialGameId: string };

export type IssuanceRefusal =
  | "game-not-being-played"
  | "not-on-a-participating-team"
  | "not-a-coach-of-a-participating-team"
  | "credential-not-for-this-game";

export type IssuanceDecision =
  | { readonly ok: true; readonly subject: GameSubject }
  | { readonly ok: false; readonly refusal: IssuanceRefusal };

/**
 * Decide whether this request earns a token, and if so what its subject binds.
 * The subject comes back with the decision because the same facts settle both,
 * and deriving it twice is how a token ends up bound to a team the decision
 * never approved.
 *
 * `isPlatformAdmin` is the admin's implicit coach standing over every team
 * (`platform-admin-role#implicit-coach-everywhere`); it waives the designation,
 * never the participation check.
 */
export function decideGameTokenIssuance(
  game: GameForIssuance,
  request: TokenRequest,
  isPlatformAdmin = false,
): IssuanceDecision {
  // First, and for every role: cryptographic validity of whatever the
  // requester holds says nothing about a game that has ended or not begun.
  if (game.status !== "playing") return { ok: false, refusal: "game-not-being-played" };
  switch (request.role) {
    // Any authenticated human, team member or not, and no team binding ever.
    case "spectator":
      return { ok: true, subject: { role: "spectator", userId: request.userId } };
    case "operator":
      return game.roster.some((team) => team.memberUserIds.includes(request.userId))
        ? { ok: true, subject: { role: "operator", userId: request.userId } }
        : { ok: false, refusal: "not-on-a-participating-team" };
    case "coach": {
      // A team absent from the snapshot is not a participant, so a genuine
      // coach designation for it still earns nothing here.
      const team = game.roster.find((entry) => entry.teamId === request.teamId);
      return team && (isPlatformAdmin || team.coachUserIds.includes(request.userId))
        ? { ok: true, subject: { role: "coach", userId: request.userId, teamId: request.teamId } }
        : { ok: false, refusal: "not-a-coach-of-a-participating-team" };
    }
    case "bot":
      return request.credentialGameId === game.gameId &&
        game.roster.some((team) => team.teamId === request.credentialTeamId)
        ? { ok: true, subject: { role: "bot", teamId: request.credentialTeamId } }
        : { ok: false, refusal: "credential-not-for-this-game" };
  }
}
