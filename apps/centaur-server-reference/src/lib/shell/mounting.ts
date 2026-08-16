// The surface mounting contract every surface in the application is written
// to, starting with the game-configuration surface.
// spec: application-shell/surface-mounting-contract
//
// A surface takes the mode it is mounted in and the affordances it offers as
// explicit parameters of its mounting. It derives no actor of its own, holds
// no access rule, and consults no notion of who is present — so the same
// surface serves live play, a read-only view for someone watching, and a
// reconstruction of a past moment with no mode-aware branch inside it
// (#one-surface-every-mode). Two mountings of the same surface differ only in
// what the host stated when it mounted them — the surface itself resolved no
// actor and read no session to reach the difference
// (#the-host-states-what-is-offered).
//
// Offering an affordance is a presentation decision, never an authorising
// one. `SurfaceMount` is what a surface consults to decide what to render or
// enable; it is never what an owning runtime consults to decide what to
// accept. A write of a kind the surface was not offering is judged on the
// owning runtime's own rules exactly like any other write if it reaches that
// runtime anyway — the absent affordance was never the check
// (#hiding-is-not-enforcing).
export interface SurfaceMount<A extends string> {
  readonly affordances: Readonly<Record<A, boolean>>;
}
