// Win-condition evaluation against the committed end-of-turn state.
// spec: game-engine/game-end-conditions, game-engine/scoring
import type { CentaurTeamId, GameOutcome, GameRuntimeConfig, TurnNumber } from "../types.js";

/** The structural subset of snake state scoring and the win check read. */
export interface ScoringSnake {
  readonly centaurTeamId: CentaurTeamId;
  readonly alive: boolean;
  readonly body: ReadonlyArray<unknown>;
}

/**
 * A team's STANDING score at any turn: its normalised body-share times the
 * number of competing teams, par exactly 1.0 for a proportional share. The
 * final score is this with the ending-specific adjustments applied, which is
 * what stops a mid-game figure and the figure the game is decided by from
 * being two different calculations.
 *
 * Forfeited teams are excluded upstream, by not appearing in the roster.
 */
// spec: game-engine/scoring#standing-score-at-any-turn
export function standingScores(
  snakes: ReadonlyArray<ScoringSnake>,
  roster: ReadonlyArray<CentaurTeamId>,
): ReadonlyMap<CentaurTeamId, number> {
  const n = roster.length;
  const aggregate = new Map<CentaurTeamId, number>(roster.map((t) => [t, 0]));
  let total = 0;
  for (const s of snakes) {
    if (!s.alive) continue;
    const prior = aggregate.get(s.centaurTeamId);
    if (prior === undefined) continue; // not a competing team
    aggregate.set(s.centaurTeamId, prior + s.body.length);
    total += s.body.length;
  }
  return new Map(
    roster.map((t) => [t, total === 0 ? 0 : ((aggregate.get(t) as number) / total) * n]),
  );
}

export function checkWinConditions(
  snakes: ReadonlyArray<ScoringSnake>,
  roster: ReadonlyArray<CentaurTeamId>,
  aliveTeamsAtStart: ReadonlySet<CentaurTeamId>,
  turnNumber: TurnNumber,
  consumedDurationMs: number,
  config: GameRuntimeConfig,
): GameOutcome {
  const n = roster.length;
  if (n === 0) {
    // All-forfeit degenerate case (game-engine/scoring) — unreachable through
    // a resolution with snakes present; kept for arithmetic completeness.
    return { kind: "draw", tiedCentaurTeamIds: [], scores: new Map() };
  }
  const aliveTeams = roster.filter((team) =>
    snakes.some((s) => s.alive && s.centaurTeamId === team),
  );

  // The elimination conditions are evaluated first, and that ordering is the
  // tie-break: where an elimination and a limit are both met at one commit the
  // game ends once, with the elimination as the ending. An elimination says
  // what became of the game; a limit only says a game still in progress may
  // run no further, and a game that has just ended is not in progress.
  // spec: game-engine/game-end-conditions#the-first-condition-met-ends-the-game
  if (aliveTeams.length === 0) {
    // Simultaneous elimination (game-engine/game-end-conditions): teams alive at the
    // start of this turn score par 1.0; earlier-eliminated teams score 0.
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => [t, aliveTeamsAtStart.has(t) ? 1.0 : 0.0]),
    );
    return winnerOrDraw(roster, scores);
  }

  if (aliveTeams.length === 1) {
    // Last team standing (game-engine/game-end-conditions). Reached by a clock
    // exhaustion exactly as by any other cause of death: running out of time
    // is a way of dying, so it needs no ending and no scoring adjustment
    // of its own (game-engine/scoring#running-out-of-time-needs-no-adjustment).
    const winner = aliveTeams[0] as CentaurTeamId;
    const scores = new Map<CentaurTeamId, number>(
      roster.map((t) => [t, t === winner ? 1.0 * n : 0.0]),
    );
    return { kind: "victory", winnerCentaurTeamId: winner, scores };
  }

  // The limits. Both score by the standing score, so which one is credited is
  // not observable — the duration limit is an ordinary end condition rather
  // than a second kind of ending, and it faults nobody.
  // spec: game-engine/game-end-conditions#the-duration-limit-is-an-ending-like-any-other,
  // game-engine/scoring#the-duration-limit-faults-nobody
  const turnLimitReached = config.maxTurns > 0 && turnNumber === config.maxTurns - 1;
  const durationLimitReached =
    config.maxGameDurationMs > 0 && consumedDurationMs >= config.maxGameDurationMs;
  if (turnLimitReached || durationLimitReached) {
    return winnerOrDraw(roster, standingScores(snakes, roster));
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
