// Public, reflectable declaration of the board-generation half of the
// configuration vocabulary — this capability's own parameters, in the same
// descriptor shape the engine declares its gameplay half in, so a widget or
// a validator reads bounds from data on either side of the boundary rather
// than restating them.
// spec: game-configuration/generation-parameters, game-configuration/parameter-bounds-sourcing
import type { ParameterDescriptor } from "@cyphid/snek-engine";

/**
 * Exactly the fields of `BoardGenerationConfig`, one descriptor per leaf
 * path. Ranges, defaults and sentinels are the table from
 * `game-configuration/generation-parameters` — this is that table as data.
 * This is the sole declaration of these five parameters anywhere: the
 * engine's own vocabulary carries none of them
 * (`game-configuration/generation-parameters#generation-parameters-are-declared-here`).
 */
export const GENERATION_PARAMETER_DESCRIPTORS: ReadonlyArray<ParameterDescriptor> = [
  { path: "boardSize", kind: "integer", min: 7, max: 32, default: 21 },
  { path: "snakesPerTeam", kind: "integer", min: 1, max: 10, default: 5 },
  {
    path: "hazardPercentage",
    kind: "integer",
    min: 0,
    max: 30,
    default: 0,
    disableSentinel: 0, // 0 = no hazards
  },
  {
    path: "fertileGround.density",
    kind: "integer",
    min: 0,
    max: 90,
    default: 30,
    disableSentinel: 0, // 0 = fertile ground disabled
  },
  { path: "fertileGround.clustering", kind: "integer", min: 1, max: 20, default: 10 },
];

/** Look up a generation-parameter descriptor by its dotted path. */
export function generationDescriptorFor(path: string): ParameterDescriptor {
  const found = GENERATION_PARAMETER_DESCRIPTORS.find((d) => d.path === path);
  if (!found) throw new Error(`no generation parameter descriptor for path "${path}"`);
  return found;
}
