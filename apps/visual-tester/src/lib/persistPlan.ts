// Pure decision logic for auto-persisting the working session (design D11).
//
// The session is continuously persisted to a scratch sequence — there is no
// "save scratch" action. This module decides, for a given mutation, whether
// that mutation updates the bound scratch in place, forks a new scratch, or
// materializes the first scratch for a brand-new session. Keeping it pure
// makes the fork/update rules testable without a server or the DOM.
//
// spec: visual-tester/auto-persist, visual-tester/history-rewrite

export interface PersistContext {
  /** Id of the scratch file the session currently writes through to, or null
   *  when the session has never been persisted (brand-new, or a loaded
   *  fixture not yet modified). */
  readonly boundId: string | null;
  /** True when the session was loaded from a fixture and not yet forked — the
   *  next modification must copy it to a scratch (fixtures are read-only). */
  readonly sourceIsFixture: boolean;
  /** True when the mutation edited a turn before the head (history rewrite):
   *  it truncates 0..k and must branch into a fresh scratch. */
  readonly wasMiddle: boolean;
  /** History position the mutation edited (the branch point for a fork). */
  readonly k: number;
  /** Current session name. */
  readonly name: string;
}

export type PersistPlan =
  | { readonly kind: "update"; readonly id: string; readonly name: string }
  | { readonly kind: "create"; readonly name: string }
  | { readonly kind: "fork"; readonly name: string };

const BRANCH_RE = /\s*\(branch @turn \d+\)\s*$/;

/** Strip a trailing "(branch @turn N)" so repeated forks don't stack suffixes. */
export function stripBranch(name: string): string {
  return name.replace(BRANCH_RE, "").trimEnd();
}

/** Fork name: parent base plus the branch point. */
export function branchName(name: string, k: number): string {
  return `${stripBranch(name)} (branch @turn ${k})`;
}

/**
 * Decide how a mutation persists. `update` writes the bound scratch in place
 * (head edit on a scratch); `fork` copies 0..k into a new scratch (a
 * middle edit, or the first edit of a loaded fixture); `create` materializes
 * the first scratch for a brand-new session's first head edit.
 */
export function planPersist(ctx: PersistContext): PersistPlan {
  if (ctx.boundId !== null && !ctx.wasMiddle && !ctx.sourceIsFixture) {
    return { kind: "update", id: ctx.boundId, name: ctx.name };
  }
  if (ctx.sourceIsFixture || ctx.wasMiddle) {
    return { kind: "fork", name: branchName(ctx.name, ctx.k) };
  }
  return { kind: "create", name: ctx.name };
}
