import { fixtureBinding, mutableFixtureBinding } from "@cyphid/snek-app-shell";
// The configuration surface, mounted directly.
//
// What is asserted here is what only a mounted component can answer: which
// affordances a host's three booleans actually produce, that a read-only
// binding leaves no write expressible at all, that a gated parameter is shown
// inactive without being made unpersistable, and that the limits on a widget
// are the ones the descriptor tables declare rather than a second copy.
//
// spec: game-configuration/host-selected-affordances
// spec: game-configuration/conditional-parameter-semantics
// spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
// spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
import { GAMEPLAY_PARAMETER_DESCRIPTORS, gameplayParameter } from "@cyphid/snek-engine";
import { CellType } from "@cyphid/snek-engine";
import type { GameConfig } from "@cyphid/snek-game-configuration";
import {
  DEFAULT_GAME_CONFIG,
  GENERATION_PARAMETER_DESCRIPTORS,
} from "@cyphid/snek-game-configuration";
import { mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ConfigurationSurface from "./ConfigurationSurface.svelte";
import type {
  ConfigurationMutations,
  GameConfigurationRecord,
  GeneratedBoardPreview,
} from "./record";

/** A small generated board, in the shape the preview slot holds one. */
function preview(): GeneratedBoardPreview {
  const n = 7;
  const cells = Array.from({ length: n * n }, (_, i) => {
    const x = i % n;
    const y = Math.floor(i / n);
    return x === 0 || y === 0 || x === n - 1 || y === n - 1 ? CellType.Wall : CellType.Normal;
  });
  return {
    kind: "generated",
    board: { boardSize: n, cells },
    snakes: [
      {
        snakeId: 0,
        letter: "A",
        centaurTeamId: "team-red",
        health: 100,
        activeEffects: [],
        alive: true,
        turn: 0,
        body: [
          { x: 3, y: 3 },
          { x: 3, y: 3 },
          { x: 3, y: 3 },
        ],
        lastDirection: null,
      },
    ],
    items: [{ itemType: 0, spawnTurn: 0, spawnIndex: 0, cell: { x: 2, y: 2 } }],
  };
}

function record(over: Partial<GameConfigurationRecord> = {}): GameConfigurationRecord {
  return {
    config: DEFAULT_GAME_CONFIG,
    boardPreview: preview(),
    boardPreviewLocked: false,
    ...over,
  };
}

/** A configuration with one generation field replaced. */
function withGeneration(over: Partial<GameConfig["generation"]>): GameConfig {
  return {
    ...DEFAULT_GAME_CONFIG,
    generation: { ...DEFAULT_GAME_CONFIG.generation, ...over },
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

const at = (testId: string): HTMLElement | null =>
  target.querySelector(`[data-testid="${testId}"]`);

interface Affordances {
  inspection: boolean;
  parameterEditing: boolean;
  boardDesignation: boolean;
}

function render(binding: unknown, affordances: Affordances): void {
  comp = mount(ConfigurationSurface, {
    target,
    props: { binding, ...affordances } as never,
  }) as Record<string, unknown>;
}

function scriptedMutations(): {
  mutations: ConfigurationMutations;
  updates: unknown[];
  locks: unknown[];
} {
  const updates: unknown[] = [];
  const locks: unknown[] = [];
  return {
    updates,
    locks,
    mutations: {
      updateConfiguration: async (args) => {
        updates.push(args);
        return null;
      },
      setPreviewLock: async (args) => {
        locks.push(args);
        return null;
      },
    },
  };
}

describe("the three affordance kinds", () => {
  it("offers no input at all when mounted for inspection alone", () => {
    // spec: game-configuration/host-selected-affordances#inspection-only-mounting
    render(fixtureBinding<GameConfigurationRecord | null>(record()), {
      inspection: true,
      parameterEditing: false,
      boardDesignation: false,
    });

    expect(target.querySelectorAll("input")).toHaveLength(0);
    expect(target.querySelectorAll("select")).toHaveLength(0);
    expect(at("lock-toggle")).toBeNull();
    // Still fully functional as a view: the parameters and the board are there.
    expect(at("value-generation.boardSize")?.textContent).toBe(
      String(DEFAULT_GAME_CONFIG.generation.boardSize),
    );
    expect(at("board-preview")).not.toBeNull();
  });

  it("hides the lock while offering editing, the kinds being independent", () => {
    // spec: game-configuration/host-selected-affordances#editing-without-designation
    const { mutations } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record(),
        mutations,
      ),
      { inspection: true, parameterEditing: true, boardDesignation: false },
    );

    expect(at("input-generation.hazardPercentage")).not.toBeNull();
    expect(at("lock-toggle")).toBeNull();
  });

  it("leaves no write expressible over a read-only binding, whatever the host offered", () => {
    // A `StateBinding` carries no mutations, so the absence is the read-only-ness
    // rather than something refusing a call.
    // spec: application-shell/one-state-binding#absence-not-refusal
    render(fixtureBinding<GameConfigurationRecord | null>(record()), {
      inspection: true,
      parameterEditing: true,
      boardDesignation: true,
    });

    expect(target.querySelectorAll("input")).toHaveLength(0);
    expect(at("lock-toggle")).toBeNull();
  });

  it("shows nothing to inspect when inspection itself is not offered", () => {
    render(fixtureBinding<GameConfigurationRecord | null>(record()), {
      inspection: false,
      parameterEditing: true,
      boardDesignation: true,
    });

    expect(at("no-affordances")).not.toBeNull();
    expect(at("configuration-document")).toBeNull();
  });
});

describe("widget limits", () => {
  it("presents the bounds each half's descriptor table declares", () => {
    // Read from the same declaration the record rejects from — a second copy is
    // what this asserts the absence of.
    // spec: game-configuration/parameter-bounds-sourcing#widget-and-validator-agree
    const { mutations } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record(),
        mutations,
      ),
      { inspection: true, parameterEditing: true, boardDesignation: true },
    );

    const hazard = GENERATION_PARAMETER_DESCRIPTORS.find(
      (descriptor) => descriptor.path[0] === "hazardPercentage",
    );
    expect(hazard).toBeDefined();
    const input = at("input-generation.hazardPercentage") as HTMLInputElement | null;
    expect(input?.min).toBe(String(hazard?.min));
    expect(input?.max).toBe(String(hazard?.max));

    // A gameplay parameter that only affects a game already under way: the
    // surface offers exactly the engine's declared range and adds no limit.
    // spec: game-configuration/parameter-bounds-sourcing#live-game-bounds-are-reflected-not-owned
    const damage = gameplayParameter("hazardDamage");
    const damageInput = at("input-runtime.hazardDamage") as HTMLInputElement | null;
    expect(damageInput?.min).toBe(String(damage.min));
    expect(damageInput?.max).toBe(String(damage.max));

    // A sentinel outside its parameter's range is named, because a bare min/max
    // pair cannot express it.
    // spec: game-engine/configuration-parameters#disable-sentinels
    expect(at("bounds-runtime.maxTurns")?.textContent).toContain(
      `or ${gameplayParameter("maxTurns").disableSentinel} to disable`,
    );
  });

  it("offers every parameter of the closed vocabulary and nothing else", () => {
    // spec: game-configuration/closed-parameter-vocabulary
    const { mutations } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record(),
        mutations,
      ),
      { inspection: true, parameterEditing: true, boardDesignation: true },
    );

    const rendered = [...target.querySelectorAll("[data-testid^='parameter-']")].map((node) =>
      node.getAttribute("data-testid"),
    );
    const declared = [
      ...GENERATION_PARAMETER_DESCRIPTORS.map((d) => `parameter-generation.${d.path.join(".")}`),
      ...GAMEPLAY_PARAMETER_DESCRIPTORS.map((d) => `parameter-runtime.${d.path.join(".")}`),
    ];
    expect([...rendered].sort()).toEqual([...declared].sort());
  });
});

