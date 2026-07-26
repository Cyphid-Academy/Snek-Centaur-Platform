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
//   - Structural per-requirement dependencies: a requirement declares the
//     identifiers its soundness depends on in a "Depends on:" line directly
//     under its header, once each, and requirement PROSE carries no
//     identifiers at all — in a spec or delta file an identifier may appear
//     only in a requirement header or in such a declaration. Each declared
//     identifier must resolve, must not be the requirement itself, and its
//     capability must be a declared dependency of the owning capability.
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
//     overlapping open changes would clobber each other. (Several open
//     changes MAY share one PR — a change train — precisely because this
//     guard forces their requirement sets to be disjoint.)
//   - Capability dependency rule: every Purpose (specs/, a mint delta's
//     preamble, or a `## MODIFIED Purpose` amendment) declares its
//     dependencies in a "Depends on:" sentence; a
//     capability's spec may reference only itself and its declared
//     dependencies, and the declared graph must be acyclic.
//   - Identifier-map entries declare a `disposition` (authored / mechanism /
//     dropped) and their homes in `carriedBy` — one element per place the
//     legacy id's substance now lives. The disposition constrains the array
//     (dropped MUST carry nowhere; authored must name >= 1 resolving target)
//     and mandates a `reason` where nothing authored it. Rules live in
//     ./identifier-map.mjs; COMPLETENESS against the legacy corpus is
//     scripts/audit-all-modules.mjs (pnpm spec:audit).
//   - Capability Purposes are amended only through a `## MODIFIED Purpose`
//     delta section; two open changes may not amend one capability's Purpose.
// Seed freshness (stale deltas vs an advanced specs/) is the companion
// check scripts/check-change-freshness.mjs (pnpm spec:freshness).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { entryProblems, primaryTarget } from "./identifier-map.mjs";
import {
  buildSpecIndex,
  makeResolver,
  openChangeDeltaFiles,
  parseDeltaOps,
  parseDependsOn,
  parseRequirementDeps,
  purposeSection,
  splitRequirementBlocks,
} from "./spec-index.mjs";

const root = new URL("..", import.meta.url).pathname;
// Every module is migrated (corpus retired in full 2026-07-24): all numeric
// prefixes are tombstoned and review-item citations are errors everywhere.
const MIGRATED_MODULES = new Set(["01", "02", "03", "04", "05", "06", "07", "08"]);

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

// --- Capability dependency graph (Purpose "Depends on:" declarations) ------
// The capability dependency rule (config.yaml context) is enforced
// mechanically: a capability's spec — and any open delta folding into it —
// may reference only the capability itself and its declared dependencies,
// and the declared graph must be acyclic. An existing capability declares in
// its specs/ Purpose; a delta that mints (or renames into) a capability
// declares in its Purpose preamble.
const declaredDeps = new Map(); // cap -> Set<dep>
const declareDepsFrom = (cap, text, where) => {
  const { found, deps, problem } = parseDependsOn(text);
  if (!found) errors.push(`${where}: Purpose has no "Depends on:" declaration`);
  else if (problem) errors.push(`${where}: ${problem}`);
  declaredDeps.set(cap, new Set(deps));
};
if (existsSync(specsDir))
  for (const cap of readdirSync(specsDir)) {
    const f = join(specsDir, cap, "spec.md");
    if (existsSync(f))
      declareDepsFrom(
        cap,
        purposeSection(readFileSync(f, "utf8")),
        `openspec/specs/${cap}/spec.md`,
      );
  }
