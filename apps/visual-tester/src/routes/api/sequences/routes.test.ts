// The sequence routes, called as HTTP handlers.
//
// Everything else in this app tests the modules the routes compose —
// `fsStore.test.ts` the persistence, `schema.test.ts` the validation,
// `codec.test.ts` the encoding. Nothing tested the WIRING, which is where a
// route can skip validation and look identical to one that does not.
//
// The case that matters here is a document this build cannot read. Every other
// test in the repo builds its input with the CURRENT codec, so no test ever
// sees a document an older schema version wrote — and the one place such
// documents actually live, `sequences/scratch/`, is gitignored and therefore
// invisible to CI while surviving every branch switch on a real machine. Each
// ingest path owes the same answer: a readable rejection naming the version,
// never a throw.
// spec: test-sequences/schema-version#unknown-version-rejected,
// test-sequences/validation#invalid-document-creates-nothing
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defaultSequencesRoot } from "$lib/server/fsStore.js";
import { type TestSequenceDoc, encodeTestSequence } from "$lib/test-sequences/codec.js";
import { downgradeToPreviousVersion, recordedDoc } from "$lib/test-sequences/fixtures.js";
import { afterEach, describe, expect, it } from "vitest";
import { POST } from "./+server.js";
import { GET } from "./[id]/+server.js";

// The routes read the default store root, so tests write there under ids they
// own and clean up after. Scratch is gitignored, so nothing leaks into review.
const scratch = join(defaultSequencesRoot, "scratch");
const written: string[] = [];

afterEach(async () => {
  await Promise.all(written.splice(0).map((p) => rm(p, { force: true })));
});

const currentDoc = (name = "route-test-current"): TestSequenceDoc =>
  encodeTestSequence(recordedDoc(name));

async function countScratch(): Promise<number> {
  return (await readdir(scratch).catch(() => [] as string[])).length;
}

async function put(id: string, doc: unknown): Promise<void> {
  await mkdir(scratch, { recursive: true });
  const path = join(scratch, `${id}.json`);
  await writeFile(path, JSON.stringify(doc, null, 2), "utf8");
  written.push(path);
}

const getById = (id: string): Promise<Response> =>
  GET({ params: { id } } as unknown as Parameters<typeof GET>[0]) as Promise<Response>;

const post = (doc: unknown): Promise<Response> =>
  POST({
    request: new Request("http://test/api/sequences", {
      method: "POST",
      body: JSON.stringify(doc),
    }),
    url: new URL("http://test/api/sequences"),
  } as unknown as Parameters<typeof POST>[0]) as Promise<Response>;

describe("GET /api/sequences/[id]", () => {
  it("returns a stored current-version document", async () => {
    await put("route-test-current", currentDoc());
    const res = await getById("route-test-current");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: TestSequenceDoc };
    expect(body.data.turns).toHaveLength(1);
    expect(body.data.turns[0]?.timings.durationMs).toBeTypeOf("number");
  });

  // The regression this suite exists for. Before the route validated, this
  // reached the decoder, which narrows a recorded state to a `GameState` and
  // throws when it is not in lockstep — surfacing as a 500 with a stack trace
  // where the reader needed "unsupported schema version 1".
  it("refuses a document written by an older schema version, without throwing", async () => {
    await put("route-test-stale", downgradeToPreviousVersion(currentDoc()));
    const res = await getById("route-test-stale");
    expect(res.status).not.toBe(500);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { errors: Array<{ path: string; message: string }> };
    expect(body.errors[0]?.path).toBe("schemaVersion");
    expect(body.errors[0]?.message).toContain("unsupported schema version 1");
  });

  it("404s an unknown id and 400s a malformed one", async () => {
    expect((await getById("route-test-no-such-sequence")).status).toBe(404);
    expect((await getById("Not A Valid Id")).status).toBe(400);
  });
});

// The other ingest path — paste-import — owes the same answer, and answering
// it here rather than only where the bug was is the point: the next schema
// bump inherits both guards.
describe("POST /api/sequences", () => {
  it("accepts a current-version document", async () => {
    const res = await post(currentDoc("route-test-post"));
    expect(res.status).toBe(201);
    const record = (await res.json()) as { id: string };
    written.push(join(scratch, `${record.id}.json`));
  });

  it("refuses a document written by an older schema version, creating nothing", async () => {
    const before = await countScratch();
    const res = await post(downgradeToPreviousVersion(currentDoc()));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { errors: Array<{ path: string; message: string }> };
    expect(body.errors[0]?.message).toContain("unsupported schema version 1");
    expect(await countScratch()).toBe(before);
  });
});
