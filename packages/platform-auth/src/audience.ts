// spec: identity-and-authorization/audience-bound-tokens
//
// Every credential the platform issues names the exact resource it may be
// used at, and every resource checks that binding before anything else
// about the credential is considered — a leaked credential is inert
// everywhere but where it was meant to be used.

/** The platform's own functions, as an audience. */
export function platformAudience(): "cyphid-platform" {
  return "cyphid-platform";
}

/**
 * A specific game's instance, as an audience.
 *
 * spec: identity-and-authorization/game-token-contents#token-names-its-game
 *
 * DECISION: the audience IS the game binding. A game access token names no
 * separate "which game" claim — a game instance checks the audience it was
 * seeded with against the token's audience, and that single check is the
 * whole of "this token names its game". Minting a second, redundant claim
 * for the same fact would only invite the two to disagree.
 */
export function gameAudience(gameId: string): string {
  if (gameId.length === 0) {
    throw new Error("platform-auth: gameId must not be empty");
  }
  return `game:${gameId}`;
}

/**
 * Parse a game id back out of a `game:<id>` audience. Returns null for any
 * audience that is not of that shape, including one whose game id segment
 * is empty — this is the inverse of gameAudience, so it accepts exactly
 * what that function can produce.
 */
export function parseGameAudience(aud: string): string | null {
  const prefix = "game:";
  if (!aud.startsWith(prefix)) return null;
  const gameId = aud.slice(prefix.length);
  if (gameId.length === 0) return null;
  return gameId;
}
