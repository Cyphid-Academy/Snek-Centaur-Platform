// Re-export shim: the resolver lives in src/resolve/ (plan, context, claims,
// rules, commit, spawn, win, events). Import sites use this stable path.
export { advanceTurn, imagineMoves } from "./resolve/index.js";
export type {
  HypotheticalResolution,
  HypotheticalResult,
  ResolutionFailure,
  ResolutionFailureKind,
  TurnResolution,
} from "./resolve/index.js";
