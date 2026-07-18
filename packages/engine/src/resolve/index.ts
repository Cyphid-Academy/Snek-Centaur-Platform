// The authoritative turn resolver — orchestration of the staged model of
// 01 §2.8: snapshot → move projection → head-to-head precedence → parallel
// interaction rules → derived rules → deterministic commit → spawning →
// win check → event derivation (game-rules/turn-resolution-model..052, game-rules/food-and-growth).
import type {
  GameOutcome,
  GameRuntimeConfig,
  GameState,
  SnakeId,
  StagedMove,
  TurnEvent,
  TurnNumber,
} from "../types.js";
import { ClaimSet } from "./claims.js";
import { commit } from "./commit.js";
import { buildTurnContext } from "./context.js";
import { EventBuffer } from "./events.js";
import type { InteractionRule } from "./rules.js";
import { INTERACTION_RULES, runDerivedRules } from "./rules.js";
import { runSpawning } from "./spawn.js";
import { checkWinConditions } from "./win.js";
import { toSnakeState } from "./work.js";

export interface TurnResolution {
  readonly nextState: GameState;
  readonly events: ReadonlyArray<TurnEvent>;
  readonly outcome: GameOutcome;
}

/**
 * Resolve one complete turn.
 *
 * `config` is the runtime half of the game configuration (documented
 * deviation from the drafted 01 §3.8 signature — see DECISIONS.md §1.1).
 * `state.clocks` passes through untouched: the chess timer is driven by
 * module 04 between turns (01 §2.9).
 */
// spec: game-rules/turn-resolution-model — staged resolution, commit as sole writer.
export function resolveTurn(
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnNumber: TurnNumber,
  turnSeed: Uint8Array,
  config: GameRuntimeConfig,
): TurnResolution {
  return resolveTurnWithRules(INTERACTION_RULES, state, stagedMoves, turnNumber, turnSeed, config);
}

/**
 * The orchestrator, parameterised by the interaction-rule list. Exposed for
 * the order-shuffle property test that machine-checks game-rules/turn-resolution-model's
 * order-independence guarantee; production callers use resolveTurn.
 */
export function resolveTurnWithRules(
  rules: ReadonlyArray<InteractionRule>,
  state: GameState,
  stagedMoves: ReadonlyMap<SnakeId, StagedMove>,
  turnNumber: TurnNumber,
  turnSeed: Uint8Array,
  config: GameRuntimeConfig,
): TurnResolution {
  const claims = new ClaimSet();
  // Stages 1-2: move projection + head-to-head precedence → H*.
  const ctx = buildTurnContext(state, stagedMoves, turnNumber, turnSeed, config, claims);
  // Stage 3: interaction rules — order-free by construction.
  for (const rule of rules) rule(ctx, claims);
  // Stage 4: derived rules (health resolution, cancellation).
  runDerivedRules(ctx, claims);
  // Stage 5: commit — the sole writer of game state.
  const events = new EventBuffer();
  commit(ctx, claims, events);
  // Stage 6: item spawning against committed occupancy.
  runSpawning(ctx, turnSeed, events);
  // Stage 7: win check.
  const outcome = checkWinConditions(
    ctx.snakes,
    ctx.roster,
    ctx.aliveTeamsAtStart,
    turnNumber,
    config,
  );
  // Stage 8: event derivation in canonical order.
  return {
    nextState: {
      board: ctx.board,
      snakes: ctx.snakes.map(toSnakeState),
      items: ctx.items, // the turn-owned working map, now final
      clocks: state.clocks,
    },
    events: events.ordered(),
    outcome,
  };
}
