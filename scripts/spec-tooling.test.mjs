import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { freshnessProblemsFor } from "./check-change-freshness.mjs";
import { taskProgress } from "./check-open-changes.mjs";
import { foldChange } from "./fold-change.mjs";
import { buildSpecIndex, makeResolver, parseDependsOn } from "./spec-index.mjs";

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

describe("parseDependsOn", () => {
  it("parses a multi-dependency declaration up to its first period", () => {
    const r = parseDependsOn(
      "## Purpose\n\nBlah.\n\nDepends on: game-engine, test-sequences. Consumed by: x.",
    );
    expect(r.found).toBe(true);
    expect(r.deps).toEqual(["game-engine", "test-sequences"]);
    expect(r.problem).toBeUndefined();
  });

  it("treats a (none …) declaration as empty", () => {
    const r = parseDependsOn("Depends on: (none — root of the capability graph). Consumed by: y.");
    expect(r.found).toBe(true);
    expect(r.deps).toEqual([]);
    expect(r.problem).toBeUndefined();
  });

  it("joins a declaration wrapped across lines", () => {
    expect(parseDependsOn("Depends on: game-engine,\ntest-sequences.").deps).toEqual([
      "game-engine",
      "test-sequences",
    ]);
  });

  it("finds a declaration mid-line (Purpose prose wraps freely)", () => {
    expect(
      parseDependsOn("Defines the contract. Depends on: game-engine. Consumed by: z.").deps,
    ).toEqual(["game-engine"]);
  });

  it("reports a missing declaration", () => {
    expect(parseDependsOn("## Purpose\n\nNo declaration here.").found).toBe(false);
  });

  it("flags an unparseable entry", () => {
    expect(parseDependsOn("Depends on: the game engine.").problem).toBeTruthy();
  });
});

// A temp repo with no specs/ yet and two open mint changes in one PR — a
// change train — where the second capability depends on and references the
// first while both are still open.
function trainFixture() {
  const root = mkdtempSync(join(tmpdir(), "change-train-"));
  write(
    root,
    "openspec/changes/mint-cap-a/specs/cap-a/spec.md",
    `## Purpose

Capability A. Depends on: (none).

## ADDED Requirements

### Requirement: cap-a/alpha
The system SHALL alpha.

#### Scenario: #a1
- **WHEN** x
- **THEN** y
`,
  );
  write(
    root,
    "openspec/changes/mint-cap-b/specs/cap-b/spec.md",
    `## Purpose

Capability B. Depends on: cap-a.

## ADDED Requirements

### Requirement: cap-b/beta
The system SHALL beta per cap-a/alpha.

#### Scenario: #b1
- **WHEN** p
- **THEN** q
`,
  );
  execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm seed", {
    cwd: root,
  });
  return root;
}

describe("change trains (several open changes in one PR)", () => {
  it("resolves cross-change references through the overlay", () => {
    const resolves = makeResolver(buildSpecIndex(trainFixture(), { overlayOpenChanges: true }));
    expect(resolves("cap-a/alpha")).toBe(true);
    expect(resolves("cap-b/beta#b1")).toBe(true);
  });

  it("passes the freshness precondition for every change in the train", () => {
    const { problems, skipped } = freshnessProblemsFor(trainFixture());
    expect(problems).toEqual([]);
    expect(skipped).toBe(0);
  });

  it("folds the train's changes independently, minting both capabilities", () => {
    const root = trainFixture();
    foldChange(root, "mint-cap-a");
    foldChange(root, "mint-cap-b");
    expect(readFileSync(join(root, "openspec/specs/cap-a/spec.md"), "utf8")).toContain(
      "### Requirement: cap-a/alpha",
    );
    expect(readFileSync(join(root, "openspec/specs/cap-b/spec.md"), "utf8")).toContain(
      "### Requirement: cap-b/beta",
    );
  });

  it("refuses to fold a change citing a capability that exists only as an open change", () => {
    // cap-b cites cap-a/alpha; with cap-a unarchived, folding cap-b first
    // would make specs/ cite a phantom capability — DAG order is enforced.
    const root = trainFixture();
    const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
      throw new Error(`exit ${code}`);
    });
    try {
      expect(() => foldChange(root, "mint-cap-b")).toThrow("exit 1");
    } finally {
      exit.mockRestore();
    }
  });
});

describe("archive-due gate (taskProgress)", () => {
  it("counts implementation tasks separately from the Archive section", () => {
    const p = taskProgress(`## 1. Build
- [x] author the delta
- [ ] implement the capability

## Archive
- [ ] fold and archive
- [ ] update config.yaml`);
    expect(p).toEqual({
      implUnchecked: 1,
      implChecked: 1,
      archiveUnchecked: 2,
      archiveChecked: 0,
    });
  });

  it("is archive-due semantics: zero unchecked outside Archive", () => {
    const done = taskProgress(`## Work
- [x] everything shipped

## Archive
- [ ] fold and archive`);
    expect(done.implUnchecked).toBe(0);
  });

  it("leaves Archive-section exemption when a later heading follows", () => {
    const p = taskProgress(`## Archive
- [ ] fold

## Follow-up
- [ ] later work`);
    expect(p.implUnchecked).toBe(1);
    expect(p.archiveUnchecked).toBe(1);
  });
});
