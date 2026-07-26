import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { freshnessProblemsFor } from "./check-change-freshness.mjs";
import { taskProgress } from "./check-open-changes.mjs";
import { foldChange } from "./fold-change.mjs";
import { entryProblems, primaryTarget } from "./identifier-map.mjs";
import { buildGraph, renderMarkdown } from "./spec-graph.mjs";
import {
  buildSpecIndex,
  makeResolver,
  parseDeltaOps,
  parseDependsOn,
  parseRequirementDeps,
  purposeSection,
  splitRequirementBlocks,
} from "./spec-index.mjs";

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
Depends on: oldcap/beta.

The system SHALL do alpha.

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
    expect(folded).toContain("Depends on: newcap/beta."); // intra-capability dep re-prefixed
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

  it("reads the capability grain out of the Purpose section alone", () => {
    // A spec file declares at two grains: the capability's in its Purpose,
    // each requirement's in its own block. Scoping the read to the Purpose is
    // what keeps a first-match scan from picking up a requirement's line.
    const spec = `# cap Specification

## Purpose

Cap. Depends on: game-engine.

## Requirements

### Requirement: cap/alpha
Depends on: game-engine/movement.

The system SHALL alpha.
`;
    expect(parseDependsOn(purposeSection(spec)).deps).toEqual(["game-engine"]);
  });
});

