// Shared descriptor-driven widget plumbing for GameConfigSurface: reading and
// writing a nested numeric field addressed by a dotted path, and deriving a
// human label from that path. Every widget limit (min/max/step) this surface
// presents comes from the SAME descriptor tables the record validates
// against, so a widget's limits and the record's rejection threshold cannot
// disagree.
// spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
import type { ParameterDescriptor } from "@cyphid/snek-engine";

/** Read a dotted path (e.g. "clock.initialBudgetMs") out of a nested object. */
export function getAtPath(obj: unknown, path: string): number {
  return path
    .split(".")
    .reduce<unknown>((cur, key) => (cur as Record<string, unknown>)[key], obj) as number;
}

/**
 * Return a shallow-enough clone of `obj` with the value at `path` replaced —
 * deep enough for the one level of nesting the two configuration halves
 * actually use (`clock.*`, `fertileGround.*`), and no deeper, because none
 * exists.
 */
export function setAtPath<T>(obj: T, path: string, value: number): T {
  const segments = path.split(".");
  const clone: Record<string, unknown> = { ...(obj as Record<string, unknown>) };
  let cursor = clone;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i] as string;
    cursor[key] = { ...(cursor[key] as Record<string, unknown>) };
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1] as string] = value;
  return clone as T;
}

/** "clock.initialBudgetMs" -> "Clock — Initial Budget Ms". Presentation mechanism. */
export function labelForPath(path: string): string {
  return path
    .split(".")
    .map((segment) =>
      segment.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()),
    )
    .join(" — ");
}

/** Integer parameters step by 1; the two fractional spawn-rate parameters step finer. */
export function stepFor(descriptor: ParameterDescriptor): number {
  return descriptor.kind === "integer" ? 1 : 0.01;
}
