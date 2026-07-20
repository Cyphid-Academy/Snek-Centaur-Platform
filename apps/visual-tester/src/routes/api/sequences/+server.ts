// Sequence CRUD: list + create.
// spec: test-sequences/persistence (#listing) and test-sequences/validation
// (#invalid-document-creates-nothing) — create is schema-gated and rejects
// invalid documents with path-addressed errors before touching the store.

import { type SequenceTier, createSequence, listSequences } from "$lib/server/fsStore.js";
import { canonicalizeDoc } from "$lib/test-sequences/codec.js";
import { validateTestSequenceDoc } from "$lib/test-sequences/schema.js";
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  return json(await listSequences());
};

export const POST: RequestHandler = async ({ request, url }) => {
  // ?tier=fixture writes to the git-tracked set; default is scratch (design D6).
  const tier: SequenceTier = url.searchParams.get("tier") === "fixture" ? "fixture" : "scratch";

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
    // spec: #invalid-document-creates-nothing — nothing was written.
    return json({ errors: result.errors }, { status: 400 });
  }

  // Store the canonical encoding regardless of the paste's key order.
  const record = await createSequence(canonicalizeDoc(result.doc), tier);
  return json(record, { status: 201 });
};
