#!/usr/bin/env node
// Spec-reference lint.
//
// Validates every spec reference in code comments/strings and in capability
// spec files against the binding sources:
//   - Named identifiers `<capability>/<requirement>` and
//     `<capability>/<requirement>#<scenario>` must resolve to a requirement
//     header / scenario slug in openspec/specs/<capability>/spec.md, or in
//     the deltas of an OPEN change (openspec/changes/<change>/specs/) —
//     specs/ advances only at archive, and code implementing an open change
//     legitimately cites identifiers its deltas introduce or rename.
//   - Numeric identifiers `MM-REQ-NNN` must resolve to a requirement in the
//     legacy archive for a module that has NOT migrated; identifiers of
//     migrated modules (tombstoned via the identifier map) are errors.
//   - Capability specs — and open-change delta specs, which will fold into
//     them — must not reference the legacy archive or any implementation
//     location (spec purity).
//   - `design: <archived-change-name>` references must resolve to a folder
//     under openspec/changes/archive/.
//   - Review-item references (MM-REVIEW-NNN) are errors for migrated modules
//     (their edge cases are encoded as scenarios; see the identifier maps in
//     legacy-spec-archive/maps/), allowed for unmigrated modules.
//   - No requirement may be touched by more than one OPEN change — archive
//     replaces blocks by header match with no three-way merge, so
//     overlapping open changes would clobber each other.
// Seed freshness (stale deltas vs an advanced specs/) is the companion
// check scripts/check-change-freshness.mjs (pnpm spec:freshness).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSpecIndex, makeResolver, openChangeDeltaFiles } from "./spec-index.mjs";

const root = new URL("..", import.meta.url).pathname;
const MIGRATED_MODULES = new Set([]); // numeric prefixes tombstoned as modules migrate

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
};

// --- Named identifiers: binding specs, then overlaid with open deltas ------
const errors = [];
const specsDir = join(root, "openspec", "specs");
const binding = buildSpecIndex(root, { onError: (e) => errors.push(e) });
const resolved = buildSpecIndex(root, { overlayOpenChanges: true });
const resolves = makeResolver(resolved);
const openDeltas = openChangeDeltaFiles(root);

// --- Conflict-in-flight: two open changes touching one requirement --------
// The archive machinery replaces MODIFIED blocks by header match with no
// three-way merge, so overlapping open changes would silently clobber each
// other at their archives — flag them before either lands.
const touchedBy = new Map(); // "cap/slug" -> Set<change name>
for (const { file } of openDeltas) {
  const change = file.match(/\/changes\/([^/]+)\/specs\//)?.[1] ?? file;
  for (const m of readFileSync(file, "utf8").matchAll(
    /^### Requirement: ([a-z0-9-]+\/[a-z0-9-]+)\s*$/gm,
  )) {
    if (!touchedBy.has(m[1])) touchedBy.set(m[1], new Set());
    touchedBy.get(m[1]).add(change);
  }
}
for (const [req, changes] of touchedBy) {
  if (changes.size > 1)
    errors.push(
      `requirement ${req} is touched by multiple open changes (${[...changes].join(", ")}) — sequence or merge them before either archives`,
    );
}

// --- Tombstoned numeric identifiers (sourced from the identifier map) ------
const tombstones = new Set();

// --- Legacy numeric identifiers (unmigrated modules) -----------------------
const legacyDefined = new Set();
for (const f of walk(join(root, "legacy-spec-archive", "spec")).filter((p) =>
  /\/\d{2}-[^/]+\.md$/.test(p),
)) {
  const mod = f.match(/\/(\d{2})-[^/]+\.md$/)[1];
  if (MIGRATED_MODULES.has(mod)) continue;
  for (const m of readFileSync(f, "utf8").matchAll(
    /^\*\*(\d{2}-REQ-\d{3}[a-z]?\d?)(?: \([^)]*\))?\*\*/gm,
  )) {
    if (!/\(Retired\./.test(m[0])) legacyDefined.add(m[1]);
  }
}
// Retired-in-place legacy IDs (e.g. 02-08 retirements) count as tombstones.
for (const f of walk(join(root, "legacy-spec-archive", "spec")).filter((p) =>
  /\/\d{2}-[^/]+\.md$/.test(p),
)) {
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(
    /^\*\*(\d{2}-REQ-\d{3}[a-z]?\d?)(?: \([^)]*\))?\*\*: \*\(Retired\./gm,
  ))
    tombstones.add(m[1]);
}

// --- Archived change folders (for design: references) ----------------------
const archivedChanges = new Set(
  existsSync(join(root, "openspec", "changes", "archive"))
    ? readdirSync(join(root, "openspec", "changes", "archive"))
    : [],
);