// An open delta's declaration overrides the specs/ one: a mint declares in its
// `## Purpose` preamble, and an amendment in its `## MODIFIED Purpose` section.
// Reading the amendment here is what makes adding a dependency legal WHILE the
// change is open — the citations it authorises resolve against the amended
// declaration, not the pre-change one.
const purposeAmendedBy = new Map(); // cap -> change that amends its Purpose
for (const { file, cap } of openDeltas) {
  const { preamble, modifiedPurpose } = parseDeltaOps(readFileSync(file, "utf8"));
  const where = file.replace(root, "");
  if (preamble) declareDepsFrom(cap, preamble, where);
  if (modifiedPurpose) {
    // Purpose-overlap tripwire: fold replaces the Purpose wholesale with no
    // three-way merge, exactly like a MODIFIED requirement block, so two open
    // changes amending one capability's Purpose would clobber each other.
    const change = where.match(/changes\/([^/]+)\//)?.[1] ?? where;
    const prior = purposeAmendedBy.get(cap);
    if (prior)
      errors.push(
        `${cap}: Purpose is amended by two open changes ("${prior}" and "${change}") — fold replaces it wholesale with no merge; archive one before authoring the other`,
      );
    else purposeAmendedBy.set(cap, change);
    declareDepsFrom(cap, modifiedPurpose, where);
  }
}
for (const [cap, deps] of declaredDeps)
  for (const d of deps) {
    if (d === cap) errors.push(`${cap}: declares a dependency on itself`);
    else if (!resolved.has(d))
      errors.push(`${cap}: declared dependency "${d}" is not a known capability`);
  }
{
  const state = new Map(); // undefined = unvisited, 0 = visiting, 1 = done
  const visit = (cap, path) => {
    if (state.get(cap) === 1) return;
    if (state.get(cap) === 0) {
      errors.push(`capability dependency cycle: ${[...path, cap].join(" -> ")}`);
      return;
    }
    state.set(cap, 0);
    for (const d of declaredDeps.get(cap) ?? []) visit(d, [...path, cap]);
    state.set(cap, 1);
  };
  for (const cap of declaredDeps.keys()) visit(cap, []);
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
  const map = JSON.parse(readFileSync(mapPath, "utf8"));
  if (map.provenance?.change && !archivedChanges.has(map.provenance.change))
    errors.push(
      `identifier-map.json: provenance change "${map.provenance.change}" has no archive folder`,
    );
  // Per-entry provenance: `change` names the retiring change by its
  // STABLE, DATELESS name — valid while the change is open, and still
  // valid after archiving (the archived folder carries a date prefix over
  // the same name, matched by suffix). Exact archived-folder names are
  // also accepted.
  const openChangeNames = new Set(
    existsSync(join(root, "openspec", "changes"))
      ? readdirSync(join(root, "openspec", "changes")).filter(
          (n) => n !== "archive" && !n.startsWith("."),
        )
      : [],
  );
  const changeResolves = (name) =>
    archivedChanges.has(name) ||
    openChangeNames.has(name) ||
    [...archivedChanges].some((a) => a.endsWith(`-${name}`));
  // Entry schema (disposition + carriedBy) lives in ./identifier-map.mjs so
  // the rules are unit-testable independently of this script's repo-wide scan.
  for (const [lid, e] of Object.entries(map.requirements ?? {})) {
    errors.push(...entryProblems(lid, e, { resolves, changeResolves }));
    const primary = primaryTarget(e);
    if (primary) retiredTarget.set(lid, primary);
  }
  for (const [rid, e] of Object.entries(map.reviews ?? {}))
    errors.push(...entryProblems(rid, e, { resolves, changeResolves, kind: "review" }));
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
  ...walk(specsDir)
    .filter((p) => p.endsWith("spec.md"))
    .map((p) => ({ file: p, cap: p.match(/\/specs\/([^/]+)\/spec\.md$/)?.[1] ?? null })),
  ...openDeltas,
];

const checkLegacyRefs = (file, i, line) => {
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

// Code: named identifiers in comments and strings must resolve.
for (const f of codeFiles)
  readFileSync(f, "utf8")
    .split("\n")
    .forEach((line, i) => {
      checkLegacyRefs(f, i, line);
      const t = line.trimStart();
      const inComment = t.startsWith("//") || t.startsWith("*") || t.startsWith("<!--");
      if (!inComment && !/["'`]/.test(line)) return;
      if (namedRe)
        for (const m of line.matchAll(namedRe)) {
          const [, cap, req, scen] = m;
          const reqs = resolved.get(cap);
          if (!reqs.has(req)) errors.push(`${f}:${i + 1} unknown requirement "${cap}/${req}"`);
          else if (scen && !reqs.get(req).has(scen))
            errors.push(`${f}:${i + 1} unknown scenario "${cap}/${req}#${scen}"`);
        }
    });

// --- Structural per-requirement dependencies -------------------------------
// A requirement's soundness dependencies are structural data, not prose: the
// identifiers it depends on are declared once each directly under its header,
// so the dependency graph is machine-readable at requirement grain rather
// than recovered by scanning sentences. The corollary is enforced here too —
// in a spec or delta file an identifier appears ONLY in a requirement header
// or in a "Depends on:" declaration. A sentence that needs to point at
// another requirement names the concept; the declaration carries the
// identifier.
let depEdges = 0;
for (const { file, cap } of specFiles) {
  const content = readFileSync(file, "utf8");
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const structural = new Set(); // 0-based lines where an identifier is data, not prose
  for (const block of splitRequirementBlocks(content)) {
    structural.add(block.line - 1); // the header
    const { found, ids, problem, lineCount } = parseRequirementDeps(block.raw);
    if (found) for (let k = 0; k < lineCount; k++) structural.add(block.line + k);
    if (problem) errors.push(`${file}:${block.line + 1} ${block.name}: ${problem}`);
    for (const id of ids) {
      depEdges++;
      const depCap = id.split("/")[0];
      if (id === block.name || id.startsWith(`${block.name}#`))
        errors.push(`${file}:${block.line + 1} ${block.name} declares a dependency on itself`);
      else if (!resolves(id))
        errors.push(
          `${file}:${block.line + 1} ${block.name} depends on unknown requirement "${id}"`,
        );
      if (depCap !== cap && !declaredDeps.get(cap)?.has(depCap))
        errors.push(
          `${file}:${block.line + 1} ${block.name} depends on "${id}" but "${cap}" does not declare a dependency on "${depCap}"`,
        );
    }
  }
  // A RENAMED section names its endpoints on `FROM:`/`TO:` lines rather than
  // as bare headers: structural too, not prose.
  lines.forEach((line, i) => {
    if (/^\s*-?\s*(?:FROM|TO):\s*`?### Requirement: /.test(line)) structural.add(i);
  });
  lines.forEach((line, i) => {
    // Spec purity: capability specs never reference the legacy archive or
    // implementation locations — the identifier map is the sole bridge to
    // the past, and code cites specs, never the reverse.
    if (/legacy-spec-archive/.test(line))
      errors.push(`${file}:${i + 1} spec references the legacy archive`);
    if (/packages\/|@cyphid\//.test(line))
      errors.push(`${file}:${i + 1} spec references an implementation location`);
    checkLegacyRefs(file, i, line);
    if (!namedRe || structural.has(i)) return;
    for (const m of line.matchAll(namedRe))
      errors.push(
        `${file}:${i + 1} identifier "${m[0]}" in prose — declare it in the requirement's "Depends on:" line and name the concept here`,
      );
  });
}

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
  `Spec-reference lint passed (${binding.size} capabilities, ${reqCount} requirements, ${scenCount} scenarios, ${depEdges} declared requirement dependencies, ${legacyDefined.size} legacy IDs, ${tombstones.size} tombstones${openDeltas.length ? `, ${openDeltas.length} open-change delta file(s) overlaid` : ""}).`,
);
