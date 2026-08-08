// The board-preview document: the one spelling of what the preview slot holds.
//
// The generator answers in the engine's domain — branded scalars, readonly
// structures, a `Board` — and a preview slot holds a stored document that has
// no brands to carry. The translation between the two is here, once, because
// three parties need it and each would otherwise write its own: the Convex
// mutation that stores the document, the dev server that holds one in memory,
// and the surface that renders whichever delivered it.
//
// Pure, like the rest of this package: nothing here does IO or knows what a
// deployment is. The output is plain JSON-able data, so the same function feeds
// a Convex write and a `json()` response.
//
// spec: game-configuration/board-preview
// spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
import type { GeneratedInitialState } from "./boardgen.js";
import type { BoardGenerationFailure } from "./config.js";

/** One cell of the board, as the preview document spells it. */
export interface PreviewCell {
  x: number;
  y: number;
}

/**
 * A generated board in the one preview slot. The engine's branded scalars
 * (`SnakeId`, `CentaurTeamId`, `TurnNumber`, the `CellType`/`ItemType`/
 * `Direction` enums) are numbers and strings here — a stored document has no
 * brands to carry.
 */
export interface GeneratedBoardPreview {
  kind: "generated";
  board: { boardSize: number; cells: number[] };
  snakes: Array<{
    snakeId: number;
    letter: string;
    centaurTeamId: string;
    health: number;
    activeEffects: Array<{
      family: "invulnerability" | "invisibility";
      state: "buff" | "debuff";
      expiryTurn: number;
    }>;
    alive: boolean;
    turn: number;
    body: PreviewCell[];
    lastDirection: number | null;
  }>;
  items: Array<{
    itemType: number;
    spawnTurn: number;
    spawnIndex: number;
    cell: PreviewCell;
  }>;
}

/**
 * Why generation gave up, after its bounded retry — carried in the same slot as
 * a board, so it reaches the configuring user through the ordinary reactive
 * delivery rather than as a transport error nobody can render.
 * spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
 */
export interface BoardInfeasibility {
  kind: "infeasible";
  code: BoardGenerationFailure["code"];
  attemptsUsed: number;
  details: {
    centaurTeamId?: string;
    innerCellCount: number;
    eligibleCellCount?: number;
  };
}

/** The game's ONE current-preview value: a candidate, a refusal, or nothing yet. */
// spec: game-configuration/board-preview#one-slot-no-archive
export type BoardPreview = GeneratedBoardPreview | BoardInfeasibility | null;

/**
 * The generator's answer as the one preview slot holds it, tagged by arm.
 *
 * The document is mutable and freshly built on every call: a Convex validator's
 * inferred argument type is mutable, and the value is handed straight to a
 * writer that owns it from then on.
 */
export function previewDocument(
  result: GeneratedInitialState | BoardGenerationFailure,
): GeneratedBoardPreview | BoardInfeasibility {
  if ("code" in result) {
    return {
      kind: "infeasible",
      code: result.code,
      attemptsUsed: result.attemptsUsed,
      details: {
        ...(result.details.centaurTeamId === undefined
          ? {}
          : { centaurTeamId: result.details.centaurTeamId as string }),
        innerCellCount: result.details.innerCellCount,
        ...(result.details.eligibleCellCount === undefined
          ? {}
          : { eligibleCellCount: result.details.eligibleCellCount }),
      },
    };
  }
  return {
    kind: "generated",
    board: { boardSize: result.board.boardSize, cells: [...result.board.cells] },
    snakes: result.snakes.map((snake) => ({
      snakeId: snake.snakeId as number,
      letter: snake.letter,
      centaurTeamId: snake.centaurTeamId as string,
      health: snake.health,
      activeEffects: snake.activeEffects.map((effect) => ({
        family: effect.family,
        state: effect.state,
        expiryTurn: effect.expiryTurn as number,
      })),
      alive: snake.alive,
      turn: snake.turn as number,
      body: snake.body.map((cell) => ({ x: cell.x, y: cell.y })),
      lastDirection: snake.lastDirection === null ? null : (snake.lastDirection as number),
    })),
    items: result.items.map((item) => ({
      itemType: item.itemType as number,
      spawnTurn: item.spawnTurn as number,
      spawnIndex: item.spawnIndex,
      cell: { x: item.cell.x, y: item.cell.y },
    })),
  };
}
