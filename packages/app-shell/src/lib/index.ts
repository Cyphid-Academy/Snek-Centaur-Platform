// The application shell: the infrastructure every surface of the one web
// application shares — the contract a surface is mounted through, the one
// binding it obtains state from, and the one board rendering.
//
// spec: application-shell/unified-web-application
export { default as BoardView } from "./BoardView.svelte";
export { default as SnakeBody } from "./SnakeBody.svelte";
export type { BoardGeometry } from "./board";
export {
  type BindingSnapshot,
  type ConnectionStatus,
  type ConvexBindingOptions,
  type ConvexMutationSpec,
  type ConvexMutations,
  convexBinding,
  convexMutableBinding,
  type FixtureBinding,
  fixtureBinding,
  type MutableBinding,
  type MutableFixtureBinding,
  mutableFixtureBinding,
  type MutationRecord,
  type StateBinding,
} from "./binding";
export {
  type AffordanceSet,
  noAffordances,
  offers,
  type SurfaceMode,
  type SurfaceMounting,
} from "./mounting";
export {
  createSnakeBodyPath,
  type Discontinuity,
  firstDiscontinuity,
  type SnakeBodyPathOptions,
  type SnakeSegment,
} from "./snakeBodyPath";