describe("structural requirement dependencies", () => {
  const block = (body) => `### Requirement: cap/alpha\n${body}`;

  it("parses the declaration under the header, at either grain", () => {
    const r = parseRequirementDeps(
      block(
        "Depends on: global-invariants/one-shared-engine, game-engine/movement#body-advance.\n\nThe system SHALL alpha.",
      ),
    );
    expect(r.found).toBe(true);
    expect(r.ids).toEqual([
      "global-invariants/one-shared-engine",
      "game-engine/movement#body-advance",
    ]);
    expect(r.problem).toBeUndefined();
    expect(r.lineCount).toBe(1);
  });

  it("joins a declaration wrapped across lines", () => {
    const r = parseRequirementDeps(
      block(
        "Depends on: game-engine/movement,\ngame-engine/determinism.\n\nThe system SHALL alpha.",
      ),
    );
    expect(r.ids).toEqual(["game-engine/movement", "game-engine/determinism"]);
    expect(r.lineCount).toBe(2);
  });

  it("treats a requirement with no declaration as depending on nothing", () => {
    const r = parseRequirementDeps(block("The system SHALL alpha."));
    expect(r.found).toBe(false);
    expect(r.ids).toEqual([]);
  });

  it("requires the declaration to sit directly under the header", () => {
    const r = parseRequirementDeps(
      block("The system SHALL alpha.\n\nDepends on: game-engine/movement."),
    );
    expect(r.problem).toMatch(/directly under the requirement header/);
  });

  it("requires the declaration to be terminated by a period", () => {
    const r = parseRequirementDeps(
      block("Depends on: game-engine/movement\n\nThe system SHALL alpha."),
    );
    expect(r.problem).toMatch(/not terminated by a period/);
  });

  it("rejects a repeated identifier — each is declared once", () => {
    const r = parseRequirementDeps(
      block("Depends on: game-engine/movement, game-engine/movement."),
    );
    expect(r.problem).toMatch(/repeats/);
  });

  it("rejects a scenario entry its own requirement entry already subsumes", () => {
    const r = parseRequirementDeps(
      block("Depends on: game-engine/movement, game-engine/movement#body-advance."),
    );
    expect(r.problem).toMatch(/already subsumes the scenario/);
  });

  it("rejects a capability-grain entry — dependencies are requirements", () => {
    expect(parseRequirementDeps(block("Depends on: game-engine.")).problem).toMatch(/unparseable/);
  });

  it("keeps a REMOVED header out of the block it precedes", () => {
    // REMOVED names requirements by bare header; the splitter must not treat
    // the next section's text as that requirement's body.
    const blocks = splitRequirementBlocks(
      "## REMOVED Requirements\n\n### Requirement: cap/gone\n\n## ADDED Requirements\n\n### Requirement: cap/fresh\nThe system SHALL fresh.\n",
    );
    expect(blocks.map((b) => b.name)).toEqual(["cap/gone", "cap/fresh"]);
    expect(blocks[0].raw).toBe("### Requirement: cap/gone");
  });

  it("splits a spec file into blocks carrying their header line numbers", () => {
    const spec = `# cap Specification

## Requirements

### Requirement: cap/alpha
Depends on: cap/beta.

The system SHALL alpha.

### Requirement: cap/beta
The system SHALL beta.
`;
    const blocks = splitRequirementBlocks(spec);
    expect(blocks.map((b) => b.name)).toEqual(["cap/alpha", "cap/beta"]);
    expect(blocks[0].line).toBe(5);
    expect(parseRequirementDeps(blocks[0].raw).ids).toEqual(["cap/beta"]);
    expect(parseRequirementDeps(blocks[1].raw).found).toBe(false);
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
Depends on: cap-a/alpha.

The system SHALL beta.

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

// A temp repo with an EXISTING capability plus a change that amends its
// Purpose through `## MODIFIED Purpose`. `amend` is the replacement Purpose
// body written in the edit commit; the seed commit always carries the live
// Purpose verbatim, so the seed/edit pair is a reviewable word-diff.
function purposeFixture({
  amend = null,
  seedWithAmendment = false,
  seedWithoutPurpose = false,
} = {}) {
  const root = mkdtempSync(join(tmpdir(), "purpose-"));
  const livePurpose = "Base purpose text.\n\nDepends on: (none — root).";
  write(
    root,
    "openspec/specs/cap/spec.md",
    `# cap Specification

## Purpose

${livePurpose}

## Requirements

### Requirement: cap/alpha
The system SHALL do alpha.

#### Scenario: #a1
- **WHEN** x
- **THEN** y
`,
  );
  const delta = (
    purpose,
  ) => `${purpose === null ? "" : `## MODIFIED Purpose\n\n${purpose}\n\n`}## ADDED Requirements

### Requirement: cap/beta
The system SHALL do beta.

#### Scenario: #b1
- **WHEN** p
- **THEN** q
`;
  const deltaPath = "openspec/changes/amend-test/specs/cap/spec.md";
  write(
    root,
    deltaPath,
    delta(seedWithoutPurpose ? null : seedWithAmendment ? (amend ?? livePurpose) : livePurpose),
  );
  const git = (cmd) => execSync(cmd, { cwd: root });
  git("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm seed");
  if (amend && !seedWithAmendment) {
    write(root, deltaPath, delta(amend));
    git("git add -A && git -c user.email=t@t -c user.name=t commit -qm edit");
  }
  return { root, livePurpose, deltaPath };
}

describe("## MODIFIED Purpose (amending an existing capability's Purpose)", () => {
  it("is parsed as its own section, separate from a minting preamble", () => {
    const ops = parseDeltaOps(
      "## MODIFIED Purpose\n\nNew text.\n\nDepends on: game-engine.\n\n## ADDED Requirements\n\n### Requirement: a/b\nBody.\n",
    );
    expect(ops.modifiedPurpose).toContain("Depends on: game-engine.");
    expect(ops.preamble).toBe("");
    expect([...ops.added.keys()]).toEqual(["a/b"]);
    expect(parseDependsOn(ops.modifiedPurpose).deps).toEqual(["game-engine"]);
  });

  it("passes freshness when the seed carries the live Purpose verbatim", () => {
    const { root } = purposeFixture({ amend: "Amended purpose.\n\nDepends on: (none — root)." });
    expect(freshnessProblemsFor(root, "amend-test").problems).toEqual([]);
  });

  it("fails freshness when the Purpose block is not in the seed commit", () => {
    // Seed has no Purpose block at all; the amendment is bolted on afterwards,
    // which is exactly the "extending the delta in place" the rule forbids.
    const { root, deltaPath } = purposeFixture({ seedWithoutPurpose: true });
    const body = readFileSync(join(root, deltaPath), "utf8");
    writeFileSync(join(root, deltaPath), `## MODIFIED Purpose\n\nLate.\n\n${body}`);
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm late", { cwd: root });
    const { problems } = freshnessProblemsFor(root, "amend-test");
    expect(problems.join("\n")).toMatch(
      /"## MODIFIED Purpose" for "cap" is not in the seed commit/,
    );
  });

  it("fails freshness when specs/ advanced under the seeded Purpose", () => {
    const { root } = purposeFixture({ amend: "Amended.\n\nDepends on: (none — root)." });
    const spec = join(root, "openspec/specs/cap/spec.md");
    writeFileSync(
      spec,
      readFileSync(spec, "utf8").replace("Base purpose text.", "Base purpose text, revised."),
    );
    const { problems } = freshnessProblemsFor(root, "amend-test");
    expect(problems.join("\n")).toMatch(/specs\/ has advanced since "cap"'s Purpose was seeded/);
  });

  it("rejects MODIFIED Purpose on a capability that does not exist yet", () => {
    const { root } = purposeFixture();
    execSync(
      "git mv openspec/specs/cap openspec/specs/other && git -c user.email=t@t -c user.name=t commit -qm mv",
      { cwd: root },
    );
    const { problems } = freshnessProblemsFor(root, "amend-test");
    expect(problems.join("\n")).toMatch(
      /carries "## MODIFIED Purpose" but the capability does not exist/,
    );
  });

  it("folds by replacing the Purpose while preserving the title and requirements", () => {
    const { root } = purposeFixture({
      amend: "Amended purpose body.\n\nDepends on: (none — root).",
    });
    foldChange(root, "amend-test");
    const out = readFileSync(join(root, "openspec/specs/cap/spec.md"), "utf8");
    expect(out).toMatch(/^# cap Specification\n/);
    expect(out).toContain("Amended purpose body.");
    expect(out).not.toContain("Base purpose text.");
    expect(out).toContain("### Requirement: cap/alpha");
    expect(out).toContain("### Requirement: cap/beta");
    // The amendment is folded once, not left as a delta section.
    expect(out).not.toContain("## MODIFIED Purpose");
  });

  it("refuses a minting preamble when the capability already exists, naming the remedy", () => {
    const { root, deltaPath } = purposeFixture();
    writeFileSync(
      join(root, deltaPath),
      readFileSync(join(root, deltaPath), "utf8").replace("## MODIFIED Purpose", "## Purpose"),
    );
    execSync("git add -A && git -c user.email=t@t -c user.name=t commit -qm p", { cwd: root });
    const { problems } = freshnessProblemsFor(root, "amend-test");
    expect(problems.join("\n")).toMatch(/mints a capability/);
    expect(problems.join("\n")).toMatch(/use a "## MODIFIED Purpose" section/);
  });
});

describe("identifier-map schema (disposition + carriedBy)", () => {
  const ctx = {
    resolves: (r) => ["cap/alpha", "cap/beta", "cap/alpha#s1"].includes(r),
    changeResolves: (c) => ["mint-cap", "other-change"].includes(c),
  };
  const check = (entry, kind = "requirement") =>
    entryProblems("07-REQ-001", entry, { ...ctx, kind }).join("\n");

  it("accepts an authored entry with one resolving home", () => {
    expect(
      check({ disposition: "authored", carriedBy: [{ target: "cap/alpha", change: "mint-cap" }] }),
    ).toBe("");
  });

  it("accepts an authored entry with several homes — a legacy id may split", () => {
    expect(
      check({
        disposition: "authored",
        carriedBy: [
          { target: "cap/alpha", change: "mint-cap", part: "first half" },
          { target: "cap/beta", change: "other-change", part: "second half" },
        ],
      }),
    ).toBe("");
  });

  it("rejects an authored entry with no home", () => {
    expect(check({ disposition: "authored", carriedBy: [] })).toMatch(/names no home in carriedBy/);
  });

  it("rejects an authored home that has no target", () => {
    expect(check({ disposition: "authored", carriedBy: [{ change: "mint-cap" }] })).toMatch(
      /authored but a carriedBy element has no target/,
    );
  });

  it("requires dropped to carry nowhere at all", () => {
    expect(
      check({
        disposition: "dropped",
        reason: "obsolete",
        carriedBy: [{ target: "cap/alpha", change: "mint-cap" }],
      }),
    ).toMatch(/dropped but carriedBy is non-empty/);
    expect(check({ disposition: "dropped", reason: "obsolete", carriedBy: [] })).toBe("");
  });

  it("requires a reason for mechanism and dropped, but not for authored", () => {
    expect(check({ disposition: "mechanism", carriedBy: [{ change: "mint-cap" }] })).toMatch(
      /is mechanism and must carry a "reason"/,
    );
    expect(check({ disposition: "dropped", carriedBy: [] })).toMatch(
      /is dropped and must carry a "reason"/,
    );
    expect(
      check({ disposition: "authored", carriedBy: [{ target: "cap/alpha", change: "mint-cap" }] }),
    ).toBe("");
  });

  it("lets mechanism carry any number of homes, with or without targets", () => {
    expect(check({ disposition: "mechanism", reason: "code", carriedBy: [] })).toBe("");
    expect(
      check({ disposition: "mechanism", reason: "code", carriedBy: [{ change: "mint-cap" }] }),
    ).toBe("");
    expect(
      check({
        disposition: "mechanism",
        reason: "code",
        carriedBy: [{ target: "cap/beta", change: "mint-cap" }],
      }),
    ).toBe("");
  });

  it("validates every home's target, change, and the entry's scenario anchors", () => {
    const out = check({
      disposition: "authored",
      carriedBy: [{ target: "cap/ghost", change: "no-such-change" }],
      scenarios: ["cap/alpha#nope"],
    });
    expect(out).toMatch(/carriedBy target "cap\/ghost" does not resolve/);
    expect(out).toMatch(/carriedBy change "no-such-change" matches no open change/);
    expect(out).toMatch(/scenario anchor "cap\/alpha#nope" does not resolve/);
  });

  it("rejects an unknown disposition and a missing carriedBy array", () => {
    expect(check({ disposition: "parked", carriedBy: [] })).toMatch(/is not one of/);
    expect(check({ disposition: "authored" })).toMatch(/has no carriedBy array/);
  });

  it("holds reviews to attribution only — no disposition required", () => {
    expect(check({ carriedBy: [{ change: "mint-cap" }] }, "review")).toBe("");
    expect(check({ carriedBy: [{ change: "nope" }] }, "review")).toMatch(/matches no open change/);
  });

  it("primaryTarget is the first home carrying a target", () => {
    expect(
      primaryTarget({
        carriedBy: [{ change: "mint-cap" }, { target: "cap/beta", change: "mint-cap" }],
      }),
    ).toBe("cap/beta");
    expect(primaryTarget({ carriedBy: [] })).toBeNull();
  });
});

describe("fold DAG order (requirement granularity)", () => {
  // A capability already in specs/ whose CITED requirement exists only in
  // another open change is the case a capability-granular guard misses.
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "dagreq-"));
    write(
      root,
      "openspec/specs/base/spec.md",
      "# base Specification\n\n## Purpose\n\nBase. Depends on: (none — root).\n\n## Requirements\n\n### Requirement: base/existing\nThe system SHALL do existing.\n\n#### Scenario: #e1\n- **WHEN** x\n- **THEN** y\n",
    );
    // an open change ADDS a new requirement to the existing capability
    write(
      root,
      "openspec/changes/extend-base/specs/base/spec.md",
      "## ADDED Requirements\n\n### Requirement: base/newcomer\nThe system SHALL do newcomer.\n\n#### Scenario: #n1\n- **WHEN** p\n- **THEN** q\n",
    );
    // a second open change mints a capability CITING that not-yet-folded requirement
    write(
      root,
      "openspec/changes/mint-user/specs/user/spec.md",
      "## Purpose\n\nUser cap. Depends on: base.\n\n## ADDED Requirements\n\n### Requirement: user/alpha\nDepends on: base/newcomer.\n\nThe system SHALL do alpha.\n\n#### Scenario: #a1\n- **WHEN** m\n- **THEN** n\n",
    );
    execSync("git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm seed", {
      cwd: root,
    });
    return root;
  }

  it("refuses to fold a delta citing a requirement that only an open change adds", () => {
    const root = fixture();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("exit");
    });
    expect(() => foldChange(root, "mint-user")).toThrow("exit");
    const msg = err.mock.calls.flat().join("\n");
    expect(msg).toMatch(/cites requirements not yet in specs\//);
    expect(msg).toMatch(/base\/newcomer/);
    err.mockRestore();
    exit.mockRestore();
  });

  it("folds once the cited requirement is in specs/", () => {
    const root = fixture();
    foldChange(root, "extend-base");
    foldChange(root, "mint-user");
    const out = readFileSync(join(root, "openspec/specs/user/spec.md"), "utf8");
    expect(out).toContain("### Requirement: user/alpha");
  });
});