describe("the zero sentinels", () => {
  it("shows a gated parameter as inactive while still letting it be persisted", async () => {
    // spec: game-configuration/conditional-parameter-semantics#ui-communicates-without-blocking
    // spec: game-configuration/conditional-parameter-semantics#gated-value-persists-and-is-ignored
    const { mutations, updates } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record({ config: withGeneration({ fertileGround: { density: 0, clustering: 10 } }) }),
        mutations,
      ),
      { inspection: true, parameterEditing: true, boardDesignation: true },
    );

    const clustering = at("parameter-generation.fertileGround.clustering");
    expect(clustering?.getAttribute("data-gated")).toBe("true");
    expect(at("gate-generation.fertileGround.clustering")).not.toBeNull();

    // Nothing blocks the write: the value persists and is simply ignored while
    // the gate is off.
    const input = at("input-generation.fertileGround.clustering") as HTMLInputElement;
    expect(input.disabled).toBe(false);
    input.value = "12";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      generation: {
        ...DEFAULT_GAME_CONFIG.generation,
        fertileGround: { density: 0, clustering: 12 },
      },
    });
  });
});

describe("board size", () => {
  it("derives its display from the stored integer, whichever way it was entered", () => {
    // spec: game-configuration/closed-parameter-vocabulary#board-size-round-trip
    const { mutations } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record({ config: withGeneration({ boardSize: 13 }) }),
        mutations,
      ),
      { inspection: true, parameterEditing: true, boardDesignation: true },
    );

    // 13 matches no preset, so the affordance reads custom with the integer
    // pre-filled — and the integer is what is stored either way.
    expect((at("board-size-preset") as HTMLSelectElement).value).toBe("custom");
    expect((at("board-size-custom") as HTMLInputElement).value).toBe("13");
  });
});

