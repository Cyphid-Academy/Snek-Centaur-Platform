#!/usr/bin/env node
// Capability dependency graph renderer (pnpm spec:graph).
//
//   node scripts/spec-graph.mjs            # write openspec/capability-graph.md
//   node scripts/spec-graph.mjs --check    # fail if the committed file is stale
//   node scripts/spec-graph.mjs --json     # emit the graph on stdout, for tools
//
// The graph has ONE authority: the `Depends on:` declaration in each
// capability's Purpose (specs/, a mint delta's preamble, or a `## MODIFIED
// Purpose` amendment) and in each requirement. The rendered file is a derived
// view, committed only because a view in the repo is worth having — a diff
// shows a new edge as a line, and an agent reads the graph without running
// anything — and it is safe to commit only because `--check` makes drift
// impossible. Never hand-edit it, and never write anything into it that is not
// derived: the next regeneration eats it. Rationale for an edge belongs to the
// requirement that declares it and to its change's design.md.
//
// Every declaration is read through the same parsers the reference lint uses
// (./spec-index.mjs), so the picture cannot disagree with what CI enforces.
//
// A node is its capability name and nothing else. Counts on a node would churn
// the file on every unrelated spec edit; as it stands, a diff here means the
// DEPENDENCY GRAPH moved.
//
// On layout: mermaid has no `rank=same` (dagre ranks by longest path and
// exposes no override), so the vertical layering below is dagre's, computed
// from the edges themselves — which is why every edge is drawn even though a
// quarter of them point at the substrate. Hiding those made the picture
// tidier and cost the layering: nodes whose only dependency was hidden
// floated to the top rank. Faint is the compromise.
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  openChangeDeltaFiles,
  parseDeltaOps,
  parseDependsOn,
  parseRequirementDeps,
  purposeSection,
  splitRequirementBlocks,
} from "./spec-index.mjs";

export const GRAPH_FILE = join("openspec", "capability-graph.md");

/**
 * Harvest the declared graph: capability -> { deps, weights, folded, change }.
 * Open changes overlay specs/ exactly as they do for the reference lint — a
 * mint preamble declares a capability that has no spec.md yet, a
 * `## MODIFIED Purpose` amendment supersedes the folded declaration, and a
 * delta's requirement blocks supersede (MODIFIED) or extend (ADDED) the
 * folded ones.
 */
