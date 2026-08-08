// What the configuration surface reads and writes: the game's configuration
// record, exactly as the record stores it.
//
// The shapes here are the wire spelling of `packages/convex-snek-platform`'s
// `gameConfiguration` query — the two configuration halves, the one preview
// slot, the lock — and nothing else. The preview document itself is the
// capability package's `BoardPreview`, imported rather than re-spelled: what a
// reader inspects, what the record stores and what the engine consumes are one
// document.
// spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
//
// The board seed is absent because it is absent from the query: every random
// choice generation makes is drawn from it and it is accessible to no game
// client.
// spec: game-configuration/board-generation-retry
import type { CentaurTeamId, GameState, SnakeState } from "@cyphid/snek-engine";
import { asGameState, initialClock, itemsByCell } from "@cyphid/snek-engine";
import type {
  BoardInfeasibility,
  BoardPreview,
  GameConfig,
  GeneratedBoardPreview,
} from "@cyphid/snek-game-configuration";

/** The record a configuration surface is mounted over. */
export interface GameConfigurationRecord {
  readonly config: GameConfig;
  readonly boardPreview: BoardPreview;
  readonly boardPreviewLocked: boolean;
}

/** What the surface may ask the record to do, when a host offers the affordance. */
export interface ConfigurationMutations {
  /** Whole subtrees, never a path and a value. */
  // spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
  updateConfiguration(args: {
    readonly generation?: GameConfig["generation"];
    readonly runtime?: GameConfig["runtime"];
  }): Promise<unknown>;
  /** A boolean and no board. */
  // spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
  setPreviewLock(args: { readonly locked: boolean }): Promise<unknown>;
}

/**
 * Assemble the delivered preview into the `GameState` the one board rendering
 * consumes.
 *
 * Assembly only: nothing here places a cell, a snake or a food item. **Boards
 * are only ever generated platform-side**, so what a surface holds is a board
 * it received, and the one thing left to do with it is render it.
 * spec: game-configuration/board-preview#clients-render-never-generate
 */
export function previewGameState(
  preview: GeneratedBoardPreview,
  config: GameConfig,
): GameState | null {
  if (preview.board.cells.length !== preview.board.boardSize * preview.board.boardSize) return null;
  const board = {
    boardSize: preview.board.boardSize,
    cells: [...preview.board.cells],
  } as unknown as GameState["board"];
  const snakes = preview.snakes.map((snake) => snake as unknown as SnakeState);
  // The teams are read off the placed snakes rather than from a parameter: how
  // many snakes each team fields, and which teams there are at all, is what the
  // generated board already says.
  // spec: game-configuration/initial-snakes#the-count-travels-in-the-snakes
  const teamIds = [...new Set(preview.snakes.map((snake) => snake.centaurTeamId))];
  return asGameState({
    board,
    snakes,
    projections: [],
    rewind: null,
    items: itemsByCell(
      board,
      preview.items.map((item) => ({ ...item, cell: { ...item.cell } })) as unknown as Parameters<
        typeof itemsByCell
      >[1],
    ),
    clocks: teamIds.map((id) => initialClock(id as CentaurTeamId, config.runtime.clock)),
    consumedDurationMs: 0,
  });
}

/** The constraint an infeasibility names, in the words a configuring user acts on. */
// spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
export function infeasibilityMessage(failure: BoardInfeasibility): string {
  const team = failure.details.centaurTeamId;
  switch (failure.code) {
    case "HAZARD_CONNECTIVITY":
      return `Hazards could not be placed leaving the board connected (${failure.details.innerCellCount} inner cells, ${failure.attemptsUsed} attempts). Lower the hazard percentage or raise the board size.`;
    case "TERRITORY_PARITY_SHORTAGE":
      return `A starting territory${team ? ` (${team})` : ""} could not seat its snakes on cells of one shared parity (${failure.attemptsUsed} attempts). Lower snakes per team or raise the board size.`;
    case "INITIAL_FOOD_SHORTAGE":
      return `A starting territory${team ? ` (${team})` : ""} had too few eligible cells for its initial food (${failure.attemptsUsed} attempts). Lower snakes per team or raise the board size.`;
  }
}
