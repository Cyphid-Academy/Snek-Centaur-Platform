// spec: identity-and-authorization/capability-claim-structure
//
// Capabilities travel as a sequence of ENTRIES, never an unstructured
// string, so that a later constraint on one entry is a change to minting
// alone: an entry may gain fields beyond `verb` in the future, and reading
// code that only ever looks at `verb` keeps working unchanged
// (#structured-from-the-first-token). No entry carries a constraint today.

/**
 * The closed vocabulary of bare capability verbs the platform exposes.
 * Aligned to the function surface, per capability-registry — not a
 * hand-maintained list independent of what is actually reachable.
 */
export type Capability =
  | "use-platform"
  | "configure-games"
  | "designate-boards"
  | "issue-game-tokens"
  | "write-centaur-state"
  | "request-bot-tokens"
  | "administer-platform";

export const CAPABILITIES: ReadonlyArray<Capability> = [
  "use-platform",
  "configure-games",
  "designate-boards",
  "issue-game-tokens",
  "write-centaur-state",
  "request-bot-tokens",
  "administer-platform",
];

const CAPABILITY_SET: ReadonlySet<string> = new Set(CAPABILITIES);

function isCapability(value: string): value is Capability {
  return CAPABILITY_SET.has(value);
}

/** One capability claim entry: a bare verb, structured as an object. */
export interface CapabilityEntry {
  readonly verb: Capability;
}

/** The capabilities claim name — namespaced so it cannot collide with a foreign claim. */
export const CAPABILITIES_CLAIM = "cyphid.capabilities";

/**
 * The acting-principal claim: where a service principal obtained a
 * credential to act with, the credential names that principal.
 * spec: identity-and-authorization/capability-claim-structure#acting-principal-is-recorded
 */
export const ACTING_PRINCIPAL_CLAIM = "cyphid.acting_principal";

/**
 * The game-scope claim a per-team game credential carries: the one game and
 * one team the credential is scoped to. Namespaced like the other claims so
 * it cannot collide with a foreign claim. The audience cannot carry this —
 * a game credential is used AT the platform (aud = platformAudience()), so
 * its game binding travels as its own structured claim.
 * spec: identity-and-authorization/game-credential-scope
 */
export const GAME_CREDENTIAL_SCOPE_CLAIM = "cyphid.game_scope";

/** The value of the game-scope claim: exactly one game and one team. */
export interface GameCredentialScope {
  readonly gameId: string;
  readonly teamId: string;
}

/**
 * Structurally parse the game-scope claim out of a decoded claim set.
 * Total and strict like the other readers: anything but an object carrying
 * non-empty string `gameId` and `teamId` parses to null — never a partial
 * result a scope check could half-trust.
 */
export function readGameCredentialScope(
  claims: Record<string, unknown>,
): GameCredentialScope | null {
  const raw = claims[GAME_CREDENTIAL_SCOPE_CLAIM];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { gameId, teamId } = raw as { readonly gameId?: unknown; readonly teamId?: unknown };
  if (typeof gameId !== "string" || gameId.length === 0) return null;
  if (typeof teamId !== "string" || teamId.length === 0) return null;
  return { gameId, teamId };
}

/**
 * Structurally parse the capabilities claim out of a decoded claim set.
 * Reads entries, never splits a string
 * (#structured-from-the-first-token): the claim value must be an array of
 * objects, each carrying a `verb` that is a member of the closed
 * `Capability` union. Anything else — a string, a non-array, a
 * heterogeneous array, an unrecognised verb — parses to null rather than a
 * partial result. Fields beyond `verb` on an entry are tolerated rather
 * than rejected, since a future constraint field is meant to be additive.
 */
export function readCapabilityEntries(
  claims: Record<string, unknown>,
): ReadonlyArray<CapabilityEntry> | null {
  const raw = claims[CAPABILITIES_CLAIM];
  if (!Array.isArray(raw)) return null;

  const entries: CapabilityEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
    const verb = (item as { readonly verb?: unknown }).verb;
    if (typeof verb !== "string" || !isCapability(verb)) return null;
    entries.push({ verb });
  }
  return entries;
}

/** Whether a parsed capability claim grants a given verb. */
export function hasCapability(entries: ReadonlyArray<CapabilityEntry>, verb: Capability): boolean {
  return entries.some((entry) => entry.verb === verb);
}

/**
 * A per-team game credential's exact capability grant: writes to that
 * team's own Centaur-subsystem state, and requests for that team's bot
 * access tokens — nothing else.
 * spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
 */
export const GAME_CREDENTIAL_CAPABILITIES: ReadonlyArray<CapabilityEntry> = [
  { verb: "write-centaur-state" },
  { verb: "request-bot-tokens" },
];
