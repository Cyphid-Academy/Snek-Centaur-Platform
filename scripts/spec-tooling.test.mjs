import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { freshnessProblemsFor } from "./check-change-freshness.mjs";
import { foldChange } from "./fold-change.mjs";
import { buildSpecIndex, makeResolver } from "./spec-index.mjs";

const write = (root, path, content) => {
  mkdirSync(join(root, dirname(path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

// A temp repo with a source capability (`oldcap`, with an intra-capability
// reference) and a change whose delta renames it to `newcap` and adds one
// requirement. Committed so the freshness/seed machinery sees the delta.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cap-rename-"));
  write(
    root,
    "openspec/specs/oldcap/spec.md",
    `# oldcap Specification

## Purpose

Old purpose. Depends on: (none).

## Requirements

### Requirement: oldcap/alpha
The system SHALL do alpha, see oldcap/beta.

#### Scenario: #a1
- **WHEN** x
- **THEN** y

### Requirement: oldcap/beta
The system SHALL do beta.

#### Scenario: #b1
- **WHEN** p
- **THEN** q
`,
  );
  write(
    root,
    "openspec/changes/rename-test/specs/newcap/spec.md",
    `## RENAMES CAPABILITY: oldcap

## Purpose

New purpose for the renamed capability. Depends on: (none).

## ADDED Requirements

### Requirement: newcap/gamma
The system SHALL do gamma.

#### Scenario: #g1
- **WHEN** m
- **THEN** n
`,
  );
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm seed", {
    cwd: root,
  });
  return root;
}

describe("capability rename tooling", () => {
  it("resolves renamed identifiers via the open-change overlay", () => {
    const resolves = makeResolver(buildSpecIndex(fixture(), { overlayOpenChanges: true }));
    expect(resolves("newcap/alpha")).toBe(true); // carried over
    expect(resolves("newcap/alpha#a1")).toBe(true); // carried scenario
    expect(resolves("newcap/gamma")).toBe(true); // added by the delta
    expect(resolves("oldcap/alpha")).toBe(true); // source still binds while open
  });

  it("passes the freshness precondition for a well-formed rename delta", () => {
    const { problems, skipped } = freshnessProblemsFor(fixture(), "rename-test");
    expect(problems).toEqual([]);
    expect(skipped).toBe(0);
  });

  it("flags a rename whose source capability does not exist", () => {
    const root = fixture();
    // Point the directive at a nonexistent source.
    const delta = join(root, "openspec/changes/rename-test/specs/newcap/spec.md");
    writeFileSync(delta, readFileSync(delta, "utf8").replace("oldcap", "ghostcap"));
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm edit", { cwd: root });
    const { problems } = freshnessProblemsFor(root, "rename-test");
    expect(problems.some((p) => p.includes("RENAMES CAPABILITY source"))).toBe(true);
  });

  it("folds by moving the folder, re-prefixing, and appending ADDED", () => {
    const root = fixture();
    foldChange(root, "rename-test");
    const folded = readFileSync(join(root, "openspec/specs/newcap/spec.md"), "utf8");
    expect(folded.startsWith("# newcap Specification")).toBe(true);
    expect(folded).toContain("New purpose for the renamed capability");
    expect(folded).toContain("### Requirement: newcap/alpha");
    expect(folded).toContain("see newcap/beta"); // intra-capability ref re-prefixed
    expect(folded).toContain("#### Scenario: #a1"); // carried scenario preserved
    expect(folded).toContain("### Requirement: newcap/gamma"); // ADDED appended
    expect(folded).not.toContain("oldcap/"); // no stray source references
    expect(existsSync(join(root, "openspec/specs/oldcap"))).toBe(false); // source removed
  });
});
