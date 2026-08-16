// Build-time equality check for engine-type mirrors: modifier-sensitive so a
// mirror that drifts only in `readonly`-ness or optionality is caught, not
// merely a mirror whose shapes happen to be mutually assignable structurally.
// This is THE single assertion every engine-type mirror site platform-wide
// must use — a mirror checked by any other means is, by definition, not
// checked at the strength this invariant requires.
// spec: global-invariants/engine-mirrors-are-guarded#one-assertion-every-site

/**
 * Resolves to `true` only when `A` and `B` are exactly mutually assignable,
 * INCLUDING their `readonly` and optional modifiers — otherwise `false`.
 *
 * Usage at a mirror site:
 * ```ts
 * const _check: AssertExact<MirroredType, EngineType> = true;
 * ```
 * A divergence (added/removed/retyped field, or a modifier-only change) makes
 * the right-hand `true` fail to satisfy the left-hand type, which fails the
 * build — never a runtime check, and never a check a mirror site could pass
 * at a lower strength than every other site
 * (`global-invariants/engine-mirrors-are-guarded#drift-fails-the-build`).
 *
 * Mechanism: the classic conditional-types-distribute-over-function-return
 * trick. A plain `A extends B ? true : false` collapses `readonly`/optional
 * differences because assignability alone does not see them; wrapping each
 * side in a generic function's return-position conditional makes the two
 * checks themselves the things being compared, and function types ARE
 * sensitive to those modifiers on the way in.
 */
export type AssertExact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
