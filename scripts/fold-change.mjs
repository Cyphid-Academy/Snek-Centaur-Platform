#!/usr/bin/env node
// Fold an open change's spec deltas into openspec/specs/ (pnpm spec:fold).
//
//   node scripts/fold-change.mjs <change-name>
//
// This is the project's replacement for the spec-application half of
// `openspec archive`. The stock machinery guards MODIFIED replacement with
// an unconditional scenario-presence check (a current scenario name absent
// from the incoming block aborts the archive), because in ambient OpenSpec
// practice a MODIFIED block may be a partial patch — a missing scenario is
// ambiguous between "deliberately removed" and "accidentally dropped".
// Under this repo's conventions the ambiguity does not exist: MODIFIED
// blocks are ALWAYS the entire requirement block (config.yaml specs rules),
// authored via the two-commit seed/edit pair, so the reviewed word-diff is
// the explicit record of every scenario removal or rename. Full-block
// replacement is therefore sound — PROVIDED the seeded base still matches
// specs/. That proviso is enforced here as a hard precondition by importing
// the seed-freshness check (scripts/check-change-freshness.mjs) rather than
// trusting it was run.
//
// Folding only rewrites specs/. The change folder is then archived without
// re-applying deltas: `openspec archive --skip-specs -y <change>` (still
// validates the change and moves it to changes/archive/ with a date prefix).
//
// NEW CAPABILITIES are minted by fold: a delta whose capability has no
// specs/<capability>/spec.md yet must open with a `## Purpose` preamble
// (the explicit mint marker) and be ADDED-only, and fold creates the
// capability's spec.md from it (`# <capability> Specification` + Purpose +
// Requirements). The guards live in the freshness precondition below: a
// missing capability without a preamble fails loudly (assumed folder-name
// typo — the alternative is silently minting a bogus capability), and a
// preamble whose capability already exists fails loudly (another change
// minted it first; the Purpose was never reconciled against it).
//
// Apply order and loud-failure rules mirror the stock machinery
// (RENAMED → REMOVED → MODIFIED → ADDED; unknown or colliding headers
// abort), minus the scenario guard that full-block authoring supersedes.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { freshnessProblemsFor } from "./check-change-freshness.mjs";
import { openChangeDeltaFiles, parseDeltaOps } from "./spec-index.mjs";

const fail = (msg) => {
  console.error(`spec:fold FAILED: ${msg}`);
  process.exit(1);
};

