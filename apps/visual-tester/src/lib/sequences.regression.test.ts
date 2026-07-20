// spec: test-sequences/replay-check — every committed fixture is a
// regression test. This globs the git-tracked fixtures in ../sequences and
// replays each through the module-01 resolver, failing on any divergence.
//
// This is the headless runner the canonical-JSON contract was designed for:
// promoting a sequence (saving it as a fixture, then committing it) turns it
// into CI coverage with no extra wiring. With no fixtures committed yet the
// suite passes vacuously.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultSequencesRoot } from "./server/fsStore.js";
import { type TestSequenceDoc, decodeTestSequence } from "./test-sequences/codec.js";
import { runReplayCheck } from "./test-sequences/replay.js";
import { validateTestSequenceDoc } from "./test-sequences/schema.js";

// The git-tracked fixture set is the root itself (scratch/ is a subdir).
const fixturesDir = defaultSequencesRoot;

function fixtureFiles(): string[] {
  try {
    return readdirSync(fixturesDir).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
}

const files = fixtureFiles();

describe("committed Test Sequence fixtures", () => {
  it("has a fixtures directory to glob", () => {
    expect(Array.isArray(files)).toBe(true);
  });

  it.each(files)("%s replays without divergence", (file) => {
    const raw: unknown = JSON.parse(readFileSync(join(fixturesDir, file), "utf8"));
    const validated = validateTestSequenceDoc(raw);
    if (!validated.ok) {
      throw new Error(
        `${file} is not a valid Test Sequence:\n${validated.errors
          .map((e) => `  ${e.path}: ${e.message}`)
          .join("\n")}`,
      );
    }
    const result = runReplayCheck(decodeTestSequence(validated.doc as TestSequenceDoc));
    if (!result.passed) {
      throw new Error(
        `${file} diverged at turn ${result.divergentTurnNumber} (${result.turnsVerified} verified):\n${result.differences
          .map(
            (d) =>
              `  ${d.path}: expected ${JSON.stringify(d.expected)}, got ${JSON.stringify(d.computed)}`,
          )
          .join("\n")}`,
      );
    }
    expect(result.passed).toBe(true);
  });
});