describe("the board", () => {
  it("composes the lock marker over the one board rendering", () => {
    // spec: application-shell/one-board-rendering#composition-not-replacement
    render(fixtureBinding<GameConfigurationRecord | null>(record({ boardPreviewLocked: true })), {
      inspection: true,
      parameterEditing: false,
      boardDesignation: false,
    });

    expect(at("board-preview")).not.toBeNull();
    expect(at("lock-marker")).not.toBeNull();
  });

  it("sends no board data with a lock request", async () => {
    // spec: game-configuration/board-preview-lock-in#lock-carries-no-board-data
    const { mutations, locks } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record(),
        mutations,
      ),
      { inspection: true, parameterEditing: false, boardDesignation: true },
    );

    (at("lock-toggle") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(locks).toHaveLength(1));
    expect(locks[0]).toEqual({ locked: true });
  });

  it("names the constraint that failed rather than showing a generic error", () => {
    // spec: game-configuration/infeasibility-surfaced#failure-names-the-constraint
    render(
      fixtureBinding<GameConfigurationRecord | null>(
        record({
          boardPreview: {
            kind: "infeasible",
            code: "TERRITORY_PARITY_SHORTAGE",
            attemptsUsed: 4,
            details: { centaurTeamId: "team-red", innerCellCount: 25, eligibleCellCount: 3 },
          },
        }),
      ),
      { inspection: true, parameterEditing: false, boardDesignation: false },
    );

    expect(at("infeasibility-code")?.textContent).toBe("TERRITORY_PARITY_SHORTAGE");
    expect(at("infeasibility")?.textContent).toContain("team-red");
    expect(at("board-preview")).toBeNull();
  });
});

describe("what the surface emits", () => {
  it("emits exactly the shape the record stores", async () => {
    // spec: game-configuration/self-contained-configuration-surface#output-is-the-stored-shape
    const { mutations, updates } = scriptedMutations();
    render(
      mutableFixtureBinding<GameConfigurationRecord | null, ConfigurationMutations>(
        record(),
        mutations,
      ),
      { inspection: true, parameterEditing: true, boardDesignation: true },
    );

    expect(JSON.parse(at("configuration-document")?.textContent ?? "null")).toEqual(
      DEFAULT_GAME_CONFIG,
    );

    // A gameplay edit carries the gameplay subtree alone: none of its parameters
    // is an input the designated board was generated from.
    // spec: game-configuration/board-preview-lock-in#a-dynamic-gameplay-edit-leaves-the-lock-standing
    const input = at("input-runtime.maxTurns") as HTMLInputElement;
    input.value = "500";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]).toEqual({
      runtime: { ...DEFAULT_GAME_CONFIG.runtime, maxTurns: 500 },
    });
  });
});
