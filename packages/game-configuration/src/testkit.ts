// Shared test helpers. Not exported from the package.
import type { CentaurTeamId } from "@cyphid/snek-engine";

export const tid = (s: string): CentaurTeamId => s as CentaurTeamId;

/** 32-byte seed filled with `n`. */
export function seed(n: number): Uint8Array {
  return new Uint8Array(32).fill(n);
}
