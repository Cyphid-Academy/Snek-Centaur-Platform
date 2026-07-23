#!/usr/bin/env node
import { execSync } from "node:child_process";
// Migration audit for one legacy module (usage: node audit-module.mjs 01).
//
// Verifies the migration recipe's disposition guarantee for module NN:
//   1. Every requirement identifier defined in the archived module has an
//      entry in legacy-spec-archive/maps/identifier-map.json.
//   2. Every entry's target and scenario anchors resolve against the live
//      capability specs in openspec/specs/ (overlaid with open changes'
//      deltas, which are citable before they fold in at archive).
//   3. No archived identifier of the module is still referenced from code.
// Complements `pnpm spec:check` (which validates the map globally) by
// checking COMPLETENESS against the archived module — the direction the
// lint cannot know about.
import { readFileSync, readdirSync, statSync } from "node:fs";
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

const problems = [];
for (const lid of legacyIds) {
  const e = map.requirements?.[lid];
  if (!e) {
    problems.push(`${lid}: no map entry`);
    continue;
  }
  if (e.target && !resolves(e.target))
    problems.push(`${lid}: target "${e.target}" does not resolve`);
  if (!e.target && !e.note) problems.push(`${lid}: neither target nor note`);
  for (const sc of e.scenarios ?? [])
    if (!resolves(sc)) problems.push(`${lid}: anchor "${sc}" does not resolve`);
}

// Reverse-citation completeness: every NN-REQ id CITED anywhere in the frozen
// corpus — not just those DEFINED in the module — must be defined or mapped, so
// a downstream migration can always trace its citations to a present target.
// (This is the direction the audit's defined→mapped loop cannot see; it is what
// catches a downstream module citing a module-NN number that NN never defines.)
const definedSet = new Set(legacyIds);
const citeRe = new RegExp(`${mod}-REQ-\\d{3}[a-z]?\\d?`, "g");
const corpusFiles = [];
const walkMd = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === "maps") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMd(p);
    else if (p.endsWith(".md")) corpusFiles.push(p);
  }
};
walkMd(join(root, "legacy-spec-archive"));
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
      definedSet.has(base) ||
      map.requirements?.[base],
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
if (staleRefs) problems.push(`code still references module ${mod} identifiers:\n${staleRefs}`);

if (problems.length) {
  console.error(`Module ${mod} migration audit FAILED (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(
  `Module ${mod} migration audit passed: ${legacyIds.length} archived identifiers all mapped and resolving.`,
);
