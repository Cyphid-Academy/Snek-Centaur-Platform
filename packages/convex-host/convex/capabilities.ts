// spec: identity-and-authorization/capability-registry,
//       identity-and-authorization/principal-kind-gating
// What a credential may reach, and who may hold it.

/**
 * Every capability the deployment recognises: what holding it reaches, and
 * which classes of caller reach it.
 *
 * A capability is a bare verb identifier — it names an action, so reading a
 * credential's claim tells you what its holder can go and do without consulting
 * a table of names.
 *
 * **Reach lives here, on the capability, rather than in a list beside this
 * one** — and that is true of `session` exactly as it is of `anonymous`. A
 * separate list is a thing that can disagree with the registry; a field cannot.
 * The session list was once separate, and it did disagree: `begin-sign-in` was
 * missing from it, so the sign-in entry route refused every browser carrying a
 * live session and its already-signed-in branch was unreachable code. Omitting a
 * flag is what "not reachable that way" means, so a capability added without a
 * thought about reach is reachable by neither — the default denies, and widening
 * reach is always a visible edit (`anonymous-reach#credentialed-by-default`).
 * Every entry that does declare one cites the scenario that justifies it, and
 * `scripts/check-public-surface.mjs` fails the build on one that does not.
 *
 * spec: identity-and-authorization/anonymous-reach
 * spec: identity-and-authorization/anonymous-reach#session-reach-is-declared-with-the-capability
 */
export const CAPABILITIES = {
  // spec: identity-and-authorization/anonymous-reach#liveness-exposes-no-principal
  "read-platform-status": {
    reaches: "Liveness of the deployment and of its component mounting.",
    anonymous: true,
    session: true,
  },
  // The bootstrap pair, reachable without a credential because the proof is in
  // the call itself. Neither is a session's: a caller who has a session is
  // precisely the one who need not prove itself with an assertion or a
  // reference, and the two ends of a handoff are held by different parties —
  // the human starts one, the Server redeems it.
  // spec: identity-and-authorization/anonymous-reach#assertion-exchange-proves-itself
  "exchange-assertion": {
    reaches: "Exchange a signed client assertion for a platform credential.",
    anonymous: true,
  },
  // spec: identity-and-authorization/anonymous-reach#handoff-redemption-proves-itself
  "redeem-handoff": {
    reaches: "Redeem a sign-in handoff reference for the credential it was minted for.",
    anonymous: true,
  },
  // The sign-in entry route, and the one capability here reached by navigation
  // rather than by a function call. It is *not* one of the bootstrap pair, and
  // reading it as one is the mistake that made the route refuse the very caller
  // its already-signed-in branch exists for: anonymous reach is what it needs to
  // serve a browser that has never signed in, and it is reached again, at the
  // same address, by a browser that has — answering that one without a provider
  // is the whole of what makes a reload silent. Reachable anonymously says who
  // may reach it *without* a credential, never who may not reach it with one.
  // spec: identity-and-authorization/google-sign-in#session-survives-reload
  // spec: identity-and-authorization/anonymous-reach#sign-in-entry-exposes-no-principal
  "begin-sign-in": {
    reaches: "Begin a sign-in that returns the browser to a registered Server.",
    anonymous: true,
    session: true,
  },
  "begin-sign-in-handoff": {
    reaches: "Mint a handoff reference returning this human to a registered Server.",
    session: true,
  },
  "issue-game-credential": {
    reaches: "Obtain a Snek Centaur Server's per-team, per-game credential.",
  },
  "issue-game-token": {
    reaches: "Obtain a game access token — operator, bot, spectator, or coach.",
    session: true,
  },
  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  "review-attributed-actions": {
    reaches: "The actions taken on this human's own account through a registered system.",
    session: true,
  },
  // Named ahead of the functions it reaches, which is the one departure from
  // "not a forecast" and is forced: `game-credential-scope` fixes that a game
  // credential grants exactly two capabilities, so both have to be mintable
  // now even though the Centaur-subsystem writes land with their own change. A
  // capability that reaches nothing yet grants nothing yet.
  "write-centaur-state": { reaches: "Write the bound team's own Centaur-subsystem state." },
} as const;

export type Capability = keyof typeof CAPABILITIES;

/**
 * The capabilities declaring `field`, read off the registry rather than
 * restated beside it.
 *
 * Compared against `true` on the value, not tested for the key's presence.
 * `field in entry` reads the same until somebody writes `anonymous: false` —
 * the most natural spelling of "not anonymous" — and silently declares the
 * capability reachable. The default this registry promises is denial, so the
 * one spelling that grants must be the one that says `true`.
 */