/** Split a spec file into before / requirements blocks / after. */
function splitSpec(content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const reqIdx = lines.findIndex((l) => /^## Requirements\s*$/.test(l));
  if (reqIdx === -1) return null;
  let afterIdx = lines.length;
  for (let i = reqIdx + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      afterIdx = i;
      break;
    }
  }
  const before = lines.slice(0, reqIdx).join("\n");
  const after = lines.slice(afterIdx).join("\n");
  const preamble = [];
  const blocks = []; // { name, raw } in file order
  let cur = null;
  for (const line of lines.slice(reqIdx + 1, afterIdx)) {
    const m = line.match(/^### Requirement: (.+?)\s*$/);
    if (m) {
      if (cur) blocks.push({ name: cur.name, raw: cur.lines.join("\n").trimEnd() });
      cur = { name: m[1], lines: [line] };
    } else if (cur) cur.lines.push(line);
    else preamble.push(line);
  }
  if (cur) blocks.push({ name: cur.name, raw: cur.lines.join("\n").trimEnd() });
  return { before, preamble: preamble.join("\n").trim(), blocks, after: after.trim() };
}

function recompose({ before, preamble, blocks, after }) {
  const parts = [before.trimEnd(), "## Requirements"];
  if (preamble) parts.push(preamble);
  parts.push(...blocks.map((b) => b.raw));
  if (after) parts.push(after);
  return `${parts.join("\n\n")}\n`;
}

/** Cross-section sanity for one capability's delta (mirrors stock checks). */
function validateOps(cap, ops) {
  const dupes = (names, what) => {
    const seen = new Set();
    for (const n of names) {
      if (seen.has(n)) fail(`${cap}: duplicate ${what} entry for "${n}"`);
      seen.add(n);
    }
  };
  dupes(ops.removed, "REMOVED");
  dupes(
    ops.renamed.map((r) => r.from),
    "RENAMED FROM",
  );
  dupes(
    ops.renamed.map((r) => r.to),
    "RENAMED TO",
  );
  const sections = new Map(); // name -> section (rename tracked via its TO name)
  const claim = (name, section) => {
    if (sections.has(name))
      fail(`${cap}: "${name}" appears in both ${sections.get(name)} and ${section}`);
    sections.set(name, section);
  };
  for (const n of ops.removed) claim(n, "REMOVED");
  for (const { from, to } of ops.renamed) {
    claim(from, "RENAMED (from)");
    if (ops.added.has(to)) fail(`${cap}: RENAMED target "${to}" collides with an ADDED block`);
  }
  for (const n of ops.modified.keys()) {
    // A renamed requirement may also be MODIFIED — under its NEW name.
    if (ops.renamed.some((r) => r.from === n))
      fail(`${cap}: MODIFIED must use the renamed header for "${n}" (reference the TO name)`);
    claim(n, "MODIFIED");
  }
  for (const n of ops.added.keys()) claim(n, "ADDED");
}

export function foldChange(root, changeName) {
  const changeDir = join(root, "openspec", "changes", changeName);
  if (!existsSync(changeDir)) fail(`no open change "${changeName}" under openspec/changes/`);
  const deltas = openChangeDeltaFiles(root).filter(({ file }) =>
    file.includes(`/changes/${changeName}/`),
  );
  if (deltas.length === 0) fail(`change "${changeName}" has no spec deltas to fold`);

  // Hard precondition: the seeded bases still match specs/ (and the deltas
  // are committed — an unseeded delta carries no verifiable base).
  const fresh = freshnessProblemsFor(root, changeName);
  if (fresh.problems.length > 0 || fresh.skipped > 0) {
    console.error(`spec:fold FAILED: seed-freshness precondition not met for "${changeName}":`);
    for (const p of fresh.problems) console.error(`  ${p}`);
    for (const n of fresh.notes) console.error(`  ${n} — commit the seed/edit pair first`);
    process.exit(1);
  }

  for (const { file, cap } of deltas) {
    const ops = parseDeltaOps(readFileSync(file, "utf8"));
    validateOps(cap, ops);
    const target = join(root, "openspec", "specs", cap, "spec.md");

    // Capability rename: mint `cap` by carrying the source capability's
    // requirements over (every `<src>/` re-prefixed to `<cap>/` in headers,
    // bodies, and scenario refs), replacing the heading + Purpose with the
    // delta's, appending the delta's ADDED, then removing the source folder.
    if (ops.renamesCapability) {
      const src = ops.renamesCapability;
      const srcFile = join(root, "openspec", "specs", src, "spec.md");
      if (!existsSync(srcFile))
        fail(`${cap}: RENAMES CAPABILITY source "${src}" has no openspec/specs/${src}/spec.md`);
      if (existsSync(target)) fail(`${cap}: RENAMES CAPABILITY target "${cap}" already exists`);
      if (!ops.preamble.startsWith("## Purpose"))
        fail(
          `${cap}: capability-rename delta must carry the new capability's "## Purpose" preamble`,
        );
      if (ops.renamed.length > 0 || ops.removed.length > 0 || ops.modified.size > 0)
        fail(
          `${cap}: capability-rename delta must be ADDED-only besides the carried-over requirements`,
        );
      const srcSpec = splitSpec(readFileSync(srcFile, "utf8"));
      if (srcSpec === null) fail(`${src}: spec.md has no "## Requirements" section`);
      const reprefix = (s) => s.split(`${src}/`).join(`${cap}/`);
      const blocks = [
        ...srcSpec.blocks.map((b) => ({ name: reprefix(b.name), raw: reprefix(b.raw) })),
        ...[...ops.added].map(([name, raw]) => ({ name, raw })),
      ];
      const seen = new Set();
      for (const b of blocks) {
        if (seen.has(b.name)) fail(`${cap}: duplicate requirement "${b.name}" after rename`);
        seen.add(b.name);
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(
        target,
        recompose({
          before: `# ${cap} Specification\n\n${ops.preamble}`,
          preamble: reprefix(srcSpec.preamble),
          blocks,
          after: reprefix(srcSpec.after),
        }),
      );
      rmSync(join(root, "openspec", "specs", src), { recursive: true, force: true });
      console.log(
        `Renamed openspec/specs/${src}/ -> ${cap}/: ${srcSpec.blocks.length} carried, ${ops.added.size} added.`,
      );
      continue;
    }

    if (!existsSync(target)) {
      // Mint path. The freshness precondition above already guaranteed the
      // shape (Purpose preamble present, ADDED-only, non-empty); the checks
      // here are defence in depth against being called with a bypassed
      // precondition.
      if (!ops.preamble || !ops.preamble.startsWith("## Purpose"))
        fail(`${cap}: cannot mint a capability without a "## Purpose" delta preamble`);
      if (ops.renamed.length > 0 || ops.removed.length > 0 || ops.modified.size > 0)
        fail(`${cap}: a delta minting a capability must be ADDED-only`);
      if (ops.added.size === 0) fail(`${cap}: new capability "${cap}" has no ADDED requirements`);
      mkdirSync(dirname(target), { recursive: true });
      const blocks = [...ops.added].map(([name, raw]) => ({ name, raw }));
      writeFileSync(
        target,
        recompose({
          before: `# ${cap} Specification\n\n${ops.preamble}`,
          preamble: "",
          blocks,
          after: "",
        }),
      );
      console.log(`Created openspec/specs/${cap}/spec.md: ${ops.added.size} added.`);
      continue;
    }
    if (ops.preamble)
      fail(
        `${cap}: delta carries a new-capability "## Purpose" preamble but openspec/specs/${cap}/spec.md already exists — reconcile the Purpose by hand and re-author the delta without the preamble`,
      );
    const spec = splitSpec(readFileSync(target, "utf8"));
    if (spec === null) fail(`${cap}: spec.md has no "## Requirements" section`);
    const byName = new Map(spec.blocks.map((b) => [b.name, b]));
    if (byName.size !== spec.blocks.length)
      fail(`${cap}: spec.md has duplicate requirement headers`);

    // RENAMED → REMOVED → MODIFIED (full replacement) → ADDED, in place.
    for (const { from, to } of ops.renamed) {
      const b = byName.get(from);
      if (!b) fail(`${cap}: RENAMED source "${from}" not found in specs/`);
      if (byName.has(to)) fail(`${cap}: RENAMED target "${to}" already exists in specs/`);
      b.name = to;
      b.raw = [`### Requirement: ${to}`, ...b.raw.split("\n").slice(1)].join("\n");
      byName.delete(from);
      byName.set(to, b);
    }
    for (const name of ops.removed) {
      if (!byName.delete(name)) fail(`${cap}: REMOVED "${name}" not found in specs/`);
    }
    for (const [name, raw] of ops.modified) {
      const b = byName.get(name);
      if (!b) fail(`${cap}: MODIFIED "${name}" not found in specs/`);
      b.raw = raw;
    }
    const appended = [];
    for (const [name, raw] of ops.added) {
      if (byName.has(name)) fail(`${cap}: ADDED "${name}" already exists in specs/`);
      const b = { name, raw };
      byName.set(name, b);
      appended.push(b);
    }
    const blocks = [...spec.blocks.filter((b) => byName.get(b.name) === b), ...appended];
    writeFileSync(target, recompose({ ...spec, blocks }));
    const n = (c) => (c ? c : null);
    const counts = [
      n(ops.renamed.length) && `${ops.renamed.length} renamed`,
      n(ops.removed.length) && `${ops.removed.length} removed`,
      n(ops.modified.size) && `${ops.modified.size} modified`,
      n(ops.added.size) && `${ops.added.size} added`,
    ].filter(Boolean);
    console.log(`Folded into openspec/specs/${cap}/spec.md: ${counts.join(", ")}.`);
  }
  console.log(
    `Change "${changeName}" folded. Next: openspec archive --skip-specs -y ${changeName} (validates and moves the change folder without re-applying deltas), then pnpm spec:check.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const changeName = process.argv[2];
  if (!changeName) {
    console.error("usage: node scripts/fold-change.mjs <change-name>");
    process.exit(1);
  }
  foldChange(new URL("..", import.meta.url).pathname.replace(/\/$/, ""), changeName);
}
