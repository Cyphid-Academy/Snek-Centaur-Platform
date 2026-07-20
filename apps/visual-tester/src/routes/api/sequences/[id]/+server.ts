// Sequence retrieval by id.
// spec: test-sequences/persistence — the retrieved document is value-
// identical to the saved one. The stored file is already canonical JSON, but
// re-canonicalising through the codec keeps the guarantee defensive against a
// hand-edited fixture.

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
  return json({ ...record, data: canonicalizeDoc(record.data) });
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
