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
 * tasks.md of open (non-archived) changes. Archived plans are history and are
 * deliberately excluded: the corpus advances beneath them by design, so
 * holding them to the current identifier set would fail on the past.
 */
export function openChangeTaskFiles(root) {
  const changesDir = join(root, "openspec", "changes");
  const out = [];
  if (!existsSync(changesDir)) return out;
  for (const change of readdirSync(changesDir)) {
    if (change === "archive" || change.startsWith(".")) continue;
    const f = join(changesDir, change, "tasks.md");
    if (existsSync(f)) out.push({ change, file: f });
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
    for (const { file, cap } of openChangeDeltaFiles(root)) {
      // A capability-rename delta carries the source capability's requirements
      // over under the new name; surface them so citations to the renamed
      // identifiers resolve while the change is open (specs/ still holds the
      // source until the change folds at archive).
      const { renamesCapability } = parseDeltaOps(readFileSync(file, "utf8"));
      if (renamesCapability && index.has(renamesCapability)) {
        const dst = index.get(cap) ?? new Map();
        index.set(cap, dst);
        for (const [slug, scen] of index.get(renamesCapability)) {
          const merged = dst.get(slug) ?? new Set();
          for (const s of scen) merged.add(s);
          dst.set(slug, merged);
        }
      }
      harvestSpecFile(file, cap, index);
    }
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
 * `modifiedPurpose` is the replacement Purpose body from a
 * `## MODIFIED Purpose` section — the sanctioned amendment path for an
 * EXISTING capability's Purpose (and the only way its `Depends on:`
 * declaration can change); empty when the delta does not amend it.
 * `renamesCapability` is the source capability name when the preamble carries a
 * `## RENAMES CAPABILITY: <old>` directive — the delta's capability is that
 * source renamed: fold carries the source's requirements over (re-prefixed)
 * and appends the delta's ADDED. The directive is stripped from `preamble`
 * so the remaining Purpose preamble is validated as an ordinary mint.
 */
export function parseDeltaOps(content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const added = new Map();
  const modified = new Map();
  const removed = [];
  const renamed = [];
  const preambleLines = [];
  const modifiedPurposeLines = [];
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
    // `## MODIFIED Purpose` amends an EXISTING capability's Purpose section —
    // the only sanctioned way it ever changes, and the only way a capability
    // can gain a dependency (the lint-load-bearing `Depends on:` sentence
    // lives there). Its body is the replacement Purpose, full-block like a
    // MODIFIED requirement, so the amendment is reviewed as a word-diff.
    // Distinct from `preamble`, which mints a capability that has no spec yet.
    if (/^## MODIFIED Purpose\s*$/.test(line)) {
      flush();
      section = "PURPOSE";
      continue;
    }
    if (section === "PURPOSE") {
      modifiedPurposeLines.push(line);
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
  const preambleRaw = preambleLines.join("\n").trim();
  const DIRECTIVE = /^## RENAMES CAPABILITY:[ \t]*([a-z0-9-]+)[ \t]*$/m;
  const rc = preambleRaw.match(DIRECTIVE);
  const renamesCapability = rc ? rc[1] : null;
  const preamble = renamesCapability ? preambleRaw.replace(DIRECTIVE, "").trim() : preambleRaw;
  const modifiedPurpose = modifiedPurposeLines.join("\n").trim();
  return { added, modified, removed, renamed, renamesCapability, preamble, modifiedPurpose };
}

/**
 * The `## Purpose` section of a capability spec (heading included), or the
 * whole text when there is none. The capability-grain "Depends on:"
 * declaration lives here; requirement blocks carry their own, one grain
 * finer (parseRequirementDeps), so the two are never read out of each other.
 */
export function purposeSection(content) {
  const text = content.replace(/\r\n?/g, "\n");
  const start = text.indexOf("## Purpose");
  if (start === -1) return text;
  const after = text.indexOf("\n## ", start + 1);
  return text.slice(start, after === -1 ? undefined : after);
}

/**
 * Split a spec (or delta) file into its requirement blocks: header line
 * through the line before the next requirement or section heading. Returns
 * [{ cap, slug, name, line, raw }] with `line` 1-based. Malformed headers end
 * the preceding block and start none (harvestSpecFile reports them).
 */
export function splitRequirementBlocks(content) {
  const lines = content.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur) out.push({ ...cur, raw: cur.lines.join("\n").trimEnd() });
    cur = null;
  };
  lines.forEach((line, i) => {
    const m = line.match(/^### Requirement: ([a-z0-9-]+)\/([a-z0-9-]+)\s*$/);
    if (m) {
      flush();
      cur = { cap: m[1], slug: m[2], name: `${m[1]}/${m[2]}`, line: i + 1, lines: [line] };
      return;
    }
    if (/^### Requirement:/.test(line) || /^## /.test(line)) {
      flush();
      return;
    }
    if (cur) cur.lines.push(line);
  });
  flush();
  return out;
}

const REQ_ID_RE = /^[a-z0-9-]+\/[a-z0-9-]+(?:#[a-z0-9-]+)?$/;

/**
 * Parse a requirement block's structural dependency declaration: the
 * identifiers whose remaining true this requirement's soundness depends on,
 * declared once each on the line directly under the header —
 *
 *   ### Requirement: game-lifecycle/roster-snapshot
 *   Depends on: global-invariants/game-instance-hermeticity,
 *   identity-and-authorization/roster-snapshot-binding.
 *
 * — as a sentence terminated by a period, wrapping freely. Returns
 * { found, ids, problem, lineCount }: `ids` the declared identifiers
 * (requirement or scenario grain), `problem` a human-readable fault,
 * `lineCount` how many lines the declaration spans (so a caller can exempt
 * exactly those lines from the no-identifiers-in-prose rule). A requirement
 * that depends on nothing carries no declaration at all.
 */
export function parseRequirementDeps(block) {
  const lines = block.replace(/\r\n?/g, "\n").split("\n");
  const at = lines.findIndex((l) => /^Depends on:/.test(l));
  if (at === -1) return { found: false, ids: [], lineCount: 0 };
  if (at !== 1)
    return {
      found: true,
      ids: [],
      lineCount: 1,
      problem: `"Depends on:" must be the line directly under the requirement header`,
    };
  let sentence = "";
  let lineCount = 0;
  let terminated = false;
  for (let i = at; i < lines.length && lines[i].trim() !== ""; i++) {
    sentence += i === at ? lines[i] : ` ${lines[i].trim()}`;
    lineCount++;
    const dot = sentence.indexOf(".");
    if (dot !== -1) {
      sentence = sentence.slice(0, dot);
      terminated = true;
      break;
    }
  }
  if (!terminated)
    return {
      found: true,
      ids: [],
      lineCount: Math.max(lineCount, 1),
      problem: `"Depends on:" declaration is not terminated by a period`,
    };
  const ids = [];
  const seen = new Set();
  for (const part of sentence
    .slice("Depends on:".length)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!REQ_ID_RE.test(part))
      return {
        found: true,
        ids,
        lineCount,
        problem: `unparseable "Depends on:" entry "${part}" — expected <capability>/<requirement>[#<scenario>]`,
      };
    if (seen.has(part))
      return { found: true, ids, lineCount, problem: `"Depends on:" repeats "${part}"` };
    seen.add(part);
    ids.push(part);
  }
  if (ids.length === 0)
    return {
      found: true,
      ids,
      lineCount,
      problem: `"Depends on:" names no requirement — omit the declaration when a requirement depends on nothing`,
    };
  for (const id of ids) {
    const bare = id.split("#")[0];
    if (bare !== id && seen.has(bare))
      return {
        found: true,
        ids,
        lineCount,
        problem: `"Depends on:" names both "${bare}" and "${id}" — the requirement-grain entry already subsumes the scenario`,
      };
  }
  return { found: true, ids, lineCount };
}

/**
 * Parse a Purpose's "Depends on:" declaration out of spec (or mint-preamble)
 * text: the sentence starting at the first "Depends on:" (anywhere in a
 * line — Purpose prose wraps freely) up to its first period, joining
 * wrapped lines. Callers pass the Purpose section alone (purposeSection),
 * never a whole spec file: requirement blocks carry a "Depends on:" of their
 * own at a finer grain. Returns { found, deps, problem } —
 * `deps` the declared capability names (a "(none …)" declaration yields
 * []), `problem` a human-readable fault when the sentence is malformed.
 * The capability dependency rule (a spec may reference only its declared
 * dependencies, acyclically) is enforced on this declaration by
 * scripts/check-spec-citations.mjs.
 */
export function parseDependsOn(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const start = lines.findIndex((l) => l.includes("Depends on:"));
  if (start === -1) return { found: false, deps: [] };
  let sentence = "";
  for (let i = start; i < lines.length; i++) {
    sentence += i === start ? lines[i].slice(lines[i].indexOf("Depends on:")) : ` ${lines[i]}`;
    const dot = sentence.indexOf(".");
    if (dot !== -1) {
      sentence = sentence.slice(0, dot);
      break;
    }
  }
  const body = sentence.slice("Depends on:".length).trim();
  if (body.startsWith("(none")) return { found: true, deps: [] };
  const deps = [];
  for (const part of body
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    if (!/^[a-z0-9-]+$/.test(part))
      return { found: true, deps, problem: `unparseable "Depends on:" entry "${part}"` };
    deps.push(part);
  }
  if (deps.length === 0)
    return {
      found: true,
      deps,
      problem: `"Depends on:" names no capability — declare "(none …)" explicitly`,
    };
  return { found: true, deps };
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

// A plan's task numbers are a contiguous sequence, not labels: sections run
// 1..K in order, each task's major number is its section's, and a section's
// minors run 1..J in order. The final `## Archive` section is unnumbered in its
// heading and continues the sequence.
//
// The point is not tidiness. A gap is the fingerprint of a task deleted without
// anyone checking whether its substance was rehomed, and a repeat is two tasks
// answering to one number — this corpus had both and nothing saw them: a
// substrate carve left four holes in one plan, four plans numbered their
// Archive section 9 regardless of what preceded it, and one section ran 13.1,
// 14.2, 14.3, 14.4, 14.5, 13.6. Task numbers are also how a plan and its
// design.md refer to each other, so a wrong one silently repoints prose at a
// different task. An emptied section is allowed (keep the heading, say where
// the work went); a hole inside one is not.
export function taskNumberingProblems(lines) {
  const problems = [];
  const sections = [];
  for (const [i, line] of lines.entries()) {
    // Any `##`-or-deeper heading opens a section. A heading MAY declare its
    // number ("## 3. Cutover"); one that does must agree with its position,
    // and one that does not ("## Archive", "## Implementation") simply takes
    // it. Declaring is the convention for worked plans and is what makes a
    // task's own major number checkable.
    const heading = /^#{2,} (?:(\d+)\. )?\S/.exec(line);
    const task = /^\s*- \[.\] (\d+)\.(\d+) /.exec(line);
    if (heading)
      sections.push({ line: i + 1, declared: heading[1] ? Number(heading[1]) : null, tasks: [] });
    else if (task && sections.length)
      sections.at(-1).tasks.push({ line: i + 1, major: Number(task[1]), minor: Number(task[2]) });
  }
  sections.forEach((section, s) => {
    const n = s + 1;
    if (section.declared !== null && section.declared !== n)
      problems.push({
        line: section.line,
        message: `section is numbered ${section.declared} but is section ${n} of the plan — section numbers run 1..K with no gaps or repeats`,
      });
    section.tasks.forEach(({ line, major, minor }, k) => {
      if (major !== n)
        problems.push({
          line,
          message: `task ${major}.${minor} sits in section ${n} — a task's major number is its section's`,
        });
      else if (minor !== k + 1)
        problems.push({
          line,
          message: `task ${major}.${minor} is task ${k + 1} of its section — minors run 1..J in order; renumber rather than leaving the hole a deleted task left`,
        });
    });
  });
  return problems;
}
