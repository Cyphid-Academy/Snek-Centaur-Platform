// Local game driver — a convenience harness for running whole games in one
// process. NOT part of the versioned module-01 contract (01 §3's contract
// note: non-listed exports are conveniences); in production the bookkeeping
// below is module 04's job. It exists so local consumers — the demo UI,
// module-07 bot development loops, replay tooling — don't each re-derive the
// same per-game state machine:
//
//   - turn numbering (0-based, matching resolveTurn's maxTurns check),
//   - per-turn seed derivation: turnSeed = subSeed(gameSeed, "turn:" + T)
//     (01 §2.8), so a driver game replays identically to a module-04 game
//     from the same gameSeed,
//   - clock assembly (01-REQ-035) — clocks pass through resolveTurn
//     untouched; the driver does not simulate real-time elapsing,
//   - outcome tracking (stepping a finished game is a caller bug).
import { blake3 } from "@noble/hashes/blake3.js";
import type { TeamRegistration } from "./boardgen.js";
import { generateBoardAndInitialState } from "./boardgen.js";
import { initialClock } from "./clock.js";
import type { TurnResolution } from "./resolve.js";
import { resolveTurn } from "./resolve.js";
import { subSeed } from "./rng.js";
import type {
  BoardGenerationFailure,
  GameConfig,
  GameOutcome,
  GameState,
  SnakeId,
  StagedMove,
  TurnNumber,
} from "./types.js";

export interface LocalGame {
  readonly state: GameState;
  /** The next turn to resolve (0-based) — equals the number of turns resolved so far. */
  readonly turnNumber: TurnNumber;
  readonly outcome: GameOutcome;
  readonly finished: boolean;
  /**
   * Resolve one turn with the given staged moves (omitted entries fall back
   * per 01-REQ-042) and advance the driver. Throws once `finished` is true.
   */
  step(stagedMoves?: ReadonlyMap<SnakeId, StagedMove>): TurnResolution;
}

/**
 * Derive a 32-byte game seed from a human-memorable string. BLAKE3 keeps the
 * derivation deterministic across runtimes, so a seed string shown in a demo
 * UI reproduces the exact game anywhere.
 */
export function seedFromText(text: string): Uint8Array {
  return blake3(new TextEncoder().encode(text), { dkLen: 32 });
}

/**
 * Generate a board and return a stepping driver for it, or pass through the
 * board-generation failure (01-REQ-061) for the caller to surface.
 */
export function createLocalGame(
  config: GameConfig,
  teams: ReadonlyArray<TeamRegistration>,
  gameSeed: Uint8Array,
): LocalGame | BoardGenerationFailure {
  const generated = generateBoardAndInitialState(config, teams, gameSeed);
  if ("code" in generated) return generated;
  return new LocalGameDriver(config, gameSeed, {
    board: generated.board,
    snakes: generated.snakes,
    items: generated.items,
    // spec: 01-REQ-035
    clocks: teams.map((t) => initialClock(t.centaurTeamId, config.runtime.clock)),
  });
}

const NO_MOVES: ReadonlyMap<SnakeId, StagedMove> = new Map();

class LocalGameDriver implements LocalGame {
  private currentState: GameState;
  private turn = 0;
  private currentOutcome: GameOutcome = { kind: "in_progress" };

  constructor(
    private readonly config: GameConfig,
    private readonly gameSeed: Uint8Array,
    initial: GameState,
  ) {
    this.currentState = initial;
  }

  get state(): GameState {
    return this.currentState;
  }

  get turnNumber(): TurnNumber {
    return this.turn as TurnNumber;
  }

  get outcome(): GameOutcome {
    return this.currentOutcome;
  }

  get finished(): boolean {
    return this.currentOutcome.kind !== "in_progress";
  }

  step(stagedMoves: ReadonlyMap<SnakeId, StagedMove> = NO_MOVES): TurnResolution {
    if (this.finished) {
      throw new Error("LocalGame.step: game is already finished");
    }
    // spec: 01 §2.8 — turnSeed = subSeed(gameSeed, "turn:" + T)
    const turnSeed = subSeed(this.gameSeed, `turn:${this.turn}`);
    const resolution = resolveTurn(
      this.currentState,
      stagedMoves,
      this.turn as TurnNumber,
      turnSeed,
      this.config.runtime,
    );
    this.currentState = resolution.nextState;
    this.currentOutcome = resolution.outcome;
    this.turn += 1;
    return resolution;
  }
}