// --- Identifier map (the archive's sole mutable file) ----------------------
const mapPath = join(root, "legacy-spec-archive", "maps", "identifier-map.json");
const retiredTarget = new Map();
if (existsSync(mapPath)) {
  const anchorOk = (ref, where) => {
    if (!resolves(ref)) errors.push(`identifier-map.json: ${where} references unknown "${ref}"`);
  };
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (map.provenance?.change && !archivedChanges.has(map.provenance.change))
    errors.push(
      `identifier-map.json: provenance change "${map.provenance.change}" has no archive folder`,
    );
  for (const [lid, e] of Object.entries(map.requirements ?? {})) {
    if (e.target) {
      anchorOk(e.target, lid);
      retiredTarget.set(lid, e.target);
    }
    for (const sc of e.scenarios ?? []) anchorOk(sc, lid);
  }
  for (const [rid, e] of Object.entries(map.reviews ?? {}))
    for (const sc of e.scenarios ?? []) anchorOk(sc, rid);
  for (const lid of Object.keys(map.requirements ?? {})) tombstones.add(lid);
}

// --- Scan code and spec files ----------------------------------------------
const capAlt = [...resolved.keys()].join("|");
const namedRe = capAlt
  ? new RegExp(`(?<![\\w/-])(${capAlt})/([a-z0-9-]+)(?:#([a-z0-9-]+))?(?!\\.[a-z])(?![\\w-])`, "g")
  : null;
const numericRe = /\d{2}-REQ-\d{3}[a-z]?\d?/g;
const reviewRe = /(\d{2})-REVIEW-\d{3}/g;
const designRe = /design:\s*(\d{4}-\d{2}-\d{2}-[a-z0-9-]+)/g;

const codeFiles = [];
for (const base of ["packages", "apps"])
  codeFiles.push(...walk(join(root, base)).filter((p) => /\.(ts|tsx|svelte|rs)$/.test(p)));
const specFiles = [
  ...walk(specsDir).filter((p) => p.endsWith("spec.md")),
  ...openDeltas.map((d) => d.file),
];

const checkLine = (file, i, line, isCode) => {
  if (!isCode) {
    // Spec purity: capability specs never reference the legacy archive or
    // implementation locations — the identifier map is the sole bridge to
    // the past, and code cites specs, never the reverse.
    if (/legacy-spec-archive/.test(line))
      errors.push(`${file}:${i + 1} spec references the legacy archive`);
    if (/packages\/|@cyphid\//.test(line))
      errors.push(`${file}:${i + 1} spec references an implementation location`);
  }
  if (isCode) {
    const t = line.trimStart();
    const inComment = t.startsWith("//") || t.startsWith("*") || t.startsWith("<!--");
    const inString = /["'`]/.test(line);
    if (!inComment && !inString) return;
  }
  if (namedRe)
    for (const m of line.matchAll(namedRe)) {
      const [, cap, req, scen] = m;
      const reqs = resolved.get(cap);
      if (!reqs.has(req)) errors.push(`${file}:${i + 1} unknown requirement "${cap}/${req}"`);
      else if (scen && !reqs.get(req).has(scen))
        errors.push(`${file}:${i + 1} unknown scenario "${cap}/${req}#${scen}"`);
    }
  for (const m of line.matchAll(numericRe)) {
    if (tombstones.has(m[0]))
      errors.push(
        `${file}:${i + 1} cites retired identifier ${m[0]} — now ${retiredTarget.get(m[0]) ?? "see legacy-spec-archive/maps/"}`,
      );
    else if (!legacyDefined.has(m[0]))
      errors.push(`${file}:${i + 1} cites unknown identifier ${m[0]}`);
  }
  for (const m of line.matchAll(reviewRe)) {
    if (MIGRATED_MODULES.has(m[1]))
      errors.push(
        `${file}:${i + 1} cites review item ${m[0]} of a migrated module — cite a scenario instead (see legacy-spec-archive/maps/)`,
      );
  }
  for (const m of line.matchAll(designRe)) {
    if (!archivedChanges.has(m[1]))
      errors.push(`${file}:${i + 1} design reference "${m[1]}" has no archived change folder`);
  }
};

for (const f of codeFiles)
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => checkLine(f, i, line, true));
for (const f of specFiles)
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => checkLine(f, i, line, false));

if (errors.length) {
  console.error(`Spec-reference lint FAILED (${errors.length}):`);
  for (const e of errors) console.error(`  ${e.replace(root, "")}`);
  process.exit(1);
}
const reqCount = [...binding.values()].reduce((n, r) => n + r.size, 0);
const scenCount = [...binding.values()].reduce(
  (n, r) => n + [...r.values()].reduce((m, s) => m + s.size, 0),
  0,
);
console.log(
  `Spec-reference lint passed (${binding.size} capabilities, ${reqCount} requirements, ${scenCount} scenarios, ${legacyDefined.size} legacy IDs, ${tombstones.size} tombstones${openDeltas.length ? `, ${openDeltas.length} open-change delta file(s) overlaid` : ""}).`,
);
