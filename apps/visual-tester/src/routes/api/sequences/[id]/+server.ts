// Sequence retrieval by id.
// spec: test-sequences/persistence — the retrieved document is value-
// identical to the saved one. The stored file is already canonical JSON, but
// re-canonicalising through the codec keeps the guarantee defensive against a
// hand-edited fixture.
//
// Re-canonicalising means DECODING, and the decoder is entitled to assume the
// shapes validation guarantees — a recorded state narrows to a `GameState`,
// which throws if it is not in lockstep. So the stored document is validated
// first, exactly as a posted one is. Skipping that turns any document this
// build cannot read into a 500 with a stack trace instead of the version
// message the reader needs, and the documents most likely to be unreadable are
// the ones already on disk: `sequences/scratch/` is gitignored, so it survives
// a branch switch and outlives the schema version that wrote it.
// spec: test-sequences/schema-version#unknown-version-rejected

import { getSequence, isValidSequenceId, updateSequence } from "$lib/server/fsStore.js";
import { canonicalizeDoc } from "$lib/test-sequences/codec.js";
import { validateTestSequenceDoc } from "$lib/test-sequences/schema.js";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params }) => {
  if (!isValidSequenceId(params.id)) {
    return json({ errors: [{ path: "id", message: "id must match [a-z0-9-]+" }] }, { status: 400 });
  }
  const record = await getSequence(params.id);
  if (!record) {
    return json(
      { errors: [{ path: "id", message: `no sequence with id ${params.id}` }] },
      { status: 404 },
    );
  }
  const result = validateTestSequenceDoc(record.data);
  if (!result.ok) {
    // 409 rather than 400: the request was fine, the stored document is what
    // this build cannot read. The errors carry the reason (an unsupported
    // schema version names itself), which is what the reader can act on.
    return json({ errors: result.errors }, { status: 409 });
  }
  return json({ ...record, data: canonicalizeDoc(result.doc) });
};

// Overwrite an existing sequence in place: scratch autosave (design D11) and
// fixture overwrite-by-name. Schema-gated like create.
export const PUT: RequestHandler = async ({ params, request }) => {
  if (!isValidSequenceId(params.id)) {
    return json({ errors: [{ path: "id", message: "id must match [a-z0-9-]+" }] }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { errors: [{ path: "(document root)", message: "request body must be valid JSON" }] },
      { status: 400 },
    );
  }
  const result = validateTestSequenceDoc(body);
  if (!result.ok) {
    return json({ errors: result.errors }, { status: 400 });
  }
  const record = await updateSequence(params.id, canonicalizeDoc(result.doc));
  if (!record) {
    return json(
      { errors: [{ path: "id", message: `no sequence with id ${params.id}` }] },
      { status: 404 },
    );
  }
  return json(record);
};
