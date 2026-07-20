---
name: jsonb canonical fidelity
description: Postgres jsonb reorders object keys; canonical-encoding codecs must own key order for every nested object, including "plain JSON" pass-throughs.
---
Postgres `jsonb` preserves JSON values but not key order. Any document stored there and compared byte-for-byte against its canonical encoding will fail unless *every* object in the document is rebuilt with a fixed key order by the codec.

**Why:** The visual-tester round-trip test caught this: the codec canonicalised state/turns but passed the game config through untouched ("already plain JSON-shaped"), so the config came back from jsonb with reordered keys and broke byte-level identity of the canonical encoding.

**How to apply:** When extending the test-sequences codec (or any canonical-encoding codec) with a new field, never pass an object through untouched — rebuild it with explicit key order, and keep a byte-level `JSON.stringify` round-trip test through the real database.
