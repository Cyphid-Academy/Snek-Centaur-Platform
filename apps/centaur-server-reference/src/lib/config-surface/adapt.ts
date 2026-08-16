// Adapts a platform-generated `GeneratedInitialState` (game-configuration's
// preview/launch shape) to the `GameState` the shared `BoardView` renders,
// using the engine's own helpers. This reproduces the pattern documented in
// apps/visual-tester/src/lib/factory.ts's `boardgenState` rather than
// importing it — apps do not import across each other, only through
// workspace packages.
// spec: application-shell/one-board-rendering,
// game-configuration/board-preview#clients-render-never-generate — this
// module only ever RENDERS a `GeneratedInitialState` it was handed; nothing
// here calls the generator.
import { asGameState, initialClock, itemsByCell } from "@cyphid/snek-engine";
import type { GameRuntimeConfig, GameState } from "@cyphid/snek-engine";
import type { GeneratedInitialState, TeamRegistration } from "@cyphid/snek-game-configuration";

export function toBoardViewState(
  generated: GeneratedInitialState,
  runtimeConfig: GameRuntimeConfig,
  teams: ReadonlyArray<TeamRegistration>,
): GameState {
  return asGameState({
    board: generated.board,
    snakes: generated.snakes,
    projections: [],
    rewind: null,
    items: itemsByCell(generated.board, generated.items),
    clocks: teams.map((t) => initialClock(t.centaurTeamId, runtimeConfig.clock)),
    consumedDurationMs: 0,
  });
}