const declaring = (field: "anonymous" | "session"): ReadonlyArray<Capability> =>
  Object.entries(CAPABILITIES)
    .filter(([, entry]) => (entry as Record<string, unknown>)[field] === true)
    .map(([name]) => name as Capability);

/**
 * What a caller presenting no platform credential may reach.
 *
 * It is a claim like any other, which is what keeps the reachability check
 * total: the enforcement site reads one claim whether or not a credential
 * arrived, so there is no second code path that could be forgotten and default
 * open.
 *
 * spec: identity-and-authorization/anonymous-reach
 * spec: identity-and-authorization/authentication-required#unauthenticated-refused
 */
export const ANONYMOUS_CAPABILITIES: ReadonlyArray<Capability> = declaring("anonymous");

/**
 * What a signed-in human's session reaches — derived the same way and for the
 * same reason, so the two classes of reach are one enumeration rather than a
 * registry and a list that can drift apart.
 *
 * It is a claim like any other, so the enforcement site reads one list whoever
 * is calling and there is no "authenticated therefore allowed" branch anywhere.
 *
 * spec: identity-and-authorization/authentication-required
 * spec: identity-and-authorization/anonymous-reach#session-reach-is-declared-with-the-capability
 */
export const SESSION_CAPABILITIES: ReadonlyArray<Capability> = declaring("session");

/**
 * The two capabilities a per-team game credential grants, and the reason they
 * are written here rather than at the minting site: "exactly two and nothing
 * else" is a property of the credential, so it is stated once, in the registry
 * that knows what each capability reaches.
 *
 * spec: identity-and-authorization/game-credential-scope#grants-nothing-beyond-the-two
 */
export const GAME_CREDENTIAL_CAPABILITIES: ReadonlyArray<Capability> = [
  "write-centaur-state",
  "issue-game-token",
];

/**
 * Capabilities no external system's ceiling may include, whatever its
 * registration records and whatever the human it acts for could do directly.
 *
 * Each entry mints a credential, or completes a chain that does — an assertion
 * exchange mints one for the presenting system, a handoff redemption mints one
 * naming a human, and beginning a handoff is the step that makes a redemption
 * possible at all. So a ceiling containing any of them would let a compromised
 * peer manufacture authority instead of merely spending the authority it was
 * given. That is the exclusion `peer-capability-ceiling` names ("issue
 * credentials for a human"), and it is the only control that shrinks what a
 * compromised peer can do rather than shortening how long it can do it.
 *
 * **`begin-sign-in-handoff` is here because the exclusion is read against what
 * a capability reaches in combination, never against one step alone.** By
 * itself it mints only an opaque reference. But a credential naming a human
 * that carried it would let the Server begin a fresh handoff in that human's
 * name, redeem it — redemption proves itself and needs no capability — and hold
 * a new credential for them; repeat, and the fifteen-minute lifetime bounds
 * nothing. A human's *own session* still reaches it, and must; a ceiling is
 * what may be conferred on a peer.
 *
 * Nothing in today's surface destroys platform state or changes authentication
 * configuration; when such a function lands, its capability belongs here.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
 * spec: identity-and-authorization/peer-capability-ceiling#no-chain-reaches-what-one-step-may-not
 */
export const PEER_FORBIDDEN_CAPABILITIES: ReadonlyArray<Capability> = [
  "exchange-assertion",
  "redeem-handoff",
  "begin-sign-in-handoff",
];

/**
 * The kinds of persistent identity the platform recognises, as the closed
 * enumeration `identity-and-authorization/identity-kinds` requires. Game
 * participants are not among them: those identities are derived, scoped to a
 * single game, and live inside that game's instance rather than at this
 * deployment's door.
 *
 * spec: identity-and-authorization/identity-kinds
 */
export const PRINCIPAL_KINDS = ["human", "centaur-team", "external-system"] as const;

export type PrincipalKind = (typeof PRINCIPAL_KINDS)[number];

/**
 * Human identities alone — the default every public function departs from
 * explicitly. Stated once here so that a function accepting more is visibly a
 * decision, and a function accepting only humans need not restate it.
 *
 * spec: identity-and-authorization/principal-kind-gating
 */
export const HUMANS_ONLY: ReadonlyArray<PrincipalKind> = ["human"];
