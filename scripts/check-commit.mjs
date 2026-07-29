#!/usr/bin/env node
// Tier 1: is this COMMIT green standing alone? (pnpm check:commit)
//
// The full battery (tier 2, `pnpm verify`) answers "is the code right". This
// answers the narrower question a multi-commit branch actually asks: does each
// commit reference only what exists in its own tree? That failure class —
// wrong commit-boundary carving — is entirely STATIC, and the static gates are
// the cheap half of the battery:
//
//   typecheck   a type changed without its construction sites
//   lint        format/lint drift in what this commit touched
//   citations   a `// spec:` or tasks.md reference to an identifier that only
//               lands in a LATER commit — the single highest-signal gate here,
//               because the corpus makes every cross-commit dependency an
//               explicit named reference rather than an implicit one
//   changes     the touched change's own artifacts cohere (section numbering,
//               scenario anchors, delta shape)
//   freshness   the touched change's seed/edit pair is intact
//   graph       the rendered dependency graph matches the declarations
//   tests       the suites that import what this commit changed
//
// The expensive half — the property suites, the app boot, cross-change
// validation over every open change — discriminates almost nothing here: it
// fails when the CODE is wrong, which is the same verdict at every boundary.
// So it belongs at the tip, once, not at every commit.
//
// SCOPING BY CHANGE. Commits are carved at change boundaries, so the change
// set is derivable from the diff: any path under `openspec/changes/<name>/`
// names one. `--change <name>` adds to that set for the rarer commit that
// moves responsibilities between changes without touching both folders. An
// empty set means a pure implementation commit, and the four change-scoped
// gates are skipped rather than run over all of them.
//
// Usage:
//   pnpm check:commit                      the HEAD commit
//   pnpm check:commit <ref>                one commit
//   pnpm check:commit <base>..<head>       every commit in the range
//   pnpm check:commit --change <name>      add a change to the derived set
//   pnpm check:commit --no-tests           static gates only (~1.5s)
//
// A range checks out each commit in turn, so it requires a clean working tree
// and restores the branch it started on. That checkout is the point: a tree
// with uncommitted work is not the commit, and the divergence between the two
// is exactly the bug this exists to catch.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

const argv = process.argv.slice(2);
const extraChanges = [];
let target = null;
let runTests = true;
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--change") extraChanges.push(argv[++i] ?? "");
  else if (arg === "--no-tests") runTests = false;
  else if (arg?.startsWith("--")) fail(`unknown flag ${arg}`);
  else if (target === null) target = arg ?? null;
  else fail(`unexpected argument ${arg}`);
}
if (extraChanges.some((c) => c === "")) fail("--change needs a change name");

function fail(message) {
  console.error(`check:commit: ${message}`);
  process.exit(2);
}

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();

/** Commits to check, oldest first. A range yields many; anything else one. */
function resolveCommits(spec) {
  if (spec === null) return [git(["rev-parse", "HEAD"])];
  if (spec.includes("..")) {
    const out = git(["rev-list", "--reverse", spec]);
    return out === "" ? [] : out.split("\n");
  }
  return [git(["rev-parse", spec])];
}

const commits = resolveCommits(target);
if (commits.length === 0) fail(`no commits in ${target}`);

const head = git(["rev-parse", "HEAD"]);
const dirty = git(["status", "--porcelain"]) !== "";
// Checking HEAD needs no checkout — the tree already IS the commit, provided
// nothing is uncommitted. Anything else moves the tree, so it must be clean.
const needsCheckout = commits.length > 1 || commits[0] !== head;
if (dirty && (needsCheckout || commits[0] === head)) {
  fail(
    "the working tree has uncommitted changes, so it is not the commit.\n" +
      "  Commit or stash first — checking the working tree would answer a question you did not ask.",
  );
}
if (needsCheckout) {
  const startedOn = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  process.on("exit", () => {
    try {
      execFileSync("git", ["checkout", "-q", startedOn], { cwd: root });
    } catch {
      console.error(`check:commit: could not restore ${startedOn}; you are detached`);
    }
  });
}

// ---------------------------------------------------------------------------
// Gates
// ---------------------------------------------------------------------------

const SOURCE_RE = /\.(ts|tsx|js|mjs|svelte)$/;
const LINTABLE_RE = /\.(ts|tsx|js|mjs|jsx|json|jsonc)$/;

