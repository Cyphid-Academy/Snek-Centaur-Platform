// spec: game-configuration/self-contained-configuration-surface,
// game-configuration/board-generation-retry,
// game-configuration/board-preview-lock-in — logic tests for the dev harness
// backing /dev/game-config: a mutation reaches the pure state machine and
// the seed never crosses into the client-visible state. Runs in the "logic"
// vitest project (no component mount).
import type { CentaurTeamId } from "@cyphid/snek-engine";
import { DEFAULT_GAME_CONFIG } from "@cyphid/snek-game-configuration";
import type { GameConfig } from "@cyphid/snek-game-configuration";
import { beforeEach, describe, expect, it } from "vitest";
import {
  currentState,
  debugRecord,
  editBoardLock,
  editConfig,
  editRoster,
  resetHarness,
} from "./harness.js";

beforeEach(() => {
  resetHarness();
});

describe("currentState", () => {
  it("seeds a default roster and a first preview", () => {
    const state = currentState();
    expect(state.phase).toBe("configuring");
    expect(state.teams.length).toBe(2);
    expect(state.currentPreview).not.toBeNull();
  });

  // spec: game-configuration/board-generation-retry — "that seed SHALL be
  // accessible to no game client".
  it("never exposes the generation seed", () => {
    const state = currentState();
    expect(state).not.toHaveProperty("seed");
    // Even the successful-preview branch is the bare `GeneratedInitialState`
    // shape (board/snakes/items), never the `PreviewSlot` wrapper that holds
    // the seed alongside it.
    expect(state.currentPreview).not.toHaveProperty("seed");
  });
});

describe("editConfig", () => {
  it("applies a valid edit through the pure state machine and regenerates the preview", () => {
    const before = debugRecord().currentPreview;
    const nextConfig: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: { ...DEFAULT_GAME_CONFIG.generation, hazardPercentage: 10 },
    };
    const rejection = editConfig(nextConfig);
    expect(rejection).toBeNull();
    expect(currentState().config.generation.hazardPercentage).toBe(10);
    // A board-generation-input edit regenerates the preview
    // (game-configuration/board-preview#roster-change-regenerates's sibling
    // for a parameter edit) — the record's own seed for the new candidate
    // differs from the one seeded at harness start.
    expect(debugRecord().currentPreview?.seed).not.toEqual(before?.seed);
  });

  // spec: game-configuration/closed-parameter-vocabulary#out-of-range-rejected-regardless-of-client
  it("passes a structured rejection through unmodified", () => {
    const nextConfig: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 999 },
    };
    const rejection = editConfig(nextConfig);
    expect(rejection).toEqual({
      kind: "invalid-parameter",
      path: "generation.boardSize",
      reason: "OUT_OF_RANGE",
      value: 999,
      min: 7,
      max: 32,
    });
    // The record itself is untouched by a rejected write.
    expect(currentState().config.generation.boardSize).toBe(
      DEFAULT_GAME_CONFIG.generation.boardSize,
    );
  });

  // spec: game-configuration/bounded-game-duration#neither-limit-is-rejected
  it("rejects a write that would leave neither duration limit set", () => {
    const nextConfig: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 0, maxGameDurationMs: 0 },
    };
    const rejection = editConfig(nextConfig);
    expect(rejection).toEqual({ kind: "unbounded-duration" });
  });

  // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
  it("leaves the lock standing across an edit that does not touch generation inputs", () => {
    editBoardLock(true);
    expect(currentState().boardLocked).toBe(true);
    const before = debugRecord().currentPreview;

    const nextConfig: GameConfig = {
      ...currentState().config,
      runtime: { ...currentState().config.runtime, maxTurns: 50 },
    };
    editConfig(nextConfig);

    expect(currentState().boardLocked).toBe(true);
    expect(debugRecord().currentPreview?.seed).toEqual(before?.seed);
  });

  // spec: game-configuration/board-preview-lock-in#board-affecting-edit-clears-the-lock
  it("clears the lock across an edit that DOES touch generation inputs", () => {
    editBoardLock(true);
    expect(currentState().boardLocked).toBe(true);

    const nextConfig: GameConfig = {
      ...currentState().config,
      generation: { ...currentState().config.generation, hazardPercentage: 15 },
    };
    editConfig(nextConfig);

    expect(currentState().boardLocked).toBe(false);
  });
});

describe("editRoster", () => {
  it("applies a roster change and regenerates the preview", () => {
    const before = debugRecord().currentPreview;
    const rejection = editRoster([
      ...currentState().teams,
      { centaurTeamId: "team-2" as CentaurTeamId, name: "Green" },
    ]);
    expect(rejection).toBeNull();
    expect(currentState().teams.length).toBe(3);
    expect(debugRecord().currentPreview?.seed).not.toEqual(before?.seed);
  });

  it("rejects an empty roster", () => {
    const rejection = editRoster([]);
    expect(rejection).toEqual({ kind: "empty-roster" });
  });
});

describe("editBoardLock", () => {
  it("locks when a successful preview stands", () => {
    expect(currentState().currentPreview).not.toBeNull();
    const rejection = editBoardLock(true);
    expect(rejection).toBeNull();
    expect(currentState().boardLocked).toBe(true);
  });

  // spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
  it("designates the platform-held preview by construction — the mutation's own signature carries no board data", () => {
    editBoardLock(true);
    expect(currentState().boardLocked).toBe(true);
    // There is no parameter through which a board could have been supplied:
    // `editBoardLock(locked: boolean)` accepts nothing else.
  });
});
