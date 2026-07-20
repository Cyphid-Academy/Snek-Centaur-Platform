// Client-side port to the sequence-persistence routes. Abstracted behind an
// interface so the store's auto-persist logic (design D11) can be unit-tested
// against an in-memory fake instead of a live server.
import type { TestSequenceDoc } from "./test-sequences/codec.js";

export type SequenceTier = "fixture" | "scratch";

export interface SequenceListEntry {
  readonly id: string;
  readonly name: string;
  readonly tier: SequenceTier;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PathError {
  readonly path: string;
  readonly message: string;
}

export class SequenceRequestError extends Error {
  constructor(readonly errors: ReadonlyArray<PathError>) {
    super(errors.map((e) => `${e.path}: ${e.message}`).join("; "));
    this.name = "SequenceRequestError";
  }
}

export interface SequenceClient {
  list(): Promise<SequenceListEntry[]>;
  get(id: string): Promise<TestSequenceDoc>;
  create(doc: TestSequenceDoc, tier: SequenceTier): Promise<SequenceListEntry>;
  update(id: string, doc: TestSequenceDoc): Promise<SequenceListEntry>;
}

async function orThrow(res: Response): Promise<unknown> {
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errors = (payload as { errors?: PathError[] }).errors ?? [
      { path: "(request)", message: `request failed (${res.status})` },
    ];
    throw new SequenceRequestError(errors);
  }
  return payload;
}

export const fetchSequenceClient: SequenceClient = {
  async list() {
    return (await orThrow(await fetch("/api/sequences"))) as SequenceListEntry[];
  },
  async get(id) {
    const record = (await orThrow(await fetch(`/api/sequences/${id}`))) as {
      data: TestSequenceDoc;
    };
    return record.data;
  },
  async create(doc, tier) {
    return (await orThrow(
      await fetch(`/api/sequences?tier=${tier}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      }),
    )) as SequenceListEntry;
  },
  async update(id, doc) {
    return (await orThrow(
      await fetch(`/api/sequences/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      }),
    )) as SequenceListEntry;
  },
};