export function buildGraph(root) {
  const caps = new Map();
  const cap = (name) => {
    if (!caps.has(name))
      caps.set(name, { name, deps: [], folded: false, change: null, reqs: new Map() });
    return caps.get(name);
  };

  const specsDir = join(root, "openspec", "specs");
  if (existsSync(specsDir))
    for (const name of readdirSync(specsDir)) {
      const file = join(specsDir, name, "spec.md");
      if (!existsSync(file)) continue;
      const content = readFileSync(file, "utf8");
      const c = cap(name);
      c.folded = true;
      c.deps = parseDependsOn(purposeSection(content)).deps;
      for (const b of splitRequirementBlocks(content))
        c.reqs.set(b.slug, parseRequirementDeps(b.raw).ids);
    }

  for (const { file, cap: name } of openChangeDeltaFiles(root)) {
    const change = file.match(/\/changes\/([^/]+)\/specs\//)?.[1] ?? null;
    const content = readFileSync(file, "utf8");
    const { preamble, modifiedPurpose } = parseDeltaOps(content);
    const c = cap(name);
    if (preamble) {
      c.change = change;
      c.deps = parseDependsOn(preamble).deps;
    } else if (modifiedPurpose) {
      c.change = change;
      c.deps = parseDependsOn(modifiedPurpose).deps;
    }
    for (const b of splitRequirementBlocks(content))
      c.reqs.set(b.slug, parseRequirementDeps(b.raw).ids);
  }

  // Requirement-grain weight per declared edge: how many requirement
  // dependencies cross it. Same-capability dependencies are counted apart —
  // they are real, but they are not edges of this graph.
  let crossing = 0;
  let internal = 0;
  for (const c of caps.values()) {
    c.weights = new Map();
    for (const ids of c.reqs.values())
      for (const id of ids) {
        const target = id.split("/")[0];
        if (target === c.name) {
          internal++;
          continue;
        }
        crossing++;
        c.weights.set(target, (c.weights.get(target) ?? 0) + 1);
      }
  }

  // Depth = longest path to a capability that declares nothing. The reference
  // lint owns acyclicity; this guard exists so a cycle can never hang the
  // renderer.
  const depth = new Map();
  const walk = (name, seen = new Set()) => {
    if (depth.has(name)) return depth.get(name);
    if (seen.has(name)) throw new Error(`capability dependency cycle at "${name}"`);
    seen.add(name);
    const deps = caps.get(name)?.deps ?? [];
    const d = deps.length ? Math.max(...deps.map((x) => walk(x, new Set(seen)))) + 1 : 0;
    depth.set(name, d);
    return d;
  };
  for (const name of caps.keys()) walk(name);

  const edges = [...caps.values()].reduce((n, c) => n + c.deps.length, 0);
  return {
    caps,
    depth,
    stats: {
      capabilities: caps.size,
      edges,
      requirements: [...caps.values()].reduce((n, c) => n + c.reqs.size, 0),
      crossing,
      internal,
      levels: Math.max(...depth.values()) + 1,
    },
  };
}

/** The graph as data, for tools that would otherwise re-parse the corpus. */
export function toJSON({ caps, depth }) {
  const out = {};
  for (const name of [...caps.keys()].sort()) {
    const c = caps.get(name);
    out[name] = {
      dependsOn: c.deps,
      weights: Object.fromEntries([...c.weights].sort()),
      requirements: c.reqs.size,
      depth: depth.get(name),
      state: c.folded ? "folded" : "open",
      ...(c.change ? { change: c.change } : {}),
    };
  }
  return out;
}

// Mermaid accepts hyphens in node ids, so a node IS its capability identifier:
// the fence's edge lines read exactly as the corpus names things, and grepping
// the file for a capability finds every edge it takes part in.
const mermaidId = (name) => name;
const DIRECTION = "TD";
const SUBSTRATE_MIN_CAPS = 8;

const INTRO =
  "Derived from `openspec/specs/` overlaid with every open change, so it shows " +
  "the corpus as it will stand once the open changes fold. An arrow reads " +
  "**depends on**: relax what it points at and the requirement declaring it " +
  "stops making sense. Edge labels count the requirement-grain dependencies " +
  "crossing that edge, and a dashed node is one an open change mints.";
/** Wrap generated prose so the committed file reads like the rest of the corpus. */
const wrap = (text, width = 78) =>
  // Code spans are single tokens: wrapping inside one splits `pnpm spec:graph
  // --json` across a line break in the source for no reason.
  text
    .split(/\s+/)
    .filter(Boolean)
    .reduce((words, part) => {
      const open = words.length && (words.at(-1).match(/`/g)?.length ?? 0) % 2 === 1;
      if (open) words[words.length - 1] = `${words.at(-1)} ${part}`;
      else words.push(part);
      return words;
    }, [])
    .reduce((lines, word) => {
      const last = lines[lines.length - 1];
      if (last && `${last} ${word}`.length <= width) lines[lines.length - 1] = `${last} ${word}`;
      else lines.push(word);
      return lines;
    }, [])
    .join("\n");

/**
 * Render the committed view. One mermaid fence carries the whole graph: it is
 * a diagram to a human and, line by line, an edge list to anything reading the
 * file as text (`<dependent> -->|<weight>| <dependency>`).
 */
export function renderMarkdown(graph) {
  const { caps, depth } = graph;
  const names = [...caps.keys()].sort();
  const roots = names.filter((n) => caps.get(n).deps.length === 0);
  // The substrate is the handful of capabilities nearly everything rests on:
  // depth 0 or 1, and depended on by at least half the corpus. Membership is
  // derived rather than hand-kept, and the rendered prose names whoever
  // qualifies, so a capability entering or leaving it shows up in the file's
  // diff as a sentence rather than as a silently restyled picture. It buys one
  // thing only — those edges are drawn quietly — and the nodes sit in the
  // graph like any other. Below SUBSTRATE_MIN_CAPS nothing qualifies: there is
  // no hairball to quieten.
  const dependents = (n) => names.filter((m) => caps.get(m).deps.includes(n)).length;
  const substrate =
    names.length < SUBSTRATE_MIN_CAPS
      ? []
      : names.filter((n) => depth.get(n) <= 1 && dependents(n) >= (names.length - 1) / 2);

  const node = (n) => `  ${mermaidId(n)}["${n}"]${caps.get(n).folded ? "" : ":::open"}`;

  const lines = [`flowchart ${DIRECTION}`];
  // Styling stays colour-free — GitHub renders this fence in whichever theme
  // the reader is using, and a hard-coded fill is unreadable in one of them.
  lines.push("  classDef open stroke-dasharray:5 3;", "  classDef base stroke-width:2px;", "");
  lines.push(...names.map(node), "");
  // Edges into the substrate are drawn faint: every one is expected, and at
  // full weight they bury the structure worth reading. They stay drawn because
  // dagre derives the vertical layering from the edges it is given.
  const faint = [];
  let i = 0;
  for (const n of names)
    for (const dep of [...caps.get(n).deps].sort()) {
      const w = caps.get(n).weights.get(dep) ?? 0;
      // Expected everywhere and a quarter of the graph: drawn, but quiet.
      if (substrate.includes(dep) && !substrate.includes(n)) faint.push(i);
      i++;
      lines.push(`  ${mermaidId(n)} -->|${w}| ${mermaidId(dep)}`);
    }
  if (substrate.length) lines.push("", `  class ${substrate.map(mermaidId).join(",")} base;`);
  if (faint.length) lines.push(`  linkStyle ${faint.join(",")} stroke-opacity:0.25;`);

  return `<!-- GENERATED by \`pnpm spec:graph\` — do not edit.
     The authority is the \`Depends on:\` declaration in each capability's
     Purpose and in each requirement; this file is a view of it, and
     \`pnpm spec:graph --check\` (part of \`pnpm spec:check\`) fails when the
     two disagree. Regenerate in the commit that changes a declaration. -->

# Capability dependency graph

${wrap(INTRO)}

${wrap(
  `${
    substrate.length
      ? `${substrate.map((n) => `\`${n}\``).join(" and ")} ${substrate.length > 1 ? "are" : "is"} depended on by at least half the corpus; those edges are drawn faint so the rest of the structure stays legible, and they are what anchor the layering — every capability sinks to its own depth above them. `
      : ""
  }`.trim(),
)}

${wrap(
  `The graph is acyclic — \`pnpm spec:check\` enforces that${roots.length === 1 ? ` — and rooted at \`${roots[0]}\`, which declares no dependencies of its own` : ""}. Counts are deliberately absent from this prose: they would go stale in anyone's memory and churn this file on edits that never touched the graph. \`pnpm spec:graph --json\` has them.`,
)}

\`\`\`mermaid
${lines.join("\n")}
\`\`\`
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
  const graph = buildGraph(root);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(toJSON(graph), null, 2));
  } else {
    const rendered = renderMarkdown(graph);
    const target = join(root, GRAPH_FILE);
    const current = existsSync(target) ? readFileSync(target, "utf8") : null;
    if (process.argv.includes("--check")) {
      if (current !== rendered) {
        console.error(
          `Capability graph check FAILED: ${GRAPH_FILE} is ${current === null ? "missing" : "stale"} — run \`pnpm spec:graph\` and commit the result.`,
        );
        process.exit(1);
      }
      console.log(
        `Capability graph up to date (${graph.stats.capabilities} capabilities, ${graph.stats.edges} declared dependencies).`,
      );
    } else {
      writeFileSync(target, rendered);
      console.log(
        `Wrote ${GRAPH_FILE} (${graph.stats.capabilities} capabilities, ${graph.stats.edges} declared dependencies, ${graph.stats.levels} levels).`,
      );
    }
  }
}
