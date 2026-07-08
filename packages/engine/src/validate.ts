// Move pre-validation helper for UI and bot consumers (02-REQ-037 —
// pre-validation on web clients). Not part of module 01's minimal contract.
//
// Semantics: `isValidMove` returns false only for moves whose fatality is
// certain from this snake's OWN deterministic future — entering a wall cell,
// or entering a cell of its own body that will still be occupied after this
// turn's tail movement. Other snakes' simultaneous moves are unknowable at
// staging time, so body/head collisions with them are NOT flagged; every
// direction remains *legal* to stage (the game rules never reject a staged
// move — a lethal one simply kills in Phase 3).
import { advance, cellAt } from "./board.js";
import type { Direction, GameState, SnakeId } from "./types.js";
import { CellType } from "./types.js";

export function isValidMove(state: GameState, snakeId: SnakeId, direction: Direction): boolean {
  const snake = state.snakes.find((s) => s.snakeId === snakeId);
  if (snake === undefined || !snake.alive) return false;
  const head = snake.body[0];
  if (head === undefined) return false;
  const target = advance(head, direction);
  const targetType = cellAt(state.board, target);
  if (targetType === undefined || targetType === CellType.Wall) return false;
  // Own segments still occupied after the unconditional advance-and-drop-tail
  // move (01-REQ-043): body[1 .. len-2]. A duplicated tail segment from
  // growth (01-REQ-062) keeps its cell occupied via the second-to-last entry.
  const occupiedAfter = snake.body.slice(1, -1);
  return !occupiedAfter.some((c) => c.x === target.x && c.y === target.y);
}
