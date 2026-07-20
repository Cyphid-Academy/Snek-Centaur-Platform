// spec: test-sequences/persistence — round-trip fidelity, metadata-only
// listing, and tier placement, against a temp store directory. No database,
// so this runs everywhere (Replit, agent VMs, CI) with no setup.
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Direction } from "@cyphid/snek-engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonicalizeDoc, encodeTestSequence } from "../test-sequences/codec.js";
import {
  buildInitialState,
  defaultConfig,
  gameSeed,
  moves,
  recordSequence,
} from "../test-sequences/fixtures.js";
import { deriveTurnSeed } from "../test-sequences/seed.js";
import {
  createSequence,
  getSequence,
  isValidSequenceId,
  listSequences,
  updateSequence,
} from "./fsStore.js";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "vt-sequences-"));
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function doc(name: string) {
  return canonicalizeDoc(
    encodeTestSequence(
      recordSequence(
        name,
        gameSeed(),
        defaultConfig(),
        buildInitialState(),
        [
          { turnNumber: 1, stagedMoves: moves([[1, Direction.Right]]) },
          { turnNumber: 2, stagedMoves: moves([[1, Direction.Down]]) },
        ],
        deriveTurnSeed,
      ),
    ),
  );
}

describe("fsStore", () => {
  it("round-trips a saved document with value-level fidelity", async () => {
    const d = doc("roundtrip fixture");
    const created = await createSequence(d, "scratch", root);
    expect(created.name).toBe("roundtrip fixture");
    expect(isValidSequenceId(created.id)).toBe(true);

    const fetched = await getSequence(created.id, root);
    if (!fetched) throw new Error("saved sequence not found");
    expect(fetched.data).toEqual(d);
    expect(JSON.stringify(fetched.data)).toBe(JSON.stringify(d));
  });

  it("lists id/name/tier/timestamps and never the document payload", async () => {
    await createSequence(doc("alpha"), "scratch", root);
    await createSequence(doc("beta"), "fixture", root);
    const list = await listSequences(root);
    expect(list.map((e) => e.name).sort()).toEqual(["alpha", "beta"]);
    for (const e of list) {
      expect(typeof e.createdAt).toBe("string");
      expect(typeof e.updatedAt).toBe("string");
      expect("data" in e).toBe(false);
    }
    expect(list.find((e) => e.name === "beta")?.tier).toBe("fixture");
    expect(list.find((e) => e.name === "alpha")?.tier).toBe("scratch");
  });

  it("writes fixtures to the tracked root and scratch to the scratch subdir", async () => {
    const fixture = await createSequence(doc("kept"), "fixture", root);
    await createSequence(doc("temp"), "scratch", root);
    expect(await readdir(root)).toContain(`${fixture.id}.json`);
    expect(await readdir(join(root, "scratch"))).toHaveLength(1);
  });

  it("returns undefined for a missing or unsafe id", async () => {
    expect(await getSequence("does-not-exist", root)).toBeUndefined();
    expect(await getSequence("../escape", root)).toBeUndefined();
    expect(isValidSequenceId("../escape")).toBe(false);
  });

  it("updates an existing sequence in place, keeping id and tier", async () => {
    const created = await createSequence(doc("original"), "fixture", root);
    const edited = doc("original"); // same name, a distinct document value
    const updated = await updateSequence(created.id, edited, root);
    expect(updated?.id).toBe(created.id);
    expect(updated?.tier).toBe("fixture");
    const fetched = await getSequence(created.id, root);
    expect(fetched?.data).toEqual(edited);
    // Still a single file — an update never creates a second entry.
    expect((await listSequences(root)).filter((e) => e.id === created.id)).toHaveLength(1);
  });

  it("returns undefined when updating a missing id", async () => {
    expect(await updateSequence("nope-00000000", doc("x"), root)).toBeUndefined();
  });
});
