// spec: game-configuration/self-contained-configuration-surface,
// game-configuration/host-selected-affordances,
// application-shell/surface-mounting-contract,
// application-shell/one-state-binding — mounts the real component against
// fixture/mutable bindings; runs in the "components" vitest project (client
// build + jsdom), same pattern as BoardView.browser.test.ts.
import type { CentaurTeamId } from "@cyphid/snek-engine";
import { DEFAULT_GAME_CONFIG, generateBoardAndInitialState } from "@cyphid/snek-game-configuration";
import type {
  BoardGenerationFailure,
  GameConfig,
  TeamRegistration,
} from "@cyphid/snek-game-configuration";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureBinding, mutableBinding } from "../shell/index.js";
import type { MutableBinding, StateBinding } from "../shell/index.js";
import GameConfigSurface from "./GameConfigSurface.svelte";
import type { ConfigSurfaceMutations, ConfigSurfaceState } from "./types.js";

const TEAMS: ReadonlyArray<TeamRegistration> = [
  { centaurTeamId: "team-0" as CentaurTeamId, name: "Red" },
  { centaurTeamId: "team-1" as CentaurTeamId, name: "Blue" },
];

const SEED = new Uint8Array(32).fill(7);

function generatedPreview() {
  const result = generateBoardAndInitialState(DEFAULT_GAME_CONFIG, TEAMS, SEED);
  if ("code" in result) throw new Error("fixture generation unexpectedly failed");
  return result;
}

function baseState(overrides: Partial<ConfigSurfaceState> = {}): ConfigSurfaceState {
  return {
    phase: "configuring",
    config: DEFAULT_GAME_CONFIG,
    teams: TEAMS,
    currentPreview: null,
    boardLocked: false,
    ...overrides,
  };
}

function stubMutations(): ConfigSurfaceMutations {
  return {
    updateConfig: vi.fn(async () => null),
    updateRoster: vi.fn(async () => null),
    setBoardLock: vi.fn(async () => null),
  };
}

let target: HTMLElement;
let comp: Record<string, unknown> | undefined;

beforeEach(() => {
  target = document.createElement("div");
  document.body.append(target);
});
afterEach(() => {
  if (comp) unmount(comp);
  comp = undefined;
  target.remove();
});

function mountSurface(
  binding:
    | StateBinding<ConfigSurfaceState>
    | MutableBinding<ConfigSurfaceState, ConfigSurfaceMutations>,
  affordances: { inspection: boolean; parameterEditing: boolean; boardDesignation: boolean },
): void {
  comp = mount(GameConfigSurface, { target, props: { binding, affordances } });
}

describe("GameConfigSurface — descriptor-driven widgets", () => {
  it("renders all 16 parameters from the descriptor tables with correct min/max/step", () => {
    const binding = mutableBinding(fixtureBinding(baseState()), stubMutations());
    mountSurface(binding, { inspection: true, parameterEditing: true, boardDesignation: true });

    const fields = target.querySelectorAll('[data-testid^="param-"]');
    expect(fields.length).toBe(16);

    // Board size (special-cased widget): 7-32, integer step.
    const boardSizeCustom = target.querySelector<HTMLInputElement>(
      '[data-testid="board-size-custom"]',
    );
    expect(boardSizeCustom?.min).toBe("7");
    expect(boardSizeCustom?.max).toBe("32");
    expect(boardSizeCustom?.step).toBe("1");

    // A generic integer generation parameter.
    const hazardPct = target.querySelector<HTMLInputElement>("#generation\\.hazardPercentage");
    expect(hazardPct?.min).toBe("0");
    expect(hazardPct?.max).toBe("30");
    expect(hazardPct?.step).toBe("1");

    // A fractional runtime parameter.
    const invulnRate = target.querySelector<HTMLInputElement>("#runtime\\.invulnPotionSpawnRate");
    expect(invulnRate?.min).toBe("0");
    expect(invulnRate?.max).toBe("0.2");
    expect(invulnRate?.step).toBe("0.01");

    // The jointly-presented bounded-duration pair.
    const maxTurns = target.querySelector<HTMLInputElement>("#runtime-maxTurns");
    expect(maxTurns?.min).toBe("1");
    expect(maxTurns?.max).toBe("1000");
  });
});

