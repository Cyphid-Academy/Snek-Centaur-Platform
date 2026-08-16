// The application shell's public surface: the state binding and the surface
// mounting contract every surface in the application is written to.
// spec: application-shell/one-state-binding
// spec: application-shell/surface-mounting-contract
export type {
  BindingSource,
  BindingStatus,
  MutableBinding,
  StateBinding,
} from "./binding.svelte.js";
export { bindingFromSource, fixtureBinding, mutableBinding } from "./binding.svelte.js";
export type { SurfaceMount } from "./mounting.js";
