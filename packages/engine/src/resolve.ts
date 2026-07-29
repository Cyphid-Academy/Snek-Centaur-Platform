// Re-export shim: the resolver lives in src/resolve/ (plan, context, claims,
// rules, commit, spawn, win, events). Import sites use this stable path.
export { advanceHistory, advanceTurn, imagineMoves } from "./resolve/index.js";
export type {
  Discontinuity,
  HistoryResult,
  HistoryRevision,
  HypotheticalResolution,
  HypotheticalResult,
  ResolutionFailure,
  ResolutionFailureKind,
  TurnResolution,
} from "./resolve/index.js";