describe("GameConfigSurface — host-selected affordances", () => {
  // spec: game-configuration/host-selected-affordances#inspection-only-mounting
  it("inspection-only mount has no inputs/lock", () => {
    const binding = mutableBinding(
      fixtureBinding(baseState({ currentPreview: generatedPreview() })),
      stubMutations(),
    );
    mountSurface(binding, { inspection: true, parameterEditing: false, boardDesignation: false });

    expect(target.querySelectorAll("input").length).toBe(0);
    expect(target.querySelectorAll("select").length).toBe(0);
    expect(target.querySelector('[data-testid="lock-toggle"]')).toBeNull();
    expect(target.querySelector('[data-testid="readonly-params"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="board-preview"]')).not.toBeNull();
    expect(target.querySelectorAll(".board .cell").length).toBeGreaterThan(0);
  });

  // spec: game-configuration/host-selected-affordances#editing-without-designation
  it("editing-without-designation has inputs but no lock, and the preview still renders", () => {
    const binding = mutableBinding(
      fixtureBinding(baseState({ currentPreview: generatedPreview() })),
      stubMutations(),
    );
    mountSurface(binding, { inspection: true, parameterEditing: true, boardDesignation: false });

    expect(target.querySelectorAll("input").length).toBeGreaterThan(0);
    expect(target.querySelector('[data-testid="lock-toggle"]')).toBeNull();
    expect(target.querySelector('[data-testid="editing-params"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="board-preview"]')).not.toBeNull();
  });

  // Interpretation call documented in the component: editing without
  // inspection still shows editing widgets (they necessarily display
  // values), but no board and no read-only summary.
  it("editing without inspection shows widgets but no board and no read-only summary", () => {
    const binding = mutableBinding(
      fixtureBinding(baseState({ currentPreview: generatedPreview() })),
      stubMutations(),
    );
    mountSurface(binding, { inspection: false, parameterEditing: true, boardDesignation: false });

    expect(target.querySelectorAll("input").length).toBeGreaterThan(0);
    expect(target.querySelector('[data-testid="board-preview"]')).toBeNull();
    expect(target.querySelector('[data-testid="readonly-params"]')).toBeNull();
    expect(target.querySelector('[data-testid="serialised-config"]')).toBeNull();
  });

  // spec: application-shell/one-state-binding#absence-not-refusal
  it("a plain StateBinding (no mutations) offers no editing affordances even when requested", () => {
    const binding = fixtureBinding(baseState({ currentPreview: generatedPreview() }));
    mountSurface(binding, { inspection: true, parameterEditing: true, boardDesignation: true });

    expect(target.querySelectorAll("input").length).toBe(0);
    expect(target.querySelectorAll("select").length).toBe(0);
    expect(target.querySelector('[data-testid="lock-toggle"]')).toBeNull();
    expect(target.querySelector('[data-testid="board-preview"]')).not.toBeNull();
  });
});

describe("GameConfigSurface — conditional parameter semantics", () => {
  // spec: game-configuration/conditional-parameter-semantics#ui-communicates-without-blocking
  it("renders a gated parameter as inactive-but-editable when its gate is 0", () => {
    const config: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: {
        ...DEFAULT_GAME_CONFIG.generation,
        fertileGround: { ...DEFAULT_GAME_CONFIG.generation.fertileGround, density: 0 },
      },
    };
    const binding = mutableBinding(fixtureBinding(baseState({ config })), stubMutations());
    mountSurface(binding, { inspection: true, parameterEditing: true, boardDesignation: false });

    const field = target.querySelector('[data-testid="param-generation-fertileGround.clustering"]');
    expect(field?.classList.contains("gated")).toBe(true);
    const input = field?.querySelector("input");
    expect(input).not.toBeNull();
    expect(input?.disabled).toBe(false);
    expect(field?.querySelector(".gated-note")?.textContent).toContain("fertileGround.density");
  });
});

