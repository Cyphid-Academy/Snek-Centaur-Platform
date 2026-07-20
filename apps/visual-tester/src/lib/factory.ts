// New-session factories: a blank hand-authoring canvas and the
// boardgen-seeded convenience (design D9 — a UI affordance, not spec surface).
import {
  DEFAULT_GAME_CONFIG,
  generateBoardAndInitialState,
  initialClock,
  itemsByCell,
} from "@cyphid/snek-engine";
import type {
  BoardGenerationFailure,
  CentaurTeamId,
  GameConfig,
  GameState,
} from "@cyphid/snek-engine";
import { blankBoardCells } from "./editor.js";

export function blankState(boardSize: number): GameState {
  const cells = blankBoardCells(boardSize);
  const board = { boardSize, cells };
  return { board, snakes: [], items: itemsByCell(board, []), clocks: [] };
}

// Numeric team ids match the store's default teams (team-0, team-1) so a
// generated state aligns with the configured teams without reconciliation.
export const DEFAULT_TEAMS: ReadonlyArray<{ centaurTeamId: CentaurTeamId; name: string }> = [
  { centaurTeamId: "team-0" as CentaurTeamId, name: "Red" },
  { centaurTeamId: "team-1" as CentaurTeamId, name: "Blue" },
];

export type BoardgenResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly failure: BoardGenerationFailure };

/** Seed a fresh session from production board generation. */
export function boardgenState(
  gameSeed: Uint8Array,
  config: GameConfig = DEFAULT_GAME_CONFIG,
): BoardgenResult {
  const generated = generateBoardAndInitialState(config, DEFAULT_TEAMS, gameSeed);
  if ("code" in generated) return { ok: false, failure: generated };
  const state: GameState = {
    board: generated.board,
    snakes: generated.snakes,
    items: itemsByCell(generated.board, generated.items),
    clocks: DEFAULT_TEAMS.map((t) => initialClock(t.centaurTeamId, config.runtime.clock)),
  };
  return { ok: true, state };
}
