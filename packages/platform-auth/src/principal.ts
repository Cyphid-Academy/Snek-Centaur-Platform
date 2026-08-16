// spec: identity-and-authorization/identity-kinds
//
// The three persistent identity kinds the platform recognises, plus the
// four roles a per-game participant identity is derived into. Both
// enumerations are closed so that every identity platform code meets falls
// in exactly one kind, and every admitted game connection in exactly one
// role — no code path is obligated to handle an identity that could be
// more than one of either.

/**
 * A persistent identity's kind. Operator, spectator, and coach
 * game-participant identities derive from "human"; bot identities derive
 * from "centaur-team". A Centaur Team is the persistent competitive unit
 * itself — the server domain operating it is attribution, never an
 * identity of its own.
 */
export type PersistentPrincipalKind = "human" | "centaur-team" | "external-system";

/**
 * A per-game participant's role — derived, scoped to one game, never a
 * persistent identity of its own.
 */
export type GameRole = "operator" | "bot" | "spectator" | "coach";
