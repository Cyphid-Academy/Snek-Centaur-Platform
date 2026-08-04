// spec: identity-and-authorization/capability-registry,
//       identity-and-authorization/principal-kind-gating
// What a credential may reach, and who may hold it.

/**
 * Every capability the deployment recognises: what holding it reaches, and
 * whether it is reachable by a caller presenting no platform credential.
 *
 * A capability is a bare verb identifier — it names an action, so reading a
 * credential's claim tells you what its holder can go and do without consulting
 * a table of names.
 *
 * Reach lives here, on the capability, rather than in a second list beside this
 * one. A separate list is a thing that can disagree with the registry; a field
 * cannot. Omitting `anonymous` is what "credentialed" means, so a capability
 * added without a thought about reach is not anonymously reachable — the
 * default denies, and widening reach is always a visible edit
 * (`anonymous-reach#credentialed-by-default`). Every entry that does declare it
 * cites the scenario that justifies it, and `scripts/check-public-surface.mjs`
 * fails the build on one that does not.
 *
 * spec: identity-and-authorization/anonymous-reach
 */
export const CAPABILITIES = {
  // spec: identity-and-authorization/anonymous-reach#liveness-exposes-no-principal
  "read-platform-status": {
    reaches: "Liveness of the deployment and of its component mounting.",
    anonymous: true,
  },
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
  // rather than by a function call: a browser with no session arrives at it,
  // which is why it can require none. It decides only whether the naming Server
  // and the return address it asks for are registered — both already public in
  // the registry — and hands off to the provider.
  // spec: identity-and-authorization/anonymous-reach#sign-in-entry-exposes-no-principal
  "begin-sign-in": {
    reaches: "Begin a sign-in that returns the browser to a registered Server.",
    anonymous: true,
  },
  "begin-sign-in-handoff": {
    reaches: "Mint a handoff reference returning this human to a registered Server.",
  },
  "issue-game-credential": {
    reaches: "Obtain a Snek Centaur Server's per-team, per-game credential.",
  },
  "issue-game-token": {
    reaches: "Obtain a game access token — operator, bot, spectator, or coach.",
  },
  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  "review-attributed-actions": {
    reaches: "The actions taken on this human's own account through a registered system.",
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
 * What a caller presenting no platform credential may reach, read off the
 * registry rather than restated.
 *
 * It is a claim like any other, which is what keeps the reachability check
 * total: the enforcement site reads one claim whether or not a credential
 * arrived, so there is no second code path that could be forgotten and default
 * open.
 *
 * spec: identity-and-authorization/anonymous-reach
 * spec: identity-and-authorization/authentication-required#unauthenticated-refused
 */
export const ANONYMOUS_CAPABILITIES: ReadonlyArray<Capability> = Object.entries(CAPABILITIES)
  // On the value, not on the key's presence. `"anonymous" in entry` reads the
  // same until somebody writes `anonymous: false` — the most natural spelling
  // of "not anonymous" — and silently declares the capability anonymously
  // reachable. The default this registry promises is denial, so the one
  // spelling that grants must be the one that says `true`.
  .filter(([, entry]) => (entry as { anonymous?: boolean }).anonymous === true)
  .map(([name]) => name as Capability);

/**
 * What a signed-in human's session reaches. It is a claim like any other, so
 * the enforcement site reads one list whoever is calling and there is no
 * "authenticated therefore allowed" branch anywhere.
 *
 * The bootstrap *pair* is deliberately absent: a caller who has a session is
 * precisely the one who does not need to prove itself with an assertion or a
 * reference. `begin-sign-in-handoff` is here and its counterpart
 * `redeem-handoff` is not, because those are the two ends of the same handoff
 * and they are held by different parties — the human starts one, the Server
 * redeems it.
 *
 * `begin-sign-in` is *not* one of that pair, and reading it as one is the
 * mistake that made the sign-in entry route refuse the very caller its
 * already-signed-in branch exists for. Anonymous reach is what that route needs
 * to serve a browser that has never signed in; it is reached *again*, at the
 * same address, by a browser that has — and answering that one without a
 * provider is the whole of what makes a reload silent
 * (`google-sign-in#session-survives-reload`). A capability being anonymously
 * reachable says who may reach it without a credential, never who may not reach
 * it with one.
 *
 * spec: identity-and-authorization/authentication-required
 * spec: identity-and-authorization/google-sign-in#session-survives-reload
 */
export const SESSION_CAPABILITIES: ReadonlyArray<Capability> = [
  "read-platform-status",
  "begin-sign-in",
  "begin-sign-in-handoff",
  "issue-game-token",
  // spec: identity-and-authorization/peer-capability-ceiling#attribution-is-user-visible
  "review-attributed-actions",
];

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
 * Both entries mint a credential — an assertion exchange mints one for the
 * presenting system, a handoff redemption mints one naming a human — so a
 * ceiling containing either would let a compromised peer manufacture authority
 * instead of merely spending the authority it was given. That is the exclusion
 * `peer-capability-ceiling` names ("issue credentials for a human"), and it is
 * the only control that shrinks what a compromised peer can do rather than
 * shortening how long it can do it. Nothing in today's surface destroys
 * platform state or changes authentication configuration; when such a function
 * lands, its capability belongs on this list.
 *
 * spec: identity-and-authorization/peer-capability-ceiling#ceiling-sits-below-the-user
 */
export const PEER_FORBIDDEN_CAPABILITIES: ReadonlyArray<Capability> = [
  "exchange-assertion",
  "redeem-handoff",
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
