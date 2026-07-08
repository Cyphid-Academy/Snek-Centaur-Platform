// Re-export shim: the resolver lives in src/resolve/ (context, claims,
// rules, commit, spawn, win, events). Import sites use this stable path.
export { resolveTurn } from "./resolve/index.js";
export type { TurnResolution } from "./resolve/index.js";
