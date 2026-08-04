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

// Admission is the one decision the instance already owes: who may connect at
// all. It is pure and lives here rather than in a reducer body so it is checked
// under the strict build (spec: identity-and-authorization/admission-validation).
export {
  type Admission,
  type AdmissionContext,
  type AdmissionRefusal,
  type AdmissionRow,
  type AdmittedIdentity,
  type VerifiedToken,
  actingTeam,
  admissionRow,
  admit,
} from "./admission";
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

/**
 * The key of `game_binding`'s single row, written by `initialize_game` and read
 * by admission.
 *
 * It lives here and not in the module because **the module may export nothing
 * but tables and reducers**: the SpacetimeDB host walks a published module's
 * exports and refuses the whole thing — at publish, with
 * `exporting something that is not a spacetime export` — on meeting one it does
 * not recognise. A constant the module needs is therefore a constant the module
 * imports.
 *
 * spec: identity-and-authorization/admission-validation
 */
export const GAME_BINDING_KEY = "game";
