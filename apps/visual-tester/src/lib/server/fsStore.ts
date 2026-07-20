// Filesystem persistence for Test Sequences.
//
// spec: test-sequences/persistence — durable store with id, name,
// timestamps, and the JSON document; list / get / save.
// design: add-visual-tester (D6) — sequences are canonical-JSON files in the
// repo, in two tiers: `fixture` (git-tracked, the promoted regression set CI
// replays) and `scratch` (gitignored, working sequences). This is zero-setup
// on Replit, agent VMs, and CI alike — no database to provision — and the
// files ARE the canonical documents, so copy/paste and round-trip are exact.
//
// Server-only ($lib/server): never bundled into client code.
import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { TestSequenceDoc } from "../test-sequences/codec.js";

export type SequenceTier = "fixture" | "scratch";

export interface SequenceListEntry {
  readonly id: string;
  readonly name: string;
  readonly tier: SequenceTier;
  readonly createdAt: string; // ISO timestamp
  readonly updatedAt: string; // ISO timestamp
}

export interface SequenceRecord extends SequenceListEntry {
  readonly data: TestSequenceDoc;
}

// The tracked-fixture root, `<app>/sequences`. The app's dev/build/test
// commands all run with the app directory as cwd (pnpm --filter); other
// deployments can point `VT_SEQUENCES_DIR` at an absolute path. Overridable
// per-call via the `root` parameter below (used by tests).
const { VT_SEQUENCES_DIR } = process.env;
export const defaultSequencesRoot = VT_SEQUENCES_DIR ?? resolve(process.cwd(), "sequences");

const TIERS: SequenceTier[] = ["fixture", "scratch"];
const tierDir = (root: string, tier: SequenceTier) =>
  tier === "fixture" ? root : `${root.replace(/\/$/, "")}/scratch`;

// Ids are the filename stem; constrain to a filesystem- and URL-safe shape so
// a request id can never escape the store directory.
const ID_RE = /^[a-z0-9-]+$/;
export const isValidSequenceId = (id: string): boolean => ID_RE.test(id);

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base.length > 0 ? base : "sequence";
}

async function statTimes(file: string): Promise<{ createdAt: string; updatedAt: string }> {
  const s = await stat(file);
  const birth = s.birthtimeMs > 0 ? s.birthtime : s.mtime;
  return { createdAt: birth.toISOString(), updatedAt: s.mtime.toISOString() };
}

/** List every sequence in both tiers, newest first. Reads each file to
 *  recover its display name but returns metadata only — never the document
 *  payload (spec: test-sequences/persistence#listing). Unparseable files are
 *  skipped with a warning rather than breaking the whole listing. */
export async function listSequences(
  root: string = defaultSequencesRoot,
): Promise<ReadonlyArray<SequenceListEntry>> {
  const entries: SequenceListEntry[] = [];
  for (const tier of TIERS) {
    const dir = tierDir(root, tier);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      continue; // dir may not exist yet (scratch is created on first write)
    }
    for (const file of names) {
      if (!file.endsWith(".json")) continue;
      const id = file.slice(0, -".json".length);
      const path = `${dir}/${file}`;
      try {
        const doc = JSON.parse(await readFile(path, "utf8")) as TestSequenceDoc;
        entries.push({ id, tier, name: doc.name, ...(await statTimes(path)) });
      } catch (err) {
        console.warn(`skipping unparseable sequence file ${path}:`, err);
      }
    }
  }
  entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return entries;
}

/** Retrieve one sequence by id, searching both tiers. */
export async function getSequence(
  id: string,
  root: string = defaultSequencesRoot,
): Promise<SequenceRecord | undefined> {
  if (!isValidSequenceId(id)) return undefined;
  for (const tier of TIERS) {
    const path = `${tierDir(root, tier)}/${id}.json`;
    try {
      const doc = JSON.parse(await readFile(path, "utf8")) as TestSequenceDoc;
      return { id, tier, name: doc.name, data: doc, ...(await statTimes(path)) };
    } catch {
      // not in this tier; try the next
    }
  }
  return undefined;
}

// Caller is responsible for validating `doc` first (routes gate on the
// contract schema per test-sequences/validation). A short random suffix keeps
// names with the same slug from colliding.
export async function createSequence(
  doc: TestSequenceDoc,
  tier: SequenceTier = "scratch",
  root: string = defaultSequencesRoot,
): Promise<SequenceRecord> {
  const dir = tierDir(root, tier);
  await mkdir(dir, { recursive: true });
  const id = `${slugify(doc.name)}-${randomUUID().slice(0, 8)}`;
  const path = `${dir}/${id}.json`;
  await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  return { id, tier, name: doc.name, data: doc, ...(await statTimes(path)) };
}

// Overwrite an existing sequence in place, keeping its id and tier. Used for
// scratch autosave (design D11) and fixture overwrite-by-name. Returns
// undefined when no file with that id exists in either tier. Caller validates
// `doc` first.
export async function updateSequence(
  id: string,
  doc: TestSequenceDoc,
  root: string = defaultSequencesRoot,
): Promise<SequenceRecord | undefined> {
  if (!isValidSequenceId(id)) return undefined;
  for (const tier of TIERS) {
    const dir = tierDir(root, tier);
    const path = `${dir}/${id}.json`;
    try {
      await stat(path); // must already exist to be an update
    } catch {
      continue;
    }
    await writeFile(path, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
    return { id, tier, name: doc.name, data: doc, ...(await statTimes(path)) };
  }
  return undefined;
}