function run(cmd, args) {
  const res = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
  if (res.error) return { ok: false, output: String(res.error) };
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`.trimEnd();
  return { ok: res.status === 0, output };
}

const spec = ([cmd, args]) => ({ cmd, args });
const nodeBin = (name) => join(root, "node_modules", ".bin", name);
const withBin = (name, args) =>
  existsSync(nodeBin(name)) ? [nodeBin(name), args] : ["pnpm", ["exec", name, ...args]];

/** Changes this commit touches, from its own diff plus any named on the CLI. */
function changesTouched(files) {
  const names = new Set(extraChanges);
  for (const file of files) {
    const m = /^openspec\/changes\/([^/]+)\//.exec(file);
    if (m && m[1] !== "archive") names.add(m[1]);
  }
  // A change deleted by this commit (an archive move) has no folder to
  // validate; only ones still present are checkable.
  return [...names].filter((n) => existsSync(join(root, "openspec", "changes", n))).sort();
}

function gatesFor(sha, files) {
  const changes = changesTouched(files);
  const present = files.filter((f) => existsSync(join(root, f)));
  const lintable = present.filter((f) => LINTABLE_RE.test(f));
  const sources = present.filter((f) => SOURCE_RE.test(f) && !f.endsWith(".d.ts"));
  // The graph is generated output; it only needs re-checking when something
  // that feeds it moved — a dependency declaration, a Purpose, or the render.
  const graphTouched =
    files.some((f) => f.endsWith("capability-graph.md")) ||
    (files.some((f) => f.startsWith("openspec/")) &&
      /^[+-].*(Depends on:|## Purpose)/m.test(
        git(["diff", "--unified=0", `${sha}^`, sha, "--", "openspec"]).slice(0, 2_000_000),
      ));

  const gates = [
    { name: "typecheck", ...spec(withBin("tsc", ["-b"])) },
    lintable.length > 0
      ? {
          name: "lint",
          ...spec(withBin("biome", ["check", "--files-ignore-unknown=true", ...lintable])),
        }
      : null,
    { name: "citations", cmd: "node", args: ["scripts/check-spec-citations.mjs"] },
    changes.length > 0
      ? {
          name: `changes(${changes.join(",")})`,
          cmd: "node",
          args: ["scripts/validate-open-changes.mjs", ...changes.flatMap((c) => ["--change", c])],
        }
      : null,
    changes.length > 0
      ? {
          name: "freshness",
          cmd: "node",
          args: ["scripts/check-change-freshness.mjs", ...changes.flatMap((c) => ["--change", c])],
        }
      : null,
    graphTouched
      ? { name: "graph", cmd: "node", args: ["scripts/spec-graph.mjs", "--check"] }
      : null,
    runTests && sources.length > 0
      ? { name: "tests", ...spec(withBin("vitest", ["related", "--run", ...sources])) }
      : null,
  ];
  return { gates: gates.filter(Boolean), changes };
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

let lockfile = git(["rev-parse", `${head}:pnpm-lock.yaml`]);
let failed = 0;
const started = Date.now();

for (const sha of commits) {
  if (needsCheckout) {
    execFileSync("git", ["checkout", "-q", "--detach", sha], { cwd: root });
    // Reinstalling is the expensive part and is only needed when the resolved
    // dependency set actually moved between the trees being checked.
    const nextLock = git(["rev-parse", `${sha}:pnpm-lock.yaml`]);
    if (nextLock !== lockfile) {
      run("pnpm", ["install", "--frozen-lockfile"]);
      lockfile = nextLock;
    }
  }
  const subject = git(["log", "--format=%s", "-1", sha]);
  const files = git(["diff-tree", "--no-commit-id", "--name-only", "-r", sha])
    .split("\n")
    .filter(Boolean);
  const { gates, changes } = gatesFor(sha, files);

  const t0 = Date.now();
  const failures = [];
  for (const gate of gates) {
    const res = run(gate.cmd, gate.args);
    if (!res.ok) failures.push({ gate, output: res.output });
  }
  const ms = Date.now() - t0;
  const scope = changes.length > 0 ? ` [${changes.join(", ")}]` : "";
  if (failures.length === 0) {
    console.log(`PASS  ${sha.slice(0, 7)}  ${ms}ms  ${subject}${scope}`);
  } else {
    failed++;
    console.log(
      `FAIL  ${sha.slice(0, 7)}  ${ms}ms  ${subject}${scope}  (${failures.map((f) => f.gate.name).join(", ")})`,
    );
    for (const { gate, output } of failures) {
      console.error(`\n--- ${sha.slice(0, 7)} ${gate.name}`);
      if (output) console.error(output);
    }
  }
}

const total = Date.now() - started;
console.log(
  failed === 0
    ? `\ncheck:commit passed — ${commits.length} commit(s) in ${(total / 1000).toFixed(1)}s`
    : `\ncheck:commit FAILED on ${failed} of ${commits.length} commit(s)`,
);
process.exit(failed === 0 ? 0 : 1);
