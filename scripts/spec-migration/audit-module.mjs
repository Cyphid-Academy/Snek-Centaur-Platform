#!/usr/bin/env node
import { execSync } from "node:child_process";
// Migration audit for one legacy module (usage: node audit-module.mjs 01).
//
// Verifies the migration recipe's disposition guarantee for module NN:
//   1. Every requirement identifier defined in the archived module is
//      DISPOSED: either mapped (an entry in
//      legacy-spec-archive/maps/identifier-map.json — the id is retired) or
//      PARKED (listed in backticks in the module's parked ledger,
//      docs/spec-migration/module-NN-parked.md — the id stays binding in
//      the legacy file, awaiting its prospective capability). Never both.
//   2. Every map entry's target and scenario anchors resolve against the
//      live capability specs in openspec/specs/ (overlaid with open
//      changes' deltas, which are citable before they fold in at archive).
//   3. No RETIRED identifier of the module is still referenced from code
//      (parked ids remain legitimately citable).
// Complements `pnpm spec:check` (which validates the map globally) by
// checking COMPLETENESS against the archived module — the direction the
// lint cannot know about.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSpecIndex, makeResolver } from "../spec-index.mjs";

const mod = process.argv[2];
if (!/^\d{2}$/.test(mod ?? "")) {
  console.error("usage: node scripts/spec-migration/audit-module.mjs <NN>");
  process.exit(2);
}
const root = new URL("../..", import.meta.url).pathname;

const specDir = join(root, "legacy-spec-archive", "spec");
const moduleFile = readdirSync(specDir).find((f) => f.startsWith(`${mod}-`));
if (!moduleFile) {
  console.error(`no archived module ${mod} under legacy-spec-archive/spec/`);
  process.exit(2);
}
const legacyIds = [
  ...readFileSync(join(specDir, moduleFile), "utf8").matchAll(
    /^\*\*(\d{2}-REQ-\d{3}[a-z]?\d?)(?: \([^)]*\))?\*\*/gm,
  ),
].map((m) => m[1]);

const map = JSON.parse(
  readFileSync(join(root, "legacy-spec-archive", "maps", "identifier-map.json"), "utf8"),
);

const resolves = makeResolver(buildSpecIndex(root, { overlayOpenChanges: true }));

// Parked ledger (historical): during the migration a module could migrate
// PARTIALLY, with unretired ids parked in docs/spec-migration/
// module-NN-parked.md. The corpus retired in full on 2026-07-24 and the
// ledgers are archived under legacy-spec-archive/spec-migration/, so no
// ledger exists at the read path — the parked set is empty and every id
// must be mapped.
const parkedPath = join(root, "docs", "spec-migration", `module-${mod}-parked.md`);
const parked = new Set();
if (existsSync(parkedPath))
  for (const m of readFileSync(parkedPath, "utf8").matchAll(
    new RegExp(`\`(${mod}-REQ-\\d{3}[a-z]?\\d?)\``, "g"),
  ))
    parked.add(m[1]);

const problems = [];
for (const lid of legacyIds) {
  const e = map.requirements?.[lid];
  if (!e) {
    if (!parked.has(lid)) problems.push(`${lid}: neither mapped nor parked`);
    continue;
  }
  if (parked.has(lid))
    problems.push(
      `${lid}: both mapped and parked — a map entry retires the id; remove it from the parked ledger`,
    );
  if (e.target && !resolves(e.target))
    problems.push(`${lid}: target "${e.target}" does not resolve`);
  if (!e.target && !e.note) problems.push(`${lid}: neither target nor note`);
  for (const sc of e.scenarios ?? [])
    if (!resolves(sc)) problems.push(`${lid}: anchor "${sc}" does not resolve`);
}
for (const pid of parked)
  if (!legacyIds.includes(pid))
    problems.push(`${pid}: parked in the ledger but not defined in module ${mod}`);

// Reverse-citation completeness: every NN-REQ id CITED in the BINDING corpus
// (legacy-spec-archive/spec/ — not the frozen review logs or informal spec,
// which are historical narrative and legitimately mention ids removed before
// migration) — not just those DEFINED in the module — must be disposed, so a
// downstream migration can always trace its citations to a present target.
// (This is the direction the audit's defined→disposed loop cannot see; it is
// what catches a downstream module citing a module-NN number that NN never
// defines.)
const definedSet = new Set(legacyIds);
const citeRe = new RegExp(`${mod}-REQ-\\d{3}[a-z]?\\d?`, "g");
const corpusFiles = [];
const walkMd = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMd(p);
    else if (p.endsWith(".md")) corpusFiles.push(p);
  }
};
walkMd(join(root, "legacy-spec-archive", "spec"));
const cited = new Set();
for (const f of corpusFiles)
  for (const m of readFileSync(f, "utf8").matchAll(citeRe)) cited.add(m[0]);
// A cited id is satisfied if it — or its base requirement, once a trailing
// sub-label (e.g. 050b, 043a) is stripped — is defined or mapped. Sub-labels
// are a fine-grained authoring convention pointing into a defined requirement's
// Design content, not standalone identifiers.
const citeSatisfied = (id) => {
  const base = id.replace(/[a-z]\d?$/, "");
  return Boolean(
    definedSet.has(id) ||
      map.requirements?.[id] ||
      parked.has(id) ||
      definedSet.has(base) ||
      map.requirements?.[base] ||
      parked.has(base),
  );
};
for (const id of [...cited].sort())
  if (!citeSatisfied(id))
    problems.push(
      `${id}: cited in the corpus but neither defined in module ${mod} nor mapped (nor is its base requirement)`,
    );

// pendingRehome gate: an omitted id from an earlier migration may carry a
// `pendingRehome` marker naming the module expected to own its substance. When
// that module migrates, the marker must be resolved (target set to one of the
// module's identifiers, marker cleared). Auditing module NN therefore fails
// while any entry still pends re-homing onto NN — so a promised re-home cannot
// be silently forgotten.
for (const [lid, e] of Object.entries(map.requirements ?? {}))
  if (e.pendingRehome === mod)
    problems.push(
      `${lid}: still marked pendingRehome:"${mod}" — module ${mod} is migrating; re-home it now (set target to a module-${mod} identifier and clear the marker)`,
    );

let staleRefs = "";
try {
  staleRefs = execSync(
    `grep -rn "${mod}-REQ-\\|${mod}-REVIEW-" packages apps --include='*.ts' --include='*.tsx' --include='*.svelte' || true`,
    {
      cwd: root,
      encoding: "utf8",
    },
  ).trim();
} catch {
  /* grep unavailable — lint covers this direction */
}
if (staleRefs) {
  // Only RETIRED ids (mapped) are stale to cite; parked ids stay binding
  // and citable, and while any id is parked the module is only partially
  // migrated, so its review items also remain citable.
  const idRe = new RegExp(`${mod}-REQ-\\d{3}[a-z]?\\d?`, "g");
  const staleLines = staleRefs.split("\n").filter((l) => {
    if (parked.size === 0 && new RegExp(`${mod}-REVIEW-`).test(l)) return true;
    return (l.match(idRe) ?? []).some((id) => map.requirements?.[id]);
  });
  if (staleLines.length)
    problems.push(
      `code still references retired module ${mod} identifiers:\n${staleLines.join("\n")}`,
    );
}

if (problems.length) {
  console.error(`Module ${mod} migration audit FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `Module ${mod} migration audit passed: ${legacyIds.length} archived identifiers disposed (${legacyIds.filter((l) => map.requirements?.[l]).length} mapped, ${parked.size} parked), all targets/anchors resolving.`,
);
