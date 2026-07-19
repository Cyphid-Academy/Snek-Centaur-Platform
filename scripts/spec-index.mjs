// Shared spec-index builder for the spec tooling.
//
// A spec index maps capability -> requirement slug -> Set<scenario slug>,
// harvested from the binding truth in openspec/specs/ and optionally
// OVERLAID with the deltas of open changes (openspec/changes/<change>/specs/,
// archive excluded). The overlay exists because specs/ advances only when a
// change is archived: while a change is open, code and identifier-map
// anchors may already cite requirements and scenarios that its deltas
// introduce or rename, and reference validation must resolve them.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REQ_RE = /^### Requirement: ([a-z0-9-]+)\/([a-z0-9-]+)\s*$/;
const SCEN_RE = /^#### Scenario: #([a-z0-9-]+)\s*$/;

/**
 * Harvest requirement headers and scenario slugs from one spec (or delta)
 * file into `index`. With `strict` (binding files in specs/), structural
 * faults — malformed headers, duplicate slugs, capability-prefix mismatch —
 * are reported via `onError`; without it (delta files, whose structure
 * `openspec validate` owns), slugs are merged leniently so a MODIFIED block
 * unions with the binding requirement it replaces.
 */
export function harvestSpecFile(file, cap, index, { strict = false, onError = () => {} } = {}) {
  const reqs = index.get(cap) ?? new Map();
  index.set(cap, reqs);
  let current = null;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      const h = line.match(REQ_RE);
      if (h) {
        if (h[1] !== cap)
          onError(`${file}:${i + 1} requirement capability prefix "${h[1]}" != folder "${cap}"`);
        if (strict && reqs.has(h[2]))
          onError(`${file}:${i + 1} duplicate requirement slug "${h[2]}"`);
        current = (!strict && reqs.get(h[2])) || new Set();
        reqs.set(h[2], current);
        return;
      }
      if (/^### Requirement:/.test(line) && strict)
        onError(
          `${file}:${i + 1} malformed requirement header (expected "### Requirement: ${cap}/<slug>")`,
        );
      const s = line.match(SCEN_RE);
      if (s) {
        if (!current) {
          if (strict) onError(`${file}:${i + 1} scenario outside a requirement`);
        } else if (strict && current.has(s[1]))
          onError(`${file}:${i + 1} duplicate scenario slug "#${s[1]}"`);
        else current.add(s[1]);
        return;
      }
      if (/^#### Scenario:/.test(line) && strict)
        onError(`${file}:${i + 1} malformed scenario header (expected "#### Scenario: #<slug>")`);
    });
}

/** Delta spec files of open (non-archived) changes. */
export function openChangeDeltaFiles(root) {
  const changesDir = join(root, "openspec", "changes");
  const out = [];
  if (!existsSync(changesDir)) return out;
  for (const change of readdirSync(changesDir)) {
    if (change === "archive" || change.startsWith(".")) continue;
    const capsDir = join(changesDir, change, "specs");
    if (!existsSync(capsDir)) continue;
    for (const cap of readdirSync(capsDir)) {
      const f = join(capsDir, cap, "spec.md");
      if (existsSync(f)) out.push({ file: f, cap });
    }
  }
  return out;
}

/**
 * Build the index. `overlayOpenChanges` adds open-change delta slugs on top
 * of the binding specs/ content (both remain resolvable while the change is
 * open — specs/ is still binding, the deltas are already citable).
 */
export function buildSpecIndex(root, { overlayOpenChanges = false, onError = () => {} } = {}) {
  const index = new Map();
  const specsDir = join(root, "openspec", "specs");
  if (existsSync(specsDir)) {
    for (const cap of readdirSync(specsDir)) {
      const f = join(specsDir, cap, "spec.md");
      if (existsSync(f)) harvestSpecFile(f, cap, index, { strict: true, onError });
    }
  }
  if (overlayOpenChanges)
    for (const { file, cap } of openChangeDeltaFiles(root)) harvestSpecFile(file, cap, index);
  return index;
}

/** `<capability>/<requirement>[#<scenario>]` -> does it resolve in `index`? */
export function makeResolver(index) {
  return (ref) => {
    const m = ref.match(/^([a-z0-9-]+)\/([a-z0-9-]+)(?:#([a-z0-9-]+))?$/);
    if (!m) return false;
    const scenarios = index.get(m[1])?.get(m[2]);
    return !!scenarios && (!m[3] || scenarios.has(m[3]));
  };
}

/**
 * Parse a delta spec file into its per-operation collections. MODIFIED and
 * ADDED map requirement name -> raw block (header line through the line
 * before the next header/section); REMOVED lists header names; RENAMED
 * lists { from, to } pairs. `preamble` is everything before the first
 * operation section, trimmed — non-empty only for a delta that mints a new
 * capability, where it carries the capability's `## Purpose` section
 * (spec:fold builds specs/<capability>/spec.md from it).
 */
export function parseDeltaOps(content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const added = new Map();
  const modified = new Map();
  const removed = [];
  const renamed = [];
  const preambleLines = [];
  let section = null;
  let blockName = null;
  let blockLines = [];
  let pendingFrom = null;
  const flush = () => {
    if (blockName !== null) {
      const raw = blockLines.join("\n").trimEnd();
      if (section === "MODIFIED") modified.set(blockName, raw);
      else if (section === "ADDED") added.set(blockName, raw);
    }
    blockName = null;
    blockLines = [];
  };
  for (const line of lines) {
    const sec = line.match(/^## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements\s*$/);
    if (sec) {
      flush();
      section = sec[1];
      continue;
    }
    if (section === null) {
      preambleLines.push(line);
      continue;
    }
    const req = line.match(/^### Requirement: ([a-z0-9-]+\/[a-z0-9-]+)\s*$/);
    if (req) {
      flush();
      if (section === "MODIFIED" || section === "ADDED") {
        blockName = req[1];
        blockLines = [line];
      } else if (section === "REMOVED") {
        removed.push(req[1]);
      }
      continue;
    }
    if (section === "RENAMED") {
      const from = line.match(/FROM:\s*`?### Requirement: ([a-z0-9-]+\/[a-z0-9-]+)`?\s*$/);
      if (from) pendingFrom = from[1];
      const to = line.match(/TO:\s*`?### Requirement: ([a-z0-9-]+\/[a-z0-9-]+)`?\s*$/);
      if (to && pendingFrom !== null) {
        renamed.push({ from: pendingFrom, to: to[1] });
        pendingFrom = null;
      }
      continue;
    }
    if (blockName !== null) blockLines.push(line);
  }
  flush();
  return { added, modified, removed, renamed, preamble: preambleLines.join("\n").trim() };
}

/**
 * Extract one requirement's raw block (header line through the line before
 * the next requirement/section header) from a spec file's content. Returns
 * null when the header is absent.
 */
export function extractRequirementBlock(content, cap, slug) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const header = `### Requirement: ${cap}/${slug}`;
  const start = lines.findIndex((l) => l.trimEnd() === header);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^### Requirement:|^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n").trimEnd();
}
