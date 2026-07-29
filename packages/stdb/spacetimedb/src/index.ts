// spec: global-invariants/runtime-ownership, global-invariants/one-shared-engine
// The Team Snek SpacetimeDB module.
//
// This is the module project's skeleton, not the game. It exists so the
// toolchain is real and stays exercised: `spacetime build` bundles this with
// its node_modules and `pnpm stdb:publish` publishes it, so a broken module
// setup fails at the point someone can fix it rather than at the point someone
// first tries to write a reducer.
//
// It carries exactly one load-bearing fact beyond "the CLI works": the shared
// engine runs unmodified inside the instance's V8 isolate. `spacetime build`
// inlines npm dependencies through rolldown, so BLAKE3 works with no shim, no
// polyfill and no vendored copy — which is what makes
// global-invariants/one-shared-engine#no-parallel-implementation achievable for
// the reducers that arrive with their capability changes.
//
// The gameplay tables and the four real reducers — `initialize_game`,
// `stage_move`, `declare_turn_over`, `resolve_turn` — are deliberately absent.
// Each encodes rules that migrate-game-lifecycle, migrate-operator-control and
// migrate-turn-pacing have yet to state, and a table asserts a schema the
// instance then agrees to. They land with the changes that own them.
import { subSeed } from "@cyphid/snek-engine";
import { schema, t, table } from "spacetimedb/server";

const spacetimedb = schema({
  // A single row recording the last `ping`. Not game state: the instance's
  // real tables arrive with the capability changes that define them.
  module_info: table(
    { name: "module_info", public: true },
    {
      key: t.string().primaryKey(),
      tag: t.string(),
      engineDigest: t.string(),
    },
  ),
});

export default spacetimedb;

const MODULE_INFO_KEY = "module_info";

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Liveness of the module *and* of the engine inside it.
 *
 * The digest is the point: `subSeed` is the engine's BLAKE3 derivation, so a
 * row with a digest in it proves the shared build ran in the isolate rather
 * than merely that a reducer was reachable. Deriving from a fixed zero seed
 * makes the answer stable, so a caller can compare it against the same call
 * made anywhere else the engine runs.
 */
export const ping = spacetimedb.reducer({ tag: t.string() }, (ctx, { tag }) => {
  const digest = toHex(subSeed(new Uint8Array(32), tag));
  const row = { key: MODULE_INFO_KEY, tag, engineDigest: digest };
  if (ctx.db.module_info.key.find(MODULE_INFO_KEY) === null) {
    ctx.db.module_info.insert(row);
  } else {
    ctx.db.module_info.key.update(row);
  }
});
