// The contract every surface in the application is written to.
//
// spec: application-shell/surface-mounting-contract
//
// The whole of the contract is what a mounting *carries*: the mode it is
// mounted in and the affordances it offers, both stated by the host as explicit
// parameters. What is conspicuously absent is the load-bearing half — there is
// no actor here, no session, no viewer, no access rule, and no function for
// obtaining any of them. A surface that cannot reach who is present cannot
// branch on it (`#the-host-states-what-is-offered`), which is what lets one
// surface serve live play, a spectator, a coach and a replay viewer without a
// branch of its own (`#one-surface-every-mode`).
//
// Nothing here authorises anything. An affordance is a presentation decision:
// the owning runtime judges every write it receives on its own rules, so a
// mounting that offers too much makes nothing reachable that was not already
// (`#hiding-is-not-enforcing`).

/**
 * How a surface is mounted.
 *
 * The three are the same surface — the mode says what the state behind the
 * binding is, never which code path to take. `"reconstruction"` is a past
 * moment rebuilt from a persisted record; a surface distinguishes it from
 * `"live"` only where the *wording* of what it presents depends on it.
 */
export type SurfaceMode = "live" | "read-only" | "reconstruction";

/**
 * The affordances a mounting offers, by name.
 *
 * Independent flags rather than a level or a role: a host may offer editing
 * without designation, or inspection alone, and there is no ordering between
 * them to get wrong.
 *
 * Written as a mapped type over the surface's own affordance names rather than
 * `Record<string, boolean>` so a surface may declare its affordances as an
 * `interface` — an interface has no implicit index signature and would not
 * satisfy the `Record` form, which is a trap not worth leaving for every author
 * of a surface to fall into once.
 */
export type AffordanceSet<TAffordances = Record<string, boolean>> = {
  readonly [K in keyof TAffordances]: boolean;
};

/**
 * The parameters of a mounting — the props every surface's own props extend.
 *
 * Deliberately not extensible with an actor: adding one here would give every
 * surface in the application the ability to resolve who is present, which is
 * exactly what the contract exists to withhold.
 */
export interface SurfaceMounting<TAffordances extends AffordanceSet<TAffordances>> {
  readonly mode: SurfaceMode;
  readonly affordances: TAffordances;
}

/** Whether a mounting offers a named affordance; absent means not offered. */
export function offers<TAffordances extends AffordanceSet<TAffordances>>(
  mounting: SurfaceMounting<TAffordances>,
  affordance: keyof TAffordances & string,
): boolean {
  return mounting.affordances[affordance] === true;
}

/** A mounting offering nothing — the inspection-only default. */
export function noAffordances<TAffordances extends AffordanceSet<TAffordances>>(
  affordances: TAffordances,
): TAffordances {
  const none: Record<string, boolean> = {};
  for (const key of Object.keys(affordances)) none[key] = false;
  return none as TAffordances;
}