describe("capability graph (pnpm spec:graph)", () => {
  // specs/ holds one folded capability; an open change mints a second that
  // depends on it — the graph must read both, exactly as the lint's overlay does.
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "graph-"));
    write(
      root,
      "openspec/specs/base/spec.md",
      `# base Specification

## Purpose

Base. Depends on: (none — root).

## Requirements

### Requirement: base/alpha
The system SHALL alpha.

#### Scenario: #a1
- **WHEN** x
- **THEN** y
`,
    );
    write(
      root,
      "openspec/changes/mint-user/specs/user/spec.md",
      `## Purpose

User cap. Depends on: base.

## ADDED Requirements

### Requirement: user/one
Depends on: base/alpha, user/two.

The system SHALL one.

#### Scenario: #u1
- **WHEN** m
- **THEN** n

### Requirement: user/two
Depends on: base/alpha.

The system SHALL two.

#### Scenario: #u2
- **WHEN** p
- **THEN** q
`,
    );
    return root;
  }

  it("reads folded capabilities and open mints alike", () => {
    const { caps, stats } = buildGraph(fixture());
    expect([...caps.keys()].sort()).toEqual(["base", "user"]);
    expect(caps.get("user").deps).toEqual(["base"]);
    expect(caps.get("user").folded).toBe(false);
    expect(caps.get("user").change).toBe("mint-user");
    expect(caps.get("base").folded).toBe(true);
    expect(stats.capabilities).toBe(2);
    expect(stats.edges).toBe(1);
  });

  it("weighs an edge by the requirement dependencies crossing it, counting same-capability ones apart", () => {
    const { caps, stats } = buildGraph(fixture());
    expect(caps.get("user").weights.get("base")).toBe(2); // both requirements
    expect(stats.crossing).toBe(2);
    expect(stats.internal).toBe(1); // user/one -> user/two
  });

  it("renders each edge as its capability identifiers, weight included", () => {
    const md = renderMarkdown(buildGraph(fixture()));
    expect(md).toContain("user -->|2| base");
    expect(md).toMatch(/```mermaid\nflowchart TD/);
    expect(md).toContain("GENERATED by `pnpm spec:graph`");
  });

  it("refuses to render a cycle rather than hanging", () => {
    const root = fixture();
    // make base depend back on user
    const f = join(root, "openspec/specs/base/spec.md");
    writeFileSync(
      f,
      readFileSync(f, "utf8").replace("Depends on: (none — root).", "Depends on: user."),
    );
    expect(() => buildGraph(root)).toThrow(/cycle/);
  });
});
