// Win-condition evaluation against the committed end-of-turn state.
// spec: 01 §2.10 (game-engine/scoring..058).
import type { CentaurTeamId, GameOutcome, GameRuntimeConfig, TurnNumber } from "../types.js";

/** The structural subset of snake state the win check reads. */
export interface ScoringSnake {
  readonly centaurTeamId: CentaurTeamId;
  readonly alive: boolean;
  readonly body: ReadonlyArray<unknown>;
}

export function checkWinConditions(
  snakes: ReadonlyArray<ScoringSnake>,
  roster: ReadonlyArray<CentaurTeamId>,
  aliveTeamsAtStart: ReadonlySet<CentaurTeamId>,
  turnNumber: TurnNumber,
  config: GameRuntimeConfig,
): GameOutcome {
  const n = roster.length;
  if (n === 0) {
    // All-forfeit degenerate case (game-engine/scoring) — unreachable through
    // resolveTurn with snakes present; kept for arithmetic completeness.
    return { kind: "draw", tiedCentaurTeamIds: [], scores: new Map() };
  }
  const aggregateLength = new Map<CentaurTeamId, number>(roster.map((t) => [t, 0]));
  const aliveTeams: CentaurTeamId[] = [];
  for (const team of roster) {
    let sum = 0;
    let anyAlive = false;
    for (const s of snakes) {
      if (s.centaurTeamId === team && s.alive) {
        sum += s.body.length;
        anyAlive = true;
      }
    }
    aggregateLength.set(team, sum);
    if (anyAlive) aliveTeams.push(team);
  }

  if (aliveTeams.length === 0) {
    // Simultaneous elimination (game-engine/game-end-conditions): teams alive at the
    // start of this turn score par 1.0; earlier-eliminated teams score 0.
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => [t, aliveTeamsAtStart.has(t) ? 1.0 : 0.0]),
    );
    return winnerOrDraw(roster, scores);
  }

  if (aliveTeams.length === 1) {
    // Last team standing (game-engine/game-end-conditions)
    const winner = aliveTeams[0] as CentaurTeamId;
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => [t, t === winner ? 1.0 * n : 0.0]),
    );
    return { kind: "victory", winnerCentaurTeamId: winner, scores };
  }

  if (config.maxTurns > 0 && turnNumber === config.maxTurns - 1) {
    // Turn limit (game-engine/game-end-conditions, game-engine/scoring): normalised body-share × team count
    const totalAliveSegments = aliveTeams.reduce(
      (sum, t) => sum + (aggregateLength.get(t) as number),
      0,
    );
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => {
        if (!aliveTeams.includes(t) || totalAliveSegments === 0) return [t, 0.0];
        return [t, ((aggregateLength.get(t) as number) / totalAliveSegments) * n];
      }),
    );
    return winnerOrDraw(roster, scores);
  }

  return { kind: "in_progress" }; // game-engine/game-end-conditions
}

function winnerOrDraw(
  roster: ReadonlyArray<CentaurTeamId>,
  scores: ReadonlyMap<CentaurTeamId, number>,
): GameOutcome {
  let max = Number.NEGATIVE_INFINITY;
  for (const team of roster) {
    const s = scores.get(team) as number;
    if (s > max) max = s;
  }
  const top = roster.filter((t) => scores.get(t) === max);
  if (top.length === 1) {
    return { kind: "victory", winnerCentaurTeamId: top[0] as CentaurTeamId, scores };
  }
  return { kind: "draw", tiedCentaurTeamIds: top, scores };
}