describe("GameConfigSurface — board size round trip", () => {
  // spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
  it("derives the preset selection from the stored integer and falls back to custom", () => {
    const standard: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 21 },
    };
    const binding1 = mutableBinding(
      fixtureBinding(baseState({ config: standard })),
      stubMutations(),
    );
    mountSurface(binding1, { inspection: true, parameterEditing: true, boardDesignation: false });
    const select1 = target.querySelector<HTMLSelectElement>('[data-testid="board-size-preset"]');
    expect(select1?.value).toBe("21");
    unmount(comp as Record<string, unknown>);
    comp = undefined;

    const custom: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 17 },
    };
    const binding2 = mutableBinding(fixtureBinding(baseState({ config: custom })), stubMutations());
    mountSurface(binding2, { inspection: true, parameterEditing: true, boardDesignation: false });
    const select2 = target.querySelector<HTMLSelectElement>('[data-testid="board-size-preset"]');
    const customInput = target.querySelector<HTMLInputElement>('[data-testid="board-size-custom"]');
    expect(select2?.value).toBe("custom");
    expect(customInput?.value).toBe("17");
  });

  it("always transmits the raw integer, from either the preset or the custom control", async () => {
    const mutations = stubMutations();
    const config: GameConfig = {
      ...DEFAULT_GAME_CONFIG,
      generation: { ...DEFAULT_GAME_CONFIG.generation, boardSize: 17 },
    };
    const binding = mutableBinding(fixtureBinding(baseState({ config })), mutations);
    mountSurface(binding, { inspection: true, parameterEditing: true, boardDesignation: false });

    const select = target.querySelector<HTMLSelectElement>('[data-testid="board-size-preset"]');
    expect(select).not.toBeNull();
    if (select) {
      select.value = "21";
      // bubbles: true — Svelte 5 delegates common events (including
      // "change") at a shared root rather than attaching a listener
      // directly on every element, so a synthetic event must bubble to
      // reach it.
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await Promise.resolve();
    expect(mutations.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ generation: expect.objectContaining({ boardSize: 21 }) }),
    );

    const customInput = target.querySelector<HTMLInputElement>('[data-testid="board-size-custom"]');
    if (customInput) {
      customInput.value = "19";
      customInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    await Promise.resolve();
    expect(mutations.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ generation: expect.objectContaining({ boardSize: 19 }) }),
    );
  });
});

describe("GameConfigSurface — board preview", () => {
  // spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
  it("shows the constraint code for a failure preview", () => {
    const failure: BoardGenerationFailure = {
      code: "HAZARD_CONNECTIVITY",
      attemptsUsed: 4,
      details: { innerCellCount: 361 },
    };
    const binding = mutableBinding(
      fixtureBinding(baseState({ currentPreview: failure })),
      stubMutations(),
    );
    mountSurface(binding, { inspection: true, parameterEditing: false, boardDesignation: false });

    const el = target.querySelector('[data-testid="generation-failure"]');
    expect(el?.textContent).toContain("HAZARD_CONNECTIVITY");
  });

  // spec: application-shell/one-board-rendering, game-configuration/board-preview#clients-render-never-generate
  it("renders a successful preview through the shared BoardView", () => {
    const preview = generatedPreview();
    const binding = mutableBinding(
      fixtureBinding(baseState({ currentPreview: preview })),
      stubMutations(),
    );
    mountSurface(binding, { inspection: true, parameterEditing: false, boardDesignation: false });

    const cells = target.querySelectorAll(".board .cell");
    expect(cells.length).toBe(preview.board.boardSize * preview.board.boardSize);
  });
});

describe("GameConfigSurface — board designation", () => {
  it("locking calls setBoardLock and is disabled without a successful preview", async () => {
    const mutations = stubMutations();
    const binding = mutableBinding(fixtureBinding(baseState({ currentPreview: null })), mutations);
    mountSurface(binding, { inspection: true, parameterEditing: false, boardDesignation: true });

    const toggle = target.querySelector<HTMLButtonElement>('[data-testid="lock-toggle"]');
    expect(toggle?.disabled).toBe(true);
  });

  it("locking is enabled and dispatches with a successful preview", async () => {
    const mutations = stubMutations();
    const preview = generatedPreview();
    const binding = mutableBinding(
      fixtureBinding(baseState({ currentPreview: preview, boardLocked: false })),
      mutations,
    );
    mountSurface(binding, { inspection: true, parameterEditing: false, boardDesignation: true });

    const toggle = target.querySelector<HTMLButtonElement>('[data-testid="lock-toggle"]');
    expect(toggle?.disabled).toBe(false);
    toggle?.click();
    await Promise.resolve();
    expect(mutations.setBoardLock).toHaveBeenCalledWith(true);
  });
});
