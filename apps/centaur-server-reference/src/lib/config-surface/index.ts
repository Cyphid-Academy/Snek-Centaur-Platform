// The self-contained game-configuration surface, and the types a host binds
// it against.
// spec: game-configuration/self-contained-configuration-surface,
// game-configuration/host-selected-affordances
export { default as GameConfigSurface } from "./GameConfigSurface.svelte";
export type { ConfigSurfaceMutations, ConfigSurfaceState, Rejection } from "./types.js";
