// Invalid-state detection for the board view.
//
// spec: visual-tester/invalid-state-surfacing — the tool must never quietly
// render a structurally invalid state. A discontinuous snake body cannot be
// authored (editor guard) or imported (schema guard), so the only way one
// reaches the board is a resolver bug or a stale sequence — exactly the kind
// of defect this tool exists to expose. We compute these issues here and the
// board renders them as a loud on-page error, not a plausible silhouette.
import type { GameState, SnakeId } from "@cyphid/snek-engine";
import { type Discontinuity, firstDiscontinuity } from "./snakeBodyPath";

export interface SnakeContiguityIssue extends Discontinuity {
  readonly snakeId: SnakeId;
  readonly letter: string;
}

/** Every snake in `state` whose body has a discontinuity, in snake order. */
export function snakeContiguityIssues(state: GameState): SnakeContiguityIssue[] {
  const issues: SnakeContiguityIssue[] = [];
  for (const snake of state.snakes) {
    const d = firstDiscontinuity(snake.body);
    if (d !== null) issues.push({ snakeId: snake.snakeId, letter: snake.letter, ...d });
  }
  return issues;
}

/** Human-readable one-liner for a contiguity issue. */
export function describeContiguityIssue(issue: SnakeContiguityIssue): string {
  return `Snake ${issue.letter} (#${issue.snakeId}): body segment ${issue.index} (${issue.b.x},${issue.b.y}) is not adjacent to segment ${issue.index - 1} (${issue.a.x},${issue.a.y})`;
}
