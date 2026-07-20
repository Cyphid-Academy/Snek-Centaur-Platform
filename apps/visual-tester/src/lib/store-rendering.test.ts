// spec: visual-tester/snake-rendering#dead-snake-ghost-one-turn,
// visual-tester/team-configuration — the store's rendering-support getters:
// one-turn dead-snake ghosting and team-name resolution. Driven against a
// no-op client so autosave never touches the network.
import { DEFAULT_GAME_CONFIG, Direction } from "@cyphid/snek-engine";
import type { CentaurTeamId, SnakeId } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import { addSnake, appendBodyCell, removeSnake } from "./editor.js";
import type { SequenceClient, SequenceListEntry, SequenceTier } from "./sequenceClient.js";
import { TesterStore } from "./store.svelte.js";
import type { TestSequenceDoc } from "./test-sequences/codec.js";

const CONFIG = DEFAULT_GAME_CONFIG.runtime;

const noopClient: SequenceClient = {
  async list() {
    return [];
  },
  async get(): Promise<TestSequenceDoc> {
    throw new Error("unused");
  },
  async create(doc: TestSequenceDoc, tier: SequenceTier): Promise<SequenceListEntry> {
    return { id: "scratch-0", name: doc.name, tier, createdAt: "0", updatedAt: "0" };
  },
  async update(id: string, doc: TestSequenceDoc): Promise<SequenceListEntry> {
    return { id, name: doc.name, tier: "scratch", createdAt: "0", updatedAt: "0" };
  },
};

function newStore(): TesterStore {
  return new TesterStore(noopClient, 0);
}

/** Author a length-2 snake at (1,1)→(2,1), one cell in from the wall. */
function authorSnake(store: TesterStore): SnakeId {
  store.applyEdit((s) => addSnake(s, { x: 1, y: 1 }, "team-0" as CentaurTeamId, 100, CONFIG));
  const id = store.currentState.snakes[0]?.snakeId;
  if (id === undefined) throw new Error("no snake created");
  store.applyEdit((s) => appendBodyCell(s, id, { x: 2, y: 1 }));
  return id;
}

describe("teamName", () => {
  it("resolves a configured team id to its name and falls back to the id", () => {
    const store = newStore();
    expect(store.teamName("team-0")).toBe("Red");
    expect(store.teamName("team-1")).toBe("Blue");
    expect(store.teamName("team-404")).toBe("team-404");
  });
});

describe("selection — single source of truth (design D15)", () => {
  it("selectSnake is a plain setter, not a toggle", () => {
    const store = newStore();
    const id = authorSnake(store);
    store.selectSnake(id);
    expect(store.selectedSnakeId).toBe(id);
    // Re-selecting the same snake keeps it selected (no toggle-off).
    store.selectSnake(id);
    expect(store.selectedSnakeId).toBe(id);
    store.selectSnake(null);
    expect(store.selectedSnakeId).toBeNull();
  });

  it("addSnakeAt creates and selects atomically, re-selecting each new snake", () => {
    const store = newStore();
    store.addSnakeAt({ x: 3, y: 3 });
    const first = store.selectedSnakeId;
    expect(first).not.toBeNull();
    expect(store.selectedSnake?.snakeId).toBe(first);

    // Adding a second snake while the first is selected must move the
    // selection to the new snake — the core of the reported bug.
    store.addSnakeAt({ x: 6, y: 6 });
    const second = store.selectedSnakeId;
    expect(second).not.toBe(first);
    expect(store.selectedSnake?.snakeId).toBe(second);
  });

  it("lets the next click extend the just-created snake (no stale target)", () => {
    const store = newStore();
    store.addSnakeAt({ x: 3, y: 3 }); // selected
    store.addSnakeAt({ x: 6, y: 6 }); // now selected
    const target = store.selectedSnake;
    if (target === null) throw new Error("no selection after add");
    // Extending "next to it" grows the selected (newest) snake, not the first.
    store.applyEdit((s) => appendBodyCell(s, target.snakeId, { x: 6, y: 7 }));
    expect(store.error).toBeNull();
    expect(store.currentState.snakes.find((s) => s.snakeId === target.snakeId)?.body).toHaveLength(
      2,
    );
    // The other snake is untouched.
    expect(store.currentState.snakes.find((s) => s.snakeId !== target.snakeId)?.body).toHaveLength(
      1,
    );
  });

  it("selectedSnake self-heals when the selected snake is removed", () => {
    const store = newStore();
    store.addSnakeAt({ x: 3, y: 3 });
    const id = store.selectedSnakeId;
    if (id === null) throw new Error("no selection");
    expect(store.selectedSnake).not.toBeNull();
    // Remove it: the id lingers but the derived selection reads as none.
    store.applyEdit((s) => removeSnake(s, id, CONFIG));
    expect(store.selectedSnake).toBeNull();
  });
});

describe("ghostSnakeIds — one-turn dead-snake ghost", () => {
  it("ghosts a snake only on the turn it dies, never before or after", () => {
    const store = newStore();
    const id = authorSnake(store);

    // Move Left into the wall at (0,1): certain death this turn.
    store.stage(id, Direction.Left);
    store.simulate();

    // Turn 1: the snake is dead and drawn as a one-turn ghost.
    expect(store.cursor).toBe(1);
    expect(store.currentState.snakes.find((s) => s.snakeId === id)?.alive).toBe(false);
    expect([...store.ghostSnakeIds]).toEqual([id]);

    // Turn 0: it was alive, so it is not a ghost.
    store.scrubTo(0);
    expect(store.ghostSnakeIds.size).toBe(0);

    // A later turn: dead already at the previous turn, so no longer a ghost.
    store.scrubTo(1);
    store.simulate();
    expect(store.cursor).toBe(2);
    expect(store.ghostSnakeIds.size).toBe(0);
  });
});
