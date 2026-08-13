// spec: global-invariants/runtime-ownership, global-invariants/game-instance-hermeticity
// @cyphid/snek-stdb — the SpacetimeDB runtime's Node-side surface.
//
// The module itself (tables and reducers) lives in `spacetimedb/`, built by
// `spacetime build` into a single bundle that runs in the instance's V8
// isolate. This package holds what the rest of the workspace needs in order to
// address that instance, compiled under the strict composite build.
//
// A name exported here is a promise that the published module answers to it, so
// it is added when the module is — see packages/stdb/AGENTS.md.

export type {
  Board,
  Direction,
  GameRuntimeConfig,
  GameState,
  Item,
  ItemsByCell,
  SnakeState,
  StagedMove,
  TurnEvent,
  TurnResolution,
} from "@cyphid/snek-engine";
export { itemsByCell } from "@cyphid/snek-engine";
