// spec: visual-tester/auto-persist, visual-tester/history-rewrite — the
// store's auto-persistence lifecycle, driven against an in-memory fake client
// (no server, no DOM). Proves head edits update one scratch in place, middle
// edits fork a new scratch preserving the parent, and editing a loaded fixture
// forks to scratch.
import { CellType } from "@cyphid/snek-engine";
import { describe, expect, it } from "vitest";
import type { SequenceClient, SequenceListEntry, SequenceTier } from "./sequenceClient.js";
import { TesterStore } from "./store.svelte.js";
import type { TestSequenceDoc } from "./test-sequences/codec.js";

interface Entry {
  tier: SequenceTier;
  name: string;
  doc: TestSequenceDoc;
  seq: number;
}

class FakeClient implements SequenceClient {
  readonly entries = new Map<string, Entry>();
  #n = 0;

  #toListEntry(id: string, e: Entry): SequenceListEntry {
    const t = String(e.seq).padStart(6, "0");
    return { id, name: e.name, tier: e.tier, createdAt: t, updatedAt: t };
  }

  async list(): Promise<SequenceListEntry[]> {
    return [...this.entries.entries()]
      .map(([id, e]) => this.#toListEntry(id, e))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  async get(id: string): Promise<TestSequenceDoc> {
    const e = this.entries.get(id);
    if (!e) throw new Error(`no sequence ${id}`);
    return e.doc;
  }
  async create(doc: TestSequenceDoc, tier: SequenceTier): Promise<SequenceListEntry> {
    const id = `${doc.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${this.#n}`;
    const e: Entry = { tier, name: doc.name, doc, seq: this.#n++ };
    this.entries.set(id, e);
    return this.#toListEntry(id, e);
  }
  async update(id: string, doc: TestSequenceDoc): Promise<SequenceListEntry> {
    const e = this.entries.get(id);
    if (!e) throw new Error(`no sequence ${id}`);
    e.doc = doc;
    e.name = doc.name;
    e.seq = this.#n++;
    return this.#toListEntry(id, e);
  }

  scratchIds(): string[] {
    return [...this.entries.entries()].filter(([, e]) => e.tier === "scratch").map(([id]) => id);
  }
  fixtureIds(): string[] {
    return [...this.entries.entries()].filter(([, e]) => e.tier === "fixture").map(([id]) => id);
  }
  turns(id: string): number {
    return this.entries.get(id)?.doc.turns.length ?? -1;
  }
}

const noopEdit = (store: TesterStore) =>
  store.applyEdit(() => ({ ok: true, state: store.currentState }));

function newStore(): { store: TesterStore; client: FakeClient } {
  const client = new FakeClient();
  return { store: new TesterStore(client, 0), client };
}

describe("auto-persist lifecycle", () => {
  it("materializes one scratch and updates it in place across head edits", async () => {
    const { store, client } = newStore();
    store.simulate(); // head: materialize
    await store.settled();
    expect(client.scratchIds()).toHaveLength(1);
    const id = client.scratchIds()[0];
    if (id === undefined) throw new Error("no scratch");
    expect(client.turns(id)).toBe(1);

    store.simulate(); // head: update the same file
    await store.settled();
    expect(client.scratchIds()).toEqual([id]);
    expect(client.turns(id)).toBe(2);
  });

  it("forks a new scratch on a middle edit, preserving the parent", async () => {
    const { store, client } = newStore();
    store.simulate();
    store.simulate();
    await store.settled();
    const parent = client.scratchIds()[0];
    if (parent === undefined) throw new Error("no parent");
    expect(client.turns(parent)).toBe(2);

    store.scrubTo(1); // move off the head
    noopEdit(store); // middle edit → fork 0..1
    await store.settled();

    expect(client.scratchIds()).toHaveLength(2);
    expect(client.turns(parent)).toBe(2); // parent untouched
    const fork = client.scratchIds().find((x) => x !== parent);
    if (fork === undefined) throw new Error("no fork");
    expect(client.turns(fork)).toBe(1); // fork holds 0..1
    expect(client.entries.get(fork)?.name).toMatch(/\(branch @turn 1\)$/);

    // Subsequent head edits update the fork, not the parent.
    store.simulate();
    await store.settled();
    expect(client.turns(fork)).toBe(2);
    expect(client.turns(parent)).toBe(2);
  });

  it("forks to scratch when a loaded fixture is edited, leaving the fixture", async () => {
    const { store, client } = newStore();
    store.simulate();
    await store.settled();
    const scratchId = client.scratchIds()[0];
    if (scratchId === undefined) throw new Error("no scratch");
    // Promote a copy to the fixture tier and load it.
    const scratchEntry = client.entries.get(scratchId);
    if (scratchEntry === undefined) throw new Error("scratch entry missing");
    await client.create(scratchEntry.doc, "fixture");
    await store.refreshList();
    const fixture = store.sequences.find((e) => e.tier === "fixture");
    if (!fixture) throw new Error("no fixture");
    await store.load(fixture);

    noopEdit(store); // first edit of a loaded fixture → fork
    await store.settled();

    expect(client.fixtureIds()).toHaveLength(1); // fixture untouched
    expect(client.scratchIds().length).toBeGreaterThanOrEqual(2);
  });

  it("reports a name clash when saving a fixture over an existing one", async () => {
    const { store, client } = newStore();
    store.simulate();
    await store.settled();
    const first = await store.saveFixture("golden");
    expect(first).toEqual({ status: "created" });
    const second = await store.saveFixture("Golden"); // case-insensitive
    expect(second.status).toBe("conflict");
    expect(client.fixtureIds()).toHaveLength(1);
  });
});

describe("boardgen settings", () => {
  it("generates a board at the configured size with hazards from the percentage", () => {
    const { store } = newStore();
    store.boardgen = {
      boardSize: 21,
      snakesPerTeam: 1,
      hazardPercentage: 12,
      density: 30,
      clustering: 10,
    };
    // newFromBoardgen uses a fresh random seed; retry to make the (rare)
    // infeasible-seed case non-flaky. Safe params make success near-certain.
    for (let i = 0; i < 9; i++) {
      store.newFromBoardgen();
      if (store.notice === null) break;
    }
    expect(store.notice).toBeNull(); // generation succeeded
    expect(store.currentState.board.boardSize).toBe(21);
    const hazards = store.currentState.board.cells.filter((c) => c === CellType.Hazard).length;
    expect(hazards).toBeGreaterThan(0);
  });
});
