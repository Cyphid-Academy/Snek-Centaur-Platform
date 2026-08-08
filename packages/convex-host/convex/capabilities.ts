// spec: identity-and-authorization/capability-registry,
//       identity-and-authorization/principal-kind-gating
// What a credential may reach, and who may hold it.

/**
 * Every capability the deployment recognises: what holding it reaches, and
 * which classes of caller reach it. Reach is a field on the capability, never
 * a list beside the registry — the cited scenarios say why, and the incident
 * that taught it is in design.md ("what the session list once got wrong").
 * Every entry declaring `anonymous` cites the scenario that justifies it, and
 * `scripts/check-public-surface.mjs` fails the build on one that does not.
 *
 * spec: identity-and-authorization/anonymous-reach
 * spec: identity-and-authorization/anonymous-reach#session-reach-is-declared-with-the-capability
 * spec: identity-and-authorization/anonymous-reach#credentialed-by-default
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
  // The sign-in entry route — reached by navigation, by browsers that have
  // never signed in (`anonymous`) and again by browsers that have (`session`,
  // the silent-reload branch). Anonymous reach says who may arrive without a
  // credential, never who may not arrive with one.
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
  // The two the configuration surface reaches. Both are `session: true` and
  // humans-only on the default, and **neither carries an access rule** — that
  // absence is deliberate rather than an omission: `game-configuration` holds
  // no permission of its own, because the room story owns who exists and what
  // they may do. What these declare is the deployment's uniform admission (may
  // this caller reach a public function at all), which is reachability and not
  // authorization; which affordances a mounted surface offers is a
  // presentation parameter the host passes it, and never this.
  // spec: identity-and-authorization/capability-registry#reachability-is-not-authorization
  // spec: game-configuration/host-selected-affordances
  "read-game-configuration": {
    reaches: "A game's configured parameters, its current board preview, and the lock.",
    session: true,
  },
  "configure-game": {
    reaches: "Create a game, edit its configuration, and designate its board.",
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
 * registration records: each mints a credential, or completes a chain that
 * does. `begin-sign-in-handoff` is the chain case — alone it mints only an
 * opaque reference, but joined with redemption (which proves itself and needs
 * no capability) it renews a human's credential indefinitely, which is
 * exactly what `#no-chain-reaches-what-one-step-may-not` refuses. A human's
 * own session still reaches it, and must; a ceiling is what may be conferred
 * on a peer.
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
